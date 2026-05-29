const { pgDb } = require('../../../shared/database');
const slaRepo = require('../repositories/sla.repository');
const historyRepo = require('../repositories/history.repository');
const notificationService = require('./notification.service');

module.exports = {
    async applySLA(ticketId, ticketData) {
        const slaDef = await slaRepo.findMatchingDefinition(ticketData);
        if (!slaDef) return;

        const now = new Date();
        const firstResponseTarget = slaDef.first_response_min
            ? this.addBusinessMinutes(now, slaDef.first_response_min, slaDef.calendar_id)
            : null;
        const resolutionTarget = slaDef.resolution_min
            ? this.addBusinessMinutes(now, slaDef.resolution_min, slaDef.calendar_id)
            : null;

        await slaRepo.createForTicket(ticketId, slaDef.id, firstResponseTarget, resolutionTarget);
    },

    addBusinessMinutes(fromDate, minutes, calendarId = 1) {
        const WORK_START = { h: 8, m: 0 };
        const WORK_END = { h: 12, m: 0 };
        const WORK_START_PM = { h: 14, m: 0 };
        const WORK_END_PM = { h: 18, m: 0 };

        let current = new Date(fromDate);
        let remaining = minutes;

        while (remaining > 0) {
            const day = current.getDay();
            const isHoliday = false; // Vérification simplifiée

            if (day === 0 || day === 6 || isHoliday) {
                current.setDate(current.getDate() + 1);
                current.setHours(WORK_START.h, WORK_START.m, 0, 0);
                continue;
            }

            const hours = current.getHours();
            const mins = current.getMinutes();
            const currentMinutes = hours * 60 + mins;
            const morningStart = WORK_START.h * 60 + WORK_START.m;
            const morningEnd = WORK_END.h * 60 + WORK_END.m;
            const afternoonStart = WORK_START_PM.h * 60 + WORK_START_PM.m;
            const afternoonEnd = WORK_END_PM.h * 60 + WORK_END_PM.m;

            let availableNow = 0;
            if (currentMinutes < morningStart) {
                availableNow = morningEnd - morningStart;
                current.setHours(WORK_START.h, WORK_START.m, 0, 0);
            } else if (currentMinutes < morningEnd) {
                availableNow = morningEnd - currentMinutes;
            } else if (currentMinutes < afternoonStart) {
                availableNow = afternoonEnd - afternoonStart;
                current.setHours(WORK_START_PM.h, WORK_START_PM.m, 0, 0);
            } else if (currentMinutes < afternoonEnd) {
                availableNow = afternoonEnd - currentMinutes;
            } else {
                current.setDate(current.getDate() + 1);
                current.setHours(WORK_START.h, WORK_START.m, 0, 0);
                continue;
            }

            if (remaining <= availableNow) {
                current.setMinutes(current.getMinutes() + remaining);
                remaining = 0;
            } else {
                remaining -= availableNow;
                current.setDate(current.getDate() + 1);
                current.setHours(WORK_START.h, WORK_START.m, 0, 0);
            }
        }

        return current;
    },

    async checkSLAs() {
        const tickets = await pgDb.all(`
            SELECT ts.*, t.glpi_id, t.status, t.priority, t.title
            FROM hub_tickets.ticket_sla ts
            JOIN hub_tickets.tickets t ON ts.ticket_id = t.glpi_id
            WHERE ts.sla_status IN ('ok', 'warning')
              AND t.status NOT IN (4, 5, 7)
              AND t.source = 'hub'
        `);

        for (const sla of tickets) {
            const now = new Date();
            const firstTarget = sla.first_response_target ? new Date(sla.first_response_target) : null;
            const resolutionTarget = sla.resolution_target ? new Date(sla.resolution_target) : null;

            // Vérifier first_response
            if (firstTarget && !sla.first_response_at) {
                const pct = (now.getTime() - sla.created_at.getTime()) /
                    (firstTarget.getTime() - sla.created_at.getTime()) * 100;

                if (pct >= 100) {
                    await slaRepo.updateSlaStatus(sla.id, 'breached');
                    await historyRepo.log(sla.ticket_id, null, 'sla_breached', 'sla', 'ok', 'breached', 'Délai 1ère réponse dépassé');
                    await notificationService.trigger('ticket.sla_breached', {
                        ticket_id: sla.ticket_id, sla_data: sla, sla_type: 'first_response'
                    });
                } else if (pct >= 90 && sla.sla_status !== 'warning') {
                    await slaRepo.updateSlaStatus(sla.id, 'warning');
                    await notificationService.trigger('ticket.sla_warning', {
                        ticket_id: sla.ticket_id, sla_data: sla, sla_type: 'first_response'
                    });
                }
            }

            // Vérifier resolution
            if (resolutionTarget && !sla.resolved_at) {
                const pct = (now.getTime() - sla.created_at.getTime()) /
                    (resolutionTarget.getTime() - sla.created_at.getTime()) * 100;

                if (pct >= 100) {
                    await slaRepo.updateSlaStatus(sla.id, 'breached');
                    await historyRepo.log(sla.ticket_id, null, 'sla_breached', 'sla_resolution', 'ok', 'breached', 'Délai résolution dépassé');
                    await notificationService.trigger('ticket.sla_breached', {
                        ticket_id: sla.ticket_id, sla_data: sla, sla_type: 'resolution'
                    });
                } else if (pct >= 90 && sla.sla_status !== 'warning') {
                    await slaRepo.updateSlaStatus(sla.id, 'warning');
                    await notificationService.trigger('ticket.sla_warning', {
                        ticket_id: sla.ticket_id, sla_data: sla, sla_type: 'resolution'
                    });
                }
            }
        }
    },

    async getActiveBreaches() {
        return slaRepo.getActiveBreaches();
    },
};
