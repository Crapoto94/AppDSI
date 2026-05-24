const IMPACT_NAMES = { 2: '1 utilisateur', 3: 'Groupe de travail', 4: 'Service / Direction', 5: 'Global' };

const STATUS_NAMES = {
    1: 'Nouveau', 2: 'Assigné', 3: 'En cours',
    4: 'En attente', 5: 'En attente',
    6: 'Résolu', 7: 'Fermé', 8: 'Rejeté'
};

const PRIORITY_NAMES = { 2: 'Basse', 3: 'Normale', 4: 'Haute', 5: 'Tres haute' };
const TYPE_NAMES = { 1: 'Incident', 2: 'Demande', 3: 'Problème' };

function computeActiveDays(ticket) {
    if (!ticket || !ticket.date_creation) return null;
    const start = new Date(ticket.date_creation).getTime();
    const end = ticket.date_solved
        ? new Date(ticket.date_solved).getTime()
        : ticket.date_closed
            ? new Date(ticket.date_closed).getTime()
            : Date.now();
    const totalSeconds = (end - start) / 1000;
    const waitingSeconds = ticket.total_waiting_seconds || 0;
    const activeSeconds = Math.max(0, totalSeconds - waitingSeconds);
    return Math.round(activeSeconds / 86400 * 10) / 10;
}

module.exports = {
    toDTO(ticket) {
        if (!ticket) return null;
        return {
            id: ticket.glpi_id,
            title: ticket.title,
            content: ticket.content,
            status: {
                id: ticket.status,
                label: STATUS_NAMES[ticket.status] || ticket.status_label || 'Inconnu'
            },
            priority: {
                id: ticket.priority,
                label: PRIORITY_NAMES[ticket.priority] || 'Normale'
            },
            urgency: ticket.urgency,
            type: ticket.type,
            type_label: TYPE_NAMES[ticket.type] || TYPE_NAMES[String(ticket.type)] || ticket.type,
            category: ticket.category,
            category_id: ticket.category_id,
            requester: {
                name: ticket.requester_name,
                email: ticket.requester_email_22
            },
            technician_id: ticket.technician_id,
            technician_name: ticket.technician_name,
            technician_status: ticket.technician_status,
            group_id: ticket.group_id,
            observer_count: ticket.observer_count,
            solution: ticket.solution,
            resolution_method: ticket.resolution_method || null,
            knowledge_article: ticket.knowledge_article || null,
            source: ticket.source,
            impact: { id: ticket.impact, label: IMPACT_NAMES[ticket.impact] || null },
            is_vip: !!ticket.is_vip,
            bundle: ticket.bundle_id ? {
                id: ticket.bundle_id,
                name: ticket.bundle_name,
                problem_ticket_id: ticket.bundle_problem_ticket_id || null,
            } : null,
            date_creation: ticket.date_creation,
            date_mod: ticket.date_mod,
            date_solved: ticket.date_solved,
            date_closed: ticket.date_closed,
            active_days: computeActiveDays(ticket),
        };
    },

    toListDTO(ticket) {
        if (!ticket) return null;
        return {
            id: ticket.glpi_id,
            title: ticket.title,
            status: { id: ticket.status, label: STATUS_NAMES[ticket.status] || ticket.status_label },
            priority: { id: ticket.priority, label: PRIORITY_NAMES[ticket.priority] },
            type: ticket.type,
            type_label: TYPE_NAMES[ticket.type] || TYPE_NAMES[String(ticket.type)] || ticket.type,
            requester_name: ticket.requester_name,
            requester_email: ticket.requester_email_22,
            technician_id: ticket.technician_id,
            technician_name: ticket.technician_name,
            technician_status: ticket.technician_status,
            group_id: ticket.group_id,
            observer_count: ticket.observer_count,
            history_count: ticket.history_count || 0,
            tasks_count: ticket.tasks_count || 0,
            impact: { id: ticket.impact, label: IMPACT_NAMES[ticket.impact] || null },
            is_vip: !!ticket.is_vip,
            bundle: ticket.bundle_id ? {
                id: ticket.bundle_id,
                name: ticket.bundle_name,
                problem_ticket_id: ticket.bundle_problem_ticket_id || null,
            } : null,
            date_creation: ticket.date_creation,
            date_mod: ticket.date_mod,
            software_id: ticket.software_id || null,
            software_name: ticket.software_name || null,
            category_id: ticket.category_id || null,
            category_name: ticket.category_name || null,
            subcategory_id: ticket.subcategory_id || null,
            subcategory_name: ticket.subcategory_name || null,
            active_days: computeActiveDays(ticket),
        };
    },

    toHistoryDTO(entry) {
        return {
            id: entry.id,
            action: entry.action,
            field_name: entry.field_name,
            old_value: entry.old_value,
            new_value: entry.new_value,
            comment: entry.comment,
            user_id: entry.user_id,
            created_at: entry.created_at,
        };
    }
};