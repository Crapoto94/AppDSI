import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Archive, Clock, CheckCircle2, XCircle, Ban, FileText, Download, Eye, Paperclip, Send, PenLine, ShieldCheck, Smartphone, RefreshCw } from 'lucide-react';
import Header from '../../components/Header';
import AgentPresenceBadge from '../../components/AgentPresenceBadge';
import DocumentPdfViewer from '../../components/parapheur/DocumentPdfViewer';
import { useAuth } from '../../contexts/AuthContext';

interface Detail {
  id: number; reference: string; title: string; message: string; status: string; mode: string;
  deadline?: string | null; created_by_name?: string; created_at: string; completed_at?: string | null;
  sealed_at?: string | null; seal_serial?: string | null;
  documents: { id: number; original_name: string; has_signed: boolean; has_crypto_signature?: boolean; has_pades?: boolean; size?: number; is_annexe?: boolean; page_count?: number | null }[];
  signataires: { id: number; nom: string; email: string; service?: string; order_number: number; status: string; signature_mode: string; signed_at?: string | null; rejected_at?: string | null; rejection_comment?: string | null; signed_by_name?: string | null; signed_by_email?: string | null; signature_note?: string | null; technique_certificate?: { serial?: string | null; issuer?: string | null; fingerprint?: string | null; signing_time?: string | null } | null; certificate?: { subject?: string | null; issuer?: string | null; serial?: string | null; valid_from?: string | null; valid_to?: string | null } | null }[];
}

const STATUS: Record<string, { label: string; color: string; bg: string; icon: React.ReactNode }> = {
  en_cours: { label: 'En cours', color: '#1d4ed8', bg: '#eff6ff', icon: <Clock size={15} /> },
  termine: { label: 'Terminé', color: '#15803d', bg: '#f0fdf4', icon: <CheckCircle2 size={15} /> },
  refuse: { label: 'Refusé', color: '#b91c1c', bg: '#fef2f2', icon: <XCircle size={15} /> },
  annule: { label: 'Annulé', color: '#64748b', bg: '#f1f5f9', icon: <Ban size={15} /> },
};
const SIG: Record<string, { label: string; color: string; bg: string }> = {
  en_attente: { label: 'En attente', color: '#64748b', bg: '#f1f5f9' },
  en_cours: { label: 'Doit signer', color: '#b45309', bg: '#fffbeb' },
  a_signe: { label: 'A signé', color: '#15803d', bg: '#f0fdf4' },
  refuse: { label: 'A refusé', color: '#b91c1c', bg: '#fef2f2' },
};

export default function ParapheurDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { token } = useAuth();
  const [detail, setDetail] = useState<Detail | null>(null);
  const [myToken, setMyToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [viewer, setViewer] = useState<{ docId: number; signed: boolean; name: string } | null>(null);

  const headers = { Authorization: `Bearer ${token}` };

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true); setError(null);
    try {
      const r = await fetch(`/api/parapheur/${id}`, { headers: { Authorization: `Bearer ${token}` } });
      const d = await r.json();
      if (!r.ok) throw new Error(d.message || 'Introuvable');
      setDetail(d);
      const rt = await fetch(`/api/parapheur/${id}/my-token`, { headers: { Authorization: `Bearer ${token}` } }).catch(() => null);
      if (rt && rt.ok) { const td = await rt.json(); setMyToken(td.status === 'en_cours' ? td.token : null); }
      else setMyToken(null);
    } catch (e: unknown) { setError(e instanceof Error ? e.message : 'Erreur'); }
    finally { setLoading(false); }
  }, [id, token]);

  useEffect(() => { load(); }, [load]);

  const relance = async () => {
    setBusy(true); setMsg(null);
    try {
      const r = await fetch(`/api/parapheur/${id}/relance`, { method: 'POST', headers });
      const d = await r.json();
      setMsg(r.ok ? `Relance envoyée à ${d.sent} signataire(s).` : (d.message || 'Erreur'));
    } finally { setBusy(false); }
  };

  const downloadEvidence = async () => {
    setBusy(true); setMsg(null);
    try {
      const r = await fetch(`/api/parapheur/${id}/preuves`, { headers });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        throw new Error((d as { message?: string }).message || 'Génération impossible');
      }
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `dossier-preuves-${detail?.reference || id}.zip`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
    } catch (e: unknown) { setMsg(e instanceof Error ? e.message : 'Erreur'); }
    finally { setBusy(false); }
  };

  const cancel = async () => {
    if (!confirm('Annuler ce parapheur ? Les signataires ne pourront plus signer.')) return;
    setBusy(true); setMsg(null);
    try {
      const r = await fetch(`/api/parapheur/${id}/annuler`, { method: 'POST', headers });
      const d = await r.json();
      if (!r.ok) setMsg(d.message || 'Erreur');
      else { setMsg('Parapheur annulé.'); load(); }
    } finally { setBusy(false); }
  };

  const docUrl = (docId: number, opts: { signed?: boolean; download?: boolean }) =>
    `/api/parapheur/${id}/doc/${docId}?token=${encodeURIComponent(token || '')}${opts.signed ? '&signed=1' : ''}${opts.download ? '&download=1' : ''}`;

  if (loading) return <Shell><div style={{ textAlign: 'center', padding: 60, color: '#64748b' }}>Chargement…</div></Shell>;
  if (error || !detail) return <Shell><div style={errBox}>{error || 'Parapheur introuvable'}</div></Shell>;

  const st = STATUS[detail.status] || STATUS.en_cours;
  const signableDocs = detail.documents.filter(d => !d.is_annexe);
  const annexeDocs = detail.documents.filter(d => d.is_annexe);

  const renderDocRow = (d: Detail['documents'][number], isAnnexe: boolean) => (
    <div key={d.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', border: '1px solid #f1f5f9', borderRadius: 9 }}>
      <FileText size={15} color={isAnnexe ? '#64748b' : '#ef4444'} />
      <span style={{ flex: 1, fontSize: 13, color: '#1e293b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {d.original_name}{d.page_count ? <span style={{ color: '#94a3b8' }}> · {d.page_count} page(s)</span> : null}
      </span>
      {!isAnnexe && d.has_crypto_signature && (
        <span title="Signature cryptographique P12 (PAdES)" style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 10, fontWeight: 700, color: '#15803d', background: '#f0fdf4', border: '1px solid #bbf7d0', padding: '2px 7px', borderRadius: 10, flexShrink: 0 }}>
          <ShieldCheck size={11} /> P12
        </span>
      )}
      <button onClick={() => setViewer({ docId: d.id, signed: !isAnnexe && d.has_signed, name: d.original_name })} title={!isAnnexe && d.has_signed ? 'Voir le PDF signé' : 'Voir le PDF'} style={iconLink}><Eye size={15} /></button>
      {detail.status === 'termine' && (
        <a href={docUrl(d.id, { download: true })} title="Télécharger l'original" style={iconLink}><Download size={15} /></a>
      )}
      {detail.status === 'termine' && !isAnnexe && d.has_signed && (
        <a href={docUrl(d.id, { signed: true, download: true })} title="Télécharger le PDF signé" style={{ ...iconLink, color: '#15803d' }}><Download size={15} /></a>
      )}
    </div>
  );

  return (
    <Shell>
      <button onClick={() => navigate('/parapheur')} style={ghostBtn}><ArrowLeft size={15} /> Retour</button>

      <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 14, padding: 22, marginTop: 16 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 240 }}>
            <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: '#0f172a' }}>{detail.title}</h1>
            <div style={{ fontSize: 12, color: '#94a3b8', fontFamily: 'monospace', marginTop: 4 }}>{detail.reference}</div>
            {detail.message && <p style={{ margin: '10px 0 0', fontSize: 13, color: '#475569', whiteSpace: 'pre-wrap' }}>{detail.message}</p>}
            <div style={{ fontSize: 12, color: '#64748b', marginTop: 10, display: 'flex', gap: 14, flexWrap: 'wrap' }}>
              <span>Créé le {new Date(detail.created_at).toLocaleDateString('fr-FR')}</span>
              <span>Par {detail.created_by_name}</span>
              <span>{detail.mode === 'sequentiel' ? 'Séquentiel' : 'Parallèle'}</span>
              {detail.deadline && <span>Échéance : {new Date(detail.deadline).toLocaleDateString('fr-FR')}</span>}
            </div>
          </div>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 800, color: st.color, background: st.bg, padding: '6px 14px', borderRadius: 20 }}>
            {st.icon} {st.label}
          </span>
        </div>

        <div style={{ display: 'flex', gap: 10, marginTop: 18, flexWrap: 'wrap' }}>
          {myToken && <button onClick={() => navigate(`/signature/${myToken}`)} style={signBtn}><PenLine size={16} /> Signer maintenant</button>}
          {detail.status === 'en_cours' && <button onClick={relance} disabled={busy} style={ghostBtn}><Send size={15} /> Relancer</button>}
          {detail.status === 'en_cours' && <button onClick={cancel} disabled={busy} style={{ ...ghostBtn, color: '#b91c1c', borderColor: '#fecaca' }}>Annuler</button>}
          <button onClick={downloadEvidence} disabled={busy} title="Télécharger le dossier de preuves (PDF + pièces)" style={ghostBtn}><Archive size={15} /> Fichier de preuves</button>
          <button onClick={load} style={ghostBtn}><RefreshCw size={15} /> Actualiser</button>
        </div>
        {msg && <p style={{ fontSize: 12, color: '#475569', marginTop: 12 }}>{msg}</p>}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 16, marginTop: 16 }}>
        <section style={card}>
          <h3 style={cardTitle}><FileText size={17} /> Documents à signer ({signableDocs.length})</h3>
          <div style={{ display: 'grid', gap: 8 }}>
            {signableDocs.map(d => renderDocRow(d, false))}
          </div>
          {annexeDocs.length > 0 && (
            <>
              <h3 style={{ ...cardTitle, marginTop: 18 }}><Paperclip size={17} /> Annexes ({annexeDocs.length})</h3>
              <p style={{ fontSize: 11, color: '#94a3b8', margin: '-8px 0 10px' }}>Documents complémentaires consultables, non signés.</p>
              <div style={{ display: 'grid', gap: 8 }}>
                {annexeDocs.map(d => renderDocRow(d, true))}
              </div>
            </>
          )}
          {detail.status !== 'termine' && (
            <p style={{ fontSize: 11, color: '#94a3b8', marginTop: 12 }}>
              Le téléchargement sera disponible une fois toutes les signatures recueillies.
            </p>
          )}
        </section>

        <section style={card}>
          <h3 style={cardTitle}><PenLine size={17} /> Signataires ({detail.signataires.length})</h3>
          <div style={{ display: 'grid', gap: 8 }}>
            {detail.signataires.map((s, i) => {
              const ss = SIG[s.status] || SIG.en_attente;
              return (
                <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', border: '1px solid #f1f5f9', borderRadius: 9 }}>
                  {detail.mode === 'sequentiel' && <span style={{ fontWeight: 800, color: '#7c3aed', minWidth: 20 }}>{i + 1}</span>}
                  <AgentPresenceBadge email={s.email} name={s.nom} size={13} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: '#1e293b', display: 'flex', alignItems: 'center', gap: 6 }}>
                      {s.nom}
                      {s.signature_mode === 'securise' && <span title="Signature sécurisée (P12)"><ShieldCheck size={13} color="#7c3aed" /></span>}
                      {s.signature_mode === 'sms' && <span title="Signature vérifiée par SMS"><Smartphone size={13} color="#0e7490" /></span>}
                    </div>
                    <div style={{ fontSize: 11, color: '#94a3b8' }}>
                      {s.email}
                      {s.signed_by_name
                        ? ` — signé par ${s.signed_by_name} par délégation${s.signed_at ? ` le ${new Date(s.signed_at).toLocaleDateString('fr-FR')}` : ''}`
                        : (s.signed_at ? ` — signé le ${new Date(s.signed_at).toLocaleDateString('fr-FR')}` : '')}
                    </div>
                    {s.status === 'refuse' && s.rejection_comment && <div style={{ fontSize: 11, color: '#b91c1c', fontStyle: 'italic', marginTop: 2 }}>« {s.rejection_comment} »</div>}
                  </div>
                  <span style={{ fontSize: 11, fontWeight: 700, color: ss.color, background: ss.bg, padding: '3px 9px', borderRadius: 12 }}>{ss.label}</span>
                </div>
              );
            })}
          </div>
        </section>
      </div>

      {viewer && (
        <DocumentPdfViewer
          open
          url={`/api/parapheur/${id}/doc/${viewer.docId}?signed=${viewer.signed ? '1' : '0'}`}
          authToken={token}
          title={viewer.name}
          signatureInfo={viewer.signed ? {
            signers: detail.signataires
              .filter(s => s.status === 'a_signe')
              .map(s => ({ name: s.nom, mode: s.signature_mode, signed_at: s.signed_at, delegated_by: s.signed_by_name, note: s.signature_note, technique_certificate: s.technique_certificate, certificate: s.certificate })),
            seal: detail.sealed_at ? { sealed_at: detail.sealed_at, serial: detail.seal_serial } : null,
          } : null}
          onClose={() => setViewer(null)}
        />
      )}
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return <div style={{ minHeight: '100vh', background: '#f8fafc' }}><Header /><div style={{ maxWidth: 1000, margin: '0 auto', padding: '24px 20px 60px' }}>{children}</div></div>;
}

const card: React.CSSProperties = { background: '#fff', border: '1px solid #e2e8f0', borderRadius: 14, padding: 20 };
const cardTitle: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 8, margin: '0 0 14px', fontSize: 15, fontWeight: 800, color: '#0f172a' };
const ghostBtn: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '10px 16px', background: '#fff', color: '#475569', border: '1px solid #e2e8f0', borderRadius: 9, fontWeight: 700, fontSize: 13, cursor: 'pointer' };
const signBtn: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 7, padding: '11px 20px', background: '#16a34a', color: '#fff', border: 'none', borderRadius: 10, fontWeight: 800, fontSize: 13, cursor: 'pointer' };
const iconLink: React.CSSProperties = { display: 'flex', color: '#64748b', padding: 4 };
const errBox: React.CSSProperties = { padding: '10px 14px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, color: '#b91c1c', fontSize: 13 };
