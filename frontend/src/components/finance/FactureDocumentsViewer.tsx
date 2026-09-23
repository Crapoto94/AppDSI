import React, { useEffect, useState } from 'react';
import { X, Loader2, FileText, FileCode2, ExternalLink, Star } from 'lucide-react';

interface FactureDoc {
  doc_id: string;
  nom: string;
  format: string;
  mime: string;
  taille: number;
  principal: boolean;
  url: string;
}

interface Props {
  /** Numéro de facture Sedit (ex. "F26008278"), pas l'id/libellé interne AppDSI. */
  numero: string;
  token: string | null;
  onClose: () => void;
}

/**
 * Visionneuse interne multidocuments pour les pièces jointes Sedit Finances
 * (PDF/XML du flux PES) d'une facture — voir skill "sedit-finances" et
 * backend/modules/finance/finance-share.controller.js.
 */
export default function FactureDocumentsViewer({ numero, token, onClose }: Props) {
  const [documents, setDocuments] = useState<FactureDoc[] | null>(null);
  const [loadingList, setLoadingList] = useState(true);
  const [listError, setListError] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [blobUrls, setBlobUrls] = useState<Record<string, string>>({});
  const [xmlTexts, setXmlTexts] = useState<Record<string, string>>({});
  const [loadingDoc, setLoadingDoc] = useState(false);
  const [docError, setDocError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoadingList(true);
    setListError(null);
    fetch(`/api/finance/pj-share/facture/${encodeURIComponent(numero)}/documents`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then(async (r) => {
        if (!r.ok) {
          const body = await r.json().catch(() => ({}));
          throw new Error(body.error || `Erreur ${r.status}`);
        }
        return r.json();
      })
      .then((data) => {
        if (cancelled) return;
        const docs: FactureDoc[] = data.documents || [];
        setDocuments(docs);
        setActiveId(docs[0]?.doc_id || null);
      })
      .catch((e) => { if (!cancelled) setListError(e.message || 'Erreur de chargement'); })
      .finally(() => { if (!cancelled) setLoadingList(false); });
    return () => { cancelled = true; };
  }, [numero, token]);

  useEffect(() => {
    if (!activeId || !documents) return;
    const doc = documents.find(d => d.doc_id === activeId);
    if (!doc) return;
    const isPdf = doc.mime === 'application/pdf';
    if (isPdf && blobUrls[activeId]) return;
    if (!isPdf && xmlTexts[activeId] !== undefined) return;

    let cancelled = false;
    setLoadingDoc(true);
    setDocError(null);
    fetch(doc.url, { headers: token ? { Authorization: `Bearer ${token}` } : {} })
      .then(async (r) => {
        if (!r.ok) {
          const body = await r.json().catch(() => ({}));
          throw new Error(body.error || `Erreur ${r.status}`);
        }
        if (isPdf) {
          const blob = await r.blob();
          const url = URL.createObjectURL(new Blob([blob], { type: 'application/pdf' }));
          if (!cancelled) setBlobUrls(prev => ({ ...prev, [activeId]: url }));
        } else {
          const text = await r.text();
          if (!cancelled) setXmlTexts(prev => ({ ...prev, [activeId]: text }));
        }
      })
      .catch((e) => { if (!cancelled) setDocError(e.message || 'Document introuvable'); })
      .finally(() => { if (!cancelled) setLoadingDoc(false); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId, documents, token]);

  // Libère les blob URLs à la fermeture du composant.
  useEffect(() => () => { Object.values(blobUrls).forEach(u => URL.revokeObjectURL(u)); }, [blobUrls]);

  const activeDoc = documents?.find(d => d.doc_id === activeId) || null;

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000, padding: 8 }}>
      <div style={{ background: '#fff', borderRadius: 14, width: '100%', maxWidth: 1200, height: '90vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ padding: '10px 14px', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: 8 }}>
          <FileText size={18} color="#ef4444" />
          <span style={{ flex: 1, minWidth: 0, fontWeight: 700, fontSize: 14, color: '#1e293b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            Pièces jointes Sedit — Facture {numero}
          </span>
          {activeDoc && blobUrls[activeDoc.doc_id] && (
            <button onClick={() => window.open(blobUrls[activeDoc.doc_id], '_blank', 'noopener')} title="Ouvrir dans un onglet" style={toolbarBtn}>
              <ExternalLink size={14} />
            </button>
          )}
          <button onClick={onClose} style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#94a3b8', display: 'flex' }}><X size={20} /></button>
        </div>

        <div style={{ flex: 1, minHeight: 0, display: 'flex' }}>
          <div style={{ width: 260, borderRight: '1px solid #e2e8f0', overflowY: 'auto', background: '#f8fafc', flexShrink: 0 }}>
            {loadingList && (
              <div style={{ padding: 16, color: '#64748b', display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
                <Loader2 className="spin" size={16} /> Chargement…
              </div>
            )}
            {listError && <div style={{ margin: 12, padding: 10, background: '#fef2f2', color: '#b91c1c', borderRadius: 8, fontSize: 12 }}>{listError}</div>}
            {!loadingList && !listError && documents && documents.length === 0 && (
              <div style={{ padding: 16, color: '#64748b', fontSize: 13 }}>Aucune pièce jointe trouvée pour cette facture dans Sedit.</div>
            )}
            {documents?.map(doc => (
              <button
                key={doc.doc_id}
                onClick={() => setActiveId(doc.doc_id)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8, width: '100%', textAlign: 'left',
                  padding: '10px 12px', border: 'none', borderBottom: '1px solid #e2e8f0', cursor: 'pointer',
                  background: activeId === doc.doc_id ? '#e0f2fe' : 'transparent',
                }}
              >
                {doc.mime === 'application/pdf' ? <FileText size={15} color="#ef4444" /> : <FileCode2 size={15} color="#64748b" />}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 600, color: '#1e293b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={doc.nom}>
                    {doc.nom}
                  </div>
                  {!!doc.taille && <div style={{ fontSize: 11, color: '#94a3b8' }}>{doc.taille} Ko</div>}
                </div>
                {doc.principal && <Star size={13} color="#f59e0b" fill="#f59e0b" />}
              </button>
            ))}
          </div>

          <div style={{ flex: 1, minHeight: 0, background: '#f1f5f9', display: 'flex', flexDirection: 'column' }}>
            {loadingDoc && (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 1, color: '#64748b' }}>
                <Loader2 className="spin" size={30} />
              </div>
            )}
            {docError && <div style={{ margin: 16, padding: 16, background: '#fef2f2', color: '#b91c1c', borderRadius: 8, fontSize: 13 }}>{docError}</div>}
            {!loadingDoc && !docError && activeDoc?.mime === 'application/pdf' && blobUrls[activeDoc.doc_id] && (
              <iframe title={activeDoc.nom} src={blobUrls[activeDoc.doc_id]} style={{ width: '100%', height: '100%', border: 'none', flex: 1 }} />
            )}
            {!loadingDoc && !docError && activeDoc && activeDoc.mime !== 'application/pdf' && xmlTexts[activeDoc.doc_id] !== undefined && (
              <pre style={{ flex: 1, margin: 0, padding: 16, overflow: 'auto', fontSize: 12, lineHeight: 1.5, whiteSpace: 'pre-wrap', wordBreak: 'break-word', background: '#fff' }}>
                {xmlTexts[activeDoc.doc_id]}
              </pre>
            )}
            {!loadingList && !activeDoc && documents && documents.length === 0 && (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 1, color: '#94a3b8', fontSize: 13 }}>—</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

const toolbarBtn: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 5, padding: '6px 10px', border: '1px solid #e2e8f0',
  borderRadius: 8, background: '#fff', color: '#475569', fontSize: 12, fontWeight: 700, cursor: 'pointer',
};
