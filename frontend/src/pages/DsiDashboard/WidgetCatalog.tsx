import React, { useState } from 'react';
import { X, Search, Plus, Check } from 'lucide-react';
import { WIDGET_REGISTRY, WIDGET_MODULES } from './widgets/registry';
import type { WidgetDef } from './widgets/registry';

interface Props {
  existingKeys: string[];
  onAdd: (widget: WidgetDef) => void;
  onClose: () => void;
}

export default function WidgetCatalog({ existingKeys, onAdd, onClose }: Props) {
  const [search, setSearch] = useState('');
  const [activeModule, setActiveModule] = useState<string>('Tous');
  const [added, setAdded] = useState<string[]>([]);

  const filtered = WIDGET_REGISTRY.filter(w => {
    const matchSearch = w.label.toLowerCase().includes(search.toLowerCase()) ||
                        w.description.toLowerCase().includes(search.toLowerCase());
    const matchModule = activeModule === 'Tous' || w.module === activeModule;
    return matchSearch && matchModule;
  });

  const handleAdd = (w: WidgetDef) => {
    onAdd(w);
    setAdded(prev => [...prev, w.key]);
  };

  const modules = ['Tous', ...WIDGET_MODULES];

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,.5)' }}
         onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ background: 'white', borderRadius: 16, width: 740, maxWidth: '95vw', maxHeight: '85vh', display: 'flex', flexDirection: 'column', boxShadow: '0 24px 48px rgba(0,0,0,.2)' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 24px 16px', borderBottom: '1px solid #e2e8f0' }}>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#1e293b' }}>Ajouter un widget</h2>
          <button onClick={onClose} style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#64748b', padding: 4, borderRadius: 6, display: 'flex' }}>
            <X size={20} />
          </button>
        </div>

        {/* Search */}
        <div style={{ padding: '12px 24px 0' }}>
          <div style={{ position: 'relative' }}>
            <Search size={16} color="#94a3b8" style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)' }} />
            <input
              value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Rechercher un widget…"
              style={{ width: '100%', padding: '9px 12px 9px 36px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 13, outline: 'none', boxSizing: 'border-box', background: '#f8fafc' }}
            />
          </div>
        </div>

        {/* Module tabs */}
        <div style={{ display: 'flex', gap: 6, padding: '10px 24px', overflowX: 'auto', flexShrink: 0 }}>
          {modules.map(m => (
            <button key={m} onClick={() => setActiveModule(m)} style={{
              padding: '5px 12px', borderRadius: 20, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 500, flexShrink: 0,
              background: activeModule === m ? '#1e293b' : '#f1f5f9',
              color: activeModule === m ? 'white' : '#64748b',
            }}>{m}</button>
          ))}
        </div>

        {/* Grid */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '0 24px 20px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, alignContent: 'start' }}>
          {filtered.map(w => {
            const isAdded = added.includes(w.key) || existingKeys.includes(w.key);
            return (
              <div key={w.key} style={{
                border: `1px solid ${isAdded ? '#bbf7d0' : '#e2e8f0'}`,
                borderRadius: 10, padding: '12px 14px', background: isAdded ? '#f0fdf4' : 'white',
                display: 'flex', flexDirection: 'column', gap: 4,
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#1e293b' }}>{w.label}</div>
                    <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 1 }}>{w.module}</div>
                  </div>
                  <button onClick={() => !isAdded && handleAdd(w)} style={{
                    border: 'none', borderRadius: 6, cursor: isAdded ? 'default' : 'pointer',
                    padding: '5px 10px', display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, fontWeight: 600,
                    background: isAdded ? '#22c55e' : '#3b82f6', color: 'white', flexShrink: 0,
                  }}>
                    {isAdded ? <><Check size={13} /> Ajouté</> : <><Plus size={13} /> Ajouter</>}
                  </button>
                </div>
                <div style={{ fontSize: 11, color: '#64748b' }}>{w.description}</div>
                <div style={{ fontSize: 10, color: '#cbd5e1', marginTop: 2 }}>
                  Taille par défaut : {w.defaultSize.w}×{w.defaultSize.h}
                </div>
              </div>
            );
          })}
          {filtered.length === 0 && (
            <div style={{ gridColumn: '1/-1', textAlign: 'center', padding: '40px 20px', color: '#94a3b8', fontSize: 13 }}>
              Aucun widget ne correspond à votre recherche.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
