const repo = require('../repositories/bl-template.repository');
const docs = require('../../../shared/documents.service');

module.exports = {
    list(category) { return repo.list(category); },
    get(id) { return repo.get(id); },
    getDefault() { return repo.getDefault(); },

    async create(data, user) {
        if (!data.name) throw new Error('Nom requis');
        const id = await repo.create({ ...data, created_by: user?.username });
        return repo.get(id);
    },

    async update(id, data) {
        await repo.update(id, data);
        return repo.get(id);
    },

    async remove(id) {
        await repo.remove(id);
        return { ok: true };
    },

    /** Upload du PDF de fond via le service documents générique. */
    async uploadBase(id, file, user) {
        if (!file) throw new Error('Fichier PDF requis');
        const { document } = await docs.uploadDocument({
            file, module: 'stocks', entityType: 'bl_template_base', entityId: id,
            title: file.originalname, uploadedBy: user?.username,
        });
        await repo.setBaseDocument(id, document.id);
        return repo.get(id);
    },
};
