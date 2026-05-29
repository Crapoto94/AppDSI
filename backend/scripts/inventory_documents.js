/**
 * INVENTAIRE (lecture seule) des documents référencés en base vs présents sur disque.
 *
 * Pour chaque module concerné par la migration vers le stockage partagé, on
 * énumère les références en base, on résout le fichier local attendu et on
 * vérifie sa présence. Aucune écriture (ni base, ni fichier).
 *
 * Objectif : lister les fichiers MANQUANTS (supprimés sur le serveur) avant de
 * lancer la migration. Le magapp (icônes, docs, maintenances) est EXCLU
 * volontairement (reste en stockage local).
 *
 * Usage : node scripts/inventory_documents.js
 */
const fs = require('fs');
const path = require('path');
const db = require('../shared/database');
const storage = require('../shared/storage');

const BACKEND_ROOT = path.join(__dirname, '..');
const P = (...segs) => path.join(BACKEND_ROOT, ...segs);

/** Coerce une valeur JSON (déjà tableau via pg jsonb, ou chaîne JSON) en tableau. */
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

    // Racine du partage (dev = mode filesystem -> chemin UNC, lisible via l'OS).
    const cfg = await storage.getStorageConfig();
    const shareRoot = storage.resolveRoot(cfg);

    const report = {}; // module -> { refs, found, missing:[] }
    const add = (mod) => (report[mod] = report[mod] || { refs: 0, found: 0, missing: [] });

    // ── 1. CERTIFICATS : déjà en storage/..., vérifier présence sur le PARTAGE ──
    {
        const r = add('certificats (sur le partage)');
        const rows = await pgDb.all("SELECT id, order_number, file_path FROM hub.certificates WHERE file_path IS NOT NULL AND file_path <> ''");
        for (const c of rows) {
            r.refs++;
            const rel = String(c.file_path).replace(/\\/g, '/').replace(/^storage\//, '');
            const abs = path.join(shareRoot, rel.replace(/\//g, path.sep));
            if (fs.existsSync(abs)) r.found++;
            else r.missing.push(`cert ${c.id} (${c.order_number}) : ${c.file_path}`);
        }
    }

    // ── 2. REUNIONS : file_reunions/<filename> ──
    {
        const r = add('reunions');
        const rows = await pgDb.all("SELECT id, reunion_id, filename, original_name FROM hub_rencontres.reunion_attachments");
        for (const a of rows) {
            r.refs++;
            if (a.filename && fs.existsSync(P('file_reunions', a.filename))) r.found++;
            else r.missing.push(`att ${a.id} (reunion ${a.reunion_id}) : ${a.original_name || a.filename}  [file_reunions/${a.filename}]`);
        }
    }

    // ── 3. PROJETS : file_projets/<fichier_nom> ──
    {
        const r = add('projets');
        const rows = await pgDb.all("SELECT id, document_id, fichier_nom, fichier_original FROM projets.projet_versions_document");
        for (const v of rows) {
            r.refs++;
            if (v.fichier_nom && fs.existsSync(P('file_projets', v.fichier_nom))) r.found++;
            else r.missing.push(`version ${v.id} (doc ${v.document_id}) : ${v.fichier_original || v.fichier_nom}  [file_projets/${v.fichier_nom}]`);
        }
    }

    // ── 4. TICKETS : filename dans file_tickets OU uploads (file_path absolu non portable) ──
    {
        const r = add('tickets');
        const idxTickets = indexDir(P('file_tickets'));
        const idxUploads = indexDir(P('uploads'));
        const rows = await pgDb.all("SELECT id, ticket_id, filename, file_path, original_name FROM hub_tickets.ticket_attachments");
        for (const a of rows) {
            r.refs++;
            const base = a.filename || (a.file_path ? path.basename(String(a.file_path).replace(/\\/g, '/')) : '');
            const hit = (base && (idxTickets.get(base) || idxUploads.get(base)));
            if (hit) r.found++;
            else r.missing.push(`att ${a.id} (ticket ${a.ticket_id}) : ${a.original_name || base}  [${base}]`);
        }
    }

    // ── 5. CONTRATS : contrat_documents.file_path = file_contrats/<f> ; + contrats.doc_principal_path ──
    {
        const r = add('contrats');
        const rows = await pgDb.all("SELECT id, contrat_id, file_path, file_name FROM hub_contrats.contrat_documents WHERE file_path IS NOT NULL AND file_path <> ''");
        for (const d of rows) {
            r.refs++;
            const rel = String(d.file_path).replace(/\\/g, '/');
            if (fs.existsSync(P(...rel.split('/')))) r.found++;
            else r.missing.push(`doc ${d.id} (contrat ${d.contrat_id}) : ${d.file_name || rel}  [${rel}]`);
        }
        const princ = await pgDb.all("SELECT id, doc_principal_path, doc_principal_nom FROM hub_contrats.contrats WHERE doc_principal_path IS NOT NULL AND doc_principal_path <> ''");
        for (const c of princ) {
            r.refs++;
            const rel = String(c.doc_principal_path).replace(/\\/g, '/');
            if (fs.existsSync(P(...rel.split('/')))) r.found++;
            else r.missing.push(`contrat ${c.id} doc principal : ${c.doc_principal_nom || rel}  [${rel}]`);
        }
    }

    // ── 6. COPIEURS : copieur_visites.photos = JSON [ "/uploads/<f>" ] ──
    {
        const r = add('copieurs (photos)');
        const rows = await pgDb.all("SELECT id, copieur_id, photos FROM hub_copieurs.copieur_visites WHERE photos IS NOT NULL");
        for (const v of rows) {
            let arr = [];
            arr = asArray(v.photos);
            for (const ph of arr) {
                r.refs++;
                const rel = String(ph).replace(/^\/+/, '').replace(/\\/g, '/'); // uploads/<f>
                if (fs.existsSync(P(...rel.split('/')))) r.found++;
                else r.missing.push(`visite ${v.id} (copieur ${v.copieur_id}) : ${ph}`);
            }
        }
    }

    // ── 7. LIVE : live_messages.attachment_url = /uploads/live/<f> ──
    {
        const r = add('live (pièces jointes chat)');
        const rows = await pgDb.all("SELECT id, attachment_url, attachment_name FROM hub_tickets.live_messages WHERE attachment_url IS NOT NULL");
        for (const m of rows) {
            if (!String(m.attachment_url || '').trim()) continue;
            r.refs++;
            const rel = String(m.attachment_url).replace(/^\/+/, '').replace(/\\/g, '/');
            if (fs.existsSync(P(...rel.split('/')))) r.found++;
            else r.missing.push(`message ${m.id} : ${m.attachment_name || m.attachment_url}  [${m.attachment_url}]`);
        }
    }

    // ── 8. BACKLOG : hub.backlog.attachments = JSON [ { filename, path } ] -> uploads/backlog_attachments/<path> ──
    {
        const r = add('backlog');
        const rows = await pgDb.all("SELECT id, title, attachments FROM hub.backlog WHERE attachments IS NOT NULL");
        for (const b of rows) {
            let arr = [];
            arr = asArray(b.attachments);
            for (const at of arr) {
                r.refs++;
                const stored = at && (at.path || at.filename);
                if (stored && fs.existsSync(P('uploads', 'backlog_attachments', stored))) r.found++;
                else r.missing.push(`backlog ${b.id} (${b.title}) : ${(at && at.filename) || stored}  [uploads/backlog_attachments/${stored}]`);
            }
        }
    }

    // ── Synthèse ──
    console.log('\n================ INVENTAIRE DOCUMENTS ================');
    console.log('Partage :', shareRoot, '\n');
    let totRefs = 0, totFound = 0, totMiss = 0;
    for (const [mod, r] of Object.entries(report)) {
        totRefs += r.refs; totFound += r.found; totMiss += r.missing.length;
        console.log(`${mod.padEnd(32)} refs=${String(r.refs).padStart(4)}  trouvés=${String(r.found).padStart(4)}  MANQUANTS=${String(r.missing.length).padStart(4)}`);
    }
    console.log('-'.repeat(53));
    console.log(`${'TOTAL'.padEnd(32)} refs=${String(totRefs).padStart(4)}  trouvés=${String(totFound).padStart(4)}  MANQUANTS=${String(totMiss).padStart(4)}`);

    console.log('\n================ FICHIERS MANQUANTS ================');
    const lines = [];
    for (const [mod, r] of Object.entries(report)) {
        if (!r.missing.length) continue;
        console.log(`\n--- ${mod} (${r.missing.length}) ---`);
        for (const m of r.missing) { console.log('  ', m); lines.push(`[${mod}] ${m}`); }
    }
    if (totMiss === 0) console.log('\nAucun fichier manquant. 🎉');

    // Écrit aussi la liste dans un fichier pour archive.
    try {
        const out = path.join(__dirname, 'fichiers_manquants.txt');
        fs.writeFileSync(out, lines.join('\n') + '\n', 'utf8');
        console.log('\n(Liste écrite dans scripts/fichiers_manquants.txt)');
    } catch (e) { /* ignore */ }

    process.exit(0);
})().catch(e => { console.error('FATAL', e && (e.stack || e.message || e)); process.exit(1); });
