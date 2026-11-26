/**
 * Fournisseur (tiers) nommé dans la question, reconnu sans dépendre de l'IA et vérifié dans FI.TIERS.
 *
 * Dans l'ordre : un nom complet de tiers présent dans la question (« LES DENOMMES DE L ETAT ») ; un texte entre
 * guillemets ; une suite de mots en capitales ; enfin un mot isolé. Un nom n'est JAMAIS découpé en mots
 * indépendants, et la recherche porte sur des mots entiers (« ETAT » ne trouve pas « INTERPRETATION »).
 * Seuls les noms de tiers sont lus ici ; les montants restent soumis au périmètre de l'agent.
 */
const oracledb = require('oracledb');
const financeShare = require('../finance/finance-share.controller');
const { reconnaitre } = require('./referentiel');

const sansAccent = (s) => String(s || '').normalize('NFD').replace(/\p{Diacritic}/gu, '');
/** Capitales, sans accents ni ponctuation : forme de comparaison des noms. */
const cle = (s) => sansAccent(s).toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim();

// Mots du vocabulaire des finances (et sigles) qui ne désignent jamais à eux seuls un fournisseur
const COMMUNS = new Set(('LE LA LES L DE DU DES D UN UNE ET OU EN AU AUX A POUR PAR SUR AVEC SANS DANS ENTRE DEPUIS CHEZ QUE QUI QUELS QUELLES QUEL QUELLE EST SONT '
    + 'BUDGET BUDGETS VOTE ENGAGE ENGAGEMENT ENGAGEMENTS COMMANDE COMMANDES FACTURE FACTURES MANDAT MANDATS TITRE TITRES TIERS FOURNISSEUR FOURNISSEURS SOCIETE ENTREPRISE PRESTATAIRE '
    + 'DEPENSE DEPENSES RECETTE RECETTES MONTANT MONTANTS TOTAL LISTE DETAIL EVOLUTION DISPONIBLE MANDATE PAYE PAYES REALISE COURS RESTE SOLDE '
    + 'DERNIER DERNIERS DERNIERE DERNIERES PREMIER PREMIERS PLUS MOINS GROS GROSSES IMPORTANTS SERVICE SERVICES DIRECTION DIRECTIONS CHAPITRE NATURE FONCTION SECTION ANNEE ANNEES AN ANS MOIS EXERCICE '
    + 'FONCTIONNEMENT INVESTISSEMENT TOUTE TOUTES TOUS TOUT VILLE MAIRIE MONTRE AFFICHE DONNE QUOI COMBIEN COURBE HISTOGRAMME GRAPHIQUE CAMEMBERT TABLEAU EXCEL WORD '
    + 'TTC TVA EURO EUROS DGP REJETE REJETEES FAIT FAITS ATTENTE VALIDATION ENCOURS CETTE CES SON SES LEUR LEURS MES NOS NOTRE VOTRE VOS '
    + 'CCAS CMPP CMS SIRH SAFL PES XML PDF BP BS DM RH IA').split(' '));
const utile = (mots) => mots.some(m => m.length >= 3 && !COMMUNS.has(m) && !/^\d+$/.test(m) && !/^B[A-V]\d+$/.test(m));

const NOM = 'TRIM(REGEXP_SUBSTR(POBJ_EXTRACT, \'[^\' || CHR(1) || \']+\', 1, 2))';

let noms = { at: 0, map: new Map(), list: [] };
/** Noms de tiers Sedit (gardés 30 minutes). */
async function chargerNoms() {
    if (Date.now() - noms.at < 30 * 60 * 1000 && noms.list.length) return noms;
    const rows = await financeShare.withFinanceOracle(async (conn) => (await conn.execute(
        `SELECT DISTINCT ${NOM} AS NOM FROM FI.TIERS`, {}, { outFormat: oracledb.OUT_FORMAT_OBJECT, maxRows: 200000 })).rows || []);
    const map = new Map();
    for (const { NOM: nom } of rows) {
        const k = cle(nom);
        if (!k) continue;
        if (!map.has(k)) map.set(k, []);
        map.get(k).push(nom);
    }
    noms = { at: Date.now(), map, list: [...map.keys()].map(k => ` ${k} `) };
    return noms;
}

/** Un tiers contient-il ces mots entiers, à la suite ? */
const existe = (referentiel, k) => referentiel.list.some(n => n.includes(` ${k} `));

/**
 * @returns {Promise<string[]>} filtres de tiers : « =NOM EXACT » (nom Sedit complet) ou mots entiers à trouver
 */
async function tiersCites(question) {
    const ref = await chargerNoms();
    const { entites } = reconnaitre(question);
    const pris = new Set(entites.flatMap(e => cle(e.mot).split(' ')));
    const brut = sansAccent(question).split(/[^A-Za-z0-9&]+/).filter(Boolean);
    const mots = brut.map(m => m.toUpperCase());

    // 1) Nom complet d'un tiers (au moins deux mots), le plus long d'abord
    const exacts = [];
    const libres = mots.map(() => true);
    for (let size = Math.min(10, mots.length); size >= 2; size--) {
        for (let i = 0; i + size <= mots.length; i++) {
            const part = mots.slice(i, i + size);
            if (!libres.slice(i, i + size).every(Boolean) || !utile(part)) continue;
            const k = cle(part.join(' '));
            if (k.length < 6 || !ref.map.has(k)) continue;
            ref.map.get(k).forEach(n => exacts.push(`=${n}`));
            for (let j = i; j < i + size; j++) libres[j] = false;
        }
    }
    // Les mots déjà pris par un nom complet sont mis de côté ; les autres peuvent nommer un autre fournisseur
    // (« compare UGAP et SCC FRANCE »)

    // 2) Texte entre guillemets : pris tel quel, en entier
    const guillemets = [...String(question).matchAll(/["«“]\s*([^"»”]{2,80}?)\s*["»”]/g)].map(m => cle(m[1])).filter(Boolean);
    if (!exacts.length && guillemets.length) return guillemets.flatMap(k => (ref.map.has(k) ? ref.map.get(k).map(n => `=${n}`) : existe(ref, k) ? [k] : [])).slice(0, 5);

    // 3) Suites de mots en capitales, puis mots isolés annoncés (« chez X », « commandes x »)
    const trouves = [];
    let i = 0;
    while (i < brut.length) {
        const capitales = (m) => /^[A-Z0-9&]+$/.test(m) && /[A-Z]/.test(m);
        let j = i;
        while (j < brut.length && libres[j] && capitales(brut[j]) && !pris.has(mots[j])) j++;
        if (j - i >= 2 && utile(mots.slice(i, j))) {
            const k = cle(mots.slice(i, j).join(' '));
            if (existe(ref, k)) trouves.push(k);
            i = j;
            continue;
        }
        if (!libres[i]) { i++; continue; }
        const mot = mots[i];
        const avant = (brut[i - 1] || '').toLowerCase();
        if (mot.length >= 3 && !pris.has(mot) && utile([mot])) {
            const sur = /^(chez|fournisseur|tiers|societe|entreprise|prestataire|aupres)$/.test(avant) || (capitales(brut[i]) && brut[i].length >= 3);
            const aConfirmer = /^(commandes?|factures?|mandats?|engagements?|a|de|avec|et|pour)$/.test(avant);
            // « à confirmer » : le mot doit être le début du nom d'un tiers
            if (sur ? existe(ref, mot) : aConfirmer && ref.list.some(n => n.startsWith(` ${mot} `))) trouves.push(mot);
        }
        i++;
    }
    return [...new Set([...exacts, ...trouves])].slice(0, 5);
}

/** Nom lisible d'un filtre de tiers. */
const nomTiers = (v) => String(v).replace(/^=/, '');

module.exports = { tiersCites, nomTiers };
