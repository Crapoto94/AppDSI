import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import ServiceFaitWorkflowView from '../components/ServiceFaitWorkflowView';

export default function ServiceFaitProcessus() {
  const { id } = useParams();
  const navigate = useNavigate();

  if (!id) return null;

  return (
    <div style={{ padding: 24, fontFamily: 'ui-sans-serif, system-ui, sans-serif', maxWidth: 840, margin: '0 auto' }}>
      <button onClick={() => navigate(-1)}
        style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', cursor: 'pointer', color: '#64748b', fontSize: 13, marginBottom: 16, padding: 0 }}>
        <ArrowLeft size={15} /> Retour
      </button>
      <ServiceFaitWorkflowView workflowId={id} />
    </div>
  );
}
