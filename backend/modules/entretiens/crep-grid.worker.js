/**
 * Thread de calcul : lecture des cases cochées d'une page. Le traitement d'image est du calcul pur (plusieurs secondes sur une photo de 12 Mpx) :
 * il ne doit pas bloquer le serveur, d'où ce thread séparé. Reçoit { buf (octets de l'image), degs (sens à essayer), nExpected }.
 */
const { parentPort, workerData } = require('worker_threads');
const { createCanvas, loadImage } = require('@napi-rs/canvas');
const { readCheckboxRows } = require('./crep-grid.service');

(async () => {
    const img = await loadImage(Buffer.from(workerData.buf));
    let fallback = null; // tableau plausible mais dont le nombre de lignes diffère du modèle attendu
    for (const deg of workerData.degs) {
        const swap = deg === 90 || deg === 270;
        const s = Math.min(1, 3000 / Math.max(img.width, img.height));
        const dw = Math.round(img.width * s), dh = Math.round(img.height * s);
        const c = createCanvas(swap ? dh : dw, swap ? dw : dh);
        const ctx = c.getContext('2d');
        ctx.translate(c.width / 2, c.height / 2);
        ctx.rotate(deg * Math.PI / 180);
        ctx.drawImage(img, -dw / 2, -dh / 2, dw, dh);
        const r = readCheckboxRows(c);
        if (r && r.rows.length === workerData.nExpected) { parentPort.postMessage({ ok: true, deg, rows: r.rows, note: r.note }); return; }
        if (!fallback && r && r.rows.length >= 12 && r.rows.length <= 26) fallback = { deg, rows: r.rows, note: r.note };
    }
    // Pas le bon nombre de lignes (ex. papier d'une autre catégorie que le modèle de l'agent) : on garde le sens de lecture, pas les cases
    if (fallback) { parentPort.postMessage({ ok: true, deg: fallback.deg, rows: null, found: fallback.rows.length, note: fallback.note, mismatch: true }); return; }
    parentPort.postMessage({ ok: false });
})().catch(e => parentPort.postMessage({ ok: false, error: e.message }));
