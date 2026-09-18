import React, { useState } from 'react';
import { FileText, Combine, Scissors, Minimize2, Images, Stamp, Hash, ScanText, GitCompare, Wrench, ChevronRight, X } from 'lucide-react';
import MergeTool from './MergeTool';
import PageEditorTool from './PageEditorTool';
import CompressTool from './CompressTool';
import ToImagesTool from './ToImagesTool';
import WatermarkTool from './WatermarkTool';
import PageNumbersTool from './PageNumbersTool';
import OcrTool from './OcrTool';
import CompareTool from './CompareTool';
import RepairTool from './RepairTool';

interface PdfToolsHubProps { onClose: () => void }

type ToolKey = 'merge' | 'pages' | 'compress' | 'images' | 'watermark' | 'numbers' | 'ocr' | 'compare' | 'repair';

function PdfToolCard({ icon, bg, title, description, onClick }: { icon: React.ReactNode; bg: string; title: string; description: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{ display: 'flex', alignItems: 'center', gap: '14px', textAlign: 'left', background: '#fff', border: '1px solid #e2e8f0', borderRadius: '14px', padding: '16px', cursor: 'pointer', transition: 'all 0.2s' }}
      onMouseOver={(e) => { e.currentTarget.style.borderColor = '#0078a455'; e.currentTarget.style.boxShadow = '0 6px 16px -6px rgba(0,120,164,0.25)'; }}
      onMouseOut={(e) => { e.currentTarget.style.borderColor = '#e2e8f0'; e.currentTarget.style.boxShadow = 'none'; }}
    >
      <div style={{ width: 44, height: 44, minWidth: 44, borderRadius: '12px', background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{icon}</div>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: '0.92rem', fontWeight: 700, color: '#1e293b' }}>{title}</div>
        <div style={{ fontSize: '0.78rem', color: '#64748b', marginTop: 2 }}>{description}</div>
      </div>
      <ChevronRight size={18} color="#cbd5e1" style={{ marginLeft: 'auto', flexShrink: 0 }} />
    </button>
  );
}

export default function PdfToolsHub({ onClose }: PdfToolsHubProps) {
  const [activeTool, setActiveTool] = useState<ToolKey | null>(null);

  const tools: { key: ToolKey; icon: React.ReactNode; bg: string; title: string; description: string }[] = [
    { key: 'merge', icon: <Combine size={22} color="#0369a1" />, bg: '#dbeafe', title: 'Fusionner des PDF', description: 'Combiner plusieurs PDF/images en un seul' },
    { key: 'pages', icon: <Scissors size={22} color="#7c2d12" />, bg: '#ffedd5', title: 'Découper / réorganiser', description: 'Extraire, réordonner, tourner des pages' },
    { key: 'compress', icon: <Minimize2 size={22} color="#166534" />, bg: '#dcfce7', title: 'Réduire la taille', description: 'Compresser les images du PDF' },
    { key: 'images', icon: <Images size={22} color="#a16207" />, bg: '#fef9c3', title: 'Convertir en images', description: 'Exporter les pages en PNG/JPEG' },
    { key: 'watermark', icon: <Stamp size={22} color="#6d28d9" />, bg: '#ede9fe', title: 'Ajouter un filigrane', description: 'Texte ou logo en surimpression' },
    { key: 'numbers', icon: <Hash size={22} color="#1d4ed8" />, bg: '#dbeafe', title: 'Numéroter les pages', description: 'Insérer une numérotation automatique' },
    { key: 'ocr', icon: <ScanText size={22} color="#0e7490" />, bg: '#cffafe', title: 'Rendre cherchable (OCR)', description: 'Reconnaître le texte d\'un PDF scanné' },
    { key: 'compare', icon: <GitCompare size={22} color="#be185d" />, bg: '#fce7f3', title: 'Comparer deux PDF', description: 'Visualiser les différences page à page' },
    { key: 'repair', icon: <Wrench size={22} color="#b45309" />, bg: '#fef3c7', title: 'Réparer un PDF', description: 'Tenter de recharger un fichier corrompu' },
  ];

  return (
    <>
      <div style={{ position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.6)', backdropFilter: 'blur(4px)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
        <div style={{ background: 'white', maxWidth: '720px', width: '100%', borderRadius: '24px', padding: '32px', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)', position: 'relative', maxHeight: '90vh', overflowY: 'auto' }}>
          <button
            onClick={onClose}
            style={{ position: 'absolute', top: '20px', right: '20px', background: '#f1f5f9', border: 'none', cursor: 'pointer', color: '#64748b', width: '36px', height: '36px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          >
            <X size={20} />
          </button>

          <div style={{ textAlign: 'center', marginBottom: '24px' }}>
            <div style={{ width: '60px', height: '60px', background: '#e0f2fe', borderRadius: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
              <FileText size={30} color="#0369a1" />
            </div>
            <h2 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 800, color: '#1e293b' }}>Outils PDF</h2>
            <p style={{ color: '#64748b', fontSize: '0.95rem', marginTop: '8px' }}>Fusionnez, découpez, compressez et manipulez vos PDF directement en ligne</p>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '12px' }}>
            {tools.map((t) => (
              <PdfToolCard key={t.key} icon={t.icon} bg={t.bg} title={t.title} description={t.description} onClick={() => setActiveTool(t.key)} />
            ))}
          </div>
        </div>
      </div>

      {activeTool === 'merge' && <MergeTool onClose={() => setActiveTool(null)} />}
      {activeTool === 'pages' && <PageEditorTool onClose={() => setActiveTool(null)} />}
      {activeTool === 'compress' && <CompressTool onClose={() => setActiveTool(null)} />}
      {activeTool === 'images' && <ToImagesTool onClose={() => setActiveTool(null)} />}
      {activeTool === 'watermark' && <WatermarkTool onClose={() => setActiveTool(null)} />}
      {activeTool === 'numbers' && <PageNumbersTool onClose={() => setActiveTool(null)} />}
      {activeTool === 'ocr' && <OcrTool onClose={() => setActiveTool(null)} />}
      {activeTool === 'compare' && <CompareTool onClose={() => setActiveTool(null)} />}
      {activeTool === 'repair' && <RepairTool onClose={() => setActiveTool(null)} />}
    </>
  );
}
