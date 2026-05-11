const fs = require('fs');
const path = require('path');
const { pgDb, getSqlite } = require('../../shared/database');
const { logMouchard } = require('../../shared/utils');

let sendMailFn = null;
const setSendMail = (fn) => { sendMailFn = fn; };

// ============================================
// UTILITAIRES
// ============================================

async function estPMO(username) {
    try {
        const db = getSqlite();
        if (!db) return false;
        const user = await db.get('SELECT u.id FROM user_tiles ut JOIN users u ON u.id = ut.user_id WHERE ut.tile_id = 24 AND u.username = ?', [username]);
        return !!user;
    } catch { return false; }
}

async function genererCodeProjet() {
    const annee = new Date().getFullYear();
    const dernier = await pgDb.get(
        `SELECT code FROM projets WHERE code LIKE $1 ORDER BY id DESC LIMIT 1`,
        [`PROJ-${annee}-%`]
    );
    let num = 1;
    if (dernier) {
        const match = dernier.code.match(/-(\d+)$/);
        if (match) num = parseInt(match[1]) + 1;
    }
    return `PROJ-${annee}-${String(num).padStart(3, '0')}`;
}

async function ajouterJournal(projetId, typeEntree, message, details, username) {
    await pgDb.run(
        `INSERT INTO projet_journal (projet_id, type_entree, message, details, username) VALUES ($1, $2, $3, $4, $5)`,
        [projetId, typeEntree, message, details ? JSON.stringify(details) : null, username]
    );
}

async function creerNotification(projetId, destinataire, typeNotification, message) {
    await pgDb.run(
        `INSERT INTO projet_notifications (projet_id, destinataire_username, type_notification, message) VALUES ($1, $2, $3, $4)`,
        [projetId, destinataire, typeNotification, message]
    );
}

async function envoyerNotifications(projetId) {
    const notifs = await pgDb.all(
        `SELECT * FROM projet_notifications WHERE projet_id = $1 AND envoye = 0`,
        [projetId]
    );
    if (!sendMailFn) return;
    for (const n of notifs) {
        try {
            const sujet = `[Portefeuille Projets] ${n.message}`;
            await sendMailFn(n.destinataire_username, sujet, `<p>${n.message}</p>`);
            await pgDb.run(
                `UPDATE projet_notifications SET envoye = 1, date_envoi = CURRENT_TIMESTAMP WHERE id = $1`,
                [n.id]
            );
        } catch (e) {
            await pgDb.run(
                `UPDATE projet_notifications SET erreur = $1 WHERE id = $2`,
                [e.message, n.id]
            );
        }
    }
}

async function getControlesCompletude(projetId, statutCible) {
    const projet = await pgDb.get('SELECT * FROM projets WHERE id = $1', [projetId]);
    if (!projet) return [];

    const typesGlobaux = await pgDb.all('SELECT * FROM projet_types_documentaires WHERE actif = 1 ORDER BY ordre');
    const projetAttendus = await pgDb.all('SELECT * FROM projet_attendus WHERE projet_id = $1', [projetId]);

    // Fusion : les attendus projet écrasent les globaux
    const typesEffectifs = typesGlobaux.map(t => {
        const pa = projetAttendus.find(a => a.type_code === t.code);
        if (pa) {
            return { ...t, obligatoire: pa.obligatoire, phase_concernee: pa.phase_concernee || t.phase_concernee };
        }
        return t;
    });

    const controles = [];
    for (const type of typesEffectifs) {
        if (type.obligatoire === 0) continue;
        // Ne vérifier que si la phase correspond
        if (type.phase_concernee && type.phase_concernee !== statutCible) continue;
        const docs = await pgDb.all(
            `SELECT d.id, d.type_documentaire, COUNT(v.id) as nb_versions,
                    BOOL_OR(v.est_version_courante = 1) as a_version_active
             FROM projet_documents d
             LEFT JOIN projet_versions_document v ON v.document_id = d.id
             WHERE d.projet_id = $1 AND d.type_documentaire = $2
             GROUP BY d.id, d.type_documentaire`,
            [projetId, type.code]
        );
        const present = docs.some(d => d.nb_versions > 0 && d.a_version_active);
        controles.push({
            type: type.code,
            label: type.label,
            obligatoire: true,
            present,
            statut: present ? 'ok' : 'manquant'
        });
    }
    return controles;
}

function getStatutsSuivants(statutActuel) {
    const transitions = {
        'idee': ['demande_initiale'],
        'demande_initiale': ['etude_dsi'],
        'etude_dsi': ['arbitrage'],
        'arbitrage': ['planification', 'refuse', 'suspendu'],
        'planification': ['en_cours', 'suspendu'],
        'en_cours': ['en_recette', 'suspendu'],
        'en_recette': ['en_cloture', 'suspendu'],
        'en_cloture': ['cloture', 'suspendu'],
        'suspendu': ['demande_initiale', 'etude_dsi', 'arbitrage', 'planification', 'en_cours', 'en_recette', 'en_cloture', 'abandonne'],
        'refuse': [],
        'abandonne': [],
        'cloture': []
    };
    return transitions[statutActuel] || [];
}

function getStatutLabel(statut) {
    const labels = {
        'idee': 'Idée',
        'demande_initiale': 'Demande initiale',
        'etude_dsi': 'Étude DSI',
        'arbitrage': 'Arbitrage',
        'planification': 'Planification',
        'en_cours': 'En cours',
        'en_recette': 'En recette',
        'en_cloture': 'En clôture',
        'cloture': 'Clôturé',
        'refuse': 'Refusé',
        'suspendu': 'Suspendu',
        'abandonne': 'Abandonné'
    };
    return labels[statut] || statut;
}

// ============================================
// CRUD PROJETS
// ============================================

const getAll = async (req, res) => {
    try {
        const { statut, service_pilote, niveau, priorite, chef_projet, q, tri } = req.query;
        const username = req.user.username;
        const isAdmin = req.user.role === 'admin';
        const isPMO = await estPMO(username);

        let conditions = [];
        let params = [];
        let paramIdx = 1;

        if (!isAdmin && !isPMO) {
            conditions.push(`(
                LOWER(p.created_by_username) = LOWER($${paramIdx++})
                OR EXISTS (SELECT 1 FROM projet_roles pr WHERE pr.projet_id = p.id AND LOWER(pr.username) = LOWER($${paramIdx-1}))
                OR EXISTS (SELECT 1 FROM projet_visibilite pv WHERE pv.projet_id = p.id AND LOWER(pv.username) = LOWER($${paramIdx-1}))
                OR LOWER(p.commanditaire_username) = LOWER($${paramIdx-1})
                OR LOWER(p.chef_projet_username) = LOWER($${paramIdx-1})
                OR LOWER(p.responsable_dsi_username) = LOWER($${paramIdx-1})
                OR LOWER(p.representant_metier_username) = LOWER($${paramIdx-1})
                OR LOWER(p.dpo_username) = LOWER($${paramIdx-1})
            )`);
            params.push(username);
        }

        if (statut) { conditions.push(`p.statut = $${paramIdx++}`); params.push(statut); }
        if (service_pilote) { conditions.push(`p.service_pilote = $${paramIdx++}`); params.push(service_pilote); }
        if (niveau) { conditions.push(`p.niveau_projet = $${paramIdx++}`); params.push(niveau); }
        if (priorite) { conditions.push(`p.priorite = $${paramIdx++}`); params.push(parseInt(priorite)); }
        if (chef_projet) { conditions.push(`LOWER(p.chef_projet_username) = LOWER($${paramIdx++})`); params.push(chef_projet); }
        if (q) { conditions.push(`(p.titre ILIKE $${paramIdx} OR p.code ILIKE $${paramIdx} OR p.description ILIKE $${paramIdx})`); params.push(`%${q}%`); paramIdx++; }

        const where = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';
        const orderBy = tri === 'score' ? 'p.score_total DESC' : tri === 'priorite' ? 'p.priorite DESC' : tri === 'statut' ? 'p.statut' : 'p.date_modification DESC';

        const userCheckParam = params.length + 1;

        const projets = await pgDb.all(`
            SELECT p.*,
                   (SELECT COUNT(*) FROM projet_roles pr WHERE pr.projet_id = p.id) as nb_roles,
                   (SELECT COUNT(*) FROM projet_documents pd WHERE pd.projet_id = p.id) as nb_documents,
                   (SELECT COUNT(*) FROM projet_reunions pr2 WHERE pr2.projet_id = p.id) as nb_reunions,
                   (SELECT COUNT(*) FROM projet_taches pt WHERE pt.projet_id = p.id AND pt.statut != 'terminee' AND pt.date_fin IS NOT NULL AND pt.date_fin <= (NOW() AT TIME ZONE 'Europe/Paris')::date) as nb_taches_en_retard,
                   (SELECT COUNT(*) FROM projet_jalons pj WHERE pj.projet_id = p.id AND pj.atteint = 0 AND pj.date_jalon <= (NOW() AT TIME ZONE 'Europe/Paris')::date) as nb_jalons_en_retard,
                   EXISTS (SELECT 1 FROM projet_roles pr WHERE pr.projet_id = p.id AND LOWER(pr.username) = LOWER($${userCheckParam})) as user_est_intervenant,
                   (SELECT STRING_AGG(ma.name, ', ') FROM projet_applications pa JOIN magapp.apps ma ON ma.id = pa.app_id WHERE pa.projet_id = p.id) as app_names
            FROM projets p
            ${where}
            ORDER BY ${orderBy}
        `, [...params, username]);

        res.json(projets);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

const getMesProjets = async (req, res) => {
    try {
        const username = req.user.username;
        const isPMO = await estPMO(username);

        let query, params;
        if (isPMO) {
            query = `
                SELECT p.*,
                       (SELECT COUNT(*) FROM projet_roles pr WHERE pr.projet_id = p.id) as nb_roles,
                       (SELECT COUNT(*) FROM projet_documents pd WHERE pd.projet_id = p.id) as nb_documents,
                       (SELECT COUNT(*) FROM projet_reunions pr2 WHERE pr2.projet_id = p.id) as nb_reunions,
                       (SELECT COUNT(*) FROM projet_taches pt WHERE pt.projet_id = p.id AND pt.statut != 'terminee' AND pt.date_fin IS NOT NULL AND pt.date_fin <= (NOW() AT TIME ZONE 'Europe/Paris')::date) as nb_taches_en_retard,
                       (SELECT COUNT(*) FROM projet_jalons pj WHERE pj.projet_id = p.id AND pj.atteint = 0 AND pj.date_jalon <= (NOW() AT TIME ZONE 'Europe/Paris')::date) as nb_jalons_en_retard,
                       EXISTS (SELECT 1 FROM projet_roles pr WHERE pr.projet_id = p.id AND LOWER(pr.username) = LOWER($1)) as user_est_intervenant,
                       (SELECT STRING_AGG(ma.name, ', ') FROM projet_applications pa JOIN magapp.apps ma ON ma.id = pa.app_id WHERE pa.projet_id = p.id) as app_names
                FROM projets p
                ORDER BY p.date_modification DESC
            `;
            params = [username];
        } else {
            query = `
                SELECT p.*,
                       (SELECT COUNT(*) FROM projet_roles pr WHERE pr.projet_id = p.id) as nb_roles,
                       (SELECT COUNT(*) FROM projet_documents pd WHERE pd.projet_id = p.id) as nb_documents,
                       (SELECT COUNT(*) FROM projet_reunions pr2 WHERE pr2.projet_id = p.id) as nb_reunions,
                       (SELECT COUNT(*) FROM projet_taches pt WHERE pt.projet_id = p.id AND pt.statut != 'terminee' AND pt.date_fin IS NOT NULL AND pt.date_fin <= (NOW() AT TIME ZONE 'Europe/Paris')::date) as nb_taches_en_retard,
                       (SELECT COUNT(*) FROM projet_jalons pj WHERE pj.projet_id = p.id AND pj.atteint = 0 AND pj.date_jalon <= (NOW() AT TIME ZONE 'Europe/Paris')::date) as nb_jalons_en_retard,
                       EXISTS (SELECT 1 FROM projet_roles pr WHERE pr.projet_id = p.id AND LOWER(pr.username) = LOWER($1)) as user_est_intervenant,
                       (SELECT STRING_AGG(ma.name, ', ') FROM projet_applications pa JOIN magapp.apps ma ON ma.id = pa.app_id WHERE pa.projet_id = p.id) as app_names
                FROM projets p
                WHERE LOWER(p.created_by_username) = LOWER($1)
                   OR EXISTS (SELECT 1 FROM projet_roles pr WHERE pr.projet_id = p.id AND LOWER(pr.username) = LOWER($1))
                   OR EXISTS (SELECT 1 FROM projet_visibilite pv WHERE pv.projet_id = p.id AND LOWER(pv.username) = LOWER($1))
                   OR LOWER(p.commanditaire_username) = LOWER($1)
                   OR LOWER(p.chef_projet_username) = LOWER($1)
                   OR LOWER(p.responsable_dsi_username) = LOWER($1)
                   OR LOWER(p.representant_metier_username) = LOWER($1)
                   OR LOWER(p.dpo_username) = LOWER($1)
                ORDER BY p.date_modification DESC
            `;
            params = [username];
        }
        const projets = await pgDb.all(query, params);
        res.json(projets);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

const getById = async (req, res) => {
    try {
        const { id } = req.params;
        const projet = await pgDb.get('SELECT * FROM projets WHERE id = $1', [id]);
        if (!projet) return res.status(404).json({ error: 'Projet non trouvé' });

        const services = await pgDb.all('SELECT * FROM projet_services WHERE projet_id = $1', [id]);
        const roles = await pgDb.all('SELECT * FROM projet_roles WHERE projet_id = $1 ORDER BY role, username', [id]);
        const visibilite = await pgDb.all('SELECT * FROM projet_visibilite WHERE projet_id = $1', [id]);

        const documents = await pgDb.all(`
            SELECT d.*,
                   (SELECT v.version FROM projet_versions_document v WHERE v.document_id = d.id AND v.est_version_courante = 1) as version_courante,
                   (SELECT v.id FROM projet_versions_document v WHERE v.document_id = d.id AND v.est_version_courante = 1) as version_courante_id,
                   (SELECT v.fichier_original FROM projet_versions_document v WHERE v.document_id = d.id AND v.est_version_courante = 1) as fichier_nom_original,
                   (SELECT COUNT(*) FROM projet_versions_document v WHERE v.document_id = d.id) as nb_versions
            FROM projet_documents d
            WHERE d.projet_id = $1
            ORDER BY d.date_creation DESC
        `, [id]);

        // Parent project info
        let projetParent = null;
        if (projet.projet_parent_id) {
            projetParent = await pgDb.get('SELECT id, code, titre FROM projets WHERE id = $1', [projet.projet_parent_id]);
        }
        // Applications
        const applications = await pgDb.all(
            `SELECT pa.*, ma.name as app_name, ma.url as app_url, ma.icon as app_icon
             FROM projet_applications pa
             LEFT JOIN magapp.apps ma ON ma.id = pa.app_id
             WHERE pa.projet_id = $1 ORDER BY ma.name`,
            [id]
        );

        res.json({ ...projet, services, roles, visibilite, documents, projet_parent: projetParent, applications });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

const create = async (req, res) => {
    try {
        const {
            titre, description, niveau_projet, service_pilote, services_associes,
            commanditaire_username, chef_projet_username, responsable_dsi_username,
            representant_metier_username, dpo_username,
            date_debut_prevue, date_fin_prevue, priorite, meteo,
            equipe, parties_prenantes, pour_info,
            projet_parent_id, app_ids
        } = req.body;
        const username = req.user.username;

        if (!titre || !service_pilote) {
            return res.status(400).json({ error: 'Titre et service pilote sont obligatoires' });
        }

        const code = await genererCodeProjet();

        const result = await pgDb.run(`
            INSERT INTO projets (code, titre, description, niveau_projet, service_pilote,
                commanditaire_username, chef_projet_username, responsable_dsi_username,
                representant_metier_username, dpo_username,
                date_debut_prevue, date_fin_prevue, priorite, meteo,
                created_by_username, modified_by_username, projet_parent_id)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $15, $16)
        `, [code, titre, description || '', niveau_projet || 'standard', service_pilote,
            commanditaire_username || null, chef_projet_username || null, responsable_dsi_username || null,
            representant_metier_username || null, dpo_username || null,
            date_debut_prevue || null, date_fin_prevue || null, priorite || 0,
            meteo || 'neutre',
            username,
            projet_parent_id || null]);

        const projetId = result.lastID;

        if (Array.isArray(app_ids)) {
            for (const appId of app_ids) {
                await pgDb.run('INSERT INTO projet_applications (projet_id, app_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [projetId, appId]);
            }
        }

        if (Array.isArray(services_associes)) {
            for (const svc of services_associes) {
                await pgDb.run('INSERT INTO projet_services (projet_id, service_code) VALUES ($1, $2)', [projetId, svc]);
            }
        }

        const addRole = async (projetId, usernameRole, role) => {
            if (!usernameRole) return;
            await pgDb.run(
                'INSERT INTO projet_roles (projet_id, username, role) VALUES ($1, $2, $3) ON CONFLICT (projet_id, username, role) DO NOTHING',
                [projetId, usernameRole, role]
            );
        };

        if (Array.isArray(equipe)) {
            for (const membre of equipe) await addRole(projetId, membre, 'equipe_projet');
        }
        if (Array.isArray(parties_prenantes)) {
            for (const pp of parties_prenantes) await addRole(projetId, pp, 'partie_prenante');
        }
        if (Array.isArray(pour_info)) {
            for (const pi of pour_info) await addRole(projetId, pi, 'pour_info');
        }

        await ajouterJournal(projetId, 'creation', `Projet ${code} créé`, { titre, service_pilote }, username);

        res.status(201).json({ id: projetId, code, message: 'Projet créé' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

const update = async (req, res) => {
    try {
        const { id } = req.params;
        const {
            titre, description, niveau_projet, statut, service_pilote,
            commanditaire_username, chef_projet_username, responsable_dsi_username,
            representant_metier_username, dpo_username,
            date_debut_prevue, date_fin_prevue, date_debut_reelle, date_fin_reelle,
            priorite, risque_global, avancement, satisfaction_metier, meteo,
            benefices_attendus, benefices_realises, notes_internes,
            commanditaire_display_name, chef_projet_display_name, chef_projet_metier_display_name,
            dpd_requis, rssi_requis, projet_parent_id,
            services_associes
        } = req.body;
        const username = req.user.username;

        const existant = await pgDb.get('SELECT * FROM projets WHERE id = $1', [id]);
        if (!existant) return res.status(404).json({ error: 'Projet non trouvé' });

        await pgDb.run(`
            UPDATE projets SET
                titre = COALESCE($1, titre),
                description = COALESCE($2, description),
                niveau_projet = COALESCE($3, niveau_projet),
                statut = COALESCE($4, statut),
                service_pilote = COALESCE($5, service_pilote),
                commanditaire_username = COALESCE($6, commanditaire_username),
                chef_projet_username = COALESCE($7, chef_projet_username),
                responsable_dsi_username = COALESCE($8, responsable_dsi_username),
                representant_metier_username = COALESCE($9, representant_metier_username),
                dpo_username = COALESCE($10, dpo_username),
                date_debut_prevue = COALESCE($11, date_debut_prevue),
                date_fin_prevue = COALESCE($12, date_fin_prevue),
                date_debut_reelle = COALESCE($13, date_debut_reelle),
                date_fin_reelle = COALESCE($14, date_fin_reelle),
                priorite = COALESCE($15, priorite),
                risque_global = COALESCE($16, risque_global),
                avancement = COALESCE($17, avancement),
                satisfaction_metier = COALESCE($18, satisfaction_metier),
                benefices_attendus = COALESCE($19, benefices_attendus),
                benefices_realises = COALESCE($20, benefices_realises),
                notes_internes = COALESCE($21, notes_internes),
                meteo = COALESCE($22, meteo),
                commanditaire_display_name = COALESCE($23, commanditaire_display_name),
                chef_projet_display_name = COALESCE($24, chef_projet_display_name),
                chef_projet_metier_display_name = COALESCE($25, chef_projet_metier_display_name),
                dpd_requis = COALESCE($26, dpd_requis),
                rssi_requis = COALESCE($27, rssi_requis),
                projet_parent_id = COALESCE($28, projet_parent_id),
                modified_by_username = $29,
                date_modification = CURRENT_TIMESTAMP
            WHERE id = $30
        `, [titre, description, niveau_projet, statut, service_pilote,
            commanditaire_username, chef_projet_username, responsable_dsi_username,
            representant_metier_username, dpo_username,
            date_debut_prevue, date_fin_prevue, date_debut_reelle, date_fin_reelle,
            priorite, risque_global, avancement, satisfaction_metier,
            benefices_attendus, benefices_realises, notes_internes,
            meteo,
            commanditaire_display_name || null, chef_projet_display_name || null, chef_projet_metier_display_name || null,
            dpd_requis !== undefined ? (dpd_requis ? 1 : 0) : null,
            rssi_requis !== undefined ? (rssi_requis ? 1 : 0) : null,
            projet_parent_id || null,
            username, id]);

        if (Array.isArray(services_associes)) {
            await pgDb.run('DELETE FROM projet_services WHERE projet_id = $1', [id]);
            for (const svc of services_associes) {
                await pgDb.run('INSERT INTO projet_services (projet_id, service_code) VALUES ($1, $2)', [id, svc]);
            }
        }

        await ajouterJournal(projetId, 'modification', `Projet ${existant.code} modifié`, null, username);

        res.json({ message: 'Projet mis à jour' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

const remove = async (req, res) => {
    try {
        const { id } = req.params;
        const username = req.user.username;
        const isAdmin = req.user.role === 'admin';
        const isPMO = await estPMO(username);
        if (!isAdmin && !isPMO) return res.status(403).json({ error: 'Accès refusé' });

        const projet = await pgDb.get('SELECT * FROM projets WHERE id = $1', [id]);
        if (!projet) return res.status(404).json({ error: 'Projet non trouvé' });

        // Supprimer aussi les sous-projets
        const enfants = await pgDb.all('SELECT id FROM projets WHERE projet_parent_id = $1', [id]);
        for (const e of enfants) {
            await pgDb.run('DELETE FROM projet_notifications WHERE projet_id = $1', [e.id]);
            await pgDb.run('DELETE FROM projet_journal WHERE projet_id = $1', [e.id]);
            await pgDb.run('DELETE FROM projet_reunions WHERE projet_id = $1', [e.id]);
            await pgDb.run('DELETE FROM projet_indicateurs WHERE projet_id = $1', [e.id]);
            const docs = await pgDb.all('SELECT id FROM projet_documents WHERE projet_id = $1', [e.id]);
            for (const doc of docs) await pgDb.run('DELETE FROM projet_versions_document WHERE document_id = $1', [doc.id]);
            await pgDb.run('DELETE FROM projet_documents WHERE projet_id = $1', [e.id]);
            await pgDb.run('DELETE FROM projet_scores WHERE projet_id = $1', [e.id]);
            await pgDb.run('DELETE FROM projet_transitions WHERE projet_id = $1', [e.id]);
            await pgDb.run('DELETE FROM projet_visibilite WHERE projet_id = $1', [e.id]);
            await pgDb.run('DELETE FROM projet_roles WHERE projet_id = $1', [e.id]);
            await pgDb.run('DELETE FROM projet_services WHERE projet_id = $1', [e.id]);
            await pgDb.run('DELETE FROM projet_etapes WHERE projet_id = $1', [e.id]);
            await pgDb.run('DELETE FROM projet_applications WHERE projet_id = $1', [e.id]);
            await pgDb.run('DELETE FROM projet_taches WHERE projet_id = $1', [e.id]);
            await pgDb.run('DELETE FROM projet_jalons WHERE projet_id = $1', [e.id]);
            await pgDb.run('DELETE FROM projet_groupes_taches WHERE projet_id = $1', [e.id]);
            await pgDb.run('DELETE FROM projet_attendus WHERE projet_id = $1', [e.id]);
            await pgDb.run('DELETE FROM projet_comites WHERE projet_id = $1', [e.id]);
            await pgDb.run('DELETE FROM projet_dependances WHERE projet_id = $1', [e.id]);
            await pgDb.run('DELETE FROM projet_favoris WHERE projet_id = $1', [e.id]);
            await pgDb.run('DELETE FROM projets WHERE id = $1', [e.id]);
        }

        await pgDb.run('DELETE FROM projet_notifications WHERE projet_id = $1', [id]);
        await pgDb.run('DELETE FROM projet_journal WHERE projet_id = $1', [id]);
        await pgDb.run('DELETE FROM projet_reunions WHERE projet_id = $1', [id]);
        await pgDb.run('DELETE FROM projet_indicateurs WHERE projet_id = $1', [id]);
        const docs = await pgDb.all('SELECT id FROM projet_documents WHERE projet_id = $1', [id]);
        for (const doc of docs) await pgDb.run('DELETE FROM projet_versions_document WHERE document_id = $1', [doc.id]);
        await pgDb.run('DELETE FROM projet_documents WHERE projet_id = $1', [id]);
        await pgDb.run('DELETE FROM projet_scores WHERE projet_id = $1', [id]);
        await pgDb.run('DELETE FROM projet_transitions WHERE projet_id = $1', [id]);
        await pgDb.run('DELETE FROM projet_visibilite WHERE projet_id = $1', [id]);
        await pgDb.run('DELETE FROM projet_roles WHERE projet_id = $1', [id]);
        await pgDb.run('DELETE FROM projet_services WHERE projet_id = $1', [id]);
        await pgDb.run('DELETE FROM projet_etapes WHERE projet_id = $1', [id]);
        await pgDb.run('DELETE FROM projet_applications WHERE projet_id = $1', [id]);
        await pgDb.run('DELETE FROM projet_taches WHERE projet_id = $1', [id]);
        await pgDb.run('DELETE FROM projet_jalons WHERE projet_id = $1', [id]);
        await pgDb.run('DELETE FROM projet_groupes_taches WHERE projet_id = $1', [id]);
        await pgDb.run('DELETE FROM projet_attendus WHERE projet_id = $1', [id]);
        await pgDb.run('DELETE FROM projet_comites WHERE projet_id = $1', [id]);
        await pgDb.run('DELETE FROM projet_dependances WHERE projet_id = $1', [id]);
        await pgDb.run('DELETE FROM projet_favoris WHERE projet_id = $1', [id]);
        await pgDb.run('DELETE FROM projets WHERE id = $1', [id]);

        res.json({ message: `Projet ${projet.code} et ses sous-projets supprimés` });
    } catch (error) {
        console.error('[DELETE PROJET]', error.message);
        res.status(500).json({ error: error.message });
    }
};

// ============================================
// WORKFLOW / TRANSITIONS
// ============================================

const getTransitionsPossibles = async (req, res) => {
    try {
        const { id } = req.params;
        const projet = await pgDb.get('SELECT * FROM projets WHERE id = $1', [id]);
        if (!projet) return res.status(404).json({ error: 'Projet non trouvé' });

        let statutsSuivants = getStatutsSuivants(projet.statut);
        // Filtrer par étapes actives du projet
        const etapes = await pgDb.all('SELECT * FROM projet_etapes WHERE projet_id = $1 AND actif = 1 ORDER BY ordre', [id]);
        if (etapes.length > 0) {
            const actives = new Set(etapes.map(e => e.etape));
            statutsSuivants = statutsSuivants.filter(s => actives.has(s));
        }
        const transitions = [];
        for (const statut of statutsSuivants) {
            const controles = await getControlesCompletude(id, statut);
            transitions.push({
                statut,
                label: getStatutLabel(statut),
                controles,
                alertes: controles.filter(c => !c.present)
            });
        }
        res.json({ statut_actuel: projet.statut, transitions });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

const effectuerTransition = async (req, res) => {
    try {
        const { id } = req.params;
        const { statut_cible, commentaire } = req.body;
        const username = req.user.username;

        const projet = await pgDb.get('SELECT * FROM projets WHERE id = $1', [id]);
        if (!projet) return res.status(404).json({ error: 'Projet non trouvé' });

        const statutsSuivants = getStatutsSuivants(projet.statut);
        if (!statutsSuivants.includes(statut_cible)) {
            return res.status(400).json({ error: `Transition de '${projet.statut}' vers '${statut_cible}' non autorisée` });
        }

        const ancienStatut = projet.statut;
        await pgDb.run(
            `UPDATE projets SET statut = $1, statut_precedent = $2, date_modification = CURRENT_TIMESTAMP, modified_by_username = $3 WHERE id = $4`,
            [statut_cible, ancienStatut, username, id]
        );

        await pgDb.run(
            `INSERT INTO projet_transitions (projet_id, statut_avant, statut_apres, username, commentaire) VALUES ($1, $2, $3, $4, $5)`,
            [id, ancienStatut, statut_cible, username, commentaire || null]
        );

        const msg = `Changement de statut : ${getStatutLabel(ancienStatut)} → ${getStatutLabel(statut_cible)}`;
        await ajouterJournal(id, 'changement_statut', msg, { avant: ancienStatut, apres: statut_cible }, username);

        const roles = await pgDb.all('SELECT username FROM projet_roles WHERE projet_id = $1', [id]);
        for (const role of roles) {
            await creerNotification(id, role.username, 'changement_statut', msg + ` — ${projet.code}`);
        }
        await envoyerNotifications(id);

        res.json({ message: `Transition effectuée : ${getStatutLabel(ancienStatut)} → ${getStatutLabel(statut_cible)}` });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

const getControles = async (req, res) => {
    try {
        const { id } = req.params;
        const { statut_cible } = req.query;
        const projet = await pgDb.get('SELECT * FROM projets WHERE id = $1', [id]);
        if (!projet) return res.status(404).json({ error: 'Projet non trouvé' });

        const cible = statut_cible || projet.statut;
        const controles = await getControlesCompletude(id, cible);
        res.json({ projet_id: id, statut: cible, controles });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// ============================================
// ROLES
// ============================================

const ajouterRole = async (req, res) => {
    try {
        const { id } = req.params;
        const { username: targetUser, role, display_name, email } = req.body;
        const username = req.user.username;

        if (!targetUser || !role) return res.status(400).json({ error: 'Username et rôle sont obligatoires' });

        await pgDb.run(
            `INSERT INTO projet_roles (projet_id, username, role, display_name, email, ajoute_par_username) VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (projet_id, username, role) DO NOTHING`,
            [id, targetUser, role, display_name || null, email || null, username]
        );

        const projet = await pgDb.get('SELECT code FROM projets WHERE id = $1', [id]);
        await ajouterJournal(id, 'partie_prenante_ajoutee', `${targetUser} ajouté comme ${role}`, { username: targetUser, role }, username);
        await creerNotification(id, targetUser, 'partie_prenante_ajoutee', `Vous avez été ajouté comme ${role} au projet ${projet.code}`);

        res.status(201).json({ message: 'Rôle ajouté' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

const supprimerRole = async (req, res) => {
    try {
        const { id, roleId } = req.params;
        const username = req.user.username;

        const role = await pgDb.get('SELECT * FROM projet_roles WHERE id = $1 AND projet_id = $2', [roleId, id]);
        if (!role) return res.status(404).json({ error: 'Rôle non trouvé' });

        await pgDb.run('DELETE FROM projet_roles WHERE id = $1', [roleId]);

        const projet = await pgDb.get('SELECT code FROM projets WHERE id = $1', [id]);
        await ajouterJournal(id, 'partie_prenante_retiree', `${role.username} retiré (${role.role})`, { username: role.username, role: role.role }, username);

        res.json({ message: 'Rôle supprimé' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// ============================================
// VISIBILITÉ
// ============================================

const ajouterVisibilite = async (req, res) => {
    try {
        const { id } = req.params;
        const { username: targetUser, display_name } = req.body;

        await pgDb.run(
            `INSERT INTO projet_visibilite (projet_id, username, display_name) VALUES ($1, $2, $3) ON CONFLICT (projet_id, username) DO NOTHING`,
            [id, targetUser, display_name || null]
        );
        res.status(201).json({ message: 'Visibilité ajoutée' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

const supprimerVisibilite = async (req, res) => {
    try {
        const { id, vid } = req.params;
        await pgDb.run('DELETE FROM projet_visibilite WHERE id = $1 AND projet_id = $2', [vid, id]);
        res.json({ message: 'Visibilité supprimée' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// ============================================
// DOCUMENTS + VERSIONNING
// ============================================

const DOCUMENTS_DIR = path.join(__dirname, '..', '..', 'file_projets');

const creerDocument = async (req, res) => {
    try {
        const { id } = req.params;
        const { type_documentaire, phase_concernee, description, est_attendu, est_contractuel, url, type_vrac } = req.body;
        const username = req.user.username;

        const result = await pgDb.run(
            `INSERT INTO projet_documents (projet_id, type_documentaire, phase_concernee, description, est_attendu, est_contractuel, url, type_vrac, created_by_username) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
            [id, type_documentaire, phase_concernee || null, description || null, est_attendu ? 1 : 0, est_contractuel ? 1 : 0, url || null, type_vrac ? 1 : 0, username]
        );

        res.status(201).json({ id: result.lastID, message: 'Document créé' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

const updateDocumentType = async (req, res) => {
    try {
        const { id, did } = req.params;
        const { type_documentaire, type_vrac } = req.body;
        if (!type_documentaire) return res.status(400).json({ error: 'type_documentaire requis' });
        await pgDb.run(
            'UPDATE projet_documents SET type_documentaire = $1, type_vrac = $2 WHERE id = $3 AND projet_id = $4',
            [type_documentaire, type_vrac ? 1 : 0, did, id]
        );
        res.json({ message: 'Document mis à jour' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

const supprimerDocument = async (req, res) => {
    try {
        const { id, did } = req.params;
        const doc = await pgDb.get('SELECT * FROM projet_documents WHERE id = $1 AND projet_id = $2', [did, id]);
        if (!doc) return res.status(404).json({ error: 'Document non trouvé' });
        const versions = await pgDb.all('SELECT * FROM projet_versions_document WHERE document_id = $1', [did]);
        for (const v of versions) {
            const chemin = path.join(DOCUMENTS_DIR, v.fichier_nom);
            try { if (fs.existsSync(chemin)) fs.unlinkSync(chemin); } catch {}
        }
        await pgDb.run('DELETE FROM projet_versions_document WHERE document_id = $1', [did]);
        await pgDb.run('DELETE FROM projet_documents WHERE id = $1 AND projet_id = $2', [did, id]);
        res.json({ message: 'Document supprimé' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

const uploadVersion = async (req, res) => {
    try {
        const { id, did } = req.params;
        const username = req.user.username;

        if (!req.file) return res.status(400).json({ error: 'Aucun fichier fourni' });

        if (!fs.existsSync(DOCUMENTS_DIR)) {
            fs.mkdirSync(DOCUMENTS_DIR, { recursive: true });
        }

        const doc = await pgDb.get('SELECT * FROM projet_documents WHERE id = $1 AND projet_id = $2', [did, id]);
        if (!doc) return res.status(404).json({ error: 'Document non trouvé' });

        const versionCourante = await pgDb.get(
            'SELECT version FROM projet_versions_document WHERE document_id = $1 AND est_version_courante = 1',
            [did]
        );

        let newVersion = 'v1.0';
        if (versionCourante) {
            await pgDb.run(
                'UPDATE projet_versions_document SET est_version_courante = 0 WHERE document_id = $1',
                [did]
            );
            const match = versionCourante.version.match(/v(\d+)\.(\d+)/);
            if (match) {
                const majeur = parseInt(match[1]);
                const mineur = parseInt(match[2]);
                newVersion = `v${majeur}.${mineur + 1}`;
            }
        }

        const ext = path.extname(req.file.originalname);
        const stockage = `${Date.now()}_${did}${ext}`;
        const destPath = path.join(DOCUMENTS_DIR, stockage);
        fs.renameSync(req.file.path, destPath);

        await pgDb.run(`
            INSERT INTO projet_versions_document (document_id, version, fichier_nom, fichier_original, fichier_taille, fichier_type, commentaire, est_version_courante, depose_par_username)
            VALUES ($1, $2, $3, $4, $5, $6, $7, 1, $8)
        `, [did, newVersion, stockage, req.file.originalname, req.file.size, req.file.mimetype, req.body.commentaire || null, username]);

        if (req.body.journal === 'true') {
            await ajouterJournal(id, 'document_depose', `Version ${newVersion} de ${doc.type_documentaire} déposée`, { document_id: did, version: newVersion, type: doc.type_documentaire }, username);
        }

        res.status(201).json({ version: newVersion, message: 'Version déposée' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

const uploadVersionsVrac = async (req, res) => {
    try {
        const { id } = req.params;
        const username = req.user.username;
        if (!req.files || req.files.length === 0) return res.status(400).json({ error: 'Aucun fichier' });

        if (!fs.existsSync(DOCUMENTS_DIR)) fs.mkdirSync(DOCUMENTS_DIR, { recursive: true });

        const results = [];
        for (const file of req.files) {
            const docResult = await pgDb.run(
                `INSERT INTO projet_documents (projet_id, type_documentaire, type_vrac, created_by_username) VALUES ($1, 'documentation_en_vrac', 1, $2)`,
                [id, username]
            );
            const did = docResult.lastID;
            const ext = path.extname(file.originalname);
            const stockage = `${Date.now()}_${did}${ext}`;
            const destPath = path.join(DOCUMENTS_DIR, stockage);
            fs.renameSync(file.path, destPath);
            await pgDb.run(
                `INSERT INTO projet_versions_document (document_id, version, fichier_nom, fichier_original, fichier_taille, fichier_type, est_version_courante, depose_par_username) VALUES ($1, 'v1.0', $2, $3, $4, $5, 1, $6)`,
                [did, stockage, file.originalname, file.size, file.mimetype, username]
            );
            results.push({ id: did, nom: file.originalname });
        }
        res.status(201).json({ count: results.length, documents: results });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

const getDocuments = async (req, res) => {
    try {
        const { id } = req.params;
        const documents = await pgDb.all(`
            SELECT d.*,
                   (SELECT v.version FROM projet_versions_document v WHERE v.document_id = d.id AND v.est_version_courante = 1) as version_courante,
                   (SELECT v.id FROM projet_versions_document v WHERE v.document_id = d.id AND v.est_version_courante = 1) as version_courante_id,
                   (SELECT v.fichier_original FROM projet_versions_document v WHERE v.document_id = d.id AND v.est_version_courante = 1) as fichier_nom_original,
                   (SELECT COUNT(*) FROM projet_versions_document v WHERE v.document_id = d.id) as nb_versions
            FROM projet_documents d
            WHERE d.projet_id = $1
            ORDER BY d.date_creation DESC
        `, [id]);
        res.json(documents);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

const getDocumentDetail = async (req, res) => {
    try {
        const { id, did } = req.params;
        const doc = await pgDb.get('SELECT * FROM projet_documents WHERE id = $1 AND projet_id = $2', [did, id]);
        if (!doc) return res.status(404).json({ error: 'Document non trouvé' });

        const versions = await pgDb.all(
            'SELECT * FROM projet_versions_document WHERE document_id = $1 ORDER BY date_depot DESC',
            [did]
        );

        res.json({ ...doc, versions });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

const telechargerVersion = async (req, res) => {
    try {
        const { id, did, vid } = req.params;
        const version = await pgDb.get('SELECT * FROM projet_versions_document WHERE id = $1 AND document_id = $2', [vid, did]);
        if (!version) return res.status(404).json({ error: 'Version non trouvée' });

        const filePath = path.join(DOCUMENTS_DIR, version.fichier_nom);
        if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Fichier introuvable' });

        const mode = req.query.mode;
        if (mode === 'inline') {
            res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(version.fichier_original)}"`);
            res.sendFile(filePath);
        } else {
            res.download(filePath, version.fichier_original);
        }
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

const getControlesDocuments = async (req, res) => {
    try {
        const { id } = req.params;
        const projet = await pgDb.get('SELECT * FROM projets WHERE id = $1', [id]);
        if (!projet) return res.status(404).json({ error: 'Projet non trouvé' });

        const controles = await getControlesCompletude(id, projet.statut);
        res.json(controles);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// ============================================
// SCORING
// ============================================

const enregistrerScore = async (req, res) => {
    try {
        const { id } = req.params;
        const { critere, note, justification } = req.body;
        const username = req.user.username;

        if (!critere || note < 1 || note > 5) {
            return res.status(400).json({ error: 'Critère requis et note entre 1 et 5' });
        }

        await pgDb.run(`
            INSERT INTO projet_scores (projet_id, critere, note, justification, note_par_username)
            VALUES ($1, $2, $3, $4, $5)
            ON CONFLICT (projet_id, critere) DO UPDATE SET note = $3, justification = $4, note_par_username = $5, date_notation = CURRENT_TIMESTAMP
        `, [id, critere, note, justification || null, username]);

        const scores = await pgDb.all('SELECT * FROM projet_scores WHERE projet_id = $1', [id]);
        const config = await pgDb.all('SELECT * FROM projet_scoring_config WHERE actif = 1');
        let scoreTotal = 0;
        for (const c of config) {
            const s = scores.find(s => s.critere === c.critere);
            if (s) {
                scoreTotal += (s.note / 5) * c.poids;
            }
        }
        await pgDb.run('UPDATE projets SET score_total = $1, date_modification = CURRENT_TIMESTAMP WHERE id = $2', [Math.round(scoreTotal), id]);

        res.json({ score: Math.round(scoreTotal), message: 'Score enregistré' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

const getScores = async (req, res) => {
    try {
        const { id } = req.params;
        const scores = await pgDb.all('SELECT * FROM projet_scores WHERE projet_id = $1', [id]);
        const config = await pgDb.all('SELECT * FROM projet_scoring_config WHERE actif = 1 ORDER BY ordre');
        const configAvecScore = config.map(c => {
            const s = scores.find(sc => sc.critere === c.critere);
            return { ...c, note: s ? s.note : null, justification: s ? s.justification : null, date_notation: s ? s.date_notation : null };
        });
        res.json({ config: configAvecScore, scores });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

const getScoreCalcule = async (req, res) => {
    try {
        const { id } = req.params;
        const projet = await pgDb.get('SELECT score_total FROM projets WHERE id = $1', [id]);
        if (!projet) return res.status(404).json({ error: 'Projet non trouvé' });
        res.json({ score: projet.score_total, max: 100 });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// ============================================
// RÉUNIONS LIÉES
// ============================================

const lierReunion = async (req, res) => {
    try {
        const { id } = req.params;
        const { reunion_id, type_gouvernance, comite_id } = req.body;
        const username = req.user.username;

        if (!reunion_id) return res.status(400).json({ error: 'reunion_id requis' });

        await pgDb.run(
            `INSERT INTO projet_reunions (projet_id, reunion_id, type_gouvernance, comite_id) VALUES ($1, $2, $3, $4) ON CONFLICT (projet_id, reunion_id) DO UPDATE SET type_gouvernance = $3, comite_id = $4`,
            [id, reunion_id, type_gouvernance || null, comite_id || null]
        );

        const [projet, reunion, comite] = await Promise.all([
            pgDb.get('SELECT code FROM projets WHERE id = $1', [id]),
            pgDb.get('SELECT titre, date_reunion FROM hub_rencontres.rencontres_reunions WHERE id = $1', [reunion_id]),
            comite_id ? pgDb.get('SELECT nom FROM projet_comites WHERE id = $1', [comite_id]) : Promise.resolve(null)
        ]);

        const dateStr = reunion?.date_reunion ? new Date(reunion.date_reunion).toLocaleDateString('fr-FR') : '';
        const comiteStr = comite ? ` · ${comite.nom}` : '';
        const msg = `📅 Réunion liée : ${reunion?.titre || '#' + reunion_id}${dateStr ? ' (' + dateStr + ')' : ''}${comiteStr}`;
        await ajouterJournal(id, 'reunion_liee', msg, { reunion_id, type_gouvernance, comite_id, reunion_titre: reunion?.titre }, username);

        res.status(201).json({ message: 'Réunion liée au projet' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

const delierReunion = async (req, res) => {
    try {
        const { id, rid } = req.params;
        await pgDb.run('DELETE FROM projet_reunions WHERE projet_id = $1 AND reunion_id = $2', [id, rid]);
        res.json({ message: 'Réunion déliée' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

const getReunionsLiees = async (req, res) => {
    try {
        const { id } = req.params;
        const liens = await pgDb.all(
            'SELECT * FROM projet_reunions WHERE projet_id = $1',
            [id]
        );

        if (liens.length === 0) return res.json([]);

        const reunionIds = liens.map(l => l.reunion_id);
        const placeholders = reunionIds.map((_, i) => `$${i + 1}`).join(',');

        const reunions = await pgDb.all(`
            SELECT r.*,
                   COUNT(DISTINCT p.id) as participant_count,
                   COUNT(DISTINCT a.id) as attachment_count
            FROM hub_rencontres.rencontres_reunions r
            LEFT JOIN hub_rencontres.reunion_participants p ON r.id = p.reunion_id
            LEFT JOIN hub_rencontres.reunion_attachments a ON r.id = a.reunion_id
            WHERE r.id IN (${placeholders})
            GROUP BY r.id
            ORDER BY r.date_reunion DESC
        `, reunionIds);

        // Get committee names
        const comiteIds = liens.filter(l => l.comite_id).map(l => l.comite_id);
        const comites = comiteIds.length > 0 ? await pgDb.all(
            `SELECT id, nom FROM projet_comites WHERE id IN (${comiteIds.map((_, i) => `$${i + 1}`).join(',')})`,
            comiteIds
        ) : [];

        const result = reunions.map(r => {
            const lien = liens.find(l => l.reunion_id === r.id);
            const comite = lien?.comite_id ? comites.find(c => c.id === lien.comite_id) : null;
            return { ...r, type_gouvernance: lien ? lien.type_gouvernance : null, comite_id: lien ? lien.comite_id : null, comite_nom: comite?.nom || null, lien_id: lien ? lien.id : null };
        });

        res.json(result);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// ============================================
// TÂCHES AGRÉGÉES (réunions + standalone)
// ============================================

const getTachesAgregees = async (req, res) => {
    try {
        const { id } = req.params;

        // 1. Récupérer toutes les réunions liées au projet
        const liens = await pgDb.all('SELECT * FROM projet_reunions WHERE projet_id = $1', [id]);

        let meetingTasks = [];
        if (liens.length > 0) {
            const reunionIds = liens.map(l => l.reunion_id);
            const placeholders = reunionIds.map((_, i) => `$${i + 1}`).join(',');
            const reunions = await pgDb.all(`
                SELECT id, titre, liste_taches FROM hub_rencontres.rencontres_reunions
                WHERE id IN (${placeholders})
            `, reunionIds);

            // Construire une map reunion_id -> lien
            const lienMap = {};
            for (const l of liens) lienMap[l.reunion_id] = l;

            for (const r of reunions) {
                let tasks = [];
                try { tasks = JSON.parse(r.liste_taches || '[]'); } catch (e) {}
                // Récupérer le nom du comité associé
                const lien = lienMap[r.id];
                let comiteNom = null;
                if (lien && lien.comite_id) {
                    const comite = await pgDb.get('SELECT nom FROM projet_comites WHERE id = $1', [lien.comite_id]);
                    comiteNom = comite ? comite.nom : null;
                }
                for (let idx = 0; idx < tasks.length; idx++) {
                    const t = tasks[idx];
                    meetingTasks.push({
                        id: `m-${r.id}-${idx}`,
                        tache: t.tache || '',
                        responsable: t.responsable || '',
                        echeance: t.echeance || null,
                        statut: t.statut || 'a_faire',
                        notes: t.notes || [],
                        source: 'reunion',
                        reunion_id: r.id,
                        reunion_titre: r.titre,
                        comite_nom: comiteNom
                    });
                }
            }
        }

        // 2. Récupérer les tâches standalone (avec fallback si table inexistante)
        let standaloneTasks = [];
        try {
            standaloneTasks = await pgDb.all(`
                SELECT id, tache, responsable, echeance, statut, notes, created_at
                FROM projet_taches_standalone
                WHERE projet_id = $1
                ORDER BY created_at DESC
            `, [id]);
        } catch (e) {
            standaloneTasks = [];
        }

        const standaloneMapped = standaloneTasks.map(t => {
            let notes = [];
            try { notes = JSON.parse(t.notes || '[]'); } catch (e) {}
            return {
                id: `s-${t.id}`,
                tache: t.tache,
                responsable: t.responsable || '',
                echeance: t.echeance || null,
                statut: t.statut || 'a_faire',
                notes: notes || [],
                source: 'standalone',
                reunion_id: null,
                reunion_titre: null,
                comite_nom: null,
                _db_id: t.id
            };
        });

        const allTasks = [...meetingTasks, ...standaloneMapped];
        res.json(allTasks);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

const ajouterTacheStandalone = async (req, res) => {
    try {
        const { id } = req.params;
        const { tache, responsable, echeance, statut } = req.body;
        if (!tache || !tache.trim()) return res.status(400).json({ error: 'La tâche est obligatoire' });

        const inserted = await pgDb.get(
            'INSERT INTO projet_taches_standalone (projet_id, tache, responsable, echeance, statut) VALUES ($1, $2, $3, $4, $5) RETURNING *',
            [id, tache.trim(), responsable || '', echeance || null, statut || 'a_faire']
        );
        res.status(201).json(inserted);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

const updateTacheStandalone = async (req, res) => {
    try {
        const { id, tid } = req.params;
        const { tache, responsable, echeance, statut } = req.body;

        const existing = await pgDb.get('SELECT * FROM projet_taches_standalone WHERE id = $1 AND projet_id = $2', [tid, id]);
        if (!existing) return res.status(404).json({ error: 'Tâche non trouvée' });

        await pgDb.run(
            'UPDATE projet_taches_standalone SET tache = $1, responsable = $2, echeance = $3, statut = $4 WHERE id = $5',
            [tache || existing.tache, responsable !== undefined ? responsable : existing.responsable, echeance !== undefined ? echeance : existing.echeance, statut || existing.statut, tid]
        );
        const updated = await pgDb.get('SELECT * FROM projet_taches_standalone WHERE id = $1', [tid]);
        res.json(updated);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

const supprimerTacheStandalone = async (req, res) => {
    try {
        const { id, tid } = req.params;
        const existing = await pgDb.get('SELECT * FROM projet_taches_standalone WHERE id = $1 AND projet_id = $2', [tid, id]);
        if (!existing) return res.status(404).json({ error: 'Tâche non trouvée' });
        await pgDb.run('DELETE FROM projet_taches_standalone WHERE id = $1', [tid]);
        res.json({ message: 'Tâche supprimée' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// ============================================
// ACQUITTER UNE TÂCHE AGRÉGÉE
// ============================================

const acquitterTacheAgregee = async (req, res) => {
    try {
        const { id, taskId } = req.params;
        const { tache, responsable, echeance, statut } = req.body;

        if (taskId.startsWith('m-')) {
            const parts = taskId.split('-');
            const reunionId = parseInt(parts[1], 10);
            const taskIndex = parseInt(parts[2], 10);

            const reunion = await pgDb.get('SELECT liste_taches FROM hub_rencontres.rencontres_reunions WHERE id = $1', [reunionId]);
            if (!reunion) return res.status(404).json({ error: 'Réunion non trouvée' });

            let tasks = [];
            try { tasks = JSON.parse(reunion.liste_taches || '[]'); } catch (e) {}
            if (taskIndex < 0 || taskIndex >= tasks.length) return res.status(404).json({ error: 'Tâche non trouvée' });

            if (tache !== undefined) tasks[taskIndex].tache = tache;
            if (responsable !== undefined) tasks[taskIndex].responsable = responsable;
            if (echeance !== undefined) tasks[taskIndex].echeance = echeance || null;
            if (statut !== undefined) tasks[taskIndex].statut = statut;

            await pgDb.run(
                'UPDATE hub_rencontres.rencontres_reunions SET liste_taches = $1 WHERE id = $2',
                [JSON.stringify(tasks), reunionId]
            );
            return res.json({ message: 'Tâche mise à jour', task: tasks[taskIndex] });
        } else if (taskId.startsWith('s-')) {
            const dbId = parseInt(taskId.substring(2), 10);
            const existing = await pgDb.get('SELECT * FROM projet_taches_standalone WHERE id = $1 AND projet_id = $2', [dbId, id]);
            if (!existing) return res.status(404).json({ error: 'Tâche non trouvée' });

            const fields = [];
            const values = [];
            let idx = 1;
            if (tache !== undefined) { fields.push('tache = $' + idx++); values.push(tache); }
            if (responsable !== undefined) { fields.push('responsable = $' + idx++); values.push(responsable); }
            if (echeance !== undefined) { fields.push('echeance = $' + idx++); values.push(echeance || null); }
            if (statut !== undefined) { fields.push('statut = $' + idx++); values.push(statut); }
            values.push(dbId);

            if (fields.length > 0) {
                await pgDb.run(
                    'UPDATE projet_taches_standalone SET ' + fields.join(', ') + ' WHERE id = $' + idx,
                    values
                );
            }
            const updated = await pgDb.get('SELECT * FROM projet_taches_standalone WHERE id = $1', [dbId]);
            return res.json({ message: 'Tâche mise à jour', task: updated });
        }

        return res.status(400).json({ error: 'Format de tâche invalide' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

const supprimerTacheAgregee = async (req, res) => {
    try {
        const { taskId } = req.params;

        if (taskId.startsWith('m-')) {
            const parts = taskId.split('-');
            const reunionId = parseInt(parts[1], 10);
            const taskIndex = parseInt(parts[2], 10);

            const reunion = await pgDb.get('SELECT liste_taches FROM hub_rencontres.rencontres_reunions WHERE id = $1', [reunionId]);
            if (!reunion) return res.status(404).json({ error: 'Réunion non trouvée' });

            let tasks = [];
            try { tasks = JSON.parse(reunion.liste_taches || '[]'); } catch (e) {}
            if (taskIndex < 0 || taskIndex >= tasks.length) return res.status(404).json({ error: 'Tâche non trouvée' });

            tasks.splice(taskIndex, 1);
            await pgDb.run(
                'UPDATE hub_rencontres.rencontres_reunions SET liste_taches = $1 WHERE id = $2',
                [JSON.stringify(tasks), reunionId]
            );
            return res.json({ message: 'Tâche supprimée de la réunion' });
        } else if (taskId.startsWith('s-')) {
            const dbId = parseInt(taskId.substring(2), 10);
            const existing = await pgDb.get('SELECT * FROM projet_taches_standalone WHERE id = $1', [dbId]);
            if (!existing) return res.status(404).json({ error: 'Tâche non trouvée' });
            await pgDb.run('DELETE FROM projet_taches_standalone WHERE id = $1', [dbId]);
            return res.json({ message: 'Tâche supprimée' });
        }
        return res.status(400).json({ error: 'Format de tâche invalide' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// ============================================
// NOTES SUR TÂCHES
// ============================================

const ajouterNoteTache = async (req, res) => {
    try {
        const { id, taskId } = req.params;
        const { content, type } = req.body;
        const username = req.user?.username || 'inconnu';

        if (!content || !content.trim()) return res.status(400).json({ error: 'Contenu obligatoire' });

        const note = { id: Date.now(), type: type || 'comment', content: content.trim(), created_at: new Date().toISOString(), created_by: username };

        if (taskId.startsWith('m-')) {
            const parts = taskId.split('-');
            const reunionId = parseInt(parts[1], 10);
            const taskIndex = parseInt(parts[2], 10);

            const reunion = await pgDb.get('SELECT liste_taches FROM hub_rencontres.rencontres_reunions WHERE id = $1', [reunionId]);
            if (!reunion) return res.status(404).json({ error: 'Réunion non trouvée' });

            let tasks = [];
            try { tasks = JSON.parse(reunion.liste_taches || '[]'); } catch (e) {}
            if (taskIndex < 0 || taskIndex >= tasks.length) return res.status(404).json({ error: 'Tâche non trouvée' });

            if (!tasks[taskIndex].notes) tasks[taskIndex].notes = [];
            tasks[taskIndex].notes.push(note);
            await pgDb.run(
                'UPDATE hub_rencontres.rencontres_reunions SET liste_taches = $1 WHERE id = $2',
                [JSON.stringify(tasks), reunionId]
            );
            return res.status(201).json(note);
        } else if (taskId.startsWith('s-')) {
            const dbId = parseInt(taskId.substring(2), 10);
            const existing = await pgDb.get('SELECT * FROM projet_taches_standalone WHERE id = $1', [dbId]);
            if (!existing) return res.status(404).json({ error: 'Tâche non trouvée' });

            let notes = [];
            try { notes = JSON.parse(existing.notes || '[]'); } catch (e) {}
            notes.push(note);
            await pgDb.run(
                'UPDATE projet_taches_standalone SET notes = $1 WHERE id = $2',
                [JSON.stringify(notes), dbId]
            );
            return res.status(201).json(note);
        }
        return res.status(400).json({ error: 'Format de tâche invalide' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

const ajouterNoteFichier = async (req, res) => {
    try {
        const { id, taskId } = req.params;
        const username = req.user?.username || 'inconnu';
        if (!req.file) return res.status(400).json({ error: 'Fichier requis' });

        const note = {
            id: Date.now(), type: 'file', content: req.file.filename,
            filename: req.file.originalname, size: req.file.size, mimetype: req.file.mimetype,
            created_at: new Date().toISOString(), created_by: username
        };

        const addNoteToArray = (notes) => { notes.push(note); return notes; };

        if (taskId.startsWith('m-')) {
            const parts = taskId.split('-');
            const reunionId = parseInt(parts[1], 10);
            const taskIndex = parseInt(parts[2], 10);
            const reunion = await pgDb.get('SELECT liste_taches FROM hub_rencontres.rencontres_reunions WHERE id = $1', [reunionId]);
            if (!reunion) return res.status(404).json({ error: 'Réunion non trouvée' });
            let tasks = [];
            try { tasks = JSON.parse(reunion.liste_taches || '[]'); } catch (e) {}
            if (taskIndex < 0 || taskIndex >= tasks.length) return res.status(404).json({ error: 'Tâche non trouvée' });
            if (!tasks[taskIndex].notes) tasks[taskIndex].notes = [];
            addNoteToArray(tasks[taskIndex].notes);
            await pgDb.run('UPDATE hub_rencontres.rencontres_reunions SET liste_taches = $1 WHERE id = $2', [JSON.stringify(tasks), reunionId]);
            return res.status(201).json(note);
        } else if (taskId.startsWith('s-')) {
            const dbId = parseInt(taskId.substring(2), 10);
            const existing = await pgDb.get('SELECT * FROM projet_taches_standalone WHERE id = $1', [dbId]);
            if (!existing) return res.status(404).json({ error: 'Tâche non trouvée' });
            let notes = [];
            try { notes = JSON.parse(existing.notes || '[]'); } catch (e) {}
            addNoteToArray(notes);
            await pgDb.run('UPDATE projet_taches_standalone SET notes = $1 WHERE id = $2', [JSON.stringify(notes), dbId]);
            return res.status(201).json(note);
        }
        return res.status(400).json({ error: 'Format de tâche invalide' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

const telechargerNoteFichier = async (req, res) => {
    try {
        const { id, taskId, noteIdx } = req.params;
        let note = null;

        if (taskId.startsWith('m-')) {
            const parts = taskId.split('-');
            const reunionId = parseInt(parts[1], 10);
            const taskIndex = parseInt(parts[2], 10);
            const reunion = await pgDb.get('SELECT liste_taches FROM hub_rencontres.rencontres_reunions WHERE id = $1', [reunionId]);
            if (!reunion) return res.status(404).json({ error: 'Réunion non trouvée' });
            let tasks = [];
            try { tasks = JSON.parse(reunion.liste_taches || '[]'); } catch (e) {}
            if (taskIndex < 0 || taskIndex >= tasks.length) return res.status(404).json({ error: 'Tâche non trouvée' });
            if (!tasks[taskIndex].notes) return res.status(404).json({ error: 'Aucune note' });
            note = tasks[taskIndex].notes[parseInt(noteIdx)];
        } else if (taskId.startsWith('s-')) {
            const dbId = parseInt(taskId.substring(2), 10);
            const existing = await pgDb.get('SELECT * FROM projet_taches_standalone WHERE id = $1', [dbId]);
            if (!existing) return res.status(404).json({ error: 'Tâche non trouvée' });
            let notes = [];
            try { notes = JSON.parse(existing.notes || '[]'); } catch (e) {}
            note = notes[parseInt(noteIdx)];
        }

        if (!note || note.type !== 'file') return res.status(404).json({ error: 'Fichier non trouvé' });
        const filePath = path.join(__dirname, '..', '..', 'file_notes_taches', note.content);
        if (!require('fs').existsSync(filePath)) return res.status(404).json({ error: 'Fichier introuvable sur le disque' });
        res.download(filePath, note.filename);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

const supprimerNoteTache = async (req, res) => {
    try {
        const { id, taskId, noteIdx } = req.params;

        if (taskId.startsWith('m-')) {
            const parts = taskId.split('-');
            const reunionId = parseInt(parts[1], 10);
            const taskIndex = parseInt(parts[2], 10);

            const reunion = await pgDb.get('SELECT liste_taches FROM hub_rencontres.rencontres_reunions WHERE id = $1', [reunionId]);
            if (!reunion) return res.status(404).json({ error: 'Réunion non trouvée' });

            let tasks = [];
            try { tasks = JSON.parse(reunion.liste_taches || '[]'); } catch (e) {}
            if (taskIndex < 0 || taskIndex >= tasks.length) return res.status(404).json({ error: 'Tâche non trouvée' });

            if (!tasks[taskIndex].notes || noteIdx < 0 || noteIdx >= tasks[taskIndex].notes.length) return res.status(404).json({ error: 'Note non trouvée' });

            tasks[taskIndex].notes.splice(noteIdx, 1);
            await pgDb.run(
                'UPDATE hub_rencontres.rencontres_reunions SET liste_taches = $1 WHERE id = $2',
                [JSON.stringify(tasks), reunionId]
            );
            return res.json({ message: 'Note supprimée' });
        } else if (taskId.startsWith('s-')) {
            const dbId = parseInt(taskId.substring(2), 10);
            const existing = await pgDb.get('SELECT * FROM projet_taches_standalone WHERE id = $1', [dbId]);
            if (!existing) return res.status(404).json({ error: 'Tâche non trouvée' });

            let notes = [];
            try { notes = JSON.parse(existing.notes || '[]'); } catch (e) {}
            if (noteIdx < 0 || noteIdx >= notes.length) return res.status(404).json({ error: 'Note non trouvée' });
            notes.splice(noteIdx, 1);
            await pgDb.run(
                'UPDATE projet_taches_standalone SET notes = $1 WHERE id = $2',
                [JSON.stringify(notes), dbId]
            );
            return res.json({ message: 'Note supprimée' });
        }
        return res.status(400).json({ error: 'Format de tâche invalide' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// ============================================
// JOURNAL
// ============================================

const getJournal = async (req, res) => {
    try {
        const { id } = req.params;
        const { type_entree, limit: limite } = req.query;

        let conditions = ['j.projet_id = $1'];
        let params = [id];
        let paramIdx = 2;

        if (type_entree) {
            conditions.push(`j.type_entree = $${paramIdx++}`);
            params.push(type_entree);
        }

        const where = 'WHERE ' + conditions.join(' AND ');
        const limit = limite ? parseInt(limite) : 100;

        const entries = await pgDb.all(`
            SELECT j.*
            FROM projet_journal j
            ${where}
            ORDER BY j.date_entree DESC
            LIMIT $${paramIdx}
        `, [...params, limit]);

        res.json(entries);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

const ajouterEntreeJournal = async (req, res) => {
    try {
        const { id } = req.params;
        const { type_entree, message, details } = req.body;
        const username = req.user.username;

        if (!type_entree || !message) {
            return res.status(400).json({ error: 'Type et message requis' });
        }

        const result = await pgDb.run(
            `INSERT INTO projet_journal (projet_id, type_entree, message, details, username) VALUES ($1, $2, $3, $4, $5)`,
            [id, type_entree, message, details ? JSON.stringify(details) : null, username]
        );

        res.status(201).json({ id: result.lastID, message: 'Entrée ajoutée au journal' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// ============================================
// INDICATEURS
// ============================================

const getIndicateurs = async (req, res) => {
    try {
        const { id } = req.params;
        const indicateurs = await pgDb.all(
            'SELECT * FROM projet_indicateurs WHERE projet_id = $1 ORDER BY date_saisie DESC',
            [id]
        );
        res.json(indicateurs);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

const ajouterIndicateur = async (req, res) => {
    try {
        const { id } = req.params;
        const { type_indicateur, valeur, commentaire } = req.body;
        const username = req.user.username;

        if (!type_indicateur || !valeur) {
            return res.status(400).json({ error: 'Type et valeur requis' });
        }

        const result = await pgDb.run(
            `INSERT INTO projet_indicateurs (projet_id, type_indicateur, valeur, saisi_par_username, commentaire) VALUES ($1, $2, $3, $4, $5)`,
            [id, type_indicateur, valeur, username, commentaire || null]
        );

        res.status(201).json({ id: result.lastID, message: 'Indicateur ajouté' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// ============================================
// STATISTIQUES PORTEFEUILLE
// ============================================

const getStats = async (req, res) => {
    try {
        const [total, parStatut, parService, parNiveau, parPriorite] = await Promise.all([
            pgDb.get('SELECT COUNT(*) as total FROM projets'),
            pgDb.all('SELECT statut, COUNT(*) as count FROM projets GROUP BY statut ORDER BY count DESC'),
            pgDb.all('SELECT service_pilote, COUNT(*) as count FROM projets GROUP BY service_pilote ORDER BY count DESC'),
            pgDb.all('SELECT niveau_projet, COUNT(*) as count FROM projets GROUP BY niveau_projet'),
            pgDb.all('SELECT priorite, COUNT(*) as count FROM projets GROUP BY priorite ORDER BY priorite DESC')
        ]);

        const scoreMoyen = await pgDb.get('SELECT AVG(score_total) as moyenne FROM projets WHERE score_total > 0');
        const alerteDocs = await pgDb.get(`
            SELECT COUNT(*) as count FROM projets WHERE id IN (
                SELECT p.id FROM projets p
                WHERE NOT EXISTS (
                    SELECT 1 FROM projet_documents d
                    JOIN projet_versions_document v ON v.document_id = d.id AND v.est_version_courante = 1
                    JOIN projet_types_documentaires t ON t.code = d.type_documentaire
                    WHERE d.projet_id = p.id AND (t.phase_concernee IS NULL OR t.phase_concernee = p.statut) AND t.obligatoire = 1
                )
            )
        `);
        const alertesRetard = await pgDb.get(`
            SELECT COUNT(*) as count FROM projets WHERE id IN (
                SELECT DISTINCT pt.projet_id FROM projet_taches pt WHERE pt.statut != 'terminee' AND pt.date_fin IS NOT NULL AND pt.date_fin <= (NOW() AT TIME ZONE 'Europe/Paris')::date
                UNION
                SELECT DISTINCT pj.projet_id FROM projet_jalons pj WHERE pj.atteint = 0 AND pj.date_jalon <= (NOW() AT TIME ZONE 'Europe/Paris')::date
            )
        `);

        res.json({
            total: total.total,
            par_statut: parStatut,
            par_service: parService,
            par_niveau: parNiveau,
            par_priorite: parPriorite,
            score_moyen: scoreMoyen ? Math.round(scoreMoyen.moyenne || 0) : 0,
            alertes_documentaires: alerteDocs.count,
            alertes_retard: alertesRetard.count
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// ============================================
// ADMIN - Scoring config
// ============================================

const getScoringConfig = async (req, res) => {
    try {
        const config = await pgDb.all('SELECT * FROM projet_scoring_config ORDER BY ordre');
        res.json(config);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

const updateScoringConfig = async (req, res) => {
    try {
        const { criteres } = req.body;
        if (!Array.isArray(criteres)) return res.status(400).json({ error: 'Liste de critères requise' });

        await pgDb.run('DELETE FROM projet_scoring_config');
        for (let i = 0; i < criteres.length; i++) {
            const c = criteres[i];
            await pgDb.run(
                'INSERT INTO projet_scoring_config (critere, label, poids, actif, ordre) VALUES ($1, $2, $3, $4, $5)',
                [c.critere, c.label, c.poids || 10, c.actif !== false ? 1 : 0, i]
            );
        }

        res.json({ message: 'Configuration scoring mise à jour' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

const getTypesDocumentaires = async (req, res) => {
    try {
        const types = await pgDb.all('SELECT * FROM projet_types_documentaires ORDER BY ordre');
        res.json(types);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

const updateTypesDocumentaires = async (req, res) => {
    try {
        const { types } = req.body;
        if (!Array.isArray(types)) return res.status(400).json({ error: 'Liste de types requise' });

        await pgDb.run('DELETE FROM projet_types_documentaires');
        for (let i = 0; i < types.length; i++) {
            const t = types[i];
            await pgDb.run(
                'INSERT INTO projet_types_documentaires (code, label, phase_concernee, obligatoire, ordre, actif) VALUES ($1, $2, $3, $4, $5, $6)',
                [t.code, t.label, t.phase_concernee || null, t.obligatoire ? 1 : 0, i, t.actif !== false ? 1 : 0]
            );
        }

        res.json({ message: 'Types documentaires mis à jour' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// ============================================
// NOTIFICATIONS (admin)
// ============================================

const getNotifications = async (req, res) => {
    try {
        const { id } = req.params;
        const notifs = await pgDb.all(
            'SELECT * FROM projet_notifications WHERE projet_id = $1 ORDER BY date_creation DESC LIMIT 100',
            [id]
        );
        res.json(notifs);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// ============================================
// PLANNING / TÂCHES
// ============================================

const getTaches = async (req, res) => {
    try {
        const { id } = req.params;
        const taches = await pgDb.all('SELECT * FROM projet_taches WHERE projet_id = $1 ORDER BY ordre, date_debut', [id]);
        res.json(taches);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

const ajouterTache = async (req, res) => {
    try {
        const { id } = req.params;
        const { titre, description, date_debut, date_fin, statut, responsable_username, couleur, groupe_id } = req.body;
        if (!titre) return res.status(400).json({ error: 'Titre requis' });
        const colonnes = ['projet_id', 'titre', 'description', 'date_debut', 'date_fin', 'statut', 'responsable_username', 'couleur'];
        const valeurs = [id, titre, description || null, date_debut || null, date_fin || null, statut || 'a_faire', responsable_username || null, couleur || '#3b82f6'];
        if (groupe_id) {
            colonnes.push('groupe_id');
            valeurs.push(groupe_id);
        }
        const placeholders = valeurs.map((_, i) => `$${i + 1}`);
        const result = await pgDb.run(
            `INSERT INTO projet_taches (${colonnes.join(', ')}) VALUES (${placeholders.join(', ')})`,
            valeurs
        );
        res.status(201).json({ id: result.lastID });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

const updateTache = async (req, res) => {
    try {
        const { id, tacheId } = req.params;
        const { titre, description, date_debut, date_fin, statut, responsable_username, couleur, ordre, groupe_id } = req.body;
        const sets = [];
        const vals = [];
        if (titre !== undefined) { sets.push(`titre = $${vals.length + 1}`); vals.push(titre); }
        if (description !== undefined) { sets.push(`description = $${vals.length + 1}`); vals.push(description); }
        if (date_debut !== undefined) { sets.push(`date_debut = $${vals.length + 1}`); vals.push(date_debut || null); }
        if (date_fin !== undefined) { sets.push(`date_fin = $${vals.length + 1}`); vals.push(date_fin || null); }
        if (statut !== undefined) { sets.push(`statut = $${vals.length + 1}`); vals.push(statut); }
        if (responsable_username !== undefined) { sets.push(`responsable_username = $${vals.length + 1}`); vals.push(responsable_username || null); }
        if (couleur !== undefined) { sets.push(`couleur = $${vals.length + 1}`); vals.push(couleur); }
        if (ordre !== undefined) { sets.push(`ordre = $${vals.length + 1}`); vals.push(ordre); }
        if (groupe_id !== undefined) { sets.push(`groupe_id = $${vals.length + 1}`); vals.push(groupe_id || null); }
        if (sets.length === 0) return res.status(400).json({ error: 'Aucun champ à mettre à jour' });
        vals.push(tacheId, id);
        await pgDb.run(
            `UPDATE projet_taches SET ${sets.join(', ')} WHERE id = $${vals.length - 1} AND projet_id = $${vals.length}`,
            vals
        );
        res.json({ message: 'Tâche mise à jour' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

const supprimerTache = async (req, res) => {
    try {
        const { id, tacheId } = req.params;
        await pgDb.run('DELETE FROM projet_taches WHERE id = $1 AND projet_id = $2', [tacheId, id]);
        res.json({ message: 'Tâche supprimée' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// ============================================
// PLANNING / JALONS
// ============================================

const getJalons = async (req, res) => {
    try {
        const { id } = req.params;
        const jalons = await pgDb.all('SELECT * FROM projet_jalons WHERE projet_id = $1 ORDER BY date_jalon', [id]);
        res.json(jalons);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

const ajouterJalon = async (req, res) => {
    try {
        const { id } = req.params;
        const { titre, description, date_jalon, type, groupe_id } = req.body;
        if (!titre || !date_jalon) return res.status(400).json({ error: 'Titre et date requis' });
        const colonnes = ['projet_id', 'titre', 'description', 'date_jalon', 'type'];
        const valeurs = [id, titre, description || null, date_jalon, type || 'jalon'];
        if (groupe_id) { colonnes.push('groupe_id'); valeurs.push(groupe_id); }
        const placeholders = valeurs.map((_, i) => `$${i + 1}`);
        const result = await pgDb.run(
            `INSERT INTO projet_jalons (${colonnes.join(', ')}) VALUES (${placeholders.join(', ')})`,
            valeurs
        );
        res.status(201).json({ id: result.lastID });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

const updateJalon = async (req, res) => {
    try {
        const { id, jalonId } = req.params;
        const { titre, description, date_jalon, type, atteint, groupe_id } = req.body;
        const sets = [];
        const vals = [];
        if (titre !== undefined) { sets.push(`titre = $${vals.length + 1}`); vals.push(titre); }
        if (description !== undefined) { sets.push(`description = $${vals.length + 1}`); vals.push(description); }
        if (date_jalon !== undefined) { sets.push(`date_jalon = $${vals.length + 1}`); vals.push(date_jalon); }
        if (type !== undefined) { sets.push(`type = $${vals.length + 1}`); vals.push(type); }
        if (atteint !== undefined) { sets.push(`atteint = $${vals.length + 1}`); vals.push(atteint); }
        if (groupe_id !== undefined) { sets.push(`groupe_id = $${vals.length + 1}`); vals.push(groupe_id || null); }
        if (sets.length === 0) return res.status(400).json({ error: 'Aucun champ à mettre à jour' });
        vals.push(jalonId, id);
        await pgDb.run(
            `UPDATE projet_jalons SET ${sets.join(', ')} WHERE id = $${vals.length - 1} AND projet_id = $${vals.length}`,
            vals
        );
        res.json({ message: 'Jalon mis à jour' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

const supprimerJalon = async (req, res) => {
    try {
        const { id, jalonId } = req.params;
        await pgDb.run('DELETE FROM projet_jalons WHERE id = $1 AND projet_id = $2', [jalonId, id]);
        res.json({ message: 'Jalon supprimé' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// ============================================
// PLANNING / GROUPES DE TÂCHES
// ============================================

const getGroupesTaches = async (req, res) => {
    try {
        const { id } = req.params;
        const groupes = await pgDb.all('SELECT * FROM projet_groupes_taches WHERE projet_id = $1 ORDER BY ordre', [id]);
        res.json(groupes);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

const ajouterGroupeTaches = async (req, res) => {
    try {
        const { id } = req.params;
        const { titre, couleur } = req.body;
        if (!titre) return res.status(400).json({ error: 'Titre requis' });
        const result = await pgDb.run(
            `INSERT INTO projet_groupes_taches (projet_id, titre, couleur) VALUES ($1, $2, $3)`,
            [id, titre, couleur || '#e2e8f0']
        );
        res.status(201).json({ id: result.lastID });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

const supprimerGroupeTaches = async (req, res) => {
    try {
        const { id, groupeId } = req.params;
        await pgDb.run('UPDATE projet_taches SET groupe_id = NULL WHERE groupe_id = $1 AND projet_id = $2', [groupeId, id]);
        await pgDb.run('DELETE FROM projet_groupes_taches WHERE id = $1 AND projet_id = $2', [groupeId, id]);
        res.json({ message: 'Groupe supprimé' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// ============================================
// FAVORIS
// ============================================

const getFavoris = async (req, res) => {
    try {
        const username = req.user.username;
        const favoris = await pgDb.all('SELECT projet_id FROM projet_favoris WHERE username = $1', [username]);
        res.json(favoris.map(f => f.projet_id));
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

const ajouterFavori = async (req, res) => {
    try {
        const { id } = req.params;
        const username = req.user.username;
        await pgDb.run('INSERT INTO projet_favoris (projet_id, username) VALUES ($1, $2) ON CONFLICT DO NOTHING', [id, username]);
        res.json({ message: 'Favori ajouté' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

const supprimerFavori = async (req, res) => {
    try {
        const { id } = req.params;
        const username = req.user.username;
        await pgDb.run('DELETE FROM projet_favoris WHERE projet_id = $1 AND username = $2', [id, username]);
        res.json({ message: 'Favori retiré' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

const ajouterFavoriBody = async (req, res) => {
    try {
        const { projet_id } = req.body;
        const username = req.user.username;
        await pgDb.run('INSERT INTO projet_favoris (projet_id, username) VALUES ($1, $2) ON CONFLICT DO NOTHING', [projet_id, username]);
        res.json({ message: 'Favori ajouté' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

const supprimerFavoriBody = async (req, res) => {
    try {
        const { projet_id } = req.body;
        const username = req.user.username;
        await pgDb.run('DELETE FROM projet_favoris WHERE projet_id = $1 AND username = $2', [projet_id, username]);
        res.json({ message: 'Favori retiré' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// ============================================
// DÉPENDANCES
// ============================================

const getDependances = async (req, res) => {
    try {
        const { id } = req.params;
        const deps = await pgDb.all('SELECT * FROM projet_dependances WHERE projet_id = $1', [id]);
        // Enrichir avec les titres
        const taches = await pgDb.all('SELECT id, titre FROM projet_taches WHERE projet_id = $1', [id]);
        const jalons = await pgDb.all('SELECT id, titre FROM projet_jalons WHERE projet_id = $1', [id]);
        const lookup = {};
        for (const t of taches) { lookup[`tache_${t.id}`] = t.titre; }
        for (const j of jalons) { lookup[`jalon_${j.id}`] = j.titre; }
        const result = deps.map(d => ({
            ...d,
            source_label: lookup[`${d.source_type}_${d.source_id}`] || '?',
            depend_label: lookup[`${d.depend_type}_${d.depend_id}`] || '?'
        }));
        res.json(result);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

const ajouterDependance = async (req, res) => {
    try {
        const { id } = req.params;
        const { source_type, source_id, depend_type, depend_id } = req.body;
        if (!source_type || !source_id || !depend_type || !depend_id) {
            return res.status(400).json({ error: 'source_type, source_id, depend_type, depend_id requis' });
        }
        if (source_type === depend_type && source_id === depend_id) {
            return res.status(400).json({ error: 'Une tâche ne peut pas dépendre d\'elle-même' });
        }
        // Vérifier que les entités existent
        if (source_type === 'tache') {
            const e = await pgDb.get('SELECT id FROM projet_taches WHERE id = $1 AND projet_id = $2', [source_id, id]);
            if (!e) return res.status(404).json({ error: 'Tâche source introuvable' });
        } else {
            const e = await pgDb.get('SELECT id FROM projet_jalons WHERE id = $1 AND projet_id = $2', [source_id, id]);
            if (!e) return res.status(404).json({ error: 'Jalon source introuvable' });
        }
        if (depend_type === 'tache') {
            const e = await pgDb.get('SELECT id FROM projet_taches WHERE id = $1 AND projet_id = $2', [depend_id, id]);
            if (!e) return res.status(404).json({ error: 'Tâche dépendance introuvable' });
        } else {
            const e = await pgDb.get('SELECT id FROM projet_jalons WHERE id = $1 AND projet_id = $2', [depend_id, id]);
            if (!e) return res.status(404).json({ error: 'Jalon dépendance introuvable' });
        }
        await pgDb.run(
            'INSERT INTO projet_dependances (projet_id, source_type, source_id, depend_type, depend_id) VALUES ($1, $2, $3, $4, $5) ON CONFLICT DO NOTHING',
            [id, source_type, source_id, depend_type, depend_id]
        );
        res.status(201).json({ message: 'Dépendance ajoutée' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

const supprimerDependance = async (req, res) => {
    try {
        const { id, depId } = req.params;
        await pgDb.run('DELETE FROM projet_dependances WHERE id = $1 AND projet_id = $2', [depId, id]);
        res.json({ message: 'Dépendance supprimée' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

const verifierDependances = async (req, res) => {
    try {
        const { id } = req.params;
        const deps = await pgDb.all('SELECT * FROM projet_dependances WHERE projet_id = $1', [id]);
        const taches = await pgDb.all('SELECT * FROM projet_taches WHERE projet_id = $1', [id]);
        const jalons = await pgDb.all('SELECT * FROM projet_jalons WHERE projet_id = $1', [id]);
        const alerts = [];

        for (const d of deps) {
            // Trouver la source (ce qui dépend)
            let source = null;
            if (d.source_type === 'tache') source = taches.find(t => t.id === d.source_id);
            else source = jalons.find(j => j.id === d.source_id);
            let depend = null;
            if (d.depend_type === 'tache') depend = taches.find(t => t.id === d.depend_id);
            else depend = jalons.find(j => j.id === d.depend_id);

            if (!source || !depend) continue;

            if (d.depend_type === 'tache' && depend.statut !== 'terminee') {
                alerts.push({
                    message: `"${source.titre || source.titre}" dépend de "${depend.titre || depend.titre}" qui n'est pas terminée`,
                    source: `${d.source_type}_${d.source_id}`,
                    severity: 'warning'
                });
                if (source.date_debut && depend.date_fin && new Date(source.date_debut) < new Date(depend.date_fin)) {
                    alerts.push({
                        message: `"${source.titre}" commence avant la fin de "${depend.titre}" (${new Date(depend.date_fin).toLocaleDateString('fr-FR')})`,
                        source: `${d.source_type}_${d.source_id}`,
                        severity: 'error'
                    });
                }
            }
            if (d.depend_type === 'jalon' && !depend.atteint) {
                alerts.push({
                    message: `"${source.titre || source.titre}" dépend du jalon "${depend.titre}" qui n'est pas atteint`,
                    source: `${d.source_type}_${d.source_id}`,
                    severity: 'warning'
                });
            }
        }
        res.json({ dependances: deps, alertes: alerts });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// ============================================
// PROJET - Attendus documentaires par projet
// ============================================

const getAttendus = async (req, res) => {
    try {
        const { id } = req.params;
        const globaux = await pgDb.all('SELECT * FROM projet_types_documentaires ORDER BY ordre');
        const projetAttendus = await pgDb.all('SELECT * FROM projet_attendus WHERE projet_id = $1', [id]);
        const result = globaux.map(g => {
            const pa = projetAttendus.find(a => a.type_code === g.code);
            return {
                ...g,
                attendu_pour_ce_projet: pa ? 1 : 0,
                obligatoire_projet: pa ? pa.obligatoire : 0,
                phase_projet: pa ? pa.phase_concernee : g.phase_concernee
            };
        });
        res.json(result);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

const setAttendus = async (req, res) => {
    try {
        const { id } = req.params;
        const { attendus } = req.body;
        if (!Array.isArray(attendus)) return res.status(400).json({ error: 'attendus requis' });
        await pgDb.run('DELETE FROM projet_attendus WHERE projet_id = $1', [id]);
        for (const a of attendus) {
            await pgDb.run(
                'INSERT INTO projet_attendus (projet_id, type_code, obligatoire, phase_concernee) VALUES ($1, $2, $3, $4)',
                [id, a.code, a.obligatoire ? 1 : 0, a.phase_concernee || null]
            );
        }
        res.json({ message: 'Attendus mis à jour' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// ============================================
// COMITÉS
// ============================================

const getComites = async (req, res) => {
    try {
        const { id } = req.params;
        const comites = await pgDb.all('SELECT * FROM projet_comites WHERE projet_id = $1 ORDER BY date_creation', [id]);
        for (const c of comites) {
            c.membres = await pgDb.all('SELECT * FROM projet_comites_membres WHERE comite_id = $1 ORDER BY nom', [c.id]);
            // Add linked meetings
            const liens = await pgDb.all('SELECT reunion_id FROM projet_reunions WHERE projet_id = $1 AND comite_id = $2', [id, c.id]);
            if (liens.length > 0) {
                const ids = liens.map(l => l.reunion_id);
                // Use hub_rencontres schema for meetings
                const placeholders = ids.map((_, i) => `$${i + 1}`).join(',');
                c.reunions = await pgDb.all(`SELECT id, titre, date_reunion FROM hub_rencontres.rencontres_reunions WHERE id IN (${placeholders}) ORDER BY date_reunion DESC`, ids);
            } else {
                c.reunions = [];
            }
        }
        res.json(comites);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

const ajouterComite = async (req, res) => {
    try {
        const { id } = req.params;
        const { nom, role, frequence, responsable_username } = req.body;
        if (!nom) return res.status(400).json({ error: 'Nom requis' });
        const result = await pgDb.run(
            'INSERT INTO projet_comites (projet_id, nom, role, frequence, responsable_username) VALUES ($1, $2, $3, $4, $5)',
            [id, nom, role || null, frequence || null, responsable_username || null]
        );
        res.status(201).json({ id: result.lastID });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

const updateComite = async (req, res) => {
    try {
        const { id, comiteId } = req.params;
        const { nom, role, frequence, responsable_username } = req.body;
        await pgDb.run(
            'UPDATE projet_comites SET nom = COALESCE($1, nom), role = COALESCE($2, role), frequence = COALESCE($3, frequence), responsable_username = COALESCE($4, responsable_username) WHERE id = $5 AND projet_id = $6',
            [nom, role, frequence, responsable_username, comiteId, id]
        );
        res.json({ message: 'Comité mis à jour' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

const supprimerComite = async (req, res) => {
    try {
        const { id, comiteId } = req.params;
        await pgDb.run('DELETE FROM projet_comites WHERE id = $1 AND projet_id = $2', [comiteId, id]);
        res.json({ message: 'Comité supprimé' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

const ajouterMembreComite = async (req, res) => {
    try {
        const { id, comiteId } = req.params;
        const { prenom, nom, email, societe, fonction, telephone, ad_username, role } = req.body;
        if (!nom) return res.status(400).json({ error: 'Nom requis' });
        const result = await pgDb.run(
            'INSERT INTO projet_comites_membres (comite_id, prenom, nom, email, societe, fonction, telephone, ad_username, role) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)',
            [comiteId, prenom || null, nom, email || null, societe || null, fonction || null, telephone || null, ad_username || null, role || null]
        );
        res.status(201).json({ id: result.lastID });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

const supprimerMembreComite = async (req, res) => {
    try {
        const { id, comiteId, membreId } = req.params;
        await pgDb.run('DELETE FROM projet_comites_membres WHERE id = $1 AND comite_id = $2', [membreId, comiteId]);
        res.json({ message: 'Membre supprimé' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// ============================================
// ÉTAPES PROJET
// ============================================

const ETAPES_PAR_DEFAUT = ['idee','demande_initiale','etude_dsi','arbitrage','planification','en_cours','en_recette','en_cloture','cloture'];

const getEtapes = async (req, res) => {
    try {
        const { id } = req.params;
        const etapes = await pgDb.all('SELECT * FROM projet_etapes WHERE projet_id = $1 ORDER BY ordre', [id]);
        if (etapes.length === 0) {
            for (let i = 0; i < ETAPES_PAR_DEFAUT.length; i++) {
                await pgDb.run(
                    'INSERT INTO projet_etapes (projet_id, etape, actif, ordre) VALUES ($1, $2, 1, $3) ON CONFLICT DO NOTHING',
                    [id, ETAPES_PAR_DEFAUT[i], i]
                );
            }
            const etapes = await pgDb.all('SELECT * FROM projet_etapes WHERE projet_id = $1 ORDER BY ordre', [id]);
            return res.json(etapes);
        }
        res.json(etapes);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

const toggleEtape = async (req, res) => {
    try {
        const { id } = req.params;
        const { etape, actif } = req.body;
        if (!etape) return res.status(400).json({ error: 'etape requis' });
        await pgDb.run(
            'INSERT INTO projet_etapes (projet_id, etape, actif, ordre) VALUES ($1, $2, $3, $4) ON CONFLICT (projet_id, etape) DO UPDATE SET actif = $3',
            [id, etape, actif ? 1 : 0, ETAPES_PAR_DEFAUT.indexOf(etape)]
        );
        res.json({ message: 'Étape mise à jour' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// ============================================
// APPLICATIONS
// ============================================

const getApplications = async (req, res) => {
    try {
        const { id } = req.params;
        const apps = await pgDb.all(
            `SELECT pa.*, ma.name as app_name, ma.url as app_url, ma.icon as app_icon
             FROM projet_applications pa
             LEFT JOIN magapp.apps ma ON ma.id = pa.app_id
             WHERE pa.projet_id = $1
             ORDER BY ma.name`,
            [id]
        );
        res.json(apps);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

const ajouterApplication = async (req, res) => {
    try {
        const { id } = req.params;
        const { app_id } = req.body;
        if (!app_id) return res.status(400).json({ error: 'app_id requis' });
        await pgDb.run(
            'INSERT INTO projet_applications (projet_id, app_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
            [id, app_id]
        );
        res.status(201).json({ message: 'Application liée' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

const supprimerApplication = async (req, res) => {
    try {
        const { id, appId } = req.params;
        await pgDb.run('DELETE FROM projet_applications WHERE projet_id = $1 AND app_id = $2', [id, appId]);
        res.json({ message: 'Application déliée' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

const searchApps = async (req, res) => {
    try {
        const q = req.query.q || '';
        if (q.length < 2) return res.json([]);
        const apps = await pgDb.all(
            'SELECT id, name, url, icon FROM magapp.apps WHERE LOWER(name) LIKE $1 ORDER BY name LIMIT 20',
            [`%${q.toLowerCase()}%`]
        );
        res.json(apps);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

module.exports = {
    setSendMail,
    getAll, getMesProjets, getById, create, update, remove,
    getTransitionsPossibles, effectuerTransition, getControles,
    ajouterRole, supprimerRole,
    ajouterVisibilite, supprimerVisibilite,
    creerDocument, updateDocumentType, supprimerDocument, uploadVersion, uploadVersionsVrac, getDocuments, getDocumentDetail, telechargerVersion, getControlesDocuments,
    enregistrerScore, getScores, getScoreCalcule,
    lierReunion, delierReunion, getReunionsLiees,
    getJournal, ajouterEntreeJournal,
    getIndicateurs, ajouterIndicateur,
    getStats,
    getScoringConfig, updateScoringConfig, getTypesDocumentaires, updateTypesDocumentaires,
    getNotifications,
    getTaches, ajouterTache, updateTache, supprimerTache,
    getJalons, ajouterJalon, updateJalon, supprimerJalon,
    getGroupesTaches, ajouterGroupeTaches, supprimerGroupeTaches,
    getFavoris, ajouterFavori, supprimerFavori, ajouterFavoriBody, supprimerFavoriBody,
    getDependances, ajouterDependance, supprimerDependance, verifierDependances,
    getAttendus, setAttendus,
    getComites, ajouterComite, updateComite, supprimerComite,
    getTachesAgregees, ajouterTacheStandalone, updateTacheStandalone, supprimerTacheStandalone, acquitterTacheAgregee, supprimerTacheAgregee, ajouterNoteTache, ajouterNoteFichier, telechargerNoteFichier, supprimerNoteTache,
    ajouterMembreComite, supprimerMembreComite,
    getEtapes, toggleEtape,
    getApplications, ajouterApplication, supprimerApplication, searchApps
};
