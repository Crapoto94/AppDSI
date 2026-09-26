/**
 * Intégration OnlyOffice Document Server — aperçu en LECTURE SEULE des documents
 * bureautiques (docx/xlsx/pptx) dans l'explorateur de documents /projets.
 *
 * Contrairement à l'intégration complète de C:\dev\delib (édition + sauvegarde via
 * callback + conversion PDF), ici on ne fait QUE visualiser : `editorConfig.mode =
 * 'view'` et `permissions.edit = false`, donc pas de callbackUrl ni de route de
 * sauvegarde nécessaires — le moteur n'a jamais besoin de nous rappeler.
 *
 * Configuration stockée dans hub.infra_apis (clé 'onlyoffice', gérée depuis
 * /admin/infra comme les autres API externes) :
 *   base_url  = adresse que LE BACKEND appelle (peu utilisée ici, sert de repli) ;
 *   endpoint  = adresse ABSOLUE que LE NAVIGATEUR charge (le moteur doit être sur
 *               sa propre origine, jamais un sous-chemin) ;
 *   api_key   = secret JWT partagé avec le moteur (HS256).
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
 * Configuration d'éditeur OnlyOffice en mode visualisation pour un fichier (docx,
 * xlsx ou pptx — type déduit de l'extension de `nom`).
 * @param {{ cle: string, nom: string, url: string }} p - cle: identifiant de session
 *   unique (par version, pour que le moteur n'utilise jamais un cache périmé) ;
 *   nom: nom affiché (son EXTENSION détermine le type d'éditeur) ; url: URL
 *   (absolue, joignable PAR LE MOTEUR) du contenu.
 */
function buildViewConfig(cfg, { cle, nom, url }) {
    const ext = String(nom || '').split('.').pop().toLowerCase();
    const documentType = TYPE_PAR_EXT[ext];
    if (!documentType) throw new Error(`Extension non prise en charge par l'aperçu OnlyOffice : .${ext}`);
    const config = {
        documentType,
        type: 'desktop',
        width: '100%',
        height: '100%',
        document: {
            fileType: ext,
            key: cle,
            title: nom,
            url,
            permissions: { edit: false, download: true, print: true, comment: false },
        },
        editorConfig: {
            mode: 'view',
            lang: 'fr-FR',
            customization: { compactHeader: true, hideRightMenu: true },
        },
    };
    if (/^https?:\/\//i.test(cfg.urlNavigateur)) config.documentServerUrl = cfg.urlNavigateur;
    if (cfg.jwtSecret) config.token = jwt.sign(config, cfg.jwtSecret, { expiresIn: '2h' });
    return { sdk: `${cfg.urlNavigateur}/web-apps/apps/api/documents/api.js`, config };
}

module.exports = { getConfig, buildViewConfig, estPriseEnCharge };
