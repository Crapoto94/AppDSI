const { pgDb, getSqlite } = require('../../shared/database');
const { logMouchard } = require('../../shared/utils');
const axios = require('axios');
const https = require('https');
const http = require('http');
const { HttpsProxyAgent } = require('https-proxy-agent');
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
            let sql = 'SELECT c.*, (SELECT MAX(date_visite) FROM hub_copieurs.copieur_visites v WHERE v.copieur_id = c.id) as last_visit_date, (SELECT MAX(date_releve) FROM hub_copieurs.copieur_releves r WHERE r.copieur_id = c.id) as last_releve_date, (SELECT r2.valeur FROM hub_copieurs.copieur_releves r2 JOIN hub_copieurs.compteur_codes cc2 ON cc2.id = r2.code_id WHERE r2.copieur_id = c.id AND cc2.couleur = false ORDER BY r2.date_releve DESC, r2.id DESC LIMIT 1) as last_nb_value, (SELECT r3.valeur FROM hub_copieurs.copieur_releves r3 JOIN hub_copieurs.compteur_codes cc3 ON cc3.id = r3.code_id WHERE r3.copieur_id = c.id AND cc3.couleur = true ORDER BY r3.date_releve DESC, r3.id DESC LIMIT 1) as last_coul_value, (SELECT CAST(EXISTS (SELECT 1 FROM (SELECT valeur::bigint, LAG(valeur::bigint) OVER (PARTITION BY code_id ORDER BY date_releve) AS prev_v FROM hub_copieurs.copieur_releves WHERE copieur_id = c.id) t WHERE t.prev_v IS NOT NULL AND t.valeur < t.prev_v) AS boolean)) as has_decreasing_counter FROM hub_copieurs.copieurs c';
            if (filter === 'archives') sql += ' WHERE c.archive = true';
            else if (filter === 'tous') ;
            else sql += ' WHERE c.archive = false';
            sql += ' ORDER BY c.direction, c.service';
            const copieurs = await pgDb.all(sql);
            res.json(copieurs.map(fixNumeric));
        } catch (error) {
            res.status(500).json({ message: 'Erreur récupération copieurs', error: error.message });
        }
    },

    getById: async (req, res) => {
        try {
            const copieur = await pgDb.get('SELECT c.*, (SELECT MAX(date_visite) FROM hub_copieurs.copieur_visites v WHERE v.copieur_id = c.id) as last_visit_date FROM hub_copieurs.copieurs c WHERE c.id = ?', [req.params.id]);
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

    savePingResults: async (req, res) => {
        try {
            const { results } = req.body;
            if (!Array.isArray(results)) return res.status(400).json({ message: 'Résultats manquants' });
            for (const r of results) {
                await pgDb.run('UPDATE hub_copieurs.copieurs SET ping_status = ?, last_seen_active = ? WHERE id = ?',
                    [r.ping_status, r.last_seen_active || null, r.id]);
            }
            const actifs = results.filter(r => r.ping_status === 'actif').length;
            res.json({ saved: results.length, actifs, inactifs: results.length - actifs });
        } catch (error) {
            res.status(500).json({ message: 'Erreur sauvegarde ping', error: error.message });
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
    },

    importKpax: async (req, res) => {
        if (!req.file) return res.status(400).json({ message: 'Aucun fichier fourni' });
        try {
            const fs = require('fs');
            const XLSX = require('xlsx');
            const workbook = XLSX.readFile(req.file.path);
            const ws = workbook.Sheets[workbook.SheetNames[0]];
            const rows = XLSX.utils.sheet_to_json(ws, { defval: '', header: 1 });
            const dataRows = rows.slice(1).filter(r => r[7] && r[7].toString().trim());

            let updated = 0, notFound = 0, errors = [];

            const now = new Date().toLocaleString('sv').replace(' ', 'T');

            // Reset all copieurs kpax status to 'non' before import
            await pgDb.run("UPDATE hub_copieurs.copieurs SET kpax_status = 'non', kpax_last_collecte = NULL");

            for (const row of dataRows) {
                try {
                    const serial = row[7].toString().trim();
                    const status = row[2] ? row[2].toString().trim().toLowerCase() : 'non géré';
                    const rawIp = row[6] ? row[6].toString().trim() : '';
                    const ip = rawIp.replace(/^net:\/\//, '').replace(/\/\w+$/, '');
                    const nomReseau = row[9] ? row[9].toString().trim() : '';
                    const rawCollecte = row[1];

                    let collecteDate = null;
                    if (rawCollecte !== undefined && rawCollecte !== null && rawCollecte !== '') {
                        const num = Number(rawCollecte);
                        if (!isNaN(num) && num > 1) {
                            const d = new Date((num - 25569) * 86400 * 1000);
                            if (!isNaN(d.getTime())) {
                                collecteDate = d.toLocaleString('sv').replace(' ', 'T');
                            }
                        }
                    }

                    const existing = await pgDb.get('SELECT id, ip FROM hub_copieurs.copieurs WHERE numero_serie = ?', [serial]);
                    if (!existing) {
                        notFound++;
                        continue;
                    }

                    const kpaxStatus = status === 'géré' ? 'géré' : 'non géré';
                    const updates = { kpax_status: kpaxStatus, kpax_last_collecte: collecteDate };
                    if (ip) updates.ip = ip;
                    if (nomReseau) updates.nom_reseau = nomReseau;

                    const setClauses = Object.keys(updates).map(k => `${k} = ?`).join(', ');
                    const values = Object.values(updates);
                    values.push(existing.id);
                    await pgDb.run(`UPDATE hub_copieurs.copieurs SET ${setClauses} WHERE id = ?`, values);
                    updated++;
                } catch (e) {
                    errors.push(e.message);
                }
            }

            logMouchard(`Import KPAX: ${updated} copieurs mis à jour, ${notFound} non trouvés dans la base`);
            try { if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path); } catch (e) {}
            res.json({ message: `KPAX: ${updated} copieurs mis à jour, ${notFound} non trouvés dans la base`, updated, notFound, errors: errors.slice(0, 10) });
        } catch (error) {
            res.status(500).json({ message: 'Erreur import KPAX', error: error.message });
        }
    },

    getInterventions: async (req, res) => {
        try {
            const interventions = await pgDb.all('SELECT * FROM hub_copieurs.copieur_interventions WHERE copieur_id = ? ORDER BY date_intervention DESC, created_at DESC', [req.params.id]);
            res.json(interventions);
        } catch (error) {
            res.status(500).json({ message: 'Erreur récupérations interventions', error: error.message });
        }
    },

    addIntervention: async (req, res) => {
        try {
            const { date_intervention, mainteneur, technicien, description } = req.body;
            if (!date_intervention) return res.status(400).json({ message: 'Date requise' });
            const result = await pgDb.run(
                'INSERT INTO hub_copieurs.copieur_interventions (copieur_id, date_intervention, mainteneur, technicien, description, created_by) VALUES (?, ?, ?, ?, ?, ?)',
                [req.params.id, date_intervention, mainteneur || '', technicien || '', description || '', req.user?.username || 'inconnu']
            );
            const intervention = await pgDb.get('SELECT * FROM hub_copieurs.copieur_interventions WHERE id = ?', [result.lastID]);
            logMouchard(`Intervention ajoutée au copieur ${req.params.id}: ${technicien || '?'} - ${mainteneur || '?'}`);
            res.status(201).json(intervention);
        } catch (error) {
            res.status(500).json({ message: 'Erreur ajout intervention', error: error.message });
        }
    },

    deleteIntervention: async (req, res) => {
        try {
            const intervention = await pgDb.get('SELECT * FROM hub_copieurs.copieur_interventions WHERE id = ?', [req.params.interventionId]);
            if (!intervention) return res.status(404).json({ message: 'Intervention non trouvée' });
            await pgDb.run('DELETE FROM hub_copieurs.copieur_interventions WHERE id = ?', [req.params.interventionId]);
            logMouchard(`Intervention ${req.params.interventionId} supprimée du copieur ${intervention.copieur_id}`);
            res.json({ message: 'Intervention supprimée' });
        } catch (error) {
            res.status(500).json({ message: 'Erreur suppression intervention', error: error.message });
        }
    },

    importEmails: async (req, res) => {
        try {
            const db = getSqlite();
            const settings = await db.get('SELECT * FROM azure_ad_settings WHERE id = 1');
            if (!settings || !settings.is_enabled || !settings.client_id || !settings.client_secret || !settings.tenant_id || !settings.mailbox) {
                const missing = [];
                if (!settings) missing.push('settings=null');
                else { if (!settings.is_enabled) missing.push('is_enabled'); if (!settings.client_id) missing.push('client_id'); if (!settings.client_secret) missing.push('client_secret'); if (!settings.tenant_id) missing.push('tenant_id'); if (!settings.mailbox) missing.push('mailbox'); }
                return res.status(400).json({ message: 'Azure AD non configuré — configurez dans /admin > AD et Entra', missing });
            }

            const proxyUrl = process.env.HTTPS_PROXY || process.env.HTTP_PROXY || process.env.https_proxy || process.env.http_proxy || null;
            const axiosOpts = proxyUrl
                ? { httpsAgent: new HttpsProxyAgent(proxyUrl, { rejectUnauthorized: false }), proxy: false }
                : { httpsAgent: new https.Agent({ rejectUnauthorized: false }) };

            const tokenRes = await axios.post(
                `https://login.microsoftonline.com/${settings.tenant_id}/oauth2/v2.0/token`,
                new URLSearchParams({
                    client_id: settings.client_id,
                    client_secret: settings.client_secret,
                    grant_type: 'client_credentials',
                    scope: 'https://graph.microsoft.com/.default'
                }).toString(),
                { ...axiosOpts, headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
            );
            const token = tokenRes.data.access_token;

            const allEmails = [];
            try {
                let nextLink = null;
                const firstMailRes = await axios.get(
                    `https://graph.microsoft.com/v1.0/users/${settings.mailbox}/messages`,
                    {
                        ...axiosOpts,
                        headers: { Authorization: `Bearer ${token}` },
                        params: {
                            $filter: "from/emailAddress/address eq 'sav.idf@koesio.com'",
                            $top: 100,
                            $select: 'id,subject,receivedDateTime,from,body,bodyPreview,internetMessageId'
                        }
                    }
                );
                allEmails.push(...(firstMailRes.data.value || []));
                nextLink = firstMailRes.data['@odata.nextLink'] || null;

                while (nextLink) {
                    const pageRes = await axios.get(nextLink, {
                        ...axiosOpts,
                        headers: { Authorization: `Bearer ${token}` }
                    });
                    allEmails.push(...(pageRes.data.value || []));
                    nextLink = pageRes.data['@odata.nextLink'] || null;
                }
            } catch (graphErr) {
                const msg = graphErr.response?.data?.error?.message || graphErr.message;
                if (graphErr.response?.status === 403) {
                    return res.status(403).json({
                        message: `L'application Azure AD n'a pas la permission Mail.Read. Ajoutez-la dans portal.azure.com > App registrations > API permissions, puis "Grant admin consent".`,
                        detail: msg
                    });
                }
                throw graphErr;
            }

            const emails = allEmails;
            let imported = 0, skipped = 0, matched = 0, noMatch = 0;

            for (const email of emails) {
                try {
                    const existing = await pgDb.get('SELECT id FROM hub_copieurs.copieur_interventions WHERE email_message_id = ?', [email.internetMessageId || email.id]);
                    if (existing) { skipped++; continue; }

                    const body = email.body?.content || email.bodyPreview || '';
                    const cleanBody = body
                        .replace(/<[^>]+>/g, '\n')
                        .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ');

                    const lines = cleanBody.split('\n').map(l => l.trim()).filter(l => l);

                    // Demandeur : nom après "Bonjour" jusqu'à la première virgule (max 50 chars)
                    let demandeur = '';
                    const bonjourMatch = cleanBody.match(/Bonjour\s+(.{2,50}?)\s*,/);
                    if (bonjourMatch) demandeur = bonjourMatch[1].trim();

                    let technicien = '';
                    let serialNumber = '';

                    // Détection du format selon la présence d'une ligne "Bien :"
                    const bienLine = lines.find(l => /^bien\s*:/i.test(l));

                    if (bienLine) {
                        // Format ancien : "Bien : modèle SERIALNUMBER"
                        const words = bienLine.split(/\s+/).filter(w => w);
                        const candidate = words[words.length - 1].replace(/[^a-zA-Z0-9]/g, '');
                        if (candidate.length >= 5) serialNumber = candidate;

                        // Technicien : ligne immédiatement après "Cordialement,"
                        const cordIdx = lines.findIndex(l => /^cordialement/i.test(l));
                        if (cordIdx !== -1 && lines[cordIdx + 1]) {
                            technicien = lines[cordIdx + 1].trim();
                        }
                    } else {
                        // Format nouveau : "Matériel concerné :" → ligne suivante
                        let matLineIdx = -1;
                        for (let li = lines.length - 1; li >= 0; li--) {
                            if (/mat.riel\s*concern./i.test(lines[li])) { matLineIdx = li; break; }
                        }
                        if (matLineIdx !== -1) {
                            const afterColon = lines[matLineIdx].replace(/mat.riel\s*concern.\s*:?\s*/i, '').trim();
                            const sourceLine = afterColon.length > 3 ? afterColon : (lines[matLineIdx + 1] || '');
                            const words = sourceLine.split(/\s+/).filter(w => w);
                            if (words.length) {
                                const candidate = words[words.length - 1].replace(/[^a-zA-Z0-9]/g, '');
                                if (candidate.length >= 5) serialNumber = candidate;
                            }
                        }

                        // Technicien : "Notre technicien, NOM, a terminé"
                        const techMatch = cleanBody.match(/Notre technicien[^,]*,\s*([^,]+),/i);
                        if (techMatch) technicien = techMatch[1].trim();
                    }

                    // Extraction du détail d'intervention (texte après "Détail DIT :" ou "Détail de l'intervention :")
                    let detailText = '';
                    const rawLines = cleanBody.split('\n');
                    let detailStartIdx = -1;
                    for (let li = 0; li < rawLines.length; li++) {
                        const trimmed = rawLines[li].trim();
                        // Ligne qui contient uniquement le label "Détail DIT :" ou "Détail de l'intervention :"
                        if (/^d[eé]tail(?:\s+dit|\s+de\s+l.intervention)\s*:?\s*$/i.test(trimmed)) {
                            detailStartIdx = li + 1;
                            break;
                        }
                        // Label suivi de texte sur la même ligne : "Détail DIT : texte ici"
                        const inline = trimmed.match(/^d[eé]tail(?:\s+dit|\s+de\s+l.intervention)\s*:?\s*(.+)/i);
                        if (inline) {
                            detailText = inline[1].trim();
                            detailStartIdx = li + 1;
                            break;
                        }
                    }
                    if (detailStartIdx !== -1) {
                        for (let li = detailStartIdx; li < rawLines.length; li++) {
                            const l = rawLines[li].trim();
                            if (/^(cordialement|bien\s+cordialement|notre\s+technicien|de\s*:|à\s*:|--)/i.test(l)) break;
                            if (!l && detailText.length > 30) break;
                            if (l) detailText += (detailText ? '\n' : '') + l;
                        }
                    }
                    if (!detailText) detailText = cleanBody.substring(0, 800);

                    const copieur = serialNumber ? await pgDb.get('SELECT id, numero_serie FROM hub_copieurs.copieurs WHERE numero_serie = ?', [serialNumber]) : null;
                    if (copieur) matched++;
                    else noMatch++;

                    const receivedDate = email.receivedDateTime ? new Date(email.receivedDateTime) : new Date();
                    const localDate = receivedDate.toLocaleString('sv').split(' ')[0];

                    await pgDb.run(
                        `INSERT INTO hub_copieurs.copieur_interventions (copieur_id, date_intervention, mainteneur, technicien, description, created_by, email_message_id, email_subject, email_received_at, email_from, email_demandeur) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                        [
                            copieur ? copieur.id : null,
                            localDate,
                            email.from?.emailAddress?.name || 'Koesio',
                            technicien,
                            detailText.substring(0, 1500),
                            'import-email',
                            email.internetMessageId || email.id,
                            email.subject || '',
                            email.receivedDateTime || null,
                            email.from?.emailAddress?.address || '',
                            demandeur
                        ]
                    );
                    imported++;
                } catch (e) {
                    console.error('Erreur traitement email:', e.message);
                }
            }

            logMouchard(`Import emails: ${imported} importés, ${skipped} déjà présents, ${matched} copieurs matchés, ${noMatch} sans correspondance`);
            res.json({ imported, skipped, matched, noMatch, total: emails.length });
        } catch (error) {
            res.status(500).json({ message: 'Erreur import emails', error: error.message });
        }
    },

    getAllInterventions: async (req, res) => {
        try {
            const interventions = await pgDb.all(`
                SELECT i.*, c.numero_serie, c.direction, c.service, c.source
                FROM hub_copieurs.copieur_interventions i
                LEFT JOIN hub_copieurs.copieurs c ON i.copieur_id = c.id
                ORDER BY i.date_intervention DESC, i.created_at DESC
            `);
            res.json(interventions);
        } catch (error) {
            res.status(500).json({ message: 'Erreur récupération interventions', error: error.message });
        }
    },

    getEmailLink: async (req, res) => {
        try {
            const intervention = await pgDb.get('SELECT * FROM hub_copieurs.copieur_interventions WHERE id = ?', [req.params.interventionId]);
            if (!intervention) return res.status(404).json({ message: 'Intervention non trouvée' });
            if (!intervention.email_message_id) return res.status(400).json({ message: 'Pas de message email associé' });

            const db = getSqlite();
            const settings = await db.get('SELECT * FROM azure_ad_settings WHERE id = 1');
            if (!settings || !settings.is_enabled) return res.status(400).json({ message: 'Azure AD non configuré' });

            const proxyUrl = process.env.HTTPS_PROXY || process.env.HTTP_PROXY || process.env.https_proxy || process.env.http_proxy || null;
            const axiosOpts = proxyUrl
                ? { httpsAgent: new HttpsProxyAgent(proxyUrl, { rejectUnauthorized: false }), proxy: false }
                : { httpsAgent: new https.Agent({ rejectUnauthorized: false }) };

            const tokenRes = await axios.post(
                `https://login.microsoftonline.com/${settings.tenant_id}/oauth2/v2.0/token`,
                new URLSearchParams({ client_id: settings.client_id, client_secret: settings.client_secret, grant_type: 'client_credentials', scope: 'https://graph.microsoft.com/.default' }).toString(),
                { ...axiosOpts, headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
            );
            const token = tokenRes.data.access_token;

            const msgRes = await axios.get(
                `https://graph.microsoft.com/v1.0/users/${settings.mailbox}/messages`,
                {
                    ...axiosOpts,
                    headers: { Authorization: `Bearer ${token}` },
                    params: {
                        $filter: `internetMessageId eq '${intervention.email_message_id}'`,
                        $select: 'id,body',
                        $top: 1
                    }
                }
            );
            const msgs = msgRes.data.value || [];
            if (!msgs.length) return res.status(404).json({ message: 'Message introuvable dans la boite' });
            res.json({ html: msgs[0].body?.content || '', contentType: msgs[0].body?.contentType || 'text' });
        } catch (error) {
            res.status(500).json({ message: 'Erreur récupération lien email', error: error.message });
        }
    },

    getInterventionCounts: async (req, res) => {
        try {
            const counts = await pgDb.all(`
                SELECT copieur_id, COUNT(*) as count
                FROM hub_copieurs.copieur_interventions
                WHERE copieur_id > 0
                GROUP BY copieur_id
            `);
            const map = {};
            counts.forEach(c => map[c.copieur_id] = c.count);
            res.json(map);
        } catch (error) {
            res.status(500).json({ message: 'Erreur comptage interventions', error: error.message });
        }
    },

    getVisites: async (req, res) => {
        try {
            const visites = await pgDb.all(
                'SELECT * FROM hub_copieurs.copieur_visites WHERE copieur_id = ? ORDER BY date_visite DESC, created_at DESC',
                [req.params.id]
            );
            const formatted = visites.map(v => {
                try {
                    v.photos = JSON.parse(v.photos || '[]');
                } catch {
                    v.photos = [];
                }
                return v;
            });
            res.json(formatted);
        } catch (error) {
            res.status(500).json({ message: 'Erreur récupération visites', error: error.message });
        }
    },

    addVisite: async (req, res) => {
        try {
            const { date_visite, annotation } = req.body;
            if (!date_visite) return res.status(400).json({ message: 'Date requise' });

            const copieur = await pgDb.get('SELECT id FROM hub_copieurs.copieurs WHERE id = ?', [req.params.id]);
            if (!copieur) return res.status(404).json({ message: 'Copieur non trouvé' });

            const photos = [];
            if (req.files && req.files.length > 0) {
                const fs = require('fs');
                const path = require('path');
                
                for (const file of req.files) {
                    const extension = path.extname(file.originalname).toLowerCase();
                    const filename = `visit_${Date.now()}_${Math.round(Math.random() * 1E9)}${extension}`;
                    const destPath = path.join(__dirname, '..', '..', 'uploads', filename);
                    
                    fs.renameSync(file.path, destPath);
                    photos.push(`/uploads/${filename}`);
                }
            }

            const result = await pgDb.run(
                'INSERT INTO hub_copieurs.copieur_visites (copieur_id, date_visite, annotation, photos, created_by) VALUES (?, ?, ?, ?, ?)',
                [req.params.id, date_visite, annotation || '', JSON.stringify(photos), req.user?.username || 'inconnu']
            );

            const visite = await pgDb.get('SELECT * FROM hub_copieurs.copieur_visites WHERE id = ?', [result.lastID]);
            try {
                visite.photos = JSON.parse(visite.photos || '[]');
            } catch {
                visite.photos = [];
            }

            logMouchard(`Visite ajoutée au copieur ${req.params.id}: par ${req.user?.username || 'inconnu'}`);
            res.status(201).json(visite);
        } catch (error) {
            if (req.files) {
                const fs = require('fs');
                req.files.forEach(f => {
                    try { if (fs.existsSync(f.path)) fs.unlinkSync(f.path); } catch (e) {}
                });
            }
            res.status(500).json({ message: 'Erreur ajout visite', error: error.message });
        }
    },

    deleteVisite: async (req, res) => {
        try {
            const visite = await pgDb.get('SELECT * FROM hub_copieurs.copieur_visites WHERE id = ?', [req.params.visiteId]);
            if (!visite) return res.status(404).json({ message: 'Visite non trouvée' });

            let photos = [];
            try {
                photos = JSON.parse(visite.photos || '[]');
            } catch {}

            const fs = require('fs');
            const path = require('path');
            photos.forEach(photoPath => {
                const filename = path.basename(photoPath);
                const fullPath = path.join(__dirname, '..', '..', 'uploads', filename);
                try {
                    if (fs.existsSync(fullPath)) {
                        fs.unlinkSync(fullPath);
                    }
                } catch (e) {
                    console.error('Erreur suppression fichier photo:', fullPath, e.message);
                }
            });

            await pgDb.run('DELETE FROM hub_copieurs.copieur_visites WHERE id = ?', [req.params.visiteId]);
            logMouchard(`Visite ${req.params.visiteId} supprimée du copieur ${visite.copieur_id}`);
            res.json({ message: 'Visite supprimée' });
        } catch (error) {
            res.status(500).json({ message: 'Erreur suppression visite', error: error.message });
        }
    },

    // ─── Import Excel compteurs annuel ───────────────────────────────────────

    importCompteurExcel: async (req, res) => {
        if (!req.file) return res.status(400).json({ message: 'Aucun fichier fourni' });
        const fs = require('fs');
        try {
            const XLSX = require('xlsx');
            const { pool } = require('../../shared/database');

            // Mainteneur et année fournis explicitement dans le corps de la requête
            const mainteneur = (req.body.mainteneur || '').trim();
            const yearRaw    = (req.body.year || '').trim();
            if (!mainteneur) { fs.unlinkSync(req.file.path); return res.status(400).json({ message: 'Mainteneur obligatoire' }); }
            const year = parseInt(yearRaw);
            if (!year || year < 2000 || year > 2099) { fs.unlinkSync(req.file.path); return res.status(400).json({ message: 'Année invalide (format YYYY)' }); }

            // Indices colonnes (0-based) : A=0, B=1, C=2, D=3...
            const COL = { TYPE: 3, SERIE: 7, DATE_ACQ: 11, PRIX: 12, OPTIONS: 14, COUT_OPT: 15, COMPTEUR: 18, Z: 25, AA: 26, AB: 27, AC: 28 };

            // Dates de fin de trimestre
            const DATES = { q1: `${year}-03-31`, q2: `${year}-06-30`, q3: `${year}-09-30`, q4: `${year}-12-31` };

            const toNum = (v) => {
                if (v === null || v === undefined || v === '') return null;
                if (typeof v === 'number') return v;
                const n = parseFloat(String(v).replace(/\s/g, '').replace(',', '.'));
                return isNaN(n) ? null : n;
            };
            const toInt = (v) => { const n = toNum(v); return n === null ? null : Math.round(n); };

            // Calcul des trimestres depuis les colonnes Excel
            const computeQuarters = (row) => {
                const s = toInt(row[COL.COMPTEUR]);
                if (s === null) return [];
                const ac = toInt(row[COL.AC]);
                const ab = toInt(row[COL.AB]);
                const aa = toInt(row[COL.AA]);
                const quarters = [{ date: DATES.q4, valeur: s }];
                if (ac !== null) {
                    const vQ3 = s - ac;
                    if (vQ3 >= 0) {
                        quarters.push({ date: DATES.q3, valeur: vQ3 });
                        if (ab !== null) {
                            const vQ2 = vQ3 - ab;
                            if (vQ2 >= 0) {
                                quarters.push({ date: DATES.q2, valeur: vQ2 });
                                if (aa !== null) {
                                    const vQ1 = vQ2 - aa;
                                    if (vQ1 >= 0) quarters.push({ date: DATES.q1, valeur: vQ1 });
                                }
                            }
                        }
                    }
                }
                return quarters;
            };

            // Lire le premier onglet
            const workbook = XLSX.readFile(req.file.path);
            const ws = workbook.Sheets[workbook.SheetNames[0]];
            const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });

            const stats = { year, mainteneur, filename: req.file.originalname, totalRows: 0, copieursUpdated: 0, relevesInserted: 0, notFound: [], noCode: [], errors: [] };
            const username = req.user?.username || req.user?.name || '';

            // ═══════════════════════════════════════════════════════════════════════
            // ── CANON : format trimestriel spécifique ──────────────────────────────
            //  • Colonnes AF-AM (0-indexed 31-38) = copies RÉALISÉES par trimestre
            //    AF=Q1 A4, AG=Q1 A3, AH=Q2 A4, AI=Q2 A3,
            //    AJ=Q3 A4, AK=Q3 A3, AL=Q4 A4, AM=Q4 A3
            //  • Données = copies de la période (pas compteur cumulatif) → on cumule
            //  • Les compteurs A3 et A4 sont trackés séparément (2 codes dans la DB)
            //  • Numéro de série en H (col 7), date acquisition en L (col 11)
            // ═══════════════════════════════════════════════════════════════════════
            if (mainteneur.toLowerCase() === 'canon') {
                const CANON_Q = [
                    { quarter: 1, format: 'A4', col: 31 }, // AF
                    { quarter: 1, format: 'A3', col: 32 }, // AG
                    { quarter: 2, format: 'A4', col: 33 }, // AH
                    { quarter: 2, format: 'A3', col: 34 }, // AI
                    { quarter: 3, format: 'A4', col: 35 }, // AJ
                    { quarter: 3, format: 'A3', col: 36 }, // AK
                    { quarter: 4, format: 'A4', col: 37 }, // AL
                    { quarter: 4, format: 'A3', col: 38 }, // AM
                ];

                // Compteurs de départ connus au 31/12/(year-1)
                // A4 = mono + couleur, A3 = mono + couleur
                // 3BR04659 fin 2020 : A4 mono 708 + coul 2344 = 3052 ; A3 mono 416 + coul 430 = 846
                const CANON_BASELINES = {
                    '3BR04659': { A4: 3052, A3: 846 },
                };

                // Codes compteur Canon par format (configurés via Codes compteur, champ "format" = "A4" ou "A3")
                const codesRes = await pool.query(
                    `SELECT id, format FROM hub_copieurs.compteur_codes WHERE LOWER(mainteneur)=LOWER($1)`,
                    [mainteneur]
                );
                const codeIdByFormat = {};
                for (const c of codesRes.rows) {
                    const fmt = (c.format || '').toUpperCase().trim();
                    if (fmt && !codeIdByFormat[fmt]) codeIdByFormat[fmt] = c.id;
                }

                // Regrouper colonnes par format → { A4: [{quarter,col},...], A3: [...] }
                const formatGroups = {};
                for (const q of CANON_Q) {
                    if (!formatGroups[q.format]) formatGroups[q.format] = [];
                    formatGroups[q.format].push(q);
                }

                const qDates = [DATES.q1, DATES.q2, DATES.q3, DATES.q4];

                for (const row of rows) {
                    if (!Array.isArray(row)) continue;
                    const raw = row[7]; // col H = numéro de série
                    if (!raw) continue;
                    const serie = String(raw).trim();
                    if (!serie || serie.length < 3 || isPlaceholder(serie)) continue;

                    stats.totalRows++;
                    try {
                        const dateAcq = normalizeDateString(row[11]); // col L

                        // Copies réalisées par format et par trimestre
                        // consoByFormat = { A4: [q1, q2, q3, q4], A3: [...] }
                        const consoByFormat = {};
                        for (const [fmt, qs] of Object.entries(formatGroups)) {
                            consoByFormat[fmt] = [0, 0, 0, 0];
                            for (const q of qs) {
                                consoByFormat[fmt][q.quarter - 1] = toInt(row[q.col]) || 0;
                            }
                        }

                        // Chercher le copieur en base
                        const cRes = await pool.query(
                            `SELECT id FROM hub_copieurs.copieurs WHERE LOWER(TRIM(numero_serie)) = LOWER($1)`,
                            [serie]
                        );

                        if (cRes.rows.length === 0) {
                            // Copieur inconnu → pendingReleves pour les deux formats (baseline = 0 pour nouveau copieur)
                            const pendingReleves = [];
                            for (const [fmt, consumptions] of Object.entries(consoByFormat)) {
                                const codeId = codeIdByFormat[fmt];
                                if (!codeId || consumptions.every(v => v === 0)) continue;
                                let cumul = 0;
                                for (let i = 0; i < 4; i++) {
                                    cumul += consumptions[i];
                                    pendingReleves.push({ code_id: codeId, date: qDates[i], valeur: cumul });
                                }
                            }
                            stats.notFound.push({
                                serie, type: 'canon (A4+A3)',
                                codeId: codeIdByFormat['A4'] || null,
                                pendingReleves, dateAcq,
                                prix: null, options: null, coutOpt: null,
                            });
                            continue;
                        }

                        const copieurId = cRes.rows[0].id;

                        // Mise à jour date d'acquisition (sans écraser une valeur existante)
                        if (dateAcq) {
                            await pool.query(
                                `UPDATE hub_copieurs.copieurs SET date_acquisition=COALESCE(date_acquisition,$1) WHERE id=$2`,
                                [dateAcq, copieurId]
                            );
                            stats.copieursUpdated++;
                        }

                        // Pour chaque format (A4 puis A3) : baseline → cumul trimestriel → INSERT
                        for (const [fmt, consumptions] of Object.entries(consoByFormat)) {
                            const codeId = codeIdByFormat[fmt];
                            if (!codeId) { stats.noCode.push({ serie, mainteneur, type: fmt }); continue; }

                            // Aucune copie pour ce format cette année → pas de relevé à insérer
                            if (consumptions.every(v => v === 0)) continue;

                            // Baseline = dernier relevé connu avant le 1er janvier de l'année importée
                            const baseRes = await pool.query(
                                `SELECT valeur FROM hub_copieurs.copieur_releves
                                 WHERE copieur_id=$1 AND code_id=$2 AND date_releve < $3
                                 ORDER BY date_releve DESC LIMIT 1`,
                                [copieurId, codeId, `${year}-01-01`]
                            );

                            let baseline = 0;
                            if (baseRes.rows.length > 0) {
                                baseline = Number(baseRes.rows[0].valeur);
                            } else {
                                // Pas d'historique : vérifier les compteurs de départ connus
                                const serieUp = serie.toUpperCase();
                                const known = CANON_BASELINES[serieUp];
                                if (known && known[fmt] !== undefined) {
                                    baseline = known[fmt];
                                    // Insérer automatiquement le relevé de départ (31/12 année précédente)
                                    await pool.query(`
                                        INSERT INTO hub_copieurs.copieur_releves
                                            (copieur_id, code_id, date_releve, valeur, mainteneur, created_by)
                                        VALUES ($1,$2,$3,$4,$5,$6)
                                        ON CONFLICT (copieur_id, code_id, date_releve)
                                        DO UPDATE SET valeur=$4, mainteneur=$5, created_by=$6
                                    `, [copieurId, codeId, `${year - 1}-12-31`, baseline, mainteneur, username]);
                                }
                                // Sinon baseline reste 0 (nouveau copieur sans historique antérieur)
                            }

                            // Cumul trimestriel → 4 relevés par format
                            let cumul = baseline;
                            for (let i = 0; i < 4; i++) {
                                cumul += consumptions[i];
                                await pool.query(`
                                    INSERT INTO hub_copieurs.copieur_releves
                                        (copieur_id, code_id, date_releve, valeur, mainteneur, created_by)
                                    VALUES ($1,$2,$3,$4,$5,$6)
                                    ON CONFLICT (copieur_id, code_id, date_releve)
                                    DO UPDATE SET valeur=$4, mainteneur=$5, created_by=$6
                                `, [copieurId, codeId, qDates[i], cumul, mainteneur, username]);
                                stats.relevesInserted++;
                            }
                        }

                    } catch (e) {
                        stats.errors.push({ serie, error: e.message });
                    }
                }

                try { fs.unlinkSync(req.file.path); } catch {}
                return res.json(stats);
            }
            // ─── Fin bloc Canon ────────────────────────────────────────────────────

            // ═══════════════════════════════════════════════════════════════════════
            // ── KOESIO : A3 et A4 fusionnés sur les codes A4 ──────────────────────
            //  • Col D (TYPE=3) peut valoir "A3 mono", "A4 mono", "A3 couleur"…
            //  • Les valeurs sont des COMPTEURS CUMULATIFS (total pages depuis début)
            //  • On regroupe par (numéro de série, isCouleur)
            //  • Pour chaque groupe : valeur_combinée_Qx = A4_cumul_Qx + A3_cumul_Qx
            //  • On insère uniquement sur les codes A4 (couleur ou mono)
            // ═══════════════════════════════════════════════════════════════════════
            if (mainteneur.toLowerCase() === 'koesio') {
                // 1ère passe : regrouper les lignes par (série, isCouleur)
                const groups = {};
                for (const row of rows) {
                    if (!Array.isArray(row)) continue;
                    const raw = row[COL.SERIE];
                    if (!raw) continue;
                    const serie = String(raw).trim();
                    if (!serie || serie.length < 3 || isPlaceholder(serie)) continue;
                    const typeStr  = String(row[COL.TYPE] || '').toLowerCase();
                    const isCouleur = typeStr.includes('coul') || typeStr.includes('color');
                    const isA3 = typeStr.includes('a3');
                    const key = `${serie}|${isCouleur}`;
                    if (!groups[key]) groups[key] = { serie, isCouleur, a4: null, a3: null };
                    if (isA3) groups[key].a3 = row;
                    else       groups[key].a4 = row;
                }

                // 2ème passe : traiter chaque groupe
                for (const group of Object.values(groups)) {
                    const { serie, isCouleur, a4: a4Row, a3: a3Row } = group;
                    stats.totalRows++;
                    try {
                        // Métadonnées depuis la ligne A4 (ou A3 si pas de A4)
                        const metaRow = a4Row || a3Row;
                        const dateAcq = normalizeDateString(metaRow[COL.DATE_ACQ]);
                        const prix    = toNum(metaRow[COL.PRIX]);
                        const options = metaRow[COL.OPTIONS] ? String(metaRow[COL.OPTIONS]).trim() : null;
                        const coutOpt = toNum(metaRow[COL.COUT_OPT]);

                        // Valeurs cumulatives par date : somme A4 + A3
                        const valByDate = {};
                        for (const row of [a4Row, a3Row]) {
                            if (!row) continue;
                            for (const q of computeQuarters(row)) {
                                valByDate[q.date] = (valByDate[q.date] || 0) + q.valeur;
                            }
                        }
                        const combinedQuarters = Object.entries(valByDate)
                            .map(([date, valeur]) => ({ date, valeur }))
                            .sort((a, b) => a.date.localeCompare(b.date));

                        if (combinedQuarters.length === 0) continue;

                        // Code compteur Koesio (couleur boolean)
                        const codeRes = await pool.query(
                            `SELECT id FROM hub_copieurs.compteur_codes WHERE LOWER(mainteneur)=LOWER($1) AND couleur=$2 ORDER BY id LIMIT 1`,
                            [mainteneur, isCouleur]
                        );
                        const codeId = codeRes.rows.length > 0 ? codeRes.rows[0].id : null;

                        // Chercher le copieur
                        const cRes = await pool.query(
                            `SELECT id FROM hub_copieurs.copieurs WHERE LOWER(TRIM(numero_serie)) = LOWER($1)`,
                            [serie]
                        );

                        if (cRes.rows.length === 0) {
                            stats.notFound.push({
                                serie, type: isCouleur ? 'couleur' : 'mono', codeId,
                                pendingReleves: codeId
                                    ? combinedQuarters.map(q => ({ code_id: codeId, date: q.date, valeur: q.valeur }))
                                    : [],
                                dateAcq, prix, options, coutOpt,
                            });
                            continue;
                        }

                        const copieurId = cRes.rows[0].id;

                        // Mise à jour des champs copieur
                        const sets = []; const vals = [];
                        const add = (col, val) => { if (val !== null && val !== undefined) { sets.push(`${col}=COALESCE(${col},$${vals.length + 1})`); vals.push(val); } };
                        add('date_acquisition', dateAcq);
                        add('prix_acquisition', prix);
                        if (options) add('options_achat', options);
                        add('cout_options', coutOpt);
                        if (sets.length > 0) {
                            vals.push(copieurId);
                            await pool.query(`UPDATE hub_copieurs.copieurs SET ${sets.join(', ')} WHERE id=$${vals.length}`, vals);
                            stats.copieursUpdated++;
                        }

                        if (!codeId) {
                            stats.noCode.push({ serie, mainteneur, type: isCouleur ? 'couleur' : 'mono' });
                            continue;
                        }

                        // Insérer les relevés combinés A4+A3 sur le code A4
                        for (const q of combinedQuarters) {
                            await pool.query(`
                                INSERT INTO hub_copieurs.copieur_releves (copieur_id, code_id, date_releve, valeur, mainteneur, created_by)
                                VALUES ($1,$2,$3,$4,$5,$6)
                                ON CONFLICT (copieur_id, code_id, date_releve) DO UPDATE SET valeur=$4, mainteneur=$5, created_by=$6
                            `, [copieurId, codeId, q.date, q.valeur, mainteneur, username]);
                            stats.relevesInserted++;
                        }
                    } catch (e) {
                        stats.errors.push({ serie, error: e.message });
                    }
                }

                try { fs.unlinkSync(req.file.path); } catch {}
                return res.json(stats);
            }
            // ─── Fin bloc Koesio ───────────────────────────────────────────────────

            for (const row of rows) {
                if (!Array.isArray(row)) continue;
                const raw = row[COL.SERIE];
                if (!raw) continue;
                const serie = String(raw).trim();
                if (!serie || serie.length < 3 || isPlaceholder(serie)) continue;

                stats.totalRows++;
                try {
                    // Déterminer le type (mono / couleur) via colonne D
                    const typeStr  = String(row[COL.TYPE] || '').toLowerCase();
                    const isCouleur = typeStr.includes('coul') || typeStr.includes('color');

                    // Données de mise à jour copieur (colonnes L, M, O, P)
                    const dateAcq = normalizeDateString(row[COL.DATE_ACQ]);
                    const prix    = toNum(row[COL.PRIX]);
                    const options = row[COL.OPTIONS] ? String(row[COL.OPTIONS]).trim() : null;
                    const coutOpt = toNum(row[COL.COUT_OPT]);

                    // Trouver le code compteur correspondant (mainteneur fourni + type)
                    const codeRes = await pool.query(
                        `SELECT id FROM hub_copieurs.compteur_codes WHERE LOWER(mainteneur)=LOWER($1) AND couleur=$2 ORDER BY id LIMIT 1`,
                        [mainteneur, isCouleur]
                    );
                    const codeId = codeRes.rows.length > 0 ? codeRes.rows[0].id : null;

                    // Calcul des trimestres (réutilisables pour found ou notFound)
                    const quarters = computeQuarters(row);
                    const pendingReleves = codeId
                        ? quarters.map(q => ({ code_id: codeId, date: q.date, valeur: q.valeur }))
                        : [];

                    // Chercher le copieur en base
                    const cRes = await pool.query(
                        `SELECT id FROM hub_copieurs.copieurs WHERE LOWER(TRIM(numero_serie)) = LOWER($1)`,
                        [serie]
                    );

                    if (cRes.rows.length === 0) {
                        // Copieur inconnu → stocker les données pour création éventuelle
                        stats.notFound.push({ serie, type: isCouleur ? 'couleur' : 'mono', codeId, pendingReleves, dateAcq, prix, options, coutOpt });
                        continue;
                    }

                    const copieurId = cRes.rows[0].id;

                    // Mise à jour des champs copieur (COALESCE : n'écrase pas une valeur existante)
                    const sets = []; const vals = [];
                    const add = (col, val) => { if (val !== null && val !== undefined) { sets.push(`${col}=COALESCE(${col},$${vals.length + 1})`); vals.push(val); } };
                    add('date_acquisition', dateAcq);
                    add('prix_acquisition', prix);
                    if (options) add('options_achat', options);
                    add('cout_options', coutOpt);
                    if (sets.length > 0) {
                        vals.push(copieurId);
                        await pool.query(`UPDATE hub_copieurs.copieurs SET ${sets.join(', ')} WHERE id=$${vals.length}`, vals);
                        stats.copieursUpdated++;
                    }

                    if (!codeId) {
                        stats.noCode.push({ serie, mainteneur, type: isCouleur ? 'couleur' : 'mono' });
                        continue;
                    }

                    // Insérer / mettre à jour les relevés trimestriels avec mainteneur
                    for (const q of quarters) {
                        await pool.query(`
                            INSERT INTO hub_copieurs.copieur_releves (copieur_id, code_id, date_releve, valeur, mainteneur, created_by)
                            VALUES ($1,$2,$3,$4,$5,$6)
                            ON CONFLICT (copieur_id, code_id, date_releve) DO UPDATE SET valeur=$4, mainteneur=$5, created_by=$6
                        `, [copieurId, codeId, q.date, q.valeur, mainteneur, username]);
                        stats.relevesInserted++;
                    }

                } catch (e) {
                    stats.errors.push({ serie, error: e.message });
                }
            }

            try { fs.unlinkSync(req.file.path); } catch {}
            res.json(stats);
        } catch (error) {
            try { fs.unlinkSync(req.file.path); } catch {}
            res.status(500).json({ message: 'Erreur import Excel compteurs', error: error.message });
        }
    },

    // ─── Création copieur depuis import (avec relevés en attente) ────────────

    createFromImport: async (req, res) => {
        try {
            const { pool } = require('../../shared/database');
            const { numero_serie, mainteneur, source, date_acquisition, prix_acquisition, options_achat, cout_options, pendingReleves } = req.body;
            if (!numero_serie) return res.status(400).json({ message: 'N° de série obligatoire' });
            const username = req.user?.username || '';

            // Vérifier si le copieur existe déjà
            const existing = await pool.query(
                `SELECT id FROM hub_copieurs.copieurs WHERE LOWER(TRIM(numero_serie))=LOWER($1)`,
                [String(numero_serie).trim()]
            );
            let copieurId;
            if (existing.rows.length > 0) {
                copieurId = existing.rows[0].id;
            } else {
                const ins = await pool.query(
                    `INSERT INTO hub_copieurs.copieurs
                        (numero_serie, mainteneur, source, date_acquisition, prix_acquisition, options_achat, cout_options, archive)
                     VALUES ($1,$2,$3,$4,$5,$6,$7,false) RETURNING id`,
                    [String(numero_serie).trim(), mainteneur || '', source || 'ville',
                     date_acquisition || null, prix_acquisition || null,
                     options_achat || null, cout_options || null]
                );
                copieurId = ins.rows[0].id;
            }

            // Insérer les relevés en attente
            let relevesInserted = 0;
            for (const r of (pendingReleves || [])) {
                if (!r.code_id || !r.date || r.valeur === undefined || r.valeur === null) continue;
                await pool.query(`
                    INSERT INTO hub_copieurs.copieur_releves (copieur_id, code_id, date_releve, valeur, mainteneur, created_by)
                    VALUES ($1,$2,$3,$4,$5,$6)
                    ON CONFLICT (copieur_id, code_id, date_releve) DO UPDATE SET valeur=$4, mainteneur=$5, created_by=$6
                `, [copieurId, r.code_id, r.date, r.valeur, mainteneur, username]);
                relevesInserted++;
            }

            res.status(201).json({ copieurId, relevesInserted });
        } catch (error) {
            res.status(500).json({ message: 'Erreur création copieur depuis import', error: error.message });
        }
    },

    // ─── Mainteneurs ─────────────────────────────────────────────────────────

    getMainteneurs: async (req, res) => {
        try {
            const { pool } = require('../../shared/database');
            const result = await pool.query(
                `SELECT DISTINCT mainteneur FROM hub_copieurs.copieurs
                 WHERE mainteneur IS NOT NULL AND mainteneur <> ''
                 UNION
                 SELECT DISTINCT mainteneur FROM hub_copieurs.compteur_codes
                 ORDER BY mainteneur`
            );
            res.json(result.rows.map(r => r.mainteneur));
        } catch (error) {
            res.status(500).json({ message: 'Erreur récupération mainteneurs', error: error.message });
        }
    },

    // ─── Codes compteur (par marque) ─────────────────────────────────────────

    getCompteurCodes: async (req, res) => {
        try {
            const { pool } = require('../../shared/database');
            const { mainteneur } = req.query;
            const params = mainteneur ? [mainteneur] : [];
            const where = mainteneur ? 'WHERE cc.mainteneur = $1' : '';
            const result = await pool.query(`
                SELECT cc.*,
                  (SELECT json_agg(t ORDER BY t.date_debut DESC)
                   FROM hub_copieurs.compteur_tarifs t WHERE t.code_id = cc.id) AS tarifs,
                  (SELECT t.tarif FROM hub_copieurs.compteur_tarifs t
                   WHERE t.code_id = cc.id
                     AND t.date_debut <= CURRENT_DATE
                     AND (t.date_fin IS NULL OR t.date_fin >= CURRENT_DATE)
                   ORDER BY t.date_debut DESC LIMIT 1) AS tarif_actuel,
                  (SELECT t.id FROM hub_copieurs.compteur_tarifs t
                   WHERE t.code_id = cc.id
                     AND t.date_debut <= CURRENT_DATE
                     AND (t.date_fin IS NULL OR t.date_fin >= CURRENT_DATE)
                   ORDER BY t.date_debut DESC LIMIT 1) AS tarif_actuel_id
                FROM hub_copieurs.compteur_codes cc
                ${where}
                ORDER BY cc.mainteneur, cc.code
            `, params);
            res.json(result.rows);
        } catch (error) {
            res.status(500).json({ message: 'Erreur récupération codes compteur', error: error.message });
        }
    },

    createCompteurCode: async (req, res) => {
        try {
            const { pool } = require('../../shared/database');
            const { mainteneur, code, libelle, format, couleur, description } = req.body;
            if (!mainteneur || !code) return res.status(400).json({ message: 'Mainteneur et code obligatoires' });
            const result = await pool.query(`
                INSERT INTO hub_copieurs.compteur_codes (mainteneur, code, libelle, format, couleur, description)
                VALUES ($1, $2, $3, $4, $5, $6) RETURNING *
            `, [mainteneur, code, libelle || '', format || '', couleur || false, description || '']);
            res.status(201).json(result.rows[0]);
        } catch (error) {
            if (error.code === '23505') return res.status(409).json({ message: `Le code "${req.body.code}" existe déjà pour ${req.body.mainteneur}` });
            res.status(500).json({ message: 'Erreur création code compteur', error: error.message });
        }
    },

    updateCompteurCode: async (req, res) => {
        try {
            const { pool } = require('../../shared/database');
            const { codeId } = req.params;
            const { mainteneur, code, libelle, format, couleur, description } = req.body;
            const result = await pool.query(`
                UPDATE hub_copieurs.compteur_codes
                SET mainteneur=$1, code=$2, libelle=$3, format=$4, couleur=$5, description=$6
                WHERE id=$7 RETURNING *
            `, [mainteneur, code, libelle || '', format || '', couleur || false, description || '', codeId]);
            if (result.rows.length === 0) return res.status(404).json({ message: 'Code non trouvé' });
            res.json(result.rows[0]);
        } catch (error) {
            if (error.code === '23505') return res.status(409).json({ message: `Ce code existe déjà pour cette marque` });
            res.status(500).json({ message: 'Erreur mise à jour code compteur', error: error.message });
        }
    },

    deleteCompteurCode: async (req, res) => {
        try {
            const { pool } = require('../../shared/database');
            const { codeId } = req.params;
            await pool.query('DELETE FROM hub_copieurs.compteur_codes WHERE id=$1', [codeId]);
            res.json({ message: 'Code supprimé' });
        } catch (error) {
            res.status(500).json({ message: 'Erreur suppression code compteur', error: error.message });
        }
    },

    // ─── Tarifs par code ─────────────────────────────────────────────────────

    createCodeTarif: async (req, res) => {
        try {
            const { pool } = require('../../shared/database');
            const { codeId } = req.params;
            const { tarif, date_debut, date_fin } = req.body;
            const username = req.user?.username || req.user?.name || '';
            if (!tarif || !date_debut) return res.status(400).json({ message: 'Tarif et date de début obligatoires' });
            // Auto-clôturer le tarif actif si pas de date_fin fournie
            if (!date_fin) {
                await pool.query(
                    `UPDATE hub_copieurs.compteur_tarifs SET date_fin = $1::date - INTERVAL '1 day' WHERE code_id=$2 AND date_fin IS NULL`,
                    [date_debut, codeId]
                );
            }
            const result = await pool.query(`
                INSERT INTO hub_copieurs.compteur_tarifs (code_id, tarif, date_debut, date_fin, created_by)
                VALUES ($1, $2, $3, $4, $5) RETURNING *
            `, [codeId, tarif, date_debut, date_fin || null, username]);
            res.status(201).json(result.rows[0]);
        } catch (error) {
            res.status(500).json({ message: 'Erreur création tarif', error: error.message });
        }
    },

    updateCodeTarif: async (req, res) => {
        try {
            const { pool } = require('../../shared/database');
            const { tarifId } = req.params;
            const { tarif, date_debut, date_fin } = req.body;
            const result = await pool.query(`
                UPDATE hub_copieurs.compteur_tarifs SET tarif=$1, date_debut=$2, date_fin=$3 WHERE id=$4 RETURNING *
            `, [tarif, date_debut, date_fin || null, tarifId]);
            if (result.rows.length === 0) return res.status(404).json({ message: 'Tarif non trouvé' });
            res.json(result.rows[0]);
        } catch (error) {
            res.status(500).json({ message: 'Erreur mise à jour tarif', error: error.message });
        }
    },

    deleteCodeTarif: async (req, res) => {
        try {
            const { pool } = require('../../shared/database');
            const { tarifId } = req.params;
            await pool.query('DELETE FROM hub_copieurs.compteur_tarifs WHERE id=$1', [tarifId]);
            res.json({ message: 'Tarif supprimé' });
        } catch (error) {
            res.status(500).json({ message: 'Erreur suppression tarif', error: error.message });
        }
    },

    // ─── KPI / Tableau de bord ───────────────────────────────────────────────

    getKPI: async (req, res) => {
        try {
            const { pool } = require('../../shared/database');

            const mainteneurFilter = req.query.mainteneur  || null;
            const copieurIdFilter  = req.query.copieur_id ? parseInt(req.query.copieur_id) : null;

            // 0a) Liste des mainteneurs disponibles
            const mainteneurRes = await pool.query(`
                SELECT DISTINCT mainteneur
                FROM hub_copieurs.copieurs
                WHERE archive = false AND mainteneur IS NOT NULL AND mainteneur <> ''
                ORDER BY mainteneur
            `);
            const mainteneurs = mainteneurRes.rows.map(r => r.mainteneur);

            // 0b) Liste des copieurs avec relevés (filtrée par mainteneur seulement)
            const copieursListRes = await pool.query(`
                SELECT DISTINCT r.copieur_id AS id,
                    c.numero_serie, c.direction, c.service, c.modele, c.mainteneur
                FROM hub_copieurs.copieur_releves r
                JOIN hub_copieurs.copieurs c ON c.id = r.copieur_id AND c.archive = false
                WHERE ($1::text IS NULL OR c.mainteneur = $1::text)
                ORDER BY c.direction, c.service, c.numero_serie
            `, [mainteneurFilter]);
            const copieursListe = copieursListRes.rows;

            // 1) Toutes les lignes de delta (valeur courante − précédente) avec tarif applicable
            const deltaRes = await pool.query(`
                WITH base AS (
                    SELECT
                        r.copieur_id,
                        r.code_id,
                        cc.code,
                        cc.libelle,
                        cc.format,
                        cc.couleur,
                        c.direction, c.service, c.numero_serie, c.modele, c.source,
                        c.mainteneur                                                       AS copieur_mainteneur,
                        r.date_releve,
                        r.valeur::bigint                                                   AS valeur,
                        EXTRACT(YEAR FROM r.date_releve)::integer                         AS year,
                        LAG(r.valeur::bigint) OVER (
                            PARTITION BY r.copieur_id, r.code_id ORDER BY r.date_releve
                        )                                                                  AS prev_valeur,
                        (
                            SELECT t.tarif::numeric
                            FROM hub_copieurs.compteur_tarifs t
                            WHERE t.code_id = r.code_id
                              AND t.date_debut <= r.date_releve
                              AND (t.date_fin IS NULL OR t.date_fin >= r.date_releve)
                            ORDER BY t.date_debut DESC LIMIT 1
                        )                                                                  AS tarif
                    FROM hub_copieurs.copieur_releves r
                    JOIN hub_copieurs.copieurs c   ON c.id  = r.copieur_id AND c.archive = false
                    JOIN hub_copieurs.compteur_codes cc ON cc.id = r.code_id
                    WHERE ($1::text IS NULL OR c.mainteneur = $1::text)
                      AND ($2::integer IS NULL OR r.copieur_id = $2::integer)
                )
                SELECT * FROM base
                WHERE prev_valeur IS NOT NULL AND valeur >= prev_valeur
                ORDER BY copieur_id, date_releve
            `, [mainteneurFilter, copieurIdFilter]);

            // 2) Tous les copieurs actifs avec date de dernier relevé (pour les alertes)
            const alertRes = await pool.query(`
                SELECT c.id, c.direction, c.service, c.numero_serie, c.modele, c.source,
                       (SELECT MAX(r.date_releve) FROM hub_copieurs.copieur_releves r
                        WHERE r.copieur_id = c.id) AS last_releve
                FROM hub_copieurs.copieurs c
                WHERE c.archive = false
                ORDER BY last_releve ASC NULLS FIRST
            `);

            // ── Agrégation JS ──────────────────────────────────────────────────
            const byYearMap  = {};
            const byCopierMap = {};
            const byDirMap   = {};
            const byCodeMap  = {};

            for (const row of deltaRes.rows) {
                const delta = Number(row.valeur) - Number(row.prev_valeur);
                if (delta <= 0) continue;
                const year  = Number(row.year);
                const tarif = row.tarif ? Number(row.tarif) : 0;
                const cost  = delta * tarif;
                const coul  = row.couleur;
                const copId = Number(row.copieur_id);
                const dir   = row.direction || '(sans direction)';

                // byYear
                if (!byYearMap[year]) byYearMap[year] = { year, deltaNB: 0, deltaCoul: 0, coutNB: 0, coutCoul: 0, copieurIds: new Set() };
                byYearMap[year].copieurIds.add(copId);
                if (coul) { byYearMap[year].deltaCoul += delta; byYearMap[year].coutCoul += cost; }
                else      { byYearMap[year].deltaNB   += delta; byYearMap[year].coutNB   += cost; }

                // byCopier
                if (!byCopierMap[copId]) byCopierMap[copId] = {
                    copieur_id: copId, direction: row.direction, service: row.service,
                    numero_serie: row.numero_serie, modele: row.modele, source: row.source,
                    byYear: {}, totalNB: 0, totalCoul: 0, coutTotal: 0, lastReleve: null
                };
                const cop = byCopierMap[copId];
                if (!cop.lastReleve || row.date_releve > cop.lastReleve) cop.lastReleve = row.date_releve;
                if (!cop.byYear[year]) cop.byYear[year] = { deltaNB: 0, deltaCoul: 0, coutTotal: 0 };
                if (coul) { cop.totalCoul += delta; cop.byYear[year].deltaCoul += delta; }
                else      { cop.totalNB   += delta; cop.byYear[year].deltaNB   += delta; }
                cop.coutTotal += cost;
                cop.byYear[year].coutTotal += cost;

                // byDirection
                if (!byDirMap[dir]) byDirMap[dir] = { direction: dir, deltaNB: 0, deltaCoul: 0, coutTotal: 0, copieurIds: new Set() };
                byDirMap[dir].copieurIds.add(copId);
                if (coul) byDirMap[dir].deltaCoul += delta;
                else      byDirMap[dir].deltaNB   += delta;
                byDirMap[dir].coutTotal += cost;

                // byCode
                const codeKey = String(row.code_id);
                if (!byCodeMap[codeKey]) byCodeMap[codeKey] = {
                    code_id: Number(row.code_id),
                    mainteneur: row.copieur_mainteneur || '',
                    code: row.code || '',
                    libelle: row.libelle || '',
                    format: row.format || '',
                    couleur: row.couleur,
                    deltaTotal: 0, coutTotal: 0, copieurIds: new Set(),
                };
                byCodeMap[codeKey].deltaTotal += delta;
                byCodeMap[codeKey].coutTotal  += cost;
                byCodeMap[codeKey].copieurIds.add(copId);
            }

            // ── Fraction d'année écoulée pour projections (année courante incomplète) ──
            const currentYear     = new Date().getFullYear();
            const currentYearRows = deltaRes.rows.filter(r => Number(r.year) === currentYear);
            let yearFraction = 1;
            let isProjected  = false;
            if (currentYearRows.length > 0) {
                const latestDate  = new Date(Math.max(...currentYearRows.map(r => new Date(r.date_releve).getTime())));
                const startOfYear = new Date(currentYear, 0, 1);
                const endOfYear   = new Date(currentYear, 11, 31);
                yearFraction = Math.max(0.01, (latestDate - startOfYear) / (endOfYear - startOfYear));
                isProjected  = true;
            }

            // Finalize byYear
            const years  = Object.keys(byYearMap).map(Number).sort();
            const byYear = Object.values(byYearMap).map(y => {
                const isCurr        = isProjected && y.year === currentYear;
                const deltaNB_proj  = isCurr ? Math.round(y.deltaNB  / yearFraction) : null;
                const deltaCoul_proj= isCurr ? Math.round(y.deltaCoul / yearFraction) : null;
                const coutNB_proj   = isCurr ? +(y.coutNB   / yearFraction).toFixed(2) : null;
                const coutCoul_proj = isCurr ? +(y.coutCoul / yearFraction).toFixed(2) : null;
                return {
                    year: y.year,
                    deltaNB: y.deltaNB, deltaCoul: y.deltaCoul,
                    deltaTotal: y.deltaNB + y.deltaCoul,
                    coutNB: +y.coutNB.toFixed(2), coutCoul: +y.coutCoul.toFixed(2),
                    coutTotal: +(y.coutNB + y.coutCoul).toFixed(2),
                    nbCopieurs: y.copieurIds.size,
                    ratio: y.deltaNB + y.deltaCoul > 0 ? Math.round(y.deltaNB / (y.deltaNB + y.deltaCoul) * 100) : null,
                    // ── Champs de projection (année courante uniquement) ──────────────────
                    isCurrentYear: isCurr,
                    deltaNB_ext:    isCurr ? Math.max(0, (deltaNB_proj  ?? 0) - y.deltaNB)  : null,
                    deltaCoul_ext:  isCurr ? Math.max(0, (deltaCoul_proj ?? 0) - y.deltaCoul) : null,
                    coutNB_proj, coutCoul_proj,
                    coutTotal_proj: isCurr && coutNB_proj !== null && coutCoul_proj !== null
                        ? +(coutNB_proj + coutCoul_proj).toFixed(2) : null,
                };
            }).sort((a, b) => a.year - b.year);

            // byDirection top 10
            const byDirection = Object.values(byDirMap).map(d => ({
                direction: d.direction,
                deltaNB: d.deltaNB, deltaCoul: d.deltaCoul,
                totalPages: d.deltaNB + d.deltaCoul,
                coutTotal: +d.coutTotal.toFixed(2), nbCopieurs: d.copieurIds.size
            })).sort((a, b) => b.totalPages - a.totalPages).slice(0, 10);

            const copieurList = Object.values(byCopierMap);
            const totalNB   = copieurList.reduce((s, c) => s + c.totalNB,   0);
            const totalCoul = copieurList.reduce((s, c) => s + c.totalCoul, 0);
            const totalPages = totalNB + totalCoul;
            const coutNB   = byYear.reduce((s, y) => s + y.coutNB,   0);
            const coutCoul = byYear.reduce((s, y) => s + y.coutCoul, 0);
            const coutTotal = +(coutNB + coutCoul).toFixed(2);

            const global = {
                totalNB, totalCoul, totalPages, coutNB: +coutNB.toFixed(2), coutCoul: +coutCoul.toFixed(2), coutTotal,
                nbCopieursActifs: copieurList.length,
                nbCopieursTotaux: alertRes.rows.length,
                ratio: totalPages > 0 ? Math.round(totalNB / totalPages * 100) : null,
                anneeMin: years[0] || null,
                anneeMax: years[years.length - 1] || null,
                coutMoyenNB:   totalNB   > 0 ? +(coutNB   / totalNB).toFixed(6)   : null,
                coutMoyenCoul: totalCoul > 0 ? +(coutCoul / totalCoul).toFixed(6) : null
            };

            // Top 10 volume
            const top10Volume = copieurList
                .map(c => ({ copieur_id: c.copieur_id, direction: c.direction, service: c.service, numero_serie: c.numero_serie, modele: c.modele, source: c.source, totalNB: c.totalNB, totalCoul: c.totalCoul, totalPages: c.totalNB + c.totalCoul, coutTotal: +c.coutTotal.toFixed(2) }))
                .sort((a, b) => b.totalPages - a.totalPages).slice(0, 10);

            // Top 10 croissance / décroissance (année N vs N-1)
            // yearFraction / isProjected / currentYear déjà calculés au-dessus pour byYear
            let top10Growing = [], top10Shrinking = [];
            const lastYear         = years[years.length - 1];
            const prevYear         = years.length >= 2 ? years[years.length - 2] : null;
            const growthIsProjected = isProjected && lastYear === currentYear;

            if (prevYear) {
                const withGrowth = copieurList
                    .filter(c => c.byYear[lastYear] && c.byYear[prevYear])
                    .map(c => {
                        const lastRaw = (c.byYear[lastYear]?.deltaNB || 0) + (c.byYear[lastYear]?.deltaCoul || 0);
                        const last    = growthIsProjected ? Math.round(lastRaw / yearFraction) : lastRaw;
                        const prev    = (c.byYear[prevYear]?.deltaNB || 0) + (c.byYear[prevYear]?.deltaCoul || 0);
                        return {
                            copieur_id: c.copieur_id, direction: c.direction, service: c.service,
                            numero_serie: c.numero_serie, modele: c.modele,
                            lastTotal: last, lastRaw, prevTotal: prev, deltaAbs: last - prev,
                            growth: prev > 0 ? +((last - prev) / prev * 100).toFixed(1) : null,
                            lastYear, prevYear, isProjected: growthIsProjected,
                        };
                    })
                    .filter(c => c.growth !== null && c.prevTotal >= 500);
                top10Growing   = [...withGrowth].sort((a, b) => (b.growth || 0) - (a.growth || 0)).slice(0, 10);
                top10Shrinking = [...withGrowth].sort((a, b) => (a.growth || 0) - (b.growth || 0)).slice(0, 10);
            }

            // Alertes : copieurs sans relevé récent (> 12 mois ou jamais)
            const twelveMonthsAgo = new Date();
            twelveMonthsAgo.setFullYear(twelveMonthsAgo.getFullYear() - 1);
            const alertsNoReleve = alertRes.rows
                .filter(c => !c.last_releve || new Date(c.last_releve) < twelveMonthsAgo)
                .slice(0, 30)
                .map(c => ({ id: c.id, direction: c.direction, service: c.service, numero_serie: c.numero_serie, modele: c.modele, source: c.source, last_releve: c.last_releve }));

            const byCode = Object.values(byCodeMap)
                .map(c => ({
                    code_id: c.code_id, mainteneur: c.mainteneur,
                    code: c.code, libelle: c.libelle, format: c.format, couleur: c.couleur,
                    deltaTotal: c.deltaTotal,
                    coutTotal: +c.coutTotal.toFixed(2),
                    nbCopieurs: c.copieurIds.size,
                    tarifMoyen: c.deltaTotal > 0 ? +(c.coutTotal / c.deltaTotal * 1000).toFixed(4) : null,
                }))
                .sort((a, b) => b.deltaTotal - a.deltaTotal);

            res.json({ global, byYear, byDirection, byCode, top10Volume, top10Growing, top10Shrinking, alertsNoReleve, mainteneurs, copieursListe });

        } catch (error) {
            res.status(500).json({ message: 'Erreur KPI copieurs', error: error.message });
        }
    },

    // ─── Relevés par copieur ─────────────────────────────────────────────────

    getCopieurReleves: async (req, res) => {
        try {
            const { pool } = require('../../shared/database');
            const { id } = req.params;
            const result = await pool.query(`
                SELECT r.*,
                  cc.code, cc.libelle, cc.format, cc.couleur,
                  r.mainteneur,
                  LAG(r.valeur) OVER (PARTITION BY r.code_id ORDER BY r.date_releve) AS valeur_precedente
                FROM hub_copieurs.copieur_releves r
                JOIN hub_copieurs.compteur_codes cc ON cc.id = r.code_id
                WHERE r.copieur_id = $1
                ORDER BY r.date_releve DESC, cc.code
            `, [id]);
            res.json(result.rows);
        } catch (error) {
            res.status(500).json({ message: 'Erreur récupération relevés', error: error.message });
        }
    },

    addCopieurReleve: async (req, res) => {
        try {
            const { pool } = require('../../shared/database');
            const { id } = req.params;
            const { date_releve, values, mainteneur: releveMainteneur } = req.body; // values: [{code_id, valeur}]
            const username = req.user?.username || req.user?.name || '';
            if (!date_releve || !Array.isArray(values) || values.length === 0)
                return res.status(400).json({ message: 'date_releve et values[] obligatoires' });
            const inserted = [];
            for (const v of values) {
                if (v.valeur === undefined || v.valeur === null || !v.code_id) continue;
                const r = await pool.query(`
                    INSERT INTO hub_copieurs.copieur_releves (copieur_id, code_id, date_releve, valeur, mainteneur, created_by)
                    VALUES ($1, $2, $3, $4, $5, $6)
                    ON CONFLICT (copieur_id, code_id, date_releve) DO UPDATE SET valeur=$4, mainteneur=$5, created_by=$6
                    RETURNING *
                `, [id, v.code_id, date_releve, v.valeur, releveMainteneur || null, username]);
                inserted.push(r.rows[0]);
            }
            res.status(201).json(inserted);
        } catch (error) {
            res.status(500).json({ message: 'Erreur ajout relevé', error: error.message });
        }
    },

    deleteCopieurReleve: async (req, res) => {
        try {
            const { pool } = require('../../shared/database');
            const { releveId } = req.params;
            await pool.query('DELETE FROM hub_copieurs.copieur_releves WHERE id=$1', [releveId]);
            res.json({ message: 'Relevé supprimé' });
        } catch (error) {
            res.status(500).json({ message: 'Erreur suppression relevé', error: error.message });
        }
    },
};
