const fs = require('fs');
const path = require('path');
const { pgDb } = require('../../shared/database');
const { logMouchard } = require('../../shared/utils');

let sendMailFn = null;
const setSendMail = (fn) => { sendMailFn = fn; };

// ============================================
// UTILITAIRES
// ============================================

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

    const typesAttendus = await pgDb.all(
        `SELECT * FROM projet_types_documentaires WHERE (phase_concernee IS NULL OR phase_concernee = $1) AND actif = 1 ORDER BY ordre`,
        [statutCible]
    );

    const controles = [];
    for (const type of typesAttendus) {
        if (type.obligatoire === 0) continue;
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
        const { statut, service_pilote, niveau, priorite, q, tri } = req.query;
        const username = req.user.username;
        const isAdmin = req.user.role === 'admin';

        let conditions = [];
        let params = [];
        let paramIdx = 1;

        if (!isAdmin) {
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
        if (q) { conditions.push(`(p.titre ILIKE $${paramIdx} OR p.code ILIKE $${paramIdx} OR p.description ILIKE $${paramIdx})`); params.push(`%${q}%`); paramIdx++; }

        const where = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';
        const orderBy = tri === 'score' ? 'p.score_total DESC' : tri === 'priorite' ? 'p.priorite DESC' : tri === 'statut' ? 'p.statut' : 'p.date_modification DESC';

        const projets = await pgDb.all(`
            SELECT p.*,
                   (SELECT COUNT(*) FROM projet_roles pr WHERE pr.projet_id = p.id) as nb_roles,
                   (SELECT COUNT(*) FROM projet_documents pd WHERE pd.projet_id = p.id) as nb_documents,
                   (SELECT COUNT(*) FROM projet_reunions pr2 WHERE pr2.projet_id = p.id) as nb_reunions,
                   (SELECT COUNT(*) FROM projet_taches pt WHERE pt.projet_id = p.id AND pt.statut != 'terminee' AND pt.date_fin IS NOT NULL AND pt.date_fin < CURRENT_DATE) as nb_taches_en_retard,
                   (SELECT COUNT(*) FROM projet_jalons pj WHERE pj.projet_id = p.id AND pj.atteint = 0 AND pj.date_jalon < CURRENT_DATE) as nb_jalons_en_retard
            FROM projets p
            ${where}
            ORDER BY ${orderBy}
        `, params);

        res.json(projets);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

const getMesProjets = async (req, res) => {
    try {
        const username = req.user.username;
        const projets = await pgDb.all(`
            SELECT p.*,
                   (SELECT COUNT(*) FROM projet_roles pr WHERE pr.projet_id = p.id) as nb_roles,
                   (SELECT COUNT(*) FROM projet_documents pd WHERE pd.projet_id = p.id) as nb_documents,
                   (SELECT COUNT(*) FROM projet_reunions pr2 WHERE pr2.projet_id = p.id) as nb_reunions
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
        `, [username]);
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

        res.json({ ...projet, services, roles, visibilite, documents });
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
            equipe, parties_prenantes, pour_info
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
                created_by_username, modified_by_username)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $15)
        `, [code, titre, description || '', niveau_projet || 'standard', service_pilote,
            commanditaire_username || null, chef_projet_username || null, responsable_dsi_username || null,
            representant_metier_username || null, dpo_username || null,
            date_debut_prevue || null, date_fin_prevue || null, priorite || 0,
            meteo || 'neutre',
            username]);

        const projetId = result.lastID;

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
                modified_by_username = $23,
                date_modification = CURRENT_TIMESTAMP
            WHERE id = $24
        `, [titre, description, niveau_projet, statut, service_pilote,
            commanditaire_username, chef_projet_username, responsable_dsi_username,
            representant_metier_username, dpo_username,
            date_debut_prevue, date_fin_prevue, date_debut_reelle, date_fin_reelle,
            priorite, risque_global, avancement, satisfaction_metier,
            benefices_attendus, benefices_realises, notes_internes,
            meteo,
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
        const projet = await pgDb.get('SELECT * FROM projets WHERE id = $1', [id]);
        if (!projet) return res.status(404).json({ error: 'Projet non trouvé' });

        await pgDb.run('DELETE FROM projet_notifications WHERE projet_id = $1', [id]);
        await pgDb.run('DELETE FROM projet_journal WHERE projet_id = $1', [id]);
        await pgDb.run('DELETE FROM projet_reunions WHERE projet_id = $1', [id]);
        await pgDb.run('DELETE FROM projet_indicateurs WHERE projet_id = $1', [id]);

        const docs = await pgDb.all('SELECT id FROM projet_documents WHERE projet_id = $1', [id]);
        for (const doc of docs) {
            await pgDb.run('DELETE FROM projet_versions_document WHERE document_id = $1', [doc.id]);
        }
        await pgDb.run('DELETE FROM projet_documents WHERE projet_id = $1', [id]);

        await pgDb.run('DELETE FROM projet_scores WHERE projet_id = $1', [id]);
        await pgDb.run('DELETE FROM projet_transitions WHERE projet_id = $1', [id]);
        await pgDb.run('DELETE FROM projet_visibilite WHERE projet_id = $1', [id]);
        await pgDb.run('DELETE FROM projet_roles WHERE projet_id = $1', [id]);
        await pgDb.run('DELETE FROM projet_services WHERE projet_id = $1', [id]);
        await pgDb.run('DELETE FROM projets WHERE id = $1', [id]);

        res.json({ message: `Projet ${projet.code} supprimé` });
    } catch (error) {
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

        const statutsSuivants = getStatutsSuivants(projet.statut);
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
        const { type_documentaire, phase_concernee, description, est_attendu } = req.body;
        const username = req.user.username;

        const result = await pgDb.run(
            `INSERT INTO projet_documents (projet_id, type_documentaire, phase_concernee, description, est_attendu, created_by_username) VALUES ($1, $2, $3, $4, $5, $6)`,
            [id, type_documentaire, phase_concernee || null, description || null, est_attendu ? 1 : 0, username]
        );

        res.status(201).json({ id: result.lastID, message: 'Document créé' });
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
        const { reunion_id, type_gouvernance } = req.body;
        const username = req.user.username;

        if (!reunion_id) return res.status(400).json({ error: 'reunion_id requis' });

        await pgDb.run(
            `INSERT INTO projet_reunions (projet_id, reunion_id, type_gouvernance) VALUES ($1, $2, $3) ON CONFLICT (projet_id, reunion_id) DO NOTHING`,
            [id, reunion_id, type_gouvernance || null]
        );

        const projet = await pgDb.get('SELECT code FROM projets WHERE id = $1', [id]);
        await ajouterJournal(id, 'reunion_liee', `Réunion #${reunion_id} liée au projet`, { reunion_id, type_gouvernance }, username);

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

        const result = reunions.map(r => {
            const lien = liens.find(l => l.reunion_id === r.id);
            return { ...r, type_gouvernance: lien ? lien.type_gouvernance : null, lien_id: lien ? lien.id : null };
        });

        res.json(result);
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
                SELECT DISTINCT pt.projet_id FROM projet_taches pt WHERE pt.statut != 'terminee' AND pt.date_fin IS NOT NULL AND pt.date_fin < CURRENT_DATE
                UNION
                SELECT DISTINCT pj.projet_id FROM projet_jalons pj WHERE pj.atteint = 0 AND pj.date_jalon < CURRENT_DATE
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
        const result = await pgDb.run(
            `INSERT INTO projet_taches (projet_id, titre, description, date_debut, date_fin, statut, responsable_username, couleur, groupe_id) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
            [id, titre, description || null, date_debut || null, date_fin || null, statut || 'a_faire', responsable_username || null, couleur || '#3b82f6', groupe_id || null]
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
        await pgDb.run(
            `UPDATE projet_taches SET titre = COALESCE($1, titre), description = COALESCE($2, description), date_debut = COALESCE($3, date_debut), date_fin = COALESCE($4, date_fin), statut = COALESCE($5, statut), responsable_username = COALESCE($6, responsable_username), couleur = COALESCE($7, couleur), ordre = COALESCE($8, ordre), groupe_id = COALESCE($9, groupe_id) WHERE id = $10 AND projet_id = $11`,
            [titre, description, date_debut, date_fin, statut, responsable_username, couleur, ordre, groupe_id, tacheId, id]
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
        const { titre, description, date_jalon, type } = req.body;
        if (!titre || !date_jalon) return res.status(400).json({ error: 'Titre et date requis' });
        const result = await pgDb.run(
            `INSERT INTO projet_jalons (projet_id, titre, description, date_jalon, type) VALUES ($1, $2, $3, $4, $5)`,
            [id, titre, description || null, date_jalon, type || 'jalon']
        );
        res.status(201).json({ id: result.lastID });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

const updateJalon = async (req, res) => {
    try {
        const { id, jalonId } = req.params;
        const { titre, description, date_jalon, type, atteint } = req.body;
        await pgDb.run(
            `UPDATE projet_jalons SET titre = COALESCE($1, titre), description = COALESCE($2, description), date_jalon = COALESCE($3, date_jalon), type = COALESCE($4, type), atteint = COALESCE($5, atteint) WHERE id = $6 AND projet_id = $7`,
            [titre, description, date_jalon, type, atteint, jalonId, id]
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

module.exports = {
    setSendMail,
    getAll, getMesProjets, getById, create, update, remove,
    getTransitionsPossibles, effectuerTransition, getControles,
    ajouterRole, supprimerRole,
    ajouterVisibilite, supprimerVisibilite,
    creerDocument, uploadVersion, getDocuments, getDocumentDetail, telechargerVersion, getControlesDocuments,
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
    getDependances, ajouterDependance, supprimerDependance, verifierDependances
};
