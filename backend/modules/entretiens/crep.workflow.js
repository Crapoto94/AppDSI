/**
 * Circuit du compte-rendu d'entretien (CREP) après la tenue de l'entretien :
 *   non_envoye  → l'évaluateur rédige puis valide le compte rendu (entretien « réalisé »)
 *   envoye_agent → « Envoyer à l'agent » : l'agent relit tout, renseigne ses 2 champs réservés
 *   en_signature → l'agent valide : le PDF part au parapheur pour co-signature agent + évaluateur
 *                  (signature simple, sans QR code)
 * La date de notification à l'agent = date d'envoi ; les dates de signature affichées = date de validation de l'agent.
 */
const { pgDb } = require('../../shared/database');
const svc = require('./entretiens.service');
const { normalizeCrep } = require('./crep.definition');
const { buildCrepPdf } = require('./crep-pdf.service');

// Position des deux cadres de signature (page 4 du PDF, centre du cadre en % de la page) — cf. crep-pdf.service.js.
const SIG_PAGE = 4;
const SIG_W = 250;
const SIG_H = 54;
const SIG_Y_PCT = (606 / 841.89) * 100;
const AGENT_POS = { documentIndex: 0, page: SIG_PAGE, x: (163.8 / 595.28) * 100, y: SIG_Y_PCT, w: SIG_W, h: SIG_H };
const EVALUATOR_POS = { documentIndex: 0, page: SIG_PAGE, x: (431.3 / 595.28) * 100, y: SIG_Y_PCT, w: SIG_W, h: SIG_H };

const err = (status, message) => ({ status, message });

async function sendToAgent({ row, access }) {
    if (!(access.isEvaluator || access.isAdmin)) throw err(403, 'Seul l’évaluateur peut envoyer le compte rendu à l’agent.');
    if (row.crep_statut && row.crep_statut !== 'non_envoye') throw err(409, 'Le compte rendu a déjà été envoyé à l’agent.');
    if (row.statut !== 'realise' || row.evaluation_statut !== 'soumis') throw err(400, 'Validez d’abord le compte rendu : l’entretien doit être marqué « réalisé ».');
    if (!row.agent_email) throw err(400, 'L’adresse e-mail de l’agent est inconnue : impossible de lui envoyer le compte rendu.');

    await pgDb.run(`UPDATE hub_entretiens.entretiens SET crep_statut = 'envoye_agent', crep_sent_at = NOW(), updated_at = NOW() WHERE id = ?`, [row.id]);

    let mail = { ok: true };
    try {
        const { sendParapheurEmail } = require('../parapheur/parapheur.service');
        const email = require('./entretiens-email');
        const campaign = await pgDb.get('SELECT annee FROM hub_entretiens.campaigns WHERE id = ?', [row.campaign_id]);
        await sendParapheurEmail(row.agent_email, email.compteRenduEnvoye({
            agent: svc.fullName(row.agent_prenom, row.agent_nom) || 'Madame, Monsieur',
            annee: campaign?.annee,
            evaluateur: row.evaluator_nom || row.evaluator_email,
            link: await email.entretiensUrl(),
        }));
    } catch (e) {
        mail = { ok: false, error: e.message };
    }
    return mail;
}

async function agentValidate({ row, access, body, actor, req }) {
    if (!access.isAgent) throw err(403, 'Seul l’agent concerné peut valider son compte rendu.');
    if (row.crep_statut !== 'envoye_agent') throw err(409, row.crep_statut === 'en_signature' ? 'Ce compte rendu a déjà été validé et transmis en signature.' : 'Le compte rendu ne vous a pas encore été envoyé.');
    if (!row.evaluator_email) throw err(400, 'L’adresse e-mail de l’évaluateur est inconnue : impossible de constituer le circuit de signature.');
    if (body?.validate !== true) throw err(400, 'Confirmation de validation requise.');
    // Les deux observations de l'agent sont obligatoires pour valider (indiquer « Néant » si rien à signaler).
    if (!String(body?.obs_agent_conditions || '').trim()) throw err(400, 'Renseignez vos observations sur les conditions de travail et le fonctionnement du service (« Néant » si rien à signaler).');
    if (!String(body?.obs_agent_entretien || '').trim()) throw err(400, 'Renseignez vos observations sur l’entretien (« Néant » si rien à signaler).');

    // 1) Observations réservées à l'agent + date de validation (= date de signature affichée sur le document)
    const crep = normalizeCrep({
        ...(row.crep || {}),
        obs_agent_conditions: body.obs_agent_conditions,
        obs_agent_entretien: body.obs_agent_entretien,
    });
    await pgDb.run(
        `UPDATE hub_entretiens.entretiens SET crep = CAST(? AS jsonb), crep_agent_validated_at = NOW(), updated_at = NOW() WHERE id = ?`,
        [JSON.stringify(crep), row.id]
    );
    const fresh = await svc.getEntretienById(row.id);

    // 2) PDF du document (4 pages) avec dates de notification et de signature
    const campaign = await pgDb.get('SELECT annee FROM hub_entretiens.campaigns WHERE id = ?', [fresh.campaign_id]);
    const annee = campaign?.annee || '';
    const pdf = await buildCrepPdf(fresh, annee);
    const agentName = svc.fullName(fresh.agent_prenom, fresh.agent_nom);
    const filename = `CREP-${annee}-${agentName}`.replace(/[^\w\-]+/g, '_') + '.pdf';

    // 3) Envoi au parapheur : co-signature agent + évaluateur, signature simple, sans QR code
    const parapheur = require('../parapheur/parapheur.service');
    const agentEmail = String(fresh.agent_email || actor.email || '').toLowerCase();
    const evaluatorEmail = String(fresh.evaluator_email).toLowerCase();
    const signataires = [{
        nom: agentName, email: agentEmail, service: fresh.service || null, title: 'Agent', signatureMode: 'simple', positions: [AGENT_POS],
    }];
    // Toujours deux signataires distincts (un cadre chacun) : le parapheur n'accepte qu'une position par signataire et par
    // document. Si l'agent est aussi son propre évaluateur (cas de test), la même personne signe donc deux fois.
    signataires.push({
        nom: fresh.evaluator_nom || evaluatorEmail, email: evaluatorEmail, title: 'Évaluateur (N+1)', signatureMode: 'simple', positions: [EVALUATOR_POS],
    });
    const created = await parapheur.createParapheur({
        files: [{ buffer: pdf, originalname: filename, mimetype: 'application/pdf', size: pdf.length }],
        annexes: [],
        payload: {
            title: `Compte rendu d’entretien professionnel ${annee} — ${agentName}`,
            message: 'Compte rendu d’entretien professionnel à cosigner (agent et évaluateur).',
            mode: 'parallele',
            signataires,
            no_qr: true,
            service: 'DSI',
        },
        user: { username: actor.username, email: actor.email || agentEmail, displayName: agentName },
        req,
    });

    await pgDb.run(
        `UPDATE hub_entretiens.entretiens SET crep_statut = 'en_signature', crep_parapheur_id = ?, crep_parapheur_ref = ?, updated_at = NOW() WHERE id = ?`,
        [created.id, created.reference, row.id]
    );
    return { parapheur: created };
}

module.exports = { sendToAgent, agentValidate };
