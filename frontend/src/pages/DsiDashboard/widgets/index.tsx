import React, { Suspense, lazy } from 'react';
import { Loader2 } from 'lucide-react';

const TicketsKpiWidget      = lazy(() => import('./TicketsKpiWidget'));
const TicketsTrendWidget    = lazy(() => import('./TicketsTrendWidget'));
const TicketsStatusWidget   = lazy(() => import('./TicketsStatusWidget'));
const TicketsCategoriesWidget = lazy(() => import('./TicketsCategoriesWidget'));
const TicketsTechWidget     = lazy(() => import('./TicketsTechWidget'));
const TicketsSlaWidget      = lazy(() => import('./TicketsSlaWidget'));
const TicketsBacklogWidget  = lazy(() => import('./TicketsBacklogWidget'));
const TicketsWeeklyWidget   = lazy(() => import('./TicketsWeeklyWidget'));
const TicketsPerfWidget     = lazy(() => import('./TicketsPerfWidget'));
const TicketsMonthlyWidget  = lazy(() => import('./TicketsMonthlyWidget'));
const CopieursKpiWidget     = lazy(() => import('./CopieursKpiWidget'));
const CopieursEvolutionWidget = lazy(() => import('./CopieursEvolutionWidget'));
const CopieursCostsWidget   = lazy(() => import('./CopieursCostsWidget'));
const CopieursTopDirWidget  = lazy(() => import('./CopieursTopDirWidget'));
const CopieursAlertsWidget  = lazy(() => import('./CopieursAlertsWidget'));
const BudgetKpiWidget       = lazy(() => import('./BudgetKpiWidget'));
const BudgetTrendWidget     = lazy(() => import('./BudgetTrendWidget'));
const BudgetInvoicesWidget  = lazy(() => import('./BudgetInvoicesWidget'));
const MagappMaintenancesWidget = lazy(() => import('./MagappMaintenancesWidget'));
const MagappIdeasWidget     = lazy(() => import('./MagappIdeasWidget'));
const MagappClicksWidget    = lazy(() => import('./MagappClicksWidget'));
const ProjetsWidget         = lazy(() => import('./ProjetsWidget'));
const TicketsRecentWidget   = lazy(() => import('./TicketsRecentWidget'));
const CalendrierDsiWidget   = lazy(() => import('./CalendrierDsiWidget'));

const ConsommablesWidget = lazy(() => import('./CounterWidget').then(m => ({ default: m.ConsommablesWidget })));
const CertificatsWidget  = lazy(() => import('./CounterWidget').then(m => ({ default: m.CertificatsWidget })));
const ContratsWidget     = lazy(() => import('./CounterWidget').then(m => ({ default: m.ContratsWidget })));
const TachesWidget       = lazy(() => import('./CounterWidget').then(m => ({ default: m.TachesWidget })));

const WIDGET_MAP: Record<string, React.ComponentType> = {
  tickets_kpi:        TicketsKpiWidget,
  tickets_trend:      TicketsTrendWidget,
  tickets_status:     TicketsStatusWidget,
  tickets_categories: TicketsCategoriesWidget,
  tickets_technicians: TicketsTechWidget,
  tickets_sla:        TicketsSlaWidget,
  tickets_backlog:    TicketsBacklogWidget,
  tickets_weekly:     TicketsWeeklyWidget,
  tickets_perf:       TicketsPerfWidget,
  tickets_monthly:    TicketsMonthlyWidget,
  copieurs_kpi:       CopieursKpiWidget,
  copieurs_evolution: CopieursEvolutionWidget,
  copieurs_costs:     CopieursCostsWidget,
  copieurs_top_dir:   CopieursTopDirWidget,
  copieurs_alerts:    CopieursAlertsWidget,
  budget_kpi:         BudgetKpiWidget,
  budget_trend:       BudgetTrendWidget,
  budget_invoices:    BudgetInvoicesWidget,
  magapp_maintenances: MagappMaintenancesWidget,
  magapp_ideas:       MagappIdeasWidget,
  magapp_clicks:      MagappClicksWidget,
  consommables:       ConsommablesWidget,
  certificats:        CertificatsWidget,
  contrats:           ContratsWidget,
  taches:             TachesWidget,
  projets:            ProjetsWidget,
  tickets_recent:     TicketsRecentWidget,
  calendrier_dsi:     CalendrierDsiWidget,
};

const Fallback = () => (
  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
    <Loader2 size={20} color="#94a3b8" style={{ animation: 'spin 1s linear infinite' }} />
  </div>
);

export function renderWidget(key: string) {
  const Component = WIDGET_MAP[key];
  if (!Component) return <div style={{ padding: 16, color: '#94a3b8', fontSize: 12 }}>Widget inconnu : {key}</div>;
  return (
    <Suspense fallback={<Fallback />}>
      <Component />
    </Suspense>
  );
}

export { WIDGET_MAP };
