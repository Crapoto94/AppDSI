/**
 * Dépose sur le stockage configuré (partage SMB/UNC) les fichiers de certificats
 * référencés en base mais absents du partage.
 *
 * Contexte : la colonne `hub.certificates.file_path` pointe déjà vers le nouveau
 * stockage (`storage/certificats/<id>/<fichier>`), mais les fichiers physiques se
 * trouvaient encore dans `backend/file_certif`. Ce script COPIE chaque fichier
 * vers le partage, à l'emplacement EXACT attendu par la base.
 *
 * Correspondance source -> destination :
 *   - destination = chemin de la BD : storage/certificats/<id>/<basename BD>
 *   - source      = fichier de file_certif ayant le même NOM D'ORIGINE, c.-à-d.
 *                   le segment qui suit le préfixe "<horodatage>-<aléa>-".
 *     (le préfixe horodaté diffère entre la génération BD et file_certif, mais le
 *      nom d'origine — ex. "documents3.pdf", "5.pdf" — est identique).
 *
 * Propriétés :
 *   - NON destructif : aucun fichier de file_certif n'est supprimé ;
 *   - n'écrit RIEN en base : les chemins BD sont déjà corrects ;
 *   - idempotent : un fichier déjà présent sur le partage est ignoré ;
 *   - sûr par défaut : simulation (dry-run) sauf si on passe --apply.
 *
 * Usage (depuis backend/) :
 *   node scripts/migrate_certificates_to_storage.js            # simulation
 *   node scripts/migrate_certificates_to_storage.js --apply    # exécution réelle
 *
 * En mode SMB applicatif (config avec identifiants), ajouter le flag :
 *   NODE_OPTIONS="--openssl-legacy-provider" node scripts/... --apply
 */
const fs = require('fs');
const path = require('path');

const db = require('../shared/database');
const storage = require('../shared/storage');
const smb = require('../shared/smb_client');

const APPLY = process.argv.includes('--apply');
const BACKEND_ROOT = path.join(__dirname, '..');
const CERTIF_DIR = path.join(BACKEND_ROOT, 'file_certif');

/** Retire le préfixe "<chiffres>-<chiffres>-" pour obtenir le nom d'origine. */
function origBase(name) {
    return String(name).replace(/^\d+-\d+-/, '');
}

(async () => {
    await db.setupDb(); // initialise SQLite -> getStorageConfig() opérationnel
    const { pgDb } = db;

    const config = await storage.getStorageConfig();
    const smbMode = storage.isSmbConfig(config);
    const root = smbMode ? null : storage.resolveRoot(config);
    const target = smbMode ? `SMB ${config.root_path}` : root;

    console.log('\n=== Dépôt des fichiers certificats sur le stockage ===');
    console.log('Destination :', target);
    console.log('Mode        :', smbMode ? 'SMB (lib smb2)' : 'filesystem (UNC/local via OS)');
    console.log('Exécution   :', APPLY ? 'RÉELLE (--apply)' : 'SIMULATION (dry-run)');
    console.log('');

    // Index des fichiers source par nom d'origine.
    const index = new Map();
    for (const f of fs.readdirSync(CERTIF_DIR)) {
        const ob = origBase(f);
        if (!index.has(ob)) index.set(ob, []);
        index.get(ob).push(f);
    }

    const certs = await pgDb.all(
        "SELECT id, order_number, file_path FROM hub.certificates WHERE file_path IS NOT NULL AND file_path <> '' ORDER BY id"
    );

    const report = { total: certs.length, present: 0, copied: 0, unmatched: 0, ambiguous: 0, errors: 0, skippedNonStorage: 0 };

    for (const cert of certs) {
        const fp = String(cert.file_path).replace(/\\/g, '/');
        if (!fp.startsWith(storage.STORAGE_PREFIX + '/')) { report.skippedNonStorage++; continue; }

        const rel = storage.STORAGE_PREFIX + '/' === fp ? '' : fp.slice(storage.STORAGE_PREFIX.length + 1);
        const relPath = rel; // certificats/<id>/<basename BD>
        const dbBase = path.basename(relPath);
        const ob = origBase(dbBase);

        // Déjà présent sur le partage ?
        let already = false;
        try {
            if (smbMode) {
                already = (await smb.readFileRel(config, relPath)) !== null;
            } else {
                already = fs.existsSync(path.join(root, relPath));
            }
        } catch (e) { already = false; }
        if (already) { report.present++; continue; }

        // Recherche de la source par nom d'origine.
        const matches = index.get(ob) || [];
        if (matches.length === 0) {
            report.unmatched++;
            console.log(`[ABSENT SOURCE] cert ${cert.id} (${cert.order_number}) : aucun fichier file_certif pour "${ob}"`);
            continue;
        }
        if (matches.length > 1) {
            report.ambiguous++;
            console.log(`[AMBIGU]        cert ${cert.id} (${cert.order_number}) : "${ob}" -> ${matches.join(', ')}`);
            continue;
        }

        const srcFile = matches[0];
        console.log(`[COPIE]         cert ${cert.id} (${cert.order_number}) : file_certif/${srcFile} -> ${fp}`);
        if (!APPLY) { report.copied++; continue; }

        try {
            const buffer = fs.readFileSync(path.join(CERTIF_DIR, srcFile));
            if (smbMode) {
                await smb.writeFileRel(config, relPath, buffer);
            } else {
                const dest = path.join(root, relPath);
                fs.mkdirSync(path.dirname(dest), { recursive: true });
                fs.writeFileSync(dest, buffer);
            }
            report.copied++;
        } catch (e) {
            report.errors++;
            console.log(`[ERREUR]        cert ${cert.id} : ${e.code || e.message}`);
        }
    }

    console.log('\n=== Bilan ===');
    console.log('Certificats avec fichier       :', report.total);
    console.log('Déjà présents sur le partage   :', report.present);
    console.log(APPLY ? 'Copiés                         :' : 'À copier                       :', report.copied);
    console.log('Source introuvable             :', report.unmatched);
    console.log('Sources ambiguës (>1 candidat) :', report.ambiguous);
    console.log('file_path non-storage (ignorés):', report.skippedNonStorage);
    console.log('Erreurs                        :', report.errors);
    if (!APPLY) console.log('\n(simulation : relancer avec --apply pour exécuter)');

    process.exit(0);
})().catch(e => { console.error('FATAL', e && (e.stack || e.message || e)); process.exit(1); });
