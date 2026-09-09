const { pool } = require('../shared/database');

const changes = [
  "<p><strong>Version 1.0.3</strong> — nouveau workflow de validation du <strong>service fait</strong> des factures (Budget), avec vérificateur par lien email, pièces jointes, annulation/relance et notifications ; ainsi qu'un script de rattrapage GED pour les images de consommables/prêts restées sur un poste local.</p>",
  "### Budget — Service fait des factures",
  "• Nouveau workflow de validation par facture : choix du vérificateur, lien de validation par email (sans connexion), décision (validé / validé avec réserves / non validé / ne me concerne pas / transfert), pièces jointes, historique horodaté",
  "• \"Voir la facture\" et les pièces jointes s'ouvrent dans une visionneuse intégrée plutôt qu'un nouvel onglet",
  "• Horodatage fiabilisé (fuseau horaire) et traçabilité IP/navigateur sur chaque étape de l'historique",
  "• Vue du processus (en cours ou terminé) accessible en modale directement depuis le tableau des factures ; le badge de statut devient lui-même le lien une fois le processus terminé (ex. \"SF le 07/09/2026\")",
  "• Annulation d'un processus non terminé par le gestionnaire (avec notification du demandeur), et relance d'une nouvelle demande possible sur la même facture",
  "• Notification par email du demandeur une fois le processus terminé, y compris en cas d'annulation",
  "• Au moins une pièce jointe ou un motif désormais exigé pour toute décision, y compris une validation simple",
  "• Détection fiabilisée du tiers et du montant au lancement d'une demande",
  "• Détection des factures déjà intégrées au module Télécom : pastille dédiée au lieu de proposer un service fait",
  "• Tableau des factures trié par défaut par date décroissante",
  "• Correctifs : statut indexé par numéro de facture plutôt que par identifiant Sedit ; liens de secours dans les emails (service fait, tickets, relances) qui débordaient sans retour à la ligne sur certains clients mail",
  "### GED",
  "• Script de rattrapage pour récupérer les images de consommables/prêts restées sur un poste local au lieu du partage réseau",
  "### Général / Hub",
  "• Modèle d'email global renforcé (word-break) pour qu'un lien ou token long ne déborde plus sans retour à la ligne sur certains clients mail (Outlook)"
];

(async () => {
  try {
    const releaseDate = new Date().toLocaleDateString('fr-FR');
    const res = await pool.query(
      'INSERT INTO hub.changelog_versions (version, release_date, changes) VALUES ($1, $2, $3) RETURNING id, version, release_date',
      ['1.0.3', releaseDate, JSON.stringify(changes)]
    );
    console.log('Version créée:', res.rows[0]);
  } catch (e) {
    console.error('ERR', e.message);
  }
  process.exit(0);
})();
