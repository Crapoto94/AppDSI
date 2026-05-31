const repo = require('./repositories/stock.repository');
const stockService = require('./services/stock.service');
const receptionService = require('./services/reception.service');
const deliveryService = require('./services/delivery.service');
const loanService = require('./services/loan.service');
const forecastService = require('./services/forecast.service');
const blTemplateService = require('./services/bl-template.service');
const eanService = require('./services/ean-lookup.service');
const financeController = require('../finance/finance.controller');
const { resolveStoreRole, listAccessibleStores } = require('./middleware/store-permissions');
const { isAdminLike } = require('../../shared/middleware');

// Helper : l'utilisateur est-il manager d'au moins un magasin (ou admin global) ?
async function isManagerAnywhere(user) {
    if (isAdminLike(user)) return true;
    const stores = await listAccessibleStores(user);
    return stores.some(s => s.role === 'manager');
}

module.exports = {
    // ─── Rôle / magasins accessibles ─────────────────────────
    async getMyRole(req, res) {
        try {
            const stores = await listAccessibleStores(req.user);
            const storeId = req.query.store_id ? parseInt(req.query.store_id, 10) : null;
            const role = storeId ? await resolveStoreRole(req.user, storeId) : null;
            res.json({
                is_admin: isAdminLike(req.user),
                stores,                 // [{ store_id, role }]
                store_id: storeId,
                role,                   // rôle sur le magasin demandé (si store_id)
            });
        } catch (e) {
            res.status(500).json({ message: e.message });
        }
    },

    // ─── Magasins ────────────────────────────────────────────
    async listStores(req, res) {
        try {
            const accessible = await listAccessibleStores(req.user);
            const ids = new Set(accessible.map(s => s.store_id));
            const all = await repo.listStores();
            const roleByStore = Object.fromEntries(accessible.map(s => [s.store_id, s.role]));
            const visible = isAdminLike(req.user) ? all : all.filter(s => ids.has(s.id));
            res.json(visible.map(s => ({ ...s, my_role: roleByStore[s.id] || (isAdminLike(req.user) ? 'manager' : null) })));
        } catch (e) {
            res.status(500).json({ message: e.message });
        }
    },
    async createStore(req, res) {
        try {
            const id = await repo.createStore(req.body);
            res.status(201).json({ id });
        } catch (e) {
            res.status(400).json({ message: e.message });
        }
    },
    async updateStore(req, res) {
        try {
            await repo.updateStore(parseInt(req.params.id, 10), req.body);
            res.json({ ok: true });
        } catch (e) {
            res.status(400).json({ message: e.message });
        }
    },
    async deleteStore(req, res) {
        try {
            await repo.deleteStore(parseInt(req.params.id, 10));
            res.json({ ok: true });
        } catch (e) {
            res.status(400).json({ message: e.message });
        }
    },

    // ─── Membres ─────────────────────────────────────────────
    async listMembers(req, res) {
        try {
            res.json(await repo.listMembers(req.storeId));
        } catch (e) {
            res.status(500).json({ message: e.message });
        }
    },
    async upsertMember(req, res) {
        try {
            const { username, role } = req.body;
            if (!username || !['viewer', 'operator', 'manager'].includes(role)) {
                return res.status(400).json({ message: 'username et role (viewer|operator|manager) requis' });
            }
            await repo.upsertMember(req.storeId, username, role);
            res.json({ ok: true });
        } catch (e) {
            res.status(400).json({ message: e.message });
        }
    },
    async removeMember(req, res) {
        try {
            await repo.removeMember(req.storeId, parseInt(req.params.memberId, 10));
            res.json({ ok: true });
        } catch (e) {
            res.status(400).json({ message: e.message });
        }
    },

    // ─── Lieux de stockage ───────────────────────────────────
    async listLocations(req, res) {
        try {
            res.json(await repo.listLocations(req.storeId));
        } catch (e) {
            res.status(500).json({ message: e.message });
        }
    },
    async createLocation(req, res) {
        try {
            const id = await repo.createLocation({ ...req.body, store_id: req.storeId });
            res.status(201).json({ id });
        } catch (e) {
            res.status(400).json({ message: e.message });
        }
    },
    async updateLocation(req, res) {
        try {
            await repo.updateLocation(parseInt(req.params.id, 10), req.body);
            res.json({ ok: true });
        } catch (e) {
            res.status(400).json({ message: e.message });
        }
    },
    async deleteLocation(req, res) {
        try {
            await repo.deleteLocation(parseInt(req.params.id, 10));
            res.json({ ok: true });
        } catch (e) {
            res.status(400).json({ message: e.message });
        }
    },

    // ─── Catalogue articles ──────────────────────────────────
    async listItems(req, res) {
        try {
            res.json(await repo.listItems({ search: req.query.search, category: req.query.category }));
        } catch (e) {
            res.status(500).json({ message: e.message });
        }
    },
    async getItem(req, res) {
        try {
            const item = await repo.getItem(parseInt(req.params.id, 10));
            if (!item) return res.status(404).json({ message: 'Article introuvable' });
            res.json(item);
        } catch (e) {
            res.status(500).json({ message: e.message });
        }
    },
    async createItem(req, res) {
        try {
            if (!(await isManagerAnywhere(req.user))) return res.status(403).json({ message: 'Permission refusée' });
            if (!req.body.label) return res.status(400).json({ message: 'label requis' });
            const id = await repo.createItem(req.body);
            res.status(201).json({ id });
        } catch (e) {
            res.status(400).json({ message: e.message });
        }
    },
    async updateItem(req, res) {
        try {
            if (!(await isManagerAnywhere(req.user))) return res.status(403).json({ message: 'Permission refusée' });
            await repo.updateItem(parseInt(req.params.id, 10), req.body);
            res.json({ ok: true });
        } catch (e) {
            res.status(400).json({ message: e.message });
        }
    },
    async deleteItem(req, res) {
        try {
            if (!(await isManagerAnywhere(req.user))) return res.status(403).json({ message: 'Permission refusée' });
            await repo.deleteItem(parseInt(req.params.id, 10));
            res.json({ ok: true });
        } catch (e) {
            res.status(400).json({ message: e.message });
        }
    },

    // ─── Niveaux de stock ────────────────────────────────────
    async getStockLevels(req, res) {
        try {
            res.json(await repo.getStockLevels(req.storeId, { stock_type: req.query.stock_type }));
        } catch (e) {
            res.status(500).json({ message: e.message });
        }
    },
    async updateThreshold(req, res) {
        try {
            await repo.updateLevelThreshold(parseInt(req.params.id, 10), req.storeId, parseInt(req.body.min_threshold, 10) || 0);
            res.json({ ok: true });
        } catch (e) {
            res.status(400).json({ message: e.message });
        }
    },

    // ─── Mouvements ──────────────────────────────────────────
    async listMovements(req, res) {
        try {
            res.json(await repo.listMovements(req.storeId, {
                item_id: req.query.item_id ? parseInt(req.query.item_id, 10) : null,
                limit: parseInt(req.query.limit, 10) || 100,
                offset: parseInt(req.query.offset, 10) || 0,
            }));
        } catch (e) {
            res.status(500).json({ message: e.message });
        }
    },
    async createMovement(req, res) {
        try {
            const result = await stockService.applyMovement({
                ...req.body,
                store_id: req.storeId,
                created_by: req.user?.username,
            });
            res.status(201).json(result);
        } catch (e) {
            if (e.code === 'INSUFFICIENT_STOCK') return res.status(409).json({ message: e.message });
            res.status(400).json({ message: e.message });
        }
    },

    // ─── Commandes budgétaires (proxy) ───────────────────────
    async listOrders(req, res) {
        // Délègue au contrôleur finance (lecture Oracle commandes)
        return financeController.getOrders(req, res);
    },

    // ─── Lookup EAN / code-barres ────────────────────────────
    async eanLookup(req, res) {
        try {
            const result = await eanService.lookupByEan(req.params.code);
            res.json(result);
        } catch (e) {
            res.status(500).json({ message: e.message });
        }
    },

    // ─── Réceptions ──────────────────────────────────────────
    async listReceptions(req, res) {
        try {
            res.json(await receptionService.listReceptions(req.storeId));
        } catch (e) {
            res.status(500).json({ message: e.message });
        }
    },
    async createReception(req, res) {
        try {
            const reception = await receptionService.createReception({
                ...req.body,
                store_id: req.storeId,
                received_by: req.user?.username,
            });
            res.status(201).json(reception);
        } catch (e) {
            res.status(400).json({ message: e.message });
        }
    },
    async getReception(req, res) {
        try {
            const detail = await receptionService.getReceptionDetail(parseInt(req.params.id, 10));
            if (!detail) return res.status(404).json({ message: 'Réception introuvable' });
            res.json(detail);
        } catch (e) {
            res.status(500).json({ message: e.message });
        }
    },
    async addReceptionLine(req, res) {
        try {
            res.status(201).json(await receptionService.addLine(parseInt(req.params.id, 10), req.body));
        } catch (e) {
            res.status(400).json({ message: e.message });
        }
    },
    async deleteReceptionLine(req, res) {
        try {
            await receptionService.deleteLine(parseInt(req.params.id, 10), parseInt(req.params.lineId, 10));
            res.json({ ok: true });
        } catch (e) {
            res.status(400).json({ message: e.message });
        }
    },
    async validateReception(req, res) {
        try {
            res.json(await receptionService.validateReception(parseInt(req.params.id, 10), req.user));
        } catch (e) {
            if (e.code === 'INSUFFICIENT_STOCK') return res.status(409).json({ message: e.message });
            res.status(400).json({ message: e.message });
        }
    },

    // ─── Articles sérialisés ─────────────────────────────────
    async listSerialItems(req, res) {
        try {
            res.json(await receptionService.listSerialItems({
                store_id: req.storeId,
                status: req.query.status,
                missing_serial: req.query.missing_serial === '1' || req.query.missing_serial === 'true',
            }));
        } catch (e) {
            res.status(500).json({ message: e.message });
        }
    },
    async setSerialNumber(req, res) {
        try {
            res.json(await receptionService.setSerialNumber(parseInt(req.params.id, 10), req.storeId, req.body.serial_number));
        } catch (e) {
            res.status(400).json({ message: e.message });
        }
    },

    // ─── Sorties / livraisons (BL — 2 phases) ────────────────
    async listDeliveries(req, res) {
        try {
            res.json(await deliveryService.listDeliveries(req.storeId, req.query.status));
        } catch (e) {
            res.status(500).json({ message: e.message });
        }
    },
    // Phase 1 : préparation (décrément stock + signature préparateur + BL pré-signé)
    async prepareDelivery(req, res) {
        try {
            const delivery = await deliveryService.prepareDelivery({ ...req.body, store_id: req.storeId }, req.user);
            res.status(201).json(delivery);
        } catch (e) {
            if (e.code === 'INSUFFICIENT_STOCK') return res.status(409).json({ message: e.message });
            res.status(400).json({ message: e.message });
        }
    },
    // Phase 2 : livraison (signature destinataire + régénération BL)
    async deliverDelivery(req, res) {
        try {
            const delivery = await deliveryService.deliverDelivery(parseInt(req.params.id, 10), req.storeId, req.body.recipient_signature, req.user);
            res.json(delivery);
        } catch (e) {
            res.status(400).json({ message: e.message });
        }
    },
    async getDelivery(req, res) {
        try {
            const d = await deliveryService.getDelivery(parseInt(req.params.id, 10));
            if (!d) return res.status(404).json({ message: 'Sortie introuvable' });
            res.json(d);
        } catch (e) {
            res.status(500).json({ message: e.message });
        }
    },

    // ─── Gabarits de BL ──────────────────────────────────────
    async listBlTemplates(req, res) {
        try { res.json(await blTemplateService.list()); }
        catch (e) { res.status(500).json({ message: e.message }); }
    },
    async getBlTemplate(req, res) {
        try {
            const t = await blTemplateService.get(parseInt(req.params.id, 10));
            if (!t) return res.status(404).json({ message: 'Gabarit introuvable' });
            res.json(t);
        } catch (e) { res.status(500).json({ message: e.message }); }
    },
    async createBlTemplate(req, res) {
        try {
            if (!(await isManagerAnywhere(req.user))) return res.status(403).json({ message: 'Permission refusée' });
            res.status(201).json(await blTemplateService.create(req.body, req.user));
        } catch (e) { res.status(400).json({ message: e.message }); }
    },
    async updateBlTemplate(req, res) {
        try {
            if (!(await isManagerAnywhere(req.user))) return res.status(403).json({ message: 'Permission refusée' });
            res.json(await blTemplateService.update(parseInt(req.params.id, 10), req.body));
        } catch (e) { res.status(400).json({ message: e.message }); }
    },
    async deleteBlTemplate(req, res) {
        try {
            if (!(await isManagerAnywhere(req.user))) return res.status(403).json({ message: 'Permission refusée' });
            res.json(await blTemplateService.remove(parseInt(req.params.id, 10)));
        } catch (e) { res.status(400).json({ message: e.message }); }
    },
    async uploadBlTemplateBase(req, res) {
        try {
            if (!(await isManagerAnywhere(req.user))) return res.status(403).json({ message: 'Permission refusée' });
            if (!req.file) return res.status(400).json({ message: 'Fichier PDF requis' });
            res.json(await blTemplateService.uploadBase(parseInt(req.params.id, 10), req.file, req.user));
        } catch (e) { res.status(400).json({ message: e.message }); }
    },

    // ─── Prêts ───────────────────────────────────────────────
    async listLoans(req, res) {
        try {
            res.json(await loanService.listLoans(req.storeId, req.query.status));
        } catch (e) {
            res.status(500).json({ message: e.message });
        }
    },
    async createLoan(req, res) {
        try {
            const loan = await loanService.createLoan({ ...req.body, store_id: req.storeId }, req.user);
            res.status(201).json(loan);
        } catch (e) {
            if (e.code === 'INSUFFICIENT_STOCK') return res.status(409).json({ message: e.message });
            res.status(400).json({ message: e.message });
        }
    },
    async returnLoan(req, res) {
        try {
            res.json(await loanService.returnLoan(parseInt(req.params.id, 10), req.storeId, req.user));
        } catch (e) {
            res.status(400).json({ message: e.message });
        }
    },

    // ─── Prévision / ruptures ────────────────────────────────
    async getForecast(req, res) {
        try {
            const days = parseInt(req.query.days, 10) || 60;
            res.json(await forecastService.forecast(req.storeId, days));
        } catch (e) {
            res.status(500).json({ message: e.message });
        }
    },
};
