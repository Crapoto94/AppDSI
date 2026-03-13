async function updateTierStats(db) {
    console.log('Updating tier stats...');
    
    // Clear existing stats
    await db.run('DELETE FROM tier_stats');

    // Recompute stats
    // We match by name (nom) while trimming and converting to uppercase to be robust
    await db.run(`
        INSERT INTO tier_stats (tier_id, order_count, invoice_count)
        SELECT 
            t.id,
            (SELECT COUNT(*) FROM orders o WHERE TRIM(UPPER(o.Fournisseur)) = TRIM(UPPER(t.nom))),
            (SELECT COUNT(*) FROM invoices i WHERE TRIM(UPPER(i.Fournisseur)) = TRIM(UPPER(t.nom)))
        FROM tiers t
    `);
    
    console.log('Tier stats updated.');
}

module.exports = updateTierStats;
