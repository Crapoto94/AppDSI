import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import SignatureCanvas from 'react-signature-canvas';
import { FileSignature, PenSquare, Clock, CheckCircle2, XCircle, Ban, FileText, RefreshCw, Eraser, Save, Trash2, ShieldCheck } from 'lucide-react';
import { isSuperAdmin } from '../../utils/roles';
import Header from '../../components/Header';
import SignaturePad from '../../components/parapheur/SignaturePad';
import { signatureDataUrl } from '../../components/parapheur/signatureUtils';
import { useAuth } from '../../contexts/AuthContext';

interface ParapheurRow {
  id: number;
  reference: string;
  title: string;
  status: string;
  mode: string;
  deadline?: string | null;
  created_at: string;
  signataire_status?: string;
  nb_signataires?: number;
  nb_signes?: number;
  nb_documents?: number;
}

type Tab = 'created' | 'toSign' | 'signed' | 'mySignature' | 'all';

const STATUS: Record<string, { label: string; color: string; bg: string; icon: React.ReactNode }> = {
  en_cours: { label: 'En cours', color: '#1d4ed8', bg: '#eff6ff', icon: <Clock size={14} /> },
  termine: { label: 'Terminé', color: '#15803d', bg: '#f0fdf4', icon: <CheckCircle2 size={14} /> },
  refuse: { label: 'Refusé', color: '#b91c1c', bg: '#fef2f2', icon: <XCircle size={14} /> },
  annule: { label: 'Annulé', color: '#64748b', bg: '#f1f5f9', icon: <Ban size={14} /> },
};

export default function ParapheurList() {
  const { token, user } = useAuth();
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>('created');
  const [rows, setRows] = useState<ParapheurRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [counts, setCounts] = useState<{ created: number; toSign: number; signed: number }>({ created: 0, toSign: 0, signed: 0 });

  const headers = { Authorization: `Bearer ${token}` };

  const loadCounts = useCallback(async () => {
    if (!token) return;
    try {
      const r = await fetch('/api/parapheur/counts', { headers: { Authorization: `Bearer ${token}` } });
      if (r.ok) setCounts(await r.json());
    } catch { /* ignore */ }
  }, [token]);

  useEffect(() => { loadCounts(); }, [loadCounts]);

  const load = useCallback(async (t: Tab) => {
    if (t === 'mySignature' || !token) return;
    setLoading(true); setError(null);
    try {
      const url = t === 'created' ? '/api/parapheur'
        : t === 'toSign' ? '/api/parapheur/a-signer'
        : t === 'signed' ? '/api/parapheur/signes'
        : t === 'all' ? '/api/parapheur/all'
        : null;
      if (!url) return;
      const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      const data = await r.json();
      if (!r.ok) throw new Error(data.message || 'Erreur');
      setRows(Array.isArray(data) ? data : []);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Erreur de chargement');
      setRows([]);
    } finally { setLoading(false); loadCounts(); }
  }, [token, loadCounts]);

  useEffect(() => { load(tab); }, [tab, load]);

  const openParapheur = async (row: ParapheurRow) => {
    if (tab === 'toSign') {
      try {
        const r = await fetch(`/api/parapheur/${row.id}/my-token`, { headers });
        const d = await r.json();
        if (r.ok && d.token) { navigate(`/signature/${d.token}`); return; }
      } catch { /* ignore, fallback detail */ }
    }
    navigate(`/parapheur/${row.id}`);
  };

  const superAdmin = isSuperAdmin(user);
  const tabs: [Tab, string, number][] = [
    ['created', 'Mes parapheurs', counts.created],
    ['toSign', 'À signer', counts.toSign],
    ['signed', 'Historique', counts.signed],
  ];
  if (superAdmin) tabs.push(['all', 'Tous les parapheurs', 0]);
  tabs.push(['mySignature', 'Ma signature', 0]);

  const removeParapheur = async (e: React.MouseEvent, row: ParapheurRow) => {
    e.stopPropagation();
    if (!confirm(`Supprimer définitivement le parapheur « ${row.title} » ? Cette action est irréversible.`)) return;
    try {
      const r = await fetch(`/api/parapheur/${row.id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
      const d = await r.json();
      if (!r.ok) throw new Error(d.message || 'Erreur');
      load(tab);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erreur de suppression');
    }
  };

  return (
    <div style={{ minHeight: '100vh', background: '#f8fafc' }}>
      <Header />
      <div style={{ maxWidth: 1080, margin: '0 auto', padding: '24px 20px 60px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
          <FileSignature size={28} color="#7c3aed" />
          <div style={{ flex: 1 }}>
            <h1 style={{ margin: 0, fontSize: 24, fontWeight: 800, color: '#0f172a' }}>Parapheur électronique</h1>
            <p style={{ margin: '2px 0 0', fontSize: 13, color: '#64748b' }}>Signature de documents PDF (circuit séquentiel ou parallèle)</p>
          </div>
          <button onClick={() => navigate('/parapheur/nouveau')} style={primaryBtn}>
            <PenSquare size={16} /> Nouveau parapheur
          </button>
        </div>

        <div style={{ display: 'flex', gap: 6, marginBottom: 18, flexWrap: 'wrap' }}>
          {tabs.map(([k, label, n]) => (
            <button key={k} onClick={() => setTab(k)} style={tabBtn(tab === k)}>
              {label}
              {n > 0 && (
                <span style={badge(tab === k)}>{n}</span>
              )}
            </button>
          ))}
        </div>

        {tab === 'mySignature' ? (
          <MySignature token={token} email={user?.email} />
        ) : (
          <>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 10 }}>
              <button onClick={() => load(tab)} style={ghostBtn}><RefreshCw size={14} /> Actualiser</button>
            </div>
            {error && <div style={errBox}>{error}</div>}
            {loading ? (
              <div style={{ textAlign: 'center', padding: 50, color: '#64748b' }}>Chargement…</div>
            ) : rows.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 60, color: '#94a3b8', background: '#fff', borderRadius: 14, border: '1px dashed #e2e8f0' }}>
                <FileText size={36} style={{ opacity: 0.5 }} />
                <p style={{ marginTop: 10 }}>Aucun parapheur dans cette vue.</p>
              </div>
            ) : (
              <div style={{ display: 'grid', gap: 10 }}>
                {rows.map(r => {
                  const st = STATUS[r.status] || STATUS.en_cours;
                  return (
                    <div key={`${r.id}-${r.signataire_status || ''}`} onClick={() => openParapheur(r)}
                      style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: '14px 18px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 16, boxShadow: '0 1px 2px rgba(0,0,0,0.03)' }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                          <span style={{ fontWeight: 800, color: '#0f172a', fontSize: 15 }}>{r.title}</span>
                          <span style={{ fontSize: 11, color: '#94a3b8', fontFamily: 'monospace' }}>{r.reference}</span>
                        </div>
                        <div style={{ fontSize: 12, color: '#64748b', marginTop: 4, display: 'flex', gap: 14, flexWrap: 'wrap' }}>
                          <span>{new Date(r.created_at).toLocaleDateString('fr-FR')}</span>
                          <span>{r.mode === 'sequentiel' ? 'Séquentiel' : 'Parallèle'}</span>
                          {r.nb_documents != null && <span>{r.nb_documents} document(s)</span>}
                          {r.nb_signataires != null && <span>{r.nb_signes}/{r.nb_signataires} signé(s)</span>}
                          {r.deadline && <span>Échéance : {new Date(r.deadline).toLocaleDateString('fr-FR')}</span>}
                        </div>
                      </div>
                      {tab === 'toSign' && <span style={{ fontSize: 11, color: '#b45309', background: '#fffbeb', border: '1px solid #fde68a', padding: '3px 9px', borderRadius: 12, fontWeight: 700 }}>À signer</span>}
                      <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 700, color: st.color, background: st.bg, padding: '4px 10px', borderRadius: 12 }}>
                        {st.icon} {st.label}
                      </span>
                      {superAdmin && (
                        <button onClick={(e) => removeParapheur(e, r)} title="Supprimer définitivement" style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#cbd5e1', display: 'flex', padding: 4 }}>
                          <Trash2 size={16} />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function MySignature({ token, email }: { token: string | null; email?: string }) {
  const sigRef = useRef<SignatureCanvas | null>(null);
  const [hasSig, setHasSig] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [msg, setMsg] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [imgUrl, setImgUrl] = useState<string | null>(null);
  const [certInfo, setCertInfo] = useState<{ has_certificate: boolean; filename?: string | null } | null>(null);
  const [certFile, setCertFile] = useState<File | null>(null);
  const [certPassword, setCertPassword] = useState('');
  const [rememberCert, setRememberCert] = useState(true);
  const [certMsg, setCertMsg] = useState<string | null>(null);
  const [savingCert, setSavingCert] = useState(false);

  useEffect(() => {
    if (!token) return;
    fetch('/api/parapheur/my-signature', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(d => setHasSig(!!d.has_signature))
      .catch(() => setHasSig(false));
  }, [token, refreshKey]);

  // L'image est servie derrière un JWT : on la charge en blob (un <img src> ne
  // peut pas porter l'en-tête Authorization).
  useEffect(() => {
    if (!hasSig || !token) { setImgUrl(null); return; }
    let url: string | null = null;
    let cancelled = false;
    fetch(`/api/parapheur/my-signature/image?t=${refreshKey}`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => (r.ok ? r.blob() : null))
      .then(b => { if (b && !cancelled) { url = URL.createObjectURL(b); setImgUrl(url); } })
      .catch(() => { /* pas d'image */ });
    return () => { cancelled = true; if (url) URL.revokeObjectURL(url); };
  }, [hasSig, token, refreshKey]);

  useEffect(() => {
    if (!token) return;
    fetch('/api/parapheur/my-certificate', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => (r.ok ? r.json() : null))
      .then(d => setCertInfo(d))
      .catch(() => { /* ignore */ });
  }, [token]);

  const uploadCert = async () => {
    if (!certFile) return;
    setSavingCert(true); setCertMsg(null);
    const name = certFile.name;
    try {
      const fd = new FormData();
      fd.append('file', certFile);
      if (certPassword) fd.append('certificatePassword', certPassword);
      fd.append('remember', rememberCert ? 'true' : 'false');
      const r = await fetch('/api/parapheur/my-certificate', { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: fd });
      const d = await r.json();
      if (!r.ok) throw new Error(d.message || 'Erreur');
      setCertMsg(d.verified
        ? 'Certificat enregistré et vérifié.'
        : `Certificat enregistré${d.verified === false ? ' (non vérifié : ' + (d.error || 'mot de passe non fourni') + ')' : ''}.`);
      setCertFile(null);
      setCertPassword('');
      setCertInfo({ has_certificate: true, filename: name });
    } catch (e: unknown) { setCertMsg(e instanceof Error ? e.message : 'Erreur'); }
    finally { setSavingCert(false); }
  };

  const removeCert = async () => {
    if (!confirm('Supprimer votre certificat enregistré ?')) return;
    try {
      await fetch('/api/parapheur/my-certificate', { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
      setCertInfo({ has_certificate: false });
      setCertMsg('Certificat supprimé.');
    } catch { /* ignore */ }
  };

  const save = async () => {
    const dataUrl = signatureDataUrl(sigRef.current || null);
    if (!dataUrl) { setMsg('Dessinez votre signature avant d\'enregistrer.'); return; }
    setSaving(true); setMsg(null);
    try {
      const r = await fetch('/api/parapheur/my-signature', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ signatureDataUrl: dataUrl }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.message || 'Erreur');
      setMsg('Signature enregistrée. Elle sera proposée par défaut pour vos prochains parapheurs.');
      setRefreshKey(k => k + 1);
    } catch (e: unknown) { setMsg(e instanceof Error ? e.message : 'Erreur'); }
    finally { setSaving(false); }
  };

  return (
    <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 14, padding: 24, maxWidth: 620 }}>
      <h3 style={{ margin: '0 0 6px', fontSize: 17, fontWeight: 800, color: '#0f172a' }}>Ma signature</h3>
      <p style={{ margin: '0 0 16px', fontSize: 13, color: '#64748b' }}>
        Cette signature {email ? <>pour <strong>{email}</strong> </> : ''}sera réutilisée automatiquement (vous pourrez la redessiner à tout moment).
      </p>

      {hasSig && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 11, fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 6 }}>Signature enregistrée</div>
          {imgUrl && <img src={imgUrl} alt="signature" style={{ maxHeight: 90, border: '1px solid #e2e8f0', borderRadius: 8, background: '#fff' }} />}
        </div>
      )}

      <div style={{ fontSize: 11, fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 6 }}>{hasSig ? 'Redessiner' : 'Dessiner'}</div>
      <SignaturePad sigRef={sigRef} />
      <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
        <button onClick={() => sigRef.current?.clear()} style={ghostBtn}><Eraser size={14} /> Effacer</button>
        <button onClick={save} disabled={saving} style={{ ...primaryBtn, opacity: saving ? 0.6 : 1 }}><Save size={15} /> {saving ? 'Enregistrement…' : 'Enregistrer'}</button>
      </div>
      {msg && <p style={{ fontSize: 12, color: '#475569', marginTop: 12 }}>{msg}</p>}

      <div style={{ marginTop: 22, borderTop: '1px solid #f1f5f9', paddingTop: 16 }}>
        <div style={{ fontSize: 11, fontWeight: 800, color: '#7c3aed', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
          <ShieldCheck size={14} /> Certificat P12 (signature sécurisée)
        </div>
        {certInfo?.has_certificate ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 12, color: '#475569' }}>Certificat enregistré{certInfo.filename ? ` : ${certInfo.filename}` : ''}</span>
            <button onClick={removeCert} style={{ ...ghostBtn, padding: '6px 12px' }}><Trash2 size={13} /> Supprimer</button>
          </div>
        ) : (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <input type="file" accept=".p12,.pfx,application/x-pkcs12" onChange={e => setCertFile(e.target.files?.[0] || null)} style={{ fontSize: 12 }} />
              <input type="password" value={certPassword} onChange={e => setCertPassword(e.target.value)} placeholder="Mot de passe (vérification)" style={{ padding: '8px 10px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 12 }} />
              {certFile && <button onClick={uploadCert} disabled={savingCert} style={{ ...primaryBtn, padding: '8px 14px' }}><Save size={14} /> {savingCert ? '…' : 'Enregistrer le certificat'}</button>}
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#6d28d9', marginTop: 8, cursor: 'pointer' }}>
              <input type="checkbox" checked={rememberCert} onChange={e => setRememberCert(e.target.checked)} />
              Mémoriser ce certificat pour mes prochaines signatures
            </label>
          </>
        )}
        {certMsg && <p style={{ fontSize: 12, color: '#475569', marginTop: 8 }}>{certMsg}</p>}
      </div>
    </div>
  );
}

const primaryBtn: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 7, padding: '10px 18px', background: '#7c3aed', color: '#fff', border: 'none', borderRadius: 10, fontWeight: 800, fontSize: 13, cursor: 'pointer' };
const ghostBtn: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '9px 14px', background: '#f1f5f9', color: '#475569', border: '1px solid #e2e8f0', borderRadius: 9, fontWeight: 700, fontSize: 13, cursor: 'pointer' };
const errBox: React.CSSProperties = { padding: '10px 14px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, color: '#b91c1c', fontSize: 13, marginBottom: 14 };

function tabBtn(active: boolean): React.CSSProperties {
  return { display: 'inline-flex', alignItems: 'center', gap: 7, padding: '9px 16px', borderRadius: 10, border: `1px solid ${active ? '#7c3aed' : '#e2e8f0'}`, background: active ? '#7c3aed' : '#fff', color: active ? '#fff' : '#475569', fontWeight: 700, fontSize: 13, cursor: 'pointer' };
}

function badge(active: boolean): React.CSSProperties {
  return {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    minWidth: 18, height: 18, padding: '0 5px', borderRadius: 9,
    fontSize: 11, fontWeight: 800, lineHeight: 1,
    background: active ? 'rgba(255,255,255,0.28)' : '#ede9fe',
    color: active ? '#fff' : '#6d28d9',
  };
}
