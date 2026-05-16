const { Pool } = require('pg');
const p = new Pool({
  host: '10.103.130.106',
  port: 5432,
  user: 'postgres',
  password: 'ivrypassword',
  database: 'ivry_admin'
});

async function main() {
  try {
    const r = await p.query('SELECT DISTINCT "BUDGET_BUDGET", "BUDGET_LIBELLE" FROM oracle.gf_oracle_commande LIMIT 10');
    console.log('Distinct BUDGET_BUDGET values:');
    r.rows.forEach(x => console.log(`  BUDGET=${x.BUDGET_BUDGET}, LIBELLE=${x.BUDGET_LIBELLE}`));

    const r2 = await p.query('SELECT DISTINCT LEFT(TRIM("COMMANDE_ROO_IMA_REF"), 20) as ref, "BUDGET_BUDGET" FROM oracle.gf_oracle_commande LIMIT 10');
    console.log('\nSample COMMANDE_ROO_IMA_REF:');
    r2.rows.forEach(x => console.log(`  ref=${x.ref}..., BUDGET=${x.BUDGET_BUDGET}`));
  } catch (e) {
    console.error('Error:', e.message);
  }
  await p.end();
}

main();