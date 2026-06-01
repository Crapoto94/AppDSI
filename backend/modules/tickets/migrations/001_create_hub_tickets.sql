-- Migration: Création des tables d'extension hub_tickets
-- Les tables core (tickets, ticket_status, observers, ticket_followups) sont déjà créées via setupPgDb

-- Copie des données glpi → hub_tickets
INSERT INTO hub_tickets.tickets
SELECT * FROM glpi.tickets
ON CONFLICT (glpi_id) DO NOTHING;

INSERT INTO hub_tickets.ticket_status (id, label)
SELECT id, label FROM glpi.ticket_status
ON CONFLICT (id) DO NOTHING;

-- Ajout des statuts spécifiques hub (si non existants)
INSERT INTO hub_tickets.ticket_status (id, label) VALUES
(4, 'En attente utilisateur'),
(5, 'Résolu'), (6, 'Fermé'),
(8, 'Rejeté')
ON CONFLICT (id) DO NOTHING;

INSERT INTO hub_tickets.observers (ticket_id, user_id, name, login, email)
SELECT ticket_id, user_id, name, login, email FROM glpi.observers
ON CONFLICT (ticket_id, user_id) DO NOTHING;

INSERT INTO hub_tickets.ticket_followups (ticket_id, content, content_hash, author_name, author_email, is_private, date_creation)
SELECT ticket_id, content, content_hash, author_name, author_email, is_private, date_creation FROM glpi.ticket_followups
ON CONFLICT (ticket_id, content_hash, date_creation) DO NOTHING;

-- Seed statuts par défaut pour les nouveaux tickets
INSERT INTO hub_tickets.ticket_sequence (last_id)
SELECT COALESCE(MAX(glpi_id), 10000000) FROM hub_tickets.tickets;

-- Seed notification templates
INSERT INTO hub_tickets.notification_templates (slug, label, subject, body_html) VALUES
('ticket_created', 'Création de ticket',
 '{{app_name}} - Ticket #{{ticket_id}} créé : {{ticket_title}}',
 '<h2>Ticket #{{ticket_id}} - {{ticket_title}}</h2><p>Bonjour {{recipient_name}},</p><p>Un nouveau ticket a été créé :</p><table cellpadding="4"><tr><td><strong>Priorité :</strong></td><td>{{priority_label}}</td></tr><tr><td><strong>Type :</strong></td><td>{{type_label}}</td></tr><tr><td><strong>Statut :</strong></td><td>{{status_label}}</td></tr></table><p>{{ticket_content}}</p><p><a href="{{app_url}}/tickets/{{ticket_id}}" style="background:#6366f1;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;">Voir le ticket</a></p>'),
('ticket_assigned', 'Assignation de ticket',
 '{{app_name}} - Ticket #{{ticket_id}} vous a été assigné',
 '<h2>Ticket #{{ticket_id}} - {{ticket_title}}</h2><p>Bonjour {{assignee_name}},</p><p>Le ticket <strong>#{{ticket_id}}</strong> vous a été assigné.</p><table cellpadding="4"><tr><td><strong>Priorité :</strong></td><td>{{priority_label}}</td></tr><tr><td><strong>Demandeur :</strong></td><td>{{requester_name}}</td></tr></table><p><a href="{{app_url}}/tickets/{{ticket_id}}" style="background:#6366f1;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;">Voir le ticket</a></p>'),
('ticket_status_changed', 'Changement de statut',
 '{{app_name}} - Ticket #{{ticket_id}} : {{old_status}} → {{new_status}}',
 '<h2>Ticket #{{ticket_id}} - {{ticket_title}}</h2><p>Le statut du ticket est passé de <strong>{{old_status}}</strong> à <strong>{{new_status}}</strong>.</p><p><a href="{{app_url}}/tickets/{{ticket_id}}" style="background:#6366f1;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;">Voir le ticket</a></p>'),
('ticket_new_comment', 'Nouveau commentaire',
 '{{app_name}} - Nouveau commentaire sur le ticket #{{ticket_id}}',
 '<h2>Ticket #{{ticket_id}} - {{ticket_title}}</h2><p><strong>{{author_name}}</strong> a ajouté un commentaire :</p><blockquote style="border-left:4px solid #6366f1;padding:8px 16px;margin:8px 0;">{{comment_content}}</blockquote><p><a href="{{app_url}}/tickets/{{ticket_id}}" style="background:#6366f1;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;">Voir le ticket</a></p>'),
('sla_warning', 'Alerte SLA - Limite proche',
 '{{app_name}} - ALERTE SLA : Ticket #{{ticket_id}} approche de la limite',
 '<h2>⚠️ Alerte SLA</h2><p>Le ticket <strong>#{{ticket_id}} - {{ticket_title}}</strong> approche de sa deadline.</p><p><strong>{{sla_type}} :</strong> {{sla_deadline}}</p><p><a href="{{app_url}}/tickets/{{ticket_id}}" style="background:#ef4444;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;">Agir maintenant</a></p>'),
('sla_breached', 'Dépassement SLA',
 '{{app_name}} - DÉPASSEMENT SLA : Ticket #{{ticket_id}}',
 '<h2>🚨 Dépassement SLA</h2><p>Le ticket <strong>#{{ticket_id}} - {{ticket_title}}</strong> a dépassé sa deadline.</p><p><strong>{{sla_type}} :</strong> {{sla_deadline}}</p><p><a href="{{app_url}}/tickets/{{ticket_id}}" style="background:#dc2626;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;">Voir le ticket</a></p>'),
('ticket_resolved', 'Ticket résolu',
 '{{app_name}} - Ticket #{{ticket_id}} résolu',
 '<h2>Ticket #{{ticket_id}} - {{ticket_title}}</h2><p>Bonjour {{recipient_name}},</p><p>Votre ticket a été résolu par <strong>{{technician_name}}</strong>.</p><blockquote style="border-left:4px solid #22c55e;padding:8px 16px;margin:8px 0;">{{solution_text}}</blockquote><p><a href="{{app_url}}/tickets/{{ticket_id}}" style="background:#22c55e;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;">Voir la solution</a></p>'),
('ticket_closed', 'Ticket fermé',
 '{{app_name}} - Ticket #{{ticket_id}} fermé',
 '<h2>Ticket #{{ticket_id}} - {{ticket_title}}</h2><p>Le ticket est maintenant fermé.</p>'),
('ticket_reopened', 'Ticket réouvert',
 '{{app_name}} - Ticket #{{ticket_id}} réouvert',
 '<h2>Ticket #{{ticket_id}} - {{ticket_title}}</h2><p>Le ticket a été réouvert par <strong>{{reopened_by}}</strong>.</p><p><a href="{{app_url}}/tickets/{{ticket_id}}" style="background:#f59e0b;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;">Voir le ticket</a></p>'),
('ticket_comment_reply', 'Réponse au commentaire',
 '{{app_name}} - Ticket #{{ticket_id}} : Réponse reçue',
 '<h2>Ticket #{{ticket_id}} - {{ticket_title}}</h2><p>Bonjour {{recipient_name}},</p><p>Il y a une réponse à votre demande :</p><blockquote style="border-left:4px solid #6366f1;padding:8px 16px;margin:8px 0;">{{comment_content}}</blockquote><p>Voir <strong>{{author_name}}</strong> a répondu à votre ticket.</p><p><a href="{{app_url}}/tickets/{{ticket_id}}" style="background:#6366f1;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;">Voir le ticket</a></p>')
ON CONFLICT (slug) DO NOTHING;

-- Seed déclencheurs de notifications par défaut
INSERT INTO hub_tickets.notification_triggers (event, template_slug, recipient_type) VALUES
-- Création de ticket
('ticket.created', 'ticket_created', 'requester'),
('ticket.created', 'ticket_created', 'technician'),
('ticket.created', 'ticket_created', 'group'),
('ticket.created', 'ticket_created', 'supervisor'),
('ticket.created', 'ticket_created', 'watchers'),
-- Assignation de ticket
('ticket.assigned', 'ticket_assigned', 'technician'),
('ticket.assigned', 'ticket_assigned', 'requester'),
('ticket.assigned', 'ticket_assigned', 'group'),
('ticket.assigned', 'ticket_assigned', 'supervisor'),
-- Changement de statut
('ticket.status_changed', 'ticket_status_changed', 'requester'),
('ticket.status_changed', 'ticket_status_changed', 'technician'),
('ticket.status_changed', 'ticket_status_changed', 'group'),
('ticket.status_changed', 'ticket_status_changed', 'watchers'),
-- Nouveau commentaire
('ticket.comment_added', 'ticket_new_comment', 'requester'),
('ticket.comment_added', 'ticket_new_comment', 'watchers'),
('ticket.comment_added', 'ticket_new_comment', 'technician'),
('ticket.comment_added', 'ticket_new_comment', 'group'),
-- Alerte SLA (limite proche)
('ticket.sla_warning', 'sla_warning', 'technician'),
('ticket.sla_warning', 'sla_warning', 'group'),
('ticket.sla_warning', 'sla_warning', 'supervisor'),
('ticket.sla_warning', 'sla_warning', 'admin'),
-- Dépassement SLA
('ticket.sla_breached', 'sla_breached', 'technician'),
('ticket.sla_breached', 'sla_breached', 'group'),
('ticket.sla_breached', 'sla_breached', 'supervisor'),
('ticket.sla_breached', 'sla_breached', 'admin'),
-- Ticket résolu
('ticket.resolved', 'ticket_resolved', 'requester'),
('ticket.resolved', 'ticket_resolved', 'watchers'),
('ticket.resolved', 'ticket_resolved', 'admin'),
-- Ticket fermé
('ticket.closed', 'ticket_closed', 'requester'),
('ticket.closed', 'ticket_closed', 'technician'),
('ticket.closed', 'ticket_closed', 'group'),
('ticket.closed', 'ticket_closed', 'admin'),
('ticket.closed', 'ticket_closed', 'watchers'),
-- Ticket réouvert
('ticket.reopened', 'ticket_reopened', 'technician'),
('ticket.reopened', 'ticket_reopened', 'group'),
('ticket.reopened', 'ticket_reopened', 'supervisor'),
('ticket.reopened', 'ticket_reopened', 'watchers')
ON CONFLICT (event, recipient_type) DO NOTHING;

-- Seed calendrier ouvré par défaut
INSERT INTO hub_tickets.sla_calendars (id, name, description, timezone, is_default) VALUES
(1, 'Calendrier standard', 'Lundi-Vendredi 08:00-12:00 14:00-18:00', 'Europe/Paris', true)
ON CONFLICT (id) DO NOTHING;

INSERT INTO hub_tickets.sla_calendar_hours (calendar_id, day_of_week, start_time, end_time) VALUES
(1, 1, '08:00', '12:00'),
(1, 1, '14:00', '18:00'),
(1, 2, '08:00', '12:00'),
(1, 2, '14:00', '18:00'),
(1, 3, '08:00', '12:00'),
(1, 3, '14:00', '18:00'),
(1, 4, '08:00', '12:00'),
(1, 4, '14:00', '18:00'),
(1, 5, '08:00', '12:00'),
(1, 5, '14:00', '18:00')
ON CONFLICT (calendar_id, day_of_week, start_time) DO NOTHING;

-- Seed jours fériés français 2026
INSERT INTO hub_tickets.sla_holidays (calendar_id, holiday_date, label) VALUES
(1, '2026-01-01', 'Jour de l''an'),
(1, '2026-04-06', 'Lundi de Pâques'),
(1, '2026-05-01', 'Fête du Travail'),
(1, '2026-05-08', 'Victoire 1945'),
(1, '2026-05-14', 'Ascension'),
(1, '2026-05-25', 'Lundi de Pentecôte'),
(1, '2026-07-14', 'Fête nationale'),
(1, '2026-08-15', 'Assomption'),
(1, '2026-11-01', 'Toussaint'),
(1, '2026-11-11', 'Armistice'),
(1, '2026-12-25', 'Noël')
ON CONFLICT (calendar_id, holiday_date) DO NOTHING;

-- Seed priorités SLA par défaut
INSERT INTO hub_tickets.sla_definitions (name, description, calendar_id, first_response_min, resolution_min, escalation_min, priority) VALUES
('SLA Priorité 1 - Très haute', 'Incident critique : réponse < 15min, résolution < 1h', 1, 15, 60, 30, 1),
('SLA Priorité 2 - Haute', 'Incident majeur : réponse < 30min, résolution < 4h', 1, 30, 240, 120, 2),
('SLA Priorité 3 - Normale', 'Incident standard : réponse < 2h, résolution < 24h', 1, 120, 1440, 480, 3),
('SLA Priorité 4 - Basse', 'Demande simple : réponse < 8h, résolution < 72h', 1, 480, 4320, 1440, 4)
ON CONFLICT (id) DO NOTHING;

-- Seed règles d''escalade par défaut
INSERT INTO hub_tickets.sla_escalation_rules (sla_definition_id, escalation_level, trigger_before_min, notify_role, action)
SELECT sd.id, 1, NULL, 'supervisor', 'notify'
FROM hub_tickets.sla_definitions sd
WHERE NOT EXISTS (SELECT 1 FROM hub_tickets.sla_escalation_rules WHERE sla_definition_id = sd.id AND escalation_level = 1);

INSERT INTO hub_tickets.sla_escalation_rules (sla_definition_id, escalation_level, trigger_before_min, notify_role, action)
SELECT sd.id, 2, NULL, 'admin', 'notify'
FROM hub_tickets.sla_definitions sd
WHERE NOT EXISTS (SELECT 1 FROM hub_tickets.sla_escalation_rules WHERE sla_definition_id = sd.id AND escalation_level = 2);
