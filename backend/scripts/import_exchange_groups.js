/**
 * Import : groupes Exchange (export "GroupesExchange.xlsx", colonnes standard
 * du rapport Exchange Online : "Nom du groupe", "Adresse e-mail principale du
 * groupe", "Description", "Type de groupe", "Date de création") → module
 * DSI Hub /boites-partagees (hub.shared_mailboxes).
 *
 * Ne retient QUE deux "Type de groupe" Exchange (les autres — Microsoft 365,
 * groupes Yammer, etc. — sont hors périmètre du module) :
 *   "Liste de distribution"           → type = "Liste de diffusion"
 *   "Sécurité à extension messagerie" → type = "Liste sécurité" (nouveau)
 *
 * Pour chaque ligne, mise en correspondance par adresse mail (insensible à
 * la casse) avec une fiche hub.shared_mailboxes déjà existante :
 *   - déjà existante → met seulement à jour `type` et `date_creation` (les
 *     deux seules infos objectivement "de source Exchange" ; on ne touche
 *     JAMAIS nom/justification/membres/responsable/arbitrage sur une fiche
 *     existante, pour ne pas écraser une édition manuelle : vérifié sur le
 *     jeu réel, ex. "Directeurs.trices" à la place du nom technique
 *     "DIRECTIONS", justification manuscrite non vide côté DSI Hub).
 *   - nouvelle → création complète (nom, email, type, justification =
 *     Description Exchange, date_creation), avec :
 *       - membres résolus en direct dans l'AD on-prem (searchADRecipientMembers
 *         — délégués Accès total pour une boîte partagée, membres de groupe
 *         pour une liste), best-effort (liste vide + avertissement si
 *         l'objet n'est plus dans l'AD ou si la lecture échoue) ;
 *       - arbitrage_decision laissé NULL ("En attente") — décision produit :
 *         ces listes n'ont jamais été soumises à un arbitrage réel, donc pas
 *         de statut "Favorable" fictif ;
 *       - requested_by_username/name = 'import_exchange' / "Import Exchange
 *         (script)" pour tracer l'origine dans l'UI ("Demandée par …").
 *
 * Usage :
 *   node scripts/import_exchange_groups.js --file="C:/chemin/GroupesExchange.xlsx"            # dry-run (lecture seule, pas d'appel AD)
 *   node scripts/import_exchange_groups.js --file="C:/chemin/GroupesExchange.xlsx" --execute   # écriture réelle + résolution AD des membres
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

const TYPE_MAP = {
    'Liste de distribution': 'Liste de diffusion',
    'Sécurité à extension messagerie': 'Liste sécurité',
};
const IMPORT_USER = { username: 'import_exchange', displayName: 'Import Exchange (script)' };

function readTargetRows(xlsxPath) {
    const wb = XLSX.readFile(xlsxPath);
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: '' });
    const header = rows[0];
    const idx = {
        nom: header.indexOf('Nom du groupe'),
        email: header.indexOf('Adresse e-mail principale du groupe'),
        description: header.indexOf('Description'),
        type: header.indexOf('Type de groupe'),
        dateCreation: header.indexOf('Date de création'),
    };
    for (const [key, i] of Object.entries(idx)) {
        if (i === -1) throw new Error(`Colonne introuvable dans le fichier : ${key}`);
    }
    const out = [];
    for (let r = 1; r < rows.length; r++) {
        const row = rows[r];
        if (!row || !row.some((c) => String(c).trim() !== '')) continue;
        const rawType = (row[idx.type] || '').trim();
        const mappedType = TYPE_MAP[rawType];
        if (!mappedType) continue; // hors périmètre (Microsoft 365, Yammer, ligne malformée…)
        out.push({
            nom: (row[idx.nom] || '').trim(),
            email: (row[idx.email] || '').trim(),
            description: (row[idx.description] || '').trim() || null,
            type: mappedType,
            date_creation: (row[idx.dateCreation] || '').trim() || null,
        });
    }
    return out;
}

async function main() {
    if (!filePath) {
        console.error('Usage: node scripts/import_exchange_groups.js --file="<chemin.xlsx>" [--execute]');
        process.exit(1);
    }
    console.log(isExecute ? '=== MODE EXÉCUTION (écriture réelle) ===' : '=== MODE DRY-RUN (lecture seule) — relancer avec --execute pour écrire ===');

    const targetRows = readTargetRows(path.resolve(filePath));
    console.log(`Lignes retenues (Liste de distribution / Sécurité à extension messagerie) : ${targetRows.length}`);

    let adSettings = null;
    if (isExecute) {
        const db = await setupSqlite();
        adSettings = await db.get('SELECT * FROM ad_settings WHERE id = 1');
        if (!adSettings || !adSettings.is_enabled || !adSettings.host) {
            console.warn('⚠️  Annuaire AD non configuré/désactivé — les nouvelles fiches seront créées SANS membres.');
            adSettings = null;
        }
    }

    let inserted = 0, updated = 0, skippedNoEmail = 0, adFailures = 0;
    const updateLog = [];

    for (const row of targetRows) {
        if (!row.email) { skippedNoEmail++; console.warn(`⚠️  Ligne sans adresse mail ignorée : "${row.nom}"`); continue; }

        const existing = await pgDb.get('SELECT id, nom, type FROM hub.shared_mailboxes WHERE LOWER(email) = LOWER(?)', [row.email]);

        if (existing) {
            const changed = existing.type !== row.type;
            updateLog.push(`  UPDATE #${existing.id} ${row.email} — type: "${existing.type || '—'}" → "${row.type}"${changed ? '' : ' (inchangé)'}, date_creation`);
            if (isExecute) {
                await service.updateRecord(existing.id, { type: row.type, date_creation: row.date_creation });
            }
            updated++;
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
            await service.createManual({
                nom: row.nom, email: row.email, type: row.type,
                justification: row.description, date_creation: row.date_creation,
                membres,
            }, IMPORT_USER);
        }
        inserted++;
        if (isExecute) console.log(`  INSERT ${row.email} (${row.type}) — ${membres.length} membre(s) AD`);
    }

    console.log('\n--- Résumé ---');
    console.log(`Fiches déjà existantes mises à jour (type + date_creation) : ${updated}`);
    if (!isExecute) updateLog.forEach((l) => console.log(l));
    console.log(`Nouvelles fiches ${isExecute ? 'créées' : 'à créer'} : ${inserted}`);
    console.log(`Lignes sans adresse mail ignorées : ${skippedNoEmail}`);
    if (isExecute) console.log(`Échecs de résolution AD (fiche créée sans membres) : ${adFailures}`);
    if (!isExecute) console.log('\nDry-run terminé — relancer avec --execute pour écrire en base et résoudre les membres AD.');

    process.exit(0);
}

main().catch((e) => { console.error('Erreur fatale:', e); process.exit(1); });
