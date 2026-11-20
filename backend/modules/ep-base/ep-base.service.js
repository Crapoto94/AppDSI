/**
 * Base des agents à évaluer (EP Ville) — alimentée par le classeur « Outil CREP DSI.xlsm » (déposé par un administrateur).
 *
 *  - onglet `Base_agents` : un agent par ligne ; seuls ceux dont « à conserver » = O sont à évaluer ;
 *  - onglets `Template_*` : un modèle de compte rendu par onglet (nom du modèle = nom de l'onglet ; le champ « Modèle »
 *    de l'agent désigne l'onglet à utiliser). Les critères du formulaire sont lus dans les zones de texte de l'onglet ;
 *  - valideur proposé : code de l'unité = code situé après le dernier « \ » du « Chemin publication » (ex. BF62) ; le valideur est
 *    l'agent dont le « Poste affectation code » est ce code et dont les 5 premiers caractères du « Poste fonction » sont
 *    Direc / DGA_1 / DGS_1 / DGST_ / Respo. Plusieurs candidats possibles : l'administrateur choisit.
 *  - adresse e-mail : recherche AD par matricule puis par nom + prénom (ordre et petites erreurs tolérés).
 *
 * Les tables sont créées à la demande (CREATE TABLE IF NOT EXISTS) : aucune migration à jouer.
 */
const XLSX = require('xlsx');
const JSZip = require('jszip');
const { pgDb } = require('../../shared/database');
const adHelper = require('../../shared/ad_helper');
const def = require('../entretiens/crep.definition');

const text = (v) => (v === null || v === undefined ? '' : String(v)).trim();
const fold = (s) => text(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const tokens = (s) => fold(s).split(' ').filter(Boolean);
const tokenKey = (s) => tokens(s).sort().join(' ');

const VALIDEUR_PREFIXES = ['direc', 'dga_1', 'dgs_1', 'dgst_', 'respo'];

// ─── Schéma ─────────────────────────────────────────────────────────────────

let schemaReady = null;
function ensureSchema() {
    if (!schemaReady) {
        schemaReady = (async () => {
            await pgDb.run(`CREATE TABLE IF NOT EXISTS hub_entretiens.crep_templates (
                name TEXT PRIMARY KEY,
                definition JSONB NOT NULL,
                updated_at TIMESTAMPTZ DEFAULT NOW()
            )`);
            await pgDb.run(`CREATE TABLE IF NOT EXISTS hub_entretiens.base_agents (
                matricule TEXT PRIMARY KEY,
                nom_prenom TEXT NOT NULL DEFAULT '',
                modele TEXT DEFAULT '',
                a_conserver BOOLEAN NOT NULL DEFAULT FALSE,
                direction TEXT DEFAULT '',
                service TEXT DEFAULT '',
                poste TEXT DEFAULT '',
                grade TEXT DEFAULT '',
                chemin TEXT DEFAULT '',
                unit_code TEXT DEFAULT '',
                poste_fonction TEXT DEFAULT '',
                poste_affectation_code TEXT DEFAULT '',
                est_valideur BOOLEAN NOT NULL DEFAULT FALSE,
                valideur_candidats JSONB NOT NULL DEFAULT '[]'::jsonb,
                valideur_matricule TEXT DEFAULT '',
                valideur_source TEXT DEFAULT '',
                email TEXT DEFAULT '',
                ad_username TEXT DEFAULT '',
                ad_status TEXT DEFAULT 'non_verifie',
                ad_checked_at TIMESTAMPTZ,
                imported_at TIMESTAMPTZ DEFAULT NOW()
            )`);
            // pgDb.run ajoute « RETURNING id » à tout INSERT : ces tables doivent donc porter une colonne id.
            await pgDb.run('ALTER TABLE hub_entretiens.crep_templates ADD COLUMN IF NOT EXISTS id SERIAL');
            await pgDb.run('ALTER TABLE hub_entretiens.base_agents ADD COLUMN IF NOT EXISTS id SERIAL');
            await pgDb.run('ALTER TABLE hub_entretiens.base_agents ADD COLUMN IF NOT EXISTS email_deduit BOOLEAN NOT NULL DEFAULT FALSE');
            await pgDb.run("ALTER TABLE hub_entretiens.base_agents ADD COLUMN IF NOT EXISTS nom TEXT DEFAULT ''");
            await pgDb.run("ALTER TABLE hub_entretiens.base_agents ADD COLUMN IF NOT EXISTS prenom TEXT DEFAULT ''");
            await pgDb.run('CREATE INDEX IF NOT EXISTS idx_ep_base_agents_unit ON hub_entretiens.base_agents(poste_affectation_code)');
            await pgDb.run(`CREATE TABLE IF NOT EXISTS hub_entretiens.base_imports (
                id SERIAL PRIMARY KEY,
                filename TEXT, uploaded_by TEXT, nb_agents INTEGER, nb_a_evaluer INTEGER, nb_modeles INTEGER,
                uploaded_at TIMESTAMPTZ DEFAULT NOW()
            )`);
        })().catch((e) => { schemaReady = null; throw e; });
    }
    return schemaReady;
}

// ─── Modèles de compte rendu (onglets Template_*) ───────────────────────────

const LEVELS_DEFAULT = def.LEVELS;

/** Clé conservée pour les critères déjà connus (les comptes rendus déjà saisis restent lisibles). */
function knownKeys() {
    const m = new Map();
    for (const g of def.CRITERIA_GROUPS) for (const it of g.items) m.set(fold(it.label), it.key);
    return m;
}
const slug = (s) => fold(s).replace(/ /g, '_').slice(0, 40) || 'critere';

const GROUP_HEADERS = [
    { key: 'competences', re: /comp[eé]tences professionnelles/i },
    { key: 'relationnelles', re: /qualit[eé]s relationnelles/i },
    { key: 'encadrement', re: /capacit[eé] d.?\s*encadrement/i },
];

/** Dessins (zones de texte) d'un onglet : [{ row, col, text }] (row 1-based). */
async function sheetTextBoxes(zip, sheetPath) {
    const relPath = 'xl/' + sheetPath.replace('worksheets/', 'worksheets/_rels/') + '.rels';
    const relFile = zip.file(relPath);
    if (!relFile) return [];
    const rels = await relFile.async('string');
    const target = (rels.match(/Target="\.\.\/drawings\/(drawing\d+\.xml)"/) || [])[1];
    if (!target) return [];
    const xml = await zip.file('xl/drawings/' + target).async('string');
    const out = [];
    const re = /<xdr:(?:twoCellAnchor|oneCellAnchor)[^>]*>([\s\S]*?)<\/xdr:(?:twoCellAnchor|oneCellAnchor)>/g;
    let m;
    const unesc = (s) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
    while ((m = re.exec(xml))) {
        const a = m[1];
        const from = a.match(/<xdr:from>[\s\S]*?<xdr:col>(\d+)<\/xdr:col>[\s\S]*?<xdr:row>(\d+)<\/xdr:row>/);
        if (!from) continue;
        const t = unesc((a.match(/<a:t>[\s\S]*?<\/a:t>/g) || []).map(x => x.replace(/<\/?a:t>/g, '')).join('')).replace(/\s+/g, ' ').trim();
        if (t) out.push({ col: Number(from[1]), row: Number(from[2]) + 1, text: t });
    }
    return out.sort((x, y) => x.row - y.row || x.col - y.col);
}

/** Définition du formulaire d'un onglet : critères de la grille d'appréciation, regroupés comme dans l'onglet. */
function buildDefinition(name, boxes, colA) {
    const known = knownKeys();
    const startBox = boxes.find(b => b.col === 0 && /^sens du service public/i.test(b.text));
    const endBox = boxes.find(b => b.col === 0 && /objectifs individuels de travail de l.ann[eé]e [aà] venir/i.test(b.text));
    const crit = boxes.filter(b => b.col === 0 && startBox && b.row >= startBox.row && (!endBox || b.row < endBox.row));
    const headers = [];
    for (const [row, v] of colA) { const g = GROUP_HEADERS.find(h => h.re.test(v)); if (g) headers.push({ row, key: g.key, title: v.trim() }); }
    headers.sort((a, b) => a.row - b.row);
    const groups = [];
    const used = new Set();
    const push = (gkey, title, label) => {
        let g = groups.find(x => x.key === gkey);
        if (!g) { g = { key: gkey, title, items: [] }; groups.push(g); }
        let key = known.get(fold(label)) || slug(label);
        while (used.has(key)) key += '_';
        used.add(key);
        g.items.push({ key, label, ...(gkey === 'service_public' ? { lead: 'Sens du service public' } : {}) });
    };
    for (const b of crit) {
        if (b === startBox) { push('service_public', null, b.text); continue; }
        let h = null; for (const x of headers) if (x.row <= b.row) h = x;
        if (h) push(h.key, h.title, b.text); else push('competences', 'Compétences professionnelles et techniques', b.text);
    }
    const hasObjService = [...colA.values()].some(v => /rappel des objectifs du service/i.test(v));
    const categorie = /\bC\b/.test(name.replace(/^Template_cat\s*/i, '').split(' ')[0] || '') ? 'C' : 'A&B';
    return { name, categorie, criteria_groups: groups, levels: LEVELS_DEFAULT, flags: { objectifs_service: hasObjService } };
}

/** Lit les onglets de modèles du classeur. Retourne { name: definition }. */
async function parseTemplates(buffer) {
    const zip = await JSZip.loadAsync(buffer);
    const wbXml = await zip.file('xl/workbook.xml').async('string');
    const relXml = await zip.file('xl/_rels/workbook.xml.rels').async('string');
    const sheets = [...wbXml.matchAll(/<sheet [^>]*name="([^"]+)"[^>]*r:id="([^"]+)"/g)].map(m => ({
        name: m[1].replace(/&amp;/g, '&'), rid: m[2],
    }));
    const relMap = {};
    for (const m of relXml.matchAll(/<Relationship [^>]*>/g)) {
        const id = (m[0].match(/Id="([^"]+)"/) || [])[1]; const tg = (m[0].match(/Target="([^"]+)"/) || [])[1];
        if (id && tg) relMap[id] = tg.replace(/^\/?(xl\/)?/, '');
    }
    const tplSheets = sheets.filter(s => /^template/i.test(s.name));
    if (!tplSheets.length) return {};
    // Colonne A (libellés de groupes, rappel des objectifs du service) : lecture limitée aux 260 premières lignes.
    const wb = XLSX.read(buffer, { type: 'buffer', sheets: tplSheets.map(s => s.name), sheetRows: 260, bookVBA: false });
    const out = {};
    for (const s of tplSheets) {
        const path = relMap[s.rid]; if (!path) continue;
        const boxes = await sheetTextBoxes(zip, path);
        const colA = new Map();
        const ws = wb.Sheets[s.name];
        if (ws) for (let r = 1; r <= 260; r++) { const c = ws['A' + r]; if (c && text(c.v)) colA.set(r, text(c.v)); }
        const d = buildDefinition(s.name, boxes, colA);
        if (d.criteria_groups.length) out[s.name] = d;
    }
    return out;
}

// ─── Agents (onglet Base_agents) ────────────────────────────────────────────

const HEAD = {
    matricule: /^matricule$/, modele: /^mod[eè]le$/, nom: /^nom prenom$/, conserver: /conserver/,
    direction: /^dir agent$/, service: /^libell[eé] service$/, poste: /^libell[eé] poste$/, chemin: /^chemin publication$/,
    fonction: /^poste fonction$/, affectation: /^poste affectation code$/, grade: /^libell[eé] grade/,
};

function parseAgents(buffer) {
    const wb = XLSX.read(buffer, { type: 'buffer', sheets: ['Base_agents'], bookVBA: false });
    const ws = wb.Sheets['Base_agents'];
    if (!ws) throw Object.assign(new Error('Onglet « Base_agents » introuvable dans le classeur.'), { status: 400 });
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: '' });
    const head = (rows[0] || []).map(h => fold(h));
    const idx = {};
    for (const [k, re] of Object.entries(HEAD)) {
        const i = head.findIndex(h => re.test(h) || (k === 'conserver' && /conserver/.test(h)));
        idx[k] = i;
    }
    // Colonnes du classeur : « Libellé Grade/E… » varie selon la version ; « Libellé service » peut apparaître deux fois.
    if (idx.matricule < 0 || idx.chemin < 0 || idx.conserver < 0) {
        throw Object.assign(new Error('Colonnes attendues introuvables dans « Base_agents » (Matricule, à conserver, Chemin publication…).'), { status: 400 });
    }
    // Le champ « Nom/Prenom » du classeur est « NOM PRENOM » sans séparateur fiable : nom et prénom sont lus dans l'onglet d'extraction RH.
    const identites = new Map();
    try {
        const names = XLSX.read(buffer, { type: 'buffer', bookSheets: true }).SheetNames.filter(n => /^IVRBK_POSTES_AGENTS/i.test(n));
        if (names.length) {
            const w2 = XLSX.read(buffer, { type: 'buffer', sheets: [names[0]], bookVBA: false });
            const rr = XLSX.utils.sheet_to_json(w2.Sheets[names[0]], { header: 1, raw: true, defval: '' });
            const h2 = (rr[0] || []).map(h => text(h).toUpperCase());
            const iM = h2.indexOf('MATRICULE'), iN = h2.indexOf('NOM'), iP = h2.indexOf('PRENOM');
            if (iM >= 0 && iN >= 0) for (const r of rr.slice(1)) {
                const m = text(r[iM]); if (!m) continue;
                identites.set(/^\d+$/.test(m) ? m.padStart(7, '0') : m, { nom: text(r[iN]), prenom: iP >= 0 ? text(r[iP]) : '' });
            }
        }
    } catch { /* identités indisponibles : le nom complet sert de nom */ }
    const agents = [];
    for (const r of rows.slice(1)) {
        const matricule = text(r[idx.matricule]);
        if (!matricule) continue;
        const chemin = text(r[idx.chemin]);
        const ident = identites.get(/^\d+$/.test(matricule) ? matricule.padStart(7, '0') : matricule) || { nom: '', prenom: '' };
        agents.push({
            matricule,
            nom: ident.nom, prenom: ident.prenom,
            nom_prenom: text(r[idx.nom]),
            modele: text(r[idx.modele]),
            a_conserver: text(r[idx.conserver]).toUpperCase().startsWith('O'),
            direction: text(r[idx.direction]),
            service: text(r[idx.service]),
            poste: text(r[idx.poste]),
            grade: idx.grade >= 0 ? text(r[idx.grade]) : '',
            chemin,
            unit_code: unitCode(chemin),
            poste_fonction: text(r[idx.fonction]),
            poste_affectation_code: text(r[idx.affectation]) === '0' ? '' : text(r[idx.affectation]),
        });
    }
    return agents;
}

/** « DSI\BF6-SERVICE …\BF62-SECTEUR … » -> « BF62 » (code entre le dernier « \ » et le « - »). */
function unitCode(chemin) {
    const last = text(chemin).split('\\').pop() || '';
    const m = last.match(/^([^-]+)-/);
    return m ? m[1].trim() : '';
}

/** Codes de toutes les unités du chemin, de la plus fine à la plus haute (repli quand l'unité n'a pas de responsable propre). */
function unitCodes(chemin) {
    return text(chemin).split('\\').map(seg => (seg.match(/^([^-]+)-/) || [])[1]).filter(Boolean).map(c => c.trim()).reverse();
}

const isValideurFonction = (f) => VALIDEUR_PREFIXES.includes(text(f).slice(0, 5).toLowerCase());

/** Candidats valideurs de chaque agent (rattachés au code de son unité). */
function computeCandidates(agents) {
    const byUnit = new Map();
    for (const a of agents) {
        if (!isValideurFonction(a.poste_fonction) || !a.poste_affectation_code) continue;
        if (!byUnit.has(a.poste_affectation_code)) byUnit.set(a.poste_affectation_code, []);
        byUnit.get(a.poste_affectation_code).push(a);
    }
    for (const a of agents) {
        // Code de l'unité de l'agent ; à défaut de responsable à ce niveau, on remonte aux unités parentes du chemin.
        let list = [];
        a.valideur_niveau = 0;
        const codes = unitCodes(a.chemin);
        for (let i = 0; i < codes.length && !list.length; i++) {
            list = (byUnit.get(codes[i]) || []).filter(v => v.matricule !== a.matricule);
            a.valideur_niveau = i;
        }
        const preferred = list.filter(v => v.a_conserver);
        a.est_valideur = isValideurFonction(a.poste_fonction);
        a.candidats = (preferred.length ? preferred : list).map(v => ({ matricule: v.matricule, nom: v.nom_prenom, fonction: v.poste_fonction, poste: v.poste }));
    }
}

async function importWorkbook(buffer, filename, actor) {
    await ensureSchema();
    const agents = parseAgents(buffer);
    computeCandidates(agents);
    const templates = await parseTemplates(buffer);

    // Choix d'administrateur et rapprochements AD déjà faits : conservés d'un dépôt à l'autre.
    const old = new Map((await pgDb.all('SELECT * FROM hub_entretiens.base_agents')).map(r => [r.matricule, r]));
    for (const a of agents) {
        const o = old.get(a.matricule);
        const candIds = a.candidats.map(c => c.matricule);
        let chosen = '', source = '';
        // Choix manuel de l'admin : conservé tant que le valideur choisi existe encore dans le classeur (même hors des propositions automatiques).
        if (o && o.valideur_source === 'admin' && o.valideur_matricule && agents.some(x => x.matricule === o.valideur_matricule)) { chosen = o.valideur_matricule; source = 'admin'; }
        else if (candIds.length === 1) { chosen = candIds[0]; source = 'auto'; }
        a.valideur_matricule = chosen; a.valideur_source = source;
        a.email = o ? o.email || '' : ''; a.ad_username = o ? o.ad_username || '' : ''; a.ad_status = o ? o.ad_status || 'non_verifie' : 'non_verifie'; a.email_deduit = !!(o && o.email_deduit);
    }

    await pgDb.run('DELETE FROM hub_entretiens.base_agents');
    for (const a of agents) {
        await pgDb.run(
            `INSERT INTO hub_entretiens.base_agents (matricule, nom_prenom, modele, a_conserver, direction, service, poste, grade, chemin, unit_code,
                poste_fonction, poste_affectation_code, est_valideur, valideur_candidats, valideur_matricule, valideur_source, email, ad_username, ad_status, email_deduit, nom, prenom)
             VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,CAST(? AS jsonb),?,?,?,?,?,?,?,?)
             ON CONFLICT (matricule) DO NOTHING`,
            [a.matricule, a.nom_prenom, a.modele, a.a_conserver, a.direction, a.service, a.poste, a.grade, a.chemin, a.unit_code,
                a.poste_fonction, a.poste_affectation_code, a.est_valideur, JSON.stringify(a.candidats), a.valideur_matricule, a.valideur_source,
                a.email, a.ad_username, a.ad_status, a.email_deduit, a.nom || '', a.prenom || '']);
    }
    for (const [name, d] of Object.entries(templates)) {
        await pgDb.run(
            `INSERT INTO hub_entretiens.crep_templates (name, definition, updated_at) VALUES (?, CAST(? AS jsonb), NOW())
             ON CONFLICT (name) DO UPDATE SET definition = EXCLUDED.definition, updated_at = NOW()`, [name, JSON.stringify(d)]);
    }
    const nbEval = agents.filter(a => a.a_conserver).length;
    await pgDb.run('INSERT INTO hub_entretiens.base_imports (filename, uploaded_by, nb_agents, nb_a_evaluer, nb_modeles) VALUES (?,?,?,?,?)',
        [filename || '', actor || '', agents.length, nbEval, Object.keys(templates).length]);
    await loadTemplateCache();
    return {
        agents: agents.length, a_evaluer: nbEval, modeles: Object.keys(templates),
        sans_valideur: agents.filter(a => a.a_conserver && !a.candidats.length).length,
        a_choisir: agents.filter(a => a.a_conserver && a.candidats.length > 1 && !a.valideur_matricule).length,
    };
}

// ─── Cache des modèles (utilisé par les formulaires, le contrôle de saisie et le PDF) ──

let nameToModele = new Map();   // tokenKey(nom prénom) -> modèle
let matToModele = new Map();    // matricule -> modèle
async function loadTemplateCache() {
    await ensureSchema();
    const tpl = {};
    for (const r of await pgDb.all('SELECT name, definition FROM hub_entretiens.crep_templates')) tpl[r.name] = typeof r.definition === 'string' ? JSON.parse(r.definition) : r.definition;
    def.setTemplateDefs(tpl);
    const rows = await pgDb.all("SELECT matricule, nom_prenom, modele FROM hub_entretiens.base_agents WHERE modele <> ''");
    nameToModele = new Map(rows.map(r => [tokenKey(r.nom_prenom), r.modele]));
    matToModele = new Map(rows.map(r => [r.matricule, r.modele]));
}

/** Modèle (nom d'onglet) d'un entretien : par matricule du rattachement, sinon par identité. */
async function modeleOfEntretien(e) {
    try {
        if (!nameToModele.size && !matToModele.size) await loadTemplateCache();
        if (e.agent_matricule) for (const v of [e.agent_matricule, String(e.agent_matricule).padStart(7, '0')]) if (matToModele.has(v)) return matToModele.get(v);
        if (e.rattachement_id) {
            const r = await pgDb.get('SELECT agent_matricule FROM hub_entretiens.rattachements WHERE id = ?', [e.rattachement_id]);
            const m = r && r.agent_matricule;
            if (m) for (const v of [m, String(m).padStart(7, '0')]) if (matToModele.has(v)) return matToModele.get(v);
        }
        return nameToModele.get(tokenKey(`${e.agent_prenom || ''} ${e.agent_nom || ''}`)) || '';
    } catch { return ''; }
}

// ─── Rapprochement AD (e-mail) ──────────────────────────────────────────────

const lev1 = (a, b) => {
    if (a === b) return true;
    if (Math.abs(a.length - b.length) > 1 || Math.min(a.length, b.length) < 5) return false;
    let i = 0; while (i < a.length && i < b.length && a[i] === b[i]) i++;
    if (a.length === b.length) return a.slice(i + 1) === b.slice(i + 1);
    return a.length > b.length ? a.slice(i + 1) === b.slice(i) : b.slice(i + 1) === a.slice(i);
};

/** Les prénoms/noms de l'AD (ex. « DANIEL ATAYI ») sont-ils contenus dans l'identité RH (« ATAYI AYIKOE DANIEL ») ? Ordre libre, petite erreur tolérée. */
function sameIdentity(rhName, adName) {
    const a = tokens(rhName), b = tokens(adName);
    if (!a.length || !b.length) return false;
    const [small, big] = a.length <= b.length ? [a, b] : [b, a];
    if (small.length < 2 && big.length > 1) return false;
    return small.every(t => big.some(u => lev1(t, u)));
}
const emailOf = (hit) => text(hit.email).toLowerCase() || (hit.username ? `${text(hit.username).toLowerCase()}@${adHelper.EMAIL_DOMAIN}` : '');
const matVariants = (m) => { const raw = text(m); return [...new Set([raw, raw.replace(/^0+/, ''), /^\d+$/.test(raw) ? raw.padStart(7, '0') : raw])]; };

async function adConfig() {
    try {
        const db = require('../../shared/database').getSqlite();
        const cfg = db && await db.get('SELECT * FROM ad_settings WHERE id = 1');
        return cfg && cfg.is_enabled ? cfg : null;
    } catch { return null; }
}

async function matchAd(agent, cfg) {
    const toks = tokens(agent.nom_prenom).filter(t => t.length >= 3).sort((x, y) => y.length - x.length).slice(0, 2);
    const hits = new Map();
    for (const t of toks) for (const h of await adHelper.searchADUsersByQuery(t, cfg)) hits.set(h.username, h);
    const list = [...hits.values()];
    const mats = matVariants(agent.matricule);
    const byMat = list.find(h => h.matricule && mats.includes(text(h.matricule)));
    if (byMat) return { hit: byMat, status: 'matricule' };
    const byName = list.filter(h => sameIdentity(agent.nom_prenom, h.displayName));
    if (byName.length === 1) return { hit: byName[0], status: 'nom' };
    return { hit: null, status: byName.length > 1 ? 'ambigu' : 'introuvable' };
}

const job = { running: false, done: 0, total: 0, found: 0, error: '', startedAt: null };

/** Lance (en arrière-plan) le rapprochement AD des agents à évaluer. `all` : refait aussi ceux déjà rapprochés. */
async function startAdRefresh({ all = false } = {}) {
    if (job.running) return { ...job };
    await ensureSchema();
    const cfg = await adConfig();
    if (!cfg) throw Object.assign(new Error('Active Directory non configuré ou désactivé.'), { status: 409 });
    const rows = await pgDb.all(
        `SELECT matricule, nom_prenom FROM hub_entretiens.base_agents WHERE a_conserver AND ad_status <> 'manuel' ${all ? '' : "AND ad_status IN ('non_verifie','introuvable','ambigu')"} ORDER BY nom_prenom`);
    Object.assign(job, { running: true, done: 0, total: rows.length, found: 0, error: '', startedAt: new Date().toISOString() });
    (async () => {
        const queue = rows.slice();
        const worker = async () => {
            while (queue.length) {
                const a = queue.shift();
                try {
                    const { hit, status } = await matchAd(a, cfg);
                    await pgDb.run(
                        `UPDATE hub_entretiens.base_agents SET ad_status = ?, ad_username = ?, email = ?, email_deduit = ?, ad_checked_at = NOW() WHERE matricule = ?`,
                        [status, hit ? hit.username : '', hit ? emailOf(hit) : '', !!(hit && !text(hit.email)), a.matricule]);
                    if (hit) job.found++;
                } catch (e) { job.error = e.message; }
                job.done++;
            }
        };
        await Promise.all([worker(), worker(), worker(), worker()]);
    })().catch((e) => { job.error = e.message; }).finally(() => { job.running = false; syncQuiet(); });
    return { ...job };
}


// ─── Entretiens : création automatique à partir de la base ──────────────────

const hasProgress = (e) => e.statut !== 'a_planifier' || e.preparation_statut !== 'non_commencee'
    || e.evaluation_statut !== 'non_commencee' || (e.crep_statut && e.crep_statut !== 'non_envoye');
const evalName = (v) => `${text(v.prenom)} ${text(v.nom)}`.trim() || text(v.nom_prenom);

/**
 * Crée (ou met à jour) l'entretien de la campagne en cours de chaque agent à évaluer qui a un valideur ; l'évaluateur est
 * son valideur. Un entretien non commencé suit les changements (valideur, e-mail, compte AD) ; si l'agent perd son valideur,
 * son entretien non commencé est retiré. Un entretien commencé n'est jamais modifié. `matricules` : limite à ces agents.
 */
async function syncEntretiens({ matricules, actor } = {}) {
    await ensureSchema();
    const campaign = await require('../entretiens/entretiens.service').getCurrentCampaign();
    if (!campaign) throw Object.assign(new Error('Aucune campagne d’entretiens : créez-en une avant de générer les entretiens.'), { status: 409 });
    const filter = Array.isArray(matricules) && matricules.length ? ` AND a.matricule IN (${matricules.map(m => `'${String(m).replace(/'/g, "''")}'`).join(',')})` : '';
    const rows = await pgDb.all(
        `SELECT a.*, v.nom_prenom AS v_nom_prenom, v.nom AS v_nom, v.prenom AS v_prenom, v.ad_username AS v_username, v.email AS v_email
         FROM hub_entretiens.base_agents a LEFT JOIN hub_entretiens.base_agents v ON v.matricule = a.valideur_matricule
         WHERE a.a_conserver${filter}`);
    const out = { crees: 0, mis_a_jour: 0, retires: 0, deja_commences: 0, sans_valideur: 0, erreurs: [] };
    for (const a of rows) {
        try {
            const existing = await pgDb.get(
                'SELECT * FROM hub_entretiens.entretiens WHERE campaign_id = ? AND agent_matricule = ? AND deleted_at IS NULL ORDER BY id DESC LIMIT 1', [campaign.id, a.matricule]);
            if (!a.valideur_matricule) {
                out.sans_valideur++;
                if (existing && existing.source === 'base' && !hasProgress(existing)) {
                    await pgDb.run("UPDATE hub_entretiens.entretiens SET deleted_at = NOW(), deleted_by = 'valideur retiré' WHERE id = ?", [existing.id]);
                    out.retires++;
                }
                continue;
            }
            const ev = { username: text(a.v_username), email: text(a.v_email).toLowerCase(), nom: evalName({ nom: a.v_nom, prenom: a.v_prenom, nom_prenom: a.v_nom_prenom }) };
            if (existing) {
                if (hasProgress(existing)) { out.deja_commences++; continue; }
                await pgDb.run(
                    `UPDATE hub_entretiens.entretiens SET agent_username = ?, agent_email = ?, evaluator_username = ?, evaluator_email = ?, evaluator_nom = ?,
                        direction = ?, service = ?, poste = ?, agent_grade = ?, updated_at = NOW() WHERE id = ?`,
                    [text(a.ad_username), text(a.email).toLowerCase(), ev.username, ev.email, ev.nom, a.direction, a.service, a.poste, a.grade, existing.id]);
                out.mis_a_jour++;
                continue;
            }
            await pgDb.run(
                `INSERT INTO hub_entretiens.entretiens
                   (campaign_id, agent_username, agent_email, agent_nom, agent_prenom, direction, service, poste, agent_matricule, agent_grade, source,
                    evaluator_username, evaluator_email, evaluator_nom, statut, created_by)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'base', ?, ?, ?, 'a_planifier', ?)`,
                [campaign.id, text(a.ad_username), text(a.email).toLowerCase(), text(a.nom) || text(a.nom_prenom), text(a.prenom), a.direction, a.service, a.poste,
                    a.matricule, a.grade, ev.username, ev.email, ev.nom, (actor && actor.username) || 'import base agents']);
            out.crees++;
        } catch (e) { out.erreurs.push(`${a.nom_prenom} : ${e.message}`); }
    }
    return out;
}

/** Synchronisation « best effort » après une modification ponctuelle (valideur, compte AD). */
const syncQuiet = (matricules) => syncEntretiens({ matricules }).catch((e) => console.warn('[ep-base] synchro entretiens :', e.message));

/**
 * Supprime les anciens entretiens (tests) : tous ceux qui ne viennent pas de la base des agents (DSI Hub comprise), ainsi que les
 * anciens valideurs et leurs listes d'agents. Suppression logique (deleted_at, comme partout dans le module) : rien n'est effacé physiquement.
 */
async function purgeLegacyEntretiens(actor) {
    await ensureSchema();
    const out = { entretiens: 0, listes: 0, valideurs: 0, erreurs: [] };
    const step = async (label, fn) => { try { await fn(); } catch (e) { out.erreurs.push(`${label} : ${e.message}`); console.error('[ep-base] purge', label, e.message); } };
    const count = async (sql) => { try { const r = await pgDb.get(sql); return Number(r && r.n) || 0; } catch { return 0; } };
    await step('entretiens', async () => {
        out.entretiens = await count("SELECT COUNT(*)::int AS n FROM hub_entretiens.entretiens WHERE deleted_at IS NULL AND COALESCE(source, '') <> 'base'");
        await pgDb.run("UPDATE hub_entretiens.entretiens SET deleted_at = NOW(), deleted_by = 'purge tests', rattachement_id = NULL WHERE deleted_at IS NULL AND COALESCE(source, '') <> 'base'");
    });
    await step('listes d’agents', async () => {
        out.listes = await count('SELECT COUNT(*)::int AS n FROM hub_entretiens.rattachements');
        await pgDb.run('DELETE FROM hub_entretiens.rattachements');
    });
    await step('valideurs', async () => {
        out.valideurs = await count('SELECT COUNT(*)::int AS n FROM hub_entretiens.valideurs');
        await pgDb.run('DELETE FROM hub_entretiens.valideurs');
    });
    return out;
}

// ─── Lecture / mise à jour ──────────────────────────────────────────────────

async function listAgents({ modele, q, statut, direction, service, grade, limit = 3000 } = {}) {
    await ensureSchema();
    const where = ['a_conserver']; const params = [];
    if (modele) { where.push('modele = ?'); params.push(modele); }
    if (direction) { where.push('split_part(chemin, chr(92), 1) = ?'); params.push(direction); }
    if (service) { where.push('service = ?'); params.push(service); }
    if (grade) { where.push('grade = ?'); params.push(grade); }
    if (q) { where.push('(LOWER(nom_prenom) LIKE ? OR matricule LIKE ? OR LOWER(service) LIKE ?)'); const l = `%${String(q).toLowerCase()}%`; params.push(l, `%${q}%`, l); }
    if (statut === 'sans_email') where.push("COALESCE(email,'') = ''");
    if (statut === 'avec_email') where.push("COALESCE(email,'') <> ''");
    if (statut === 'email_deduit') where.push('email_deduit');
    if (statut === 'avec_valideur') where.push("valideur_matricule <> ''");
    if (statut === 'valideur_a_choisir') where.push("valideur_matricule = '' AND jsonb_array_length(valideur_candidats) > 1");
    if (statut === 'sans_valideur') where.push("valideur_matricule = '' AND jsonb_array_length(valideur_candidats) = 0");
    const rows = await pgDb.all(
        `SELECT * FROM hub_entretiens.base_agents WHERE ${where.join(' AND ')} ORDER BY nom_prenom LIMIT ${Math.min(Number(limit) || 3000, 5000)}`, params);
    const names = new Map((await pgDb.all('SELECT matricule, nom_prenom FROM hub_entretiens.base_agents')).map(r => [r.matricule, r.nom_prenom]));
    return rows.map(r => ({
        ...r,
        valideur_candidats: typeof r.valideur_candidats === 'string' ? JSON.parse(r.valideur_candidats) : (r.valideur_candidats || []),
        valideur_nom: names.get(r.valideur_matricule) || '',
    }));
}

/** Vue globale : agents à évaluer + valideurs qu'ils référencent (même s'ils ne sont pas eux-mêmes à évaluer), avec leur valideur. */
async function tree() {
    await ensureSchema();
    const rows = await pgDb.all(
        `SELECT matricule, nom_prenom, modele, a_conserver, service, poste, grade, unit_code, email, email_deduit, split_part(chemin, chr(92), 1) AS direction, est_valideur, valideur_candidats, valideur_matricule, valideur_source
         FROM hub_entretiens.base_agents
         WHERE a_conserver OR matricule IN (SELECT valideur_matricule FROM hub_entretiens.base_agents WHERE a_conserver AND valideur_matricule <> '')`);
    const nodes = rows.map(r => ({
        ...r, valideur_candidats: typeof r.valideur_candidats === 'string' ? JSON.parse(r.valideur_candidats) : (r.valideur_candidats || []),
    }));
    const names = new Map(nodes.map(n => [n.matricule, n.nom_prenom]));
    return nodes.map(n => ({ ...n, valideur_nom: names.get(n.valideur_matricule) || '' }));
}

async function stats() {
    await ensureSchema();
    const row = await pgDb.get(
        `SELECT COUNT(*) FILTER (WHERE a_conserver)::int AS a_evaluer,
                COUNT(*) FILTER (WHERE a_conserver AND COALESCE(email,'') <> '')::int AS avec_email,
                COUNT(*) FILTER (WHERE a_conserver AND email_deduit)::int AS email_deduit,
                COUNT(*) FILTER (WHERE a_conserver AND valideur_matricule <> '')::int AS avec_valideur,
                COUNT(*) FILTER (WHERE a_conserver AND valideur_matricule = '' AND jsonb_array_length(valideur_candidats) > 1)::int AS valideur_a_choisir,
                COUNT(*) FILTER (WHERE a_conserver AND valideur_matricule = '' AND jsonb_array_length(valideur_candidats) = 0)::int AS sans_valideur
         FROM hub_entretiens.base_agents`);
    const parModele = await pgDb.all("SELECT modele, COUNT(*)::int AS n FROM hub_entretiens.base_agents WHERE a_conserver GROUP BY modele ORDER BY modele");
    const last = await pgDb.get('SELECT * FROM hub_entretiens.base_imports ORDER BY id DESC LIMIT 1');
    const facette = async (expr) => (await pgDb.all(`SELECT DISTINCT ${expr} AS v FROM hub_entretiens.base_agents WHERE a_conserver AND COALESCE(${expr}, '') <> '' ORDER BY 1`)).map(r => r.v);
    const facettes = {
        directions: await facette('split_part(chemin, chr(92), 1)'),
        services: await facette('service'),
        grades: await facette('grade'),
    };
    return { ...row, par_modele: parModele, facettes, dernier_import: last || null, ad: { ...job } };
}

async function listTemplates() {
    await ensureSchema();
    const rows = await pgDb.all('SELECT name, definition, updated_at FROM hub_entretiens.crep_templates ORDER BY name');
    return rows.map(r => ({ name: r.name, updated_at: r.updated_at, definition: typeof r.definition === 'string' ? JSON.parse(r.definition) : r.definition }));
}

async function setValideur(matricule, valideurMatricule) {
    await ensureSchema();
    const a = await pgDb.get('SELECT valideur_candidats FROM hub_entretiens.base_agents WHERE matricule = ?', [matricule]);
    if (!a) throw Object.assign(new Error('Agent introuvable.'), { status: 404 });
    const cands = typeof a.valideur_candidats === 'string' ? JSON.parse(a.valideur_candidats) : (a.valideur_candidats || []);
    if (valideurMatricule === matricule) throw Object.assign(new Error('Un agent ne peut pas être son propre valideur.'), { status: 400 });
    if (valideurMatricule && !cands.some(c => c.matricule === valideurMatricule)) {
        // L'administrateur peut aussi désigner un valideur hors proposition, à condition qu'il existe dans la base.
        const v = await pgDb.get('SELECT 1 AS x FROM hub_entretiens.base_agents WHERE matricule = ?', [valideurMatricule]);
        if (!v) throw Object.assign(new Error('Valideur inconnu.'), { status: 400 });
    }
    await pgDb.run('UPDATE hub_entretiens.base_agents SET valideur_matricule = ?, valideur_source = ? WHERE matricule = ?',
        [valideurMatricule || '', valideurMatricule ? 'admin' : '', matricule]);
    syncQuiet([matricule]);
}

/**
 * Le compte connecté est-il valideur (évaluateur) d'au moins un agent de la base ? Rapprochement par compte AD, e-mail,
 * puis identité (nom + prénom, sans tenir compte de l'ordre) quand elle est sans ambiguïté.
 */
async function meMatricule(actor) {
    await ensureSchema();
    const rows = await pgDb.all("SELECT matricule, nom_prenom, ad_username, email FROM hub_entretiens.base_agents WHERE matricule IN (SELECT DISTINCT valideur_matricule FROM hub_entretiens.base_agents WHERE a_conserver AND valideur_matricule <> '')");
    if (!rows.length) return '';
    const user = text(actor.username).toLowerCase(); const mail = text(actor.email).toLowerCase();
    let me = rows.filter(r => (user && text(r.ad_username).toLowerCase() === user) || (mail && text(r.email).toLowerCase() === mail));
    if (!me.length && text(actor.displayName)) me = rows.filter(r => tokenKey(r.nom_prenom) === tokenKey(actor.displayName));
    return me.length === 1 ? me[0].matricule : '';
}

async function meValideur(actor) {
    const matricule = await meMatricule(actor);
    if (!matricule) return { isValideur: false, agents: 0 };
    const n = await pgDb.get("SELECT COUNT(*)::int AS n FROM hub_entretiens.base_agents WHERE a_conserver AND valideur_matricule = ?", [matricule]);
    return { isValideur: Number(n && n.n) > 0, agents: Number(n && n.n) || 0, matricule };
}

/** Tous les agents placés sous un valideur, à tous les niveaux (ses agents, puis ceux de ses agents valideurs, etc.). */
async function descendants(matricule) {
    const rows = await pgDb.all("SELECT matricule, valideur_matricule FROM hub_entretiens.base_agents WHERE a_conserver AND valideur_matricule <> ''");
    const kids = new Map();
    for (const r of rows) { if (!kids.has(r.valideur_matricule)) kids.set(r.valideur_matricule, []); kids.get(r.valideur_matricule).push(r.matricule); }
    const out = new Set(); const stack = [...(kids.get(matricule) || [])];
    while (stack.length) { const m = stack.pop(); if (out.has(m) || m === matricule) continue; out.add(m); stack.push(...(kids.get(m) || [])); }
    return out;
}

/** Tableau de bord (même contrat que « EP que je réalise ») : entretiens de toute l'équipe sous le valideur connecté. */
async function equipeEntretiens(actor) {
    const ent = require('../entretiens/entretiens.service');
    const campaign = await ent.getCurrentCampaign();
    const matricule = await meMatricule(actor);
    if (!campaign || !matricule) return { campaign: campaign || null, stats: ent.computeStats([]), items: [], portee: [] };
    const set = await descendants(matricule);
    const all = await ent.listEntretiens({ campaignId: campaign.id });
    const items = all.filter(r => r.agent_matricule && set.has(r.agent_matricule));
    let enriched = items;
    try { enriched = await require('../entretiens/ep-rh-enrich').enrichFromRh(items); } catch { /* SEDIT RH indisponible : données de l'entretien seules */ }
    return { campaign, stats: ent.computeStats(items), items: enriched, portee: [`${set.size} agent(s) sous votre responsabilité`] };
}

/** Pilotage (administrateurs) : tous les entretiens de la campagne en cours. */
async function pilotageEntretiens() {
    const ent = require('../entretiens/entretiens.service');
    const campaign = await ent.getCurrentCampaign();
    if (!campaign) return { campaign: null, stats: ent.computeStats([]), items: [] };
    const items = await ent.listEntretiens({ campaignId: campaign.id });
    let enriched = items;
    try { enriched = await require('../entretiens/ep-rh-enrich').enrichFromRh(items); } catch { /* idem */ }
    return { campaign, stats: ent.computeStats(items), items: enriched };
}

/** Recherche libre dans l'AD (association manuelle d'un agent introuvable). */
async function searchAd(q) {
    const cfg = await adConfig();
    if (!cfg) throw Object.assign(new Error('Active Directory non configuré ou désactivé.'), { status: 409 });
    const query = text(q);
    if (query.length < 2) return [];
    const hits = new Map();
    // Une recherche par mot (≥ 3 lettres) : « TAUPIN DUPONT SOPHIE » doit pouvoir retrouver « Sophie DAUDET ».
    const words = [query, ...tokens(query).filter(t => t.length >= 3)];
    for (const w of [...new Set(words)].slice(0, 4)) for (const h of await adHelper.searchADUsersByQuery(w, cfg)) hits.set(h.username, h);
    return [...hits.values()].map(h => ({ username: h.username, displayName: h.displayName, email: emailOf(h), email_ad: text(h.email).toLowerCase(), service: h.service || '', direction: h.direction || '' })).slice(0, 40);
}

/** Associe (ou dissocie, username vide) manuellement un agent à un compte AD ; l'e-mail est repris de l'AD. */
async function linkAd(matricule, username) {
    await ensureSchema();
    const a = await pgDb.get('SELECT matricule FROM hub_entretiens.base_agents WHERE matricule = ?', [matricule]);
    if (!a) throw Object.assign(new Error('Agent introuvable.'), { status: 404 });
    if (!text(username)) {
        await pgDb.run("UPDATE hub_entretiens.base_agents SET ad_username = '', email = '', ad_status = 'non_verifie', email_deduit = FALSE, ad_checked_at = NULL WHERE matricule = ?", [matricule]);
        syncQuiet([matricule]);
        return { email: '' };
    }
    const hit = (await searchAd(username)).find(h => h.username.toLowerCase() === text(username).toLowerCase());
    if (!hit) throw Object.assign(new Error('Compte introuvable dans l’Active Directory.'), { status: 404 });
    const other = await pgDb.get('SELECT nom_prenom FROM hub_entretiens.base_agents WHERE LOWER(ad_username) = LOWER(?) AND matricule <> ?', [hit.username, matricule]);
    if (other) throw Object.assign(new Error(`Ce compte AD est déjà associé à ${other.nom_prenom}.`), { status: 409 });
    await pgDb.run("UPDATE hub_entretiens.base_agents SET ad_username = ?, email = ?, email_deduit = ?, ad_status = 'manuel', ad_checked_at = NOW() WHERE matricule = ?", [hit.username, hit.email, !hit.email_ad, matricule]);
    syncQuiet([matricule]);
    return { email: hit.email, username: hit.username };
}

/** Recherche d'un valideur parmi tous les agents de la base (choix « à la main » par l'admin ; les agents ayant une fonction d'encadrement sont listés d'abord). */
async function searchValideurs(q) {
    await ensureSchema();
    const l = `%${String(q || '').toLowerCase()}%`;
    return pgDb.all(
        `SELECT matricule, nom_prenom AS nom, poste_fonction AS fonction, poste FROM hub_entretiens.base_agents
         WHERE (LOWER(nom_prenom) LIKE ? OR matricule LIKE ?) ORDER BY a_conserver DESC, est_valideur DESC, nom_prenom LIMIT 30`, [l, `%${q}%`]);
}

module.exports = {
    ensureSchema, importWorkbook, parseAgents, parseTemplates, unitCode, computeCandidates, sameIdentity,
    loadTemplateCache, modeleOfEntretien, tree, startAdRefresh, listAgents, stats, listTemplates, setValideur, searchValideurs, searchAd, linkAd, meValideur, equipeEntretiens, pilotageEntretiens, syncEntretiens, purgeLegacyEntretiens,
    adJob: job,
};
