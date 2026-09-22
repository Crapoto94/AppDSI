/**
 * Migration des données applicatives « non-paramétrage » restées dans SQLite
 * vers PostgreSQL (Lot 1 — cf. plan de migration).
 *
 * Tables concernées :
 *   - contacts              → hub.contacts            (tier_id → tier_code)
 *   - budgets               → finance.budgets
 *   - m57_plan              → finance.m57_plan
 *   - access_requests       → hub.access_requests      (username résolu)
 *   - todos                 → hub.todos
 *   - import_logs           → hub.import_logs
 *   - attachments           → hub.attachments
 *
 * Idempotent : ON CONFLICT (id) DO NOTHING. Relancer ne duplique rien.
 *
 * Usage :
 *   node scripts/migrate-non-config-sqlite.js            # simulation (défaut)
 *   node scripts/migrate-non-config-sqlite.js --apply    # écrit dans Postgres
 *   node scripts/migrate-non-config-sqlite.js --apply --only=contacts,budgets
 */
const setupSqlite = require('../shared/sqlite_db');
const { pool } = require('../shared/pg_db');

const argv = process.argv.slice(2);
const APPLY = argv.includes('--apply');
const ONLY = (argv.find(a => a.startsWith('--only=')) || '').split('=')[1];

/** Horodatage SQLite naïf (UTC) → ISO UTC explicite pour timestamptz. */
function asTs(v) {
    if (v === null || v === undefined || v === '') return null;
    const s = String(v).trim();
    if (/[zZ]|[+-]\d{2}:?\d{2}$/.test(s)) return s;
    return s.replace(' ', 'T') + 'Z';
}

const num = v => (v === null || v === undefined || v === '' ? null : Number(v));

const TABLES = [
    {
        name: 'contacts',
        pg: 'hub.contacts',
        select: 'SELECT id, tier_id, nom, prenom, role, telephone, email, commentaire, is_order_recipient FROM contacts',
        cols: ['id', 'tier_code', 'nom', 'prenom', 'role', 'telephone', 'email', 'commentaire', 'is_order_recipient'],
        map: r => [num(r.id), r.tier_id != null ? String(r.tier_id) : null, r.nom, r.prenom, r.role, r.telephone, r.email, r.commentaire, !!r.is_order_recipient],
    },
    {
        name: 'budgets',
        pg: 'finance.budgets',
        select: 'SELECT id, Annee, numero, Libelle FROM budgets',
        cols: ['id', '"Annee"', 'numero', '"Libelle"'],
        map: r => [num(r.id), num(r.Annee), num(r.numero), r.Libelle],
    },
    {
        name: 'm57_plan',
        pg: 'finance.m57_plan',
        select: 'SELECT id, code, label, section, type FROM m57_plan',
        cols: ['id', 'code', 'label', 'section', 'type'],
        map: r => [num(r.id), r.code, r.label, r.section, r.type],
    },
    {
        name: 'todos',
        pg: 'hub.todos',
        select: 'SELECT id, task, status, priority, created_at FROM todos',
        cols: ['id', 'task', 'status', 'priority', 'created_at'],
        map: r => [num(r.id), r.task, r.status, num(r.priority) || 0, asTs(r.created_at)],
    },
    {
        name: 'import_logs',
        pg: 'hub.import_logs',
        select: 'SELECT id, type, imported_at, username FROM import_logs',
        cols: ['id', 'type', 'imported_at', 'username'],
        map: r => [num(r.id), r.type, asTs(r.imported_at), r.username],
    },
    {
        name: 'attachments',
        pg: 'hub.attachments',
        // Le schéma SQLite réel ne contient pas toujours mimetype/size (ancienne
        // table) : on sélectionne les colonnes présentes et on laisse null sinon.
        select: 'SELECT id, target_type, target_id, file_path, original_name, uploaded_at, username FROM attachments',
        cols: ['id', 'target_type', 'target_id', 'file_path', 'original_name', 'mimetype', 'size', 'uploaded_at', 'username'],
        map: r => [num(r.id), r.target_type, r.target_id != null ? String(r.target_id) : null, r.file_path, r.original_name, null, null, asTs(r.uploaded_at), r.username],
    },
    {
        name: 'access_requests',
        pg: 'hub.access_requests',
        // username résolu depuis la table SQLite users (access_requests.user_id référence users.id SQLite).
        select: `SELECT ar.id, ar.user_id, ar.requested_tiles, ar.status, ar.created_at, u.username
                 FROM access_requests ar LEFT JOIN users u ON u.id = ar.user_id`,
        cols: ['id', 'username', 'user_id', 'requested_tiles', 'status', 'created_at'],
        map: r => [num(r.id), r.username, num(r.user_id), r.requested_tiles, r.status || 'pending', asTs(r.created_at)],
    },
];

const selected = t => !ONLY || ONLY.split(',').map(s => s.trim()).includes(t.name);

/** Crée les tables cibles si absentes (idempotent) — évite de dépendre de setupPgDb(). */
async function ensureTargets() {
    const ddl = [
        `CREATE TABLE IF NOT EXISTS hub.contacts (
            id SERIAL PRIMARY KEY, tier_code TEXT, nom TEXT, prenom TEXT, role TEXT,
            telephone TEXT, email TEXT, commentaire TEXT,
            is_order_recipient BOOLEAN DEFAULT FALSE, created_at TIMESTAMPTZ DEFAULT NOW())`,
        `CREATE INDEX IF NOT EXISTS idx_hub_contacts_tier_code ON hub.contacts(tier_code)`,
        `CREATE TABLE IF NOT EXISTS finance.budgets (
            id SERIAL PRIMARY KEY, "Annee" INTEGER, numero INTEGER, "Libelle" TEXT)`,
        `CREATE TABLE IF NOT EXISTS finance.m57_plan (
            id SERIAL PRIMARY KEY, code TEXT UNIQUE, label TEXT, section TEXT, type TEXT)`,
        `CREATE TABLE IF NOT EXISTS hub.access_requests (
            id SERIAL PRIMARY KEY, username TEXT, user_id INTEGER, requested_tiles TEXT,
            status TEXT DEFAULT 'pending', created_at TIMESTAMPTZ DEFAULT NOW())`,
        `CREATE TABLE IF NOT EXISTS hub.todos (
            id SERIAL PRIMARY KEY, task TEXT, status TEXT DEFAULT 'à faire',
            priority INTEGER DEFAULT 0, created_at TIMESTAMPTZ DEFAULT NOW())`,
        `CREATE TABLE IF NOT EXISTS hub.import_logs (
            id SERIAL PRIMARY KEY, type TEXT, imported_at TIMESTAMPTZ DEFAULT NOW(), username TEXT)`,
        `CREATE TABLE IF NOT EXISTS hub.attachments (
            id SERIAL PRIMARY KEY, target_type TEXT, target_id TEXT, file_path TEXT,
            original_name TEXT, mimetype TEXT, size BIGINT,
            uploaded_at TIMESTAMPTZ DEFAULT NOW(), username TEXT)`,
        `CREATE INDEX IF NOT EXISTS idx_hub_attachments_target ON hub.attachments(target_type, target_id)`,
    ];
    for (const sql of ddl) await pool.query(sql);
}

(async () => {
    console.log(`[MIGRATION] Mode: ${APPLY ? 'APPLY (écriture Postgres)' : 'DRY-RUN (simulation)'}`);
    if (ONLY) console.log(`[MIGRATION] Filtre: ${ONLY}`);

    if (APPLY) await ensureTargets();
    const sqlite = await setupSqlite();
    let totalInserted = 0;

    for (const t of TABLES) {
        if (!selected(t)) continue;
        let rows = [];
        try {
            rows = await sqlite.all(t.select);
        } catch (e) {
            console.log(`  ${t.name}: table SQLite introuvable (${e.message}) — ignorée`);
            continue;
        }
        const placeholders = t.cols.map((_, i) => `$${i + 1}`).join(', ');
        const sql = `INSERT INTO ${t.pg} (${t.cols.join(', ')}) VALUES (${placeholders}) ON CONFLICT (id) DO NOTHING`;

        let inserted = 0, skipped = 0, failed = 0;
        if (APPLY) {
            for (const r of rows) {
                try {
                    const res = await pool.query(sql, t.map(r));
                    if (res.rowCount > 0) inserted++; else skipped++;
                } catch (e) {
                    failed++;
                    console.error(`  ${t.name} id=${r.id}: ${e.message.split('\n')[0]}`);
                }
            }
        }
        totalInserted += inserted;
        console.log(`  ${t.name.padEnd(16)} source=${String(rows.length).padStart(6)} ` +
            (APPLY ? `insérés=${inserted} existants=${skipped} échecs=${failed}` : '→ ' + t.pg));
    }

    if (!APPLY) console.log('\n[MIGRATION] Simulation terminée. Relancer avec --apply pour écrire.');
    else console.log(`\n[MIGRATION] Terminé. ${totalInserted} ligne(s) insérée(s).`);

    await sqlite.close();
    await pool.end();
    process.exit(0);
})().catch(err => {
    console.error('[MIGRATION] Erreur fatale:', err);
    process.exit(1);
});
