/**
 * Shared configuration for the backend.
 * In a real production environment, these should be moved to environment variables (.env).
 */
module.exports = {
    SECRET_KEY: process.env.JWT_SECRET || 'votre_cle_secrete_ici',
    PORT: process.env.PORT || 3001,
    FOLDERS: ['uploads', 'file_commandes', 'file_factures', 'file_certif', 'magapp_img', 'file_telecom', 'file_reunions', 'logs']
};
