/**
 * Mode SIMULATION des entretiens professionnels (administrateurs uniquement).
 *
 * Objectif : tester tout le parcours sans polluer les données réelles.
 *
 *  RESTE RÉEL (jamais effacé, y compris par « Supprimer la base de simulation ») :
 *    - la définition des valideurs et « qui valide qui » (hub_entretiens.base_agents.valideur_matricule, .est_valideur, valideurs, rattachements),
 *    - le lien avec l'Active Directory (base_agents.ad_username / email / ad_status).
 *  PROVISOIRE (effacé par le bouton) :
 *    - les rendez-vous (date, lieu, événement Outlook),
 *    - les entretiens professionnels et tout leur contenu (préparation, évaluation, CREP, objectifs, formations, scans, signatures, relances).
 *
 * En simulation :
 *    - aucun mail ne part vers un agent hors BETA (même si la fonctionnalité est publiée) : voir shared/ep-beta-mail.js ;
 *    - la vue « Demandes de formation » ajoute des demandes FICTIVES (la moitié des agents, selon leur métier). Elles ne sont jamais
 *      enregistrées : elles sont fabriquées à la volée tant que la simulation est active.
 */
const { pgDb } = require('../../shared/database');
const svc = require('./entretiens.service');

const KEY = 'simulation';

async function isOn() {
    try { return ['1', 'true'].includes(String(await svc.getSetting(KEY)).trim().toLowerCase()); } catch (e) { return false; }
}

async function setOn(on, actor) {
    await svc.setSetting(KEY, on ? '1' : '0');
    try { require('../../shared/ep-beta-mail').reset(); } catch (e) { /* cache */ }
    // L'analyse IA des formations (simulées ou non) ne doit pas survivre à un changement de mode.
    try { await svc.setSetting('formations_analysis', ''); } catch (e) { /* aucune analyse */ }
    try { await svc.logAudit({ actor, action: on ? 'simulation_on' : 'simulation_off', entretien: null, details: {} }); } catch (e) { /* journal */ }
}

/** Remet à zéro TOUS les entretiens de la Ville (contenu provisoire) sans toucher aux valideurs ni au lien AD. */
async function resetAll(actor, req) {
    const storage = require('../../shared/storage');
    const rows = await pgDb.all("SELECT * FROM hub_entretiens.entretiens WHERE COALESCE(source, 'hub') = 'ville'");
    const warnings = [];
    let n = 0;
    for (const row of rows) {
        try {
            if (row.crep_parapheur_id) {
                const p = await pgDb.get('SELECT id, status FROM hub_parapheur.parapheurs WHERE id = ?', [row.crep_parapheur_id]);
                if (p?.status === 'en_cours') {
                    try { await require('../parapheur/parapheur.service').cancel(row.crep_parapheur_id, actor.username || actor.email || 'admin', req); }
                    catch (e) { warnings.push(`Parapheur #${row.id} : ${e.message}`); }
                }
            }
            if (row.outlook_event_id) { try { await svc.removeOutlook(row); } catch (e) { warnings.push(`Outlook #${row.id} : ${e.message}`); } }
            const files = [];
            if (row.crep_signed_path) files.push(row.crep_signed_path);
            const scans = typeof row.crep_scans === 'string' ? JSON.parse(row.crep_scans || '[]') : (row.crep_scans || []);
            for (const s of (Array.isArray(scans) ? scans : [])) if (s?.path) files.push(s.path);
            for (const f of files) { try { await storage.deleteFile(f); } catch (e) { /* déjà absent */ } }
            await pgDb.run('DELETE FROM hub_entretiens.objectifs WHERE entretien_id = ?', [row.id]);
            await pgDb.run('DELETE FROM hub_entretiens.formations WHERE entretien_id = ?', [row.id]);
            try { await pgDb.run('DELETE FROM hub_entretiens.relances WHERE entretien_id = ?', [row.id]); } catch (e) { /* table absente */ }
            try {
                const jobs = await pgDb.all('SELECT scan_path FROM hub_entretiens.crep_scan_jobs WHERE entretien_id = ?', [row.id]);
                for (const j of jobs) if (j.scan_path) { try { await storage.deleteFile(j.scan_path); } catch (e) { /* déjà absent */ } }
                await pgDb.run('DELETE FROM hub_entretiens.crep_scan_jobs WHERE entretien_id = ?', [row.id]);
            } catch (e) { /* table absente */ }
            await pgDb.run(
                `UPDATE hub_entretiens.entretiens SET
                    date_entretien = NULL, duree_minutes = 120, lieu = '', statut = 'a_planifier',
                    realisations = '', difficultes = '', pistes_amelioration = '', competences_a_developper = '',
                    perspectives_missions = '', perspectives_responsabilite = '', perspectives_expertise = '',
                    perspectives_projet = '', perspectives_concours = '', commentaire_agent = '',
                    preparation_statut = 'non_commencee', agent_submitted_at = NULL,
                    synthese = '', appreciation_generale = '', objectifs_suivants = '', avis_agent = '',
                    evaluation_statut = 'non_commencee', evaluator_submitted_at = NULL,
                    outlook_event_id = NULL, outlook_organizer = NULL, outlook_web_link = NULL,
                    outlook_status = 'non_planifie', outlook_error = NULL,
                    notes_admin = '', crep = NULL, crep_statut = 'non_envoye', crep_sent_at = NULL,
                    crep_agent_validated_at = NULL, crep_parapheur_id = NULL, crep_parapheur_ref = NULL,
                    crep_signed_path = NULL, crep_signed_name = NULL, crep_signed_at = NULL, crep_signed_by = NULL,
                    crep_scans = '[]'::jsonb, updated_at = NOW()
                 WHERE id = ?`, [row.id]);
            n++;
        } catch (e) { warnings.push(`Entretien #${row.id} : ${e.message}`); }
    }
    try { await svc.setSetting('formations_analysis', ''); } catch (e) { /* aucune analyse */ }
    try { await svc.logAudit({ actor, action: 'simulation_raz', entretien: null, details: { entretiens: n, warnings } }); } catch (e) { /* journal */ }
    return { entretiens: n, warnings };
}

// ─── Demandes de formation FICTIVES (jamais enregistrées) ──────────────────────────────────────────────────────

const hash = (s) => { let h = 2166136261; for (const c of String(s)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; };

// [mots-clés du métier, formations obligatoires, formations métiers, formations parcours]
const METIERS = [
    [/nettoi|m[ée]nage|entretien des (locaux|b[âa]timents)|agent d.entretien/, ['Gestes et postures', 'Utilisation des produits chimiques (étiquetage, FDS)', 'Sécurité incendie'], ['Techniques de nettoyage et de désinfection', 'Utilisation d’une autolaveuse', 'Entretien des sols spécifiques'], ['Préparation au concours d’adjoint technique', 'Formation d’adaptation à la prise de poste']],
    [/cuisin|restaur|cantine|self|office/, ['Hygiène alimentaire HACCP', 'Gestes et postures', 'Sécurité incendie'], ['Cuisine collective et équilibre alimentaire', 'Gestion des allergènes', 'Techniques de cuisson de collectivité'], ['Préparation au concours d’agent de maîtrise', 'Bilan de compétences']],
    [/anim|jeunesse|enfan|p[ée]riscolaire|crèche|atsem|multi.?accueil/, ['PSC1 secourisme', 'Prévention des violences et signalement'], ['BAFA / BAFD', 'Animation d’activités pour les 3-6 ans', 'Gestion des conflits entre enfants'], ['Préparation au concours d’animateur', 'VAE auxiliaire de puériculture']],
    [/espaces? verts?|jardin|paysag|voirie|propret|fossoyeur|cimeti/, ['Certiphyto', 'CACES engins', 'Travail en hauteur et élagage'], ['Gestion différenciée des espaces verts', 'Taille et entretien des végétaux', 'Conduite de tondeuse autoportée'], ['Préparation au concours d’adjoint technique principal']],
    [/b[âa]timent|[ée]lectric|plomb|menuis|peintre|maintenance|technique|atelier|m[ée]canic/, ['Habilitation électrique B0H0V', 'Travail en hauteur', 'Amiante sous-section 4'], ['Maintenance préventive des bâtiments', 'Soudure et métallerie', 'Lecture de plans'], ['Préparation au concours de technicien', 'Formation d’adaptation à la prise de poste']],
    [/informat|syst[èe]me|r[ée]seau|d\.?s\.?i|num[ée]rique|support|d[ée]velopp/, ['Sensibilisation à la cybersécurité', 'Formation RGPD'], ['Virtualisation et administration Linux', 'Supervision et ITIL', 'Power BI et tableaux de bord'], ['Préparation au concours d’ingénieur territorial', 'Certification cloud']],
    [/financ|compta|budget|march[ée]s?|achat|commande|juridi/, ['Comptabilité publique M57', 'Formation RGPD'], ['Excel avancé et tableaux croisés dynamiques', 'Code de la commande publique', 'Logiciel financier Sedit'], ['Préparation au concours de rédacteur principal']],
    [/ressources humaines|rh\b|paie|carri[èe]re|formation/, ['Statut de la fonction publique territoriale'], ['Gestion de la paie et du temps de travail', 'GPEEC et gestion des carrières', 'Droit du travail en collectivité'], ['Préparation au concours d’attaché']],
    [/accueil|[ée]tat.?civil|population|citoyen|usager|guichet/, ['Gestion de l’agressivité à l’accueil'], ['Accueil du public et relation à l’usager', 'État civil et titres d’identité', 'Droit funéraire'], ['Préparation au concours d’adjoint administratif principal']],
    [/biblioth|culture|m[ée]diath|mus[ée]e|spectacle|th[ée][aâ]tre|conservatoire/, ['Sécurité incendie ERP'], ['Médiation culturelle et accueil des publics', 'Gestion de collections et catalogage', 'Régie de spectacle'], ['Préparation au concours d’assistant de conservation']],
    [/police|asvp|surveillance|s[ée]curit[ée]/, ['Formation continue des agents de police municipale', 'PSC1 secourisme'], ['Gestion de situations conflictuelles', 'Procédure et rédaction des procès-verbaux'], ['Préparation au concours de chef de service de police municipale']],
    [/directeur|directrice|responsable|chef|cadre|encadr|coordinat|manager/, ['Prévention des risques professionnels pour l’encadrant'], ['Management d’équipe', 'Conduite du changement', 'Gestion des conflits', 'Conduite de projet'], ['Préparation au concours d’attaché principal', 'Coaching de prise de poste']],
];
const DEFAUT = [['PSC1 secourisme', 'Sécurité incendie'], ['Word et Excel — niveau intermédiaire', 'Rédaction administrative', 'Travail en équipe et communication'], ['Préparation à un concours', 'Bilan de compétences', 'Formation d’adaptation à la prise de poste']];

/** Demandes fictives : la moitié des agents de la base (a_conserver) demandent 1 à 3 formations, selon leur métier. */
async function demandesFictives() {
    let agents = [];
    try {
        agents = await pgDb.all(`SELECT matricule, poste, poste_fonction, service, direction, chemin FROM hub_entretiens.base_agents WHERE a_conserver ORDER BY matricule`);
    } catch (e) { return []; }
    const out = [];
    for (const a of agents) {
        const h = hash(a.matricule);
        if (h % 2) continue; // un agent sur deux
        const metier = `${a.poste_fonction || ''} ${a.poste || ''} ${a.service || ''}`.toLowerCase();
        const m = METIERS.find(([re]) => re.test(metier));
        const [ob, me, pa] = m ? [m[1], m[2], m[3]] : DEFAUT;
        const seg = String(a.chemin || '').split('\\').map(x => x.trim()).filter(Boolean);
        const direction = seg[0] || String(a.direction || '').trim() || 'Non renseignée';
        const service = seg[1] || (String(a.service || '').trim() !== direction ? String(a.service || '').trim() : '') || '(sans service)';
        const nb = 1 + ((h >>> 3) % 3); // 1 à 3 demandes
        const pools = [['obligatoires', ob], ['metiers', me], ['parcours', pa]];
        for (let i = 0; i < nb; i++) {
            const [type, pool] = pools[((h >>> 5) + i) % 3];
            out.push({ type, direction, service, texte: pool[((h >>> 7) + i) % pool.length], valide: true, simule: true });
        }
    }
    return out;
}

module.exports = { isOn, setOn, resetAll, demandesFictives };
