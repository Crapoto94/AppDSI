/**
 * Suivi des retours de CREP et numérisation en lot.
 *
 * Les administrateurs numérisent d'un seul fichier PDF les CREP signés de plusieurs agents (pages éventuellement mélangées,
 * d'un CREP à l'autre comme à l'intérieur d'un CREP). Chaque page imprimée porte en haut à gauche un QR code signé
 * (« EPC.<id entretien>.<n° de page>.<signature> », cf. crep-pdf.service.js) : on le lit pour
 *   1. reconnaître l'agent et le n° de page, quel que soit l'ordre et l'orientation de la page (rotation détectée) ;
 *   2. reconstituer chaque CREP (nombre de pages contrôlé : EXPECTED_PAGES) ;
 *   3. faire vérifier le regroupement par l'administrateur (pages non reconnues, doublons, pages manquantes à corriger à la main) ;
 *   4. rattacher le CREP signé à l'entretien de l'agent et lancer en parallèle sa lecture par l'IA (la plus précise).
 */
const fs = require('fs');
const path = require('path');
const { pgDb } = require('../../shared/database');
const storage = require('../../shared/storage');
const { parsePageCode } = require('./crep-pdf.service');

/** Nombre de pages d'un CREP imprimé (identique pour tous les modèles pour le moment). */
const EXPECTED_PAGES = 4;
const MAX_PAGES = 600;
const QR_WIDTH_PX = 2000;      // largeur de rendu d'une page pour la lecture du QR code
const THUMB_WIDTH_PX = 720;

let pdfjsPromise = null;
const loadPdfjs = () => (pdfjsPromise || (pdfjsPromise = import('pdfjs-dist/legacy/build/pdf.mjs')));

let ready = null;
function ensureTable() {
    if (!ready) {
        ready = (async () => {
            await pgDb.run(`CREATE TABLE IF NOT EXISTS hub_entretiens.crep_return_batches (
                id SERIAL PRIMARY KEY,
                campaign_id INTEGER,
                created_by TEXT,
                file_path TEXT,
                file_name TEXT,
                status TEXT NOT NULL DEFAULT 'analyse',
                pages_total INTEGER NOT NULL DEFAULT 0,
                progress INTEGER NOT NULL DEFAULT 0,
                pages JSONB NOT NULL DEFAULT '[]'::jsonb,
                confirmed JSONB NOT NULL DEFAULT '{}'::jsonb,
                error TEXT,
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                finished_at TIMESTAMPTZ
            )`);
            // Canal d'entrée du CREP numérisé : « drh » (téléversement par un administrateur) ou « mail » (boîte moissonnée)
            await pgDb.run(`ALTER TABLE hub_entretiens.crep_return_batches ADD COLUMN IF NOT EXISTS channel TEXT NOT NULL DEFAULT 'drh'`);
            await pgDb.run(`ALTER TABLE hub_entretiens.crep_return_batches ADD COLUMN IF NOT EXISTS phase_total INTEGER`);
            await pgDb.run(`ALTER TABLE hub_entretiens.crep_return_batches ADD COLUMN IF NOT EXISTS source_meta JSONB`);
            await pgDb.run(`ALTER TABLE hub_entretiens.entretiens ADD COLUMN IF NOT EXISTS crep_canal TEXT`);
            await pgDb.run(`ALTER TABLE hub_entretiens.entretiens ADD COLUMN IF NOT EXISTS crep_canal_detail TEXT`);
            // Mode simple : l'évaluateur signale avoir transmis le CREP à la DRH
            await pgDb.run(`ALTER TABLE hub_entretiens.entretiens ADD COLUMN IF NOT EXISTS simple_sent_at TIMESTAMPTZ`);
            await pgDb.run(`ALTER TABLE hub_entretiens.entretiens ADD COLUMN IF NOT EXISTS simple_sent_by TEXT`);
            await pgDb.run(`UPDATE hub_entretiens.crep_return_batches SET status = 'echec', error = 'Analyse interrompue par un redémarrage du serveur : renvoyez le fichier.' WHERE status IN ('analyse', 'identification')`);
        })().catch(e => { ready = null; throw e; });
    }
    return ready;
}

async function readStored(dbPath) {
    const f = await storage.getFileForServe(dbPath);
    if (!f) throw new Error('Fichier numérisé introuvable dans le stockage.');
    return f.buffer || fs.promises.readFile(f.absolutePath);
}

async function openPdf(buffer) {
    const pdfjs = await loadPdfjs();
    const standardFontDataUrl = path.join(path.dirname(require.resolve('pdfjs-dist/package.json')), 'standard_fonts') + path.sep;
    return pdfjs.getDocument({ data: new Uint8Array(buffer), useSystemFonts: false, isEvalSupported: false, standardFontDataUrl }).promise;
}

async function renderPage(doc, n, width) {
    const { createCanvas } = require('@napi-rs/canvas');
    const page = await doc.getPage(n);
    const base = page.getViewport({ scale: 1 });
    const vp = page.getViewport({ scale: width / base.width });
    const canvas = createCanvas(Math.ceil(vp.width), Math.ceil(vp.height));
    await page.render({ canvasContext: canvas.getContext('2d'), viewport: vp }).promise;
    return canvas;
}

function rotated(canvas, deg) {
    if (!deg) return canvas;
    const { createCanvas } = require('@napi-rs/canvas');
    const swap = deg === 90 || deg === 270;
    const out = createCanvas(swap ? canvas.height : canvas.width, swap ? canvas.width : canvas.height);
    const ctx = out.getContext('2d');
    ctx.translate(out.width / 2, out.height / 2);
    ctx.rotate((deg * Math.PI) / 180);
    ctx.drawImage(canvas, -canvas.width / 2, -canvas.height / 2);
    return out;
}

let strictInversion = true;
function decodeRegion(canvas, x, y, w, h) {
    const jsQR = require('jsqr');
    const img = canvas.getContext('2d').getImageData(x, y, w, h);
    const r = jsQR(img.data, img.width, img.height, { inversionAttempts: strictInversion ? 'dontInvert' : 'attemptBoth' });
    if (r && r.data && !parsePageCode(r.data, true)) lastForeign = String(r.data).slice(0, 60);
    return r && r.data ? { text: r.data, loc: r.location } : null;
}

let lastForeign = '';

/** Lecture robuste d'une page : plusieurs résolutions de rendu, puis lecture avec inversion de contraste (scans de qualité variable). */
async function findDashcodeRobust(doc, n, quick = false) {
    lastForeign = '';
    for (const inverse of quick ? [false] : [false, true]) {
        strictInversion = !inverse;
        for (const w of quick ? [QR_WIDTH_PX] : [QR_WIDTH_PX, 3000, 1400, 1000]) {
            const r = findDashcode(await renderPage(doc, n, w));
            if (r.code) { strictInversion = true; return r; }
        }
    }
    strictInversion = true;
    return { code: null, rot: 0, ...(lastForeign ? { foreign: lastForeign } : {}) };
}

/**
 * Cherche le dashcode d'une page : coin supérieur gauche d'abord (page à l'endroit), puis page tournée de 180°, 90°, 270°.
 * En dernier recours (scan de travers ou décalé), lit la page entière et déduit l'orientation de la position du QR code.
 * @returns {{ code: {id:number,page:number}|null, rot: number }} rot = rotation (sens horaire, en degrés) à appliquer pour remettre la page à l'endroit
 */
function findDashcode(canvas) {
    for (const deg of [0, 180, 90, 270]) {
        const c = rotated(canvas, deg);
        const r = decodeRegion(c, 0, 0, Math.round(c.width * 0.42), Math.round(c.height * 0.26));
        const p = r && parsePageCode(r.text, true);
        if (p) return { code: p, rot: deg };
    }
    const r = decodeRegion(canvas, 0, 0, canvas.width, canvas.height);
    const p = r && parsePageCode(r.text, true);
    if (!p) return { code: null, rot: 0 };
    const pts = [r.loc.topLeftCorner, r.loc.topRightCorner, r.loc.bottomLeftCorner, r.loc.bottomRightCorner];
    const cx = pts.reduce((n, q) => n + q.x, 0) / 4 / canvas.width, cy = pts.reduce((n, q) => n + q.y, 0) / 4 / canvas.height;
    const rot = cx < 0.5 ? (cy < 0.5 ? 0 : 90) : (cy < 0.5 ? 270 : 180);
    return { code: p, rot };
}

/** Analyse du fichier en tâche de fond : lit le QR code de chaque page. */
async function analyse(batchId, buffer) {
    let doc;
    try {
        doc = await openPdf(buffer);
        const total = Math.min(doc.numPages, MAX_PAGES);
        await pgDb.run('UPDATE hub_entretiens.crep_return_batches SET pages_total = ? WHERE id = ?', [total, batchId]);
        const info = await pgDb.get('SELECT channel, campaign_id FROM hub_entretiens.crep_return_batches WHERE id = ?', [batchId]);
        // Option « QR code » de la campagne désactivée : simple tentative rapide (des CREP imprimés avant la désactivation peuvent en porter un)
        const qrOn = !info?.campaign_id || (await pgDb.get('SELECT qr_code FROM hub_entretiens.campaigns WHERE id = ?', [info.campaign_id]))?.qr_code !== false;
        const pages = [];
        for (let i = 1; i <= total; i++) {
            let entry = { idx: i, code: null, rot: 0 };
            try { entry = { idx: i, ...(await findDashcodeRobust(doc, i, !qrOn)) }; }
            catch (e) { console.warn(`[ENTRETIENS] retours : page ${i} illisible :`, e.message); }
            pages.push(entry);
            if (i % 3 === 0 || i === total) {
                await pgDb.run('UPDATE hub_entretiens.crep_return_batches SET progress = ?, pages = CAST(? AS jsonb) WHERE id = ?', [i, JSON.stringify(pages), batchId]);
            }
        }
        const mailBatch = info?.channel === 'mail';
        // Pages sans QR code (option désactivée, QR illisible, CREP imprimé avant son activation) : lecture IA du nom de l'agent et du titre de la page
        const unresolved = pages.filter(p => !p.code);
        if (unresolved.length && !(mailBatch && total > 40)) {
            await pgDb.run("UPDATE hub_entretiens.crep_return_batches SET status = 'identification', progress = 0, phase_total = ?, pages = CAST(? AS jsonb) WHERE id = ?", [unresolved.length, JSON.stringify(pages), batchId]);
            try {
                await require('./crep-identify.service').identifyPages({
                    pages, campaignId: info?.campaign_id || null, doc, renderPage, deps: { rotated },
                    onProgress: async (done, n, ps) => { await pgDb.run('UPDATE hub_entretiens.crep_return_batches SET progress = ?, pages = CAST(? AS jsonb) WHERE id = ?', [done, JSON.stringify(ps), batchId]); },
                });
            } catch (e) { console.warn('[ENTRETIENS] retours : identification des pages par l’IA impossible :', e.message); }
        }
        const none = pages.every(p => !p.code && !p.auto);
        await pgDb.run(`UPDATE hub_entretiens.crep_return_batches SET status = ?, progress = ?, pages = CAST(? AS jsonb), finished_at = NOW() WHERE id = ?`, [none && mailBatch ? 'sans_crep' : 'a_verifier', total, JSON.stringify(pages), batchId]);
        // Contrôle des signatures sur la dernière page de chaque CREP (en tâche de fond : le lot est déjà consultable)
        if (!(none && mailBatch)) detectBatchSignatures(batchId).catch(e => console.warn('[ENTRETIENS] retours : détection des signatures :', e.message));
    } catch (e) {
        console.error('[ENTRETIENS] retours : analyse en échec :', e.message);
        await pgDb.run(`UPDATE hub_entretiens.crep_return_batches SET status = 'echec', error = ?, finished_at = NOW() WHERE id = ?`, [String(e.message || e).slice(0, 500), batchId]).catch(() => {});
    } finally { try { if (doc) await doc.destroy(); } catch { /* ignore */ } }
}

async function createBatch({ file, campaignId, actor, channel = 'drh', meta = null }) {
    await ensureTable();
    const saved = await storage.saveFile('entretiens-retours', 0, { buffer: file.buffer, originalname: file.originalname || 'retours-crep.pdf' });
    const row = await pgDb.get(
        `INSERT INTO hub_entretiens.crep_return_batches (campaign_id, created_by, file_path, file_name, channel, source_meta) VALUES (?, ?, ?, ?, ?, CAST(? AS jsonb)) RETURNING *`,
        [campaignId || null, actor.username || actor.email || '', saved.dbPath, file.originalname || 'retours-crep.pdf', channel === 'mail' ? 'mail' : 'drh', meta ? JSON.stringify(meta) : null]);
    // Analyse en arrière-plan (lecture des QR codes page par page)
    analyse(row.id, file.buffer);
    return row;
}

/** Contrôle visuel (IA) des 2 signatures sur une page « dernière page » du lot ; le résultat est conservé sur la page ({ agent, evaluateur } ou { unknown: true }). */
async function detectSignatureOnPage(batchId, idx) {
    let sig = null;
    try {
        const jpg = await pageImage(batchId, idx, 2000);
        if (jpg) sig = await require('./crep-scan.service').detectSignaturesOnImage(jpg);
    } catch (e) { console.warn(`[ENTRETIENS] retours : signatures page ${idx} indéterminées :`, e.message); }
    const b = await getBatch(batchId);
    if (!b) return;
    const pages = Array.isArray(b.pages) ? b.pages : [];
    const p = pages.find(x => x.idx === idx);
    if (!p) return;
    p.signatures = sig ? { agent: !!sig.agent, evaluateur: !!sig.evaluateur } : { unknown: true };
    await pgDb.run('UPDATE hub_entretiens.crep_return_batches SET pages = CAST(? AS jsonb) WHERE id = ?', [JSON.stringify(pages), batchId]);
}

async function detectBatchSignatures(batchId) {
    const b = await getBatch(batchId);
    const todo = (Array.isArray(b?.pages) ? b.pages : []).filter(p => !p.signatures && effective(p)?.page === 4).map(p => p.idx);
    for (const idx of todo) await detectSignatureOnPage(batchId, idx);
}

/** Code effectif d'une page : la correction manuelle de l'administrateur prime sur la lecture automatique. */
function effective(p) {
    if (p.ignore) return null;
    if (p.manual && p.manual.id && p.manual.page) return { id: Number(p.manual.id), page: Number(p.manual.page), manual: true };
    if (p.code) return { ...p.code, manual: false };
    if (p.auto && p.auto.id && p.auto.page) return { id: Number(p.auto.id), page: Number(p.auto.page), manual: false, auto: true };
    return null;
}

/** Vue d'un lot : CREP reconstitués (par entretien), avec contrôle du nombre de pages, et pages à classer à la main. */
async function describe(batch) {
    const pages = Array.isArray(batch.pages) ? batch.pages : [];
    const confirmed = batch.confirmed || {};
    const byEnt = new Map();
    const orphans = [];
    const ignored = [];
    for (const p of pages) {
        const e = effective(p);
        if (p.ignore) { ignored.push(p.idx); continue; }
        if (!e) { orphans.push({ idx: p.idx, foreign: p.foreign || null, suggest: p.suggest || null, read: p.read ? { titre: p.read.titre || '', agent: p.read.agent || '' } : null }); continue; }
        if (!byEnt.has(e.id)) byEnt.set(e.id, []);
        byEnt.get(e.id).push({ idx: p.idx, page: e.page, rot: p.rot || 0, manual: e.manual, signatures: p.signatures || null, source: e.manual ? 'manuel' : e.auto ? 'nom' : 'qr', assoc: p.auto || null, unverified: !!(p.code && p.code.unverified) });
    }
    const ids = [...byEnt.keys()];
    const rows = ids.length ? await pgDb.all(
        `SELECT id, agent_nom, agent_prenom, direction, service, evaluator_nom, campaign_id, crep_signed_path, crep_signed_at, evaluation_statut
           FROM hub_entretiens.entretiens WHERE id IN (${ids.map(() => '?').join(',')}) AND deleted_at IS NULL`, ids) : [];
    const meta = new Map(rows.map(r => [r.id, r]));
    const groups = ids.map(id => {
        const list = byEnt.get(id).sort((a, b) => a.page - b.page || a.idx - b.idx);
        const nums = list.map(l => l.page);
        const missing = [];
        for (let n = 1; n <= EXPECTED_PAGES; n++) if (!nums.includes(n)) missing.push(n);
        const duplicates = [...new Set(nums.filter((n, i) => nums.indexOf(n) !== i))];
        const outOfRange = [...new Set(nums.filter(n => n < 1 || n > EXPECTED_PAGES))];
        const m = meta.get(id);
        return {
            entretien_id: id,
            known: !!m,
            agent: m ? `${m.agent_nom || ''} ${m.agent_prenom || ''}`.trim() : null,
            direction: m?.direction || '', service: m?.service || '', evaluateur: m?.evaluator_nom || '',
            already_received: !!m?.crep_signed_path,
            confirmed: confirmed[id] || null,
            pages: list.map(({ signatures, assoc, ...rest }) => rest),
            // Comment l'agent a été retenu : QR code, lecture du nom (avec taux de certitude et autres candidats) ou choix manuel
            assoc: (() => {
                const src = list.some(l => l.source === 'manuel') ? 'manuel' : list.some(l => l.source === 'qr') ? 'qr' : 'nom';
                const a = (list.find(l => l.assoc) || {}).assoc || null;
                return { source: src, read_name: a?.read_name || '', confidence: src === 'nom' ? (a?.confidence ?? null) : null, candidates: a?.candidates || [], page_guess: list.some(l => l.assoc && l.assoc.page_guess), unverified: list.some(l => l.unverified) };
            })(),
            // Signatures vues sur la dernière page : { agent, evaluateur } ; null = contrôle en cours ; { unknown: true } = indéterminé
            signatures: (list.find(l => l.page === EXPECTED_PAGES) || {}).signatures || null,
            missing, duplicates, out_of_range: outOfRange,
            complete: !!m && !missing.length && !duplicates.length && !outOfRange.length && list.length === EXPECTED_PAGES,
            // Le CREP de l'agent n'appartient pas à la campagne du lot (ex. mauvais fichier)
            other_campaign: !!(m && batch.campaign_id && m.campaign_id !== batch.campaign_id),
        };
    }).sort((a, b) => String(a.agent || '').localeCompare(String(b.agent || ''), 'fr'));
    return {
        phase_total: batch.phase_total || 0,
        id: batch.id, campaign_id: batch.campaign_id, status: batch.status, channel: batch.channel || 'drh', source_meta: batch.source_meta || null, file_name: batch.file_name, error: batch.error,
        pages_total: batch.pages_total, progress: batch.progress, created_at: batch.created_at, created_by: batch.created_by,
        expected_pages: EXPECTED_PAGES, groups, orphans, ignored,
    };
}

async function getBatch(id) {
    await ensureTable();
    return pgDb.get('SELECT * FROM hub_entretiens.crep_return_batches WHERE id = ?', [id]);
}

async function listBatches(campaignId) {
    await ensureTable();
    return pgDb.all(
        `SELECT id, campaign_id, created_by, file_name, status, pages_total, phase_total, progress, created_at, channel, source_meta FROM hub_entretiens.crep_return_batches ${campaignId ? 'WHERE campaign_id = ?' : ''} ORDER BY id DESC LIMIT 30`,
        campaignId ? [campaignId] : []);
}

/** Correction manuelle d'une page : { entretien_id, page } pour la rattacher, { ignore: true } pour l'écarter, {} pour annuler la correction. */
async function assignPage(batchId, idx, body) {
    const batch = await getBatch(batchId);
    if (!batch) { const e = new Error('Lot introuvable.'); e.status = 404; throw e; }
    const pages = Array.isArray(batch.pages) ? batch.pages : [];
    const p = pages.find(x => x.idx === idx);
    if (!p) { const e = new Error('Page introuvable dans ce lot.'); e.status = 404; throw e; }
    delete p.manual; delete p.ignore;
    if (body && body.ignore === true) p.ignore = true;
    else if (body && Number(body.entretien_id) > 0) {
        const page = Number(body.page);
        if (!Number.isInteger(page) || page < 1 || page > EXPECTED_PAGES) { const e = new Error(`Le numéro de page doit être compris entre 1 et ${EXPECTED_PAGES}.`); e.status = 400; throw e; }
        const ent = await pgDb.get('SELECT id FROM hub_entretiens.entretiens WHERE id = ? AND deleted_at IS NULL', [Number(body.entretien_id)]);
        if (!ent) { const e = new Error('Entretien introuvable.'); e.status = 404; throw e; }
        p.manual = { id: ent.id, page };
    }
    if (body && Number.isInteger(Number(body.rot)) && [0, 90, 180, 270].includes(Number(body.rot))) p.rot = Number(body.rot);
    await pgDb.run("UPDATE hub_entretiens.crep_return_batches SET pages = CAST(? AS jsonb), status = CASE WHEN status = 'sans_crep' AND ? THEN 'a_verifier' ELSE status END WHERE id = ?", [JSON.stringify(pages), !!(p.manual && p.manual.id), batchId]);
    // Page rattachée à la main comme dernière page : contrôle des signatures
    if (p.manual && p.manual.page === EXPECTED_PAGES && !p.signatures) detectSignatureOnPage(batchId, idx).catch(() => {});
}

/** Affecte d'un coup toutes les pages d'un CREP reconstitué à un autre agent (en conservant le numéro de chaque page). */
async function assignGroup(batchId, idxs, entretienId) {
    const batch = await getBatch(batchId);
    if (!batch) { const e = new Error('Lot introuvable.'); e.status = 404; throw e; }
    const ent = await pgDb.get('SELECT id FROM hub_entretiens.entretiens WHERE id = ? AND deleted_at IS NULL', [Number(entretienId)]);
    if (!ent) { const e = new Error('Entretien introuvable.'); e.status = 404; throw e; }
    const pages = Array.isArray(batch.pages) ? batch.pages : [];
    let n = 0;
    for (const idx of idxs) {
        const p = pages.find(x => x.idx === Number(idx));
        const eff = p && effective(p);
        if (!p || !eff || !eff.page) continue;
        p.manual = { id: ent.id, page: eff.page };
        delete p.ignore;
        n++;
    }
    await pgDb.run("UPDATE hub_entretiens.crep_return_batches SET pages = CAST(? AS jsonb), status = CASE WHEN status = 'sans_crep' THEN 'a_verifier' ELSE status END WHERE id = ?", [JSON.stringify(pages), batchId]);
    return n;
}

/** Miniature (JPEG) d'une page du lot, remise à l'endroit. */
async function pageImage(batchId, idx, width = THUMB_WIDTH_PX) {
    const batch = await getBatch(batchId);
    if (!batch) return null;
    const p = (batch.pages || []).find(x => x.idx === idx);
    if (!p) return null;
    const doc = await openPdf(await readStored(batch.file_path));
    try {
        const canvas = rotated(await renderPage(doc, idx, width), p.rot || 0);
        return canvas.toBuffer('image/jpeg', 80);
    } finally { try { await doc.destroy(); } catch { /* ignore */ } }
}

/** Assemble les pages d'un CREP (dans l'ordre 1..N, remises à l'endroit) en un PDF. */
async function buildCrepPdf(srcBuffer, list) {
    const { PDFDocument, degrees } = require('pdf-lib');
    const src = await PDFDocument.load(srcBuffer, { ignoreEncryption: true });
    const out = await PDFDocument.create();
    for (const l of list) {
        const [pg] = await out.copyPages(src, [l.idx - 1]);
        if (l.rot) pg.setRotation(degrees(((pg.getRotation().angle || 0) + l.rot) % 360));
        out.addPage(pg);
    }
    return Buffer.from(await out.save());
}

/**
 * Valide le regroupement : pour chaque entretien demandé (CREP complet), enregistre le CREP signé, déclare la réception,
 * puis lance la lecture IA en parallèle (résultat réservé aux administrateurs).
 */
async function confirmGroups(batchId, { entretienIds, replace, actor }) {
    const svc = require('./entretiens.service');
    const batch = await getBatch(batchId);
    if (!batch) { const e = new Error('Lot introuvable.'); e.status = 404; throw e; }
    if (batch.status === 'identification') { const e = new Error('La lecture des noms est en cours : attendez la fin de l’identification.'); e.status = 409; throw e; }
    if (!['a_verifier', 'sans_crep'].includes(batch.status)) { const e = new Error('Ce lot n’est pas (ou plus) en attente de vérification.'); e.status = 409; throw e; }
    const view = await describe(batch);
    const srcBuffer = await readStored(batch.file_path);
    const confirmed = batch.confirmed || {};
    const results = [];
    const canalDetail = (b) => (b.channel === 'mail' ? [b.source_meta?.from, b.source_meta?.subject].filter(Boolean).join(' — ') : (b.file_name || '')).slice(0, 300);
    for (const id of entretienIds) {
        const g = view.groups.find(x => x.entretien_id === id);
        const name = g?.agent || `entretien ${id}`;
        if (!g || !g.known) { results.push({ entretien_id: id, ok: false, message: 'CREP inconnu.' }); continue; }
        if (!g.complete) { results.push({ entretien_id: id, ok: false, agent: name, message: `CREP incomplet (${g.pages.length}/${EXPECTED_PAGES} page(s)) : corrigez le regroupement avant de valider.` }); continue; }
        if (g.confirmed) { results.push({ entretien_id: id, ok: false, agent: name, message: 'Déjà validé dans ce lot.' }); continue; }
        if (g.already_received && !replace) { results.push({ entretien_id: id, ok: false, agent: name, needs_replace: true, message: 'Un CREP signé est déjà enregistré pour cet agent : confirmez son remplacement.' }); continue; }
        try {
            const row = await svc.getEntretienById(id);
            const pdf = await buildCrepPdf(srcBuffer, g.pages);
            const saved = await storage.saveFile('entretiens', id, { buffer: pdf, originalname: 'CREP-signe.pdf' });
            const previous = row.crep_signed_path;
            const by = actor.username || actor.email || '';
            await pgDb.run(
                `UPDATE hub_entretiens.entretiens SET crep_signed_path = ?, crep_signed_name = 'CREP-signe.pdf', crep_signed_at = NOW(), crep_signed_by = ?, crep_statut = 'signe_papier',
                        drh_received_at = COALESCE(drh_received_at, NOW()), drh_received_by = COALESCE(drh_received_by, ?),
                        crep_canal = ?, crep_canal_detail = ?, updated_at = NOW() WHERE id = ?`,
                [saved.dbPath, by, by, batch.channel === 'mail' ? 'mail' : 'drh', canalDetail(batch), id]);
            if (previous && previous !== saved.dbPath) { try { await storage.deleteFile(previous); } catch { /* ancien fichier : sans conséquence */ } }
            // La vérification par l'administrateur clôt l'entretien (mode simple ou non)
            const camp = await pgDb.get('SELECT annee FROM hub_entretiens.campaigns WHERE id = ?', [row.campaign_id]);
            if (row.statut !== 'cloture') {
                await pgDb.run("UPDATE hub_entretiens.entretiens SET statut = 'cloture', updated_at = NOW() WHERE id = ?", [id]);
            }
            await svc.logAudit({ actor, action: 'crep_retour_numerise', entretien: row, details: { lot: batchId, pages: g.pages.map(p => p.idx) } });
            // Lecture IA du CREP signé, en parallèle (tâche de fond, file unique côté serveur)
            let lecture = null;
            try {
                const jobs = require('./crep-scan-jobs');
                const cdef = require('./crep.definition').definitionFor(await require('../ep-base/ep-base.service').modeleOfEntretien(row));
                const job = await jobs.start({
                    row, actor, definition: cdef, annee: camp?.annee,
                    mode: row.evaluation_statut === 'soumis' ? 'agent' : 'complet',
                    silent: true,
                    files: [{ buffer: pdf, mimetype: 'application/pdf', name: 'CREP-signe.pdf' }],
                    contexte: { agent: svc.fullName(row.agent_prenom, row.agent_nom), poste: row.poste || '', service: row.service || '', direction: row.direction || '', grade: row.agent_grade || '' },
                });
                // Le scan numérisé est conservé sur l'entretien ; le résultat de la lecture reste consultable par les administrateurs
                await jobs.ack(id, job.id, true, by, { signaturesOk: false });
                lecture = job.id;
            } catch (e) { console.warn('[ENTRETIENS] retours : lecture IA non lancée :', e.message); }
            // Remerciements : l'agent et son évaluateur sont prévenus que tout est en ordre pour la DRH
            const mailing = [];
            try {
                const epBeta = require('../../shared/ep-beta-mail');
                const { sendParapheurEmail } = require('../parapheur/parapheur.service');
                const email = require('./entretiens-email');
                const agentNom = svc.fullName(row.agent_prenom, row.agent_nom);
                const dest = [[row.agent_email, agentNom], [row.evaluator_email, row.evaluator_nom]]
                    .filter(([adr], i, arr) => adr && arr.findIndex(([a]) => String(a).toLowerCase() === String(adr).toLowerCase()) === i);
                for (const [adr, nom] of dest) {
                    try {
                        if (!(await epBeta.allowedForEntretien(row, adr, 'CREP reçu'))) continue;
                        await sendParapheurEmail(adr, email.crepRecu({ destinataire: nom || 'Madame, Monsieur', agent: agentNom, annee: camp?.annee, evaluateur: row.evaluator_nom }));
                        mailing.push(adr);
                    } catch (e) { console.warn('[ENTRETIENS] retours : e-mail de remerciement non envoyé à', adr, ':', e.message); }
                }
            } catch (e) { console.warn('[ENTRETIENS] retours : e-mails de remerciement indisponibles :', e.message); }
            confirmed[id] = { at: new Date().toISOString(), by, job: lecture, mails: mailing.length };
            results.push({ entretien_id: id, ok: true, agent: name, lecture, mails: mailing.length });
        } catch (e) {
            console.error('[ENTRETIENS] retours : validation en échec :', e.message);
            results.push({ entretien_id: id, ok: false, agent: name, message: e.message });
        }
    }
    await pgDb.run('UPDATE hub_entretiens.crep_return_batches SET confirmed = CAST(? AS jsonb) WHERE id = ?', [JSON.stringify(confirmed), batchId]);
    // Lot terminé quand tous les CREP reconnus ont été validés
    const fresh = await describe(await getBatch(batchId));
    if (fresh.groups.length && fresh.groups.every(g => g.confirmed) && !fresh.orphans.length) {
        await pgDb.run("UPDATE hub_entretiens.crep_return_batches SET status = 'termine' WHERE id = ?", [batchId]);
    }
    return results;
}

/** Relance la lecture des QR codes d'un lot déjà enregistré (analyse améliorée, fichier mal lu…). */
async function reanalyse(batchId) {
    const batch = await getBatch(batchId);
    if (!batch) { const e = new Error('Lot introuvable.'); e.status = 404; throw e; }
    if (batch.status === 'analyse' || batch.status === 'identification') { const e = new Error('Analyse déjà en cours.'); e.status = 409; throw e; }
    const buffer = await readStored(batch.file_path);
    await pgDb.run("UPDATE hub_entretiens.crep_return_batches SET status = 'analyse', progress = 0, pages = '[]'::jsonb, confirmed = '{}'::jsonb, error = NULL WHERE id = ?", [batchId]);
    analyse(batchId, buffer);
}

async function deleteBatch(batchId) {
    const batch = await getBatch(batchId);
    if (!batch) return;
    try { if (batch.file_path) await storage.deleteFile(batch.file_path); } catch { /* fichier déjà absent */ }
    await pgDb.run('DELETE FROM hub_entretiens.crep_return_batches WHERE id = ?', [batchId]);
}

/**
 * Supprime le retour de CREP d'un entretien (erreur d'affectation, mauvais document…) : le CREP signé et ses copies numérisées sont effacés,
 * la réception DRH et le canal d'entrée sont retirés, l'entretien clôturé repasse à « réalisé », et le CREP redevient validable dans son lot d'origine.
 */
async function deleteReturn(entretienId, actor) {
    const svc = require('./entretiens.service');
    const row = await svc.getEntretienById(entretienId);
    if (!row) { const e = new Error('Entretien introuvable.'); e.status = 404; throw e; }
    if (!row.crep_signed_path && !row.drh_received_at) { const e = new Error('Aucun retour de CREP enregistré pour cet entretien.'); e.status = 400; throw e; }
    const files = new Set();
    if (row.crep_signed_path) files.add(row.crep_signed_path);
    // copies numérisées issues de la lecture IA du retour (lectures « silencieuses »)
    try { await require('./crep-scan-jobs').ensureTable(); } catch { /* table absente */ }
    const jobs = await pgDb.all('SELECT id, scan_path FROM hub_entretiens.crep_scan_jobs WHERE entretien_id = ? AND silent', [entretienId]).catch(() => []);
    const jobIds = new Set(jobs.map(j => j.id));
    for (const j of jobs) if (j.scan_path) files.add(j.scan_path);
    const scans = (typeof row.crep_scans === 'string' ? JSON.parse(row.crep_scans || '[]') : (row.crep_scans || [])).filter(x => x);
    const keep = scans.filter(x => !(x.silent || jobIds.has(x.job)));
    for (const x of scans) if (!keep.includes(x) && x.path) files.add(x.path);
    for (const f of files) { try { await storage.deleteFile(f); } catch { /* déjà absent */ } }
    if (jobs.length) await pgDb.run('DELETE FROM hub_entretiens.crep_scan_jobs WHERE entretien_id = ? AND silent', [entretienId]);
    await pgDb.run(
        `UPDATE hub_entretiens.entretiens SET crep_signed_path = NULL, crep_signed_name = NULL, crep_signed_at = NULL, crep_signed_by = NULL,
                crep_statut = CASE WHEN crep_statut = 'signe_papier' THEN 'non_envoye' ELSE crep_statut END,
                statut = CASE WHEN statut = 'cloture' THEN 'realise' ELSE statut END,
                drh_received_at = NULL, drh_received_by = NULL, crep_canal = NULL, crep_canal_detail = NULL,
                crep_scans = CAST(? AS jsonb), updated_at = NOW() WHERE id = ?`, [JSON.stringify(keep), entretienId]);
    // Le lot d'origine remet ce CREP « à valider » (il peut être revalidé ou ignoré)
    const batches = await pgDb.all('SELECT id, confirmed, status FROM hub_entretiens.crep_return_batches WHERE jsonb_exists(confirmed, ?)', [String(entretienId)]).catch(() => []);
    for (const b of batches) {
        const conf = b.confirmed || {}; delete conf[entretienId];
        await pgDb.run(`UPDATE hub_entretiens.crep_return_batches SET confirmed = CAST(? AS jsonb), status = CASE WHEN status = 'termine' THEN 'a_verifier' ELSE status END WHERE id = ?`, [JSON.stringify(conf), b.id]);
    }
    await svc.logAudit({ actor, action: 'crep_retour_supprime', entretien: row, details: { fichiers: files.size, lots: batches.map(b => b.id) } });
}

/** Tableau de suivi : un EP par ligne avec son avancement (programmé / réalisé / retourné). */
async function summary(campaignId) {
    await ensureTable();
    try { await require('./crep-scan-jobs').ensureTable(); } catch { /* table de lecture absente : sans conséquence */ }
    const rows = await pgDb.all(
        `SELECT e.id, e.agent_nom, e.agent_prenom, e.direction, e.service, e.evaluator_nom, e.date_entretien, e.statut, e.evaluation_statut, e.crep_mode,
                e.crep_signed_path, e.crep_signed_at, e.drh_received_at, e.simple_sent_at, e.simple_sent_by, e.crep_canal, e.crep_canal_detail,
                (SELECT j.status FROM hub_entretiens.crep_scan_jobs j WHERE j.entretien_id = e.id AND j.silent ORDER BY j.id DESC LIMIT 1) AS lecture_statut,
                (SELECT j.result->'signatures' FROM hub_entretiens.crep_scan_jobs j WHERE j.entretien_id = e.id AND j.silent AND j.status = 'termine' ORDER BY j.id DESC LIMIT 1) AS lecture_signatures,
                e.crep_statut, (SELECT p.status FROM hub_parapheur.parapheurs p WHERE p.id = e.crep_parapheur_id) AS parapheur_status
           FROM hub_entretiens.entretiens e
          WHERE e.campaign_id = ? AND e.deleted_at IS NULL
          ORDER BY e.agent_nom, e.agent_prenom`, [campaignId]);
    const now = Date.now();
    const out = rows.map(r => {
        const d = r.date_entretien ? new Date(String(r.date_entretien).replace(' ', 'T')) : null;
        const hasDate = !!(d && !isNaN(d.getTime()));
        const programme = hasDate;
        const realise = ['realise', 'cloture'].includes(r.statut);
        const retourne = !!(r.crep_signed_path || r.drh_received_at);
        // Signatures du CREP : cosigné au parapheur = 2 signatures ; sinon détection de la lecture IA du document numérisé (null = pas encore connue)
        const sg = r.parapheur_status === 'termine' ? { agent: true, evaluateur: true } : (r.lecture_signatures && typeof r.lecture_signatures === 'object' ? r.lecture_signatures : null);
        const signatures = sg ? (sg.agent && sg.evaluateur ? 'ok' : 'manque') : null;
        const en_retard = !realise && hasDate && d.getTime() < now;
        return { ...r, programme, realise, retourne, en_retard, transmis_simple: !!r.simple_sent_at, signatures, signatures_detail: sg ? { agent: !!sg.agent, evaluateur: !!sg.evaluateur } : null, crep_signe_dispo: !!(r.crep_signed_path || r.parapheur_status === 'termine') };
    });
    const count = (f) => out.filter(f).length;
    return {
        kpis: {
            total: out.length,
            programmes: count(r => r.programme),
            realises: count(r => r.realise),
            en_retard: count(r => r.en_retard),
            retournes: count(r => r.retourne),
            en_attente_numerisation: count(r => r.transmis_simple && !r.retourne),
        },
        rows: out,
    };
}

/** Lecture IA (réservée aux administrateurs) du dernier CREP numérisé d'un entretien. */
async function reading(entretienId) {
    await ensureTable();
    try { await require('./crep-scan-jobs').ensureTable(); } catch { /* ignore */ }
    const job = await pgDb.get(`SELECT id, status, error, result, finished_at, mode FROM hub_entretiens.crep_scan_jobs WHERE entretien_id = ? AND silent ORDER BY id DESC LIMIT 1`, [entretienId]);
    return job || null;
}

module.exports = { _internal: { openPdf, renderPage, findDashcode, findDashcodeRobust, rotated, detectSignatureOnPage }, EXPECTED_PAGES, ensureTable, createBatch, getBatch, describe, listBatches, assignPage, pageImage, confirmGroups, deleteBatch, deleteReturn, reanalyse, assignGroup, summary, reading };
