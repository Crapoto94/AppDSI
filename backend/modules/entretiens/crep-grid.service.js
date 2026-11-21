/**
 * Lecture des CASES COCHÉES de la grille d'appréciation d'un CREP photographié ou scanné.
 *
 * Un modèle de vision lit mal les cases (marques au stylo, croix, cases noircies) : il se trompe de colonne une fois sur dix, de façon
 * systématique d'un essai à l'autre. On les lit donc ici par traitement d'image, de façon déterministe :
 *   1. redressement (angle qui rend les lignes horizontales les plus nettes) et binarisation locale (robuste aux ombres et reflets) ;
 *   2. repérage des petits carrés (les cases) : une case vide est un carré creux (~150 px d'encre), une case cochée est un amas bien plus gros
 *      (croix, trait, case noircie), voire fusionné avec le trait du tableau (alors le carré « disparaît ») ;
 *   3. regroupement en colonnes (3) puis en lignes ; dans une ligne, la case cochée est celle dont l'encre domine ou qui manque.
 * Le résultat n'est utilisé que si le nombre de lignes lues correspond au nombre de critères du modèle : sinon on ne devine rien.
 * Les photos ne sortent pas du serveur : traitement 100 % local.
 */
const { createCanvas } = require('@napi-rs/canvas');

const LEVEL_BY_COL = ['S', 'AS', 'I'];

/** Image → { bin (1 = encre), W, H } à la largeur W, après rotation de angleDeg (degrés). */
function binarize(img, W, angleDeg = 0) {
    const s = W / img.width;
    const H = Math.round(img.height * s);
    const c = createCanvas(W, H);
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, H);
    ctx.translate(W / 2, H / 2); ctx.rotate(angleDeg * Math.PI / 180);
    ctx.drawImage(img, -W / 2, -H / 2, W, H);
    const d = ctx.getImageData(0, 0, W, H).data;
    const g = new Float32Array(W * H);
    for (let i = 0; i < W * H; i++) g[i] = 0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2];
    const I = new Float64Array((W + 1) * (H + 1));
    for (let y = 0; y < H; y++) {
        let row = 0;
        for (let x = 0; x < W; x++) { row += g[y * W + x]; I[(y + 1) * (W + 1) + x + 1] = I[y * (W + 1) + x + 1] + row; }
    }
    const r = 14;
    const bin = new Uint8Array(W * H);
    for (let y = 0; y < H; y++) {
        const y0 = Math.max(0, y - r), y1 = Math.min(H, y + r + 1);
        for (let x = 0; x < W; x++) {
            const x0 = Math.max(0, x - r), x1 = Math.min(W, x + r + 1);
            const sum = I[y1 * (W + 1) + x1] - I[y0 * (W + 1) + x1] - I[y1 * (W + 1) + x0] + I[y0 * (W + 1) + x0];
            bin[y * W + x] = g[y * W + x] < sum / ((x1 - x0) * (y1 - y0)) - 22 ? 1 : 0;
        }
    }
    return { bin, W, H };
}

function components(bin, W, H, minN = 40) {
    const lab = new Int32Array(W * H);
    const stack = new Int32Array(W * H);
    const out = [];
    let next = 0;
    for (let i = 0; i < W * H; i++) {
        if (!bin[i] || lab[i]) continue;
        next++;
        let sp = 0; stack[sp++] = i; lab[i] = next;
        let x0 = W, y0 = H, x1 = 0, y1 = 0, n = 0;
        while (sp) {
            const p = stack[--sp]; const px = p % W, py = (p / W) | 0;
            n++; if (px < x0) x0 = px; if (px > x1) x1 = px; if (py < y0) y0 = py; if (py > y1) y1 = py;
            for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
                const nx = px + dx, ny = py + dy;
                if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
                const q = ny * W + nx;
                if (bin[q] && !lab[q]) { lab[q] = next; stack[sp++] = q; }
            }
        }
        if (n >= minN) out.push({ w: x1 - x0 + 1, h: y1 - y0 + 1, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, n });
    }
    return out;
}

const median = (a) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : 0; };

/** Angle (−4…+4°) qui rend les lignes horizontales du document les plus nettes. */
function bestAngle(img) {
    let best = 0, bestS = -1;
    for (let a = -4; a <= 4.01; a += 0.5) {
        const { bin, W, H } = binarize(img, 700, a);
        let t = 0;
        for (let y = 0; y < H; y++) { let c = 0; for (let x = 0; x < W; x++) c += bin[y * W + x]; t += c * c; }
        if (t > bestS) { bestS = t; best = a; }
    }
    return best;
}

/**
 * @param img image déjà décodée (@napi-rs/canvas), page DROITE (non pivotée de 90°/180°)
 * @returns {{ rows: Array<{ level: string, certain: boolean }>, note: string } | null} une entrée par ligne de case, de haut en bas
 */
function readCheckboxRows(img) {
    const W = 1400;
    const angle = bestAngle(img);
    const { bin, W: w, H: h } = binarize(img, W, angle);
    const comps = components(bin, w, h);
    const boxes = comps.filter(c => c.w >= 12 && c.w <= 52 && c.h >= 12 && c.h <= 52 && c.w / c.h > 0.55 && c.w / c.h < 1.8 && c.cx > w * 0.45 && c.n >= 60);
    if (boxes.length < 6) return null;

    // 3 colonnes : paquets d'abscisses (pas de 20 px, voisins fusionnés), puis le triplet à espacement régulier qui rassemble le plus de cases
    const bins = new Map();
    for (const b of boxes) { const k = Math.round(b.cx / 20); bins.set(k, (bins.get(k) || 0) + 1); }
    const clusters = [];
    for (const k of [...bins.keys()].sort((x, y) => x - y)) {
        const l = clusters[clusters.length - 1];
        if (l && k - l.last <= 1) { l.sum += k * bins.get(k); l.count += bins.get(k); l.last = k; } else clusters.push({ sum: k * bins.get(k), count: bins.get(k), last: k });
    }
    const cs = clusters.map(c => ({ x: (c.sum / c.count) * 20, count: c.count }));
    let centers = null, bestCount = 0;
    for (let i = 0; i < cs.length; i++) for (let j = i + 1; j < cs.length; j++) for (let k = j + 1; k < cs.length; k++) {
        const d1 = cs[j].x - cs[i].x, d2 = cs[k].x - cs[j].x;
        if (d1 < 90 || Math.abs(d1 - d2) > 0.25 * d1) continue;
        const cnt = cs[i].count + cs[j].count + cs[k].count;
        if (cnt > bestCount) { bestCount = cnt; centers = [cs[i].x, cs[j].x, cs[k].x]; }
    }
    if (!centers || bestCount < 6) return null;
    // centres affinés : médiane des cases proches
    const col = centers.map(c => median(boxes.filter(b => Math.abs(b.cx - c) < 30).map(b => b.cx)));
    const colOf = (b) => { let bi = -1, bd = 1e9; col.forEach((c, i) => { const d = Math.abs(b.cx - c); if (d < bd) { bd = d; bi = i; } }); return bd <= 36 ? bi : -1; };

    const cells = boxes.map(b => ({ ...b, col: colOf(b) })).filter(b => b.col >= 0).sort((a, b) => a.cy - b.cy);
    // lignes : regroupement par ordonnée (tolérance liée à la hauteur d'une case)
    const rowsRaw = [];
    for (const c of cells) {
        const l = rowsRaw[rowsRaw.length - 1];
        if (l && Math.abs(c.cy - l.cy) <= 16) { l.cells.push(c); l.cy = l.cells.reduce((s, x) => s + x.cy, 0) / l.cells.length; } else rowsRaw.push({ cy: c.cy, cells: [c] });
    }
    // une vraie ligne : au moins 2 colonnes distinctes, une seule case par colonne
    const rows = rowsRaw.filter(r => {
        const cs = r.cells.map(c => c.col);
        return new Set(cs).size === cs.length && cs.length >= 2;
    });
    if (rows.length < 3) return null;
    // surface d'encre d'une case vide : médiane des cases « calmes » (la taille croît légèrement vers le bas avec la perspective)
    const out = rows.map(r => {
        const byCol = [null, null, null];
        for (const c of r.cells) byCol[c.col] = c;
        const present = byCol.filter(Boolean);
        const missing = byCol.map((c, i) => (c ? -1 : i)).filter(i => i >= 0);
        if (missing.length === 1 && present.length === 2) {
            // une case a disparu (marque fusionnée avec le trait du tableau) : c'est elle qui est cochée,
            // sauf si l'autre case est elle-même bien plus grosse que sa voisine (alors on ne tranche pas)
            const [a, b] = present.map(c => c.n);
            if (Math.max(a, b) < 1.5 * Math.min(a, b)) return { level: LEVEL_BY_COL[missing[0]], certain: true, cy: r.cy };
            return { level: '', certain: false, cy: r.cy };
        }
        if (present.length === 3) {
            const sorted = present.map(c => c.n).sort((x, y) => y - x);
            const ratio = sorted[0] / Math.max(1, sorted[1]);
            const big = byCol.findIndex(c => c && c.n === sorted[0]);
            if (ratio >= 1.45) return { level: LEVEL_BY_COL[big], certain: ratio >= 1.8, cy: r.cy };
            return { level: '', certain: true, cy: r.cy }; // aucune case nettement cochée
        }
        return { level: '', certain: false, cy: r.cy };
    });
    return { rows: out, note: `${rows.length} lignes de cases lues par traitement d'image (angle ${angle}°)` };
}

module.exports = { readCheckboxRows };
