import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { useAuth } from '../../../contexts/AuthContext';
import WidgetWrapper from './WidgetWrapper';
import { ChevronLeft, ChevronRight } from 'lucide-react';

const CATEGORIES = ['absence', 'teletravail', 'deploiement', 'reunion', 'hotline', 'maintenance'] as const;
type Cat = typeof CATEGORIES[number];

const CAT_COLOR: Record<Cat, string> = {
  absence: '#E30613', teletravail: '#003366', deploiement: '#4CAF50',
  reunion: '#9C27B0', hotline: '#22c55e', maintenance: '#FF9800',
};
const CAT_LABEL: Record<Cat, string> = {
  absence: 'Absents', teletravail: 'Télétravailleurs', deploiement: 'Déploiements',
  reunion: 'Réunions', hotline: 'Hotline', maintenance: 'Maintenance',
};

const SVC_MAP: Record<string, string> = {
  'Bureau Des Projets': '#e17055',
  'Service Infrastructure Reseaux Systemes': '#27ae60',
  'Service Support Déploiement': '#3498db',
  "Direction des Systemes d'Information": '#6c5ce7',
};
const PALETTE = ['#e17055','#00b894','#0984e3','#6c5ce7','#fdcb6e','#00cec9','#e84393','#636e72'];
function svcColor(s: string) {
  if (!s) return '#666';
  if (SVC_MAP[s]) return SVC_MAP[s];
  let h = 0; for (let i = 0; i < s.length; i++) { h = ((h << 5) - h) + s.charCodeAt(i); h |= 0; }
  return PALETTE[Math.abs(h) % PALETTE.length];
}

function getInitials(name: string | null | undefined): string {
  if (!name) return '??';
  const p = name.trim().split(/\s+/);
  return p.length >= 2 ? (p[1][0] + p[0][0]).toUpperCase() : name.substring(0, 2).toUpperCase();
}

function isoDate(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
function getMonday(offset = 0) {
  const now = new Date();
  const day = now.getDay() === 0 ? 6 : now.getDay() - 1;
  const mon = new Date(now);
  mon.setDate(now.getDate() - day + offset * 7);
  mon.setHours(0, 0, 0, 0);
  return mon;
}

const isSedit     = (e: any) => String(e.source || '').trim() === 'demabs' || String(e.created_by || '').startsWith('auto-rh');
const isPending   = (e: any) => !!e.pending || String(e.created_by || '') === 'auto-rh-pending';
const isJustifier = (e: any) => String(e.titre || '').toLowerCase().includes('justifier');
const isFormaDep  = (e: any) => {
  const t = `${e.titre || ''} ${e.description || ''}`.toLowerCase();
  return t.includes('formation') || t.includes('déplacement') || t.includes('deplacement');
};

function absenceColor(e: any): string {
  if (isSedit(e))     return isPending(e) ? '#a78bfa' : '#7c3aed';
  if (isFormaDep(e))  return '#0891b2';
  if (isJustifier(e)) return '#E30613';
  return CAT_COLOR.absence;
}

// ── Calcule ce qu'on affiche pour chaque agent sur une période donnée ─────────
// Règle : si agent a SEDIT ET justifier → montrer SEDIT (couleur violette) avec
//         flag rouge. L'absence à justifier est masquée.
interface AgentSlot {
  username: string;
  nom: string;
  ev: any;       // événement représentatif à afficher
  flagged: boolean; // SEDIT couvre un "à justifier"
}

// Normalise la période : null/undefined/'' → '' (pleine journée)
const normP = (p: any): string => (p == null || p === '') ? '' : String(p).trim();

function computeAgentSlots(
  agentEvents: Map<string, any[]>,
  periode: string, // 'matin' | 'apres-midi' | ''
): AgentSlot[] {
  const slots: AgentSlot[] = [];

  for (const [username, evts] of agentEvents) {
    // Normaliser toutes les périodes
    const norm = evts.map(e => ({ ...e, _p: normP(e.periode) }));

    // Un agent est dans ce slot s'il a au moins un événement avec période exacte OU pleine journée
    const inSlot = periode === ''
      ? norm.filter(e => e._p === '')                          // section pleine journée : seulement les full-day
      : norm.filter(e => e._p === periode || e._p === '');    // section M ou A : période exacte + full-day

    if (inSlot.length === 0) continue;

    // Si l'agent apparaît dans M ou A (slot non vide avant la section full-day),
    // et qu'on est dans la section full-day → il sera filtré plus haut, on ignore ici
    const hasSedit     = inSlot.some(isSedit);
    const hasJustifier = periode === ''
      // Pour la section full-day, chercher des justifiers sur toutes les périodes de l'agent
      ? norm.some(isJustifier)
      : inSlot.some(isJustifier);

    // Événement représentatif : SEDIT en priorité
    const repEv = inSlot.find(isSedit) ?? inSlot.find(e => !isJustifier(e)) ?? inSlot[0];

    slots.push({
      username,
      nom: repEv.agent_nom || username,
      ev: repEv,
      flagged: hasSedit && hasJustifier,
    });
  }

  return slots;
}

export default function CalendrierDsiWidget() {
  const { token } = useAuth();
  const [events, setEvents] = useState<any[]>([]);
  const [agents, setAgents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [weekOffset, setWeekOffset] = useState(0);

  const weekStart = getMonday(weekOffset);
  const weekDays = Array.from({ length: 5 }, (_, i) => {
    const d = new Date(weekStart); d.setDate(weekStart.getDate() + i); return d;
  });
  const today = isoDate(new Date());

  useEffect(() => {
    setLoading(true);
    const h = { Authorization: `Bearer ${token}` };
    const debut = isoDate(weekStart);
    const fin = isoDate(new Date(weekDays[4].getTime() + 2 * 86400000));
    Promise.all([
      axios.get(`/api/calendrier-dsi/evenements?debut=${debut}&fin=${fin}`, { headers: h }),
      axios.get('/api/calendrier-dsi/agents', { headers: h }),
    ])
      .then(([eR, aR]) => {
        setEvents(Array.isArray(eR.data) ? eR.data : []);
        setAgents(Array.isArray(aR.data) ? aR.data : []);
      })
      .catch(e => setError(e.response?.data?.message || 'Erreur'))
      .finally(() => setLoading(false));
  }, [token, weekOffset]);

  const svcMap = new Map<string, string>(agents.map((a: any) => [a.username, a.service || '']));

  function eventsFor(ds: string, cat: Cat) {
    return events.filter(e => e.date?.slice(0, 10) === ds && e.categorie === cat);
  }

  // Regroupe les événements par agent_username
  function buildAgentMap(evts: any[]): Map<string, any[]> {
    const m = new Map<string, any[]>();
    for (const e of evts) {
      if (!e.agent_username) continue;
      if (!m.has(e.agent_username)) m.set(e.agent_username, []);
      m.get(e.agent_username)!.push(e);
    }
    return m;
  }

  // ── Pastille cercle ───────────────────────────────────────────────────────
  function Dot({ slot, cat }: { slot: AgentSlot; cat: Cat }) {
    const isAbsTT = cat === 'absence' || cat === 'teletravail';
    const bg = isAbsTT
      ? absenceColor(slot.ev)
      : svcColor(svcMap.get(slot.username) || '');
    const title = [
      slot.nom,
      slot.flagged ? '⚠ Sedit + à justifier' : '',
      slot.ev.description || slot.ev.titre,
    ].filter(Boolean).join(' — ');

    return (
      <div title={title} style={{
        width: 34, height: 34, borderRadius: '50%', flexShrink: 0,
        background: bg, color: '#fff',
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        fontSize: '0.66rem', fontWeight: 700, cursor: 'default', userSelect: 'none',
        boxShadow: slot.flagged
          ? '0 0 0 2.5px #ef4444, 0 0 0 5px rgba(239,68,68,.2)'
          : '0 2px 5px rgba(0,0,0,.12)',
        position: 'relative',
      }}>
        {getInitials(slot.nom)}
        {slot.flagged && (
          <span style={{
            position: 'absolute', bottom: -1, right: -1,
            width: 11, height: 11, borderRadius: '50%',
            background: '#ef4444', border: '2px solid white',
          }} />
        )}
      </div>
    );
  }

  // ── Pastille texte (réunion, maintenance…) ───────────────────────────────
  function Pill({ ev }: { ev: any }) {
    const bg = CAT_COLOR[ev.categorie as Cat] ?? '#64748b';
    return (
      <div title={ev.titre || ev.description || ''} style={{
        display: 'inline-flex', alignItems: 'center', padding: '3px 9px', borderRadius: 12,
        fontSize: '0.68rem', fontWeight: 600, background: bg, color: '#fff',
        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        maxWidth: '100%', boxShadow: '0 1px 3px rgba(0,0,0,.1)', cursor: 'default',
      }}>
        {ev.titre || ev.categorie}
      </div>
    );
  }

  // ── Cellule ───────────────────────────────────────────────────────────────
  function Cell({ ds, cat }: { ds: string; cat: Cat }) {
    const all = eventsFor(ds, cat);
    if (all.length === 0) {
      return <div style={{ color: '#d1d5db', fontSize: '1.1rem', textAlign: 'center', paddingTop: 10 }}>+</div>;
    }

    const isAbsTT = cat === 'absence' || cat === 'teletravail';

    if (isAbsTT) {
      const agentMap = buildAgentMap(all);

      const amSlots   = computeAgentSlots(agentMap, 'matin');
      const pmSlots   = computeAgentSlots(agentMap, 'apres-midi');

      // Pleine journée : agents dont TOUS les événements sont periode=''
      // et qui n'apparaissent pas déjà dans M ou A
      const inAmOrPm = new Set([...amSlots, ...pmSlots].map(s => s.username));
      const fullSlots = computeAgentSlots(agentMap, '').filter(s => !inAmOrPm.has(s.username));

      // Événements sans agent_username (non liés à un agent)
      const noAgentEvts = all.filter(e => !e.agent_username);

      return (
        <>
          {amSlots.length > 0 && (
            <div style={{ display: 'flex', gap: 3, alignItems: 'flex-start', marginBottom: 3 }}>
              <span style={{ fontSize: '0.58rem', fontWeight: 700, color: '#94a3b8', minWidth: 9, paddingTop: 3 }}>M</span>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
                {amSlots.map(s => <Dot key={s.username} slot={s} cat={cat} />)}
              </div>
            </div>
          )}
          {pmSlots.length > 0 && (
            <div style={{ display: 'flex', gap: 3, alignItems: 'flex-start', marginBottom: 3 }}>
              <span style={{ fontSize: '0.58rem', fontWeight: 700, color: '#94a3b8', minWidth: 9, paddingTop: 3 }}>A</span>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
                {pmSlots.map(s => <Dot key={s.username} slot={s} cat={cat} />)}
              </div>
            </div>
          )}
          {fullSlots.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
              {fullSlots.map(s => <Dot key={s.username} slot={s} cat={cat} />)}
            </div>
          )}
          {noAgentEvts.map(e => <Pill key={e.id} ev={e} />)}
        </>
      );
    }

    // Autres catégories
    const amEvts   = all.filter(e => e.periode === 'matin');
    const pmEvts   = all.filter(e => e.periode === 'apres-midi');
    const fullEvts = all.filter(e => e.periode === '');
    const isAgt    = (e: any) => !!e.agent_username;

    const renderEv = (e: any) => isAgt(e)
      ? <Dot key={e.id} slot={{ username: e.agent_username, nom: e.agent_nom, ev: e, flagged: false }} cat={cat} />
      : <Pill key={e.id} ev={e} />;

    return (
      <>
        {amEvts.length > 0 && (
          <div style={{ display: 'flex', gap: 3, alignItems: 'flex-start', marginBottom: 3 }}>
            <span style={{ fontSize: '0.58rem', fontWeight: 700, color: '#94a3b8', minWidth: 9, paddingTop: 3 }}>M</span>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>{amEvts.map(renderEv)}</div>
          </div>
        )}
        {pmEvts.length > 0 && (
          <div style={{ display: 'flex', gap: 3, alignItems: 'flex-start', marginBottom: 3 }}>
            <span style={{ fontSize: '0.58rem', fontWeight: 700, color: '#94a3b8', minWidth: 9, paddingTop: 3 }}>A</span>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>{pmEvts.map(renderEv)}</div>
          </div>
        )}
        {fullEvts.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>{fullEvts.map(renderEv)}</div>
        )}
      </>
    );
  }

  const weekLabel = `Semaine du ${weekDays[0].getDate()} au ${weekDays[4].getDate()} ${weekDays[4].toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })}`;

  return (
    <WidgetWrapper title="Calendrier DSI" loading={loading} error={error}>
      {/* Nav */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <button onClick={() => setWeekOffset(w => w - 1)} style={navBtn}><ChevronLeft size={14} /></button>
        <span style={{ fontSize: 12, fontWeight: 600, color: '#374151' }}>{weekLabel}</span>
        <div style={{ display: 'flex', gap: 4 }}>
          {weekOffset !== 0 && (
            <button onClick={() => setWeekOffset(0)} style={{ ...navBtn, fontSize: 10, padding: '2px 8px', borderRadius: 4, background: '#f1f5f9' }}>Auj.</button>
          )}
          <button onClick={() => setWeekOffset(w => w + 1)} style={navBtn}><ChevronRight size={14} /></button>
        </div>
      </div>

      {/* Légende */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '3px 10px', marginBottom: 8 }}>
        {[
          { c: '#E30613', l: 'Absent' },
          { c: '#0891b2', l: 'Formation/Déplacement' },
          { c: '#7c3aed', l: 'Sedit' },
          { c: '#a78bfa', l: 'Sedit prov.' },
          { c: '#003366', l: 'TT' },
        ].map(({ c, l }) => (
          <span key={l} style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 10, color: '#64748b' }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: c, flexShrink: 0 }} />{l}
          </span>
        ))}
        <span style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 10, color: '#64748b' }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#7c3aed', boxShadow: '0 0 0 2px #ef4444', flexShrink: 0 }} />
          Sedit + à justifier
        </span>
      </div>

      {/* Grille */}
      <div style={{
        display: 'grid', gridTemplateColumns: '110px repeat(5, 1fr)',
        border: '1px solid #e2e8f0', borderRadius: 10, overflow: 'hidden',
        background: 'white', boxShadow: '0 2px 8px rgba(0,0,0,.06)',
      }}>
        {/* Header */}
        <div style={hdrCell(false)} />
        {weekDays.map(d => {
          const ds = isoDate(d);
          return (
            <div key={ds} style={hdrCell(ds === today)}>
              <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'capitalize' }}>
                {d.toLocaleDateString('fr-FR', { weekday: 'short' })}
              </span>
              <span style={{ fontSize: 16, fontWeight: 800 }}>{d.getDate()}</span>
            </div>
          );
        })}

        {CATEGORIES.map(cat => (
          <React.Fragment key={cat}>
            <div style={{
              background: '#f8fafc', borderRight: '1px solid #e2e8f0', borderBottom: '1px solid #e2e8f0',
              padding: '10px', display: 'flex', alignItems: 'center', gap: 7,
              fontSize: 11, fontWeight: 600, color: '#475569',
            }}>
              <span style={{ width: 9, height: 9, borderRadius: '50%', background: CAT_COLOR[cat], flexShrink: 0 }} />
              {CAT_LABEL[cat]}
            </div>
            {weekDays.map(d => {
              const ds = isoDate(d);
              return (
                <div key={ds} style={{
                  borderRight: '1px solid #e2e8f0', borderBottom: '1px solid #e2e8f0',
                  padding: 7, minHeight: 72, background: ds === today ? '#fffbf0' : 'white',
                  display: 'flex', flexDirection: 'column', gap: 2,
                }}>
                  <Cell ds={ds} cat={cat} />
                </div>
              );
            })}
          </React.Fragment>
        ))}
      </div>
    </WidgetWrapper>
  );
}

const navBtn: React.CSSProperties = {
  border: 'none', background: 'none', cursor: 'pointer',
  color: '#64748b', display: 'flex', padding: 4, borderRadius: 4, alignItems: 'center',
};
const hdrCell = (isToday: boolean): React.CSSProperties => ({
  background: isToday
    ? 'linear-gradient(135deg, #efe9ff 0%, #ddd6fe 100%)'
    : 'linear-gradient(135deg, #f1f5f9 0%, #e2e8f0 100%)',
  borderRight: '1px solid #e2e8f0', borderBottom: '2px solid #0f172a',
  padding: '10px 8px', display: 'flex', flexDirection: 'column',
  alignItems: 'center', justifyContent: 'center', gap: 4,
  color: isToday ? '#7c3aed' : '#0f172a',
});
