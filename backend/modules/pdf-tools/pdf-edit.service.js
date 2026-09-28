/**
 * Éditeur de contenu PDF (vrai niveau contenu) pour les outils PDF.
 *
 * Contrairement à une simple superposition, on décode les flux de contenu des
 * pages, on les analyse (opérateurs PDF), on expose les objets (textes et
 * tracés vectoriels) avec leur position, puis on RÉÉCRIT le flux :
 *   - suppression d'objets (on retire les opérateurs concernés),
 *   - déplacement (on encadre le bloc/Q-Q avec une matrice de translation),
 *   - édition de texte (remplacement de l'opérande des opérateurs Tj/TJ).
 *
 * Les ajouts (texte, rectangles, lignes, surlignage, image, gomme) sont
 * dessinés avec pdf-lib après la réécriture.
 *
 * Limites connues : les polices sous-ensembles (CID subset) ne permettent pas
 * de ré-écrire du texte arbitraire ; les flux non Flate ou chiffrés sont
 * ignorés. Fonctionne bien sur les PDF « bureautiques » classiques.
 */
const zlib = require('zlib');
const {
    PDFDocument, StandardFonts, rgb, degrees, PDFName, PDFRawStream,
    moveTo, lineTo, closePath, fill,
} = require('pdf-lib');

// ─── Matrices (PDF : [a b c d e f]) ─────────────────────────────────────────
const IDENTITY = [1, 0, 0, 1, 0, 0];
function mmul(m, n) {
    return [
        m[0] * n[0] + m[1] * n[2], m[0] * n[1] + m[1] * n[3],
        m[2] * n[0] + m[3] * n[2], m[2] * n[1] + m[3] * n[3],
        m[4] * n[0] + m[5] * n[2] + n[4], m[4] * n[1] + m[5] * n[3] + n[5],
    ];
}
function mapply(m, x, y) { return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]]; }

// ─── Décompression / encodage des flux de contenu ───────────────────────────
function decodeContentStream(rawStream) {
    const dict = rawStream.dict;
    const filter = dict.get(PDFName.of('Filter'));
    const filterName = filter ? (filter.asString ? filter.asString() : String(filter)) : '';
    const bytes = Buffer.from(rawStream.getContents());
    if (!filterName) return bytes.toString('latin1');
    if (filterName === '/FlateDecode') {
        try { return zlib.inflateSync(bytes).toString('latin1'); } catch (e) { return null; }
    }
    return null; // ASCII/other filters : non gérés
}

function collectPageContent(page, context) {
    const contents = page.node.Contents();
    if (!contents) return '';
    // Contents() peut être une PDFArray (liste de flux) — pdf-lib renvoie
    // l'objet PDFArray, pas un tableau JS.
    const resolved = context.lookup(contents);
    const refs = (resolved && typeof resolved.asArray === 'function') ? resolved.asArray() : [contents];
    const parts = [];
    for (const ref of refs) {
        const obj = context.lookup(ref);
        if (!obj) continue;
        if (obj instanceof PDFRawStream) {
            const txt = decodeContentStream(obj);
            if (txt != null) parts.push(txt);
        } else if (obj && typeof obj.getContents === 'function') {
            try { parts.push(Buffer.from(obj.getContents()).toString('latin1')); } catch (e) { /* ignore */ }
        }
    }
    return parts.join('\n');
}

// ─── Tokenizer de contenu PDF ───────────────────────────────────────────────
// Renvoie une liste d'opérateurs { op, operands, start, end } où start/end
// délimitent la portion de texte d'origine (opérandes + opérateur).
function parseOperators(content) {
    const ops = [];
    let i = 0;
    const n = content.length;
    let operandsStart = -1;
    const operands = [];

    const isWS = (c) => c === ' ' || c === '\n' || c === '\r' || c === '\t' || c === '\f' || c === '\0';
    const isDelim = (c) => '()<>[]{}/%'.includes(c);

    function skipWS() {
        while (i < n) {
            const c = content[i];
            if (isWS(c)) { i++; continue; }
            if (c === '%') { while (i < n && content[i] !== '\n' && content[i] !== '\r') i++; continue; }
            break;
        }
    }

    function readString() {
        const start = i; i++; // (
        let depth = 1;
        while (i < n) {
            const c = content[i];
            if (c === '\\') { i += 2; continue; }
            if (c === '(') depth++;
            else if (c === ')') { depth--; if (depth === 0) { i++; break; } }
            i++;
        }
        return { type: 'string', raw: content.slice(start, i) };
    }
    function readHexString() {
        const start = i; i++; // <
        while (i < n && content[i] !== '>') i++;
        i++;
        return { type: 'string', raw: content.slice(start, i) };
    }
    function readArray() {
        const start = i; i++; // [
        let depth = 1;
        while (i < n && depth > 0) {
            const c = content[i];
            if (c === '\\') { i += 2; continue; }
            if (c === '(') { // string imbriquée
                i++; let d2 = 1;
                while (i < n && d2 > 0) {
                    if (content[i] === '\\') { i += 2; continue; }
                    if (content[i] === '(') d2++;
                    else if (content[i] === ')') d2--;
                    i++;
                }
                continue;
            }
            if (c === '[') depth++;
            else if (c === ']') depth--;
            i++;
        }
        return { type: 'array', raw: content.slice(start, i) };
    }
    function readToken() {
        skipWS();
        if (i >= n) return null;
        const start = i;
        const c = content[i];
        if (c === '(') return readString();
        if (c === '<') return content[i + 1] === '<' ? { type: 'rawdict', raw: readDictRaw() } : readHexString();
        if (c === '[') return readArray();
        if (c === ']' || c === '>' || c === ')' || c === '{' || c === '}') { i++; return { type: 'delim', raw: c }; }
        if (c === '/') {
            i++;
            while (i < n && !isWS(content[i]) && !isDelim(content[i])) i++;
            return { type: 'name', raw: content.slice(start, i) };
        }
        // nombre ou mot-clé
        while (i < n && !isWS(content[i]) && !isDelim(content[i])) i++;
        const raw = content.slice(start, i);
        if (/^[+-]?(\d+\.?\d*|\.\d+)$/.test(raw)) return { type: 'number', raw, value: parseFloat(raw) };
        return { type: 'op', raw };
    }
    function readDictRaw() {
        const start = i; i += 2;
        let depth = 1;
        while (i < n && depth > 0) {
            if (content[i] === '<' && content[i + 1] === '<') { depth++; i += 2; continue; }
            if (content[i] === '>' && content[i + 1] === '>') { depth--; i += 2; continue; }
            i++;
        }
        return content.slice(start, i);
    }

    while (true) {
        skipWS();
        if (i >= n) break;
        const tokStart = i;
        const tok = readToken();
        if (!tok) break;
        if (tok.type === 'op') {
            ops.push({ op: tok.raw, operands: operands.splice(0, operands.length), start: operandsStart >= 0 ? operandsStart : tokStart, end: i });
            operandsStart = -1;
        } else {
            if (operandsStart < 0) operandsStart = tokStart;
            operands.push(tok);
        }
    }
    return ops;
}

// ─── Analyse : objets (textes / tracés) avec position ───────────────────────
const PATH_CONSTRUCT = new Set(['m', 'l', 'c', 'v', 'y', 're', 'h']);
const PATH_PAINT = new Set(['S', 's', 'f', 'F', 'f*', 'B', 'B*', 'b', 'b*']);
const TEXT_SHOW = new Set(['Tj', 'TJ', "'", '"']);

function num(op, i, def = 0) {
    const o = op.operands[i];
    return o && typeof o.value === 'number' ? o.value : def;
}
function strOf(operand) {
    if (!operand || !operand.raw) return '';
    let raw = operand.raw;
    // décodage « au mieux » des chaînes simples (latin1, échappements basiques)
    if (raw.startsWith('(') && raw.endsWith(')')) {
        let s = raw.slice(1, -1);
        s = s.replace(/\\([nrtbf()\\])/g, (_, c) => ({ n: '\n', r: '\r', t: '\t', b: '\b', f: '\f' }[c] || c));
        s = s.replace(/\\([0-7]{1,3})/g, (_, o) => String.fromCharCode(parseInt(o, 8)));
        return s;
    }
    if (raw.startsWith('<') && raw.endsWith('>')) {
        const hex = raw.slice(1, -1).replace(/[^0-9a-fA-F]/g, '');
        let s = '';
        for (let k = 0; k + 1 < hex.length; k += 2) s += String.fromCharCode(parseInt(hex.substr(k, 2), 16));
        return s;
    }
    return '';
}

function parsePage(content, pageIndex) {
    const ops = parseOperators(content);
    const objects = [];
    let ctm = IDENTITY.slice();
    const stack = [];
    let tm = IDENTITY.slice();
    let tlm = IDENTITY.slice();
    let fontSize = 0;
    let leading = 0;
    let inText = false;
    let btOpIndex = -1;
    let pathPoints = [];
    let pathStartOp = -1;

    const expandBox = (box, x, y) => {
        box[0] = Math.min(box[0], x); box[1] = Math.min(box[1], y);
        box[2] = Math.max(box[2], x); box[3] = Math.max(box[3], y);
    };

    ops.forEach((op, idx) => {
        const o = op.op;
        switch (o) {
            case 'q': stack.push({ ctm: ctm.slice(), fontSize, leading }); break;
            case 'Q': { const s = stack.pop(); if (s) { ctm = s.ctm; fontSize = s.fontSize; leading = s.leading; } break; }
            case 'cm': ctm = mmul([num(op, 0, 1), num(op, 1), num(op, 2), num(op, 3), num(op, 4), num(op, 5)], ctm); break;
            case 'BT': inText = true; tm = IDENTITY.slice(); tlm = IDENTITY.slice(); btOpIndex = idx; break;
            case 'ET': inText = false; break;
            case 'Tf': fontSize = num(op, 1); break;
            case 'TL': leading = num(op, 0); break;
            case 'Tm': tm = [num(op, 0, 1), num(op, 1), num(op, 2), num(op, 3), num(op, 4), num(op, 5)]; tlm = tm.slice(); break;
            case 'Td': tlm = mmul([1, 0, 0, 1, num(op, 0), num(op, 1)], tlm); tm = tlm.slice(); break;
            case 'TD': leading = -num(op, 1); tlm = mmul([1, 0, 0, 1, num(op, 0), num(op, 1)], tlm); tm = tlm.slice(); break;
            case 'T*': tlm = mmul([1, 0, 0, 1, 0, -leading], tlm); tm = tlm.slice(); break;
            case 'Tj': case "'": case '"': case 'TJ': {
                // Largeur approximative (police non résolue) : ~0.5 em par caractère.
                let width = 0;
                let text = '';
                if (o === 'TJ' && op.operands[0] && op.operands[0].type === 'array') {
                    const inner = op.operands[0].raw.slice(1, -1);
                    for (const sub of (inner.match(/\((?:[^()\\]|\\.)*\)|<[0-9a-fA-F\s]*>|[+-]?\d+\.?\d*/g) || [])) {
                        if (sub.startsWith('(') || sub.startsWith('<')) {
                            const s = strOf({ raw: sub });
                            text += s; width += s.length * fontSize * 0.5;
                        } else {
                            width += (-parseFloat(sub) / 1000) * fontSize;
                        }
                    }
                } else {
                    const operand = o === '"' ? op.operands[2] : (o === "'" ? op.operands[0] : op.operands[0]);
                    text = strOf(operand);
                    width = text.length * fontSize * 0.5;
                }
                const full = mmul(ctm, tm);
                const p0 = mapply(full, 0, 0);
                const p1 = mapply(full, width, 0);
                const p2 = mapply(full, 0, fontSize);
                const box = [Infinity, Infinity, -Infinity, -Infinity];
                expandBox(box, p0[0], p0[1]); expandBox(box, p1[0], p1[1]); expandBox(box, p2[0], p2[1]);
                objects.push({
                    id: `p${pageIndex}:${idx}`, kind: 'text', opIndex: idx, blockStart: btOpIndex, blockEnd: -1,
                    bbox: box, text, fontSize,
                });
                // avance du curseur texte
                tlm = mmul([1, 0, 0, 1, width, 0], tlm); tm = tlm.slice();
                break;
            }
            case 'm': case 'l': case 'c': case 'v': case 'y': {
                if (pathStartOp < 0) pathStartOp = idx;
                const p = mapply(ctm, num(op, 0), num(op, 1));
                pathPoints.push(p);
                if (o === 'c') { pathPoints.push(mapply(ctm, num(op, 2), num(op, 3)), mapply(ctm, num(op, 4), num(op, 5))); }
                if (o === 'v' || o === 'y') { pathPoints.push(mapply(ctm, num(op, 2), num(op, 3))); }
                break;
            }
            case 're': {
                if (pathStartOp < 0) pathStartOp = idx;
                const x = num(op, 0), y = num(op, 1), w = num(op, 2), h = num(op, 3);
                [[x, y], [x + w, y], [x + w, y + h], [x, y + h]].forEach(([px, py]) => pathPoints.push(mapply(ctm, px, py)));
                break;
            }
            case 'h': break;
            default:
                if (PATH_PAINT.has(o)) {
                    if (pathPoints.length && pathStartOp >= 0) {
                        const box = [Infinity, Infinity, -Infinity, -Infinity];
                        pathPoints.forEach(([px, py]) => expandBox(box, px, py));
                        objects.push({ id: `p${pageIndex}:${idx}`, kind: 'path', opIndex: idx, groupStart: pathStartOp, groupEnd: idx, bbox: box });
                    }
                    pathPoints = []; pathStartOp = -1;
                }
        }
    });

    // bloc texte = plage BT..ET englobante pour chaque texte
    for (const ob of objects) {
        if (ob.kind === 'text' && ob.blockEnd < 0) {
            // fin = prochain ET après opIndex (approximation)
            let end = ops.length - 1;
            for (let k = ob.opIndex; k < ops.length; k++) { if (ops[k].op === 'ET') { end = k; break; } }
            ob.blockEnd = end;
        }
    }

    return { ops, objects };
}

async function listObjects(buffer) {
    const pdfDoc = await PDFDocument.load(buffer, { ignoreEncryption: true });
    const context = pdfDoc.context;
    const pages = pdfDoc.getPages().map((page, index) => {
        const { width, height } = page.getSize();
        let parsed = { objects: [] };
        try {
            const content = collectPageContent(page, context);
            parsed = parsePage(content, index);
        } catch (e) { /* page illisible : aucun objet */ }
        return { index, widthPt: width, heightPt: height, objects: parsed.objects };
    });
    return { pageCount: pages.length, pages };
}

// ─── Réécriture du flux + ajouts ────────────────────────────────────────────
function escapePdfString(s) {
    return String(s == null ? '' : s)
        .replace(/([\\()])/g, '\\$1')
        .replace(/[\r\n\t]/g, ' ');
}

function applyEditsToContent(content, pageIndex, edits) {
    const { ops } = parsePage(content, pageIndex);
    const delIds = new Set((edits.deletions || []).map(String));
    const moves = new Map((edits.moves || []).map((m) => [String(m.id), m]));
    const textEdits = new Map((edits.textEdits || []).map((t) => [String(t.id), t]));

    const skip = new Set();
    const prefix = new Map(); // index op -> chaîne insérée avant
    const suffix = new Map(); // index op -> chaîne insérée après
    const replace = new Map(); // index op -> nouvel opérateur

    // Regroupe par id (les ids sont p{page}:{opIndex})
    const byId = new Map();
    for (const op of ops) { /* no-op */ }

    // Déterminer les objets concernés en re-parsant les ids
    const idsByOpIndex = new Map();
    for (const id of [...delIds, ...moves.keys(), ...textEdits.keys()]) idsByOpIndex.set(id, null);

    // Reconstruire les objets pour retrouver opIndex/groupes
    const parsed = parsePage(content, pageIndex);
    for (const ob of parsed.objects) {
        if (delIds.has(ob.id)) {
            if (ob.kind === 'text') skip.add(ob.opIndex);
            else for (let k = ob.groupStart; k <= ob.groupEnd; k++) skip.add(k);
        }
        const mv = moves.get(ob.id);
        if (mv && (mv.dx || mv.dy)) {
            const dx = Number(mv.dx) || 0, dy = Number(mv.dy) || 0;
            if (ob.kind === 'path') {
                prefix.set(ob.groupStart, `q 1 0 0 1 ${dx} ${dy} cm`);
                suffix.set(ob.groupEnd, 'Q');
            } else {
                const bs = ob.blockStart >= 0 ? ob.blockStart : ob.opIndex;
                prefix.set(bs, `q 1 0 0 1 ${dx} ${dy} cm`);
                suffix.set(ob.blockEnd >= 0 ? ob.blockEnd : ob.opIndex, 'Q');
            }
        }
        const te = textEdits.get(ob.id);
        if (te && ob.kind === 'text') {
            const op = ops[ob.opIndex];
            const val = `(${escapePdfString(te.text)})`;
            if (op.op === 'TJ') replace.set(ob.opIndex, `[${val}] TJ`);
            else if (op.op === 'Tj') replace.set(ob.opIndex, `${val} Tj`);
            else if (op.op === "'") replace.set(ob.opIndex, `${val} '`);
            else if (op.op === '"') replace.set(ob.opIndex, `${num(op, 0)} ${num(op, 1)} ${val} "`);
        }
    }

    const out = [];
    ops.forEach((op, idx) => {
        if (skip.has(idx)) return;
        if (prefix.has(idx)) out.push(prefix.get(idx));
        out.push(replace.has(idx) ? replace.get(idx) : content.slice(op.start, op.end));
        if (suffix.has(idx)) out.push(suffix.get(idx));
    });
    return out.join('\n');
}

async function editPdf(buffer, edits) {
    const pdfDoc = await PDFDocument.load(buffer, { ignoreEncryption: true });
    const context = pdfDoc.context;
    const pages = pdfDoc.getPages();
    const pagesByIdx = new Map((edits.pages || []).map((p) => [p.index, p]));

    for (const [pageIndex, pageEdits] of pagesByIdx) {
        const page = pages[pageIndex];
        if (!page) continue;
        const content = collectPageContent(page, context);
        if (!content) continue;
        let newContent;
        try { newContent = applyEditsToContent(content, pageIndex, pageEdits); }
        catch (e) { console.warn('[PDF-EDIT] page', pageIndex, e.message); continue; }
        const stream = context.flateStream(newContent);
        const ref = context.register(stream);
        page.node.set(PDFName.of('Contents'), ref);
    }

    await drawAdditions(pdfDoc, edits.additions || []);
    return Buffer.from(await pdfDoc.save());
}

// ─── Ajouts (texte, formes, images, gomme) ──────────────────────────────────
async function drawAdditions(pdfDoc, additions) {
    const fontCache = {};
    const getFont = async (bold, italic) => {
        const key = `${bold ? 1 : 0}_${italic ? 1 : 0}`;
        if (!fontCache[key]) {
            fontCache[key] = await pdfDoc.embedFont(
                bold && italic ? StandardFonts.HelveticaBoldOblique
                    : bold ? StandardFonts.HelveticaBold
                        : italic ? StandardFonts.HelveticaOblique
                            : StandardFonts.Helvetica
            );
        }
        return fontCache[key];
    };
    const pages = pdfDoc.getPages();
    const D2R = Math.PI / 180;
    const rot = (cx, cy, px, py, rad) => {
        const dx = px - cx, dy = py - cy, c = Math.cos(rad), s = Math.sin(rad);
        return { x: cx + dx * c - dy * s, y: cy + dx * s + dy * c };
    };

    for (const a of additions) {
        const page = pages[a.page - 1];
        if (!page) continue;
        const { width: pw, height: ph } = page.getSize();
        const x = ((Number(a.xPct) || 0) / 100) * pw;
        const yTop = ((Number(a.yPct) || 0) / 100) * ph;
        const w = Math.max(1, ((Number(a.wPct) || 0) / 100) * pw);
        const h = Math.max(1, ((Number(a.hPct) || 0) / 100) * ph);
        const color = hex(a.color || '#111827');
        const deg = Number(a.rotation) || 0;
        // CSS rotate() est horaire (axe y vers le bas) ; pdf-lib degrees() est
        // anti-horaire (axe y vers le haut) → on inverse pour que le rendu
        // aplati corresponde exactement à l'aperçu.
        const rad = -deg * D2R;
        const center = { x: x + w / 2, y: ph - yTop - h / 2 };

        if (a.type === 'text') {
            const font = await getFont(!!a.bold, !!a.italic);
            const size = Math.max(4, Number(a.fontSize) || 12);
            const lineH = size * 1.2;
            const lines = [];
            for (const rl of String(a.text || '').split('\n')) {
                const words = rl.split(/\s+/).filter(Boolean);
                let cur = '';
                if (!words.length) { lines.push(''); continue; }
                for (const word of words) {
                    const test = cur ? `${cur} ${word}` : word;
                    if (font.widthOfTextAtSize(test, size) <= w || !cur) cur = test;
                    else { lines.push(cur); cur = word; }
                }
                if (cur) lines.push(cur);
            }
            lines.forEach((ln, i) => {
                const anchor = { x, y: ph - yTop - size - i * lineH };
                const ra = rot(center.x, center.y, anchor.x, anchor.y, rad);
                if (ln) page.drawText(ln, { x: ra.x, y: ra.y, size, font, color: rgb(color.r, color.g, color.b), rotate: degrees(-deg) });
            });
        } else if (a.type === 'rect' || a.type === 'highlight' || a.type === 'whiteout') {
            const fill = a.type === 'highlight' ? rgb(1, 0.92, 0.2) : a.type === 'whiteout' ? rgb(1, 1, 1) : rgb(color.r, color.g, color.b);
            const opacity = a.type === 'highlight' ? 0.4 : (a.opacity != null ? Number(a.opacity) : 1);
            const anchor = { x, y: ph - yTop - h };
            const ra = rot(center.x, center.y, anchor.x, anchor.y, rad);
            page.drawRectangle({ x: ra.x, y: ra.y, width: w, height: h, color: fill, opacity, rotate: degrees(-deg) });
        } else if (a.type === 'line') {
            const p0 = { x, y: ph - yTop };
            const p1 = { x: x + w, y: ph - yTop - h };
            page.drawLine({
                start: rot(center.x, center.y, p0.x, p0.y, rad),
                end: rot(center.x, center.y, p1.x, p1.y, rad),
                thickness: Number(a.thickness) || 2,
                color: rgb(color.r, color.g, color.b),
            });
        } else if (a.type === 'image' && a.dataUrl) {
            const m = /^data:(image\/[a-z+]+);base64,(.*)$/i.exec(a.dataUrl);
            if (m) {
                const bytes = Buffer.from(m[2], 'base64');
                const img = /png/i.test(m[1]) ? await pdfDoc.embedPng(bytes) : await pdfDoc.embedJpg(bytes);
                // Image ÉTIRÉE selon la boîte (largeur/hauteur choisies), rotation autour du centre.
                const anchor = { x, y: ph - yTop - h };
                const ra = rot(center.x, center.y, anchor.x, anchor.y, rad);
                page.drawImage(img, { x: ra.x, y: ra.y, width: w, height: h, rotate: degrees(-deg) });
            }
        } else if (a.type === 'freehand' && Array.isArray(a.points)) {
            const xs = a.points.map((p) => Number(p.xPct)), ys = a.points.map((p) => Number(p.yPct));
            const ccx = ((Math.min(...xs) + Math.max(...xs)) / 2 / 100) * pw;
            const ccy = ph - ((Math.min(...ys) + Math.max(...ys)) / 2 / 100) * ph;
            const pts = a.points.map((p) => rot(ccx, ccy, (Number(p.xPct) / 100) * pw, ph - (Number(p.yPct) / 100) * ph, rad));
            for (let k = 1; k < pts.length; k++) {
                page.drawLine({ start: pts[k - 1], end: pts[k], thickness: Number(a.thickness) || 8, color: rgb(1, 1, 1), opacity: 1 });
            }
        } else if (a.type === 'polygon' && Array.isArray(a.points) && a.points.length >= 3) {
            const c = hex(a.color || '#ffffff');
            const xs = a.points.map((p) => Number(p.xPct)), ys = a.points.map((p) => Number(p.yPct));
            const ccx = ((Math.min(...xs) + Math.max(...xs)) / 2 / 100) * pw;
            const ccy = ph - ((Math.min(...ys) + Math.max(...ys)) / 2 / 100) * ph;
            const ops = [];
            a.points.forEach((p, i) => {
                const r = rot(ccx, ccy, (Number(p.xPct) / 100) * pw, ph - (Number(p.yPct) / 100) * ph, rad);
                ops.push(i === 0 ? moveTo(r.x, r.y) : lineTo(r.x, r.y));
            });
            ops.push(closePath(), fill(rgb(c.r, c.g, c.b)));
            page.pushOperators(...ops);
        }
    }
}

function hex(hexStr) {
    const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hexStr || '#111827');
    if (!m) return { r: 0, g: 0, b: 0 };
    return { r: parseInt(m[1], 16) / 255, g: parseInt(m[2], 16) / 255, b: parseInt(m[3], 16) / 255 };
}

module.exports = { listObjects, editPdf, parseOperators, parsePage };
