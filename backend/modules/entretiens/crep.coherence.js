/**
 * Cohérence du compte-rendu d'entretien (CREP) :
 *  - summarizeCrep : résumé texte de TOUT ce que l'évaluateur a saisi (transmis à l'IA locale) ;
 *  - coherenceIssues : contrôles déterministes entre la grille d'appréciation, les niveaux des objectifs
 *    et l'appréciation générale (fiables, sans IA).
 */
const { CRITERIA_GROUPS, LEVELS, normalizeCrep, groupsOf } = require('./crep.definition');

const LEVEL_TEXT = { S: 'Satisfaisant', AS: 'Assez satisfaisant', I: 'Insuffisant' };
const NIVEAU_TEXT = { A: 'Atteint', PA: 'Partiellement atteint', NA: 'Non atteint' };

const has = (v) => String(v || '').trim() !== '';

/** Résumé lisible de l'ensemble du compte rendu, pour l'IA (rubriques vides omises). */
function summarizeCrep(input, entretien, definition) {
    const c = normalizeCrep(input, definition);
    const out = [];
    const agent = entretien ? `${entretien.agent_prenom || ''} ${entretien.agent_nom || ''}`.trim() : '';
    if (agent) out.push(`Agent évalué : ${agent}${entretien.poste ? ` — ${entretien.poste}` : ''}`);
    if (c.grade) out.push(`Grade : ${c.grade}`);
    if (has(c.missions)) out.push(`Missions : ${c.missions.trim()}`);

    const objs = c.objectifs_ecoules.filter(o => has(o.objectif));
    if (objs.length) {
        out.push('Bilan des objectifs de l’année écoulée :');
        objs.forEach((o, i) => out.push(`- Objectif ${i + 1} : ${o.objectif.trim().replace(/\n+/g, ' / ')} → niveau : ${o.niveau ? NIVEAU_TEXT[o.niveau] : 'non renseigné'}${has(o.observations) ? ` ; observations : ${o.observations.trim().replace(/\n+/g, ' ')}` : ''}`));
    }
    if (has(c.observations_complementaires)) out.push(`Observations complémentaires : ${c.observations_complementaires.trim().replace(/\n+/g, ' ')}`);

    const grid = [];
    for (const g of groupsOf(definition)) {
        for (const it of g.items) {
            const v = c.valeur[it.key];
            if (v) grid.push(`- ${g.title ? `${g.title} — ` : ''}${it.label} : ${LEVEL_TEXT[v]}`);
        }
    }
    if (grid.length) { out.push('Appréciation de la valeur professionnelle (grille) :'); out.push(...grid); }
    if (grid.length) out.unshift(...gridSynthesis(c, definition));

    if (has(c.appreciation_generale)) out.push(`Appréciation générale actuelle : ${c.appreciation_generale.trim().replace(/\n+/g, ' ')}`);
    const fut = c.objectifs_futurs.filter(o => has(o.descriptif));
    if (fut.length) {
        out.push('Objectifs de l’année à venir :');
        fut.forEach((o, i) => out.push(`- ${i + 1}. ${o.descriptif.trim().replace(/\n+/g, ' / ')}${has(o.moyens) ? ` (moyens/échéances : ${o.moyens.trim().replace(/\n+/g, ' ')})` : ''}`));
    }
    const f = c.formations;
    if (has(f.obligatoires) || has(f.metiers) || has(f.parcours)) {
        out.push(`Formations envisagées : obligatoires : ${f.obligatoires.trim() || '—'} ; métiers : ${f.metiers.trim() || '—'} ; parcours/projet : ${f.parcours.trim() || '—'}`.replace(/\n+/g, ' '));
    }
    if (has(c.evolution)) out.push(`Évolution des missions / carrière : ${c.evolution.trim().replace(/\n+/g, ' ')}`);
    if (has(c.mobilite)) out.push(`Mobilité : ${c.mobilite.trim().replace(/\n+/g, ' ')}`);
    return out.join('\n');
}

// Détection de tonalité par radicaux (insensible aux accents de bord grâce à \p{L}).
const stems = (list) => new RegExp(String.raw`(?<![\p{L}])(?:` + list.map(w => w.replace(/[’']/g, '.')).join('|') + String.raw`)\p{L}*`, 'iu');
const POSITIF = stems(['excellen', 'remarquabl', 'très bon', 'tres bon', 'exemplaire', 'brillan', 'parfaitement', 'pleinement satisfais', 'irréprochable', 'exceptionnel']);
const NEGATIF = stems(['pourri', 'nul', 'catastroph', 'désastr', 'calamit', 'médiocr', 'mauvais', 'très mauvais', 'inacceptable', 'incompéten', 'insuffisan', 'décevan', 'défaillan',
    'aucune compétence', 'aucune qualité', 'n’a aucun', 'ne répond pas', 'n’atteint pas', 'inadapté', 'lacunes importantes', 'manque de rigueur']);

/** Contrôles de cohérence fiables (sans IA). Renvoie une liste de constats lisibles. */
function coherenceIssues(input, definition) {
    const c = normalizeCrep(input, definition);
    const issues = [];

    const answered = Object.values(c.valeur);
    const nS = answered.filter(v => v === 'S').length;
    const nAS = answered.filter(v => v === 'AS').length;
    const nI = answered.filter(v => v === 'I').length;
    const total = answered.length;

    const objs = c.objectifs_ecoules.filter(o => has(o.objectif));
    const rated = objs.filter(o => o.niveau);
    const nA = rated.filter(o => o.niveau === 'A').length;
    const nNA = rated.filter(o => o.niveau === 'NA').length;
    const nPA = rated.filter(o => o.niveau === 'PA').length;

    // Objectifs vs grille
    if (rated.length && nA === rated.length && nI >= 2) {
        issues.push(`Tous les objectifs sont « Atteints » alors que ${nI} critères de la grille sont jugés « Insuffisants ».`);
    }
    if (rated.length && (nNA + nPA) === rated.length && total >= 5 && nS / total >= 0.75) {
        issues.push(`Aucun objectif n’est pleinement atteint alors que ${nS} critères sur ${total} de la grille sont jugés « Satisfaisants ».`);
    }
    objs.forEach((o, i) => {
        if ((o.niveau === 'NA' || o.niveau === 'PA') && !has(o.observations)) {
            issues.push(`Objectif ${i + 1} : niveau « ${NIVEAU_TEXT[o.niveau]} » sans observation expliquant cet écart.`);
        }
    });

    // Appréciation générale vs grille / objectifs
    if (has(c.appreciation_generale)) {
        const txt = c.appreciation_generale;
        if (NEGATIF.test(txt) && total >= 5 && nS / total >= 0.6) {
            issues.push(`L’appréciation générale est négative alors que ${nS} critères sur ${total} de la grille sont jugés « Satisfaisants ».`);
        }
        if (POSITIF.test(txt) && total >= 5 && nI / total >= 0.4) {
            issues.push(`L’appréciation générale est très positive alors que ${nI} critères sur ${total} de la grille sont jugés « Insuffisants ».`);
        }
        if (POSITIF.test(txt) && nNA >= 2) {
            issues.push(`L’appréciation générale est très positive alors que ${nNA} objectifs sont « Non atteints ».`);
        }
        if (nI >= 1 && !/\b(progress|améliorer|amélioration|axe|effort|renforcer|insuffis|vigilan|point faible|à travailler|à développer)/i.test(txt)) {
            issues.push(`${nI} critère(s) jugé(s) « Insuffisant(s) » mais l’appréciation générale ne mentionne aucun axe de progrès.`);
        }
    }
    return issues;
}

/** Synthèse explicite de la grille (niveaux, points forts, SEULS points faibles autorisés comme axes de progrès). */
function gridSynthesis(c, definition) {
    const by = { S: [], AS: [], I: [] };
    for (const g of groupsOf(definition)) for (const it of g.items) { const v = c.valeur[it.key]; if (v) by[v].push(it.label); }
    const total = by.S.length + by.AS.length + by.I.length;
    const lines = [`SYNTHÈSE DE LA GRILLE (référence absolue) : ${total} critères évalués — ${by.S.length} « Satisfaisant », ${by.AS.length} « Assez satisfaisant », ${by.I.length} « Insuffisant ».`];
    if (by.AS.length + by.I.length === 0) {
        lines.push('Aucun point faible : tous les critères sont « Satisfaisant ». Le texte doit être entièrement positif et ne mentionner AUCUN axe de progrès ni point à améliorer.');
    } else {
        lines.push(`Seuls points faibles autorisés comme axes de progrès : ${[...by.I.map(l => `${l} (insuffisant)`), ...by.AS.map(l => `${l} (assez satisfaisant)`)].join(' ; ')}.`);
    }
    return lines;
}

const PROGRES = /(améliorer|amélioration|progress|axe de|axes de|effort|renforcer|lacune|insuffisan|à travailler (?:sur|davantage|encore)|travailler sur|lieu de travailler|à développer|marges? de|gagner en|à consolider|cependant|toutefois|néanmoins|requi[èe]r\p{L}* encore|développement pour atteindre)/iu;

/**
 * Contrôle d'un texte d'appréciation générale (proposé par l'IA ou saisi) face à la grille et aux objectifs.
 * Renvoie la liste des écarts (vide si cohérent).
 */
function draftIssues(input, text) {
    const c = normalizeCrep(input);
    const issues = coherenceIssues({ ...c, appreciation_generale: text }).filter(i => /appréciation générale|axe de progrès/i.test(i));
    const answered = Object.values(c.valeur);
    const weak = answered.filter(v => v === 'AS' || v === 'I').length;
    if (answered.length >= 5 && weak === 0 && PROGRES.test(text)) {
        issues.push('Le texte évoque des axes de progrès alors que tous les critères de la grille sont « Satisfaisants ».');
    }
    if (answered.length >= 5 && weak > 0 && /(tous|toutes|l'ensemble des) (les )?crit[èe]res? (sont )?(satisfais|jug[ée]s satisfais)/i.test(text)) {
        issues.push('Le texte affirme que tous les critères sont satisfaisants alors que certains ne le sont pas.');
    }
    if (/synth[èe]se de la grille|points? faibles? (?:identifi|list)|consignes?/i.test(text)) {
        issues.push('Le texte reprend la formulation interne des consignes (« synthèse de la grille », « points faibles »…).');
    }
    return issues;
}

/** Écarts de TONALITÉ seulement (texte négatif face à une grille favorable, ou inversement) : sert à repérer des notes contradictoires. */
function sentimentIssues(input, text) {
    return coherenceIssues({ ...normalizeCrep(input), appreciation_generale: text }).filter(i => /négative|très positive/.test(i));
}

module.exports = { summarizeCrep, coherenceIssues, draftIssues, sentimentIssues };
