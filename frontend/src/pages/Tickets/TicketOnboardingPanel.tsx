import { useEffect, useState } from 'react';
import axios from 'axios';

interface OnboardingTask {
  id: number;
  titre: string;
  kind?: 'compte' | 'autre';
  done: boolean;
  date_completion?: string | null;
  commentaire?: string | null;
  responsable?: string | null;
}

interface OnboardingData {
  statut?: string | null;
  agent?: { nom?: string; prenom?: string } | null;
  tasks: OnboardingTask[];
  updated_at?: string;
}

const REFRESH_MS = 20000;

const fmtDate = (d?: string | null) => {
  if (!d) return '';
  const dt = new Date(d);
  return isNaN(dt.getTime()) ? '' : dt.toLocaleDateString('fr-FR');
};

/**
 * Checklist des tâches d'onboarding (création de comptes logiciels, etc.) d'un
 * ticket « Arrivée d'agent ». Alimentée par RH Studio (hub_tickets.ticket_onboarding),
 * rafraîchie périodiquement : les cases se cochent toutes seules à mesure que les
 * créateurs de compte acquittent leur tâche. Rien n'est affiché pour un ticket
 * sans onboarding RH Studio.
 */
export default function TicketOnboardingPanel({ ticketId }: { ticketId: string | number }) {
  const [data, setData] = useState<OnboardingData | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const token = localStorage.getItem('token');
        const res = await axios.get(`/api/tasks/onboarding/${ticketId}`, { headers: { Authorization: `Bearer ${token}` } });
        if (!cancelled) setData(res.data && Array.isArray(res.data.tasks) ? res.data : null);
      } catch {
        /* silencieux : le panneau reste dans son dernier état */
      }
    };
    load();
    const timer = setInterval(() => { if (!document.hidden) load(); }, REFRESH_MS);
    return () => { cancelled = true; clearInterval(timer); };
  }, [ticketId]);

  if (!data || data.tasks.length === 0) return null;

  const total = data.tasks.length;
  const doneCount = data.tasks.filter((t) => t.done).length;
  const pct = Math.round((doneCount / total) * 100);
  const allDone = doneCount === total;
  const accounts = data.tasks.filter((t) => t.kind === 'compte');
  const others = data.tasks.filter((t) => t.kind !== 'compte');

  const renderTask = (t: OnboardingTask) => (
    <div key={t.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '6px 8px', borderRadius: 6, background: t.done ? '#f0fdf4' : '#fafafa', border: `1px solid ${t.done ? '#bbf7d0' : '#e4e4e7'}` }}>
      <span aria-hidden style={{ fontSize: 13, lineHeight: '18px' }}>{t.done ? '✅' : '⏳'}</span>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ fontSize: 12, color: t.done ? '#166534' : '#3f3f46', textDecoration: t.done ? 'line-through' : 'none', wordBreak: 'break-word' }}>{t.titre}</div>
        <div style={{ fontSize: 11, color: '#a1a1aa', marginTop: 1 }}>
          {t.done
            ? `Terminé${t.date_completion ? ` le ${fmtDate(t.date_completion)}` : ''}${t.commentaire ? ` — ${t.commentaire}` : ''}`
            : `En attente${t.responsable ? ` — ${t.responsable}` : ''}`}
        </div>
      </div>
    </div>
  );

  const group = (title: string, list: OnboardingTask[]) => list.length > 0 && (
    <div style={{ marginTop: 8 }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: '#71717a', marginBottom: 4 }}>{title}</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>{list.map(renderTask)}</div>
    </div>
  );

  return (
    <div style={{ borderBottom: '1px solid #f4f4f5', paddingBottom: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 0 8px' }}>
        <span style={{ fontSize: 11, fontWeight: 600, color: '#a1a1aa', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          Onboarding — comptes à créer
        </span>
        <span style={{ fontSize: 11, fontWeight: 600, color: allDone ? '#16a34a' : '#6366f1' }}>{doneCount}/{total}</span>
      </div>
      <div style={{ height: 6, borderRadius: 3, background: '#e4e4e7', overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: allDone ? '#22c55e' : '#6366f1', transition: 'width .4s' }} />
      </div>
      {group('Comptes logiciels', accounts)}
      {group(accounts.length > 0 ? 'Autres tâches' : 'Tâches', others)}
    </div>
  );
}
