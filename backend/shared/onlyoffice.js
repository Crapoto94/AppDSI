/**
 * Intégration OnlyOffice Document Server pour l'explorateur de documents /projets —
 * aperçu en lecture seule ET édition (docx/xlsx/pptx), avec sauvegarde en nouvelle
 * version via le mécanisme de rappel (callback) du moteur.
 *
 * S'inspire de l'intégration complète de C:\dev\delib\backend\src\adapters\
 * bureau-onlyoffice.js (déjà opérationnelle en prod, mêmes principes de confiance
 * réseau, de traduction d'URL et de vérification du rappel).
 *
 * Configuration stockée dans hub.infra_apis (clé 'onlyoffice', gérée depuis
 * /admin/infra comme les autres API externes) :
 *   base_url  = adresse INTERNE que LE BACKEND appelle (ex. http://documentserver) ;
 *   endpoint  = adresse ABSOLUE que LE NAVIGATEUR charge (le moteur doit être sur
 *               sa propre origine ou un préfixe stable, jamais un chemin arbitraire) ;
 *   api_key   = secret JWT partagé avec le moteur (HS256).
 *
 * Le moteur RAPPELLE aussi le backend (téléchargement du fichier à ouvrir en mode
 * édition, puis sauvegarde à la fermeture/l'enregistrement) — adresse fournie par
 * la variable d'environnement ONLYOFFICE_CALLBACK_URL (réseau Docker interne,
 * jamais le domaine public : cf. previewExplorerOnlyOffice/onlyofficeCallback dans
 * projets.controller.js pour le pourquoi du DEPTH_ZERO_SELF_SIGNED_CERT évité).
 */
const jwt = require('jsonwebtoken');
const { pgDb } = require('./database');

function sansPointFinal(s) { return String(s || '').replace(/\/+$/, ''); }

async function getConfig() {
    const cfg = await pgDb.get(`SELECT * FROM hub.infra_apis WHERE key = ?`, ['onlyoffice']);
    if (!cfg || cfg.enabled === false || !cfg.base_url) return null;
    return {
        url: sansPointFinal(cfg.base_url),
        urlNavigateur: sansPointFinal(cfg.endpoint || cfg.base_url),
        jwtSecret: cfg.api_key || '',
    };
}

/** Type d'éditeur OnlyOffice par extension (l'API JS dit "cell"/"slide", pas
 * "cells"/"slides") — mêmes familles que C:\dev\delib\backend\src\adapters\
 * bureau-onlyoffice.js. */
const TYPES = {
    word: ['doc', 'docx', 'rtf', 'odt', 'txt', 'html', 'htm'],
    cell: ['xls', 'xlsx', 'csv', 'ods', 'xlsm'],
    slide: ['ppt', 'pptx', 'odp', 'pptm'],
};
const TYPE_PAR_EXT = Object.fromEntries(Object.entries(TYPES).flatMap(([type, liste]) => liste.map((e) => [e, type])));

/** Vrai si l'extension d'un nom de fichier est prise en charge par l'aperçu OnlyOffice. */
function estPriseEnCharge(nom) {
    const ext = String(nom || '').split('.').pop().toLowerCase();
    return !!TYPE_PAR_EXT[ext];
}

/**
 * Configuration d'éditeur OnlyOffice pour un fichier (docx, xlsx ou pptx — type
 * déduit de l'extension de `nom`), en visualisation ou en édition.
 * @param {{ cle: string, nom: string, url: string, utilisateur?: { id: string, nom: string }, edit?: boolean, callbackUrl?: string }} p
 *   cle: identifiant de session unique (par version, pour que le moteur n'utilise
 *   jamais un cache périmé) ; nom: nom affiché (son EXTENSION détermine le type
 *   d'éditeur) ; url: URL (absolue, joignable PAR LE MOTEUR) du contenu ;
 *   utilisateur: agent DSI Hub consultant/éditant le document — sans lui, le moteur
 *   demande systématiquement "Entrez un nom à utiliser pour la collaboration" ;
 *   edit: true pour ouvrir en édition (sinon lecture seule) ; callbackUrl: requis
 *   si edit=true, URL (joignable PAR LE MOTEUR) que celui-ci rappelle à la
 *   sauvegarde — cf. onlyofficeCallback dans projets.controller.js.
 */
function buildConfig(cfg, { cle, nom, url, utilisateur, edit, callbackUrl, minimal }) {
    const ext = String(nom || '').split('.').pop().toLowerCase();
    const documentType = TYPE_PAR_EXT[ext];
    if (!documentType) throw new Error(`Extension non prise en charge par l'aperçu OnlyOffice : .${ext}`);
    const config = {
        documentType,
        type: minimal ? 'embedded' : 'desktop',
        width: '100%',
        height: '100%',
        document: {
            fileType: ext,
            key: cle,
            title: nom,
            url,
            permissions: minimal
                ? { edit: false, download: false, print: false, copy: true, comment: false }
                : { edit: !!edit, download: true, print: true, comment: !!edit },
        },
        editorConfig: {
            mode: edit ? 'edit' : 'view',
            lang: 'fr-FR',
            customization: minimal
                ? { compactHeader: true, toolbarHideFileName: true, hideRightMenu: true, chat: false, comments: false, plugins: false, help: false, feedback: false }
                : { compactHeader: true, hideRightMenu: !edit },
            ...(utilisateur ? { user: { id: utilisateur.id, name: utilisateur.nom } } : {}),
            ...(edit && callbackUrl ? { callbackUrl } : {}),
        },
    };
    if (/^https?:\/\//i.test(cfg.urlNavigateur)) config.documentServerUrl = cfg.urlNavigateur;
    if (cfg.jwtSecret) config.token = jwt.sign(config, cfg.jwtSecret, { expiresIn: '2h' });
    return { sdk: `${cfg.urlNavigateur}/web-apps/apps/api/documents/api.js`, config };
}

function buildViewConfig(cfg, opts) { return buildConfig(cfg, { ...opts, edit: false }); }
function buildEditConfig(cfg, opts) { return buildConfig(cfg, { ...opts, edit: true }); }

/** Un lien reçu du moteur (callback `url`, fichier édité à relire) n'est suivi que
 * s'il pointe vers le moteur lui-même (anti-SSRF) : par son adresse interne
 * (`cfg.url`, ce que le backend appelle) ou son adresse publique (`cfg.urlNavigateur`,
 * celle que le moteur annonce et que le navigateur utilise). Cf. deConfiance()
 * dans C:\dev\delib\backend\src\adapters\bureau-onlyoffice.js (même principe). */
function estUrlDeConfiance(cfg, cible) {
    try {
        const h = new URL(String(cible)).host;
        const hoteInterne = new URL(cfg.url).host;
        let hotePublic = '';
        try { hotePublic = new URL(cfg.urlNavigateur).host; } catch { /* urlNavigateur peut être relative */ }
        return h === hoteInterne || (!!hotePublic && h === hotePublic);
    } catch { return false; }
}

/** Traduit une URL que le moteur annonce sur son adresse PUBLIQUE (ex.
 * https://dsihub.ivry.local/onlyoffice/cache/files/xxx) en l'adresse INTERNE
 * correspondante (http://documentserver/cache/files/xxx) — le backend relit ainsi
 * le fichier édité sans dépendre du certificat du frontal ni de sa mise en cache.
 * Cf. urlInterne() dans C:\dev\delib\backend\src\adapters\bureau-onlyoffice.js. */
function versUrlInterne(cfg, cible) {
    const u = new URL(String(cible));
    const hoteInterne = new URL(cfg.url).host;
    if (u.host === hoteInterne) return u.toString();
    let prefixePublic = '';
    try { prefixePublic = new URL(cfg.urlNavigateur).pathname.replace(/\/+$/, ''); } catch { /* pas d'URL absolue */ }
    let chemin = u.pathname;
    if (prefixePublic && chemin.startsWith(`${prefixePublic}/`)) chemin = chemin.slice(prefixePublic.length);
    return new URL(`${chemin}${u.search}`, cfg.url).toString();
}

/** Le rappel du moteur est anonyme (c'est lui qui appelle) : son jeton HS256 fait
 * l'authentification (JWT_HEADER=Authorization et/ou JWT_IN_BODY=true côté moteur —
 * on lit les deux). Cf. verifyCallback() dans le même adaptateur delib. */
function verifierRappel(req, jwtSecret) {
    const brut = String(req.get('authorization') || req.headers.authorization || (req.body && req.body.token) || '').replace(/^Bearer\s+/i, '').trim();
    if (!brut) return { ok: false, code: 'jeton_absent' };
    try {
        let payload = jwt.verify(brut, jwtSecret);
        if (payload && payload.payload && typeof payload.payload === 'object') payload = payload.payload; // enveloppe ONLYOFFICE 4.x+
        return { ok: true, payload, jeton: brut };
    } catch { return { ok: false, code: 'signature_invalide' }; }
}

module.exports = {
    getConfig, buildViewConfig, buildEditConfig, estPriseEnCharge,
    estUrlDeConfiance, versUrlInterne, verifierRappel,
};
