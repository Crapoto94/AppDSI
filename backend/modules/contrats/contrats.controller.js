const fs = require('fs');
const path = require('path');
const xlsx = require('xlsx');
const { pgDb } = require('../../shared/database');
const storage = require('../../shared/storage');

const MODULE = 'contrats';

// Helpers
function excelDateToISO(value) {
    if (!value) return null;
    if (value instanceof Date) {
        if (isNaN(value.getTime())) return null;
        return value.toISOString().split('T')[0];
    }
    if (typeof value === 'number') {
        const date = new Date((value - 25569) * 86400 * 1000);
        if (!isNaN(date.getTime())) return date.toISOString().split('T')[0];
    }
    if (typeof value === 'string') {
        const s = value.trim();
        const frMatch = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
        if (frMatch) {
            const day = parseInt(frMatch[1]);
            const month = parseInt(frMatch[2]);
            const year = parseInt(frMatch[3]);
            // Validate date components
            if (day < 1 || day > 31 || month < 1 || month > 12) return null;
            // Validate against actual month max days
            const testDate = new Date(year, month - 1, day);
            if (testDate.getMonth() !== month - 1 || testDate.getDate() !== day) return null;
            return `${year}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
        }
        const d = new Date(s);
        if (!isNaN(d.getTime())) return d.toISOString().split('T')[0];
    }
    return null;
}

function toFloat(v) {
    if (v === null || v === undefined || v === '') return null;
    const n = parseFloat(String(v).replace(',', '.'));
    return isNaN(n) ? null : n;
}

function toInt(v) {
    if (v === null || v === undefined || v === '') return null;
    const n = parseInt(String(v));
    return isNaN(n) ? null : n;
}

function toStr(v) {
    if (v === null || v === undefined) return '';
    return String(v).trim();
}

// Controller
module.exports = {
    // Compteur contrats expirés / expirant bientôt (pour badge dashboard)
    async getExpiryCount(req, res, db) {
        try {
            const [expiredRow, soonRow] = await Promise.all([
                db.get(`SELECT COUNT(*) as count FROM contrats
                        WHERE statut != 'archivé'
                        AND date_fin IS NOT NULL
                        AND date_fin < CURRENT_DATE`),
                db.get(`SELECT COUNT(*) as count FROM contrats
                        WHERE statut != 'archivé'
                        AND date_fin IS NOT NULL
                        AND date_fin >= CURRENT_DATE
                        AND date_fin <= CURRENT_DATE + INTERVAL '90 days'`)
            ]);
            res.json({ expired: Number(expiredRow.count), soon: Number(soonRow.count) });
        } catch (error) {
            console.error('Error getting contrat expiry count:', error);
            res.status(500).json({ expired: 0, soon: 0 });
        }
    },

    // Récupérer tous les contrats
    async getAll(req, res, db) {
        try {
            const contrats = await db.all(`
                SELECT
                    c.*,
                    t."TIERS_POBJ_EXTRACT_2" as tiers_nom,
                    a.name as app_nom
                FROM contrats c
                LEFT JOIN oracle.gf_oracle_tiers t ON c.tiers = t."TIERS_TIERS"
                LEFT JOIN magapp.apps a ON c.app_id = a.id
                ORDER BY c.date_fin ASC NULLS LAST, c.objet ASC
            `);
            res.json(contrats);
        } catch (error) {
            res.status(500).json({ message: 'Erreur', error: error.message });
        }
    },

    // Créer un contrat
    async create(req, res, db) {
        try {
            const b = req.body;
            const result = await db.run(
                `INSERT INTO contrats (
                    svc, objet, budget, raison_sociale, tiers, app_id, type_contrat, annee_initiale,
                    direction, service, perimetre, nature, fonction,
                    date_debut, duree_annees, nb_reconductions, date_fin,
                    marche_contrat, piece, date_reconduction, reconduction,
                    montant_2022, montant_2023, montant_2024, montant_2025, montant_2026,
                    prevision_2026, prevision_2027, prevision_2028, commentaires,
                    gti, gtr, penalite, indice_revision, numero_facture, contrat_renouvellement_id
                ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
                [
                    toStr(b.svc), toStr(b.objet), toStr(b.budget), toStr(b.raison_sociale), toStr(b.tiers), toInt(b.app_id), toStr(b.type_contrat),
                    toInt(b.annee_initiale), toStr(b.direction), toStr(b.service), toStr(b.perimetre),
                    toStr(b.nature), toStr(b.fonction), b.date_debut || null, toFloat(b.duree_annees),
                    toInt(b.nb_reconductions), b.date_fin || null, toStr(b.marche_contrat), toStr(b.piece),
                    toStr(b.date_reconduction), toStr(b.reconduction),
                    toFloat(b.montant_2022), toFloat(b.montant_2023), toFloat(b.montant_2024),
                    toFloat(b.montant_2025), toFloat(b.montant_2026),
                    toFloat(b.prevision_2026), toFloat(b.prevision_2027), toFloat(b.prevision_2028),
                    toStr(b.commentaires),
                    toStr(b.gti), toStr(b.gtr), toStr(b.penalite), toStr(b.indice_revision), toStr(b.numero_facture),
                    toInt(b.contrat_renouvellement_id)
                ]
            );
            const newContrat = await db.get('SELECT * FROM contrats WHERE id = ?', [result.lastID]);
            res.status(201).json(newContrat);
        } catch (error) {
            res.status(500).json({ message: 'Erreur création', error: error.message });
        }
    },

    // Mettre à jour un contrat
    async update(req, res, db) {
        try {
            console.log('[DEBUG UPDATE] Body reçu:', { tiers: req.body.tiers, app_id: req.body.app_id, body: JSON.stringify(req.body).substring(0, 200) });
            const allowed = [
                'svc', 'objet', 'budget', 'raison_sociale', 'tiers', 'app_id', 'type_contrat', 'annee_initiale',
                'direction', 'service', 'perimetre', 'nature', 'fonction',
                'date_debut', 'duree_annees', 'nb_reconductions', 'date_fin',
                'marche_contrat', 'piece', 'date_reconduction', 'reconduction',
                'montant_2022', 'montant_2023', 'montant_2024', 'montant_2025', 'montant_2026',
                'prevision_2026', 'prevision_2027', 'prevision_2028', 'commentaires',
                'gti', 'gtr', 'penalite', 'indice_revision', 'numero_facture'
            ];
            const updates = [];
            const values = [];
            allowed.forEach(f => {
                if (req.body[f] !== undefined) {
                    updates.push(`${f} = ?`);
                    if (f === 'app_id' || f === 'annee_initiale' || f === 'nb_reconductions') {
                        values.push(toInt(req.body[f]));
                    } else if (f === 'duree_annees' || f.startsWith('montant_') || f.startsWith('prevision_')) {
                        values.push(toFloat(req.body[f]));
                    } else {
                        values.push(toStr(req.body[f]));
                    }
                }
            });
            if (updates.length === 0) return res.status(400).json({ message: 'Aucun champ modifiable' });
            values.push(req.params.id);
            const updateSQL = `UPDATE contrats SET ${updates.join(', ')} WHERE id = ?`;
            console.log('[DEBUG UPDATE] SQL:', updateSQL);
            console.log('[DEBUG UPDATE] Values:', values);
            console.log('[DEBUG UPDATE] About to execute query...');
            await db.run(updateSQL, values);
            console.log('[DEBUG UPDATE] Query executed successfully');
            const updated = await db.get('SELECT * FROM contrats WHERE id = ?', [req.params.id]);
            res.json({ message: 'Mis à jour', contrat: updated });
        } catch (error) {
            console.error('[DEBUG UPDATE] ERROR:', error.message, error.stack);
            res.status(500).json({ message: 'Erreur mise à jour', error: error.message });
        }
    },

    // Supprimer un contrat
    async delete(req, res, db) {
        try {
            const contrat = await db.get('SELECT id FROM contrats WHERE id = ?', [req.params.id]);
            if (!contrat) return res.status(404).json({ message: 'Contrat non trouvé' });
            await db.run('DELETE FROM contrats WHERE id = ?', [req.params.id]);
            res.json({ message: 'Contrat supprimé' });
        } catch (error) {
            res.status(500).json({ message: 'Erreur suppression', error: error.message });
        }
    },

    // Import Excel
    async uploadExcel(req, res, db) {
        if (!req.file) return res.status(400).json({ message: 'Aucun fichier fourni' });

        try {
            const workbook = xlsx.read(req.file.buffer, { cellDates: true });

            const sheetName = workbook.SheetNames.find(n =>
                n.toLowerCase() === 'maintenances'
            ) || workbook.SheetNames[0];

            if (!sheetName) {
                return res.status(400).json({ message: 'Onglet "Maintenances" introuvable dans le fichier.' });
            }

            const sheet = workbook.Sheets[sheetName];
            const rows = xlsx.utils.sheet_to_json(sheet, { defval: null });

            const results = [];
            let inserted = 0, updated = 0, skipped = 0, errors = 0;

            for (const [index, row] of rows.entries()) {
                const objet = toStr(row['Objet (nom du logiciel)'] ?? row['Objet'] ?? '');
                const svcVal = toStr(row['SVC']);
                if (svcVal.toUpperCase() === 'SVC' || objet.toUpperCase() === 'OBJET') {
                    skipped++;
                    results.push({ row: index + 2, status: 'skipped', message: 'Ligne d\'en-tête ignorée' });
                    continue;
                }
                if (!objet) {
                    skipped++;
                    results.push({ row: index + 2, status: 'skipped', message: 'Objet manquant' });
                    continue;
                }

                const data = {
                    svc: toStr(row['SVC']),
                    objet,
                    budget: toStr(row['Budget']),
                    raison_sociale: toStr(row['RAISON SOCIALE']),
                    type_contrat: toStr(row['Type']),
                    annee_initiale: toInt(row['Année initiale']),
                    direction: toStr(row['Direction']),
                    service: toStr(row['Service']),
                    perimetre: toStr(row['Périmètre']),
                    nature: toStr(row['Nature']),
                    fonction: toStr(row['Fonction']),
                    date_debut: excelDateToISO(row['Date de début de contrat']),
                    duree_annees: toFloat(row['Durée (années)']),
                    nb_reconductions: toInt(row['Nb Reconduc.']),
                    date_fin: excelDateToISO(row['Date de fin de contrat']),
                    marche_contrat: toStr(row['Marché / Contrat']),
                    piece: toStr(row['Pièce']),
                    date_reconduction: toStr(row['Date de reconduction']),
                    reconduction: toStr(row['Reconduction']),
                    montant_2022: toFloat(row['2022']),
                    montant_2023: toFloat(row['2023']),
                    montant_2024: toFloat(row['2024']),
                    montant_2025: toFloat(row['2025']),
                    montant_2026: toFloat(row['2026']),
                    prevision_2026: toFloat(row['Prévision 2026']),
                    prevision_2027: toFloat(row['Prévision 2027']),
                    prevision_2028: toFloat(row['Prévision 2028']),
                    commentaires: toStr(row['Commentaires'])
                };

                try {
                    // Check if contrat already exists by objet
                    const existing = await db.get('SELECT id FROM contrats WHERE objet = ?', [data.objet]);

                    if (existing) {
                        // UPDATE existing contrat (preserve tiers and app_id)
                        const updateFields = [
                            'svc', 'budget', 'raison_sociale', 'type_contrat', 'annee_initiale',
                            'direction', 'service', 'perimetre', 'nature', 'fonction',
                            'date_debut', 'duree_annees', 'nb_reconductions', 'date_fin',
                            'marche_contrat', 'piece', 'date_reconduction', 'reconduction',
                            'montant_2022', 'montant_2023', 'montant_2024', 'montant_2025', 'montant_2026',
                            'prevision_2026', 'prevision_2027', 'prevision_2028', 'commentaires'
                        ];
                        const updateClauses = updateFields.map(f => `${f} = ?`);
                        const updateValues = updateFields.map(f => data[f]);
                        updateValues.push(existing.id);

                        await db.run(`UPDATE contrats SET ${updateClauses.join(', ')} WHERE id = ?`, updateValues);
                        updated++;
                        results.push({ row: index + 2, status: 'ok', action: 'updated', objet });
                    } else {
                        // INSERT new contrat
                        const query = `INSERT INTO contrats (
                                svc, objet, budget, raison_sociale, type_contrat, annee_initiale,
                                direction, service, perimetre, nature, fonction,
                                date_debut, duree_annees, nb_reconductions, date_fin,
                                marche_contrat, piece, date_reconduction, reconduction,
                                montant_2022, montant_2023, montant_2024, montant_2025, montant_2026,
                                prevision_2026, prevision_2027, prevision_2028, commentaires
                            ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`;
                        const values = [
                                data.svc, data.objet, data.budget, data.raison_sociale, data.type_contrat,
                                data.annee_initiale, data.direction, data.service, data.perimetre, data.nature, data.fonction,
                                data.date_debut, data.duree_annees, data.nb_reconductions, data.date_fin,
                                data.marche_contrat, data.piece, data.date_reconduction, data.reconduction,
                                data.montant_2022, data.montant_2023, data.montant_2024, data.montant_2025, data.montant_2026,
                                data.prevision_2026, data.prevision_2027, data.prevision_2028, data.commentaires
                            ];
                        await db.run(query, values);
                        inserted++;
                        results.push({ row: index + 2, status: 'ok', action: 'inserted', objet });
                    }
                } catch (error) {
                    errors++;
                    console.error(`[Excel Import] Row ${index + 2} ERROR:`, error.message);
                    results.push({ row: index + 2, status: 'error', message: error.message, objet });
                }
            }

            res.json({ inserted, updated, skipped, errors, total: rows.length, results });
        } catch (error) {
            console.error('Erreur import Excel:', error.message);
            res.status(500).json({ message: 'Erreur traitement Excel', error: error.message });
        }
    },

    // Documents - Lister
    async getDocuments(req, res, db) {
        try {
            const docs = await db.all('SELECT * FROM contrat_documents WHERE contrat_id = ? ORDER BY est_principal DESC, uploaded_at DESC', [req.params.id]);
            res.json(docs);
        } catch (error) {
            res.status(500).json({ message: 'Erreur', error: error.message });
        }
    },

    // Documents - Ajouter
    async addDocument(req, res, db) {
        if (!req.file) return res.status(400).json({ message: 'Aucun fichier fourni' });
        try {
            const contrat = await db.get('SELECT id FROM contrats WHERE id = ?', [req.params.id]);
            if (!contrat) return res.status(404).json({ message: 'Contrat non trouvé' });

            const { nature = '', est_principal = '0' } = req.body;
            const isPrincipal = est_principal === '1' || est_principal === true;

            if (isPrincipal) {
                await db.run('UPDATE contrat_documents SET est_principal = 0 WHERE contrat_id = ?', [req.params.id]);
            }

            // Corrige l'encodage du nom de fichier
            if (req.file && req.file.originalname) req.file.originalname = storage.fixUploadName(req.file.originalname);

            // Sauvegarde via le service de stockage unifié
            const saved = await storage.saveFile(MODULE, req.params.id, req.file);

            const result = await db.run(
                'INSERT INTO contrat_documents (contrat_id, file_path, file_name, nature, est_principal) VALUES (?,?,?,?,?)',
                [req.params.id, saved.dbPath, req.file.originalname, nature, isPrincipal ? 1 : 0]
            );

            if (isPrincipal) {
                await db.run(
                    'UPDATE contrats SET doc_principal_path = ?, doc_principal_nom = ? WHERE id = ?',
                    [saved.dbPath, req.file.originalname, req.params.id]
                );
            }

            const doc = await db.get('SELECT * FROM contrat_documents WHERE id = ?', [result.lastID]);
            res.status(201).json(doc);
        } catch (error) {
            res.status(500).json({ message: 'Erreur upload document', error: error.message });
        }
    },

    // Documents - Supprimer
    async deleteDocument(req, res, db) {
        try {
            const doc = await db.get('SELECT * FROM contrat_documents WHERE id = ? AND contrat_id = ?', [req.params.docId, req.params.id]);
            if (!doc) return res.status(404).json({ message: 'Document non trouvé' });

            // Supprime via le service de stockage (nouveau ou legacy)
            if (storage.isStoragePath(doc.file_path)) {
                await storage.deleteFile(doc.file_path);
            } else {
                const fullPath = path.join(__dirname, '../../', doc.file_path);
                if (fs.existsSync(fullPath)) fs.unlinkSync(fullPath);
            }

            await db.run('DELETE FROM contrat_documents WHERE id = ?', [doc.id]);
            if (doc.est_principal) {
                await db.run('UPDATE contrats SET doc_principal_path = ?, doc_principal_nom = ? WHERE id = ?', ['', '', req.params.id]);
            }
            res.json({ message: 'Document supprimé' });
        } catch (error) {
            res.status(500).json({ message: 'Erreur suppression document', error: error.message });
        }
    },

    // Renouvellement
    async updateRenewal(req, res, db) {
        const { renouvellement_statut, renouvellement_commentaire, nouvelle_date_fin } = req.body;
        try {
            const updates = ['renouvellement_statut = ?', 'renouvellement_commentaire = ?'];
            const values = [renouvellement_statut, renouvellement_commentaire || ''];
            if (nouvelle_date_fin) { updates.push('date_fin = ?'); values.push(nouvelle_date_fin); }
            values.push(req.params.id);
            await db.run(`UPDATE contrats SET ${updates.join(', ')} WHERE id = ?`, values);
            const updated = await db.get('SELECT * FROM contrats WHERE id = ?', [req.params.id]);
            res.json({ message: 'Renouvellement mis à jour', contrat: updated });
        } catch (error) {
            res.status(500).json({ message: 'Erreur renouvellement', error: error.message });
        }
    },

    // Archivage
    async updateStatus(req, res, db) {
        const { statut } = req.body;
        if (!['actif', 'archivé'].includes(statut)) return res.status(400).json({ message: 'Statut invalide' });
        try {
            await db.run('UPDATE contrats SET statut = ? WHERE id = ?', [statut, req.params.id]);
            const updated = await db.get('SELECT * FROM contrats WHERE id = ?', [req.params.id]);
            res.json({ message: `Contrat ${statut}`, contrat: updated });
        } catch (error) {
            res.status(500).json({ message: 'Erreur archivage', error: error.message });
        }
    }
};
