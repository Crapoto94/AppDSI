const { pool } = require('../shared/database');

const VERSION = '1.6.0';

const changes = [
  "<p><strong>Version 1.6</strong> — budgets précisés et filtrables (lignes, factures, commandes, engagements), opérations visibles par tous les accès Budget, refonte du suivi des demandes de rencontres budgétaires avec création de projets, bandeau d'actualité et forum de crise MagApp, SMS en masse Frizbi, PDF et assistant IA, annuaire des intervenants externes, et de nombreux correctifs (calendrier DSI, tickets, service fait).</p>",

  "### Budget",
  "• Budgets précisés : la colonne « Budget » affiche « code – libellé » (ex. 00 – PRINCIPAL) pour les lignes budgétaires, factures, commandes et engagements (mouvements) ; les lignes d'un même libellé présentes dans plusieurs budgets ne sont plus additionnées",
  "• Nouveau filtre « Budget » à côté du bouton Budget principal / Tous les budgets : filtre lignes, factures, commandes et engagements ; permet de lister les mouvements d'un budget en particulier",
  "• Opérations : plus de filtre automatique sur le service de l'utilisateur ; tous ceux qui ont accès à la tuile Budget voient toutes les opérations (la modification reste réservée aux administrateurs et aux finances)",
  "• Demandes de commande : page allégée (détails dépliables, menu d'actions, documents en pastilles), une URL par sous-menu (/budget/commandes…), clic sur le titre pour ouvrir la fiche ; ajout de documents ouvert à tous",
  "• Rôle compta : gestionnaire des demandes de commande et de l'envoi des commandes ; service fait (demande, pièces jointes, annulation) réservé aux rôles compta / finances / admin",
  "• Service fait : les pièces jointes de la demande de commande associée sont intégrées d'office (liste, retrait, aperçu) ; contrôle d'accès basé sur le rôle courant (Admin → Utilisateurs et hub.users), y compris quand le rôle du jeton est périmé ; agents compta/finances déclarés dans hub.users autorisés",

  "### Rencontres budgétaires",
  "• Nouveaux statuts « A arbitrer », « Refusé » et « Validé » (année de validation obligatoire, année en cours présélectionnée), changement de statut au clic dans la liste avec commentaire facultatif",
  "• Création d'un ticket DSIHUB depuis la liste (HTML structuré, type incident/demande repris, demandeur = utilisateur de référence AD) ; « + Assigner » avec recherche AD directement dans la liste",
  "• « + Projet » : création d'un projet simple (mini-projet, option sous-projet d'un projet maître du chef de projet) ou association à un projet existant (liste avec recherche) ; une tâche est créée pour le chef de projet avec e-mail, et sa validation termine la demande",
  "• Fusion commentaires / suivi, charge des chefs de projet, CP pressenti, filtres (le filtre direction ne montre que les directions de l'année), infobulle avec les infos de la demande",
  "• Liste plus sobre et fiche d'édition redessinée ; directions et services dédoublonnés et affichés de façon uniforme (services filtrés par direction), plus de modales de succès",

  "### Projets",
  "• Journal de projet : une réunion liée apparaît désormais à la date de la réunion et non à la date de saisie",

  "### Réunions",
  "• Annuaire des intervenants externes : fonction, organisme et e-mail sont mémorisés et proposés pendant la saisie du nom (création de réunion et fiche de la réunion), comme pour les agents de la ville",

  "### Calendrier DSI",
  "• Télétravail : plus jamais de « série », toujours un jour ou une demi-journée unitaire (la saisie ne propose plus de date de fin, plus de bouton « Supprimer la série » sur un TT)",
  "• Correction : modifier un événement ne change plus tous les événements du même agent de même titre (des demi-journées de TT pouvaient devenir des journées complètes) et ne supprime plus les jours voisins saisis séparément",

  "### Tickets",
  "• Correction : la case à cocher d'une tâche dans le détail d'un ticket réagit immédiatement (plus besoin de rafraîchir), sans double clic parasite ni écrasement par un rechargement en cours",
  "• Commentaires : pastille Observateur, distinction des réponses du demandeur et des commentaires, détection des commentaires d'observateurs améliorée, retours à la ligne conservés pour les textes bruts",
  "• Avertissement à la création si le demandeur n'a pas d'e-mail ; tableau de bord : répartition en barres de l'âge et de l'attente",

  "### MagApp",
  "• Bandeau d'actualité permanent paramétrable dans /admin/magapp (taille et hauteur réglables), forum de crise associé au bandeau, épinglable à droite, nom paramétrable",
  "• Application mise en avant (bannière en tête du magasin) ; refonte de l'onglet Paramètres de l'administration (pleine largeur, sections, barre d'enregistrement)",
  "• « Modifier un PDF » (PdfCraft) avec assistant IA sur le document ouvert, réservé à Mes outils DSI en double largeur ; extraction du texte des PDF via pdfjs-dist",
  "• Les utilisateurs ne voient que les demandes de leur dernière année saisie",

  "### Frizbi",
  "• Envoi de SMS en masse depuis un fichier Excel, avec suivi de la délivrance des envois",

  "### Parc",
  "• Windows 11 : le build 26300 est affiché « 26H2 » dans la liste des versions (au lieu de « Insider (26300) »)",

  "### Corrections",
  "• Erreurs de build TypeScript (import inutilisé MagApp, typage des champs d'édition), erreur de syntaxe JSX du sélecteur d'année, suppression d'une demande refusée en 403 pour les non-superadmin"
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
