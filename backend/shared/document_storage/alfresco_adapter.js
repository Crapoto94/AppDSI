/**
 * Adaptateur Alfresco — STUB.
 *
 * Pour activer Alfresco, implémenter ces 4 méthodes en utilisant l'API REST CMIS
 * d'Alfresco (POST /alfresco/api/-default-/public/alfresco/versions/1/nodes/.../children
 * pour write, GET .../content pour read, etc.). Storage ref = nodeRef Alfresco.
 *
 * Tant que ce stub est en place, ne pas configurer doc_backend = 'alfresco'.
 */
function notImplemented() {
    throw new Error('Adaptateur Alfresco non implémenté. Configurer doc_backend = "smb" ou implémenter alfresco_adapter.js.');
}

module.exports = {
    backendName: 'alfresco',
    async write() { notImplemented(); },
    async read() { notImplemented(); },
    async delete() { notImplemented(); },
    async exists() { notImplemented(); },
};
