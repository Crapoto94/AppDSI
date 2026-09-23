import { useState, useEffect } from 'react';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';
import { X, Loader, ChevronDown, ChevronRight, ExternalLink, Landmark } from 'lucide-react';

interface Mandat {
  mandat_roo: string;
  type: string;
  objet: string;
  bord: number | null;
  piece: number | null;
  date_emission: string | null;
  date_transmission: string | null;
  date_paiement: string | null;
  montant: number | null;
  rejete: boolean;
}

function fmtDate(v: string | null) {
  if (!v) return '-';
  const d = new Date(v);
  if (isNaN(d.getTime())) return String(v);
  return d.toLocaleDateString('fr-FR');
}
function fmtMontant(v: number | null) {
  if (v == null || isNaN(Number(v))) return '-';
  return Number(v).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
}

interface Props {
  numero: string;
  urlSedit?: string;
  onClose: () => void;
}

/**
 * Modale « Mandatement » d'une facture (page Factures beta) : liste des mandats
 * rattachés à la facture, lus en direct dans Sedit (mandat/bordereau/objet).
 */
export default function MandatementModal({ numero, urlSedit, onClose }: Props) {
  const { token } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [mandats, setMandats] = useState<Mandat[]>([]);
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    if (!numero) return;
    axios.get(`/api/finance/mandatement/${encodeURIComponent(numero)}`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => setMandats(r.data?.mandats || []))
      .catch(e => setError(e.response?.data?.message || 'Erreur de chargement du mandatement.'))
      .finally(() => setLoading(false));
  }, [numero, token]);

  const seditUrl = (roo: string) => `${urlSedit || 'https://seditgfprod.ivry.local/SeditGfSMProd'}/FicheMandat.html?mandatId=${encodeURIComponent(roo)}`;

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.55)', zIndex: 1100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: '#fff', borderRadius: 12, width: 920, maxWidth: '96vw', maxHeight: '90vh', overflow: 'auto', boxShadow: '0 24px 70px rgba(0,0,0,0.35)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '16px 20px', borderBottom: '1px solid #e2e8f0' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, color: '#0f172a' }}>
            <Landmark size={18} color="#0f766e" /> Mandatement — facture {numero}
          </div>
          <button onClick={onClose} title="Fermer" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 32, height: 32, borderRadius: 8, border: '1px solid #e2e8f0', background: '#fff', color: '#64748b', cursor: 'pointer' }}>
            <X size={18} />
          </button>
        </div>

        <div style={{ padding: 16 }}>
          <button onClick={() => setCollapsed(c => !c)}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', color: '#0f766e', fontWeight: 600, fontSize: 13, cursor: 'pointer', marginBottom: collapsed ? 0 : 10, padding: 0 }}>
            {collapsed ? <ChevronRight size={15} /> : <ChevronDown size={15} />} {collapsed ? 'Déplier la liste' : 'Replier la liste'}
          </button>

          {loading && (
            <div style={{ textAlign: 'center', padding: 40, color: '#94a3b8', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
              <Loader size={18} /> Chargement…
            </div>
          )}
          {error && !loading && <div style={{ background: '#fee2e2', border: '1px solid #fecaca', borderRadius: 8, padding: '12px 14px', color: '#b91c1c', fontSize: 13 }}>{error}</div>}

          {!loading && !error && !collapsed && (
            mandats.length === 0 ? (
              <div style={{ color: '#94a3b8', fontSize: 13, fontStyle: 'italic', padding: 12 }}>Aucun mandatement pour cette facture.</div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
                  <thead>
                    <tr style={{ background: '#f8fafc', color: '#475569', textAlign: 'left' }}>
                      {['Type', 'Objet', 'Bord', 'Pièce', 'Date émission', 'Date transmission', 'Date paiement', 'Montant', 'Actions'].map(h => (
                        <th key={h} style={{ padding: '8px 10px', borderBottom: '1px solid #e2e8f0', whiteSpace: 'nowrap', fontWeight: 700 }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {mandats.map((m, i) => (
                      <tr key={i} style={{ borderBottom: '1px solid #f1f5f9' }}>
                        <td style={{ padding: '8px 10px', whiteSpace: 'nowrap' }}>{m.type || '-'}{m.rejete && <span style={{ marginLeft: 6, color: '#b91c1c', fontWeight: 700 }}>rejeté</span>}</td>
                        <td style={{ padding: '8px 10px' }}>{m.objet || '-'}</td>
                        <td style={{ padding: '8px 10px', textAlign: 'right' }}>{m.bord ?? '-'}</td>
                        <td style={{ padding: '8px 10px', textAlign: 'right' }}>{m.piece ?? '-'}</td>
                        <td style={{ padding: '8px 10px', whiteSpace: 'nowrap' }}>{fmtDate(m.date_emission)}</td>
                        <td style={{ padding: '8px 10px', whiteSpace: 'nowrap' }}>{fmtDate(m.date_transmission)}</td>
                        <td style={{ padding: '8px 10px', whiteSpace: 'nowrap' }}>{fmtDate(m.date_paiement)}</td>
                        <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 600, whiteSpace: 'nowrap' }}>{fmtMontant(m.montant)}</td>
                        <td style={{ padding: '8px 10px', whiteSpace: 'nowrap' }}>
                          {m.mandat_roo && (
                            <a href={seditUrl(m.mandat_roo)} target="_blank" rel="noopener noreferrer" title="Ouvrir le mandat dans Sedit"
                              style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: '#0f766e', textDecoration: 'none', fontWeight: 600 }}>
                              <ExternalLink size={13} /> Sedit
                            </a>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          )}
        </div>
      </div>
    </div>
  );
}
