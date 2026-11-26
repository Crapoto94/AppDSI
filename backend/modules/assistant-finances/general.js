/**
 * Questions d'ordre général (« pourquoi… », « c'est quoi un mandat ? », « bonjour ») : réponse rédigée par l'IA
 * LOCALE, présentée comme telle. Elle ne reçoit aucun montant ni aucune ligne de Sedit : seulement la question
 * et, pour expliquer une réponse précédente, les titres de ce qui a été cherché.
 */
const ai = require('./ai');

const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '').replace(/[’'-]/g, ' ').trim();

// Question sur le fonctionnement, une notion ou la réponse précédente : pas une demande de données
const GENERALE = /^(?:(?:mais|et|alors|ok|oui|non)\s+)?(?:pourquoi\b|comment (?:ca|cela|marche|fonctionne|faire|je|puis|peux|se fait|tu)\b|qu est ce qu(?: un| une|e le| e la)\b|c est quoi\b|que (?:veut|signifie|veux)\b|explique|definition\b|definis\b|a quoi (?:sert|correspond)\b|bonjour\b|bonsoir\b|salut\b|merci\b|qui es\b|que (?:sais|peux) tu\b|quelle est la difference entre (?:un|une)\b)/;

const estGenerale = (question) => GENERALE.test(norm(question));

const CONNAISSANCES = `L'assistant interroge Sedit Finances en lecture seule, dans la limite des droits de l'agent, sur cinq sources :
- budget : crédits votés, disponibles, engagés, mandatés, par ligne budgétaire ;
- engagements : réservations de crédits ;
- commandes : bons de commande passés aux fournisseurs ;
- factures : factures reçues des fournisseurs ;
- mandats et titres : paiements émis (mandats) et recettes (titres).
Circuit d'une dépense : engagement, commande, livraison, facture, service fait, mandat, paiement. Une commande récente pas encore payée n'apparaît donc PAS dans les mandats.
Il ne couvre pas les marchés, les fiches tiers, les emprunts, les immobilisations ni les régies.
La question est traduite en recherche par une IA et des règles : une faute de frappe ou une formulation ambiguë peut faire chercher dans la mauvaise source. Le titre du tableau dit exactement ce qui a été cherché. Les filtres et le contexte de la conversation sont repris d'une question à l'autre.`;

function prompt(question, historique, regles) {
    const fil = (Array.isArray(historique) ? historique : []).slice(-4)
        .map(h => `- Question : « ${String(h.question || '').slice(0, 200)} » → recherché : ${(h.titres || []).slice(0, 4).map(t => String(t).slice(0, 200)).join(' ; ') || '(aucune recherche)'}`)
        .join('\n');
    return `Tu es l'assistant finances d'une mairie. Réponds en français, clairement et brièvement (8 phrases au plus), sans mise en forme compliquée.

${CONNAISSANCES}

RÈGLES
- N'invente jamais un montant, une date, un numéro ou une donnée de la Ville : tu n'as accès à aucun chiffre ici. Si des données sont nécessaires, dis quelle question poser.
- Pour « pourquoi n'as-tu pas trouvé… », compare ce qui a été recherché à chaque question (source, filtres, années) et explique la différence ; reconnais l'erreur si la recherche ne correspondait pas à la demande.
- Si la question n'a rien à voir avec les finances, tu peux répondre brièvement, en signalant que ce n'est pas ton domaine.
${regles?.length ? `\nCONSIGNES DES AGENTS :\n${regles.map(r => `- ${r}`).join('\n')}\n` : ''}${fil ? `\nCONVERSATION JUSQU'ICI :\n${fil}\n` : ''}
QUESTION : ${String(question).slice(0, 600)}
RÉPONSE :`;
}

async function repondre({ question, historique, regles }) {
    const { text, model } = await ai.complete(prompt(question, historique, regles), { json: false });
    const message = String(text || '').replace(/<think>[\s\S]*?<\/think>/g, '').replace(/\*\*/g, '').trim().slice(0, 2500);
    return { message: message || 'Je n’ai pas de réponse à proposer.', model };
}

module.exports = { estGenerale, repondre };
