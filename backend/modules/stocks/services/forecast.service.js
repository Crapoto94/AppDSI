const { pgDb } = require('../../../shared/database');

/**
 * Prévision de rupture par article pour un magasin.
 * Consommation = somme des sorties ('out' + 'loan_out') sur `days` jours.
 * jours_avant_rupture = quantité_actuelle / conso_moyenne_journalière.
 *
 * @returns {Promise<Array>} articles triés par urgence (rupture imminente d'abord)
 */
async function forecast(storeId, days = 60) {
    const rows = await pgDb.all(
        `WITH consumption AS (
            SELECT item_id, COALESCE(SUM(quantity), 0)::int AS consumed
            FROM hub_stocks.movements
            WHERE store_id = $1
              AND type IN ('out', 'loan_out')
              AND created_at >= CURRENT_DATE - ($2 || ' days')::interval
            GROUP BY item_id
        ),
        stock AS (
            SELECT sl.item_id,
                   SUM(CASE WHEN sl.stock_type = 'normal' THEN sl.quantity ELSE 0 END)::int AS qty_normal,
                   MAX(sl.min_threshold)::int AS level_threshold
            FROM hub_stocks.stock_levels sl
            WHERE sl.store_id = $1
            GROUP BY sl.item_id
        )
        SELECT i.id AS item_id, i.label, i.reference, i.unit,
               COALESCE(s.qty_normal, 0) AS quantity,
               GREATEST(COALESCE(s.level_threshold, 0), COALESCE(i.min_threshold, 0)) AS min_threshold,
               COALESCE(c.consumed, 0) AS consumed
        FROM stock s
        JOIN hub_stocks.items i ON i.id = s.item_id
        LEFT JOIN consumption c ON c.item_id = s.item_id
        ORDER BY i.label ASC`,
        [storeId, days]
    );

    const result = rows.map(r => {
        const avgPerDay = r.consumed > 0 ? r.consumed / days : 0;
        const daysToRupture = avgPerDay > 0 ? Math.floor(r.quantity / avgPerDay) : null;
        const belowThreshold = (r.min_threshold || 0) > 0 && r.quantity <= r.min_threshold;
        let severity = 'ok';
        if (r.quantity <= 0) severity = 'rupture';
        else if (belowThreshold) severity = 'critical';
        else if (daysToRupture !== null && daysToRupture <= 14) severity = 'warning';
        return {
            item_id: r.item_id, label: r.label, reference: r.reference, unit: r.unit,
            quantity: r.quantity, min_threshold: r.min_threshold, consumed: r.consumed,
            avg_per_day: Math.round(avgPerDay * 100) / 100,
            days_to_rupture: daysToRupture, below_threshold: belowThreshold, severity,
        };
    });

    const rank = { rupture: 0, critical: 1, warning: 2, ok: 3 };
    result.sort((a, b) => {
        if (rank[a.severity] !== rank[b.severity]) return rank[a.severity] - rank[b.severity];
        const da = a.days_to_rupture ?? Infinity;
        const db = b.days_to_rupture ?? Infinity;
        return da - db;
    });
    return result;
}

module.exports = { forecast };
