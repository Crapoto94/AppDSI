const { getSqlite } = require('../../shared/database');
const { logMouchard } = require('../../shared/utils');
const pdf = require('pdf-parse');
const fs = require('fs');
const path = require('path');
const xlsx = require('xlsx');

// Helper for date normalization from the source
const normalizeDateString = (dateString) => {
    if (!dateString) return null;
    const d = new Date(dateString);
    if (!isNaN(d.getTime())) {
        return d.toISOString().split('T')[0];
    }
    const frMatch = dateString.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (frMatch) {
        const year = frMatch[3];
        const month = frMatch[2].padStart(2, '0');
        const day = frMatch[1].padStart(2, '0');
        return `${year}-${month}-${day}`;
    }
    return null;
};

const upsertCertificate = async (data) => {
    const db = getSqlite();
    if (!data.order_number || data.order_number.trim() === '' || data.order_number === 'Inconnu') {
        data.order_number = 'FO';
    }

    const existing = await db.get('SELECT id, file_path, is_provisional, sedit_number, expiry_date, observations FROM certificates WHERE order_number = ?', [data.order_number]);

    let result;
    if (existing && data.order_number !== 'Inconnu') {
        const finalSedit = existing.sedit_number && existing.sedit_number.trim().length > 0 ? existing.sedit_number : data.sedit_number;
        const finalExpiry = (existing.is_provisional === 0 && existing.expiry_date) ? existing.expiry_date : data.expiry_date;
        const finalProvisional = (existing.is_provisional === 0 && existing.expiry_date) ? 0 : data.is_provisional;
        const finalObservations = existing.observations && existing.observations.trim().length > 0 ? existing.observations : data.observations;

        await db.run(
            `UPDATE certificates SET
                request_date = ?, beneficiary_name = ?, beneficiary_email = ?,
                product_code = ?, product_label = ?, file_path = ?,
                expiry_date = ?, sedit_number = ?, is_provisional = ?, observations = ?
             WHERE id = ?`,
            [data.request_date, data.beneficiary_name, data.beneficiary_email,
             data.product_code, data.product_label, data.file_path,
             finalExpiry, finalSedit, finalProvisional, finalObservations, existing.id]
        );

        if (existing.file_path && existing.file_path !== data.file_path) {
            try {
                const oldPath = path.join(__dirname, '../../../', existing.file_path);
                if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
            } catch (e) {}
        }
        result = { lastID: existing.id };
    } else {
        result = await db.run(
            `INSERT INTO certificates (order_number, request_date, beneficiary_name, beneficiary_email, product_code, product_label, file_path, expiry_date, sedit_number, is_provisional, observations)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [data.order_number, data.request_date, data.beneficiary_name, data.beneficiary_email,
             data.product_code, data.product_label, data.file_path, data.expiry_date, data.sedit_number, data.is_provisional, data.observations || '']
        );
    }
    return await db.get('SELECT * FROM certificates WHERE id = ?', [result.lastID]);
};

const parseCertificateFile = async (file) => {
    const filePath = file.path;
    const fileName = file.originalname;

    if (!fileName.toLowerCase().endsWith('.pdf')) {
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
        throw new Error('Seuls les fichiers PDF sont acceptés pour les certificats.');
    }

    const dataBuffer = fs.readFileSync(filePath);
    const pdfData = await pdf(dataBuffer);
    const content = pdfData.text || '';

    const orderMatch = content.match(/BD\d+-\d+/);
    const dateMatch = content.match(/\d{2}\/\d{2}\/\d{4}/);
    let emailMatch = content.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
    if (emailMatch) {
        emailMatch[0] = emailMatch[0].replace(/^[A-Z]{2,}(?=[a-z])/, '');
    }
    const productCodeMatch = content.match(/(OE2|OP2)-[A-Z]+-[A-Z]+-\d+A/);

    const formatDateToISO = (dateStr) => {
        if (!dateStr) return null;
        const parts = dateStr.split('/');
        if (parts.length === 3) {
            return `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
        }
        return dateStr;
    };

    const addYears = (dateStr, years) => {
        if (!dateStr) return null;
        const date = new Date(dateStr);
        if (isNaN(date.getTime())) return null;
        date.setFullYear(date.getFullYear() + years);
        return date.toISOString().split('T')[0];
    };

    const addDays = (dateStr, days) => {
        if (!dateStr) return null;
        const date = new Date(dateStr);
        if (isNaN(date.getTime())) return null;
        date.setDate(date.getDate() + days);
        return date.toISOString().split('T')[0];
    };

    const data = {
        order_number: orderMatch ? orderMatch[0] : 'Inconnu',
        request_date: dateMatch ? formatDateToISO(dateMatch[0]) : new Date().toISOString().split('T')[0],
        beneficiary_name: 'Inconnu',
        beneficiary_email: emailMatch ? emailMatch[0] : 'Inconnu',
        product_code: productCodeMatch ? productCodeMatch[0] : 'Inconnu',
        product_label: 'Certificat Standard',
        file_path: `file_certif/${file.filename}`,
        sedit_number: '',
        is_provisional: 1,
        observations: ''
    };

    const libelleMatch = content.match(/LIBELLE\s*:\s*([^ \n]+.*)/i);
    if (libelleMatch) {
        data.product_label = libelleMatch[1].trim();
    } else {
        let type = 'Standard';
        if (data.product_code.startsWith('OP2') || data.product_code.includes('AUTH') || content.toUpperCase().includes('AGENT')) {
            type = 'Agents - G2';
        } else if (data.product_code.startsWith('OE2') || data.product_code.includes('DMT') || content.includes('Dématérialisation')) {
            type = 'Dématérialisation - G2';
        } else if (data.product_code.includes('SRV') || content.toUpperCase().includes('SERVEUR')) {
            type = 'Serveur - SSL';
        }

        let duration = '2 ans';
        if (data.product_code.endsWith('3A') || content.includes('3 ans')) {
            duration = '3 ans';
        } else if (data.product_code.endsWith('2A') || content.includes('2 ans')) {
            duration = '2 ans';
        }

        data.product_label = type !== 'Standard' ? `${type} - ${duration}` : 'Certificat Standard';
    }

    const durationMatch = data.product_label.match(/(\d+)\s*ans?/i);
    if (durationMatch) {
        data.expiry_date = addYears(data.request_date, parseInt(durationMatch[1]));
    } else {
        data.expiry_date = addDays(data.request_date, 15);
    }

    const prefNomMatch = content.match(/PRENOM \/ NOM\s*:\s*([^ \n]+.*)/i);
    if (prefNomMatch) {
        data.beneficiary_name = prefNomMatch[1].trim();
    } else {
        const lines = content.split('\n').map(l => l.trim()).filter(l => l.length > 0);
        if (productCodeMatch && emailMatch) {
            for (const line of lines) {
                if (line.includes(productCodeMatch[0]) && line.includes(emailMatch[0])) {
                    let namePart = line.replace(productCodeMatch[0], '').replace(emailMatch[0], '').trim();
                    if (namePart.length > 2) { data.beneficiary_name = namePart; break; }
                }
            }
        }
    }

    return data;
};

module.exports = {
    getCertificates: async (req, res) => {
        try {
            const db = getSqlite();
            const certs = await db.all('SELECT * FROM certificates ORDER BY request_date DESC, uploaded_at DESC');
            res.json(certs);
        } catch (error) {
            res.status(500).json({ message: 'Error fetching certificates', error: error.message });
        }
    },

    createCertificate: async (req, res) => {
        try {
            const db = getSqlite();
            const {
                order_number = '',
                request_date = new Date().toISOString().split('T')[0],
                beneficiary_name = '',
                beneficiary_email = '',
                product_code = '',
                product_label = '',
                expiry_date = null,
                sedit_number = '',
                is_provisional = 1,
                observations = ''
            } = req.body;

            const finalProvisional = expiry_date ? 0 : (is_provisional ?? 1);

            const result = await db.run(
                `INSERT INTO certificates (order_number, request_date, beneficiary_name, beneficiary_email, product_code, product_label, file_path, expiry_date, sedit_number, is_provisional, observations)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [order_number, request_date, beneficiary_name, beneficiary_email, product_code, product_label, '', expiry_date, sedit_number, finalProvisional, observations]
            );

            const newCertificate = await db.get('SELECT * FROM certificates WHERE id = ?', [result.lastID]);
            res.status(201).json(newCertificate);
        } catch (error) {
            res.status(500).json({ message: 'Erreur lors de l’ajout du certificat', error: error.message });
        }
    },

    deleteCertificate: async (req, res) => {
        try {
            const db = getSqlite();
            const cert = await db.get('SELECT * FROM certificates WHERE id = ?', [req.params.id]);
            if (!cert) return res.status(404).json({ message: 'Certificat non trouvé' });

            if (cert.file_path) {
                const fullPath = path.join(__dirname, '../../../', cert.file_path);
                if (fs.existsSync(fullPath)) fs.unlinkSync(fullPath);
            }

            await db.run('DELETE FROM certificates WHERE id = ?', [req.params.id]);
            logMouchard(`Certificat supprimé: ID ${req.params.id} (${cert.order_number})`);
            res.json({ message: 'Certificat supprimé avec succès' });
        } catch (error) {
            res.status(500).json({ message: 'Erreur lors de la suppression', error: error.message });
        }
    },

    attachFile: async (req, res) => {
        if (!req.file) return res.status(400).json({ message: 'Aucun fichier fourni' });
        try {
            const db = getSqlite();
            const cert = await db.get('SELECT * FROM certificates WHERE id = ?', [req.params.id]);
            if (!cert) return res.status(404).json({ message: 'Certificat non trouvé' });

            if (cert.file_path) {
                const oldPath = path.join(__dirname, '../../../', cert.file_path);
                if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
            }

            const newFilePath = `file_certif/${req.file.filename}`;
            await db.run('UPDATE certificates SET file_path = ? WHERE id = ?', [newFilePath, req.params.id]);
            const updated = await db.get('SELECT * FROM certificates WHERE id = ?', [req.params.id]);
            res.json(updated);
        } catch (error) {
            res.status(500).json({ message: 'Erreur lors de l\'attachement du fichier', error: error.message });
        }
    },

    updateRenewal: async (req, res) => {
        const { renewal_status, renewal_comment } = req.body;
        try {
            const db = getSqlite();
            await db.run(
                'UPDATE certificates SET renewal_status = ?, renewal_comment = ? WHERE id = ?',
                [renewal_status, renewal_comment || '', req.params.id]
            );
            const updated = await db.get('SELECT * FROM certificates WHERE id = ?', [req.params.id]);
            res.json({ message: 'Statut renouvellement mis à jour', certificate: updated });
        } catch (error) {
            res.status(500).json({ message: 'Erreur lors de la mise à jour', error: error.message });
        }
    },

    updateExpiry: async (req, res) => {
        const { expiry_date } = req.body;
        try {
            const db = getSqlite();
            await db.run('UPDATE certificates SET expiry_date = ?, is_provisional = 0 WHERE id = ?', [expiry_date, req.params.id]);
            res.json({ message: 'Date de validité mise à jour' });
        } catch (error) {
            res.status(500).json({ message: 'Erreur lors de la mise à jour', error: error.message });
        }
    },

    updateCertificate: async (req, res) => {
        try {
            const db = getSqlite();
            const allowedFields = ['order_number', 'request_date', 'beneficiary_name', 'beneficiary_email', 'product_code', 'product_label', 'expiry_date', 'sedit_number', 'is_provisional', 'observations', 'renewal_status', 'renewal_comment'];
            const updates = [];
            const values = [];

            allowedFields.forEach((field) => {
                if (req.body[field] !== undefined) {
                    updates.push(`${field} = ?`);
                    values.push(req.body[field]);
                }
            });

            if (updates.length === 0) return res.status(400).json({ message: 'Aucun champ modifiable fourni' });

            if (req.body.expiry_date !== undefined && req.body.expiry_date !== null && !('is_provisional' in req.body)) {
                updates.push('is_provisional = ?');
                values.push(0);
            }

            values.push(req.params.id);
            const query = `UPDATE certificates SET ${updates.join(', ')} WHERE id = ?`;
            await db.run(query, values);

            const updated = await db.get('SELECT * FROM certificates WHERE id = ?', [req.params.id]);
            res.json({ message: 'Certificat mis à jour', certificate: updated });
        } catch (error) {
            res.status(500).json({ message: 'Erreur mise à jour certificat', error: error.message });
        }
    },

    uploadPDF: async (req, res) => {
        if (!req.file) return res.status(400).send('No file uploaded.');
        try {
            const data = await parseCertificateFile(req.file);
            const saved = await upsertCertificate(data);
            res.json(saved);
        } catch (error) {
            logMouchard(`ERREUR upload PDF: ${error.message}`);
            res.status(500).json({ message: 'Error processing certificate PDF', error: error.message });
        }
    },

    uploadMultiple: async (req, res) => {
        const files = req.files;
        if (!files || !Array.isArray(files) || files.length === 0) return res.status(400).json({ message: 'Pas de fichiers fournis.' });

        const results = [];
        for (const file of files) {
            try {
                const data = await parseCertificateFile(file);
                const saved = await upsertCertificate(data);
                results.push({ file: file.originalname, status: 'ok', certificate: saved });
            } catch (error) {
                results.push({ file: file.originalname, status: 'error', message: error.message });
            }
        }
        res.json({ results });
    },

    uploadExcel: async (req, res) => {
        if (!req.file) return res.status(400).json({ message: 'Aucun fichier XLSX fourni.' });

        try {
            const workbook = xlsx.readFile(req.file.path);
            const sheet = workbook.Sheets[workbook.SheetNames[0]];
            const rows = xlsx.utils.sheet_to_json(sheet, { defval: '' });

            const results = [];
            for (const [index, row] of rows.entries()) {
                const orderNumber = (row.order_number || row['N° Commande'] || row.Commande || row['Order Number'] || '').toString().trim();
                if (!orderNumber) {
                    results.push({ row: index + 2, status: 'skipped', message: 'N° commande manquant' });
                    continue;
                }

                const now = new Date();
                const requestDate = normalizeDateString((row.request_date || row['Date Demande'] || row['Request Date'] || now.toISOString().split('T')[0]).toString()) || now.toISOString().split('T')[0];
                const expiryDate = normalizeDateString((row.expiry_date || row['Fin Validité'] || row['Expiry Date'] || '').toString());

                const data = {
                    order_number: orderNumber,
                    request_date: requestDate,
                    beneficiary_name: (row.beneficiary_name || row['Bénéficiaire'] || row['Beneficiary'] || '').toString().trim() || 'Inconnu',
                    beneficiary_email: (row.beneficiary_email || row['Email'] || row['Beneficiary Email'] || '').toString().trim() || 'Inconnu',
                    product_code: (row.product_code || row['Code produit'] || row['Product Code'] || '').toString().trim() || 'Inconnu',
                    product_label: (row.product_label || row['Libellé produit'] || row['Product Label'] || '').toString().trim() || 'Certificat Standard',
                    expiry_date: expiryDate,
                    sedit_number: (row.sedit_number || row['N° Sedit'] || row['Sedit Number'] || '').toString().trim(),
                    is_provisional: expiryDate ? 0 : 1,
                    file_path: '',
                    observations: (row.observations || row['Observations'] || '').toString().trim()
                };

                try {
                    const saved = await upsertCertificate(data);
                    results.push({ row: index + 2, status: 'ok', certificate: saved });
                } catch (error) {
                    results.push({ row: index + 2, status: 'error', message: error.message });
                }
            }

            try {
                if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
            } catch (e) {}

            res.json({ results });
        } catch (error) {
            res.status(500).json({ message: 'Erreur lors du traitement du fichier Excel', error: error.message });
        }
    }
};
