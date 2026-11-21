/**
 * Synchronise le miroir RH local (oracle.rh_v_extract_dsi, oracle.rh_siim_organigramme*)
 * depuis l'API SEDIT RH. Aucun accès Oracle direct n'est utilisé.
 *
 * Les tables locales restent la source lue par les modules existants, mais elles sont
 * entièrement reconstruites à partir de l'API. En cas d'erreur ou de réponse vide,
 * les données précédentes sont conservées.
 */
const { pool } = require('./database');
const sedit = require('./sedit-rh');

const AGENT_COLS = [
    'MATRICULE', 'NOM', 'PRENOM', 'STATUT', 'STATUT_L', 'DIRECTION', 'DIRECTION_L', 'SERVICE', 'SERVICE_L',
    'PST_AFFECT', 'PST_AFFECT_L', 'AFFECT', 'AFFECT_L', 'POSTE', 'POSTE_L', 'FONCTION', 'FONCTION_L',
    'AFFECTGEO', 'AFFECTGEO_L', 'AGT_GRADE', 'AGT_GRADE_L', 'PST_CADREMP', 'PST_CADREMP_L', 'PST_CAT',
    'DATE_ARRIVEE', 'MOTIF_ARRIVEE', 'DATE_DEPART', 'MOTIF_DEPART', 'DATE_MODIF_DOSS', 'DATE_EXTRACT_DOSS',
    'DATE_MAJ', 'COLLECTIVITE', 'COLLECTIVITE_L', 'POSITION', 'POSITION_L', 'FIN_PREV_POS',
];

const code = (o) => (o && o.code != null ? String(o.code).trim() : null);
const label = (o) => (o && o.libelle != null ? String(o.libelle).trim() : null);
const text = (v) => (v == null || v === '' ? null : String(v).trim());
const nowIso = () => new Date().toISOString().slice(0, 19).replace('T', ' ');

function agentRow(a, stamp) {
    return [
        text(a.matricule), text(a.nom), text(a.prenom), code(a.statut), label(a.statut),
        code(a.direction), label(a.direction), code(a.service), label(a.service),
        code(a.secteur), label(a.secteur), code(a.affectation), label(a.affectation),
        code(a.poste), label(a.poste), code(a.fonction), label(a.fonction),
        code(a.lieu), label(a.lieu), code(a.grade), label(a.grade),
        code(a.cadre_emploi), label(a.cadre_emploi), text(a.categorie),
        text(a.date_arrivee), text(a.motif_arrivee), text(a.date_depart), text(a.motif_depart),
        text(a.dossier_modifie_le), stamp, stamp,
        code(a.collectivite), label(a.collectivite), code(a.position), label(a.position),
        text(a.fin_prevue_position),
    ];
}

const ORG_COLS = ['ENTCASE', 'CASE', 'AFFECT', 'AFFECT_L', 'DG-CAB', 'DG-CAB_L', 'DIRECTION', 'DIRECTION_L', 'SERVICE', 'SERVICE_L', 'SECTEUR', 'SECTEUR_L', 'EQUIPE', 'EQUIPE_L'];

function orgRows(org) {
    const rows = [];
    const push = (dir, svc, sec, eq) => rows.push([
        null, null,
        code(sec) || code(svc) || code(dir), label(sec) || label(svc) || label(dir),
        null, null,
        code(dir), label(dir), code(svc), label(svc), code(sec), label(sec), code(eq), label(eq),
    ]);
    for (const d of org) {
        for (const s of d.services || []) {
            if (!(s.secteurs || []).length) push(d, s, null, null);
            for (const sec of s.secteurs || []) {
                if (!(sec.equipes || []).length) push(d, s, sec, null);
                for (const eq of sec.equipes || []) push(d, s, sec, eq);
            }
        }
    }
    return [...new Map(rows.map(r => [r.join('|'), r])).values()];
}

async function replaceTable(client, table, cols, rows, chunk = 200) {
    await client.query(`DELETE FROM oracle.${table}`);
    const colSql = cols.map(c => `"${c}"`).join(',');
    for (let i = 0; i < rows.length; i += chunk) {
        const part = rows.slice(i, i + chunk);
        const values = [];
        const tuple = part.map(row => {
            const marks = row.map(v => { values.push(v); return `$${values.length}`; });
            return `(${marks.join(',')})`;
        }).join(',');
        await client.query(`INSERT INTO oracle.${table} (${colSql}) VALUES ${tuple}`, values);
    }
}

async function syncRhFromApi({ dryRun = false } = {}) {
    const [agents, org] = await Promise.all([sedit.allAgents(true), sedit.organisation(true)]);
    if (!agents.length) throw new Error('API SEDIT RH : aucun agent reçu, miroir conservé');
    if (!org.length) throw new Error('API SEDIT RH : organigramme vide, miroir conservé');

    const stamp = nowIso();
    const agentData = agents.map(a => agentRow(a, stamp));
    const orgData = orgRows(org);
    if (dryRun) return { agents: agentData.length, organisations: orgData.length, dry_run: true };

    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        await replaceTable(client, 'rh_v_extract_dsi', AGENT_COLS, agentData);
        await replaceTable(client, 'rh_siim_organigramme_v2', ORG_COLS, orgData);
        await replaceTable(client, 'rh_siim_organigramme', ORG_COLS, orgData);
        await client.query('COMMIT');
    } catch (e) {
        await client.query('ROLLBACK').catch(() => {});
        throw e;
    } finally {
        client.release();
    }
    return { agents: agentData.length, organisations: orgData.length, dry_run: false, synced_at: stamp };
}

module.exports = { syncRhFromApi };
