const { pool } = require('../shared/database');

const changes = [
  "<p><strong>Version 1.0.4</strong> — refonte de la zone de réponse des tickets (modes, destinataires, réponse groupée), rappel de réouverture dans l'email de résolution, et correctif de sécurité sur l'affichage des tickets importés par email.</p>",
  "### Tickets — Zone de réponse",
  "• Nouveau sélecteur de mode (Commentaire simple / Note interne / Réponse e-mail / Résolution), avec un bouton de publication unique dont le libellé s'adapte au mode choisi",
  "• Envoi possible au clavier avec Ctrl+Entrée",
  "• Nouveau sélecteur de destinataires pour les modes Réponse e-mail et Résolution : Demandeur, Techniciens assignés, Observateurs, avec les effectifs réels du ticket",
  "• Résoudre un ticket envoie désormais aussi le message de résolution par email au demandeur (comme une réponse classique), au lieu d'un simple commentaire",
  "• Les messages envoyés par email affichent maintenant leurs destinataires (\"À : ...\") directement au-dessus du message",
  "• Description du ticket présentée dans un encadré pour plus de clarté",
  "• Réponses types et base de connaissance déplacées dans le panneau de droite, sous les détails du ticket",
  "### Tickets — Réouverture par le demandeur",
  "• L'email envoyé à la résolution d'un ticket inclut désormais un bouton \"Rouvrir le ticket\", actif pendant 7 jours",
  "• Réouverture sans connexion depuis ce lien, avec saisie obligatoire du motif (repris dans le suivi du ticket)",
  "### Sécurité",
  "• Correctif : un ticket contenant un email importé (Outlook/Word) pouvait, dans de rares cas, détourner la page entière vers un site externe en cliquant sur un lien de l'application (ex. \"Accueil\") ; corrigé sur les tickets et les autres écrans concernés (réunions, projets, magapp)"
];

(async () => {
  try {
    const releaseDate = new Date().toLocaleDateString('fr-FR');
    const res = await pool.query(
      'INSERT INTO hub.changelog_versions (version, release_date, changes) VALUES ($1, $2, $3) RETURNING id, version, release_date',
      ['1.0.4', releaseDate, JSON.stringify(changes)]
    );
    console.log('Version créée:', res.rows[0]);
  } catch (e) {
    console.error('ERR', e.message);
  }
  process.exit(0);
})();
