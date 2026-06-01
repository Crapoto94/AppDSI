import { createContext, useContext } from 'react';

export type FilterPeriod = '7d' | '30d' | '90d' | '12m' | 'all';

export interface DashboardFilter {
  period?: FilterPeriod;
  group_id?: number | null;
}

export const DashboardFilterContext = createContext<DashboardFilter>({});
export const useDashboardFilter = () => useContext(DashboardFilterContext);

const PERIOD_DAYS: Record<string, number> = { '7d': 7, '30d': 30, '90d': 90, '12m': 365 };

export function filterToQueryString(f: DashboardFilter): string {
  const params: string[] = [];
  if (f.group_id) params.push(`group_id=${f.group_id}`);
  if (f.period && f.period !== 'all' && PERIOD_DAYS[f.period]) {
    const to = new Date().toISOString().slice(0, 10);
    const from = new Date(Date.now() - PERIOD_DAYS[f.period] * 86400000).toISOString().slice(0, 10);
    params.push(`from=${from}`, `to=${to}`);
  }
  return params.length ? `?${params.join('&')}` : '';
}

export const PERIOD_LABELS: Record<FilterPeriod, string> = {
  '7d': '7 derniers jours',
  '30d': '30 derniers jours',
  '90d': '90 derniers jours',
  '12m': '12 derniers mois',
  'all': 'Tout',
};
