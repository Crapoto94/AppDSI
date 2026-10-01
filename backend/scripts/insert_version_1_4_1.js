const { pool } = require('../shared/database');

const VERSION = '1.4.1';

const changes = [
  "<p><strong>Version 1.4.1</strong> — une riche mise à jour : refonte de l'explorateur de documents des projets avec OnlyOffice, améliorations du module Réunions, mentions @ et notifications dans les tickets, et nombreux correctifs.</p>",

  "### Projets — Explorateur de documents",
  "• Fusion des onglets Documents et Explorateur : dossiers, glisser-déposer par fichier, gestion des ZIP (dézipper / conserver), type de document en liste déroulante (obligatoire, devenu optionnel)",
  "• Sélection multiple de dossiers et fichiers, copier-coller et déplacement d'un dossier entier (typage en cascade)",
  "• Visionneuse enrichie : versions, rendu Markdown (.md) et affichage texte brut des .msg",
  "• Aperçu lecture seule (docx/xlsx/pptx) et édition en ligne via OnlyOffice (bouton Modifier, plein écran, sans panneau des versions), moteur dédié et proxy nginx ; collaboration au nom de l'agent connecté",
  "• Ajout / suppression d'une pièce jointe en éditant une entrée du journal",

  "### Réunions",
  "• Recherche de créneaux communs : horizon réglable (1 mois à 1 an), bouton « 5 créneaux suivants » et option « Strictement tous les participants »",
  "• Ajout rapide d'invités par catégorie (DG/DGA, directeurs, responsables de service, groupes particuliers)",
  "• Saisie de l'heure simplifiée au quart d'heure à la création d'une réunion",

  "### Tickets",
  "• Mentions @ avec notifications et rappel par e-mail à 20h",
  "• Collecteur mail : les réponses et transferts sont ajoutés en commentaire (contenu ajouté uniquement)",
  "• Mot de passe provisoire configurable (réglage déplacé vers /tickets/admin > Paramètres) et action rapide de changement de mot de passe avec ticket auto-résolu",
  "• Affichage de l'activité / timeline, du message d'attente et des puces de listes dans la vue détail",

  "### Tâches",
  "• Lien vers l'élément d'origine dans le mail d'assignation, notification des tâches d'arbitrage, liens e-mail basés sur le domaine public",

  "### Service fait (Sedit)",
  "• Date de service fait saisie dans le formulaire (défaut : jour) et reportée dans Sedit",
  "• Création atomique avec synchronisation Sedit ; « Faire » accepte un commentaire ou une pièce jointe",

  "### Parapheur",
  "• Liens de signature et QR basés sur le domaine public, expéditeur (direction), libellés « en masse » ajustés",

  "### MagApp",
  "• Pastille « maintenance à venir » avec infobulle dans le Magasin d'applications ; refonte de la modale « Programmer une maintenance »",

  "### Pièces jointes",
  "• Visionneuse générique de pièces jointes et aperçu Office en lecture seule (Document Server OnlyOffice d'AppDSI via hub.infra_apis)",

  "### Corrections",
  "• Résolution en cascade des tickets liés (échec silencieux), upload de dossier bloqué à 30 % dans /projets, bascule des fichiers GED legacy vers Alfresco",
  "• Maintenances MagApp stockées avec un mauvais horaire (fuseau)",
  "• Callback Azure AD : doublon hub.users (casse), redirection localhost et /api/auth/me ; crash du dashboard tickets ; /fast inaccessibles aux agents tickets",
];

(async () => {
  try {
    const releaseDate = new Date().toLocaleDateString('fr-FR');
    const existing = await pool.query('SELECT id FROM hub.changelog_versions WHERE version = $1 ORDER BY id DESC LIMIT 1', [VERSION]);
    let res;
    if (existing.rows.length > 0) {
      res = await pool.query(
        'UPDATE hub.changelog_versions SET release_date = $1, changes = $2 WHERE id = $3 RETURNING id, version, release_date',
        [releaseDate, JSON.stringify(changes), existing.rows[0].id]
      );
      console.log('Version mise à jour:', res.rows[0]);
    } else {
      res = await pool.query(
        'INSERT INTO hub.changelog_versions (version, release_date, changes) VALUES ($1, $2, $3) RETURNING id, version, release_date',
        [VERSION, releaseDate, JSON.stringify(changes)]
      );
      console.log('Version créée:', res.rows[0]);
    }
  } catch (e) {
    console.error('ERR', e.message);
  }
  process.exit(0);
})();
