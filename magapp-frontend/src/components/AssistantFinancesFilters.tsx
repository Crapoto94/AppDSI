import React from 'react';
import { Filter, Lock, RotateCcw } from 'lucide-react';
import type { Filtres, FilterOptions } from './assistantFinancesFiltersData';

// Filtres permanents : appliqués à toutes les demandes jusqu'à « Réinitialiser ». Le serveur les revalide.

const select: React.CSSProperties = { padding: '4px 6px', borderRadius: 7, border: '1px solid #cbd5e1', background: '#fff', color: '#1e293b', fontSize: 12.5, maxWidth: 190 };
const on: React.CSSProperties = { borderColor: '#7c3aed', background: '#f5f3ff', fontWeight: 700 };

type Option = [string, string];

const Field: React.FC<{ label: string; value: string; options: Option[]; onChange: (v: string) => void; locked?: boolean }> = ({ label, value, options, onChange, locked }) => (
  <select aria-label={label} title={locked ? `${label} : fixé par vos droits Sedit` : label} value={value} disabled={locked} onChange={e => onChange(e.target.value)} style={{ ...select, ...(value ? on : {}), ...(locked ? { cursor: 'not-allowed', opacity: 0.85 } : {}) }}>
    <option value="">{label}</option>
    {options.map(([v, text]) => <option key={v} value={v}>{text}</option>)}
  </select>
);

const AssistantFinancesFilters: React.FC<{ options: FilterOptions; value: Filtres; onChange: (f: Filtres) => void }> = ({ options, value, onChange }) => {
  const set = (key: keyof Filtres, v: string, cleared: (keyof Filtres)[] = []) => {
    const next = { ...value, [key]: v };
    if (!v) delete next[key];
    cleared.forEach(k => delete next[k]);
    onChange(next);
  };
  // Chapitres, natures et fonctions se restreignent entre eux d'après les imputations qui existent réellement
  const possible = (column: 1 | 2 | 3): Option[] => {
    const wanted = [value.section, value.chapitre, value.nature, value.fonction];
    const codes = new Set(options.combinaisons
      .filter(c => c.every((v, i) => i === column || !wanted[i] || v === wanted[i]))
      .map(c => c[column]).filter(Boolean));
    const labels = column === 1 ? options.chapitres : column === 2 ? options.natures : options.fonctions;
    return [...codes].sort().map(c => [c, labels[c] ? `${c} – ${labels[c]}` : c]);
  };
  // Droits limités à une seule direction, ou à un seul service : affichés comme un filtre déjà posé, sans choix
  const fixedDirection = options.directions.length === 1 && options.directions[0].nom ? options.directions[0] : null;
  const allServices = options.directions.flatMap(d => d.services);
  const fixedService = allServices.length === 1 ? allServices[0] : null;
  const direction = fixedDirection || options.directions.find(d => d.nom && d.nom === value.direction);
  const services = (direction ? direction.services : options.directions.flatMap(d => d.services)).map(s => [s.code, `${s.code} – ${s.libelle}`] as Option);

  // Droits restreints à une, deux ou trois directions : l'annoncer en clair
  const named = options.directions.filter(d => d.nom);
  const limit = fixedService
    ? `Vos droits Sedit sont limités au service ${fixedService.libelle} (${fixedService.code})${fixedDirection ? ` — ${fixedDirection.nom}` : ''}.`
    : options.directions.length >= 1 && options.directions.length <= 3 && named.length === options.directions.length
      ? `Vos droits Sedit sont limités à : ${named.map(d => `${d.nom} (${d.services.map(s => s.libelle).join(', ')})`).join(' ; ')}.`
      : '';

  return (
    <>
    {limit && (
      <div role="note" style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '9px 18px', background: '#fef3c7', borderBottom: '1px solid #fcd34d', color: '#78350f', fontSize: 13, fontWeight: 700 }}>
        <Lock size={15} style={{ flexShrink: 0, marginTop: 2 }} /> <span>{limit} Les réponses ne portent que sur ce périmètre.</span>
      </div>
    )}
    <div role="group" aria-label="Filtres permanents" style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center', padding: '8px 18px', background: '#fff', borderBottom: '1px solid #e2e8f0' }}>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12, fontWeight: 700, color: '#64748b' }}><Filter size={13} /> Filtres</span>
      <Field label="Année" value={value.exercice || ''} options={options.exercices.map(y => [String(y), String(y)])} onChange={v => set('exercice', v)} />
      <Field label="Section" value={value.section || ''} options={[['F', 'Fonctionnement'], ['I', 'Investissement']]} onChange={v => set('section', v, ['chapitre', 'nature'])} />
      <Field label="Chapitre" value={value.chapitre || ''} options={possible(1)} onChange={v => set('chapitre', v)} />
      <Field label="Nature" value={value.nature || ''} options={possible(2)} onChange={v => set('nature', v)} />
      <Field label="Fonction" value={value.fonction || ''} options={possible(3)} onChange={v => set('fonction', v)} />
      <Field label="Budget" value={value.budget || ''} options={options.budgets.map(b => [b.toUpperCase(), b])} onChange={v => set('budget', v)} />
      <Field label="Direction" locked={!!fixedDirection} value={fixedDirection?.nom || value.direction || ''} options={options.directions.filter(d => d.nom).map(d => [d.nom, `${d.sigle} – ${d.nom}`])} onChange={v => set('direction', v, ['service'])} />
      <Field label="Service" locked={!!fixedService} value={fixedService?.code || value.service || ''} options={services} onChange={v => set('service', v)} />
      {Object.keys(value).length > 0 && (
        <button type="button" onClick={() => onChange({})} style={{ ...select, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4, fontWeight: 700, color: '#b91c1c', borderColor: '#fecaca' }}>
          <RotateCcw size={12} /> Réinitialiser
        </button>
      )}
    </div>
    </>
  );
};

export default AssistantFinancesFilters;
