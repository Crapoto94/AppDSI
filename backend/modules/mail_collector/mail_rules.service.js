const { pgDb } = require('../../shared/database');

class MailRulesService {

  static async getRules() {
    return pgDb.all('SELECT * FROM hub_tickets.mail_rules WHERE is_active = true ORDER BY priority ASC');
  }

  static async getAllRules() {
    try {
      return await pgDb.all(`
        SELECT r.*,
          tc.name AS category_name,
          a.name AS software_name,
          COALESCE(
            (SELECT COUNT(*) FROM hub_tickets.ticket_email_mapping m WHERE m.mail_rule_id = r.id),
            0
          ) AS usage_count
        FROM hub_tickets.mail_rules r
        LEFT JOIN hub_tickets.ticket_categories tc ON tc.id = r.category_id
        LEFT JOIN magapp.apps a ON a.id = r.software_id
        ORDER BY r.priority ASC, r.created_at DESC
      `);
    } catch (e) {
      console.error('[MAIL-RULES] getAllRules JOIN failed, fallback to simple query:', e.message);
      const rules = await pgDb.all('SELECT * FROM hub_tickets.mail_rules ORDER BY priority ASC, created_at DESC');
      for (const r of rules) {
        if (r.category_id) {
          const c = await pgDb.get('SELECT name FROM hub_tickets.ticket_categories WHERE id = ?', [r.category_id]);
          r.category_name = c?.name || null;
        } else {
          r.category_name = null;
        }
        if (r.software_id) {
          const a = await pgDb.get('SELECT name FROM magapp.apps WHERE id = ?', [r.software_id]);
          r.software_name = a?.name || null;
        } else {
          r.software_name = null;
        }
        r.usage_count = 0;
      }
      return rules;
    }
  }

  static async createDefaultRules(force = false) {
    if (!force) {
      const existingCount = await pgDb.get('SELECT COUNT(*) as count FROM hub_tickets.mail_rules');
      if (existingCount && existingCount.count > 0) return;
    }
    if (force) {
      await pgDb.run('DELETE FROM hub_tickets.mail_rules');
    }

    const defaultRules = [
      // ── Demande - Accès & comptes ──
      { name: 'Demande - Accès & permissions', type: 'demande',
        keywords: 'accès|permission|authentification|compte|login|mot de passe|reset|réinitialiser|mdp|droit|habilitation|autorisation',
        priority: 10 },
      { name: 'Demande - Création & ajout', type: 'demande',
        keywords: 'créer|créé|créée|ajouter|ajout|nouveau|nouvelle|création|ajouté|inscription|inscrire|ouvrir',
        priority: 20 },
      { name: 'Demande - Suppression & désactivation', type: 'demande',
        keywords: 'supprimer|suppression|désactiver|désactivation|effacer|retirer|retrait|archiver|clôturer',
        priority: 22 },
      { name: 'Demande - Configuration & installation', type: 'demande',
        keywords: 'configuration|configurer|configuré|paramètre|paramétrer|installation|installer|mise en place|mettre en place|déploiement|déployer',
        priority: 30 },
      { name: 'Demande - Assistance générale', type: 'demande',
        keywords: 'aide|assistance|support|question|demande|information|comment|guide|tuto|tutorial|formation|apprendre|consultation|besoin',
        priority: 40 },
      { name: 'Demande - Modification & évolution', type: 'demande',
        keywords: 'modifier|modification|modifié|changement|changer|évolution|amélioration|ajustement|ajuster|faire évoluer|mettre à jour|maj',
        priority: 50 },

      // ── Demande - Métier spécifique ──
      { name: 'Demande - Messagerie & collaboration', type: 'demande',
        keywords: 'messagerie|mail|email|courriel|outlook|exchange|teams|sharepoint|onedrive|collaboration|boîte mail|liste diffusion|aml|bal|alias',
        priority: 70 },
      { name: 'Demande - Impression & scan', type: 'demande',
        keywords: 'imprimante|impression|imprimer|copieur|scan|scanner|photocopieuse|toner|cartouche|pfm|reprographie',
        priority: 72 },
      { name: 'Demande - Réseau & WiFi', type: 'demande',
        keywords: 'wifi|réseau|connexion|vpn|rj45|ethernet|switch|borne|point accès|lan|vlan|dns|proxy|fibre|adsl',
        priority: 75 },
      { name: 'Demande - Téléphonie & VoIP', type: 'demande',
        keywords: 'téléphone|telephone|voip|appel|ligne|mobile|portable|smartphone|softphone|casque|réception|numéro|astérisk|3cx',
        priority: 78 },
      { name: 'Demande - Site web & Intranet', type: 'demande',
        keywords: 'site web|site internet|intranet|extranet|portail|page|contenu|publication|rédaction|actualité|wordpress|drupal|joomla',
        priority: 80 },
      { name: 'Demande - SIG & Urbanisme', type: 'demande',
        keywords: 'sig|cartographie|urbanisme|ads|permis construire|cadastre|geoportail|geomatique|qgis|arcgis|georchestra|cart@ds',
        priority: 85 },
      { name: 'Demande - ERP & Finance', type: 'demande',
        keywords: 'erp|finance|facturation|comptabilité|budget|commande|devis|note frais|engagement|mandat|titre|berger-levrault|ciril|saas',
        priority: 87 },
      { name: 'Demande - RH & Paie', type: 'demande',
        keywords: 'rh|paie|congés|absence|planning|temps travail|ast|arrêt maladie|formation|recrutement|entretien|contrat|siham|cristal',
        priority: 90 },
      { name: 'Demande - Scolarité & Périscolaire', type: 'demande',
        keywords: 'scolaire|école|écolier|cantine|garderie|restauration scolaire|education|portail famille|educonnect|pronote|agora|scolinfo',
        priority: 93 },
      { name: 'Demande - État Civil & Population', type: 'demande',
        keywords: 'état civil|naissance|mariage|pacs|décès|passeport|cni|titre identité|recensement|élection|liste électorale',
        priority: 95 },
      { name: 'Demande - Marchés & Achats publics', type: 'demande',
        keywords: 'marché public|appel offre|dce|consultation|commissaire enquête|ao|marché|fournisseur|commande publique|boamp',
        priority: 97 },
      { name: 'Demande - GED & Archivage', type: 'demande',
        keywords: 'ged|archivage|document|classement|numérisation|archiviste|vaur|archive|backup|sauvegarde',
        priority: 98 },

      // ── Incidents ──
      { name: 'Incident - Erreur & dysfonctionnement', type: 'incident',
        keywords: 'erreur|bug|défaut|anomalie|dysfonctionnement|problem|problème|issue|souci|bogue|message erreur|code erreur',
        priority: 10 },
      { name: 'Incident - Indisponibilité & panne', type: 'incident',
        keywords: 'panne|crash|plantage|arrêt|indisponible|inaccessible|offline|down|ne fonctionne|ne marche|ne répond|timeout|hangs|freeze|hors service|HS|mort',
        priority: 20 },
      { name: 'Incident - Performance & lenteur', type: 'incident',
        keywords: 'lenteur|lent|ralentissement|ralenti|lag|slow|perfo|performance|latence|délai|bouché|saturé|sur occupé',
        priority: 30 },
      { name: 'Incident - Données & corruption', type: 'incident',
        keywords: 'donnée|données|corruption|perte|manquant|disparu|cassé|broken|corrupted|lost|fichier vide|fichier illisible|altéré',
        priority: 40 },
      { name: 'Incident - Messagerie', type: 'incident',
        keywords: 'mail|email|outlook|exchange|spam|pourriel|envoi|réception|message bloqué|pièce jointe|mail perdu|mail non reçu|phishing|hameçonnage',
        priority: 50 },
      { name: 'Incident - Impression', type: 'incident',
        keywords: 'imprimante|copieur|impression|bourrage|toner|cartouche|photo conducteur|bac récupération|agrafe|impression qualité|bavure|tache',
        priority: 52 },
      { name: 'Incident - Réseau & connectivité', type: 'incident',
        keywords: 'wifi|connexion|réseau|plus internet|plus réseau|coupure|déconnexion|ping|perte paquet|débit|switch mort|borne hs',
        priority: 55 },
      { name: 'Incident - Téléphonie', type: 'incident',
        keywords: 'téléphone|telephone|ligne|sonnerie|appel|combiné|plus sonne|plus entend|grésillement|echo|liaison|décroché|occupé',
        priority: 58 },
      { name: 'Incident - Sécurité & virus', type: 'incident',
        keywords: 'virus|ransomware|piratage|intrusion|compromis|malware|antivirus|attaque|menace|vulnérabilité|faille|cyber|hack|phishing',
        priority: 60 },
      { name: 'Incident - Logiciel métier', type: 'incident',
        keywords: 'logiciel|appli|application|programme|ne s ouvre pas|ne répond pas|se ferme|crash|figer|bloqué|licence|expiré',
        priority: 65 },
      { name: 'Incident - Matériel & équipement', type: 'incident',
        keywords: 'écran|ordinateur|pc|portable|clavier|souris|disque dur|dd|ram|processeur|alimentation|ventilateur|surchauffe|bruit|casque|webcam',
        priority: 70 },
    ];

    for (const rule of defaultRules) {
      await pgDb.run(
        'INSERT INTO hub_tickets.mail_rules (name, type, keywords, priority, is_active) VALUES (?, ?, ?, ?, true)',
        [rule.name, rule.type, rule.keywords, rule.priority]
      );
    }

    // Associer automatiquement logiciels (magapp.apps) et catégories aux règles génériques
    await this.autoAssociateRules();

    // Créer une règle par logiciel métier référencé dans magapp.apps
    await this.generateAppRules();
  }

  // ─── Génère une règle de détection par application métier ───
  static async generateAppRules() {
    try {
      const apps = await pgDb.all('SELECT id, name FROM magapp.apps ORDER BY name');
      const existing = await pgDb.all('SELECT id, name, software_id FROM hub_tickets.mail_rules WHERE software_id IS NOT NULL');

      const alreadyLinked = new Set(existing.map(r => r.software_id));

      for (const app of apps) {
        if (alreadyLinked.has(app.id)) continue;

        const keywords = this.buildAppKeywords(app.name);
        if (!keywords) continue;

        // Priorité 1 : avant toutes les règles génériques
        await pgDb.run(
          'INSERT INTO hub_tickets.mail_rules (name, type, keywords, priority, is_active, software_id) VALUES (?, ?, ?, ?, true, ?)',
          [`Logiciel - ${app.name}`, 'demande', keywords, 1, app.id]
        );
      }
    } catch (e) {
      console.error('[MAIL-RULES] generateAppRules échoué:', e.message);
    }
  }

  // ─── Génère les variantes de mots-clés pour un nom d'application ───
  static buildAppKeywords(appName) {
    if (!appName || appName.length < 2) return null;

    const name = appName.trim();
    const lower = name.toLowerCase();
    const keywords = new Set();

    // 1. Nom complet en minuscules
    keywords.add(lower);

    // 2. Nom sans accents (le classify normalise déjà, mais utile pour mots composés)
    const noAccent = lower.normalize('NFD').replace(/[̀-ͯ]/g, '');
    if (noAccent !== lower) keywords.add(noAccent);

    // 3. Mots individuels (>= 3 car.) — utiles pour "SEDIT Ne Marche Pas"
    const words = lower.split(/[\s\-_]+/).filter(w => w.length >= 3);
    for (const w of words) keywords.add(w);

    // 4. Préfixes de 4+ car. pour matcher les abréviations
    //    Ex: "applicati" → on garde tel quel, l'utilisateur tapera peut-être "app"
    //    Les acronymes courts (2-3 car.) sont trop ambigus, on les ignore
    for (const w of words) {
      if (w.length > 5) {
        keywords.add(w.substring(0, Math.ceil(w.length * 0.6)));
      }
    }

    // 5. Forme sans traits d'union / underscores
    if (lower.includes('-') || lower.includes('_')) {
      keywords.add(lower.replace(/[-_]/g, ''));
      keywords.add(lower.replace(/[-_]/g, ' '));
    }

    return Array.from(keywords).join('|');
  }

  // ─── Associe software_id / category_id aux règles génériques ───
  static async autoAssociateRules() {
    try {
      const [apps, categories, rules] = await Promise.all([
        pgDb.all('SELECT id, name FROM magapp.apps ORDER BY name'),
        pgDb.all("SELECT id, name, full_path FROM hub_tickets.ticket_categories WHERE is_active = true ORDER BY name"),
        pgDb.all('SELECT id, name, keywords, category_id, software_id FROM hub_tickets.mail_rules ORDER BY priority'),
      ]);

      for (const rule of rules) {
        if (rule.keywords) {
          const kwLower = rule.keywords.toLowerCase();
          const ruleKeywords = kwLower.split('|').map(k => k.trim()).filter(k => k.length >= 3);

          // Associer un logiciel par correspondance de nom
          if (!rule.software_id) {
            const appByName = apps.find(a =>
              ruleKeywords.some(k =>
                a.name.toLowerCase() === k
                || a.name.toLowerCase().includes(k)
              )
            );
            if (!appByName) {
              const ruleNameLower = rule.name.toLowerCase();
              const appByRuleName = apps.find(a =>
                ruleNameLower.includes(a.name.toLowerCase()) && a.name.length > 2
              );
              if (appByRuleName) {
                await pgDb.run('UPDATE hub_tickets.mail_rules SET software_id = ? WHERE id = ?',
                  [appByRuleName.id, rule.id]);
              }
            } else {
              await pgDb.run('UPDATE hub_tickets.mail_rules SET software_id = ? WHERE id = ?',
                [appByName.id, rule.id]);
            }
          }

          // Associer une catégorie par correspondance de nom
          if (!rule.category_id) {
            const matchedCat = categories.find(c =>
              ruleKeywords.some(k =>
                c.name.toLowerCase().includes(k)
                || c.full_path?.toLowerCase().includes(k)
              )
            );
            if (matchedCat) {
              await pgDb.run('UPDATE hub_tickets.mail_rules SET category_id = ? WHERE id = ?',
                [matchedCat.id, rule.id]);
            }
          }
        }
      }
    } catch (e) {
      console.error('[MAIL-RULES] Auto-association échouée:', e.message);
    }
  }

  // ─── Normalisation du texte pour la classification ───
  static normalizeText(text) {
    if (!text) return '';
    return text
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '');
  }

  // ─── Classifie un ticket (type + logiciel + catégorie) ───
  static async classifyTicket(title, content) {
    const rules = await this.getRules();
    if (rules.length === 0) {
      return { type: 2, typeLabel: 'demande', ruleId: null, categoryId: null, softwareId: null };
    }

    const textToAnalyze = `${title} ${(content || '').substring(0, 200)}`;
    const normalizedText = this.normalizeText(textToAnalyze);

    // Compter les correspondances par règle individuelle
    const ruleHits = [];
    for (const rule of rules) {
      const keywords = rule.keywords.split('|').map(k => k.trim()).filter(k => k);
      let count = 0;
      for (const keyword of keywords) {
        if (normalizedText.includes(this.normalizeText(keyword))) count++;
      }
      if (count > 0) ruleHits.push({ count, rule });
    }

    // Agréger par type pour déterminer le gagnant
    const matches = { demande: 0, incident: 0 };
    for (const { count, rule } of ruleHits) {
      matches[rule.type] = (matches[rule.type] || 0) + count;
    }

    // En cas d'égalité, on préfère incident (plus prudent : le ticket aura une meilleure visibilité)
    // et on évite qu'un nom d'app en demande fasse basculer un vrai incident en demande.
    let type = 2;
    let typeLabel = 'demande';
    if (matches.incident > matches.demande || (matches.incident === matches.demande && matches.incident > 0)) {
      type = 1;
      typeLabel = 'incident';
    }

    // Trouver la règle avec le plus de correspondances pour le type gagnant
    let bestRule = null;
    let bestCount = 0;
    for (const { count, rule } of ruleHits) {
      if (rule.type === typeLabel && count > bestCount) {
        bestCount = count;
        bestRule = rule;
      }
    }

    // Chercher la meilleure règle avec un software_id (tous types confondus)
    // pour associer le logiciel même si le type majoritaire n'a pas de logiciel
    let softwareRule = bestRule;
    let softwareCount = bestRule?.software_id ? bestCount : 0;
    let categoryRule = bestRule;
    let categoryCount = bestRule?.category_id ? bestCount : 0;

    for (const { count, rule } of ruleHits) {
      if (rule.software_id && count > softwareCount) {
        softwareCount = count;
        softwareRule = rule;
      }
      if (rule.category_id && count > categoryCount) {
        categoryCount = count;
        categoryRule = rule;
      }
    }

    return {
      type, typeLabel, matches,
      ruleId: bestRule?.id || null,
      categoryId: categoryRule?.category_id || null,
      softwareId: softwareRule?.software_id || null,
    };
  }
}

module.exports = MailRulesService;
