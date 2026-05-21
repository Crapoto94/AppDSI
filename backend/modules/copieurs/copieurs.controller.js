const { pgDb } = require('../../shared/database');
const { logMouchard } = require('../../shared/utils');
const https = require('https');
const http = require('http');
const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);

function normalizeDateString(dateValue) {
    if (!dateValue && dateValue !== 0) return null;
    if (dateValue instanceof Date && !isNaN(dateValue.getTime())) {
        return dateValue.toISOString().split('T')[0];
    }
    const str = String(dateValue).trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;
    let match = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (match) return `${match[3]}-${match[1].padStart(2, '0')}-${match[2].padStart(2, '0')}`;
    match = str.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
    if (match) return `${match[3]}-${match[1].padStart(2, '0')}-${match[2].padStart(2, '0')}`;
    if (/^\d{4,5}$/.test(str)) {
        const num = parseInt(str, 10);
        if (num > 0 && num < 60000) {
            const date = new Date(1900, 0, 1);
            date.setDate(date.getDate() + num - 1);
            return date.toISOString().split('T')[0];
        }
    }
    const d = new Date(str);
    if (!isNaN(d.getTime())) {
        const y = d.getFullYear();
        if (y >= 1900 && y <= 2100) return d.toISOString().split('T')[0];
    }
    return null;
}

function geocodeAddress(address) {
    return new Promise((resolve) => {
        const query = encodeURIComponent(`${address}, Ivry-sur-Seine`);
        const url = `https://api-adresse.data.gouv.fr/search/?q=${query}&limit=1`;

        https.get(url, { headers: { 'User-Agent': 'DSIHub/1.0' } }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    const result = JSON.parse(data);
                    if (result && result.features && result.features.length > 0) {
                        const coords = result.features[0].geometry.coordinates;
                        resolve({ latitude: coords[1], longitude: coords[0] });
                    } else {
                        resolve({ latitude: null, longitude: null });
                    }
                } catch {
                    resolve({ latitude: null, longitude: null });
                }
            });
        }).on('error', () => {
            resolve({ latitude: null, longitude: null });
        });
    });
}

const fixNumeric = (row) => {
    if (!row) return row;
    if (row.latitude !== null && row.latitude !== undefined) row.latitude = parseFloat(row.latitude);
    if (row.longitude !== null && row.longitude !== undefined) row.longitude = parseFloat(row.longitude);
    if (row.nb_pages !== null && row.nb_pages !== undefined) row.nb_pages = parseInt(row.nb_pages);
    return row;
};

const isPlaceholder = (val) => {
    if (val === undefined || val === null) return true;
    const s = String(val).trim();
    return s === '' || s === '42';
};

const isArchiveKeyword = (divers) => {
    if (!divers) return false;
    const lower = divers.toLowerCase();
    const keywords = ['retiré', 'hs', 'hors service', 'en attente', 'non utilisé', 'spare', 'reprise', 'déplacé'];
    return keywords.some(k => lower.includes(k));
};

async function pingCopieur(ip) {
    if (!ip || ip === '42' || ip.trim() === '') return { ping_status: 'inconnu', last_seen_active: null };
    try {
        const { stdout } = await execPromise(`ping -n 1 -w 2000 ${ip.replace(/[^0-9.]/g, '')}`, { timeout: 3000 });
        const reachable = stdout.includes('réponse') || stdout.includes('Reply') || stdout.includes('TTL') || stdout.includes('temps');
        return {
            ping_status: reachable ? 'actif' : 'inactif',
            last_seen_active: reachable ? new Date().toLocaleString('sv').replace(' ', 'T') : null
        };
    } catch {
        return { ping_status: 'inactif', last_seen_active: null };
    }
}

const detectArchivedFromRow = (row, source) => {
    if (row.archive) return row.archive === true || row.archive === 1 || row.archive === '1' || row.archive === 'true' || row.archive === 'oui';
    const divers = (row.divers || row.Divers || '').toString().trim();
    if (isArchiveKeyword(divers)) return true;
    if (source === 'ecoles') {
        const ecole = (row.ecole || row.Ecole || '').toString().trim();
        if (ecole.toLowerCase() === 'spare') return true;
    }
    return false;
};

module.exports = {
    getAll: async (req, res) => {
        try {
            const filter = req.query.filter || 'actifs';
            let sql = 'SELECT * FROM hub_copieurs.copieurs';
            if (filter === 'archives') sql += ' WHERE archive = true';
            else if (filter === 'tous') ;
            else sql += ' WHERE archive = false';
            sql += ' ORDER BY direction, service';
            const copieurs = await pgDb.all(sql);
            res.json(copieurs.map(fixNumeric));
        } catch (error) {
            res.status(500).json({ message: 'Erreur récupération copieurs', error: error.message });
        }
    },

    getById: async (req, res) => {
        try {
            const copieur = await pgDb.get('SELECT * FROM hub_copieurs.copieurs WHERE id = ?', [req.params.id]);
            if (!copieur) return res.status(404).json({ message: 'Copieur non trouvé' });
            res.json(fixNumeric(copieur));
        } catch (error) {
            res.status(500).json({ message: 'Erreur récupération copieur', error: error.message });
        }
    },

    create: async (req, res) => {
        try {
            const { direction, service, secteur, adresse, numero_serie, modele, modele_papercut, couleur, date_acquisition, nom_reseau, ip, present, nb_pages, mainteneur, divers, archive, latitude, longitude } = req.body;
            const result = await pgDb.run(
                `INSERT INTO hub_copieurs.copieurs (direction, service, secteur, adresse, numero_serie, modele, modele_papercut, couleur, date_acquisition, nom_reseau, ip, present, nb_pages, mainteneur, divers, archive, latitude, longitude) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [direction || '', service || '', secteur || '', adresse || '', numero_serie || '', modele || '', modele_papercut || '', couleur || '', date_acquisition || null, nom_reseau || '', ip || '', present || '', nb_pages ? parseInt(nb_pages) : null, mainteneur || '', divers || '', archive ? true : false, latitude || null, longitude || null]
            );
            const copieur = await pgDb.get('SELECT * FROM hub_copieurs.copieurs WHERE id = ?', [result.lastID]);
            logMouchard(`Copieur créé: ${copieur.numero_serie} (${copieur.direction})`);
            res.status(201).json(fixNumeric(copieur));
        } catch (error) {
            res.status(500).json({ message: 'Erreur création copieur', error: error.message });
        }
    },

    update: async (req, res) => {
        try {
            const existing = await pgDb.get('SELECT * FROM hub_copieurs.copieurs WHERE id = ?', [req.params.id]);
            if (!existing) return res.status(404).json({ message: 'Copieur non trouvé' });

            const numericFields = ['nb_pages', 'latitude', 'longitude'];
            const sanitized = { ...req.body };
            numericFields.forEach(f => {
                if (sanitized[f] === '' || sanitized[f] === undefined || sanitized[f] === null) {
                    sanitized[f] = null;
                } else if (f === 'nb_pages') {
                    sanitized[f] = parseInt(sanitized[f]) || null;
                } else {
                    sanitized[f] = parseFloat(sanitized[f]);
                }
            });
            if (sanitized.archive === '' || sanitized.archive === undefined || sanitized.archive === null) {
                sanitized.archive = false;
            }
            if (sanitized.date_acquisition === '' || sanitized.date_acquisition === undefined || sanitized.date_acquisition === null) {
                sanitized.date_acquisition = null;
            }

            const fields = ['direction', 'service', 'secteur', 'adresse', 'numero_serie', 'modele', 'modele_papercut', 'couleur', 'date_acquisition', 'nom_reseau', 'ip', 'present', 'nb_pages', 'mainteneur', 'divers', 'source', 'archive', 'latitude', 'longitude'];
            const updates = [];
            const values = [];
            fields.forEach(f => {
                if (sanitized[f] !== undefined) {
                    updates.push(`${f} = ?`);
                    values.push(sanitized[f]);
                }
            });
            if (updates.length === 0) return res.status(400).json({ message: 'Aucun champ à mettre à jour' });
            values.push(req.params.id);
            await pgDb.run(`UPDATE hub_copieurs.copieurs SET ${updates.join(', ')} WHERE id = ?`, values);
            const updated = await pgDb.get('SELECT * FROM hub_copieurs.copieurs WHERE id = ?', [req.params.id]);
            res.json(fixNumeric(updated));
        } catch (error) {
            res.status(500).json({ message: 'Erreur mise à jour copieur', error: error.message });
        }
    },

    archive: async (req, res) => {
        try {
            const copieur = await pgDb.get('SELECT * FROM hub_copieurs.copieurs WHERE id = ?', [req.params.id]);
            if (!copieur) return res.status(404).json({ message: 'Copieur non trouvé' });
            await pgDb.run('UPDATE hub_copieurs.copieurs SET archive = NOT archive WHERE id = ?', [req.params.id]);
            const updated = await pgDb.get('SELECT * FROM hub_copieurs.copieurs WHERE id = ?', [req.params.id]);
            res.json(fixNumeric(updated));
        } catch (error) {
            res.status(500).json({ message: 'Erreur archivage copieur', error: error.message });
        }
    },

    delete: async (req, res) => {
        try {
            const copieur = await pgDb.get('SELECT * FROM hub_copieurs.copieurs WHERE id = ?', [req.params.id]);
            if (!copieur) return res.status(404).json({ message: 'Copieur non trouvé' });
            await pgDb.run('DELETE FROM hub_copieurs.copieurs WHERE id = ?', [req.params.id]);
            logMouchard(`Copieur supprimé: ID ${req.params.id} (${copieur.numero_serie})`);
            res.json({ message: 'Copieur supprimé' });
        } catch (error) {
            res.status(500).json({ message: 'Erreur suppression copieur', error: error.message });
        }
    },

    getMapData: async (req, res) => {
        try {
            const copieurs = await pgDb.all('SELECT id, direction, service, secteur, adresse, modele, numero_serie, ip, latitude, longitude, archive, couleur, mainteneur FROM hub_copieurs.copieurs WHERE latitude IS NOT NULL AND longitude IS NOT NULL');
            res.json(copieurs.map(fixNumeric));
        } catch (error) {
            res.status(500).json({ message: 'Erreur données carte', error: error.message });
        }
    },

    geocodeAll: async (req, res) => {
        try {
            const copieurs = await pgDb.all('SELECT id, adresse FROM hub_copieurs.copieurs WHERE (latitude IS NULL OR longitude IS NULL) AND adresse IS NOT NULL AND adresse != \'\'');
            const results = [];
            for (const c of copieurs) {
                try {
                    const coords = await geocodeAddress(c.adresse);
                    if (coords.latitude && coords.longitude) {
                        await pgDb.run('UPDATE hub_copieurs.copieurs SET latitude = ?, longitude = ? WHERE id = ?', [coords.latitude, coords.longitude, c.id]);
                        results.push({ id: c.id, adresse: c.adresse, ...coords });
                    } else {
                        results.push({ id: c.id, adresse: c.adresse, error: 'Non trouvé' });
                    }
                    await new Promise(r => setTimeout(r, 1000));
                } catch (e) {
                    results.push({ id: c.id, adresse: c.adresse, error: e.message });
                }
            }
            res.json({ total: copieurs.length, geocoded: results.filter(r => r.latitude).length, results });
        } catch (error) {
            res.status(500).json({ message: 'Erreur géocodage', error: error.message });
        }
    },

    pingAll: async (req, res) => {
        try {
            const copieurs = await pgDb.all("SELECT id, ip FROM hub_copieurs.copieurs WHERE ip IS NOT NULL AND ip != '' AND ip != '42'");
            const results = [];
            for (const c of copieurs) {
                try {
                    const result = await pingCopieur(c.ip);
                    await pgDb.run('UPDATE hub_copieurs.copieurs SET ping_status = ?, last_seen_active = ? WHERE id = ?',
                        [result.ping_status, result.last_seen_active, c.id]);
                    results.push({ id: c.id, ip: c.ip, ...result });
                } catch (e) {
                    results.push({ id: c.id, ip: c.ip, error: e.message });
                }
            }
            const actifs = results.filter(r => r.ping_status === 'actif').length;
            res.json({ total: copieurs.length, actifs, inactifs: results.length - actifs, details: results });
        } catch (error) {
            res.status(500).json({ message: 'Erreur ping', error: error.message });
        }
    },

    importExcel: async (req, res) => {
        if (!req.file) return res.status(400).json({ message: 'Aucun fichier fourni' });
        try {
            const XLSX = require('xlsx');
            const fs = require('fs');
            const workbook = XLSX.readFile(req.file.path, { cellStyles: true });
            const results = { ville: { total: 0, imported: 0, archived: 0, skipped: 0, errors: [] }, ecoles: { total: 0, imported: 0, archived: 0, skipped: 0, errors: [] } };

            // Sheet 1: Copieurs ville
            const ws1 = workbook.Sheets['Copieurs ville'];
            if (ws1) {
                const rows = XLSX.utils.sheet_to_json(ws1, { defval: '', header: ['direction', 'service', 'secteur', 'adresse', 'numero_serie', 'modele', 'modele_papercut', 'couleur', 'date_acquisition', 'nom_reseau', 'ip', 'present', 'nb_pages', 'mainteneur', 'divers'] });
                const headerRow = rows[0];
                const dataRows = rows.slice(1).filter(r => r.numero_serie && r.numero_serie.toString().trim());

                for (const row of dataRows) {
                    results.ville.total++;
                    const divers = (row.divers || '').toString().trim();
                    const archive = isArchiveKeyword(divers);

                    const clean = (v) => isPlaceholder(v) ? '' : String(v).trim();

                    try {
                        const dateAcq = normalizeDateString(row.date_acquisition);
                        const existing = await pgDb.get('SELECT id FROM hub_copieurs.copieurs WHERE numero_serie = ?', [row.numero_serie.toString().trim()]);
                        const updates = {
                            direction: clean(row.direction), service: clean(row.service), secteur: clean(row.secteur),
                            adresse: clean(row.adresse), modele: clean(row.modele), modele_papercut: clean(row.modele_papercut),
                            couleur: clean(row.couleur), date_acquisition: dateAcq, nom_reseau: clean(row.nom_reseau),
                            ip: clean(row.ip), present: clean(row.present), nb_pages: row.nb_pages && !isPlaceholder(row.nb_pages) ? parseInt(row.nb_pages) : null,
                            mainteneur: clean(row.mainteneur), divers, archive
                        };
                        if (existing) {
                            await pgDb.run(`UPDATE hub_copieurs.copieurs SET direction=?, service=?, secteur=?, adresse=?, modele=?, modele_papercut=?, couleur=?, date_acquisition=?, nom_reseau=?, ip=?, present=?, nb_pages=?, mainteneur=?, divers=?, archive=?, source='ville' WHERE id=?`,
                                [updates.direction, updates.service, updates.secteur, updates.adresse, updates.modele, updates.modele_papercut, updates.couleur, updates.date_acquisition, updates.nom_reseau, updates.ip, updates.present, updates.nb_pages, updates.mainteneur, divers, archive, existing.id]);
                        } else {
                            const coords = await geocodeAddress(clean(row.adresse));
                            await pgDb.run(`INSERT INTO hub_copieurs.copieurs (direction, service, secteur, adresse, numero_serie, modele, modele_papercut, couleur, date_acquisition, nom_reseau, ip, present, nb_pages, mainteneur, divers, archive, source, latitude, longitude) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ville', ?, ?)`,
                                [updates.direction, updates.service, updates.secteur, updates.adresse, row.numero_serie.toString().trim(), updates.modele, updates.modele_papercut, updates.couleur, updates.date_acquisition, updates.nom_reseau, updates.ip, updates.present, updates.nb_pages, updates.mainteneur, divers, archive, coords.latitude, coords.longitude]);
                        }
                        if (archive) results.ville.archived++;
                        else results.ville.imported++;
                    } catch (e) {
                        results.ville.errors.push({ numero_serie: row.numero_serie, error: e.message });
                    }
                }
            }

            // Sheet 2: Copieurs Ecoles
            const ws2 = workbook.Sheets['Copieurs Ecoles'];
            if (ws2) {
                const ref = ws2['!ref'];
                if (ref) {
                    const range = XLSX.utils.decode_range(ref);
                    const rows = [];
                    for (let r = range.s.r + 1; r <= range.e.r; r++) {
                        const rowData = {};
                        for (let c = range.s.c; c <= range.e.c; c++) {
                            const addr = XLSX.utils.encode_cell({ r, c });
                            const cell = ws2[addr];
                            let val = cell ? cell.v : '';
                            if (cell && cell.s && cell.s.font && cell.s.font.strike) {
                                rowData._strikethrough = true;
                            }
                            if (c === 0) rowData.type_ecole = val;
                            else if (c === 1) rowData.ecole = val;
                            else if (c === 2) rowData.adresse = val;
                            else if (c === 3) rowData.marque = val;
                            else if (c === 4) rowData.type = val;
                            else if (c === 5) rowData.numero_serie = val;
                            else if (c === 6) rowData.date_acquisition = val;
                            else if (c === 7) rowData.nom_reseau = val;
                            else if (c === 8) rowData.ip = val;
                            else if (c === 9) rowData.divers = val;
                        }
                        if (rowData.numero_serie && rowData.numero_serie.toString().trim()) {
                            rows.push(rowData);
                        }
                    }

                    const clean = (v) => isPlaceholder(v) ? '' : String(v).trim();
                    for (const row of rows) {
                        results.ecoles.total++;
                        const divers = clean(row.divers);
                        const archive = row._strikethrough || isArchiveKeyword(divers) || (row.ecole || '').toString().toLowerCase() === 'spare';

                        try {
                            const dateAcq = normalizeDateString(row.date_acquisition);
                            const existing = await pgDb.get('SELECT id FROM hub_copieurs.copieurs WHERE numero_serie = ?', [row.numero_serie.toString().trim()]);
                            if (existing) {
                                await pgDb.run(`UPDATE hub_copieurs.copieurs SET direction=?, service=?, secteur=?, adresse=?, modele=?, date_acquisition=?, nom_reseau=?, ip=?, divers=?, archive=?, source='ecoles' WHERE id=?`,
                                    [clean(row.type_ecole), clean(row.ecole), '', clean(row.adresse), clean(row.type), dateAcq, clean(row.nom_reseau), clean(row.ip), divers, archive, existing.id]);
                            } else {
                                const coords = await geocodeAddress(clean(row.adresse));
                                await pgDb.run(`INSERT INTO hub_copieurs.copieurs (direction, service, secteur, adresse, numero_serie, modele, date_acquisition, nom_reseau, ip, divers, archive, source, latitude, longitude) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ecoles', ?, ?)`,
                                    [clean(row.type_ecole), clean(row.ecole), '', clean(row.adresse), row.numero_serie.toString().trim(), clean(row.type), dateAcq, clean(row.nom_reseau), clean(row.ip), divers, archive, coords.latitude, coords.longitude]);
                            }
                            if (archive) results.ecoles.archived++;
                            else results.ecoles.imported++;
                        } catch (e) {
                            results.ecoles.errors.push({ numero_serie: row.numero_serie, error: e.message });
                        }
                    }
                }
            }

            try { if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path); } catch (e) {}

            const total = results.ville.total + results.ecoles.total;
            const imported = results.ville.imported + results.ecoles.imported;
            const archived = results.ville.archived + results.ecoles.archived;
            logMouchard(`Import copieurs: ${total} lignes, ${imported} importés, ${archived} archivés`);
            res.json({ message: `Import terminé: ${imported} copieurs actifs, ${archived} archivés sur ${total} lignes`, details: results });
        } catch (error) {
            res.status(500).json({ message: 'Erreur import Excel', error: error.message });
        }
    },

    importArchives: async (req, res) => {
        if (!req.file) return res.status(400).json({ message: 'Aucun fichier fourni' });
        try {
            const XLSX = require('xlsx');
            const fs = require('fs');
            const workbook = XLSX.readFile(req.file.path);
            const ws = workbook.Sheets['Copieurs ville'];
            if (!ws) return res.status(400).json({ message: 'Onglet "Copieurs ville" introuvable' });

            const rows = XLSX.utils.sheet_to_json(ws, { defval: '', header: ['direction', 'service', 'secteur', 'adresse', 'numero_serie', 'modele', 'modele_papercut', 'couleur', 'date_acquisition', 'nom_reseau', 'ip', 'present', 'nb_pages', 'mainteneur', 'divers'] });
            const dataRows = rows.slice(1).filter(r => r.numero_serie && r.numero_serie.toString().trim());

            const clean = (v) => isPlaceholder(v) ? '' : String(v).trim();
            let imported = 0, updated = 0;

            for (const row of dataRows) {
                try {
                    const dateAcq = normalizeDateString(row.date_acquisition);
                    const existing = await pgDb.get('SELECT id FROM hub_copieurs.copieurs WHERE numero_serie = ?', [row.numero_serie.toString().trim()]);
                    const divers = (row.divers || '').toString().trim();
                    if (existing) {
                        await pgDb.run(`UPDATE hub_copieurs.copieurs SET direction=?, service=?, secteur=?, adresse=?, modele=?, modele_papercut=?, couleur=?, date_acquisition=?, nom_reseau=?, ip=?, present=?, nb_pages=?, mainteneur=?, divers=?, archive=true, source='ville' WHERE id=?`,
                            [clean(row.direction), clean(row.service), clean(row.secteur), clean(row.adresse), clean(row.modele), clean(row.modele_papercut), clean(row.couleur), dateAcq, clean(row.nom_reseau), clean(row.ip), clean(row.present), row.nb_pages && !isPlaceholder(row.nb_pages) ? parseInt(row.nb_pages) : null, clean(row.mainteneur), divers, existing.id]);
                        updated++;
                    } else {
                        await pgDb.run(`INSERT INTO hub_copieurs.copieurs (direction, service, secteur, adresse, numero_serie, modele, modele_papercut, couleur, date_acquisition, nom_reseau, ip, present, nb_pages, mainteneur, divers, archive, source) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, true, 'ville')`,
                            [clean(row.direction), clean(row.service), clean(row.secteur), clean(row.adresse), row.numero_serie.toString().trim(), clean(row.modele), clean(row.modele_papercut), clean(row.couleur), dateAcq, clean(row.nom_reseau), clean(row.ip), clean(row.present), row.nb_pages && !isPlaceholder(row.nb_pages) ? parseInt(row.nb_pages) : null, clean(row.mainteneur), divers]);
                        imported++;
                    }
                } catch (e) {
                    console.error('Archive import row error:', row.numero_serie, e.message);
                }
            }

            try { if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path); } catch (e) {}

            logMouchard(`Import archives: ${imported} créés, ${updated} mis à jour comme archivés`);
            res.json({ message: `Archives importées: ${imported} nouveaux copieurs, ${updated} copieurs existants marqués archivés`, imported, updated });
        } catch (error) {
            res.status(500).json({ message: 'Erreur import archives', error: error.message });
        }
    },

    move: async (req, res) => {
        try {
            const copieur = await pgDb.get('SELECT * FROM hub_copieurs.copieurs WHERE id = ?', [req.params.id]);
            if (!copieur) return res.status(404).json({ message: 'Copieur non trouvé' });

            const { source, direction, service, adresse, ip } = req.body;
            const now = new Date().toLocaleString('sv').replace(' ', 'T');

            await pgDb.run('INSERT INTO hub_copieurs.copieur_moves (copieur_id, moved_at, moved_by, old_source, new_source, old_direction, new_direction, old_service, new_service, old_adresse, new_adresse, old_ip, new_ip) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
                [req.params.id, now, req.user?.username || 'inconnu', copieur.source, source || copieur.source, copieur.direction, direction || copieur.direction, copieur.service, service || copieur.service, copieur.adresse, adresse || copieur.adresse, copieur.ip, ip || copieur.ip]);

            await pgDb.run('UPDATE hub_copieurs.copieurs SET source = ?, direction = ?, service = ?, adresse = ?, ip = ? WHERE id = ?',
                [source || copieur.source, direction || copieur.direction, service || copieur.service, adresse || copieur.adresse, ip || copieur.ip, req.params.id]);

            const updated = await pgDb.get('SELECT * FROM hub_copieurs.copieurs WHERE id = ?', [req.params.id]);
            logMouchard(`Copieur déménagé: ${updated.numero_serie} → ${direction || copieur.direction}`);
            res.json(fixNumeric(updated));
        } catch (error) {
            res.status(500).json({ message: 'Erreur déménagement copieur', error: error.message });
        }
    },

    getMoves: async (req, res) => {
        try {
            const moves = await pgDb.all('SELECT * FROM hub_copieurs.copieur_moves WHERE copieur_id = ? ORDER BY moved_at DESC', [req.params.id]);
            res.json(moves);
        } catch (error) {
            res.status(500).json({ message: 'Erreur récupération historique', error: error.message });
        }
    },

    searchAddress: async (req, res) => {
        try {
            const q = req.query.q;
            if (!q || q.trim().length < 3) return res.json([]);
            const url = `https://api-adresse.data.gouv.fr/search/?q=${encodeURIComponent(q.trim())}&limit=8&autocomplete=1`;
            https.get(url, { headers: { 'User-Agent': 'DSIHub/1.0' } }, (response) => {
                let data = '';
                response.on('data', chunk => data += chunk);
                response.on('end', () => {
                    try {
                        const result = JSON.parse(data);
                        const features = (result.features || []).map((f) => ({
                            label: f.properties.label,
                            postcode: f.properties.postcode,
                            city: f.properties.city,
                            latitude: f.geometry.coordinates[1],
                            longitude: f.geometry.coordinates[0],
                            score: f.properties.score
                        }));
                        res.json(features);
                    } catch { res.json([]); }
                });
            }).on('error', () => res.json([]));
        } catch (error) {
            res.status(500).json({ message: 'Erreur recherche adresse', error: error.message });
        }
    },

    getBoundary: async (req, res) => {
        try {
            const fs = require('fs');
            const path = require('path');
            const geojsonPath = path.join(__dirname, '..', '..', '..', 'communes-94-val-de-marne.geojson');
            if (!fs.existsSync(geojsonPath)) return res.status(404).json({ message: 'Fichier GeoJSON non trouvé' });
            const raw = JSON.parse(fs.readFileSync(geojsonPath, 'utf-8'));
            const ivry = raw.features.find((f) => f.properties.nom === 'Ivry-sur-Seine');
            if (!ivry) return res.status(404).json({ message: 'Ivry-sur-Seine non trouvé' });
            res.json(ivry.geometry);
        } catch (error) {
            res.status(500).json({ message: 'Erreur chargement limite', error: error.message });
        }
    },

    importPapercut: async (req, res) => {
        if (!req.file) return res.status(400).json({ message: 'Aucun fichier fourni' });
        let matched = 0, notFound = 0, errors = [];
        try {
            const fs = require('fs');
            const path = require('path');
            const ext = path.extname(req.file.originalname).toLowerCase();
            let rows = [];

            if (ext === '.csv') {
                const csv = fs.readFileSync(req.file.path, 'utf-8');
                const lines = csv.split(/\r?\n/).filter(l => l.trim());
                if (lines.length === 0) return res.status(400).json({ message: 'Fichier CSV vide' });
                rows = lines.map(line => line.split(';').map(v => v.replace(/^"|"$/g, '').trim()));
            } else {
                const XLSX = require('xlsx');
                const workbook = XLSX.readFile(req.file.path);
                const ws = workbook.Sheets[workbook.SheetNames[0]];
                rows = XLSX.utils.sheet_to_json(ws, { defval: '', header: 1 });
            }

            const parseIp = (val) => {
                if (!val) return null;
                const s = val.toString().trim();
                return s.replace(/^net:\/\//, '').replace(/\/\w+$/, '');
            };

            const now = new Date().toLocaleString('sv').replace(' ', 'T');

            if (rows.length > 0 && Array.isArray(rows[0]) && /^[a-z\séèêëàâùûüôöîïç\-_]+$/i.test(rows[0][4] || '')) {
                rows.shift();
            }

            for (const row of rows) {
                try {
                    const cols = Array.isArray(row) ? row : Object.values(row);
                    const serial = cols[4] ? cols[4].toString().trim() : '';
                    if (!serial) { notFound++; continue; }
                    const existing = await pgDb.get('SELECT id, ip FROM hub_copieurs.copieurs WHERE numero_serie = ?', [serial]);
                    if (!existing) { notFound++; continue; }

                    const rawIp = cols[3] ? cols[3].toString().trim() : '';
                    const ip = parseIp(rawIp);

                    const updates = { papercut_matched: true, papercut_last_import: now };
                    if (ip) updates.ip = ip;

                    const setClauses = Object.keys(updates).map(k => `${k} = ?`).join(', ');
                    const values = Object.values(updates);
                    values.push(existing.id);
                    await pgDb.run(`UPDATE hub_copieurs.copieurs SET ${setClauses} WHERE id = ?`, values);
                    matched++;
                } catch (e) {
                    errors.push(e.message);
                }
            }

            try { if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path); } catch (e) {}

            logMouchard(`Import PaperCut: ${matched} copieurs mis à jour, ${notFound} non trouvés`);
            res.json({ message: `PaperCut: ${matched} copieurs mis à jour, ${notFound} non trouvés`, matched, notFound, errors: errors.slice(0, 10) });
        } catch (error) {
            res.status(500).json({ message: 'Erreur import PaperCut', error: error.message });
        }
    }
};
