/**
 * Demandes de formation issues des entretiens professionnels (vue ADMINISTRATEUR, globale et NON NOMINATIVE).
 *
 * Source : les trois rubriques « Actions de formation à envisager » du compte rendu (formations obligatoires, autres formations métiers,
 * formations liées au parcours / projet professionnel). On ne restitue ici ni nom ni identifiant d'agent : seulement le texte de la demande,
 * son type, et la direction / le service d'origine. L'analyse globale est confiée à l'IA locale, qui REGROUPE les demandes par thème
 * (ex. « management » et « encadrement » ; « Word » et « Excel » → bureautique) ; les comptes sont recalculés ici, pas par l'IA.
 */
const { pgDb } = require('../../shared/database');
const svc = require('./entretiens.service');

const TYPES = [
    { key: 'obligatoires', label: 'Formations obligatoires (statutaires et réglementaires)' },
    { key: 'metiers', label: 'Autres formations métiers' },
    { key: 'parcours', label: 'Formations liées au parcours / projet professionnel' },
];

const clean = (v) => String(v || '').replace(/\s+/g, ' ').trim();
const isVide = (t) => !t || /^(n[ée]ant|ras|rien|aucune?|non|-|\/|\.)$/i.test(t.trim());

/** Demandes de la campagne : [{ type, direction, service, texte }], sans aucune donnée nominative. */
async function listDemandes(campaignId) {
    const rows = await pgDb.all(
        `SELECT e.id, e.source, e.direction, e.service, e.agent_matricule, e.crep, e.evaluation_statut
         FROM hub_entretiens.entretiens e
         WHERE e.campaign_id = ? AND e.deleted_at IS NULL AND e.crep IS NOT NULL`, [campaignId]);
    let withInfo = rows;
    try { withInfo = await require('../ep-base/ep-base.service').attachInfo(rows); } catch (e) { /* repli : colonnes de l'entretien */ }
    const out = [];
    for (const r of withInfo) {
        const crep = typeof r.crep === 'string' ? JSON.parse(r.crep) : (r.crep || {});
        const f = crep.formations || {};
        // direction \ service \ secteur (base des agents) sinon colonnes de l'entretien
        const seg = String(r.chemin || '').split('\\').map(x => x.trim()).filter(Boolean);
        const direction = seg[0] || clean(r.direction) || 'Non renseignée';
        const service = seg[1] || (clean(r.service) && clean(r.service) !== direction ? clean(r.service) : '') || '(sans service)';
        for (const t of TYPES) {
            const texte = clean(f[t.key]);
            if (!isVide(texte)) out.push({ type: t.key, direction, service, texte, valide: r.evaluation_statut === 'soumis' });
        }
    }
    // Mode simulation : demandes fictives (jamais enregistrées) pour pouvoir tester la vue et l'analyse.
    try {
        const sim = require('./simulation');
        if (await sim.isOn()) out.push(...await sim.demandesFictives());
    } catch (e) { console.warn('[ENTRETIENS] demandes fictives:', e.message); }
    return out;
}

/** Agrège par direction → service → type (comptes et textes). */
function grouper(demandes) {
    const dirs = new Map();
    for (const d of demandes) {
        if (!dirs.has(d.direction)) dirs.set(d.direction, { direction: d.direction, total: 0, services: new Map() });
        const D = dirs.get(d.direction);
        if (!D.services.has(d.service)) D.services.set(d.service, { service: d.service, total: 0, types: { obligatoires: [], metiers: [], parcours: [] } });
        const S = D.services.get(d.service);
        S.types[d.type].push(d.texte);
        S.total++; D.total++;
    }
    return [...dirs.values()].sort((a, b) => a.direction.localeCompare(b.direction, 'fr')).map(D => ({
        direction: D.direction, total: D.total,
        services: [...D.services.values()].sort((a, b) => a.service.localeCompare(b.service, 'fr')),
    }));
}

// ─── Analyse globale par l'IA locale (tâche de fond, résultat conservé) ──────────────────────────────────────
const SETTING = 'formations_analysis';
let running = null;

async function lastAnalysis(campaignId) {
    try {
        const raw = await svc.getSetting(SETTING);
        const a = raw ? JSON.parse(raw) : null;
        if (a && a.campaign_id === campaignId) return a;
    } catch (e) { /* aucune analyse */ }
    return null;
}

function parseJson(out) {
    const t = String(out || '').replace(/<think>[\s\S]*?<\/think>/g, '');
    const a = t.indexOf('{'), b = t.lastIndexOf('}');
    if (a < 0 || b <= a) throw new Error('Réponse de l’IA illisible.');
    return JSON.parse(t.slice(a, b + 1));
}

async function runAnalysis(campaignId, demandesOverride) {
    const t0 = Date.now();
    const demandes = demandesOverride || await listDemandes(campaignId);
    if (!demandes.length) return { campaign_id: campaignId, generated_at: new Date().toISOString(), duration_ms: 0, nb_demandes: 0, themes: [], synthese: 'Aucune demande de formation dans les comptes rendus de cette campagne.' };
    const apm = require('../../shared/apm_ai');
    const model = await require('./ai.service').pickApmModel(apm);
    const pas = demandes.length / 600;
    const items = demandes.length > 600 ? Array.from({ length: 600 }, (_, i) => demandes[Math.floor(i * pas)]) : demandes; // échantillon régulier (toutes directions représentées)

    const prompt = 'Voici des demandes de formation, anonymes, issues des entretiens professionnels d’une mairie. Chaque ligne : numéro | type | direction | texte libre (parfois plusieurs formations, parfois en abrégé).\n'
        + 'Ta tâche : REGROUPER ces demandes en thèmes de besoins cohérents, pour préparer le plan de formation. Exemples de regroupements attendus : « management », « encadrement », « animer une équipe » → thème « Management et encadrement » ; '
        + '« Word », « Excel », « bureautique » → thème « Bureautique » ; « Sedit », « logiciel financier », « comptabilité M57 » → « Finances et comptabilité publique » ; « RGPD », « sécurité informatique » → « Numérique, sécurité et données ».\n'
        + 'Règles : regroupe par SUJET DE FORMATION (le contenu), JAMAIS par direction ni par type : une même formation demandée par deux directions va dans le même thème ; chaque ligne est classée dans UN seul thème ; 4 à 15 thèmes, nommés clairement. '
        + 'Thèmes usuels, à adapter selon les demandes : Bureautique (Word, Excel, outils numériques du quotidien) ; Management et encadrement ; Finances, marchés publics et comptabilité publique ; Numérique, sécurité informatique et protection des données ; '
        + 'Santé, sécurité et habilitations (secourisme, électricité, CACES, gestes et postures) ; Accueil et relation aux usagers ; Préparation aux concours et évolution de carrière ; Animation, éducation et petite enfance ; Ressources humaines et juridique ; Techniques métier spécifiques. '
        + 'Un thème « Autres » seulement pour ce qui ne rentre vraiment nulle part ; ne cite JAMAIS de nom de personne ; ne modifie pas le sens.\n'
        + 'Réponds UNIQUEMENT par un JSON : {"themes":[{"theme":"nom du thème","description":"une phrase","items":[numéros des lignes]}]}\n\n'
        + items.map((d, i) => `${i + 1} | ${d.type} | ${d.direction} | ${d.texte.slice(0, 160)}`).join('\n');
    const j = parseJson(await apm.queryAi(prompt, model, { max_tokens: 6000, temperature: 0.1 }));

    // Comptes recalculés ici (l'IA ne fait que le classement)
    const seen = new Set();
    const themes = (Array.isArray(j.themes) ? j.themes : []).map(th => {
        const idx = (Array.isArray(th.items) ? th.items : []).map(Number).filter(n => n >= 1 && n <= items.length && !seen.has(n));
        idx.forEach(n => seen.add(n));
        const its = idx.map(n => items[n - 1]);
        const types = { obligatoires: 0, metiers: 0, parcours: 0 };
        const dirs = {};
        for (const d of its) { types[d.type]++; dirs[d.direction] = (dirs[d.direction] || 0) + 1; }
        return {
            theme: clean(th.theme) || 'Autres', description: clean(th.description), nb: its.length, types,
            directions: Object.entries(dirs).sort((a, b) => b[1] - a[1]).map(([direction, nb]) => ({ direction, nb })),
            exemples: [...new Set(its.map(d => d.texte))].slice(0, 6),
        };
    }).filter(t => t.nb > 0);
    const reste = items.filter((_, i) => !seen.has(i + 1));
    if (reste.length) themes.push({ theme: 'Non classées', description: 'Demandes que l’IA n’a pas pu rattacher à un thème.', nb: reste.length, types: { obligatoires: 0, metiers: 0, parcours: 0 }, directions: [], exemples: [...new Set(reste.map(d => d.texte))].slice(0, 6) });
    themes.sort((a, b) => b.nb - a.nb);

    let synthese = '';
    try {
        const p2 = 'Voici la répartition des besoins de formation d’une mairie, issue des entretiens professionnels (données agrégées et anonymes) :\n'
            + themes.map(t => `- ${t.theme} : ${t.nb} demande(s) (obligatoires ${t.types.obligatoires}, métiers ${t.types.metiers}, parcours ${t.types.parcours}) ; directions les plus concernées : ${t.directions.slice(0, 3).map(d => d.direction).join(', ') || '—'}`).join('\n')
            + '\n\nRédige en 5 à 8 lignes, pour la DRH, une synthèse des BESOINS GLOBAUX : les 3 priorités, les besoins transversaux (qui pourraient être mutualisés en formation intra), les besoins propres à certaines directions. Les thèmes sont déjà classés du plus au moins demandé : respecte cet ordre pour les priorités. N’écris AUCUN chiffre (les chiffres sont affichés à part) ; parle de « thèmes les plus demandés ». Utilise le terme « demandes de formation ». Ne cite aucun nom de personne. Français professionnel et correct, en un seul paragraphe continu : sans titre, sans numérotation, sans liste à puces, sans mot anglais.';
        synthese = clean(await apm.queryAi(p2, model, { max_tokens: 900, temperature: 0.3 }));
    } catch (e) { synthese = ''; }
    return {
        campaign_id: campaignId, generated_at: new Date().toISOString(), duration_ms: Date.now() - t0, model,
        nb_demandes: demandes.length, nb_analysees: items.length, themes, synthese,
    };
}

/** Lance l'analyse en tâche de fond (une seule à la fois) ; renvoie l'état. */
function startAnalysis(campaignId) {
    if (running && running.status === 'en_cours') return running;
    running = { status: 'en_cours', campaign_id: campaignId, started_at: Date.now() };
    const cur = running;
    runAnalysis(campaignId)
        .then(async (res) => { await svc.setSetting(SETTING, JSON.stringify(res)); cur.status = 'termine'; cur.finished_at = Date.now(); })
        .catch((e) => { console.error('[ENTRETIENS] analyse des formations:', e.message); cur.status = 'echec'; cur.error = e.message; cur.finished_at = Date.now(); });
    return cur;
}

const state = () => (running ? { status: running.status, campaign_id: running.campaign_id, started_at: running.started_at, finished_at: running.finished_at || null, error: running.error || null } : null);

module.exports = { TYPES, listDemandes, grouper, lastAnalysis, startAnalysis, state, runAnalysis };
