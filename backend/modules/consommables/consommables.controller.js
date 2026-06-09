const { pgDb, getSqlite } = require('../../shared/database');
const XLSX = require('xlsx');
const path = require('path');
const fs = require('fs');

let sendMailFn = null;
const setSendMail = (fn) => { sendMailFn = fn; };

// Détermine la table organigramme à utiliser : v2 en priorité, repli sur v1 si vide.
// Aligné sur /api/admin/rh/organisation-chart (page Organigramme & Hiérarchie).
async function getOrgTable() {
  const v2Count = await pgDb.get('SELECT COUNT(*) c FROM oracle.rh_siim_organigramme_v2').catch(() => ({ c: 0 }));
  return Number(v2Count.c) > 0 ? 'oracle.rh_siim_organigramme_v2' : 'oracle.rh_siim_organigramme';
}

async function getUserEmail(username) {
  try {
    const db = getSqlite();
    const user = await db.get('SELECT email FROM users WHERE username = ?', [username]);
    return user?.email || '';
  } catch { return ''; }
}

function renderTemplate(template, vars) {
  let result = template;
  for (const [key, val] of Object.entries(vars)) {
    result = result.replaceAll(`{{${key}}}`, val);
  }
  return result;
}

const controller = {
  // Importer les données du fichier Excel dans la base de données
  async importFromExcel(req, res) {
    try {
      const filePath = path.join(__dirname, '../../../BONDECOMMANDE.xlsx');

      if (!fs.existsSync(filePath)) {
        return res.status(404).json({ error: 'Fichier BONDECOMMANDE.xlsx non trouvé' });
      }

      const workbook = XLSX.readFile(filePath);
      const sheetNames = workbook.SheetNames.filter(name => name !== 'INFORMATIONS');

      let importedTypes = 0;
      let importedArticles = 0;

      for (const sheetName of sheetNames) {
        // Vérifier/créer le type
        const existingType = await pgDb.get(
          'SELECT id FROM consumable_types WHERE name = $1',
          [sheetName]
        );

        let typeId = existingType?.id;
        if (!typeId) {
          const result = await pgDb.run(
            'INSERT INTO consumable_types (name, display_name) VALUES ($1, $2)',
            [sheetName, sheetName]
          );
          typeId = result.lastID;
          importedTypes++;
        }

        // Importer les articles
        const worksheet = workbook.Sheets[sheetName];
        const data = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });

        // Supprimer les articles existants pour ce type (rafraîchir)
        await pgDb.run('DELETE FROM consumable_catalog WHERE type_id = $1', [typeId]);

        for (let i = 1; i < data.length; i++) {
          const row = data[i];
          if (row[1] && String(row[1]).trim()) {
            await pgDb.run(
              'INSERT INTO consumable_catalog (type_id, article, code_fabricant, ref_commande) VALUES ($1, $2, $3, $4)',
              [typeId, String(row[1]).trim(), row[2] ? String(row[2]).trim() : '', row[3] ? String(row[3]).trim() : '']
            );
            importedArticles++;
          }
        }
      }

      res.json({
        message: 'Import réussi',
        types_imported: importedTypes,
        articles_imported: importedArticles,
      });
    } catch (error) {
      console.error('[Consommables] Error importing Excel:', error);
      res.status(500).json({ error: 'Erreur lors de l\'import', details: error.message });
    }
  },

  // Récupérer les types de consommables
  async getTypes(req, res) {
    try {
      console.log('[Consommables] GET /types - User:', req.user?.username, 'User ID:', req.user?.user_id);

      const query = `
        SELECT id, name, display_name
        FROM consumable_types
        ORDER BY name
      `;
      const result = await pgDb.all(query);
      console.log('[Consommables] Types fetched:', result.length, 'items');

      if (result.length === 0) {
        console.warn('[Consommables] ⚠️ No types found - run /api/consumable/import first!');
      }

      res.json(result);
    } catch (error) {
      console.error('[Consommables] Error getting types:', error);
      res.status(500).json({ error: 'Erreur lors de la récupération des types', details: error.message });
    }
  },

  // Récupérer les désignations uniques pour un type
  async getDesignations(req, res) {
    try {
      const { typeId } = req.params;
      const query = `
        SELECT DISTINCT designation
        FROM consumable_catalog
        WHERE type_id = $1 AND designation IS NOT NULL AND designation != ''
        ORDER BY designation
      `;
      const result = await pgDb.all(query, [typeId]);
      res.json(result.map(r => r.designation));
    } catch (error) {
      console.error('[Consommables] Error getting designations:', error);
      res.status(500).json({ error: 'Erreur lors de la récupération des désignations', details: error.message });
    }
  },

  // Récupérer les articles d'un type (optionnellement filtré par désignation)
  async getArticles(req, res) {
    try {
      const { typeId } = req.params;
      const { designation } = req.query;

      let query;
      let params;

      if (designation) {
        query = `
          SELECT id, designation, article, code_fabricant, ref_commande
          FROM consumable_catalog
          WHERE type_id = $1 AND designation = $2
          ORDER BY article
        `;
        params = [typeId, designation];
      } else {
        query = `
          SELECT id, designation, article, code_fabricant, ref_commande
          FROM consumable_catalog
          WHERE type_id = $1
          ORDER BY article
        `;
        params = [typeId];
      }

      const result = await pgDb.all(query, params);
      console.log('[Consommables] Articles fetched for type', typeId, ':', result.length);
      res.json(result);
    } catch (error) {
      console.error('[Consommables] Error getting articles:', error);
      res.status(500).json({ error: 'Erreur lors de la récupération des articles', details: error.message });
    }
  },

  // Compteur de demandes en attente (pour badge dashboard)
  async getPendingCount(req, res) {
    try {
      const result = await pgDb.all(`SELECT count(*) as count FROM hub_consommables.consumable_requests WHERE status = 'pending'`);
      console.log('[Consommables] Pending count from DB:', result);
      res.json({ count: Number(result[0].count) });
    } catch (error) {
      console.error('[Consommables] Error getting pending count:', error);
      res.status(500).json({ error: 'Erreur lors de la récupération du compteur', details: error.message });
    }
  },

  // Directions depuis l'organigramme RH (accessible à tous les users)
  async getOrgDirections(req, res) {
    try {
      const orgTable = await getOrgTable();
      const rows = await pgDb.all(`
        SELECT DISTINCT "DIRECTION" AS code, "DIRECTION_L" AS label
        FROM ${orgTable}
        WHERE "DIRECTION" IS NOT NULL
          AND "DIRECTION" != ''
          AND "DIRECTION" NOT LIKE '$%'
          AND "DIRECTION" NOT IN ('AA', 'BZ')
        ORDER BY "DIRECTION"
      `);
      res.json(rows.map(r => ({ code: r.code?.trim(), label: r.label?.trim() })));
    } catch (error) {
      res.status(500).json({ error: 'Erreur chargement directions', details: error.message });
    }
  },

  // Liste des écoles (hub.ecoles)
  async getEcoles(req, res) {
    try {
      const rows = await pgDb.all(`
        SELECT id, nom, type FROM hub.ecoles ORDER BY type, nom
      `);
      res.json(rows);
    } catch (error) {
      res.status(500).json({ error: 'Erreur chargement écoles', details: error.message });
    }
  },

  // Services d'une direction depuis l'organigramme RH
  async getOrgServices(req, res) {
    try {
      const { directionCode } = req.params;
      const orgTable = await getOrgTable();
      const rows = await pgDb.all(`
        SELECT DISTINCT "SERVICE" AS code, "SERVICE_L" AS label
        FROM ${orgTable}
        WHERE "DIRECTION" = $1
          AND "SERVICE" IS NOT NULL
          AND "SERVICE" != ''
          AND "SERVICE" NOT LIKE '$%'
        ORDER BY "SERVICE"
      `, [directionCode]);
      res.json(rows.map(r => ({ code: r.code?.trim(), label: r.label?.trim() })));
    } catch (error) {
      res.status(500).json({ error: 'Erreur chargement services', details: error.message });
    }
  },

  // Récupérer les demandes de l'utilisateur
  async getRequests(req, res) {
    try {
      const user_id = req.user.id;
      const query = `
        SELECT
          cr.id,
          cr.user_id,
          cr.username,
          cr.email,
          cr.date_commande,
          cr.direction,
          cr.service,
          cr.nom_referent,
          cr.tel_complet,
          ct.name as type_consommable,
          cr.status,
          cr.order_number,
          cr.tier,
          cr.total_amount_ttc,
          cr.is_school,
          cr.user_comment,
          cr.archived,
          cr.created_at,
          json_agg(
            json_build_object(
              'id', ra.id,
              'article', cc.article,
              'quantite', ra.quantite,
              'ref_commande', cc.ref_commande
            )
          ) as articles
        FROM consumable_requests cr
        JOIN consumable_types ct ON cr.type_id = ct.id
        LEFT JOIN request_articles ra ON cr.id = ra.request_id
        LEFT JOIN consumable_catalog cc ON ra.catalog_id = cc.id
        WHERE cr.user_id = $1
        GROUP BY 
          cr.id, cr.user_id, cr.username, cr.email, cr.date_commande, 
          cr.direction, cr.service, cr.nom_referent, cr.tel_complet, 
          ct.name, cr.status, cr.order_number, cr.tier, 
          cr.total_amount_ttc, cr.is_school, cr.user_comment, cr.archived, cr.created_at
        ORDER BY cr.created_at DESC
      `;
      const result = await pgDb.all(query, [user_id]);
      res.json(result);
    } catch (error) {
      console.error('[Consommables] Error getting requests:', error);
      res.status(500).json({ error: 'Erreur lors de la récupération des demandes', details: error.message });
    }
  },

  // Récupérer toutes les demandes (pour l'interface de gestion)
  async getAllRequestsForUsers(req, res) {
    try {
      const query = `
        SELECT
          cr.id,
          cr.user_id,
          cr.username,
          cr.email,
          cr.date_commande,
          cr.direction,
          cr.service,
          cr.nom_referent,
          cr.tel_complet,
          ct.name as type_consommable,
          cr.status,
          cr.order_number,
          cr.tier,
          cr.total_amount_ttc,
          cr.is_school,
          cr.user_comment,
          cr.archived,
          cr.created_at,
          json_agg(
            json_build_object(
              'id', ra.id,
              'catalog_id', cc.id,
              'article', cc.article,
              'designation', cc.designation,
              'code_fabricant', cc.code_fabricant,
              'quantite', ra.quantite,
              'ref_commande', cc.ref_commande
            )
            ORDER BY ra.id
          ) FILTER (WHERE ra.id IS NOT NULL) as articles
        FROM consumable_requests cr
        JOIN consumable_types ct ON cr.type_id = ct.id
        LEFT JOIN request_articles ra ON cr.id = ra.request_id
        LEFT JOIN consumable_catalog cc ON ra.catalog_id = cc.id
        GROUP BY
          cr.id, cr.user_id, cr.username, cr.email, cr.date_commande,
          cr.direction, cr.service, cr.nom_referent, cr.tel_complet,
          ct.name, cr.status, cr.order_number, cr.tier,
          cr.total_amount_ttc, cr.is_school, cr.user_comment, cr.archived, cr.created_at
        ORDER BY cr.created_at DESC
      `;
      const result = await pgDb.all(query);
      res.json(result);
    } catch (error) {
      console.error('[Consommables] Error getting all requests:', error);
      res.status(500).json({ error: 'Erreur lors de la récupération des demandes', details: error.message });
    }
  },

  // Créer une demande
  async createRequest(req, res) {
    try {
      const user_id = req.user.id;
      const username = req.user.username;
      const userEmail = req.user.email || (await getUserEmail(username));
      const { date_commande, direction, service, nom_referent, tel_complet, type_id, articles, user_comment } = req.body;

      const insertRequestQuery = `
        INSERT INTO consumable_requests (user_id, username, email, date_commande, direction, service, nom_referent, tel_complet, type_id, status, user_comment)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'pending', $10)
      `;

      const requestResult = await pgDb.run(insertRequestQuery, [
        user_id, username, userEmail, date_commande, direction, service, nom_referent, tel_complet, type_id, user_comment || null
      ]);

      const requestId = requestResult.lastID;

      for (const article of articles) {
        await pgDb.run(
          'INSERT INTO request_articles (request_id, catalog_id, quantite) VALUES ($1, $2, $3)',
          [requestId, article.id, article.quantite]
        );
      }

      // Email de confirmation
      if (userEmail && sendMailFn) {
        try {
          const db = getSqlite();
          const template = await db.get(
            "SELECT subject, body FROM email_templates WHERE slug = 'consumable_confirmation'"
          );
          const articlesHtml = articles.map(a =>
            `<tr><td style="padding:8px;border:1px solid #e2e8f0">${a.article}</td><td style="padding:8px;border:1px solid #e2e8f0;text-align:center">${a.quantite}</td></tr>`
          ).join('');
          const subject = template ? renderTemplate(template.subject, { request_id: requestId }) : `[Consommables] Confirmation de votre commande n°${requestId}`;
          const body = template ? renderTemplate(template.body, {
            request_id: requestId,
            nom_referent,
            direction,
            service,
            date_commande,
            articles: articlesHtml,
            app_name: 'DSI Hub'
          }) : `
            <h2>Demande de consommables n°${requestId}</h2>
            <p>Bonjour ${nom_referent},</p>
            <p>Votre demande a bien été enregistrée.</p>
            <table border="0" cellpadding="8" cellspacing="0" style="border-collapse:collapse;width:100%;max-width:500px">
              <tr style="background:#003366;color:white"><th style="padding:8px;border:1px solid #003366">Article</th><th style="padding:8px;border:1px solid #003366">Quantité</th></tr>
              ${articlesHtml}
            </table>
            <p>Direction: ${direction} | Service: ${service}</p>
            <p>Nous vous tiendrons informé de l'évolution de votre commande.</p>
          `;
          await sendMailFn(userEmail, subject, body);
          console.log(`[Consommables] Confirmation email sent to ${userEmail} for request #${requestId}`);
        } catch (emailError) {
          console.error('[Consommables] Error sending confirmation email:', emailError);
        }
      }

      res.status(201).json({ id: requestId, message: 'Demande créée avec succès' });
    } catch (error) {
      console.error('[Consommables] Error creating request:', error);
      res.status(500).json({ error: 'Erreur lors de la création de la demande', details: error.message });
    }
  },

  // Mettre à jour le statut d'une demande (admin)
  async updateRequestStatus(req, res) {
    try {
      const { requestId } = req.params;
      const { status, order_number, tier, total_amount_ttc, is_school, articles } = req.body;

      // Si des articles sont fournis (cas d'une commande avec modification de quantité)
      if (articles && Array.isArray(articles)) {
        await pgDb.run('DELETE FROM request_articles WHERE request_id = $1', [requestId]);
        for (const article of articles) {
          // Si l'article a une quantité > 0, on l'ajoute
          if (article.quantite > 0) {
            // On a besoin du catalog_id. Si le frontend envoie 'catalog_id', on l'utilise.
            // Sinon on essaie de le retrouver via l'article name (moins fiable)
            const catId = article.catalog_id || article.id;
            if (catId) {
              await pgDb.run(
                'INSERT INTO request_articles (request_id, catalog_id, quantite) VALUES ($1, $2, $3)',
                [requestId, catId, article.quantite]
              );
            }
          }
        }
      }

      const query = `
        UPDATE consumable_requests
        SET status = $1, 
            order_number = $2, 
            tier = $3, 
            total_amount_ttc = $4,
            is_school = $5,
            updated_at = NOW()
        WHERE id = $6
        RETURNING *
      `;
      const result = await pgDb.all(query, [status, order_number || null, tier || null, total_amount_ttc || null, is_school || false, requestId]);
      const updated = result[0];

      // Email si approuvé ou ordonné
      if (updated && (status === 'approved' || status === 'ordered') && updated.email && sendMailFn) {
        try {
          const db = getSqlite();
          const slug = status === 'ordered' ? 'consumable_ordered' : 'consumable_validated';
          const template = await db.get(
            `SELECT subject, body FROM email_templates WHERE slug = $1`, [slug]
          ) || await db.get(
            "SELECT subject, body FROM email_templates WHERE slug = 'consumable_validated'"
          );

          const updatedArticles = await pgDb.all(`
            SELECT cc.article, ra.quantite FROM request_articles ra
            JOIN consumable_catalog cc ON ra.catalog_id = cc.id
            WHERE ra.request_id = $1
          `, [requestId]);
          
          const articlesHtml = updatedArticles.map(a =>
            `<tr><td style="padding:8px;border:1px solid #e2e8f0">${a.article}</td><td style="padding:8px;border:1px solid #e2e8f0;text-align:center">${a.quantite}</td></tr>`
          ).join('');

          const vars = {
            request_id: requestId,
            nom_referent: updated.nom_referent,
            direction: updated.direction,
            articles: articlesHtml,
            order_number: updated.order_number || 'N/A',
            tier: updated.tier || 'N/A',
            total_amount_ttc: updated.total_amount_ttc ? `${updated.total_amount_ttc} €` : 'N/A',
            is_school: updated.is_school ? 'Oui' : 'Non',
            app_name: 'DSI Hub'
          };

          const subject = template ? renderTemplate(template.subject, vars) : `[Consommables] Commande n°${requestId} ${status === 'ordered' ? 'passée' : 'validée'}`;
          const body = template ? renderTemplate(template.body, vars) : `
            <h2>Commande n°${requestId} - ${status === 'ordered' ? 'Passée' : 'Validée'}</h2>
            <p>Bonjour ${updated.nom_referent},</p>
            <p>Votre demande de consommables a été ${status === 'ordered' ? 'passée en commande' : 'validée'}.</p>
            ${status === 'ordered' ? `
              <div style="background:#f8fafc;padding:15px;border-radius:8px;margin-bottom:20px;border:1px solid #e2e8f0">
                <p style="margin:0 0 5px"><strong>Numéro de commande :</strong> ${updated.order_number || 'En attente'}</p>
                <p style="margin:0 0 5px"><strong>Tiers :</strong> ${updated.tier || 'UGAP'}</p>
                <p style="margin:0 0 5px"><strong>Montant TTC :</strong> ${updated.total_amount_ttc ? updated.total_amount_ttc + ' €' : 'N/A'}</p>
                <p style="margin:0"><strong>Type :</strong> ${updated.is_school ? 'Commande École' : 'Commande Standard'}</p>
              </div>
            ` : ''}
            <table border="0" cellpadding="8" cellspacing="0" style="border-collapse:collapse;width:100%;max-width:500px">
              <tr style="background:#003366;color:white"><th style="padding:8px;border:1px solid #003366">Article</th><th style="padding:8px;border:1px solid #003366">Quantité</th></tr>
              ${articlesHtml}
            </table>
          `;
          await sendMailFn(updated.email, subject, body);
          console.log(`[Consommables] ${status} email sent to ${updated.email} for request #${requestId}`);
        } catch (emailError) {
          console.error('[Consommables] Error sending status email:', emailError);
        }
      }

      res.json(updated);
    } catch (error) {
      console.error('[Consommables] Error updating request status:', error);
      res.status(500).json({ error: 'Erreur lors de la mise à jour', details: error.message });
    }
  },

  // Supprimer une demande
  async deleteRequest(req, res) {
    try {
      const { requestId } = req.params;
      await pgDb.run('DELETE FROM request_articles WHERE request_id = $1', [requestId]);
      await pgDb.run('DELETE FROM consumable_requests WHERE id = $1', [requestId]);
      res.json({ message: 'Demande supprimée' });
    } catch (error) {
      console.error('[Consommables] Error deleting request:', error);
      res.status(500).json({ error: 'Erreur lors de la suppression', details: error.message });
    }
  },

  // Modifier les articles d'une demande
  async updateRequest(req, res) {
    try {
      const { requestId } = req.params;
      const { articles } = req.body;

      await pgDb.run('DELETE FROM request_articles WHERE request_id = $1', [requestId]);
      for (const article of articles) {
        await pgDb.run(
          'INSERT INTO request_articles (request_id, catalog_id, quantite) VALUES ($1, $2, $3)',
          [requestId, article.id, article.quantite]
        );
      }
      await pgDb.run('UPDATE consumable_requests SET updated_at = NOW() WHERE id = $1', [requestId]);

      // Récupérer la demande mise à jour
      const requestData = await pgDb.get('SELECT * FROM consumable_requests WHERE id = $1', [requestId]);

      // Email de modification
      if (requestData && requestData.email && sendMailFn) {
        try {
          const db = getSqlite();
          const template = await db.get(
            "SELECT subject, body FROM email_templates WHERE slug = 'consumable_modified'"
          );
          const updatedArticles = await pgDb.all(`
            SELECT cc.article, ra.quantite FROM request_articles ra
            JOIN consumable_catalog cc ON ra.catalog_id = cc.id
            WHERE ra.request_id = $1
          `, [requestId]);
          const articlesHtml = updatedArticles.map(a =>
            `<tr><td style="padding:8px;border:1px solid #e2e8f0">${a.article}</td><td style="padding:8px;border:1px solid #e2e8f0;text-align:center">${a.quantite}</td></tr>`
          ).join('');
          const subject = template ? renderTemplate(template.subject, { request_id: requestId }) : `[Consommables] Commande n°${requestId} modifiée`;
          const body = template ? renderTemplate(template.body, {
            request_id: requestId,
            nom_referent: requestData.nom_referent,
            direction: requestData.direction,
            articles: articlesHtml,
            app_name: 'DSI Hub'
          }) : `
            <h2>Commande n°${requestId} - Modifiée</h2>
            <p>Bonjour ${requestData.nom_referent},</p>
            <p>Votre demande de consommables a été modifiée.</p>
            <table border="0" cellpadding="8" cellspacing="0" style="border-collapse:collapse;width:100%;max-width:500px">
              <tr style="background:#003366;color:white"><th style="padding:8px;border:1px solid #003366">Article</th><th style="padding:8px;border:1px solid #003366">Quantité</th></tr>
              ${articlesHtml}
            </table>
          `;
          await sendMailFn(requestData.email, subject, body);
          console.log(`[Consommables] Modification email sent to ${requestData.email} for request #${requestId}`);
        } catch (emailError) {
          console.error('[Consommables] Error sending modification email:', emailError);
        }
      }

      res.json({ message: 'Demande mise à jour' });
    } catch (error) {
      console.error('[Consommables] Error updating request:', error);
      res.status(500).json({ error: 'Erreur lors de la mise à jour', details: error.message });
    }
  },

  // Archiver une demande
  async archiveRequest(req, res) {
    try {
      const { requestId } = req.params;
      await pgDb.run('UPDATE consumable_requests SET archived = TRUE, updated_at = NOW() WHERE id = $1', [requestId]);
      res.json({ message: 'Demande archivée' });
    } catch (error) {
      console.error('[Consommables] Error archiving request:', error);
      res.status(500).json({ error: 'Erreur lors de l\'archivage', details: error.message });
    }
  },

  // Lister tous les consommables à commander (validés, non archivés)
  async getRequestsToOrder(req, res) {
    try {
      const query = `
        SELECT
          cr.id as request_id,
          cr.direction,
          cr.service,
          cr.nom_referent,
          cr.email,
          cr.date_commande,
          cr.created_at,
          cr.user_comment,
          ct.name as type_consommable,
          json_agg(
            json_build_object(
              'catalog_id', cc.id,
              'article', cc.article,
              'designation', cc.designation,
              'code_fabricant', cc.code_fabricant,
              'ref_commande', cc.ref_commande,
              'quantite', ra.quantite
            )
            ORDER BY cc.article
          ) FILTER (WHERE ra.id IS NOT NULL) as articles
        FROM consumable_requests cr
        JOIN consumable_types ct ON cr.type_id = ct.id
        LEFT JOIN request_articles ra ON cr.id = ra.request_id
        LEFT JOIN consumable_catalog cc ON ra.catalog_id = cc.id
        WHERE cr.status = 'approved' AND (cr.archived IS NULL OR cr.archived = FALSE)
        GROUP BY cr.id, ct.name, cr.direction, cr.service, cr.nom_referent, cr.email, cr.date_commande, cr.created_at, cr.user_comment
        ORDER BY cr.direction, cr.service, cr.nom_referent
      `;
      const result = await pgDb.all(query);
      res.json(result);
    } catch (error) {
      console.error('[Consommables] Error getting requests to order:', error);
      res.status(500).json({ error: 'Erreur lors de la récupération', details: error.message });
    }
  },

  // Récupérer toutes les demandes (admin)
  async getAllRequests(req, res) {
    try {
      const query = `
        SELECT
          cr.id,
          cr.user_id,
          cr.username,
          cr.email,
          cr.date_commande,
          cr.direction,
          cr.service,
          cr.nom_referent,
          cr.tel_complet,
          ct.name as type_consommable,
          cr.status,
          cr.order_number,
          cr.tier,
          cr.total_amount_ttc,
          cr.is_school,
          cr.user_comment,
          cr.created_at,
          cr.archived,
          json_agg(
            json_build_object(
              'id', ra.id,
              'catalog_id', cc.id,
              'article', cc.article,
              'quantite', ra.quantite,
              'ref_commande', cc.ref_commande
            )
            ORDER BY ra.id
          ) FILTER (WHERE ra.id IS NOT NULL) as articles
        FROM consumable_requests cr
        JOIN consumable_types ct ON cr.type_id = ct.id
        LEFT JOIN request_articles ra ON cr.id = ra.request_id
        LEFT JOIN consumable_catalog cc ON ra.catalog_id = cc.id
        GROUP BY 
          cr.id, cr.user_id, cr.username, cr.email, cr.date_commande, 
          cr.direction, cr.service, cr.nom_referent, cr.tel_complet, 
          ct.name, cr.status, cr.order_number, cr.tier, 
          cr.total_amount_ttc, cr.is_school, cr.user_comment, cr.archived, cr.created_at
        ORDER BY cr.created_at DESC
      `;
      const result = await pgDb.all(query);
      res.json(result);
    } catch (error) {
      console.error('[Consommables] Error getting all requests:', error);
      res.status(500).json({ error: 'Erreur lors de la récupération des demandes', details: error.message });
    }
  },

  // ===== GESTION DU CATALOGUE =====

  // Récupérer tous les articles du catalogue (admin)
  async getAllArticles(req, res) {
    try {
      const query = `
        SELECT
          cc.id,
          cc.type_id,
          ct.name as type_name,
          ct.display_name as type_display_name,
          cc.designation,
          cc.article,
          cc.code_fabricant,
          cc.ref_commande,
          cc.created_at,
          (SELECT COUNT(*) FROM consumable_requests cr WHERE cr.type_id = cc.type_id) as type_request_count
        FROM consumable_catalog cc
        JOIN consumable_types ct ON cc.type_id = ct.id
        ORDER BY ct.name, cc.article
      `;
      const result = await pgDb.all(query);
      res.json(result);
    } catch (error) {
      console.error('[Consommables] Error getting all articles:', error);
      res.status(500).json({ error: 'Erreur lors de la récupération des articles', details: error.message });
    }
  },

  // Récupérer les articles d'un type (admin)
  async getArticlesByType(req, res) {
    try {
      const { typeId } = req.params;
      const query = `
        SELECT
          cc.id,
          cc.type_id,
          cc.designation,
          cc.article,
          cc.code_fabricant,
          cc.ref_commande,
          cc.created_at
        FROM consumable_catalog cc
        WHERE cc.type_id = $1
        ORDER BY cc.article
      `;
      const result = await pgDb.all(query, [typeId]);
      res.json(result);
    } catch (error) {
      console.error('[Consommables] Error getting articles by type:', error);
      res.status(500).json({ error: 'Erreur lors de la récupération des articles', details: error.message });
    }
  },

  // Ajouter un nouvel article
  async addArticle(req, res) {
    try {
      const { type_id, designation, article, code_fabricant, ref_commande } = req.body;

      if (!type_id || !article) {
        return res.status(400).json({ error: 'type_id et article sont requis' });
      }

      const query = `
        INSERT INTO consumable_catalog (type_id, designation, article, code_fabricant, ref_commande)
        VALUES ($1, $2, $3, $4, $5)
      `;

      const result = await pgDb.run(query, [type_id, designation || '', article, code_fabricant || '', ref_commande || '']);

      res.status(201).json({
        id: result.lastID,
        message: 'Article ajouté avec succès',
        type_id,
        designation: designation || '',
        article,
        code_fabricant: code_fabricant || '',
        ref_commande: ref_commande || ''
      });
    } catch (error) {
      console.error('[Consommables] Error adding article:', error);
      res.status(500).json({ error: 'Erreur lors de l\'ajout de l\'article', details: error.message });
    }
  },

  // Modifier un article
  async updateArticle(req, res) {
    try {
      const { articleId } = req.params;
      const { designation, article, code_fabricant, ref_commande } = req.body;

      if (!article) {
        return res.status(400).json({ error: 'article est requis' });
      }

      const query = `
        UPDATE consumable_catalog
        SET designation = $1, article = $2, code_fabricant = $3, ref_commande = $4
        WHERE id = $5
        RETURNING *
      `;

      const result = await pgDb.all(query, [designation || '', article, code_fabricant || '', ref_commande || '', articleId]);

      if (result.length === 0) {
        return res.status(404).json({ error: 'Article non trouvé' });
      }

      res.json({ message: 'Article mis à jour avec succès', data: result[0] });
    } catch (error) {
      console.error('[Consommables] Error updating article:', error);
      res.status(500).json({ error: 'Erreur lors de la mise à jour de l\'article', details: error.message });
    }
  },

  // Supprimer un article
  async deleteArticle(req, res) {
    try {
      const { articleId } = req.params;

      // Vérifier si l'article est utilisé dans une demande
      const checkQuery = `SELECT COUNT(*) as count FROM request_articles WHERE catalog_id = $1`;
      const checkResult = await pgDb.get(checkQuery, [articleId]);

      if (checkResult.count > 0) {
        return res.status(400).json({
          error: 'Impossible de supprimer cet article',
          message: `Cet article est utilisé dans ${checkResult.count} demande(s)`
        });
      }

      const query = `DELETE FROM consumable_catalog WHERE id = $1 RETURNING id`;
      const result = await pgDb.all(query, [articleId]);

      if (result.length === 0) {
        return res.status(404).json({ error: 'Article non trouvé' });
      }

      res.json({ message: 'Article supprimé avec succès' });
    } catch (error) {
      console.error('[Consommables] Error deleting article:', error);
      res.status(500).json({ error: 'Erreur lors de la suppression de l\'article', details: error.message });
    }
  },

  // Ajouter plusieurs articles à la fois
  async bulkAddArticles(req, res) {
    try {
      const { type_id, articles } = req.body;

      if (!type_id || !Array.isArray(articles) || articles.length === 0) {
        return res.status(400).json({ error: 'type_id et un tableau d\'articles sont requis' });
      }

      let addedCount = 0;
      const errors = [];

      for (const item of articles) {
        try {
          const { article, code_fabricant, ref_commande } = item;
          if (article) {
            const query = `
              INSERT INTO consumable_catalog (type_id, article, code_fabricant, ref_commande)
              VALUES ($1, $2, $3, $4)
            `;
            await pgDb.run(query, [type_id, article, code_fabricant || '', ref_commande || '']);
            addedCount++;
          }
        } catch (error) {
          errors.push(`Article "${item.article}": ${error.message}`);
        }
      }

      res.status(201).json({
        message: `${addedCount} article(s) ajouté(s) avec succès`,
        added: addedCount,
        errors: errors.length > 0 ? errors : undefined
      });
    } catch (error) {
      console.error('[Consommables] Error bulk adding articles:', error);
      res.status(500).json({ error: 'Erreur lors de l\'ajout des articles', details: error.message });
    }
  },
};

module.exports = controller;
module.exports.setSendMail = setSendMail;
