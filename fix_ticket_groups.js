const { pgDb } = require('./backend/shared/database');

async function fixTicketGroups() {
    try {
        console.log('Cleaning up null entries...');
        await pgDb.run('DELETE FROM hub_tickets.ticket_group_members WHERE group_id IS NULL OR id IS NULL');
        await pgDb.run('DELETE FROM hub_tickets.ticket_groups WHERE id IS NULL');

        console.log('Adding constraints to ticket_groups...');
        // In case they exist from previous attempts
        try { await pgDb.run('ALTER TABLE hub_tickets.ticket_groups ADD PRIMARY KEY (id)'); } catch(e) { console.log('PK on ticket_groups maybe already exists or error:', e.message); }
        
        // Ensure id uses the sequence
        try { await pgDb.run("ALTER TABLE hub_tickets.ticket_groups ALTER COLUMN id SET DEFAULT nextval('hub_tickets.ticket_groups_id_seq')"); } catch(e) { console.log('Sequence default error:', e.message); }
        
        // Ensure timestamps have defaults
        try { await pgDb.run('ALTER TABLE hub_tickets.ticket_groups ALTER COLUMN created_at SET DEFAULT CURRENT_TIMESTAMP'); } catch(e) {}
        try { await pgDb.run('ALTER TABLE hub_tickets.ticket_groups ALTER COLUMN updated_at SET DEFAULT CURRENT_TIMESTAMP'); } catch(e) {}

        console.log('Adding constraints to ticket_group_members...');
        try { await pgDb.run('ALTER TABLE hub_tickets.ticket_group_members ADD PRIMARY KEY (id)'); } catch(e) { console.log('PK on ticket_group_members error:', e.message); }
        try { await pgDb.run("ALTER TABLE hub_tickets.ticket_group_members ALTER COLUMN id SET DEFAULT nextval('hub_tickets.ticket_group_members_id_seq')"); } catch(e) {}
        try { await pgDb.run('ALTER TABLE hub_tickets.ticket_group_members ALTER COLUMN added_at SET DEFAULT CURRENT_TIMESTAMP'); } catch(e) {}
        
        // Add UNIQUE constraint on ticket_id if not exists
        try { await pgDb.run('ALTER TABLE hub_tickets.ticket_group_members ADD CONSTRAINT ticket_group_members_ticket_id_key UNIQUE (ticket_id)'); } catch(e) { console.log('Unique constraint error:', e.message); }

        console.log('Tables fixed successfully.');
    } catch (e) {
        console.error('Error during fix:', e.message);
    } finally {
        process.exit();
    }
}

fixTicketGroups();
