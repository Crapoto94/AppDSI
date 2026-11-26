const { pool } = require('../shared/database');

const VERSION = '1.7.0';

const changes = [
  "<p><strong>Version 1.7</strong> — entretiens professionnels dématérialisés, réunions de service, Mes factures et virements de crédits dans le MagApp, assistant finances (BETA), interrogation des données par assistant IA (MCP), consommables des écoles, horodatage au Parapheur et de nombreux correctifs.</p>",

  "### Entretiens professionnels (nouveau)",
  "• CREP dématérialisé pour toute la Ville : agents issus de SEDIT RH, valideurs, rendez-vous, reprise de l'année précédente, enregistrement automatique, parcours guidé",
  "• Saisie dans l'outil, en manuscrit (scan ou photos avec lecture automatique) ou, en option, par PDF formulaire hors ligne",
  "• Suivi et pilotage : réception DRH, KPI, liste de tous les EP prévus, calendrier, numérisation en lot, collecte par boîte mail, rôle « pilotage » en lecture seule",
  "• Paramétrage : options de campagne (mode simple, cohérence, QR code), e-mails, aide et tutoriel modifiables, IA désactivable",
  "• Aide, tutoriel, backlog dédié, plein écran, mode sombre et adresse /ep",

  "### Réunions de service (nouveau)",
  "• Modèles, réunions en direct, INTERACT et classement, statistiques, comptes rendus des réunions en présentiel, pause Tetris multijoueur",
  "• KPI de rubrique avec widgets au tableau de bord, accès restreint, filtre par type, réorganisation par glisser-déposer",
  "• Correction du décalage d'une heure des réunions Outlook",

  "### Finances et MagApp",
  "• Mes factures (BETA) : droits SEDIT, partage d'accès, délai de paiement, service fait (y compris par lot), pièces jointes, ouverture dans SEDIT, rappels aux vérificateurs",
  "• Virement de crédits dans le MagApp (BETA) : signatures, notifications, plafonnement des minorations, choix du budget",
  "• Assistant finances (BETA) : questions en français sur Sedit avec une IA locale, exports Excel et Word, graphiques, dictée vocale",
  "• Lectures et virements via l'API Sedit, Mes factures plus rapide",
  "• Message de maintenance si le serveur est injoignable ; « Mes outils » sur 3 colonnes",
  "• « Modifier un PDF » retiré de « Mes outils DSI » (reste dans « Outils PDF »)",

  "### Budget",
  "• Filtre par code de budget, appliqué aussi aux factures, commandes, lignes et indicateurs",
  "• Correction des mandats affichés en double",

  "### Données et assistants IA (nouveau)",
  "• Interrogation en lecture seule des données du Hub, avec accès contrôlé et tracé",
  "• Serveur MCP : création de tickets, tâches et réunions, guides par module, gestion des droits dans /admin/mcp",

  "### Consommables",
  "• Collecte de la boîte consoivry, bons de commande Excel des écoles, import DSALE, AR de commande, vue par année scolaire",
  "• Création d'un ticket depuis une demande",

  "### Tickets",
  "• Création d'un ticket déjà résolu",
  "• Corrections des fuseaux horaires et de l'affichage du demandeur",

  "### Parapheur",
  "• Horodatage des signatures (RFC 3161) paramétrable, avec test et visualiseur de vérification",

  "### Administration et général",
  "• Backlog : onglet « Toutes les applications » centralisant les demandes",
  "• Droits : les porteurs d'une tuile administrent le module, les modules décochés sont masqués, tuiles affectées dès la création d'un utilisateur",
  "• RH et organigramme synchronisés depuis SEDIT RH ; congés à jour dans le calendrier DSI",
  "• Démarrage du serveur accéléré, chargements animés, fenêtres qui ne se ferment plus au clic à côté",

  "### Corrections",
  "• Aides de nouveau disponibles en production",
  "• Libellé du collecteur de mails Consommables"
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
