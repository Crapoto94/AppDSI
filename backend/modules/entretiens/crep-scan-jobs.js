/**
 * Analyse d'un CREP manuscrit par l'IA locale, en TÂCHE DE FOND.
 *
 * La lecture de quelques pages prend plusieurs minutes (lecture du manuscrit page par page, deux lectures de contrôle, cases cochées,
 * cohérence). L'évaluateur ne reste donc pas devant son écran : l'envoi des photos répond tout de suite « analyse en cours », et
 * un e-mail l'avertit quand la proposition est prête, pour qu'il la relise AVANT de valider le compte rendu.
 *
 * - une seule analyse à la fois sur le serveur (l'IA locale est sollicitée page par page) : les suivantes attendent leur tour ;
 * - le résultat est conservé en base (hub_entretiens.crep_scan_jobs) : l'évaluateur le retrouve même après avoir fermé la page ;
 * - les durées réelles servent à estimer la durée des analyses suivantes.
 */
const { pgDb } = require('../../shared/database');

const DEFAULT_MS_PER_FILE = 40000; // repli avant la première mesure (mesuré : ~30 s par page sur l'IA locale)

let ready = null;
let chain = Promise.resolve();
let waiting = 0;

function ensureTable() {
    if (!ready) {
        ready = (async () => {
            await pgDb.run(`CREATE TABLE IF NOT EXISTS hub_entretiens.crep_scan_jobs (
                id SERIAL PRIMARY KEY,
                entretien_id INTEGER NOT NULL,
                requested_by TEXT,
                requested_email TEXT,
                status TEXT NOT NULL DEFAULT 'en_attente',
                files_count INTEGER NOT NULL DEFAULT 0,
                bytes BIGINT DEFAULT 0,
                progress INTEGER NOT NULL DEFAULT 0,
                progress_total INTEGER NOT NULL DEFAULT 0,
                result JSONB,
                error TEXT,
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                started_at TIMESTAMPTZ,
                finished_at TIMESTAMPTZ,
                duration_ms INTEGER,
                applied_at TIMESTAMPTZ
            )`);
            await pgDb.run(`ALTER TABLE hub_entretiens.crep_scan_jobs ADD COLUMN IF NOT EXISTS mode TEXT DEFAULT 'complet'`);
            await pgDb.run(`ALTER TABLE hub_entretiens.crep_scan_jobs ADD COLUMN IF NOT EXISTS scan_path TEXT`);
            await pgDb.run(`ALTER TABLE hub_entretiens.crep_scan_jobs ADD COLUMN IF NOT EXISTS scan_name TEXT`);
            // Documents conservés sur l'entretien : scans originaux (papier signé) dont la lecture IA a été appliquée
            await pgDb.run(`ALTER TABLE hub_entretiens.entretiens ADD COLUMN IF NOT EXISTS crep_scans JSONB DEFAULT '[]'::jsonb`);
            await pgDb.run(`CREATE INDEX IF NOT EXISTS idx_crep_scan_jobs_ent ON hub_entretiens.crep_scan_jobs (entretien_id, id DESC)`);
            // Analyses interrompues par un redémarrage du serveur : elles ne reprendront pas (les photos n'étaient qu'en mémoire).
            await pgDb.run(`UPDATE hub_entretiens.crep_scan_jobs SET status = 'echec', finished_at = NOW(),
                error = 'Analyse interrompue par un redémarrage du serveur : renvoyez les photos.' WHERE status IN ('en_attente', 'en_cours')`);
        })().catch(e => { ready = null; throw e; });
    }
    return ready;
}

/** Durée estimée d'une analyse de n fichiers (ms) : moyenne mesurée sur les dernières analyses réussies, file d'attente comprise. */
async function estimateMs(nFiles, ahead = 0) {
    await ensureTable();
    let perFile = DEFAULT_MS_PER_FILE;
    try {
        const r = await pgDb.get(`SELECT AVG(duration_ms::float / NULLIF(files_count, 0)) AS per FROM (
            SELECT duration_ms, files_count FROM hub_entretiens.crep_scan_jobs WHERE status = 'termine' AND duration_ms > 0 ORDER BY id DESC LIMIT 20) t`);
        if (r && Number(r.per) > 0) perFile = Number(r.per);
    } catch (e) { /* estimation par défaut */ }
    return Math.round(perFile * Math.max(1, nFiles) * (1 + ahead));
}

const shape = async (row, withResult) => {
    if (!row) return null;
    const out = {
        id: row.id, entretien_id: row.entretien_id, status: row.status, mode: row.mode || 'complet', files_count: row.files_count,
        progress: row.progress, progress_total: row.progress_total, error: row.error || null,
        created_at: row.created_at, started_at: row.started_at, finished_at: row.finished_at, duration_ms: row.duration_ms, applied_at: row.applied_at,
    };
    if (row.status === 'en_attente' || row.status === 'en_cours') {
        const ahead = Number((await pgDb.get(`SELECT COUNT(*)::int AS n FROM hub_entretiens.crep_scan_jobs WHERE status IN ('en_attente','en_cours') AND id < ?`, [row.id]))?.n || 0);
        out.estimate_ms = await estimateMs(row.files_count, ahead);
    }
    if (withResult && row.status === 'termine') out.result = row.result;
    return out;
};

async function latest(entretienId) {
    await ensureTable();
    // le dernier job non « classé » (appliqué ou écarté) de cet entretien
    const row = await pgDb.get(`SELECT * FROM hub_entretiens.crep_scan_jobs WHERE entretien_id = ? AND applied_at IS NULL ORDER BY id DESC LIMIT 1`, [entretienId]);
    return shape(row, true);
}

/** Range la proposition. `applied` : la lecture a été appliquée → le scan original est CONSERVÉ sur l'entretien ; sinon il est supprimé. */
async function ack(entretienId, jobId, applied, by) {
    await ensureTable();
    const job = await pgDb.get(`SELECT * FROM hub_entretiens.crep_scan_jobs WHERE id = ? AND entretien_id = ?`, [jobId, entretienId]);
    if (!job) return;
    const storage = require('../../shared/storage');
    if (applied && job.scan_path && !job.applied_at) {
        const ent = await pgDb.get('SELECT crep_scans FROM hub_entretiens.entretiens WHERE id = ?', [entretienId]);
        const list = Array.isArray(ent?.crep_scans) ? ent.crep_scans : [];
        list.push({ kind: job.mode || 'complet', path: job.scan_path, name: job.scan_name || 'scan.pdf', at: new Date().toISOString(), by: by || '', job: job.id });
        await pgDb.run(`UPDATE hub_entretiens.entretiens SET crep_scans = CAST(? AS jsonb) WHERE id = ?`, [JSON.stringify(list), entretienId]);
    } else if (!applied && job.scan_path && !job.applied_at) {
        try { await storage.deleteFile(job.scan_path); } catch (e) { /* fichier déjà absent */ }
    }
    await pgDb.run(`UPDATE hub_entretiens.crep_scan_jobs SET applied_at = NOW() WHERE id = ?`, [jobId]);
}

/** Assemble les photos / pages reçues en UN PDF (images recompressées) : c'est la version « scannée » conservée. */
async function mergeScanPdf(files) {
    const { PDFDocument } = require('pdf-lib');
    const { createCanvas, loadImage } = require('@napi-rs/canvas');
    const out = await PDFDocument.create();
    for (const f of files) {
        if (f.buffer.slice(0, 5).toString('latin1') === '%PDF-') {
            const src = await PDFDocument.load(f.buffer, { ignoreEncryption: true });
            for (const p of await out.copyPages(src, src.getPageIndices())) out.addPage(p);
        } else {
            const img = await loadImage(f.buffer);
            const s = Math.min(1, 2400 / Math.max(img.width, img.height));
            const c = createCanvas(Math.round(img.width * s), Math.round(img.height * s));
            c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
            const jpg = await out.embedJpg(c.toBuffer('image/jpeg', 86));
            const pw = 595.28, ph = (pw * jpg.height) / jpg.width;
            out.addPage([pw, ph]).drawImage(jpg, { x: 0, y: 0, width: pw, height: ph });
        }
    }
    return Buffer.from(await out.save());
}

async function notify({ job, row, ok, error, durationMs }) {
    try {
        if (!job.requested_email) return;
        const epBeta = require('../../shared/ep-beta-mail');
        if (!(await epBeta.allowedForEntretien(row, job.requested_email, 'analyse CREP'))) return;
        const { sendParapheurEmail } = require('../parapheur/parapheur.service');
        const email = require('./entretiens-email');
        const svc = require('./entretiens.service');
        const campaign = await pgDb.get('SELECT annee FROM hub_entretiens.campaigns WHERE id = ?', [row.campaign_id]);
        await sendParapheurEmail(job.requested_email, email.analyseCrep({
            evaluateur: job.requested_by || 'Madame, Monsieur',
            agent: svc.fullName(row.agent_prenom, row.agent_nom) || 'un agent',
            annee: campaign?.annee, ok, error, dureeMs: durationMs,
            link: await email.entretiensUrl('evaluations'),
        }));
    } catch (e) { console.warn('[ENTRETIENS] e-mail de fin d’analyse non envoyé:', e.message); }
}

/**
 * Enregistre l'analyse et la met en file ; répond immédiatement (le travail se poursuit en arrière-plan).
 * @param {{ row: object, actor: object, files: Array<{buffer: Buffer, mimetype: string, name?: string}>, definition: object, contexte?: object, annee?: number }} p
 */
async function start({ row, actor, files, definition, contexte, annee, mode }) {
    await ensureTable();
    const active = await pgDb.get(`SELECT id FROM hub_entretiens.crep_scan_jobs WHERE entretien_id = ? AND status IN ('en_attente','en_cours') LIMIT 1`, [row.id]);
    if (active) { const e = new Error('Une analyse est déjà en cours pour cet entretien : attendez son résultat (vous serez prévenu par e-mail).'); e.status = 409; throw e; }
    const bytes = files.reduce((n, f) => n + (f.buffer?.length || 0), 0);
    const ins = await pgDb.get(
        `INSERT INTO hub_entretiens.crep_scan_jobs (entretien_id, requested_by, requested_email, files_count, bytes, status)
         VALUES (?, ?, ?, ?, ?, 'en_attente') RETURNING *`,
        [row.id, actor.displayName || actor.username || '', actor.email || '', files.length, bytes]);
    const job = ins;
    await pgDb.run(`UPDATE hub_entretiens.crep_scan_jobs SET mode = ? WHERE id = ?`, [mode === 'agent' ? 'agent' : 'complet', job.id]);
    // La version SCANNÉE est conservée dès l'envoi (assemblée en un PDF), qu'on utilise ou non la lecture de l'IA
    try {
        const pdf = await mergeScanPdf(files);
        const saved = await require('../../shared/storage').saveFile('entretiens', row.id, { buffer: pdf, originalname: `CREP-scan-original-${mode === 'agent' ? 'agent' : 'complet'}.pdf` });
        await pgDb.run(`UPDATE hub_entretiens.crep_scan_jobs SET scan_path = ?, scan_name = ? WHERE id = ?`, [saved.dbPath, `CREP-scan-original-${mode === 'agent' ? 'agent' : 'complet'}.pdf`, job.id]);
    } catch (e) { console.warn('[ENTRETIENS] conservation du scan impossible:', e.message); }
    waiting += 1;
    chain = chain.then(() => run({ job, row, files, definition, contexte, annee, mode })).catch(() => { /* déjà journalisé dans run */ });
    return shape(await pgDb.get('SELECT * FROM hub_entretiens.crep_scan_jobs WHERE id = ?', [job.id]), false);
}

async function run({ job, row, files, definition, contexte, annee, mode }) {
    const t0 = Date.now();
    try {
        await pgDb.run(`UPDATE hub_entretiens.crep_scan_jobs SET status = 'en_cours', started_at = NOW() WHERE id = ?`, [job.id]);
        const scan = require('./crep-scan.service');
        let lastWrite = 0;
        const result = await scan.scanDocuments(files, definition, {
            annee, contexte, mode,
            onProgress: (i, n) => {
                const now = Date.now();
                if (now - lastWrite < 1500 && i < n) return;
                lastWrite = now;
                pgDb.run(`UPDATE hub_entretiens.crep_scan_jobs SET progress = ?, progress_total = ? WHERE id = ?`, [i, n, job.id]).catch(() => {});
            },
        });
        const ms = Date.now() - t0;
        result.duration_ms = ms;
        await pgDb.run(`UPDATE hub_entretiens.crep_scan_jobs SET status = 'termine', result = CAST(? AS jsonb), finished_at = NOW(), duration_ms = ?, progress = progress_total WHERE id = ?`,
            [JSON.stringify(result), ms, job.id]);
        console.log(`[ENTRETIENS] analyse CREP #${job.id} terminée en ${(ms / 1000).toFixed(0)} s (${files.length} fichier(s))`);
        await notify({ job, row, ok: true, durationMs: ms });
    } catch (e) {
        const ms = Date.now() - t0;
        console.error(`[ENTRETIENS] analyse CREP #${job.id} en échec:`, e.message);
        await pgDb.run(`UPDATE hub_entretiens.crep_scan_jobs SET status = 'echec', error = ?, finished_at = NOW(), duration_ms = ? WHERE id = ?`, [String(e.message || e).slice(0, 500), ms, job.id]).catch(() => {});
        await notify({ job, row, ok: false, error: e.message, durationMs: ms });
    } finally {
        waiting = Math.max(0, waiting - 1);
    }
}

module.exports = { start, latest, ack, estimateMs, ensureTable };
