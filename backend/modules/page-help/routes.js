const express = require('express');
const router = express.Router();
const { authenticateJWT, authenticateAdmin } = require('../../shared/middleware');
const { pgDb } = require('../../shared/database');
const multer = require('multer');
const fs = require('fs');

const mdUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

let _markedParse = null;
async function getMarkedParse() {
    if (!_markedParse) {
        const mod = await import('marked');
        _markedParse = mod.parse;
    }
    return _markedParse;
}

// GET /api/page-help — liste toutes les entrées d'aide
router.get('/', authenticateJWT, async (req, res) => {
    try {
        const rows = await pgDb.all('SELECT * FROM hub.page_help ORDER BY page_path');
        res.json(rows);
    } catch (e) { res.status(500).json({ message: e.message }); }
});

// GET /api/page-help/:page — retourne l'aide pour une page (lecture directe depuis les fichiers Markdown)
router.get('/:page', async (req, res) => {
    try {
        const page = decodeURIComponent(req.params.page);
        
        // Mappage page -> fichier
        const MAP = {
            '/tickets':        'GUIDE-TECHNICIEN-TICKETS.md',
            '/tickets/stats':  'GUIDE-STATISTIQUES-TICKETS.md',
            '/tickets/admin':  'GUIDE-ADMIN-TICKETS.md',
        };

        const fileName = MAP[page];
        if (!fileName) return res.json(null);

        const path = require('path');
        const docsDir = path.join(__dirname, '..', '..', '..', 'docs');
        const filePath = path.join(docsDir, fileName);

        if (!fs.existsSync(filePath)) return res.json(null);

        const content = fs.readFileSync(filePath, 'utf8');
        
        const mdParse = await getMarkedParse();
        const contentHtml = mdParse(content);

        res.json({
            page_path: page,
            content: content,
            content_html: contentHtml
        });
    } catch (e) { res.status(500).json({ message: e.message }); }
});

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
