/**
 * Guides de modules pour le MCP (outil `dsi_module_guide`).
 *
 * Les données de ces modules sont déjà interrogeables en SQL (rôle lecture seule), mais un modèle de langage ne devine ni le
 * sens des tables, ni leurs liens, ni les pièges de typage. Chaque guide donne : à quoi sert le module, ses tables clés,
 * les règles d'interprétation, et des requêtes types VALIDES (vérifiées contre le DDL par `scripts/check-dataquery-guides.js`).
 *
 * Les guides respectent les droits par agent : un module n'est présenté que si TOUS ses schémas sont autorisés pour l'agent.
 * Ajouter un module = ajouter une entrée ici, puis lancer `node backend/scripts/check-dataquery-guides.js`.
 */

const GUIDES = [
    {
        key: 'parc',
        label: 'Parc informatique',
        schemas: ['hub_parc'],
        description: "Inventaire du matériel (synchronisé depuis GLPI), usagers, lignes mobiles et appareils mobiles, postes de l'annuaire (AD).",
        tables: [
            { table: 'hub_parc.items', purpose: 'Un matériel par ligne (ordinateur, écran, imprimante, téléphone…).', key_columns: 'itemtype, type_key (famille), glpi_id, name, serial, otherserial (n° d\'inventaire), is_deleted, os, network, software_count, raw (jsonb : détail GLPI complet), last_sync' },
            { table: 'hub_parc.usagers', purpose: 'Agents rattachés au matériel (annuaire).', key_columns: 'ad_username, display_name, email, service, found' },
            { table: 'hub_parc.lignes_mobiles', purpose: 'Lignes mobiles de l\'opérateur (forfait, terminal, engagement).', key_columns: 'numero_ligne, operateur, nom, prenom, email, statut_ligne, forfait, terminal, imei, date_mise_en_service, date_fin_engagement' },
            { table: 'hub_parc.mobilite_devices', purpose: 'Appareils mobiles suivis (smartphones, tablettes) et leur dernier mouvement.', key_columns: 'device_key, imei, serial, modele, famille, numero_ligne, forfait, mdm, is_actif, dernier_util, last_service, last_statut, last_date, observations' },
            { table: 'hub_parc.ad_computers', purpose: 'Postes vus dans l\'annuaire Active Directory.', key_columns: 'name, operatingsystem, osversion, lastlogon, lastlogonuser, enabled, ou' },
            { table: 'hub_parc.sync_logs', purpose: 'Journal des synchronisations GLPI.', key_columns: 'started_at, finished_at, status, details' },
        ],
        notes: [
            'Toujours filtrer `NOT is_deleted` sur hub_parc.items (les matériels supprimés dans GLPI y restent).',
            "`raw` est un jsonb : inspecter un échantillon (`SELECT raw FROM hub_parc.items LIMIT 1`) avant d'utiliser `raw->>'clé'`.",
            "`statut_ligne` est un texte libre : lister d'abord ses valeurs (`SELECT statut_ligne, count(*) … GROUP BY 1`).",
            'Données personnelles (nom, e-mail, n° de ligne) : ne restituer que ce qui est nécessaire à la question.',
        ],
        examples: [
            { question: 'Combien de matériels par famille ?', sql: 'SELECT type_key, count(*) AS nb FROM hub_parc.items WHERE NOT is_deleted GROUP BY type_key ORDER BY nb DESC' },
            { question: 'Retrouver un matériel par nom, n° de série ou n° d\'inventaire', sql: "SELECT itemtype, type_key, name, serial, otherserial FROM hub_parc.items WHERE NOT is_deleted AND (name ILIKE '%' || $1 || '%' OR serial ILIKE '%' || $1 || '%' OR otherserial ILIKE '%' || $1 || '%') LIMIT 50", params: ['PC-123'] },
            { question: 'Répartition des lignes mobiles par statut', sql: 'SELECT statut_ligne, count(*) AS nb FROM hub_parc.lignes_mobiles GROUP BY statut_ligne ORDER BY nb DESC' },
            { question: 'Engagements de lignes mobiles qui se terminent dans 90 jours', sql: "SELECT numero_ligne, nom, prenom, forfait, terminal, date_fin_engagement FROM hub_parc.lignes_mobiles WHERE date_fin_engagement BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '90 days' ORDER BY date_fin_engagement" },
            { question: 'Appareils mobiles actifs par service', sql: 'SELECT last_service, count(*) AS nb FROM hub_parc.mobilite_devices WHERE is_actif GROUP BY last_service ORDER BY nb DESC' },
        ],
    },
    {
        key: 'telecom',
        label: 'Télécom / lignes',
        schemas: ['hub_telecom'],
        description: 'Inventaire des lignes et accès (fixe, internet), comptes de facturation, factures opérateur et facturation détaillée par ligne et par mois.',
        tables: [
            { table: 'hub_telecom.lines', purpose: 'Une ligne/accès par ligne (téléphonie fixe, accès internet).', key_columns: 'category, site_number, site_name, address, city, contract, billing_account, offer, access_type, ndi (n° de ligne), status, to_migrate, copper_end_lot, service_date' },
            { table: 'hub_telecom.line_billing', purpose: 'Facturation détaillée : une ligne de facture par ligne téléphonique et par mois.', key_columns: 'period (date, 1er du mois), invoice_number, site_name, line_number, user_name, plan, is_mobile, amt_total, amt_subscriptions, amt_voix_fixe, amt_voix_mobile, amt_data_fixe, amt_data_mobile, conso_voix, conso_data' },
            { table: 'hub_telecom.invoices', purpose: 'Factures opérateur (une par facture).', key_columns: 'invoice_number, operator_id, billing_account_id, amount_ttc, invoice_date' },
            { table: 'hub_telecom.operators', purpose: 'Opérateurs.', key_columns: 'id, name' },
            { table: 'hub_telecom.billing_accounts', purpose: 'Comptes de facturation (par opérateur).', key_columns: 'operator_id, account_number, type, designation, customer_number, market_number' },
            { table: 'hub_telecom.rejected_invoices', purpose: 'Factures rejetées et motif.', key_columns: 'invoice_number, reason, category, rejected_at' },
            { table: 'hub_telecom.monthly_comments', purpose: 'Commentaires mensuels par compte de facturation.', key_columns: 'billing_account_id, month, comment' },
        ],
        notes: [
            'Les coûts par ligne et par mois se lisent dans hub_telecom.line_billing (colonne amt_total, en euros) ; les montants de factures entières dans hub_telecom.invoices (amount_ttc).',
            '`period` est une date : utiliser `max(period)` pour le dernier mois facturé.',
            '`status` de hub_telecom.lines est un texte libre : lister ses valeurs avant de filtrer.',
            'Jointures : invoices.operator_id → operators.id ; invoices.billing_account_id → billing_accounts.id.',
        ],
        examples: [
            { question: 'Coût télécom des 12 derniers mois', sql: 'SELECT period, round(sum(amt_total), 2) AS total, count(*) AS nb_lignes FROM hub_telecom.line_billing GROUP BY period ORDER BY period DESC LIMIT 12' },
            { question: 'Sites les plus coûteux le dernier mois facturé', sql: 'SELECT site_name, round(sum(amt_total), 2) AS total FROM hub_telecom.line_billing WHERE period = (SELECT max(period) FROM hub_telecom.line_billing) GROUP BY site_name ORDER BY total DESC LIMIT 20' },
            { question: 'Lignes fixes restant à migrer, par catégorie', sql: 'SELECT category, count(*) AS nb FROM hub_telecom.lines WHERE to_migrate GROUP BY category ORDER BY nb DESC' },
            { question: 'Factures par opérateur et par mois', sql: "SELECT o.name AS operateur, date_trunc('month', i.invoice_date) AS mois, round(sum(i.amount_ttc), 2) AS total FROM hub_telecom.invoices i JOIN hub_telecom.operators o ON o.id = i.operator_id GROUP BY o.name, date_trunc('month', i.invoice_date) ORDER BY mois DESC, total DESC LIMIT 50" },
            { question: 'Répartition des statuts de lignes', sql: 'SELECT status, count(*) AS nb FROM hub_telecom.lines GROUP BY status ORDER BY nb DESC' },
        ],
    },
    {
        key: 'contrats',
        label: 'Contrats',
        schemas: ['hub_contrats'],
        description: 'Contrats et marchés de la Ville : objet, titulaire, échéances, montants annuels et prévisions, renouvellement, commandes liées.',
        tables: [
            { table: 'hub_contrats.contrats', purpose: 'Un contrat par ligne.', key_columns: 'id, objet, raison_sociale, tiers, type_contrat, direction, service, nature, date_debut, date_fin (date), duree_annees, nb_reconductions, reconduction, statut, renouvellement_statut, montant_2022…montant_2026, prevision_2026…prevision_2029, gti, gtr, penalite, indice_revision' },
            { table: 'hub_contrats.contrats_liaisons', purpose: 'Commandes et engagements liés à un contrat.', key_columns: 'contrat_id, commande_numero, commande_libelle, commande_montant, date_commande, engagement_code, lien_annee' },
            { table: 'hub_contrats.contrat_documents', purpose: 'Documents rattachés (contrat, avenants…).', key_columns: 'contrat_id, file_name, nature, est_principal, archive' },
            { table: 'hub_contrats.contrat_analyses_ia', purpose: 'Analyses automatiques de contrats.', key_columns: 'contrat_id (voir dsi_describe_table)' },
        ],
        notes: [
            '`date_fin` est une vraie date ; `date_reconduction` et `reconduction` sont du TEXTE : ne pas les comparer à des dates.',
            'Les montants sont par année (montant_AAAA = réalisé, prevision_AAAA = prévisionnel) : additionner avec `coalesce(…, 0)` si nécessaire.',
            '`statut` et `renouvellement_statut` sont des textes libres : lister leurs valeurs avant de filtrer.',
            'Jointure : contrats_liaisons.contrat_id → contrats.id.',
        ],
        examples: [
            { question: 'Contrats qui arrivent à échéance dans 6 mois', sql: "SELECT id, objet, raison_sociale, direction, service, date_fin, montant_2026 FROM hub_contrats.contrats WHERE date_fin BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '180 days' ORDER BY date_fin" },
            { question: 'Dépense 2026 par direction', sql: 'SELECT direction, round(sum(montant_2026), 2) AS total_2026 FROM hub_contrats.contrats GROUP BY direction ORDER BY total_2026 DESC NULLS LAST' },
            { question: "Commandes liées à un contrat", sql: 'SELECT c.objet, l.commande_numero, l.commande_libelle, l.commande_montant, l.date_commande FROM hub_contrats.contrats_liaisons l JOIN hub_contrats.contrats c ON c.id = l.contrat_id WHERE c.id = $1 ORDER BY l.date_commande DESC', params: [1] },
            { question: "Statuts de renouvellement", sql: 'SELECT renouvellement_statut, count(*) AS nb FROM hub_contrats.contrats GROUP BY renouvellement_statut ORDER BY nb DESC' },
            { question: 'Recherche d\'un contrat par titulaire ou objet', sql: "SELECT id, objet, raison_sociale, date_fin, statut FROM hub_contrats.contrats WHERE raison_sociale ILIKE '%' || $1 || '%' OR objet ILIKE '%' || $1 || '%' ORDER BY date_fin LIMIT 50", params: ['maintenance'] },
        ],
    },
    {
        key: 'boites_partagees',
        label: 'Boîtes partagées',
        schemas: ['hub'],
        description: "Demandes et suivi des boîtes aux lettres partagées (responsable, membres, durée, arbitrage) et journal des opérations dans l'annuaire. Tables situées dans le schéma `hub`.",
        tables: [
            { table: 'hub.shared_mailboxes', purpose: 'Une boîte partagée par ligne.', key_columns: 'id, nom, type, usage_type, responsable_display, responsable_email, provisoire (bool), date_fin, membres (jsonb), justification, ticket_id, requested_by_name, arbitrage_decision, arbitrage_comment, created_at' },
            { table: 'hub.shared_mailbox_ad_log', purpose: 'Journal des actions dans l\'annuaire (ajout/retrait de membre…).', key_columns: 'mailbox_id, mailbox_email, action, member_email, member_name, actor, result, details, created_at' },
        ],
        notes: [
            '`membres` est un jsonb : vérifier `jsonb_typeof(membres) = \'array\'` avant d\'utiliser jsonb_array_length / jsonb_array_elements.',
            '`provisoire` = boîte temporaire ; `date_fin` est son échéance.',
            'Jointure : shared_mailbox_ad_log.mailbox_id → shared_mailboxes.id.',
            'Données personnelles (responsables, membres) : ne restituer que le nécessaire.',
        ],
        examples: [
            { question: 'Liste des boîtes partagées', sql: 'SELECT id, nom, type, usage_type, responsable_display, provisoire, date_fin FROM hub.shared_mailboxes ORDER BY nom' },
            { question: 'Boîtes provisoires qui expirent dans 60 jours', sql: "SELECT nom, responsable_display, date_fin FROM hub.shared_mailboxes WHERE provisoire AND date_fin BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '60 days' ORDER BY date_fin" },
            { question: 'Nombre de membres par boîte', sql: "SELECT nom, jsonb_array_length(membres) AS nb_membres FROM hub.shared_mailboxes WHERE jsonb_typeof(membres) = 'array' ORDER BY nb_membres DESC" },
            { question: 'Dernières opérations dans l\'annuaire pour une boîte', sql: 'SELECT created_at, action, member_email, actor, result FROM hub.shared_mailbox_ad_log WHERE mailbox_id = $1 ORDER BY created_at DESC LIMIT 50', params: [1] },
            { question: 'Boîtes par type d\'usage', sql: 'SELECT usage_type, count(*) AS nb FROM hub.shared_mailboxes GROUP BY usage_type ORDER BY nb DESC' },
        ],
    },
    {
        key: 'vols_pertes',
        label: 'Vols et pertes de matériel',
        schemas: ['hub_vols'],
        description: 'Déclarations de vol et de perte de matériel : matériel concerné, agent, circonstances, valeur, information du DPD, statut et pièces.',
        tables: [
            { table: 'hub_vols.thefts', purpose: 'Un incident par ligne (vol ou perte).', key_columns: 'id, type_incident (\'vol\' par défaut, ou perte), designation, numero_inventaire, parc_type_key, parc_glpi_id (lien vers le parc), agent_nom, agent_service, beneficiaire_nom, beneficiaire_service, valeur_achat, date_achat, age_annees, date_vol, lieu, circonstances, numero_ticket, dpd_informe (bool), statut (\'actif\' par défaut)' },
            { table: 'hub_vols.theft_comments', purpose: 'Commentaires de suivi.', key_columns: 'theft_id, comment, author, created_at' },
            { table: 'hub_vols.theft_documents', purpose: 'Pièces jointes (déclaration, dépôt de plainte…).', key_columns: 'theft_id, file_name, nature, uploaded_by, uploaded_at' },
        ],
        notes: [
            '`type_incident` distingue vol et perte : lister ses valeurs (`SELECT type_incident, count(*) … GROUP BY 1`) avant de filtrer.',
            '`date_vol` est la date de l\'incident (vol ou perte) ; `dpd_informe` indique si le délégué à la protection des données a été informé.',
            'Lien avec le parc : thefts.parc_glpi_id = hub_parc.items.glpi_id (et parc_type_key = items.type_key) — si le module parc est accessible.',
            'Données personnelles (agent, bénéficiaire, circonstances) : ne restituer que le nécessaire.',
        ],
        examples: [
            { question: 'Incidents par type et par statut', sql: 'SELECT type_incident, statut, count(*) AS nb, round(sum(valeur_achat), 2) AS valeur FROM hub_vols.thefts GROUP BY type_incident, statut ORDER BY nb DESC' },
            { question: 'Incidents des 12 derniers mois, par service', sql: "SELECT agent_service, type_incident, count(*) AS nb FROM hub_vols.thefts WHERE date_vol >= CURRENT_DATE - INTERVAL '12 months' GROUP BY agent_service, type_incident ORDER BY nb DESC" },
            { question: "Incidents pour lesquels le DPD n'a pas été informé", sql: 'SELECT id, type_incident, designation, agent_service, date_vol, statut FROM hub_vols.thefts WHERE NOT dpd_informe ORDER BY date_vol DESC' },
            { question: 'Valeur totale des matériels volés ou perdus par année', sql: 'SELECT extract(year FROM date_vol)::int AS annee, count(*) AS nb, round(sum(valeur_achat), 2) AS valeur FROM hub_vols.thefts GROUP BY annee ORDER BY annee DESC' },
            { question: 'Détail et commentaires d\'un incident', sql: 'SELECT t.designation, t.date_vol, t.lieu, c.created_at, c.author, c.comment FROM hub_vols.thefts t LEFT JOIN hub_vols.theft_comments c ON c.theft_id = t.id WHERE t.id = $1 ORDER BY c.created_at', params: [1] },
        ],
    },
];

/** Table `schema.table` → libellé de module, pour les modules qui ne coïncident pas avec un schéma entier (ex. boîtes partagées dans `hub`). */
const TABLE_MODULES = {};
for (const g of GUIDES) {
    if (g.schemas.length === 1 && g.schemas[0] === 'hub') for (const t of g.tables) TABLE_MODULES[t.table] = g.label;
}

/** Guides visibles pour un agent : tous les schémas du guide doivent lui être autorisés. */
function guidesFor(myRights, schemaAllowed, key) {
    return GUIDES
        .filter((g) => !key || g.key === key)
        .filter((g) => g.schemas.every((s) => schemaAllowed(myRights, s)));
}

/** Version courte (liste des modules documentés). */
const summary = (g) => ({ module: g.key, label: g.label, schemas: g.schemas, description: g.description });

module.exports = { GUIDES, TABLE_MODULES, guidesFor, summary };
