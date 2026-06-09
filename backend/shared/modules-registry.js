/**
 * Registre des « vrais modules » de l'application.
 *
 * Source de vérité unique pour le paramétrage « Modules de l'application »
 * (Configuration Hub). Contrairement aux tuiles (hub.tiles, simples cartes de
 * liens), ce sont des fonctionnalités à part entière avec leurs propres pages.
 *
 * Ajouter une entrée ici la fait apparaître automatiquement dans le panneau
 * d'administration (visible par défaut) et, si activée, comme tuile sur le hub.
 *
 * Champs :
 *   key         identifiant stable (clé en base hub.module_settings)
 *   title       libellé affiché
 *   icon        nom d'icône lucide-react (cf. Tile.tsx)
 *   description courte description affichée sur la tuile
 *   url         route interne du module
 */
const MODULES_REGISTRY = [
    { key: 'tickets',      title: 'Tickets & Support',     icon: 'Inbox',        description: 'Gestion des tickets et du support utilisateurs.', url: '/tickets' },
    { key: 'stocks',       title: 'Gestion des stocks',    icon: 'Package',      description: 'Réceptions, sorties, prêts et inventaire du matériel.', url: '/stocks' },
    { key: 'consommables', title: 'Consommables',          icon: 'ShoppingCart', description: 'Suivi et commandes de consommables.', url: '/consommables' },
    { key: 'contrats',     title: 'Contrats',              icon: 'FileText',     description: 'Suivi des contrats et échéances.', url: '/contrats' },
    { key: 'copieurs',     title: 'Copieurs',              icon: 'Printer',      description: 'Parc de copieurs et indicateurs.', url: '/copieurs' },
    { key: 'documents',    title: 'GED / Documents',       icon: 'HardDrive',    description: 'Gestion électronique des documents.', url: '/documents' },
    { key: 'telecom',      title: 'Télécom',               icon: 'Smartphone',   description: 'Gestion de la téléphonie et des lignes.', url: '/telecom' },
    { key: 'rencontres',   title: 'Rencontres budgétaires',icon: 'Calendar',     description: 'Préparation et suivi des rencontres budgétaires.', url: '/rencontres-budgetaires' },
    { key: 'projets',      title: 'Portefeuille projets',  icon: 'Layers',       description: 'Portefeuille et suivi des projets.', url: '/portefeuille-projets' },
    { key: 'transcript',   title: 'IA / Transcriptions',   icon: 'Brain',        description: 'Transcriptions de réunions et synthèses IA.', url: '/transcriptmanager' },
    { key: 'certif',       title: 'Certificats',           icon: 'Shield',       description: 'Suivi des certificats.', url: '/certif' },
    { key: 'calendrier',   title: 'Calendrier DSI',        icon: 'Calendar',     description: 'Calendrier et agents de la DSI.', url: '/calendrier-dsi' },
    { key: 'budget',       title: 'Budget',                icon: 'DollarSign',   description: 'Gestion budgétaire.', url: '/budget' },
    { key: 'doctrines',    title: 'Notes & doctrines',     icon: 'Book',         description: 'Notes de service et doctrines.', url: '/doctrines' },
    { key: 'reseau',       title: 'Réseau Ville',          icon: 'Network',      description: 'Cartographie du réseau inter-sites (fibre, WAN, opérateurs, fourreaux).', url: '/reseau' },
    { key: 'reunions',     title: 'Réunions',              icon: 'Calendar',     description: 'Réunions et comptes-rendus.', url: '/mes-reunions' },
    { key: 'magapp',       title: 'Magasin d\'applications',icon: 'AppWindow',    description: 'Galerie d\'applications et logiciels métiers.', url: '/admin/magapp' },
    { key: 'taches',       title: 'Mes Tâches',            icon: 'CheckSquare',  description: 'Gestion des tâches et suivis.', url: '/mes-taches' },
    { key: 'parc',         title: 'Parc informatique',     icon: 'Monitor',      description: 'Inventaire et suivi du parc informatique (équipements, déploiements, mobilité).', url: '/parc' },
    { key: 'rh',           title: 'Ressources Humaines',   icon: 'Users',        description: 'Gestion des agents DSI, contractuels et organigramme.', url: '/rh' },
];

module.exports = { MODULES_REGISTRY };
