/**
 * Envoie par mail (via l'API Ville / APM — même circuit que les comptes rendus du Transcript
 * Manager, cf. shared/apm_mail.js) la synthèse du rapprochement entre le dossier partagé
 * X:\DSI\ADMINISTRATIF\MARCHES ET CONTRATS\CONTRATS\LOGICIELS et les contrats DSIHUB.
 *
 * Usage : node scripts/send_rapprochement_contrats_report.js
 */
const apmMail = require('../shared/apm_mail');

const TO = 'machevalier@ivry94.fr';

const created = [
    ['#616', 'ADELYCE / Atelier salarial prémium', 'ADELYCE', '22/03/2024 → 21/03/2027'],
    ['#617', 'Cindoc', 'CINCOM DSS', '01/01/2022 → 31/12/2025 (tacite reconduction)'],
    ['#618', 'G-DOC', 'ELECTROCLASS', '01/01/2023 → 31/12/2023 (à reconfirmer)'],
    ['#619', 'AS Abonnement / AS Sécurité', 'ELP', '01/01/2022 → 31/12/2025'],
    ['#620', 'Xthèque', 'ELP', '01/01/2022 → 31/12/2025'],
    ['#621', 'eSirius', 'ESII', '01/01/2020 → 31/12/2022 — marqué archivé (aucun renouvellement trouvé)'],
    ['#622', 'SIRIUS + module ORION (Le Hangar)', 'FORUM SIRIUS', '01/01/2024 → 31/12/2027'],
    ['#623', 'Sphinx IQ2', 'LE SPHINX', 'dates inconnues — marqué archivé (dernier document 2021)'],
    ['#624', 'Caisse billetterie Luxy', 'MONNAIE SERVICES', '08/09/2023 → 07/09/2027'],
    ['#625', 'ORTIF', 'NEHS', 'dates inconnues — à compléter après lecture du contrat'],
    ['#626', 'Ophtix', 'OPHTEL', '01/01/2022 → 31/12/2025'],
];

const dateFlags = [
    ['TX Visioweb (#584)', "date de fin en base : 30/12/2023 — document au dossier (ADISNOR) : fin 04/06/2026"],
    ['Arpège Diffusion (#453)', "date de fin en base : 30/12/2023 — contrat ARPEGE C2213806 au dossier : fin 31/12/2027"],
    ['Syracuse + EPN connect (#576)', "date de fin en base : 28/12/2021 — contrat ARCHIMED au dossier : fin 16/11/2025"],
    ['ADAGIO (#446)', "date de fin en base : 30/12/2025 — contrat ARPEGE CT00001570 au dossier : fin 31/12/2028"],
    ['PANDORA FMS (#540)', "statut en base : archivé — un contrat de support 2025 (Orsenna) est présent au dossier : à réactiver si toujours en cours"],
    ['Menestrel (#522)', "raison sociale en base : ARCHE MC2 — dossier nommé « APOLOGIC (Cytizen) » / document « CITYZEN UP » : probable changement de nom du prestataire, à vérifier (contrat déjà archivé des deux côtés)"],
    ['SOTICKET Hangar (#600-602)', "dossier partagé nommé « SOCOOP » (raison sociale probable du même prestataire que « SOTICKET ») : à harmoniser si besoin"],
];

const needsReview = [
    ['MOJI', "dossier ne contient que des conditions générales (CGV/CPV), aucun contrat daté trouvé — non ajouté, à vérifier manuellement"],
    ['AVENANT FRIZBI LOGIN (fichier racine)', "un seul avenant trouvé (signé 20/03/2023), aucun contrat de base ni dates identifiées — non ajouté, à vérifier manuellement"],
];

const emptyFolders = ['AEROHIVE', 'BITDEFENDER', 'MICROSOFT - WINDOWS SERVEUR', 'VEEAM'];

const rows = (arr) => arr.map(r => `<tr>${r.map(c => `<td style="padding:4px 10px;border:1px solid #e2e8f0;font-size:13px;">${c}</td>`).join('')}</tr>`).join('\n');

const content = `
<p>Bonjour,</p>
<p>Voici la synthèse du rapprochement effectué entre le dossier partagé
<code>X:\\DSI\\ADMINISTRATIF\\MARCHES ET CONTRATS\\CONTRATS\\LOGICIELS</code> (~60 dossiers fournisseurs)
et les contrats déjà enregistrés dans DSIHUB (152 contrats avant intervention).</p>

<h3>1. Contrats ajoutés dans DSIHUB (${created.length})</h3>
<p>Contrats trouvés dans le dossier partagé mais absents de DSIHUB — créés avec leur document contractuel
source rattaché en GED (onglet Documents du contrat) :</p>
<table style="border-collapse:collapse;width:100%;">
<tr>${['Id', 'Objet', 'Fournisseur', 'Période'].map(h => `<th style="padding:4px 10px;border:1px solid #e2e8f0;background:#1e3a5f;color:#fff;font-size:12px;text-align:left;">${h}</th>`).join('')}</tr>
${rows(created)}
</table>

<h3>2. Contrats déjà suivis dans DSIHUB, avec un écart constaté (${dateFlags.length})</h3>
<p>Ces contrats existent déjà et n'ont <strong>pas</strong> été modifiés automatiquement (par prudence) — un écart
a été repéré entre la base et le document trouvé au dossier, à vérifier/corriger manuellement dans DSIHUB :</p>
<table style="border-collapse:collapse;width:100%;">
<tr>${['Contrat', 'Écart constaté'].map(h => `<th style="padding:4px 10px;border:1px solid #e2e8f0;background:#1e3a5f;color:#fff;font-size:12px;text-align:left;">${h}</th>`).join('')}</tr>
${rows(dateFlags)}
</table>

<h3>3. Dossiers à vérifier manuellement (${needsReview.length})</h3>
<table style="border-collapse:collapse;width:100%;">
<tr>${['Dossier', 'Raison'].map(h => `<th style="padding:4px 10px;border:1px solid #e2e8f0;background:#1e3a5f;color:#fff;font-size:12px;text-align:left;">${h}</th>`).join('')}</tr>
${rows(needsReview)}
</table>

<h3>4. Dossiers vides (aucun document)</h3>
<p>${emptyFolders.join(', ')} — probablement des prestataires historiques sans document numérisé au dossier.</p>

<h3>Non repris dans ce mail</h3>
<p>Les ~40 autres dossiers du répertoire partagé correspondent chacun à un contrat déjà présent dans DSIHUB
(rapprochement par fournisseur/objet) et n'ont pas nécessité de création.</p>

<p>Cordialement,<br>DSI Hub — rapprochement automatique</p>
`;

(async () => {
    try {
        await apmMail.sendMail({
            to: TO,
            subject: 'DSIHUB — Rapprochement contrats logiciels (dossier partagé X:\\...\\LOGICIELS)',
            content,
        });
        console.log(`Mail envoyé à ${TO}.`);
        process.exit(0);
    } catch (error) {
        console.error('FATAL — envoi échoué :', error.message);
        process.exit(1);
    }
})();
