/**
 * Rapprochement ponctuel entre le dossier partagé
 * X:\DSI\ADMINISTRATIF\MARCHES ET CONTRATS\CONTRATS\LOGICIELS et les contrats déjà enregistrés
 * dans hub_contrats.contrats (DSIHUB) : crée les contrats manquants (identifiés manuellement à
 * partir du contenu du dossier — cf. rapport envoyé par mail) et attache leur document source
 * en GED (dual-write hub_docs, comme addDocument).
 *
 * Usage : node scripts/rapprochement_contrats_logiciels.js [--dry-run]
 */
const path = require('path');
const fs = require('fs');
const db = require('../shared/database');
const storage = require('../shared/storage');

const dryRun = process.argv.includes('--dry-run');
const MODULE = 'contrats';
const BASE = 'X:\\DSI\\ADMINISTRATIF\\MARCHES ET CONTRATS\\CONTRATS\\LOGICIELS';

// Contrats identifiés dans le dossier partagé et absents de DSIHUB (cf. analyse manuelle du
// rapprochement nom de dossier / raison_sociale+objet déjà en base). Un commentaire signale
// les cas où une donnée (date, statut) n'a pas pu être établie avec certitude à partir du seul
// nom de fichier, pour vérification humaine ultérieure.
const CANDIDATES = [
    {
        objet: 'ADELYCE / Atelier salarial prémium',
        raison_sociale: 'ADELYCE',
        svc: 'BF8',
        type_contrat: 'Maintenance',
        date_debut: '2024-03-22',
        date_fin: '2027-03-21',
        statut: 'actif',
        file: 'ADELYCE - Contrat Atelier salarial prémium du 22032024 au 21032027.pdf',
        commentaire: "Ajouté automatiquement depuis le dossier partagé X:\\...\\CONTRATS\\LOGICIELS (rapprochement du 2026-09-14). Distinct des contrats ADELYCE déjà suivis (CCAS, Mon Observatoire, Ville).",
    },
    {
        objet: 'Cindoc',
        raison_sociale: 'CINCOM DSS',
        svc: 'BF8',
        type_contrat: 'Maintenance',
        date_debut: '2022-01-01',
        date_fin: '2025-12-31',
        statut: 'actif',
        file: path.join('CINCOM DSS - Cindoc', 'CINCOM DSS - Logiciel Cindoc contrat tacite 22-09623-MCINDOC du 01012022 au 31122025.pdf'),
        commentaire: "Ajouté automatiquement depuis le dossier partagé (rapprochement du 2026-09-14). Contrat à tacite reconduction — date de fin à reconfirmer.",
    },
    {
        objet: 'G-DOC',
        raison_sociale: 'ELECTROCLASS',
        svc: 'BF8',
        type_contrat: 'Maintenance',
        date_debut: '2023-01-01',
        date_fin: '2023-12-31',
        statut: 'actif',
        file: path.join('ELECTROCLASS - GDOC', 'ELECTROCLASS - Contrat CM20221128 logiciel G-DOC du 01012023 au 31122023.pdf'),
        commentaire: "Ajouté automatiquement depuis le dossier partagé (rapprochement du 2026-09-14). Seul document au dossier daté 2023 — statut/renouvellement à vérifier auprès du service.",
    },
    {
        objet: 'AS Abonnement / AS Sécurité',
        raison_sociale: 'ELP',
        svc: 'BF8',
        type_contrat: 'Maintenance',
        date_debut: '2022-01-01',
        date_fin: '2025-12-31',
        statut: 'actif',
        file: path.join('ELP - AS Abonnement', 'ELP - Logiciel AS Abonnement et AS Sécurité contrat 22010004 du 01012022 au 31122025.pdf'),
        commentaire: "Ajouté automatiquement depuis le dossier partagé (rapprochement du 2026-09-14).",
    },
    {
        objet: 'Xthèque',
        raison_sociale: 'ELP',
        svc: 'BF8',
        type_contrat: 'Maintenance',
        date_debut: '2022-01-01',
        date_fin: '2025-12-31',
        statut: 'actif',
        file: path.join('ELP - Xthèque', 'ELP - Logiciel Xthèques contrat 22010005 du 01012022 au 31122025.pdf'),
        commentaire: "Ajouté automatiquement depuis le dossier partagé (rapprochement du 2026-09-14).",
    },
    {
        objet: 'eSirius',
        raison_sociale: 'ESII',
        svc: 'BF8',
        type_contrat: 'Maintenance',
        date_debut: '2020-01-01',
        date_fin: '2022-12-31',
        statut: 'archivé',
        file: path.join('ESII - eSirius', 'ESII - Logiciel eSirius Contrat 0MAI9411-CRE42 du 01012020 au 31122022.pdf'),
        commentaire: "Ajouté automatiquement depuis le dossier partagé (rapprochement du 2026-09-14). Aucun document plus récent trouvé (dossier 'Anciens' non dépouillé) — marqué archivé par prudence, à confirmer si le contrat a été renouvelé ou résilié.",
    },
    {
        objet: 'SIRIUS + module ORION (Le Hangar)',
        raison_sociale: 'FORUM SIRIUS',
        svc: 'BF8',
        type_contrat: 'Maintenance',
        date_debut: '2024-01-01',
        date_fin: '2027-12-31',
        statut: 'actif',
        file: path.join('FORUM SIRIUS - SIRIUS', 'FORUM SIRIUS - contrat logiciel SIRIUS et module ORION au Hangar du 01012024 au 31122027.pdf'),
        commentaire: "Ajouté automatiquement depuis le dossier partagé (rapprochement du 2026-09-14).",
    },
    {
        objet: 'Sphinx IQ2',
        raison_sociale: 'LE SPHINX',
        svc: 'BF8',
        type_contrat: 'Maintenance',
        date_debut: null,
        date_fin: null,
        statut: 'archivé',
        file: path.join('LE SPHINX - Sphinx IQ2', 'LE SPHINX - Logiciel Sphinx iQ2 pour 2021.pdf'),
        commentaire: "Ajouté automatiquement depuis le dossier partagé (rapprochement du 2026-09-14). Dernier document au dossier daté 2021 (renouvellements annuels visibles de 2018 à 2021, rien au-delà) — dates non fiables, marqué archivé par prudence, à vérifier si le logiciel est toujours utilisé.",
    },
    {
        objet: 'Caisse billetterie Luxy',
        raison_sociale: 'MONNAIE SERVICES',
        svc: 'BF8',
        type_contrat: 'Maintenance',
        date_debut: '2023-09-08',
        date_fin: '2027-09-07',
        statut: 'actif',
        file: path.join('MONNAIE SERVICES  Caisse du Luxy', 'MONNAIE SERVICES - Maintenances logiciels billetterie et autres software du 08092023 au 07092027.pdf'),
        commentaire: "Ajouté automatiquement depuis le dossier partagé (rapprochement du 2026-09-14). Distinct du contrat 'LOGICIEL CAISSE CINEMA' (même fournisseur, autre site/périmètre : Luxy vs cinéma).",
    },
    {
        objet: 'ORTIF',
        raison_sociale: 'NEHS',
        svc: 'BF8',
        type_contrat: 'Maintenance',
        date_debut: null,
        date_fin: null,
        statut: 'actif',
        file: path.join('NEHS - ORTIF', 'CONTRAT ORTIF 230319.pdf'),
        commentaire: "Ajouté automatiquement depuis le dossier partagé (rapprochement du 2026-09-14). Dates de début/fin non identifiables avec certitude depuis le seul nom de fichier (référence possible : 19/03/2023) — à compléter après lecture du contrat.",
    },
    {
        objet: 'Ophtix',
        raison_sociale: 'OPHTEL',
        svc: 'BF8',
        type_contrat: 'Maintenance',
        date_debut: '2022-01-01',
        date_fin: '2025-12-31',
        statut: 'actif',
        file: path.join('OPHTEL - Ophtix', 'OPHTEL - Logiciel Ophtix du 01012022 au 31122025.pdf'),
        commentaire: "Ajouté automatiquement depuis le dossier partagé (rapprochement du 2026-09-14).",
    },
];

(async () => {
    await db.setupDb();
    const { pgDb } = db;

    console.log(`${CANDIDATES.length} contrat(s) candidat(s) à créer${dryRun ? ' — DRY RUN, aucune écriture' : ''}.\n`);

    const results = [];
    for (const c of CANDIDATES) {
        const label = `${c.objet} (${c.raison_sociale})`;
        try {
            const srcPath = path.join(BASE, c.file);
            if (!fs.existsSync(srcPath)) {
                throw new Error(`Fichier source introuvable : ${srcPath}`);
            }

            // Garde-fou anti-doublon : un contrat de même objet+raison_sociale n'est pas recréé
            // si ce script est relancé après un premier passage partiel.
            const existing = await pgDb.get(
                'SELECT id FROM hub_contrats.contrats WHERE objet = ? AND raison_sociale = ?',
                [c.objet, c.raison_sociale]
            );
            if (existing) {
                console.log(`${label} : déjà présent (#${existing.id}) — sauté.`);
                results.push({ ...c, status: 'skipped', contratId: existing.id });
                continue;
            }

            if (dryRun) {
                console.log(`${label} : ${srcPath} — dry-run, rien créé.`);
                results.push({ ...c, status: 'dry-run' });
                continue;
            }

            const insertRes = await pgDb.run(
                `INSERT INTO hub_contrats.contrats (
                    svc, objet, raison_sociale, type_contrat, type_bien, date_debut, date_fin,
                    statut, commentaires
                ) VALUES (?,?,?,?,?,?,?,?,?)`,
                [c.svc, c.objet, c.raison_sociale, c.type_contrat, 'logiciel', c.date_debut, c.date_fin, c.statut, c.commentaire]
            );
            const contratId = insertRes.lastID;

            const buffer = fs.readFileSync(srcPath);
            const originalname = path.basename(c.file);
            const saved = await storage.saveFile(MODULE, contratId, { buffer, originalname });
            await pgDb.run(
                'INSERT INTO hub_contrats.contrat_documents (contrat_id, file_path, file_name, nature, est_principal) VALUES (?,?,?,?,1)',
                [contratId, saved.dbPath, saved.filename, 'Contrat']
            );
            await pgDb.run('UPDATE hub_contrats.contrats SET doc_principal_path = ?, doc_principal_nom = ? WHERE id = ?', [saved.dbPath, originalname, contratId]);
            try {
                const docsService = require('../shared/documents.service');
                await docsService.registerExternalUpload({
                    module: MODULE, entityType: 'attachment', entityId: contratId,
                    title: 'Contrat', filename: saved.filename, originalName: originalname,
                    mimetype: 'application/pdf', size: buffer.length, storageRef: saved.dbPath,
                    metadata: { nature: 'Contrat', est_principal: true, source: 'rapprochement_contrats_logiciels' },
                    uploadedBy: null,
                });
            } catch (e) { console.warn(`  [DOCS] enregistrement hub_docs échoué (document quand même créé) :`, e.message); }

            console.log(`${label} : créé #${contratId} + document attaché.`);
            results.push({ ...c, status: 'created', contratId });
        } catch (error) {
            console.error(`${label} : ÉCHEC — ${error.message}`);
            results.push({ ...c, status: 'error', error: error.message });
        }
    }

    console.log('\n================ RÉSUMÉ ================');
    const created = results.filter(r => r.status === 'created').length;
    const skipped = results.filter(r => r.status === 'skipped').length;
    const failed = results.filter(r => r.status === 'error').length;
    console.log(`Créés: ${created}   Déjà présents: ${skipped}   Échecs: ${failed}`);

    fs.writeFileSync(path.join(__dirname, '..', 'logs', 'rapprochement_contrats_logiciels_result.json'), JSON.stringify(results, null, 2), 'utf8');
    console.log('Résultat détaillé : backend/logs/rapprochement_contrats_logiciels_result.json');

    process.exit(failed > 0 ? 1 : 0);
})().catch(e => { console.error('FATAL', e && (e.stack || e.message || e)); process.exit(1); });
