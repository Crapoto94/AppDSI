/**
 * Relances automatiques du module Entretiens professionnels (tâche quotidienne, jours ouvrés) :
 *  - agent : préparation non transmise alors que l'entretien a lieu dans moins de 7 jours (tous les 3 jours) ;
 *  - agent : compte rendu reçu mais non validé depuis plus de 3 jours (tous les 3 jours, 4 fois maximum) ;
 *  - évaluateur : une synthèse de ses entretiens à planifier, dont la date est dépassée, ou dont le compte rendu
 *    n'a pas été validé/envoyé (une fois par semaine).
 * Chaque envoi est tracé dans hub_entretiens.relances pour ne jamais relancer deux fois dans l'intervalle.
 */
const { pgDb } = require('../../shared/database');
const svc = require('./entretiens.service');
const email = require('./entretiens-email');

const DAY = 24 * 3600 * 1000;

async function ensureTable() {
    await pgDb.run(`CREATE TABLE IF NOT EXISTS hub_entretiens.relances (
        id SERIAL PRIMARY KEY,
        entretien_id INTEGER NOT NULL,
        kind TEXT NOT NULL,
        sent_at TIMESTAMPTZ DEFAULT NOW()
    )`);
}

async function lastSent(entretienId, kind) {
    const r = await pgDb.get(`SELECT MAX(sent_at) AS last, COUNT(*)::int AS n FROM hub_entretiens.relances WHERE entretien_id = ? AND kind = ?`, [entretienId, kind]);
    return { last: r?.last ? new Date(r.last).getTime() : 0, n: Number(r?.n || 0) };
}

async function log(entretienId, kind) {
    await pgDb.run(`INSERT INTO hub_entretiens.relances (entretien_id, kind) VALUES (?, ?)`, [entretienId, kind]);
}

/** Instant (ms) d'une date d'entretien « YYYY-MM-DDTHH:mm » (heure locale du serveur). */
const toMs = (d) => {
    const n = svc.normalizeDateTime(d);
    return n ? new Date(n).getTime() : null;
};

/**
 * @param {{dryRun?: boolean}} opts dryRun : ne rien envoyer, renvoyer ce qui serait envoyé
 */
async function runReminders({ dryRun = false } = {}) {
    await ensureTable();
    const campaign = await svc.getCurrentCampaign();
    const result = { campaign: campaign?.annee || null, agentPreparation: 0, agentValidation: 0, evaluateurs: 0, erreurs: 0, details: [] };
    if (!campaign) return result;

    const { sendParapheurEmail } = require('../parapheur/parapheur.service');
    const linkAgent = await email.entretiensUrl('moi');
    const linkEval = await email.entretiensUrl('evaluations');
    const rows = await svc.listEntretiens({ campaignId: campaign.id });
    const now = Date.now();
    const nameOf = (r) => svc.fullName(r.agent_prenom, r.agent_nom) || r.agent_email || 'Agent';
    const epBeta = require('../../shared/ep-beta-mail');
    const send = async (to, tpl, label, row) => {
        if (row && !(await epBeta.allowedForEntretien(row, to, 'relance'))) return false;
        result.details.push(`${label} → ${to}`);
        if (dryRun) return true;
        try { await sendParapheurEmail(to, tpl); return true; }
        catch (e) { result.erreurs++; console.warn('[ENTRETIENS RELANCES] envoi échoué:', e.message); return false; }
    };

    // 1) Agent : préparation à transmettre (entretien dans moins de 7 jours)
    for (const r of rows) {
        if (['realise', 'cloture'].includes(r.statut) || r.preparation_statut === 'soumis' || !r.agent_email) continue;
        const t = toMs(r.date_entretien);
        if (!t || t < now || t - now > 7 * DAY) continue;
        const ls = await lastSent(r.id, 'prep_agent');
        if (now - ls.last < 3 * DAY) continue;
        if (await send(r.agent_email, email.relancePreparation({ agent: nameOf(r), annee: campaign.annee, quand: svc.formatDateTimeFr(r.date_entretien), link: linkAgent }), `Préparation ${nameOf(r)}`, r)) {
            if (!dryRun) await log(r.id, 'prep_agent');
            result.agentPreparation++;
        }
    }

    // 2) Agent : compte rendu à valider (envoyé depuis plus de 3 jours)
    for (const r of rows) {
        if (r.crep_statut !== 'envoye_agent' || !r.agent_email || !r.crep_sent_at) continue;
        if (now - new Date(r.crep_sent_at).getTime() < 3 * DAY) continue;
        const ls = await lastSent(r.id, 'valid_agent');
        if (ls.n >= 4 || now - ls.last < 3 * DAY) continue;
        if (await send(r.agent_email, email.relanceValidation({ agent: nameOf(r), annee: campaign.annee, evaluateur: r.evaluator_nom, link: linkAgent }), `Validation ${nameOf(r)}`, r)) {
            if (!dryRun) await log(r.id, 'valid_agent');
            result.agentValidation++;
        }
    }

    // 3) Évaluateur : synthèse hebdomadaire
    const betaOk = (e) => betaSet.has(e);
    const betaSet = new Set();
    for (const r of rows) {
        const e = String(r.evaluator_email || '').toLowerCase();
        if (r.source === 'ville' && e && !betaSet.has(e) && await epBeta.allowed(e)) betaSet.add(e);
    }
    const byEvaluator = new Map();
    const push = (r, section, detail) => {
        const key = String(r.evaluator_email || '').toLowerCase();
        if (!key) return;
        if (r.source === 'ville' && !betaOk(key)) return;
        if (!byEvaluator.has(key)) byEvaluator.set(key, { name: r.evaluator_nom || key, to: r.evaluator_email, plan: [], late: [], cr: [], ids: [] });
        const g = byEvaluator.get(key);
        g[section].push({ agent: nameOf(r), detail });
        g.ids.push(r.id);
    };
    for (const r of rows) {
        if (r.statut === 'cloture') continue;
        const t = toMs(r.date_entretien);
        if (r.statut === 'realise') {
            // compte rendu à valider ou à envoyer à l'agent (entretien réalisé depuis plus de 3 jours)
            const lacking = r.evaluation_statut !== 'soumis' ? 'compte rendu à rédiger et valider' : (r.crep_statut === 'non_envoye' ? 'compte rendu à envoyer à l’agent' : null);
            if (lacking && t && now - t > 3 * DAY) push(r, 'cr', lacking);
        } else if (!r.date_entretien) {
            // Pas de relance la première semaine : l'évaluateur vient d'être prévenu à sa désignation.
            if (r.created_at && now - new Date(r.created_at).getTime() < 7 * DAY) continue;
            push(r, 'plan', 'rendez-vous à planifier');
        } else if (t && t < now - DAY) {
            push(r, 'late', `date dépassée (${svc.formatDateTimeFr(r.date_entretien)}) : à finaliser`);
        }
    }
    for (const g of byEvaluator.values()) {
        const ids = [...new Set(g.ids)];
        let due = false;
        for (const id of ids) { if (now - (await lastSent(id, 'eval_digest')).last >= 7 * DAY) { due = true; break; } }
        if (!due) continue;
        const tpl = email.relanceEvaluateur({
            evaluateur: g.name, annee: campaign.annee, link: linkEval,
            sections: [{ title: 'À planifier', items: g.plan }, { title: 'Date dépassée', items: g.late }, { title: 'Compte rendu à traiter', items: g.cr }],
        });
        if (await send(g.to, tpl, `Synthèse évaluateur ${g.name}`)) {
            if (!dryRun) for (const id of ids) await log(id, 'eval_digest');
            result.evaluateurs++;
        }
    }
    return result;
}

module.exports = { runReminders };
