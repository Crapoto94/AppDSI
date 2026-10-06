---
name: dashboard-widget
description: >-
  Règle projet AppDSI : à CHAQUE fois qu'un KPI, un indicateur chiffré, une
  statistique ou un graphique est créé/ajouté dans un module (tickets, budget,
  copieurs, parc, magapp, projets, contrats, consommables, certificats, ville,
  RH, réseau, etc.), il DOIT aussi être exposé comme widget du tableau de bord
  /dsi-dashboard. Déclencher dès qu'on parle de créer/ajouter un KPI, une carte
  chiffrée, un compteur, un camembert, une courbe, un histogramme, un « top N »,
  un taux, une jauge, ou tout indicateur de gestion ; ou quand on veut rendre un
  indicateur disponible dans le dashboard, ou proposer des KPI de gestion.
---

# Dashboard Widget — règle d'exposition systématique

## Principe

Le tableau de bord `/dsi-dashboard` (page `frontend/src/pages/DsiDashboard/`) est un
canevas de **widgets** que l'admin compose librement. **Aucun KPI/graphique ne doit
rester « prisonnier » de sa page d'origine.** Dès que tu crées un indicateur dans un
module, tu crées **en plus** un widget dashboard correspondant (réutilise la même
source de données / le même endpoint).

> Cette obligation s'applique aussi rétroactivement : si tu touches une page qui a des
> KPIs non encore exposés, propose de les ajouter au dashboard.

## Architecture (3 fichiers à connaître)

| Rôle | Fichier |
|---|---|
| Composant widget | `frontend/src/pages/DsiDashboard/widgets/<Nom>Widget.tsx` |
| Mapping clé → composant | `frontend/src/pages/DsiDashboard/widgets/index.tsx` (`WIDGET_MAP`) |
| Catalogue (titre, taille, module) | `frontend/src/pages/DsiDashboard/widgets/registry.ts` (`WIDGET_REGISTRY`) |

Le rendu se fait via `renderWidget(key)`. La grille `CanvasGrid` utilise des unités
`w`/`h` (colonnes / lignes). `defaultSize` = taille à l'ajout, `minSize` = minimum.

## Procédure obligatoire (à suivre intégralement)

Quand tu ajoutes un KPI/graphe `X` dans le module `M` :

1. **Créer le composant** `widgets/<M><X>Widget.tsx` :
   - encapsuler dans `WidgetWrapper` (props : `title`, `loading`, `error`, `children`, `actions?`) ;
   - récupérer le token via `useAuth()` et appeler l'API existante du module avec `axios` ;
   - **réutiliser l'endpoint qui sert déjà la page** (ne pas dupliquer la logique métier) ;
   - gérer `loading` / `error` ; ne jamais planter si la donnée est absente (`Array.isArray`, fallbacks).
2. **Déclarer le composant** dans `index.tsx` : `const <M><X>Widget = lazy(() => import('./<M><X>Widget'));`
   puis ajouter `'<m>_<x>': <M><X>Widget,` dans `WIDGET_MAP`.
3. **Référencer dans le catalogue** `registry.ts` : ajouter une entrée `{ key:'<m>_<x>', label, description, module, defaultSize, minSize }`
   dans la section du module (créer la section si le module n'existe pas).
4. **Vérifier** : `cd frontend && npx tsc --noEmit -p tsconfig.app.json` (0 erreur sur tes fichiers) puis `npx vite build`.

La `key` est en `snake_case` préfixée par le module (`tickets_kpi`, `budget_recent_orders`…)
et doit être identique dans `registry.ts` et `WIDGET_MAP`.

## Conventions de données

- **Nombres venant de PostgreSQL** (`COUNT`, montants texte) arrivent souvent en **chaînes** :
  toujours convertir avec un `parseNum` (gérer la virgule décimale) avant toute somme,
  sinon on obtient des concaténations.
- **Filtrage par année** : pour un indicateur lié à un exercice (budget…), filtrer sur
  l'**année en cours** via `?fiscalYear=${new Date().getFullYear()}`.
- **Filtre de période du dashboard** (optionnel) : `useDashboardFilter()` +
  `filterToQueryString()` (`DashboardFilterContext.tsx`) donnent la période choisie
  (`7d|30d|90d|12m|all`) — l'utiliser pour les graphes temporels quand c'est pertinent.
- **Graphiques** : `recharts` (déjà utilisé). Listes : lignes compactes + badges d'état colorés.
- **Couleurs d'état** : vert `#16a34a/#dcfce7` (ok/terminé), ambre `#854d0e/#fef9c3`
  (en attente), rouge `#991b1b/#fee2e2` (alerte/critique), bleu `#1e40af/#dbeafe` (info).

## Template — widget KPIs (cartes chiffrées)

```tsx
import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { useAuth } from '../../../contexts/AuthContext';
import WidgetWrapper from './WidgetWrapper';

const parseNum = (v: any) => { const n = typeof v === 'string' ? parseFloat(v.replace(',', '.').replace(/[^\d.\-]/g, '')) : Number(v); return isNaN(n) ? 0 : n; };

export default function MonModuleKpiWidget() {
  const { token } = useAuth();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    axios.get('/api/mon-module/...', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => setData(/* agréger ici */ r.data))
      .catch(e => setError(e.response?.data?.message || 'Erreur'))
      .finally(() => setLoading(false));
  }, [token]);

  const kpis = data ? [ { label: 'Libellé', value: '…', sub: '…', color: '#3b82f6' } ] : [];
  return (
    <WidgetWrapper title="KPIs Mon Module" loading={loading} error={error}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 8, alignContent: 'start', height: '100%' }}>
        {kpis.map(k => (
          <div key={k.label} style={{ background: '#f8fafc', borderRadius: 8, padding: '8px 10px', borderLeft: `3px solid ${k.color}` }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: k.color }}>{k.value}</div>
            <div style={{ fontSize: 11, color: '#374151', marginTop: 2, fontWeight: 600 }}>{k.label}</div>
            <div style={{ fontSize: 10, color: '#94a3b8' }}>{k.sub}</div>
          </div>
        ))}
      </div>
    </WidgetWrapper>
  );
}
```

## Template — widget graphique (recharts)

```tsx
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';
// … WidgetWrapper + fetch identique …
<WidgetWrapper title="Évolution …" loading={loading} error={error}>
  <ResponsiveContainer width="100%" height="100%">
    <LineChart data={series}>
      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
      <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#64748b' }} />
      <YAxis hide />
      <Tooltip />
      <Line type="monotone" dataKey="value" stroke="#6366f1" strokeWidth={2} dot={false} />
    </LineChart>
  </ResponsiveContainer>
</WidgetWrapper>
```

## Checklist finale

- [ ] Widget créé dans `widgets/` avec `WidgetWrapper` + gestion loading/error
- [ ] `lazy import` + entrée dans `WIDGET_MAP` (`index.tsx`)
- [ ] Entrée dans `WIDGET_REGISTRY` (`registry.ts`) avec `defaultSize`/`minSize` cohérents
- [ ] `parseNum` sur les nombres PG, `fiscalYear` si exercice
- [ ] `tsc` + `vite build` OK
- [ ] Mentionner à l'utilisateur le(s) widget(s) ajouté(s) et leur clé

## KPI de gestion proposés (catalogue d'idées)

À proposer/ajouter selon les besoins (cocher ce qui est déjà exposé) :

**Budget / Finance**
- Taux de réalisation par opération (réalisé/prévu), top 5 opérations en dépassement
- Reste à engager par section (Fonctionnement / Investissement)
- Délai moyen de mandatement des factures ; factures > 30j non mandatées (alerte)
- Répartition des commandes par service émetteur ; top fournisseurs (montant)
- Engagement cumulé vs budget voté (jauge)

**Tickets / Support**
- Taux de respect SLA (mensuel), backlog âgé > 30j, taux de réouverture
- Délai moyen de résolution par catégorie, charge par technicien
- Satisfaction (si dispo), tickets VIP en cours

**Parc informatique**
- Taux d'équipement sous garantie, postes à renouveler (> 5 ans), âge moyen par direction
- Postes non affectés, ratio postes/agents

**MagApp (applications)**
- Top applications par usage (clics), évolution mensuelle des usages
- Applications sans documentation, sans chef de projet, en maintenance
- Coût applicatif (commandes associées) par application / par direction

**Contrats**
- Contrats expirant < 90j (alerte), montant annuel engagé, reconductions à décider
- Répartition par type / par direction

**Copieurs**
- Coût total / coût par copie, ratio couleur/N&B, copieurs sans relevé récent
- Top directions par volume, projection annuelle

**Consommables / Stocks**
- Demandes en attente, délai moyen de traitement, top articles consommés
- Ruptures / seuils bas

**RH / Organisation**
- Effectifs par direction, mouvements (arrivées/départs) du mois, onboarding en cours

**Projets**
- Portefeuille par statut, projets en retard, jalons de la semaine, score moyen

**Transverse / Gouvernance**
- Certificats expirant < 30j, tâches en retard, disponibilité des services (health checks)
