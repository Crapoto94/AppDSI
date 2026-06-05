module.exports = {
    validateCreate(data) {
        const errors = [];
        if (!data.title || typeof data.title !== 'string' || data.title.trim().length === 0) {
            errors.push('Le titre est requis');
        }
        if (data.title && data.title.length > 500) {
            errors.push('Le titre ne doit pas dépasser 500 caractères');
        }
        if (!data.requester_phone || typeof data.requester_phone !== 'string' || data.requester_phone.trim().length === 0) {
            errors.push('Le numéro de téléphone du demandeur est requis');
        }
        if (data.type && ![1, 2, '1', '2', 'incident', 'request'].includes(data.type)) {
            errors.push('Type invalide (1=incident, 2=demande)');
        }
        if (data.priority && (data.priority < 2 || data.priority > 5)) {
            errors.push('Priorité invalide (2-5)');
        }
        if (data.impact && (data.impact < 2 || data.impact > 5)) {
            errors.push('Impact invalide (2-5)');
        }
        if (data.status && (data.status < 1 || data.status > 8)) {
            errors.push('Statut invalide (1-8)');
        }
        return errors;
    },

    validateComment(data) {
        const errors = [];
        if (!data.content || typeof data.content !== 'string' || data.content.trim().length === 0) {
            errors.push('Le contenu du commentaire est requis');
        }
        return errors;
    },
};
