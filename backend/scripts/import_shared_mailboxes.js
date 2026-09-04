/**
 * Import : boîtes partagées Exchange (export "SharedMailbox-2026.xlsx",
 * 2 colonnes seulement : "User Principal Name" et "Display Name") → module
 * DSI Hub /boites-partagees (hub.shared_mailboxes). Contrairement à
 * import_exchange_groups.js (listes de distribution/sécurité), ce fichier ne
 * contient QUE des boîtes partagées — type fixé à "Boîte partagée" pour
 * toutes les lignes ; pas de Description ni de Date de création dans cet
 * export, ces deux champs restent donc vides pour les fiches créées ici.
 *
 * Mise en correspondance par adresse mail (insensible à la casse) avec une
 * fiche hub.shared_mailboxes déjà existante :
 *   - déjà existante → ignorée (aucune info nouvelle exploitable dans ce
 *     fichier ; on ne touche JAMAIS une fiche existante, cf. politique
 *     déjà appliquée dans import_exchange_groups.js pour ne pas écraser une
 *     édition manuelle — membres, justification, etc.)
 *   - nouvelle → création complète (nom = Display Name, email = UPN, type =
 *     "Boîte partagée", membres résolus en direct dans l'AD on-prem via
 *     l'attribut msExchDelegateListLink — délégués Accès total —,
 *     arbitrage_decision laissé NULL, requested_by = 'import_exchange').
 *
 * Usage :
 *   node scripts/import_shared_mailboxes.js --file="C:/chemin/SharedMailbox-2026.xlsx"            # dry-run
 *   node scripts/import_shared_mailboxes.js --file="C:/chemin/SharedMailbox-2026.xlsx" --execute   # écriture réelle + résolution AD
 */

const path = require('path');
const XLSX = require('xlsx');
const { pgDb } = require('../shared/database');
const setupSqlite = require('../shared/sqlite_db');
const { searchADRecipientMembers } = require('../shared/ad_helper');
const service = require('../modules/mailboxes/mailboxes.service');

const isExecute = process.argv.includes('--execute');
const fileArg = process.argv.find((a) => a.startsWith('--file='));
const filePath = fileArg ? fileArg.slice('--file='.length) : null;

const IMPORT_USER = { username: 'import_exchange', displayName: 'Import Exchange (script)' };

function readRows(xlsxPath) {
    const wb = XLSX.readFile(xlsxPath);
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: '' });
    const header = rows[0];
    const idx = { email: header.indexOf('User Principal Name'), nom: header.indexOf('Display Name') };
    for (const [key, i] of Object.entries(idx)) {
        if (i === -1) throw new Error(`Colonne introuvable dans le fichier : ${key}`);
    }
    const out = [];
    for (let r = 1; r < rows.length; r++) {
        const row = rows[r];
        if (!row || !row.some((c) => String(c).trim() !== '')) continue;
        const email = (row[idx.email] || '').trim();
        if (!email) continue;
        out.push({ email, nom: (row[idx.nom] || '').trim() || email });
    }
    return out;
}

async function main() {
    if (!filePath) {
        console.error('Usage: node scripts/import_shared_mailboxes.js --file="<chemin.xlsx>" [--execute]');
        process.exit(1);
    }
    console.log(isExecute ? '=== MODE EXÉCUTION (écriture réelle) ===' : '=== MODE DRY-RUN (lecture seule) — relancer avec --execute pour écrire ===');

    const rows = readRows(path.resolve(filePath));
    console.log(`Boîtes partagées lues dans le fichier : ${rows.length}`);

    let adSettings = null;
    if (isExecute) {
        const db = await setupSqlite();
        adSettings = await db.get('SELECT * FROM ad_settings WHERE id = 1');
        if (!adSettings || !adSettings.is_enabled || !adSettings.host) {
            console.warn('⚠️  Annuaire AD non configuré/désactivé — les nouvelles fiches seront créées SANS membres.');
            adSettings = null;
        }
    }

    let inserted = 0, skippedExisting = 0, adFailures = 0;
    const skipLog = [];

    for (const row of rows) {
        const existing = await pgDb.get('SELECT id, nom FROM hub.shared_mailboxes WHERE LOWER(email) = LOWER(?)', [row.email]);
        if (existing) {
            skippedExisting++;
            skipLog.push(`  SKIP #${existing.id} ${row.email} (déjà existante : "${existing.nom}")`);
            continue;
        }

        let membres = [];
        if (isExecute && adSettings) {
            try {
                const adResult = await searchADRecipientMembers(row.email, adSettings);
                if (adResult.found) {
                    membres = adResult.members.map((m) => ({ displayName: m.displayName, email: m.email }));
                } else {
                    adFailures++;
                    console.warn(`⚠️  ${row.email} : introuvable dans l'AD (${adResult.error || 'objet absent'}) — créée sans membres.`);
                }
            } catch (e) {
                adFailures++;
                console.warn(`⚠️  ${row.email} : échec lecture AD (${e.message}) — créée sans membres.`);
            }
        }

        if (isExecute) {
            await service.createManual({ nom: row.nom, email: row.email, type: 'Boîte partagée', membres }, IMPORT_USER);
            console.log(`  INSERT ${row.email} — ${membres.length} membre(s) AD`);
        }
        inserted++;
    }

    console.log('\n--- Résumé ---');
    console.log(`Fiches déjà existantes ignorées : ${skippedExisting}`);
    if (!isExecute) skipLog.forEach((l) => console.log(l));
    console.log(`Nouvelles fiches ${isExecute ? 'créées' : 'à créer'} : ${inserted}`);
    if (isExecute) console.log(`Échecs de résolution AD (fiche créée sans membres) : ${adFailures}`);
    if (!isExecute) console.log('\nDry-run terminé — relancer avec --execute pour écrire en base et résoudre les membres AD.');

    process.exit(0);
}

main().catch((e) => { console.error('Erreur fatale:', e); process.exit(1); });
