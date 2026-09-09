import { X } from 'lucide-react';
import ServiceFaitWorkflowView from './ServiceFaitWorkflowView';

interface Props {
  workflowId: number;
  onClose: () => void;
  onChanged?: () => void;
}

/**
 * Modale affichant le processus de validation du service fait d'une facture
 * (en cours ou terminé), ouverte depuis MappedDataTable.
 */
export default function ServiceFaitProcessusModal({ workflowId, onClose, onChanged }: Props) {
  return (
    <div onClick={onClose}
      style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.55)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div onClick={(e) => e.stopPropagation()}
        style={{ background: '#fff', borderRadius: 12, width: 900, maxWidth: '95vw', maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 24px 70px rgba(0,0,0,0.35)', position: 'relative' }}>
        <button onClick={onClose} title="Fermer"
          style={{ position: 'absolute', top: 16, right: 16, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 32, height: 32, borderRadius: 8, border: '1px solid #e2e8f0', background: '#fff', color: '#64748b', cursor: 'pointer', zIndex: 1 }}>
          <X size={18} />
        </button>
        <div style={{ padding: 24 }}>
          <ServiceFaitWorkflowView workflowId={workflowId} onChanged={onChanged} />
        </div>
      </div>
    </div>
  );
}
