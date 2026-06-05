// ─── Infobulle détaillée d'un usager (survol d'un nom / email @ivry94.fr) ──────
// Affiche fonction (AD title), service (department), direction (company), les
// téléphones AD et le téléphone de contact saisi lors d'une création de ticket.
// Réutilisable partout dans le module Tickets. Données chargées à la demande + cachées.
import React, { useRef, useState } from 'react';
import axios from 'axios';

interface UserInfo {
  displayName: string; title: string; department: string; company: string;
  phones: { telephoneNumber: string; mobile: string; ipPhone: string; otherTelephone: string };
  contact_phone: string | null;
}

const ORG_DOMAIN = /@ivry94\.fr\s*$/i;
const cache = new Map<string, UserInfo | null>();
const inflight = new Map<string, Promise<UserInfo | null>>();

function loadInfo(email: string): Promise<UserInfo | null> {
  const key = email.toLowerCase();
  if (cache.has(key)) return Promise.resolve(cache.get(key)!);
  if (!inflight.has(key)) {
    const token = localStorage.getItem('token');
    const p = axios.get(`/api/ad/user-info?email=${encodeURIComponent(email)}`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => { cache.set(key, r.data); return r.data as UserInfo; })
      .catch(() => { cache.set(key, null); return null; })
      .finally(() => inflight.delete(key));
    inflight.set(key, p);
  }
  return inflight.get(key)!;
}

interface Props {
  email?: string | null;
  name?: string | null;
  children?: React.ReactNode;
  style?: React.CSSProperties;
}

export default function UserHoverCard({ email, name, children, style }: Props) {
  const [open, setOpen] = useState(false);
  const [info, setInfo] = useState<UserInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const eligible = !!email && ORG_DOMAIN.test(email.trim());

  const onEnter = (e: React.MouseEvent) => {
    if (!eligible) return;
    const x = Math.min(e.clientX + 14, window.innerWidth - 320);
    const y = Math.min(e.clientY + 14, window.innerHeight - 230);
    setPos({ x, y });
    timer.current = setTimeout(async () => {
      setOpen(true);
      if (!info) {
        setLoading(true);
        const data = await loadInfo(email!.trim());
        setInfo(data);
        setLoading(false);
      }
    }, 250);
  };
  const onLeave = () => { if (timer.current) clearTimeout(timer.current); setOpen(false); };

  const label = children ?? name ?? email ?? '';

  return (
    <span
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
      style={{ ...style, ...(eligible ? { cursor: 'help', textDecorationLine: 'underline', textDecorationStyle: 'dotted', textUnderlineOffset: 3 } : {}) }}
    >
      {label}
      {open && eligible && (
        <div style={{
          position: 'fixed', left: pos.x, top: pos.y, zIndex: 4000, width: 300, boxSizing: 'border-box',
          background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12,
          boxShadow: '0 12px 30px -8px rgba(15,23,42,0.28)', padding: 14, fontSize: 13, color: '#1e293b',
          cursor: 'default', textDecoration: 'none', overflowWrap: 'anywhere', whiteSpace: 'normal',
        }}>
          {loading && !info ? (
            <div style={{ color: '#94a3b8' }}>Chargement…</div>
          ) : !info ? (
            <div style={{ color: '#94a3b8' }}>Aucune information.</div>
          ) : (
            <>
              <div style={{ fontWeight: 800, fontSize: 14, marginBottom: 8, color: '#0f172a', overflowWrap: 'anywhere' }}>
                {info.displayName || name || email}
              </div>
              <Row label="Fonction" value={info.title} />
              <Row label="Service" value={info.department} />
              <Row label="Direction" value={info.company} />
              {(info.phones.telephoneNumber || info.phones.mobile || info.phones.ipPhone || info.phones.otherTelephone) && (
                <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid #f1f5f9' }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', marginBottom: 4 }}>Téléphones (AD)</div>
                  <Row label="Fixe" value={info.phones.telephoneNumber} mono />
                  <Row label="Mobile" value={info.phones.mobile} mono />
                  <Row label="IP" value={info.phones.ipPhone} mono />
                  <Row label="Autre" value={info.phones.otherTelephone} mono />
                </div>
              )}
              {info.contact_phone && (
                <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid #f1f5f9' }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: '#ecfdf5', color: '#047857', padding: '4px 10px', borderRadius: 8, fontWeight: 700 }}>
                    📞 Contact ticket : <span style={{ fontFamily: 'monospace' }}>{info.contact_phone}</span>
                  </span>
                </div>
              )}
              {!info.title && !info.department && !info.company && !info.contact_phone &&
                !info.phones.telephoneNumber && !info.phones.mobile && !info.phones.ipPhone && !info.phones.otherTelephone && (
                  <div style={{ color: '#94a3b8' }}>Aucune information AD.</div>
                )}
            </>
          )}
        </div>
      )}
    </span>
  );
}

function Row({ label, value, mono }: { label: string; value?: string; mono?: boolean }) {
  if (!value) return null;
  return (
    <div style={{ display: 'flex', gap: 8, padding: '2px 0' }}>
      <span style={{ color: '#64748b', minWidth: 64, flexShrink: 0 }}>{label}</span>
      <span style={{ fontWeight: 600, fontFamily: mono ? 'monospace' : undefined, flex: 1, minWidth: 0, overflowWrap: 'anywhere', wordBreak: 'break-word' }}>{value}</span>
    </div>
  );
}
