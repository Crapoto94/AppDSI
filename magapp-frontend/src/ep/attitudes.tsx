import { CRITERIA_GROUPS } from './crep';
import { COLORS } from './ui';

/** Points par niveau d'appréciation : Satisfaisant / conforme = 100 %, Assez satisfaisant / partiellement conforme = 66 %, Insuffisant / non conforme = 33 %. */
export const ATTITUDE_POINTS: Record<string, number> = { S: 100, AS: 66, I: 33 };

export interface AttitudeGroup { key: string; title: string; pct: number | null; answered: number; total: number }
export interface AttitudeScore { global: number | null; answered: number; total: number; groups: AttitudeGroup[] }

const mean = (points: number[]) => (points.length ? Math.round(points.reduce((a, b) => a + b, 0) / points.length) : null);

/** Synthèse des attitudes évaluées (grille d'appréciation de la valeur professionnelle) : moyenne par rubrique et moyenne globale des critères renseignés. */
export function attitudesScore(valeur?: Record<string, string> | null, groupsDef?: typeof CRITERIA_GROUPS): AttitudeScore {
  const v = valeur || {};
  const all: number[] = [];
  const groups = (groupsDef || CRITERIA_GROUPS).map(g => {
    const pts = g.items.map(it => ATTITUDE_POINTS[v[it.key]]).filter((p): p is number => typeof p === 'number');
    return { key: g.key, title: g.title || 'Sens du service public', pct: mean(pts), answered: pts.length, total: g.items.length };
  });
  // Moyenne globale sur toutes les réponses de la grille (les critères diffèrent d'un modèle à l'autre).
  for (const lvl of Object.values(v)) { const p = ATTITUDE_POINTS[lvl as string]; if (typeof p === 'number') all.push(p); }
  return { global: mean(all), answered: all.length, total: groupsDef ? groups.reduce((n, g) => n + g.total, 0) : Math.max(all.length, groups.reduce((n, g) => n + g.total, 0)), groups };
}

/** Moyenne globale sur plusieurs entretiens : tous les critères renseignés sont pris ensemble. */
export function attitudesGlobal(valeurs: Array<Record<string, string> | null | undefined>): { pct: number | null; entretiens: number } {
  const pts: number[] = []; let entretiens = 0;
  for (const val of valeurs) {
    const before = pts.length;
    // Toutes les réponses de la grille, quel que soit le modèle (les critères diffèrent d'un modèle à l'autre).
    for (const lvl of Object.values(val || {})) { const p = ATTITUDE_POINTS[lvl as string]; if (typeof p === 'number') pts.push(p); }
    if (pts.length > before) entretiens++;
  }
  return { pct: mean(pts), entretiens };
}

export const attitudeColor = (pct: number | null) => (pct === null ? '#94a3b8' : pct >= 83 ? COLORS.success : pct >= 50 ? '#d97706' : COLORS.danger);

function Bar({ pct }: { pct: number | null }) {
  return (
    <div style={{ height: 8, background: '#e2e8f0', borderRadius: 999, overflow: 'hidden', flex: 1, minWidth: 80 }}>
      <div style={{ width: (pct ?? 0) + '%', height: '100%', background: attitudeColor(pct), transition: 'width .2s' }} />
    </div>
  );
}

/** Pastille « xx % » colorée (liste des entretiens). */
export function AttitudeBadge({ pct }: { pct: number | null }) {
  if (pct === null) return <span style={{ fontSize: 11.5, color: '#94a3b8' }}>—</span>;
  return <span style={{ fontSize: 12, fontWeight: 800, color: attitudeColor(pct) }}>{pct} %</span>;
}

/** Bloc de synthèse affiché sous la grille d'appréciation. */
export function AttitudesSynthese({ valeur, groups }: { valeur?: Record<string, string> | null; groups?: typeof CRITERIA_GROUPS }) {
  const s = attitudesScore(valeur, groups);
  return (
    <div style={{ marginTop: 14, border: '1px solid ' + COLORS.border, borderRadius: 10, padding: '12px 14px', background: '#f8fafc' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 8 }}>
        <div style={{ fontSize: 13, fontWeight: 800, color: COLORS.text }}>Synthèse des attitudes évaluées</div>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'baseline', gap: 6 }}>
          <span style={{ fontSize: 11.5, color: COLORS.muted }}>Moyenne globale</span>
          <span style={{ fontSize: 24, fontWeight: 800, color: attitudeColor(s.global) }}>{s.global === null ? '—' : s.global + ' %'}</span>
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {s.groups.map(g => (
          <div key={g.key} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 12 }}>
            <div style={{ width: 260, maxWidth: '45%', color: '#334155' }}>{g.title} <span style={{ color: '#94a3b8' }}>({g.answered}/{g.total})</span></div>
            <Bar pct={g.pct} />
            <div style={{ width: 44, textAlign: 'right', fontWeight: 700, color: attitudeColor(g.pct) }}>{g.pct === null ? '—' : g.pct + ' %'}</div>
          </div>
        ))}
      </div>
      <div style={{ fontSize: 10.5, color: '#94a3b8', marginTop: 8 }}>
        Satisfaisant / conforme = 100 % · Assez satisfaisant / partiellement conforme = 66 % · Insuffisant / non conforme = 33 %. Moyenne sur les {s.answered} critère(s) renseigné(s) sur {s.total}.
      </div>
    </div>
  );
}
