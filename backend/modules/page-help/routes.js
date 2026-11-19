const express = require('express');
const router = express.Router();
const { authenticateJWT, authenticateAdmin } = require('../../shared/middleware');
const { pgDb } = require('../../shared/database');
const multer = require('multer');
const fs = require('fs');
const path = require('path');

const mdUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

let _markedParse = null;
async function getMarkedParse() {
    if (!_markedParse) {
        const mod = await import('marked');
        _markedParse = mod.parse;
    }
    return _markedParse;
}


// Page d'aide -> guide Markdown livré avec le dépôt (docs/*.md). Sert de repli ET de source d'alimentation de hub.page_help (voir seedGuides).
const GUIDE_FILES = {
            '/tickets':                'GUIDE-TECHNICIEN-TICKETS.md',
            '/tickets/stats':          'GUIDE-STATISTIQUES-TICKETS.md',
            '/tickets/admin':          'GUIDE-ADMIN-TICKETS.md',
            '/transcriptmanager':      'GUIDE-TRANSCRIPT-MANAGER.md',
            '/stocks':                 'GUIDE-STOCKS.md',
            '/prets':                  'GUIDE-STOCKS.md',
            '/consommables':           'GUIDE-CONSOMMABLES.md',
            '/contrats':               'GUIDE-CONTRATS.md',
            '/copieurs':               'GUIDE-COPIEURS.md',
            '/documents':              'GUIDE-DOCUMENTS.md',
            '/telecom':                'GUIDE-TELECOM.md',
            '/rencontres-budgetaires': 'GUIDE-RENCONTRES-BUDGETAIRES.md',
            '/portefeuille-projets':   'GUIDE-PORTEFEUILLE-PROJETS.md',
            '/revue-de-projets':       'GUIDE-PORTEFEUILLE-PROJETS.md',
            '/planning-general':       'GUIDE-PORTEFEUILLE-PROJETS.md',
            '/projets-log':            'GUIDE-PORTEFEUILLE-PROJETS.md',
            '/certif':                 'GUIDE-CERTIFICATS.md',
            '/calendrier-dsi':         'GUIDE-CALENDRIER-DSI.md',
            '/budget':                 'GUIDE-BUDGET.md',
            '/tiers':                  'GUIDE-BUDGET.md',
            '/doctrines':              'GUIDE-DOCTRINES.md',
            '/notes':                  'GUIDE-NOTES-IA.md',
            '/admin/notes':            'GUIDE-NOTES-IA.md',
            '/reseau':                 'GUIDE-RESEAU.md',
            '/mes-reunions':           'GUIDE-REUNIONS.md',
            '/admin/magapp':           'GUIDE-MAGAPP.md',
            '/magapp':                 'GUIDE-MAGAPP-PORTAIL.md',
            '/mes-taches':             'GUIDE-TACHES.md',
            '/parc':                   'GUIDE-PARC.md',
            '/rh':                     'GUIDE-RH.md',
            '/vols':                   'GUIDE-VOLS.md',
            '/admin/param-ville':      'GUIDE-PARAM-VILLE.md',
            '/boites-partagees':       'GUIDE-BOITES-PARTAGEES.md',
            '/parapheur':              'GUIDE-PARAPHEUR.md',
            '/magapp/virement-credits': 'GUIDE-VIREMENT-CREDITS.md',
            '/magapp/mes-factures':     'GUIDE-MES-FACTURES.md',
        };
GUIDE_FILES['/magapp/mes-factures'] = 'GUIDE-MES-FACTURES.md';
GUIDE_FILES['/magapp/virement-credits'] = 'GUIDE-VIREMENT-CREDITS.md';
GUIDE_FILES['/service-fait'] = 'GUIDE-SERVICE-FAIT.md';

// Dossier docs/ : sur le poste `<repo>/docs` (3 niveaux au-dessus de ce fichier) ; en Docker le backend est copié dans /app et docs/ est monté en
// /app/docs (docker-compose) — l'ancien calcul unique `../../../docs` visait `/docs` dans le conteneur : les aides « fichier » n'y étaient
// jamais trouvées. On teste donc plusieurs emplacements.
function docsDirs() {
    return [
        path.join(__dirname, '..', '..', '..', 'docs'),
        path.join(__dirname, '..', '..', 'docs'),
        path.join(process.cwd(), 'docs'),
        path.join(process.cwd(), '..', 'docs'),
        '/app/docs',
    ];
}
function readGuide(fileName) {
    for (const d of docsDirs()) {
        const f = path.join(d, fileName);
        try { if (fs.existsSync(f)) return fs.readFileSync(f, 'utf8'); } catch { /* suivant */ }
    }
    return null;
}

/**
 * SANCTUARISATION des aides : au démarrage, tout guide livré (docs/*.md) dont la page n'a PAS de ligne dans hub.page_help y est inséré.
 * Une ligne existante (modifiée depuis /admin/aides) n'est jamais écrasée ; un guide supprimé en base redevient disponible via le fichier.
 * Un journal liste les guides introuvables (fichier absent du conteneur) pour ne plus perdre une aide en silence.
 */
async function seedGuides() {
    const missing = [];
    let seeded = 0;
    for (const [page, file] of Object.entries(GUIDE_FILES)) {
        try {
            const md = readGuide(file);
            if (md == null) { missing.push(`${page} (${file})`); continue; }
            const row = await pgDb.get('SELECT 1 AS ok FROM hub.page_help WHERE page_path = $1', [page]);
            if (row) continue;
            const parse = await getMarkedParse();
            await pgDb.run(`INSERT INTO hub.page_help (page_path, content, content_html, created_by, updated_at)
                            VALUES ($1, $2, $3, 'guides-livres', CURRENT_TIMESTAMP) ON CONFLICT (page_path) DO NOTHING`, [page, md, parse(md)]);
            seeded++;
        } catch (e) { console.warn(`[PAGE-HELP] seed ${page}:`, e.message); }
    }
    if (seeded) console.log(`[PAGE-HELP] ${seeded} aide(s) alimentée(s) depuis docs/`);
    if (missing.length) console.warn(`[PAGE-HELP] guides introuvables (docs/ non monté ?) : ${missing.join(', ')}`);
}
setTimeout(() => { seedGuides().catch(() => {}); }, 30000);

// GET /api/page-help?page=/magapp/mes-factures — aide d'une page, chemin passé en PARAMÈTRE DE REQUÊTE (un « %2F » dans le chemin d'URL est
// décodé en « / » par certains proxys, ce qui cassait l'aide de MagApp) ; sans paramètre : liste de toutes les aides (JWT)
router.get('/', async (req, res, next) => {
    if (!req.query.page) return next();
    req.params.page = String(req.query.page);
    return getPageHelp(req, res);
});

// GET /api/page-help — liste toutes les entrées d'aide
router.get('/', authenticateJWT, async (req, res) => {
    try {
        const rows = await pgDb.all('SELECT * FROM hub.page_help ORDER BY page_path');
        res.json(rows);
    } catch (e) { res.status(500).json({ message: e.message }); }
});

// GET /api/page-help/:page — retourne l'aide pour une page : d'abord hub.page_help
// (source éditable depuis /admin/aides), puis en repli les guides Markdown
// historiques livrés avec le dépôt (docs/*.md) pour les pages non encore migrées.
async function getPageHelp(req, res) {
    try {
        const page = decodeURIComponent(req.params.page);

        const row = await pgDb.get('SELECT page_path, content, content_html FROM hub.page_help WHERE page_path = $1', [page]);
        if (row) return res.json(row);

        const MAP = GUIDE_FILES;

        const fileName = MAP[page];
        if (!fileName) return res.json(null);

        const content = readGuide(fileName);
        if (content == null) return res.json(null);

        const mdParse = await getMarkedParse();
        const contentHtml = mdParse(content);

        res.json({
            page_path: page,
            content: content,
            content_html: contentHtml
        });
    } catch (e) { res.status(500).json({ message: e.message }); }
}
router.get('/:page', getPageHelp);

// PUT /api/page-help/:page — créer/mettre à jour (texte ou fichier MD)
router.put('/:page', authenticateJWT, authenticateAdmin, mdUpload.single('file'), async (req, res) => {
    try {
        const page = decodeURIComponent(req.params.page);
        let content = req.body.content || '';
        if (req.file) {
            content = req.file.buffer.toString('utf8');
        }
        if (!content) return res.status(400).json({ message: 'Contenu requis' });

        let contentHtml = '';
        try {
            const mdParse = await getMarkedParse();
            contentHtml = mdParse(content);
        } catch (e) {
            contentHtml = `<pre>${content}</pre>`;
        }

        await pgDb.run(`
            INSERT INTO hub.page_help (page_path, content, content_html, created_by, updated_at)
            VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)
            ON CONFLICT (page_path) DO UPDATE SET
                content = EXCLUDED.content,
                content_html = EXCLUDED.content_html,
                updated_at = CURRENT_TIMESTAMP
        `, [page, content, contentHtml, req.user?.username || 'admin']);
        res.json({ success: true });
    } catch (e) { res.status(500).json({ message: e.message }); }
});

// DELETE /api/page-help/:page
router.delete('/:page', authenticateJWT, authenticateAdmin, async (req, res) => {
    try {
        const page = decodeURIComponent(req.params.page);
        await pgDb.run('DELETE FROM hub.page_help WHERE page_path = $1', [page]);
        res.json({ success: true });
    } catch (e) { res.status(500).json({ message: e.message }); }
});

module.exports = router;
