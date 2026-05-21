const { Pool } = require('pg');

const pool = new Pool({
  user: process.env.POSTGRES_USER || 'postgres',
  host: process.env.POSTGRES_HOST || '10.103.130.106',
  database: process.env.POSTGRES_DB || 'ivry_admin',
  password: process.env.POSTGRES_PASSWORD || 'ivrypassword',
  port: process.env.POSTGRES_PORT || 5432,
});

const backlogItems = [
  {
    title: 'Bug\\AFE\\Impossible d\'activer la page de maintenance',
    description: 'Message erreur réseau ou server',
    category: 'Bug',
    created_by: 'System'
  },
  {
    title: 'Calcul des budgets en fonction des reports',
    description: '',
    category: 'Amélioration',
    created_by: 'System'
  },
  {
    title: 'Bug\\YT\\Lors de la recherche d\'un agent à rajouter en tant que participant à une réunion, il ne le trouve pas, ou alors il faut saisir le prénom pour qu\'il ressorte bien',
    description: '',
    category: 'Bug',
    created_by: 'System'
  },
  {
    title: 'Bug\\AFE\\Journal de maintenance\\Créneau horaire validé: 12h00 - 16h30\\Créneau horaire affiché: 14h00-18h30',
    description: '',
    category: 'Bug',
    created_by: 'System'
  },
  {
    title: 'Bug/FB/Portefeuille Projet demande d\'évolution passer d\'une étape à une autre du workflow projet et pouvoir revenir en arrière',
    description: '',
    category: 'Bug',
    created_by: 'System'
  },
  {
    title: 'Gestion des copieurs',
    description: '',
    category: 'Nouvelle fonctionnalité',
    created_by: 'System'
  },
  {
    title: 'Création d\'un ncalendrier DSI',
    description: '',
    category: 'Nouvelle fonctionnalité',
    created_by: 'System'
  },
  {
    title: 'Pouvoir ajouter "prestataire" lors de l\'ajout de participant à une réunion, actuellement uniquement "métier"',
    description: '',
    category: 'Amélioration',
    created_by: 'System'
  },
  {
    title: 'Classer les réunions des plus récentes aux plus anciennes',
    description: '',
    category: 'Amélioration',
    created_by: 'System'
  },
  {
    title: 'Pouvoir modifier le titre d\'une réunion déjà créée',
    description: '',
    category: 'Amélioration',
    created_by: 'System'
  },
  {
    title: 'Bug\\YT\\Le bouton "enregistrer" lors de la création d\'une réunion ne fonctionne pas, il faut cliquer sur la croix pour fermer la fenêtre',
    description: '',
    category: 'Bug',
    created_by: 'System'
  },
  {
    title: 'BUG !',
    description: '',
    category: 'Bug',
    created_by: 'System'
  },
  {
    title: 'Bug/FB/ Portefeuille projet mettre des asterix quand un champs est obligatoire pour passer à l\'écran suivant ou étape',
    description: '',
    category: 'Bug',
    created_by: 'System'
  },
  {
    title: 'Log des emails envoyés - table de logs générale (CNX etc...)',
    description: '',
    category: 'Amélioration',
    created_by: 'System'
  },
  {
    title: 'mise en evre de chatbot / Chatlive',
    description: '',
    category: 'Nouvelle fonctionnalité',
    created_by: 'System'
  },
  {
    title: 'demandes de commandes',
    description: '',
    category: 'Nouvelle fonctionnalité',
    created_by: 'System'
  },
  {
    title: 'Gestion des téléphone manager et envoi auto de SMS',
    description: '',
    category: 'Nouvelle fonctionnalité',
    created_by: 'System'
  },
  {
    title: 'Passge santé des apps en back',
    description: '',
    category: 'Amélioration',
    created_by: 'System'
  },
  {
    title: 'Magapp : Page status des services. Ex : https://status.pix.org/?locale=fr',
    description: '',
    category: 'Nouvelle fonctionnalité',
    created_by: 'System'
  },
  {
    title: 'amélioration synchro GLPI',
    description: '',
    category: 'Amélioration',
    created_by: 'System'
  }
];

async function runMigration() {
  try {
    console.log(`Adding ${backlogItems.length} items to backlog...`);

    for (const item of backlogItems) {
      await pool.query(
        `INSERT INTO hub.backlog (title, description, category, status, user_id, created_by, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())`,
        [item.title, item.description, item.category, 'open', 0, item.created_by]
      );
    }

    console.log('✅ Migration completed: backlog items populated successfully');
    process.exit(0);
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    process.exit(1);
  }
}

runMigration();
