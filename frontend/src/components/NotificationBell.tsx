import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell } from 'lucide-react';

type N = { id: number; title: string; body: string; link: string; read_at: string | null; created_at: string };

const NotificationBell: React.FC = () => {
  const navigate = useNavigate();
  const [unread, setUnread] = useState(0);
  const [items, setItems] = useState<N[]>([]);
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const headers = () => ({ Authorization: `Bearer ${localStorage.getItem('token')}` });

  const loadCount = useCallback(async () => {
    try {
      const r = await fetch('/api/notifications/unread-count', { headers: headers() });
      if (r.ok) setUnread((await r.json()).unread);
    } catch { /* ignore */ }
  }, []);
  const loadList = async () => {
    try {
      const r = await fetch('/api/notifications', { headers: headers() });
      if (r.ok) { const d = await r.json(); setItems(d.items); setUnread(d.unread); }
    } catch { /* ignore */ }
  };

  useEffect(() => { loadCount(); const t = setInterval(loadCount, 60000); return () => clearInterval(t); }, [loadCount]);
  useEffect(() => {
    if (!open) return;
    loadList();
    const h = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [open]);

  const openItem = async (n: N) => {
    if (!n.read_at) await fetch(`/api/notifications/${n.id}/read`, { method: 'POST', headers: headers() }).catch(() => {});
    setOpen(false);
    loadCount();
    if (n.link) navigate(n.link);
  };
  const readAll = async () => {
    await fetch('/api/notifications/read-all', { method: 'POST', headers: headers() }).catch(() => {});
    loadList();
  };

  return (
    <div ref={box} style={{ position: 'relative', display: 'inline-flex', marginRight: 12 }}>
      <button onClick={() => setOpen(o => !o)} title="Notifications"
        style={{ background: 'none', border: 'none', cursor: 'pointer', position: 'relative', padding: 4, color: 'inherit', display: 'flex' }}>
        <Bell size={20} />
        {unread > 0 && (
          <span style={{ position: 'absolute', top: -2, right: -4, background: '#dc2626', color: '#fff', borderRadius: 10, fontSize: 10, fontWeight: 700, minWidth: 16, height: 16, lineHeight: '16px', textAlign: 'center', padding: '0 4px' }}>
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>
      {open && (
        <div style={{ position: 'absolute', right: 0, top: '110%', width: 360, maxHeight: 440, overflowY: 'auto', background: '#fff', color: '#0f172a', border: '1px solid #e2e8f0', borderRadius: 10, boxShadow: '0 10px 30px rgba(0,0,0,0.18)', zIndex: 10000 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', borderBottom: '1px solid #f1f5f9' }}>
            <b style={{ fontSize: 13 }}>Notifications</b>
            {unread > 0 && <button onClick={readAll} style={{ background: 'none', border: 'none', color: '#2563eb', cursor: 'pointer', fontSize: 12 }}>Tout marquer comme lu</button>}
          </div>
          {items.length === 0 && <div style={{ padding: 20, textAlign: 'center', fontSize: 13, color: '#94a3b8' }}>Aucune notification</div>}
          {items.map(n => (
            <div key={n.id} onClick={() => openItem(n)}
              style={{ padding: '10px 14px', cursor: 'pointer', borderBottom: '1px solid #f8fafc', background: n.read_at ? '#fff' : '#eff6ff' }}>
              <div style={{ fontSize: 13, fontWeight: n.read_at ? 500 : 700 }}>{n.title}</div>
              <div style={{ fontSize: 12, color: '#64748b', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{n.body}</div>
              <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 2 }}>{new Date(n.created_at).toLocaleString('fr-FR')}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default NotificationBell;
