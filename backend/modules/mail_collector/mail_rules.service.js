const { pgDb } = require('../../shared/database');

class MailRulesService {

  static async getRules() {
    return pgDb.all('SELECT * FROM hub_tickets.mail_rules WHERE is_active = true ORDER BY priority ASC');
  }

  static async getAllRules() {
    return pgDb.all(`
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
  }

  static async createDefaultRules() {
    const existingCount = await pgDb.get('SELECT COUNT(*) as count FROM hub_tickets.mail_rules');
    if (existingCount && existingCount.count > 0) return;

    const defaultRules = [
      {
        name: 'Demande - Accès & permissions',
        type: 'demande',
        keywords: 'accès|permission|authentification|compte|login|mot de passe|reset|réinitialiser',
        priority: 10
      },
      {
        name: 'Demande - Création & ajout',
        type: 'demande',
        keywords: 'créer|créé|créée|ajouter|ajout|nouveau|nouvelle|création|ajouté',
        priority: 20
      },
      {
        name: 'Demande - Configuration',
        type: 'demande',
        keywords: 'configuration|configurer|configuré|paramètre|paramétrer|installation|installer|mise en place|mettre en place',
        priority: 30
      },
      {
        name: 'Demande - Assistance générale',
        type: 'demande',
        keywords: 'aide|assistance|support|question|demande|information|comment|guide|tuto|tutorial|formation|apprendre|consultation',
        priority: 40
      },
      {
        name: 'Demande - Modification & évolution',
        type: 'demande',
        keywords: 'modifier|modification|modifié|changement|changer|évolution|amélioration|ajustement|ajuster',
        priority: 50
      },
      {
        name: 'Incident - Erreur & dysfonctionnement',
        type: 'incident',
        keywords: 'erreur|bug|défaut|anomalie|dysfonctionnement|problem|problème|issue|souci',
        priority: 10
      },
      {
        name: 'Incident - Indisponibilité & panne',
        type: 'incident',
        keywords: 'panne|crash|plantage|arrêt|indisponible|inaccessible|offline|down|ne fonctionne|ne marche|ne répond|timeout|hangs|freeze',
        priority: 20
      },
      {
        name: 'Incident - Performance & lenteur',
        type: 'incident',
        keywords: 'lenteur|lent|ralentissement|ralenti|lag|slow|perfo|performance|latence|délai',
        priority: 30
      },
      {
        name: 'Incident - Données & corruption',
        type: 'incident',
        keywords: 'donnée|données|corruption|perte|manquant|disparu|cassé|broken|corrupted|lost',
        priority: 40
      }
    ];

    for (const rule of defaultRules) {
      await pgDb.run(
        'INSERT INTO hub_tickets.mail_rules (name, type, keywords, priority, is_active) VALUES (?, ?, ?, ?, true)',
        [rule.name, rule.type, rule.keywords, rule.priority]
      );
    }
  }

  static normalizeText(text) {
    if (!text) return '';
    return text
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '');
  }

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

    let type = 2;
    let typeLabel = 'demande';
    if (matches.incident > matches.demande) {
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

    return {
      type, typeLabel, matches,
      ruleId: bestRule?.id || null,
      categoryId: bestRule?.category_id || null,
      softwareId: bestRule?.software_id || null,
    };
  }
}

module.exports = MailRulesService;
