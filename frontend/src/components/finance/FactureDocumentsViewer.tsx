import React, { useEffect, useRef, useState } from 'react';
import { X, Loader2, FileText, ExternalLink, Star } from 'lucide-react';

interface FactureDoc {
  doc_id: string;
  nom: string;
  format: string;
  mime: string;
  taille: number;
  principal: boolean;
  categorie: 'facture' | 'bon_commande' | 'autre';
  url: string;
}

const CATEGORY_LABELS: Record<FactureDoc['categorie'], string> = {
  facture: 'Facture',
  bon_commande: 'Bon de commande',
  autre: 'Autres pièces jointes',
};

interface Props {
  /** Numéro de facture Sedit (ex. "F26008278"), pas l'id/libellé interne AppDSI. */
  numero: string;
  token: string | null;
  onClose: () => void;
  /**
   * Override de l'endpoint de listing des documents (sans le suffixe /documents),
   * pour la page publique de validation du service fait (token de workflow au lieu
   * du JWT) — voir /api/finance/service-fait/public/:token/documents. Par défaut,
   * utilise l'endpoint JWT /api/finance/pj-share/facture/:numero.
   */
  baseUrl?: string;
  /** Titre affiché dans l'en-tête (par défaut : « Pièces jointes Sedit — Facture <numero> »). */
  title?: string;
}

/**
 * Visionneuse interne multidocuments (PDF uniquement) pour les pièces jointes
 * Sedit Finances d'une facture — voir skill "sedit-finances" et
 * backend/modules/finance/finance-share.controller.js.
 */
export default function FactureDocumentsViewer({ numero, token, onClose, baseUrl, title }: Props) {
  const [documents, setDocuments] = useState<FactureDoc[] | null>(null);
  const [loadingList, setLoadingList] = useState(true);
  const [listError, setListError] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [blobUrls, setBlobUrls] = useState<Record<string, string>>({});
  const [loadingDoc, setLoadingDoc] = useState(false);
  const [docError, setDocError] = useState<string | null>(null);
  const blobUrlsRef = useRef<Record<string, string>>({});

  useEffect(() => {
    let cancelled = false;
    setLoadingList(true);
    setListError(null);
    const listUrl = baseUrl ? `${baseUrl}/documents` : `/api/finance/pj-share/facture/${encodeURIComponent(numero)}/documents`;
    fetch(listUrl, {
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
        const docs: FactureDoc[] = (data.documents || []).filter((d: FactureDoc) => d.mime === 'application/pdf');
        setDocuments(docs);
        setActiveId(docs[0]?.doc_id || null);
      })
      .catch((e) => { if (!cancelled) setListError(e.message || 'Erreur de chargement'); })
      .finally(() => { if (!cancelled) setLoadingList(false); });
    return () => { cancelled = true; };
  }, [numero, token, baseUrl]);

  useEffect(() => {
    if (!activeId || !documents) return;
    const doc = documents.find(d => d.doc_id === activeId);
    if (!doc) return;
    if (blobUrls[activeId]) return;

    let cancelled = false;
    setLoadingDoc(true);
    setDocError(null);
    fetch(doc.url, { headers: token ? { Authorization: `Bearer ${token}` } : {} })
      .then(async (r) => {
        if (!r.ok) {
          const body = await r.json().catch(() => ({}));
          throw new Error(body.error || `Erreur ${r.status}`);
        }
        const blob = await r.blob();
        const url = URL.createObjectURL(new Blob([blob], { type: 'application/pdf' }));
        blobUrlsRef.current[activeId] = url;
        if (!cancelled) setBlobUrls(prev => ({ ...prev, [activeId]: url }));
      })
      .catch((e) => { if (!cancelled) setDocError(e.message || 'Document introuvable'); })
      .finally(() => { if (!cancelled) setLoadingDoc(false); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId, documents, token]);

  // Libère les blob URLs uniquement à la fermeture du composant (pas à chaque nouveau document chargé).
  useEffect(() => () => { Object.values(blobUrlsRef.current).forEach(u => URL.revokeObjectURL(u)); }, []);

  const activeDoc = documents?.find(d => d.doc_id === activeId) || null;

  // Groupes affichés dans l'ordre où ils apparaissent (le backend trie déjà "facture" avant "autre").
  const groups: { categorie: FactureDoc['categorie']; docs: FactureDoc[] }[] = [];
  documents?.forEach(doc => {
    const last = groups[groups.length - 1];
    if (last && last.categorie === doc.categorie) last.docs.push(doc);
    else groups.push({ categorie: doc.categorie, docs: [doc] });
  });

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000, padding: 8 }}>
      <div style={{ background: '#fff', borderRadius: 14, width: '100%', maxWidth: 1200, height: '90vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ padding: '10px 14px', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: 8 }}>
          <FileText size={18} color="#ef4444" />
          <span style={{ flex: 1, minWidth: 0, fontWeight: 700, fontSize: 14, color: '#1e293b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {title || `Pièces jointes Sedit — Facture ${numero}`}
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
              <div style={{ padding: 16, color: '#64748b', fontSize: 13 }}>Aucune pièce jointe PDF trouvée dans Sedit.</div>
            )}
            {groups.map(group => (
              <div key={group.categorie}>
                <div style={{
                  padding: '8px 12px', fontSize: 11, fontWeight: 700, color: '#64748b',
                  textTransform: 'uppercase', letterSpacing: 0.4, background: '#eef2f7',
                  borderBottom: '1px solid #e2e8f0', borderTop: '1px solid #e2e8f0',
                }}>
                  {CATEGORY_LABELS[group.categorie]}
                </div>
                {group.docs.map(doc => (
                  <button
                    key={doc.doc_id}
                    onClick={() => setActiveId(doc.doc_id)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 8, width: '100%', textAlign: 'left',
                      padding: '10px 12px', border: 'none', borderBottom: '1px solid #e2e8f0', cursor: 'pointer',
                      background: activeId === doc.doc_id ? '#e0f2fe' : 'transparent',
                    }}
                  >
                    <FileText size={15} color="#ef4444" />
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
            ))}
          </div>

          <div style={{ flex: 1, minHeight: 0, background: '#f1f5f9', display: 'flex', flexDirection: 'column' }}>
            {loadingDoc && (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 1, color: '#64748b' }}>
                <Loader2 className="spin" size={30} />
              </div>
            )}
            {docError && <div style={{ margin: 16, padding: 16, background: '#fef2f2', color: '#b91c1c', borderRadius: 8, fontSize: 13 }}>{docError}</div>}
            {!loadingDoc && !docError && activeDoc && blobUrls[activeDoc.doc_id] && (
              <iframe title={activeDoc.nom} src={blobUrls[activeDoc.doc_id]} style={{ width: '100%', height: '100%', border: 'none', flex: 1 }} />
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
