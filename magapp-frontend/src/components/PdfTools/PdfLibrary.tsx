import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Library, Search, Trash2, Download, Eye, FileText, Loader2, AlertCircle, Clock, Mail, Send, X, UserPlus } from 'lucide-react';
import PdfToolShell, { errorBox, btnPrimary, btnSecondary } from './PdfToolShell';
import PdfViewerModal from './PdfViewerModal';
import { getLibrary, deleteLibraryItem, getLibraryBlob, downloadBlob, sendLibraryItem, type LibraryDoc } from './pdfToolsApi';

interface PdfLibraryProps { onClose: () => void }

function formatSize(bytes: number | null): string {
  if (!bytes || bytes <= 0) return '—';
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
}

function formatDate(iso: string): string {
  try { return new Date(iso).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' }); }
  catch { return iso; }
}

/** Nombre de jours restants avant la suppression automatique (rétention 6 mois). */
function daysLeft(iso: string): number {
  const created = new Date(iso).getTime();
  const expiry = created + 182 * 24 * 60 * 60 * 1000; // ~6 mois
  return Math.max(0, Math.ceil((expiry - Date.now()) / (24 * 60 * 60 * 1000)));
}

export default function PdfLibrary({ onClose }: PdfLibraryProps) {
  const [docs, setDocs] = useState<LibraryDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [busyId, setBusyId] = useState<number | null>(null);
  const [preview, setPreview] = useState<{ title: string; loader: () => Promise<Blob> } | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try { setDocs(await getLibrary()); }
    catch (e: any) { setError(e.message || 'Échec du chargement.'); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    const t = search.trim().toLowerCase();
    if (!t) return docs;
    return docs.filter((d) => (d.title || '').toLowerCase().includes(t) || (d.originalName || '').toLowerCase().includes(t));
  }, [docs, search]);

  // Ouvre la visionneuse IMMÉDIATEMENT (spinner), puis charge le fichier en
  // arrière-plan : les gros PDF ne donnent plus l'impression d'être plantés.
  const handlePreview = (d: LibraryDoc) => {
    setError(null);
    setPreview({ title: d.title || d.originalName, loader: () => getLibraryBlob(d.id, true) });
  };

  const handleDownload = async (d: LibraryDoc) => {
    setBusyId(d.id);
    setError(null);
    try { await downloadBlob(await getLibraryBlob(d.id, false), d.originalName || d.title || 'document.pdf'); }
    catch (e: any) { setError(e.message || 'Téléchargement impossible.'); }
    finally { setBusyId(null); }
  };

  const handleDelete = async (d: LibraryDoc) => {
    if (!window.confirm(`Supprimer définitivement « ${d.title || d.originalName} » de la PDFothèque ?`)) return;
    setBusyId(d.id);
    setError(null);
    try { await deleteLibraryItem(d.id); setDocs((prev) => prev.filter((x) => x.id !== d.id)); }
    catch (e: any) { setError(e.message || 'Suppression impossible.'); }
    finally { setBusyId(null); }
  };

  // ── Envoi par mail ────────────────────────────────────────────────────────
  const [sendDoc, setSendDoc] = useState<LibraryDoc | null>(null);
  const [recipients, setRecipients] = useState<string[]>([]);
  const [recipientInput, setRecipientInput] = useState('');
  const [agentResults, setAgentResults] = useState<{ displayName?: string; email?: string; username?: string }[]>([]);
  const [sendSubject, setSendSubject] = useState('');
  const [sendMessage, setSendMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [sendOk, setSendOk] = useState<string | null>(null);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const openSend = (d: LibraryDoc) => {
    setSendDoc(d);
    setRecipients([]);
    setRecipientInput('');
    setAgentResults([]);
    setSendSubject(`Document : ${d.title || d.originalName}`);
    setSendMessage('');
    setSendOk(null);
    setError(null);
  };

  const searchAgents = (q: string) => {
    setRecipientInput(q);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    if (q.trim().length < 2 || q.includes('@')) { setAgentResults([]); return; }
    searchTimer.current = setTimeout(async () => {
      try {
        const token = localStorage.getItem('token');
        const res = await fetch(`/api/ad/search?q=${encodeURIComponent(q)}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
        const data = res.ok ? await res.json() : [];
        setAgentResults(Array.isArray(data) ? data.slice(0, 8) : []);
      } catch { setAgentResults([]); }
    }, 300);
  };

  const addRecipient = (email: string) => {
    const e = String(email || '').trim();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) return;
    setRecipients((prev) => (prev.includes(e) ? prev : [...prev, e]));
    setRecipientInput('');
    setAgentResults([]);
  };

  const doSend = async () => {
    if (!sendDoc) return;
    const to = [...recipients];
    const pending = recipientInput.trim();
    if (/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(pending)) to.push(pending);
    if (!to.length) { setError('Indiquez au moins un destinataire (recherche d’agent ou adresse e-mail).'); return; }
    setSending(true);
    setError(null);
    try {
      const r = await sendLibraryItem(sendDoc.id, { to, subject: sendSubject, message: sendMessage });
      setSendOk(`Mail envoyé à ${r.sent} destinataire(s).`);
      setRecipients([]);
      setRecipientInput('');
    } catch (e: any) { setError(e.message || "Échec de l'envoi."); }
    finally { setSending(false); }
  };

  return (
    <PdfToolShell
      icon={<Library size={26} color="#0e7490" />}
      iconBg="#cffafe"
      title="Ma PDFothèque"
      description="Tous les documents PDF que vous avez enregistrés depuis les outils PDF."
      onClose={onClose}
      maxWidth={900}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', background: '#ecfeff', border: '1px solid #a5f3fc', borderRadius: 10, color: '#155e75', fontSize: '0.82rem', marginBottom: 14 }}>
        <Clock size={16} style={{ flexShrink: 0 }} />
        <span>Les documents sont <strong>conservés 6 mois</strong> puis <strong>supprimés automatiquement</strong>.</span>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, border: '1px solid #e2e8f0', borderRadius: 10, padding: '9px 12px', marginBottom: 14 }}>
        <Search size={16} color="#94a3b8" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Rechercher un document par nom…"
          style={{ flex: 1, border: 'none', outline: 'none', fontSize: '0.88rem' }}
        />
        <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>{filtered.length} / {docs.length}</span>
      </div>

      {error && <div style={errorBox}>{error}</div>}

      {loading ? (
        <div style={{ padding: 30, textAlign: 'center', color: '#94a3b8', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
          <Loader2 size={22} className="animate-spin" /> Chargement…
        </div>
      ) : filtered.length === 0 ? (
        <div style={{ padding: 30, textAlign: 'center', color: '#94a3b8', fontSize: '0.88rem' }}>
          <AlertCircle size={20} style={{ marginBottom: 6 }} />
          <div>{docs.length === 0 ? "Aucun document dans votre PDFothèque pour le moment." : 'Aucun résultat pour cette recherche.'}</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {filtered.map((d) => (
            <div key={d.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', border: '1px solid #e2e8f0', borderRadius: 10, background: '#fff', minWidth: 0 }}>
              <FileText size={18} color="#ef4444" style={{ flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: '0.88rem', fontWeight: 700, color: '#1e293b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={d.title}>
                  {d.title || d.originalName}
                </div>
                <div style={{ fontSize: '0.73rem', color: '#94a3b8' }}>
                  {formatDate(d.created_at)} · {formatSize(d.size)} · v{d.version} · supprimé dans {daysLeft(d.created_at)} j
                </div>
              </div>
              <button style={iconBtn} onClick={() => openSend(d)} title="Envoyer par mail"><Mail size={15} /></button>
              <button style={iconBtn} disabled={busyId === d.id} onClick={() => handlePreview(d)} title="Aperçu"><Eye size={15} /></button>
              <button style={iconBtn} disabled={busyId === d.id} onClick={() => handleDownload(d)} title="Télécharger"><Download size={15} /></button>
              <button style={{ ...iconBtn, color: '#dc2626' }} disabled={busyId === d.id} onClick={() => handleDelete(d)} title="Supprimer"><Trash2 size={15} /></button>
            </div>
          ))}
        </div>
      )}

      {sendDoc && (
        <div onClick={(e) => { if (e.target === e.currentTarget) setSendDoc(null); }}
          style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,.6)', backdropFilter: 'blur(4px)', zIndex: 2300, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div style={{ background: '#fff', borderRadius: 16, width: '100%', maxWidth: 580, maxHeight: '90vh', display: 'flex', flexDirection: 'column', boxShadow: '0 25px 50px -12px rgba(0,0,0,.35)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1px solid #f1f5f9' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 800, color: '#1e293b' }}><Mail size={18} color="#0e7490" /> Envoyer par mail</div>
              <button onClick={() => setSendDoc(null)} style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#64748b' }}><X size={20} /></button>
            </div>
            <div style={{ padding: 20, overflowY: 'auto' }}>
              <div style={{ fontSize: '0.82rem', color: '#64748b', marginBottom: 12 }}>
                Document joint : <strong>{sendDoc.title || sendDoc.originalName}</strong>
              </div>

              <label style={sendLbl}>Destinataires (recherche d'agent ou adresse libre)</label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 6 }}>
                {recipients.map((r) => (
                  <span key={r} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: '#ecfeff', color: '#0e7490', border: '1px solid #a5f3fc', borderRadius: 20, padding: '3px 10px', fontSize: '0.78rem', fontWeight: 600 }}>
                    {r}
                    <button onClick={() => setRecipients((prev) => prev.filter((x) => x !== r))} style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#0891b2', display: 'flex' }}><X size={11} /></button>
                  </span>
                ))}
              </div>
              <div style={{ position: 'relative' }}>
                <input
                  value={recipientInput}
                  onChange={(e) => searchAgents(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ',' || e.key === ';') { e.preventDefault(); addRecipient(agentResults[0]?.email || recipientInput); } }}
                  placeholder="Nom, prénom ou adresse e-mail…"
                  style={sendInput}
                />
                {agentResults.length > 0 && (
                  <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: '#fff', border: '1px solid #bae6fd', borderRadius: 8, boxShadow: '0 8px 24px rgba(0,0,0,.12)', zIndex: 10, maxHeight: 200, overflowY: 'auto', marginTop: 2 }}>
                    {agentResults.map((u, i) => (
                      <div key={u.email || u.username || i} onClick={() => addRecipient(u.email || '')}
                        style={{ padding: '8px 12px', cursor: 'pointer', borderBottom: '1px solid #f1f5f9', fontSize: '0.82rem', display: 'flex', alignItems: 'center', gap: 8 }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = '#f0f9ff')} onMouseLeave={(e) => (e.currentTarget.style.background = '#fff')}>
                        <UserPlus size={13} color="#0e7490" />
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontWeight: 600, color: '#1e293b' }}>{u.displayName || u.email}</div>
                          {u.email && <div style={{ fontSize: '0.72rem', color: '#94a3b8' }}>{u.email}</div>}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <label style={{ ...sendLbl, marginTop: 14 }}>Objet</label>
              <input value={sendSubject} onChange={(e) => setSendSubject(e.target.value)} style={sendInput} />

              <label style={{ ...sendLbl, marginTop: 14 }}>Message</label>
              <textarea value={sendMessage} onChange={(e) => setSendMessage(e.target.value)} rows={5}
                placeholder="Message (laissez vide pour un texte par défaut)…"
                style={{ ...sendInput, resize: 'vertical', lineHeight: 1.5, fontFamily: 'inherit' }} />

              {error && <div style={{ ...errorBox, marginTop: 12 }}>{error}</div>}
              {sendOk && <div style={{ marginTop: 12, color: '#166534', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, padding: '10px 12px', fontSize: '0.82rem', fontWeight: 600 }}>{sendOk}</div>}
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, padding: '14px 20px', borderTop: '1px solid #f1f5f9' }}>
              <button style={btnSecondary} onClick={() => setSendDoc(null)}>Fermer</button>
              <button style={btnPrimary} disabled={sending} onClick={doSend}>
                {sending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />} {sending ? 'Envoi…' : 'Envoyer'}
              </button>
            </div>
          </div>
        </div>
      )}

      {preview && <PdfViewerModal loader={preview.loader} title={preview.title} onClose={() => setPreview(null)} />}
    </PdfToolShell>
  );
}

const iconBtn: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 32, height: 32, border: '1px solid #e2e8f0', background: '#fff', borderRadius: 8, cursor: 'pointer', color: '#475569', flexShrink: 0 };
const sendLbl: React.CSSProperties = { display: 'block', fontSize: '0.74rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', marginBottom: 6 };
const sendInput: React.CSSProperties = { width: '100%', padding: '9px 11px', border: '1px solid #e2e8f0', borderRadius: 9, fontSize: '0.85rem', boxSizing: 'border-box', outline: 'none' };
