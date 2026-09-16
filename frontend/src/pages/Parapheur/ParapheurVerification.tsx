import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { AlertCircle, Archive, Ban, CheckCircle2, Clock, Download, Eye, FileSignature, FileText, Loader2, PenLine, ShieldCheck, Smartphone, XCircle } from 'lucide-react';
import DocumentPdfViewer from '../../components/parapheur/DocumentPdfViewer';

interface VerifyInfo {
  parapheur: {
    id: number; reference: string; title: string; message: string; status: string; mode: string;
    deadline?: string | null; requester: string; created_at: string; completed_at?: string | null;
    sealed_at?: string | null; seal_serial?: string | null;
  };
  documents: { id: number; original_name: string; mime_type: string; size?: number; has_signed: boolean; has_pades: boolean; has_crypto_signature: boolean }[];
  signataires: { nom: string; service?: string; order_number: number; status: string; signature_mode: string; signed_at?: string | null; signed_by_name?: string | null; signature_note?: string | null; technique_certificate?: { serial?: string | null; issuer?: string | null; fingerprint?: string | null; signing_time?: string | null } | null; certificate?: { subject?: string | null; issuer?: string | null; serial?: string | null; valid_from?: string | null; valid_to?: string | null } | null }[];
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

/**
 * Page publique de vérification d'un parapheur (cible du QR code apposé sur les
 * PDF signés). Accessible SANS authentification à toute personne disposant du
 * lien (jeton de vérification non devinable).
 */
export default function ParapheurVerification() {
  const { token } = useParams();
  const [info, setInfo] = useState<VerifyInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [viewer, setViewer] = useState<{ docId: number; name: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true); setError(null);
      try {
        const r = await fetch(`/api/parapheur/verify/${token}`);
        const d = await r.json();
        if (!r.ok) throw new Error(d.message || 'Page de vérification introuvable');
        if (!cancelled) setInfo(d);
      } catch (e: unknown) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Erreur');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [token]);

  if (loading) return <Center><Loader2 size={40} className="spin" color="#7c3aed" /><p style={{ color: '#64748b', marginTop: 12 }}>Vérification…</p></Center>;
  if (error || !info) return <Center><AlertCircle size={52} color="#dc2626" /><h2 style={{ color: '#0f172a', margin: '14px 0 6px' }}>Introuvable</h2><p style={{ color: '#64748b', maxWidth: 420, textAlign: 'center' }}>{error}</p></Center>;

  const st = STATUS[info.parapheur.status] || STATUS.en_cours;

  return (
    <div style={{ minHeight: '100vh', background: '#f8fafc' }}>
      <div style={{ background: '#fff', borderBottom: '1px solid #e2e8f0' }}>
        <div style={{ maxWidth: 860, margin: '0 auto', padding: '18px 20px', display: 'flex', alignItems: 'center', gap: 14 }}>
          <FileSignature size={26} color="#7c3aed" />
          <div style={{ flex: 1 }}>
            <h1 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: '#0f172a' }}>{info.parapheur.title}</h1>
            <p style={{ margin: '2px 0 0', fontSize: 12, color: '#64748b' }}>
              Réf. {info.parapheur.reference} · Vérification publique (accès libre via le lien)
            </p>
          </div>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 800, color: st.color, background: st.bg, padding: '6px 14px', borderRadius: 20 }}>
            {st.icon} {st.label}
          </span>
        </div>
      </div>

      <div style={{ maxWidth: 860, margin: '0 auto', padding: '24px 20px 80px' }}>
        <div style={{ background: '#ecfdf5', border: '1px solid #a7f3d0', borderRadius: 10, padding: '12px 16px', fontSize: 13, color: '#065f46', marginBottom: 18, display: 'flex', gap: 8, alignItems: 'flex-start' }}>
          <ShieldCheck size={16} style={{ marginTop: 1, flexShrink: 0 }} />
          <span>Cette page atteste du contenu et des signatures du parapheur. Le code QR apposé sur les documents y renvoie directement, sans authentification.</span>
        </div>

        <a
          href={`/api/parapheur/verify/${token}/preuves`}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 8, marginBottom: 16, padding: '9px 16px', background: '#7c3aed', color: '#fff', borderRadius: 10, fontWeight: 700, fontSize: 13, textDecoration: 'none' }}
        >
          <Archive size={15} /> Télécharger le dossier de preuves
        </a>

        <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 14, padding: 20, marginBottom: 16 }}>
          <div style={{ fontSize: 12, color: '#64748b', display: 'flex', gap: 16, flexWrap: 'wrap' }}>
            <span>Demandeur : {info.parapheur.requester}</span>
            <span>Créé le {new Date(info.parapheur.created_at).toLocaleDateString('fr-FR')}</span>
            {info.parapheur.completed_at && <span>Terminé le {new Date(info.parapheur.completed_at).toLocaleDateString('fr-FR')}</span>}
            {info.parapheur.deadline && <span>Échéance : {new Date(info.parapheur.deadline).toLocaleDateString('fr-FR')}</span>}
          </div>
          {info.parapheur.message && <p style={{ margin: '12px 0 0', fontSize: 13, color: '#475569', whiteSpace: 'pre-wrap' }}>{info.parapheur.message}</p>}
        </div>

        <section style={card}>
          <h3 style={cardTitle}><FileText size={17} /> Documents ({info.documents.length})</h3>
          <div style={{ display: 'grid', gap: 8 }}>
            {info.documents.map(d => (
              <div key={d.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', border: '1px solid #f1f5f9', borderRadius: 9 }}>
                <FileText size={15} color="#ef4444" />
                <span style={{ flex: 1, fontSize: 13, color: '#1e293b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.original_name}</span>
                {d.has_crypto_signature && (
                  <span title="Signature cryptographique P12 (PAdES)" style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 10, fontWeight: 700, color: '#15803d', background: '#f0fdf4', border: '1px solid #bbf7d0', padding: '2px 7px', borderRadius: 10, flexShrink: 0 }}>
                    <ShieldCheck size={11} /> P12
                  </span>
                )}
                {d.has_signed && (
                  <>
                    <button onClick={() => setViewer({ docId: d.id, name: d.original_name })} title="Voir le PDF signé" style={iconLink}><Eye size={15} /></button>
                    <a href={`/api/parapheur/verify/${token}/doc/${d.id}?signed=1&download=1`} title="Télécharger le PDF signé" style={{ ...iconLink, color: '#15803d' }}><Download size={15} /></a>
                  </>
                )}
              </div>
            ))}
          </div>
          {!info.documents.some(d => d.has_signed) && (
            <p style={{ fontSize: 11, color: '#94a3b8', marginTop: 12 }}>Aucun document signé n'est encore disponible.</p>
          )}
        </section>

        <section style={{ ...card, marginTop: 16 }}>
          <h3 style={cardTitle}><PenLine size={17} /> Signatures ({info.signataires.length})</h3>
          <div style={{ display: 'grid', gap: 8 }}>
            {info.signataires.map((s, i) => {
              const ss = SIG[s.status] || SIG.en_attente;
              return (
                <div key={`${s.nom}-${i}`} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', border: '1px solid #f1f5f9', borderRadius: 9 }}>
                  {info.parapheur.mode === 'sequentiel' && <span style={{ fontWeight: 800, color: '#7c3aed', minWidth: 20 }}>{i + 1}</span>}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: '#1e293b', display: 'flex', alignItems: 'center', gap: 6 }}>
                      {s.nom}
                      {s.signature_mode === 'securise' && <span title="Signature sécurisée (P12)"><ShieldCheck size={13} color="#7c3aed" /></span>}
                      {s.signature_mode === 'sms' && <span title="Signature vérifiée par SMS"><Smartphone size={13} color="#0e7490" /></span>}
                    </div>
                    <div style={{ fontSize: 11, color: '#94a3b8' }}>
                      {s.service ? `${s.service} — ` : ''}
                      {s.signed_by_name
                        ? `signé par ${s.signed_by_name} par délégation${s.signed_at ? ` le ${new Date(s.signed_at).toLocaleDateString('fr-FR')}` : ''}`
                        : (s.signed_at ? `signé le ${new Date(s.signed_at).toLocaleDateString('fr-FR')}` : 'en attente de signature')}
                    </div>
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
          url={`/api/parapheur/verify/${token}/doc/${viewer.docId}?signed=1`}
          title={viewer.name}
          signatureInfo={{
            signers: info.signataires
              .filter(s => s.status === 'a_signe')
              .map(s => ({ name: s.nom, mode: s.signature_mode, signed_at: s.signed_at, delegated_by: s.signed_by_name, note: s.signature_note, technique_certificate: s.technique_certificate, certificate: s.certificate })),
            seal: info.parapheur.sealed_at ? { sealed_at: info.parapheur.sealed_at, serial: info.parapheur.seal_serial } : null,
          }}
          onClose={() => setViewer(null)}
        />
      )}
    </div>
  );
}

function Center({ children }: { children: React.ReactNode }) {
  return <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: '#f8fafc', padding: 24, textAlign: 'center' }}>{children}</div>;
}

const card: React.CSSProperties = { background: '#fff', border: '1px solid #e2e8f0', borderRadius: 14, padding: 20 };
const cardTitle: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 8, margin: '0 0 14px', fontSize: 15, fontWeight: 800, color: '#0f172a' };
const iconLink: React.CSSProperties = { display: 'flex', color: '#64748b', padding: 4 };
