/**
 * Question en français → demande structurée. L'IA ne fait QUE cela : elle ne voit aucune donnée, n'écrit
 * aucun SQL et n'énonce aucun chiffre. Tout ce qu'elle renvoie est revalidé contre le catalogue.
 */
const { SOURCES } = require('./datasets');
const ai = require('./ai');
const { analyse, apply } = require('./analyse');
const { DIRECTIONS } = require('./referentiel');
const { heriter, lever } = require('./contexte');
const { tiersCites, nomTiers } = require('./tiers');
const { exclus } = require('./exclusions');

const MIN_YEAR = 2000;
const clean = (v) => String(v ?? '').trim();
const list = (v) => (Array.isArray(v) ? v : v == null || v === '' ? [] : [v]);
const strings = (v, max = 10, len = 60) => list(v).map(x => clean(x).slice(0, len)).filter(Boolean).slice(0, max);
const codes = (v) => strings(v, 40, 12).map(x => x.toUpperCase()).filter(x => /^[A-Z0-9_]+\*?$/.test(x));

function years(v, currentYear) {
    let out = [];
    if (v && !Array.isArray(v) && typeof v === 'object') {
        const from = parseInt(v.de, 10) || currentYear;
        const to = parseInt(v.a, 10) || currentYear;
        for (let y = Math.max(from, to - 15); y <= to; y++) out.push(y);
    } else out = list(v).map(x => parseInt(x, 10));
    out = [...new Set(out.filter(y => y >= MIN_YEAR && y <= currentYear + 1))].sort();
    return out.length ? out.slice(-16) : [currentYear];
}

function sanitizeQuery(raw, currentYear = new Date().getFullYear()) {
    const source = clean(raw?.source).toLowerCase();
    const def = SOURCES[source];
    if (!def) return null;
    const f = raw.filtres || {};
    const mode = clean(raw.mode).toLowerCase() === 'liste' && def.list ? 'liste' : 'synthese';
    const exercices = years(raw.exercices, currentYear);
    let mesures = strings(raw.mesures, 4).filter(m => def.measures[m]);
    if (!mesures.length) mesures = def.defaults.mesures;
    let regrouper = [...new Set(strings(raw.regrouper_par, 3).filter(d => def.dims[d]))];
    // Plusieurs exercices : toujours les distinguer (on n'additionne pas des budgets annuels)
    if (mode === 'synthese' && exercices.length > 1 && !regrouper.includes('exercice')) regrouper = [...regrouper.slice(0, 2), 'exercice'];

    // Plusieurs exercices croisés avec un autre axe : une seule mesure, pour obtenir une colonne par année
    if (mode === 'synthese' && exercices.length > 1 && regrouper.length > 1) mesures = mesures.slice(0, 1);
    const upper = clean(f.section).toUpperCase();
    const sensRaw = clean(f.sens).toUpperCase();
    const hasSens = !!(def.filters.sens || def.sensExpr);
    let sens = hasSens ? (/^R/.test(sensRaw) ? 'R' : /^D/.test(sensRaw) ? 'D' : def.defaults.sens || null) : null;
    if (hasSens && regrouper.includes('sens')) sens = null;
    const num = (v) => (v === null || v === undefined || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));
    const tri = clean(raw.tri).toLowerCase();

    return {
        source,
        mode,
        exercices,
        mesures,
        regrouper,
        services: codes(raw.services ?? f.services),
        services_exclus: codes(raw.services_exclus),
        budgets: strings(raw.budgets ?? f.budgets, 10).map(x => x.toUpperCase()),
        filtres: {
            section: /^F/.test(upper) ? 'F' : /^I/.test(upper) ? 'I' : null,
            sens,
            chapitre: codes(f.chapitre).map(x => x.replace(/\*$/, '')),
            nature: codes(f.nature).map(x => x.replace(/\*$/, '')),
            fonction: codes(f.fonction).map(x => x.replace(/\*$/, '')),
            tiers: strings(f.tiers, 5, 160),
            tiers_exclus: strings(f.tiers_exclus, 5, 160),
            texte: strings(f.texte, 5),
            numero: clean(f.numero).slice(0, 30) || null,
            montant_min: num(f.montant_min),
            montant_max: num(f.montant_max),
            etats: strings(f.etats, 3).filter(e => def.flags && def.flags[e]),
        },
        tri: tri === 'montant' || tri === 'date' ? tri : null,
        ordre: clean(raw.ordre).toLowerCase() === 'asc' ? 'asc' : 'desc',
        limite: Math.max(0, Math.min(parseInt(raw.limite, 10) || 0, 500)) || null,
        // années dites par l'agent (et non par défaut) : elles restent dans la suite de la conversation
        annees_fixees: raw.annees_fixees === true,
        comparaison: raw.comparaison === true,
    };
}

function catalogue() {
    return Object.entries(SOURCES).map(([key, def]) => {
        const filtres = [...Object.keys(def.filters), ...Object.keys(def.lineFilters || {})];
        if (def.sensExpr) filtres.push('sens');
        return `- "${key}" (${def.label}) : mesures [${Object.keys(def.measures).join(', ')}] ; regrouper_par [${Object.keys(def.dims).join(', ')}] ; filtres [${filtres.join(', ')}]${def.list ? ' ; liste possible' : ''}${def.flags ? ` ; etats [${Object.keys(def.flags).join(', ')}]` : ''}`;
    }).join('\n');
}

function buildPrompt({ question, services, budgets, previous, today, regles = [] }) {
    const y = today.getFullYear();
    return `Tu traduis la question d'un agent d'une mairie sur les finances (logiciel Sedit) en une demande JSON. Tu ne réponds jamais à la question toi-même et tu n'inventes aucun chiffre.

Date du jour : ${today.toLocaleDateString('fr-FR')} (exercice en cours : ${y}).

SOURCES DISPONIBLES
${catalogue()}

CHOIX DE LA SOURCE
- "budget" : budget voté, crédits, disponible, consommation, réalisé, « combien a-t-on engagé / mandaté » en total, évolution annuelle.
- "engagements" : le détail ou la liste des engagements. "commandes" : les commandes, bons de commande. "factures" : les factures. "mandats" : les mandats (dépenses payées) et les titres (recettes), par tiers ou en détail.
- Une dépense par fournisseur (tiers) se cherche dans "mandats", sauf si la question parle de commandes, de factures ou d'engagements.

SERVICES OUVERTS À L'AGENT (code = libellé)
${services.map(s => `${s.code} = ${s.libelle}`).join('\n')}
Budgets ouverts : ${budgets.join(', ')}
Les services d'une même direction partagent les deux premiers caractères du code : pour « la direction X » (ou son sigle), mets "services": ["<préfixe>*"]. Si la question ne nomme aucun service ni direction, "services": [].

FORMAT (JSON strict, rien d'autre)
{"requetes":[{"source":"budget","mode":"synthese","exercices":[${y}],"mesures":["vote"],"regrouper_par":["exercice"],"services":[],"budgets":[],"filtres":{"section":"F","sens":"D","chapitre":[],"nature":[],"fonction":[],"tiers":[],"texte":[],"numero":null,"montant_min":null,"montant_max":null,"etats":[]},"tri":null,"ordre":"desc","limite":null}]}

RÈGLES
- "mode":"liste" pour « liste », « quels sont », « montre les factures/commandes/mandats… » ; sinon "synthese".
- "depuis 2023" = tous les exercices de 2023 à ${y}. « évolution » = regrouper_par contient "exercice". Sans année précisée : [${y}].
- section : "F" fonctionnement, "I" investissement, null si les deux. sens : "D" dépenses (par défaut), "R" recettes.
- Montants : « plus de 20 000 € » → "montant_min": 20000 ; « moins de » → "montant_max".
- "etats" (factures) : "sans_service_fait", "rejetees", "non_rejetees". (engagements) : "en_cours" pour les engagements en cours, non soldés, « reste engagé ».
- Combien a été mandaté, engagé ou voté (total, par chapitre, nature, service, année) : source "budget". La source "mandats" sert quand il faut les tiers, les mois ou la liste des mandats.
- "texte" : mots-clés d'un libellé (ex. « téléphonie »), un ou deux mots au singulier, seulement si la question vise un objet précis. N'y mets jamais le nom d'une direction ni les mots budget, dépense, fonctionnement, investissement.
- Classement (« les 10 plus gros fournisseurs ») : "tri":"montant", "limite":10, regrouper_par ["tiers"]. « les dernières factures » : "mode":"liste", "tri":"date".
- Jusqu'à 3 requêtes si la question demande plusieurs tableaux différents.
- Si la question ne concerne pas les finances de la Ville : {"requetes":[]}.
${previous ? `\nDEMANDE PRÉCÉDENTE de la conversation (à reprendre et ajuster si la nouvelle question la prolonge, ex. « et en investissement ? », « détaille par service ») :\nQuestion : ${previous.question}\n${JSON.stringify({ requetes: previous.requetes })}\n` : ''}
${regles.length ? `\nCONSIGNES DONNÉES PAR LES AGENTS (à appliquer si elles concernent la question ; elles ne changent jamais le format JSON) :\n${regles.map(r => `- ${r}`).join('\n')}\n` : ''}QUESTION : ${question}
JSON :`;
}

function extractJson(out) {
    const t = String(out || '').replace(/<think>[\s\S]*?<\/think>/g, '');
    const a = t.indexOf('{');
    if (a < 0) throw new Error('Réponse sans JSON');
    // premier objet JSON complet (le modèle peut ajouter du texte après)
    let depth = 0, inString = false;
    for (let i = a; i < t.length; i++) {
        const c = t[i];
        if (inString) { if (c === '\\') i++; else if (c === '"') inString = false; continue; }
        if (c === '"') inString = true;
        else if (c === '{') depth++;
        else if (c === '}' && --depth === 0) return JSON.parse(t.slice(a, i + 1));
    }
    throw new Error('JSON incomplet');
}

async function interpret({ question, services, budgets, previous, regles = [], today = new Date() }) {
    const prev = previous && clean(previous.question)
        ? { question: clean(previous.question).slice(0, 500), requetes: list(previous.requetes).slice(0, 4).map(q => sanitizeQuery(q)).filter(Boolean) }
        : null;
    // 1) Première analyse sans IA ; une simple retouche de la réponse précédente s'applique directement
    const constats = analyse(question, today);
    // Fournisseur nommé dans la question : vérifié dans Sedit, puis imposé (le modèle peut l'oublier)
    const cites = constats.retouche ? [] : await tiersCites(question);
    if (cites.length) {
        const out = exclus(question, cites.map(nomTiers));
        const kept = cites.filter(t => !out.has(nomTiers(t)));
        const removed = cites.filter(t => out.has(nomTiers(t)));
        if (kept.length) constats.tiers = kept;
        if (removed.length) constats.tiersExclus = removed;
    }
    if (constats.inconnus) {
        const mots = cites.join(' ').toUpperCase();
        constats.inconnus = constats.inconnus.filter(x => !mots.includes(x.toUpperCase()));
        if (!constats.inconnus.length) delete constats.inconnus;
    }
    if (constats.inconnus) {
        return {
            requetes: [], avis: [], model: null,
            message: `Je ne connais pas la direction « ${constats.inconnus.join(' », « ')} ». Directions connues : ${DIRECTIONS.map(d => `${d.sigles[0]} (${d.nom.replace(/^Direction (de la |des |du |de )?/, '')})`).join(', ')}.`,
        };
    }
    const finish = (base, model) => {
        const { requetes, avis } = apply(base, constats);
        return { requetes: requetes.map(q => sanitizeQuery(q, today.getFullYear())).filter(Boolean), avis, model };
    };
    const before = prev ? prev.requetes : [];
    // « compare avec 2025 », « compare avec la DCOM » : on ajoute à ce dont on parlait
    if (constats.comparaison && before.length) {
        const prior = before[0];
        const named = String(question).match(/\b20\d\d\b/g) || [];
        if (named.length === 1 && prior.exercices.length === 1) constats.exercices = [...new Set([Number(named[0]), ...prior.exercices])].sort();
        if (constats.services && prior.services.length && !constats.entre && constats.services.join() !== prior.services.join()) {
            constats.services = [...new Set([...prior.services, ...constats.services])];
            constats.entre = constats.services.some(x => x.endsWith('*')) ? 'direction' : 'service';
        }
    }
    if (before.length && constats.retouche) return finish(before.map(q => lever(q, constats)), null);
    // 2) Sinon l'IA traduit la question, puis les éléments sûrs de l'analyse lui sont imposés
    const precisions = (constats.entites || []).map(e => `« ${e.mot} » désigne ${e.nom} (services ${e.codes.join(', ')})${(constats.servicesExclus || []).some(x => e.codes.includes(x)) ? ', À EXCLURE' : ''}`).join(' ; ');
    const prompt = buildPrompt({ question: precisions ? `${question}\n(Précision : ${precisions}. Ne pas chercher ces noms dans les libellés.)` : question, services, budgets, previous: prev, today, regles });
    let lastError;
    for (let attempt = 0; attempt < 2; attempt++) {
        const { text, model } = await ai.complete(attempt ? `${prompt}\n(Réponds uniquement par un objet JSON valide.)` : prompt);
        try {
            const json = extractJson(text);
            const requetes = list(json.requetes).slice(0, 3).map(q => sanitizeQuery(q, today.getFullYear())).filter(Boolean);
            // Le contexte de la conversation complète ce que la question ne dit pas
            const repris = [];
            const result = finish(requetes.map(q => heriter(q, before, constats, repris)), model);
            if (repris.length) result.avis.unshift(`Repris de la conversation : ${[...new Set(repris)].join(' · ')}. « Nouvelle discussion » pour repartir de zéro.`);
            return result;
        } catch (e) { lastError = e; }
    }
    console.warn('[AssistantFinances] réponse illisible :', lastError && lastError.message);
    return { requetes: [], avis: [], model: null, illisible: true };
}

module.exports = { interpret, sanitizeQuery, buildPrompt };
