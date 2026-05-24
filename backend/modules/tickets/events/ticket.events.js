// Définition des événements du module tickets
// Utilisé par notification.service.js pour le matching déclencheur ↔ template

const EVENTS = [
    'ticket.created',
    'ticket.assigned',
    'ticket.status_changed',
    'ticket.comment_added',
    'ticket.sla_warning',
    'ticket.sla_breached',
    'ticket.resolved',
    'ticket.closed',
    'ticket.reopened',
];

const EVENT_LABELS = {
    'ticket.created': 'Création de ticket',
    'ticket.assigned': 'Assignation de ticket',
    'ticket.status_changed': 'Changement de statut',
    'ticket.comment_added': 'Nouveau commentaire',
    'ticket.sla_warning': 'Alerte SLA (limite proche)',
    'ticket.sla_breached': 'Dépassement SLA',
    'ticket.resolved': 'Ticket résolu',
    'ticket.closed': 'Ticket fermé',
    'ticket.reopened': 'Ticket réouvert',
};

const RECIPIENT_TYPES = ['requester', 'technician', 'group', 'supervisor', 'admin', 'watchers'];

module.exports = { EVENTS, EVENT_LABELS, RECIPIENT_TYPES };
