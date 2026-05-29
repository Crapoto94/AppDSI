/**
 * MIGRATION des documents (hors certificats & magapp) vers le stockage partagé.
 *
 * Pour chaque module (réunions, projets, tickets, copieurs, live, backlog) :
 *   - si le fichier référencé est PRÉSENT localement -> il est COPIÉ sur le
 *     partage à l'emplacement "storage/<module>/<id>/<fichier>" (via le service
 *     de stockage, qui gère FS local / UNC / SMB), et le chemin est mis à jour
 *     en base ;
 *   - s'il est INTROUVABLE (effacé du serveur) -> la référence est MARQUÉE
 *     "fichier perdu" (colonne file_missing / attachment_missing, liste
 *     photos_missing, ou annotation "missing":true dans le JSON backlog).
 *
 * Propriétés :
 *   - NON destructif : aucun fichier local n'est supprimé ;
 *   - idempotent : une référence déjà en "storage/..." est ignorée pour la copie ;
 *   - sûr par défaut : simulation (dry-run) sauf si on passe --apply.
 *
 * Les certificats sont traités par migrate_certificates_to_storage.js (déjà fait)
 * et le magapp (icônes, docs, maintenances) est volontairement EXCLU.
 *
 * Usage (depuis backend/) :
 *   node scripts/migrate_documents_to_storage.js            # simulation
 *   node scripts/migrate_documents_to_storage.js --apply    # exécution réelle
 */
const fs = require('fs');
const path = require('path');
const db = require('../shared/database');
const storage = require('../shared/storage');

const APPLY = process.argv.includes('--apply');
const BACKEND_ROOT = path.join(__dirname, '..');
const P = (...segs) => path.join(BACKEND_ROOT, ...segs);

/** Coerce une valeur JSON (tableau déjà parsé ou chaîne JSON) en tableau. */
function asArray(val) {
    if (Array.isArray(val)) return val;
    if (val == null) return [];
    try { const p = JSON.parse(val); return Array.isArray(p) ? p : []; } catch (e) { return []; }
}

/** Index { basename -> [cheminsAbsolus] } d'une arborescence (récursif). */
function indexDir(absDir) {
    const map = new Map();
    const walk = (d) => {
        let ents;
        try { ents = fs.readdirSync(d, { withFileTypes: true }); } catch (e) { return; }
        for (const e of ents) {
            const full = path.join(d, e.name);
            if (e.isDirectory()) walk(full);
            else { if (!map.has(e.name)) map.set(e.name, []); map.get(e.name).push(full); }
        }
    };
    if (fs.existsSync(absDir)) walk(absDir);
    return map;
}

(async () => {
    await db.setupDb();
    const { pgDb } = db;

    // Garantit la présence des colonnes (au cas où setupPgDb n'a pas tourné).
    const ensure = async (sql) => { try { await pgDb.run(sql); } catch (e) {} };
    await ensure(`ALTER TABLE hub_rencontres.reunion_attachments ADD COLUMN IF NOT EXISTS file_path TEXT`);
    await ensure(`ALTER TABLE hub_rencontres.reunion_attachments ADD COLUMN IF NOT EXISTS file_missing BOOLEAN DEFAULT FALSE`);
    await ensure(`ALTER TABLE projets.projet_versions_document ADD COLUMN IF NOT EXISTS file_path TEXT`);
    await ensure(`ALTER TABLE projets.projet_versions_document ADD COLUMN IF NOT EXISTS file_missing BOOLEAN DEFAULT FALSE`);
    await ensure(`ALTER TABLE hub_tickets.ticket_attachments ADD COLUMN IF NOT EXISTS file_missing BOOLEAN DEFAULT FALSE`);
    await ensure(`ALTER TABLE hub_copieurs.copieur_visites ADD COLUMN IF NOT EXISTS photos_missing TEXT DEFAULT '[]'`);
    await ensure(`ALTER TABLE hub_tickets.live_messages ADD COLUMN IF NOT EXISTS attachment_missing BOOLEAN DEFAULT FALSE`);

    const cfg = await storage.getStorageConfig();
    const target = storage.isSmbConfig(cfg) ? `SMB ${cfg.root_path}` : storage.resolveRoot(cfg);

    console.log('\n=== Migration des documents vers le stockage partagé ===');
    console.log('Destination :', target);
    console.log('Exécution   :', APPLY ? 'RÉELLE (--apply)' : 'SIMULATION (dry-run)');

    const report = {}; // module -> { migr, lost, skip, err }
    const R = (m) => (report[m] = report[m] || { migr: 0, lost: 0, skip: 0, err: 0 });

    /** Copie un fichier local sur le partage et renvoie le dbPath ("storage/..."). */
    async function deposit(moduleName, id, absLocalPath, originalName) {
        const buffer = fs.readFileSync(absLocalPath);
        const saved = await storage.saveFile(moduleName, id, {
            buffer,
            originalname: originalName || path.basename(absLocalPath),
        });
        return saved.dbPath;
    }

    // ── 1. RÉUNIONS ────────────────────────────────────────────────────────────
    {
        const r = R('reunions');
        const rows = await pgDb.all('SELECT id, reunion_id, filename, original_name, file_path FROM hub_rencontres.reunion_attachments');
        for (const a of rows) {
            if (a.file_path && storage.isStoragePath(a.file_path)) { r.skip++; continue; }
            const abs = a.filename ? P('file_reunions', a.filename) : null;
            if (abs && fs.existsSync(abs)) {
                console.log(`[MIGRER] reunion ${a.reunion_id} att ${a.id} : ${a.original_name || a.filename}`);
                if (APPLY) {
                    try {
                        const dbPath = await deposit('reunions', a.reunion_id, abs, a.original_name);
                        await pgDb.run('UPDATE hub_rencontres.reunion_attachments SET file_path=?, file_missing=FALSE WHERE id=?', [dbPath, a.id]);
                    } catch (e) { r.err++; console.log(`   ERREUR: ${e.message}`); continue; }
                }
                r.migr++;
            } else {
                console.log(`[PERDU ] reunion ${a.reunion_id} att ${a.id} : ${a.original_name || a.filename}`);
                if (APPLY) await pgDb.run('UPDATE hub_rencontres.reunion_attachments SET file_missing=TRUE WHERE id=?', [a.id]);
                r.lost++;
            }
        }
    }

    // ── 2. PROJETS ───────────────────────────────────────────────────────────────
    {
        const r = R('projets');
        const rows = await pgDb.all('SELECT id, document_id, fichier_nom, fichier_original, file_path FROM projets.projet_versions_document');
        for (const v of rows) {
            if (v.file_path && storage.isStoragePath(v.file_path)) { r.skip++; continue; }
            const abs = v.fichier_nom ? P('file_projets', v.fichier_nom) : null;
            if (abs && fs.existsSync(abs)) {
                console.log(`[MIGRER] projet doc ${v.document_id} version ${v.id} : ${v.fichier_original || v.fichier_nom}`);
                if (APPLY) {
                    try {
                        const dbPath = await deposit('projets', v.document_id, abs, v.fichier_original);
                        await pgDb.run('UPDATE projets.projet_versions_document SET file_path=?, file_missing=FALSE WHERE id=?', [dbPath, v.id]);
                    } catch (e) { r.err++; console.log(`   ERREUR: ${e.message}`); continue; }
                }
                r.migr++;
            } else {
                console.log(`[PERDU ] projet doc ${v.document_id} version ${v.id} : ${v.fichier_original || v.fichier_nom}`);
                if (APPLY) await pgDb.run('UPDATE projets.projet_versions_document SET file_missing=TRUE WHERE id=?', [v.id]);
                r.lost++;
            }
        }
    }

    // ── 3. TICKETS ───────────────────────────────────────────────────────────────
    {
        const r = R('tickets');
        const idxTickets = indexDir(P('file_tickets'));
        const idxUploads = indexDir(P('uploads'));
        const rows = await pgDb.all('SELECT id, ticket_id, filename, file_path, original_name FROM hub_tickets.ticket_attachments');
        for (const a of rows) {
            if (a.file_path && storage.isStoragePath(a.file_path)) { r.skip++; continue; }
            const base = a.filename || (a.file_path ? path.basename(String(a.file_path).replace(/\\/g, '/')) : '');
            const hit = base && ((idxTickets.get(base) || [])[0] || (idxUploads.get(base) || [])[0]);
            if (hit) {
                console.log(`[MIGRER] ticket ${a.ticket_id} att ${a.id} : ${a.original_name || base}`);
                if (APPLY) {
                    try {
                        const dbPath = await deposit('tickets', a.ticket_id, hit, a.original_name);
                        await pgDb.run('UPDATE hub_tickets.ticket_attachments SET file_path=?, filename=?, file_missing=FALSE WHERE id=?', [dbPath, path.basename(dbPath), a.id]);
                    } catch (e) { r.err++; console.log(`   ERREUR: ${e.message}`); continue; }
                }
                r.migr++;
            } else {
                console.log(`[PERDU ] ticket ${a.ticket_id} att ${a.id} : ${a.original_name || base}`);
                if (APPLY) await pgDb.run('UPDATE hub_tickets.ticket_attachments SET file_missing=TRUE WHERE id=?', [a.id]);
                r.lost++;
            }
        }
    }

    // ── 4. COPIEURS (photos JSON) ────────────────────────────────────────────────
    {
        const r = R('copieurs');
        const rows = await pgDb.all('SELECT id, copieur_id, photos FROM hub_copieurs.copieur_visites WHERE photos IS NOT NULL');
        for (const v of rows) {
            const arr = asArray(v.photos);
            if (arr.length === 0) continue;
            const newPhotos = [];
            const missing = [];
            let changed = false;
            for (const ph of arr) {
                if (storage.isStoragePath(ph)) { newPhotos.push(ph); continue; }
                const rel = String(ph).replace(/^\/+/, '').replace(/\\/g, '/'); // uploads/<f>
                const abs = P(...rel.split('/'));
                if (fs.existsSync(abs)) {
                    console.log(`[MIGRER] copieur ${v.copieur_id} visite ${v.id} : ${ph}`);
                    if (APPLY) {
                        try {
                            const dbPath = await deposit('copieurs', v.id, abs, path.basename(rel));
                            newPhotos.push(dbPath); changed = true;
                        } catch (e) { r.err++; console.log(`   ERREUR: ${e.message}`); newPhotos.push(ph); continue; }
                    } else { newPhotos.push(ph); }
                    r.migr++;
                } else {
                    console.log(`[PERDU ] copieur ${v.copieur_id} visite ${v.id} : ${ph}`);
                    newPhotos.push(ph); missing.push(ph); r.lost++;
                }
            }
            if (APPLY && (changed || missing.length)) {
                await pgDb.run('UPDATE hub_copieurs.copieur_visites SET photos=?, photos_missing=? WHERE id=?',
                    [JSON.stringify(newPhotos), JSON.stringify(missing), v.id]);
            }
        }
    }

    // ── 5. LIVE (chat) ───────────────────────────────────────────────────────────
    {
        const r = R('live');
        const rows = await pgDb.all('SELECT id, attachment_url, attachment_name FROM hub_tickets.live_messages WHERE attachment_url IS NOT NULL');
        for (const m of rows) {
            const url = String(m.attachment_url || '').trim();
            if (!url) continue;
            if (storage.isStoragePath(url)) { r.skip++; continue; }
            const rel = url.replace(/^\/+/, '').replace(/\\/g, '/');
            const abs = P(...rel.split('/'));
            if (fs.existsSync(abs)) {
                console.log(`[MIGRER] live message ${m.id} : ${m.attachment_name || url}`);
                if (APPLY) {
                    try {
                        const dbPath = await deposit('live', m.id, abs, m.attachment_name || path.basename(rel));
                        await pgDb.run('UPDATE hub_tickets.live_messages SET attachment_url=?, attachment_missing=FALSE WHERE id=?', [dbPath, m.id]);
                    } catch (e) { r.err++; console.log(`   ERREUR: ${e.message}`); continue; }
                }
                r.migr++;
            } else {
                console.log(`[PERDU ] live message ${m.id} : ${m.attachment_name || url}`);
                if (APPLY) await pgDb.run('UPDATE hub_tickets.live_messages SET attachment_missing=TRUE WHERE id=?', [m.id]);
                r.lost++;
            }
        }
    }

    // ── 6. BACKLOG (attachments JSON [{filename, path}]) ──────────────────────────
    {
        const r = R('backlog');
        const rows = await pgDb.all('SELECT id, title, attachments FROM hub.backlog WHERE attachments IS NOT NULL');
        for (const b of rows) {
            const arr = asArray(b.attachments);
            if (arr.length === 0) continue;
            let changed = false;
            for (const at of arr) {
                if (!at || typeof at !== 'object') continue;
                if (at.storage && storage.isStoragePath(at.path)) continue;
                const stored = at.path || at.filename;
                const abs = stored ? P('uploads', 'backlog_attachments', stored) : null;
                if (abs && fs.existsSync(abs)) {
                    console.log(`[MIGRER] backlog ${b.id} : ${at.filename || stored}`);
                    if (APPLY) {
                        try {
                            const dbPath = await deposit('backlog', b.id, abs, at.filename || stored);
                            at.path = dbPath; at.storage = true; at.missing = false; changed = true;
                        } catch (e) { r.err++; console.log(`   ERREUR: ${e.message}`); continue; }
                    }
                    r.migr++;
                } else {
                    console.log(`[PERDU ] backlog ${b.id} : ${at.filename || stored}`);
                    at.missing = true; changed = true; r.lost++;
                }
            }
            if (APPLY && changed) {
                await pgDb.run('UPDATE hub.backlog SET attachments=? WHERE id=?', [JSON.stringify(arr), b.id]);
            }
        }
    }

    // ── Synthèse ──
    console.log('\n=== Bilan ===');
    let tM = 0, tL = 0, tS = 0, tE = 0;
    for (const [m, r] of Object.entries(report)) {
        tM += r.migr; tL += r.lost; tS += r.skip; tE += r.err;
        console.log(`${m.padEnd(12)} migrés=${String(r.migr).padStart(3)}  perdus=${String(r.lost).padStart(3)}  déjà=${String(r.skip).padStart(3)}  erreurs=${String(r.err).padStart(3)}`);
    }
    console.log('-'.repeat(52));
    console.log(`${'TOTAL'.padEnd(12)} migrés=${String(tM).padStart(3)}  perdus=${String(tL).padStart(3)}  déjà=${String(tS).padStart(3)}  erreurs=${String(tE).padStart(3)}`);
    if (!APPLY) console.log('\n(simulation : relancer avec --apply pour exécuter)');

    process.exit(0);
})().catch(e => { console.error('FATAL', e && (e.stack || e.message || e)); process.exit(1); });
