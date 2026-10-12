const BPMN_NS = 'http://www.omg.org/spec/BPMN/20100524/MODEL';

export interface AssetLink { task: string; asset: string; output: boolean }

function parse(xml: string): Document {
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  const err = doc.getElementsByTagName('parsererror')[0];
  if (err) throw new Error('XML mal formé : ' + (err.textContent || '').split('\n')[0].slice(0, 160));
  return doc;
}

const directChildren = (el: Element, localName?: string) =>
  Array.from(el.children).filter((c) => c.namespaceURI === BPMN_NS && (!localName || c.localName === localName));

/**
 * Remet une réponse de l'IA dans un état fiable avant mise en page :
 *  - retire toute partie graphique (le positionnement est recalculé) ;
 *  - recalcule incoming/outgoing à partir des flux (l'IA les oublie ou les laisse périmés
 *    quand elle modifie un diagramme : la mise en page perdait alors les flèches) ;
 *  - supprime les flux et références de couloir pointant vers des éléments inexistants ;
 *  - restaure la documentation des éléments conservés (id identique) dans l'ancien diagramme.
 */
export function normalizeBpmn(xml: string, previousXml?: string | null): { xml: string; warnings: string[] } {
  const doc = parse(xml);
  const warnings: string[] = [];

  for (const d of Array.from(doc.getElementsByTagNameNS('*', 'BPMNDiagram'))) d.parentNode?.removeChild(d);

  const SKIP = new Set(['sequenceFlow', 'laneSet', 'documentation', 'association', 'textAnnotation', 'dataStoreReference', 'dataObjectReference', 'dataObject', 'dataStore', 'group', 'property', 'extensionElements', 'ioSpecification', 'messageFlow']);
  let dropped = 0;

  for (const proc of Array.from(doc.getElementsByTagNameNS(BPMN_NS, 'process'))) {
    const nodes = new Map<string, Element>();
    for (const c of directChildren(proc)) {
      const id = c.getAttribute('id');
      if (id && !SKIP.has(c.localName)) nodes.set(id, c);
    }
    for (const n of nodes.values()) {
      for (const io of directChildren(n).filter((c) => c.localName === 'incoming' || c.localName === 'outgoing')) n.removeChild(io);
    }
    const flowIds = new Set<string>();
    for (const f of directChildren(proc, 'sequenceFlow')) {
      const s = f.getAttribute('sourceRef') || '';
      const t = f.getAttribute('targetRef') || '';
      const id = f.getAttribute('id') || '';
      if (!nodes.has(s) || !nodes.has(t) || !id || flowIds.has(id)) {
        proc.removeChild(f);
        dropped++;
        continue;
      }
      flowIds.add(id);
      const pre = f.prefix ? `${f.prefix}:` : '';
      const out = doc.createElementNS(BPMN_NS, `${pre}outgoing`);
      out.textContent = id;
      nodes.get(s)!.appendChild(out);
      const inc = doc.createElementNS(BPMN_NS, `${pre}incoming`);
      inc.textContent = id;
      nodes.get(t)!.appendChild(inc);
    }
    // Références de couloir vers des éléments disparus
    for (const ref of Array.from(proc.getElementsByTagNameNS(BPMN_NS, 'flowNodeRef'))) {
      const id = (ref.textContent || '').trim();
      if (!nodes.has(id) && !proc.querySelector(`[id="${id}"]`)) ref.parentNode?.removeChild(ref);
    }
  }
  if (dropped > 0) warnings.push(`${dropped} liaison(s) invalide(s) ignorée(s)`);

  // Documentation conservée pour les éléments inchangés
  if (previousXml) {
    try {
      const prev = parse(previousXml);
      const docs = new Map<string, string>();
      for (const d of Array.from(prev.getElementsByTagNameNS(BPMN_NS, 'documentation'))) {
        const id = d.parentElement?.getAttribute('id');
        if (id && d.textContent) docs.set(id, d.textContent);
      }
      for (const el of Array.from(doc.getElementsByTagNameNS(BPMN_NS, '*'))) {
        const id = el.getAttribute('id');
        if (!id || !docs.has(id) || directChildren(el, 'documentation').length > 0) continue;
        const pre = el.prefix ? `${el.prefix}:` : '';
        const docEl = doc.createElementNS(BPMN_NS, `${pre}documentation`);
        docEl.textContent = docs.get(id)!;
        el.insertBefore(docEl, el.firstChild);
      }
    } catch { /* ancien diagramme illisible : on ignore */ }
  }

  return { xml: new XMLSerializer().serializeToString(doc), warnings };
}

/**
 * Sépare les liaisons tâche ↔ actif (dataInput/OutputAssociation) du XML : elles sont retirées
 * avant mise en page puis recréées comme vraies connexions dans l'éditeur.
 */
export function splitAssetLinks(xml: string): { xml: string; links: AssetLink[] } {
  const doc = parse(xml);
  const links: AssetLink[] = [];
  for (const kind of ['dataOutputAssociation', 'dataInputAssociation']) {
    for (const el of Array.from(doc.getElementsByTagNameNS('*', kind))) {
      const output = kind === 'dataOutputAssociation';
      const ref = el.getElementsByTagNameNS('*', output ? 'targetRef' : 'sourceRef')[0]?.textContent?.trim();
      const task = el.parentElement?.getAttribute('id') || '';
      if (ref && task) links.push({ task, asset: ref, output });
      el.parentNode?.removeChild(el);
    }
  }
  return { xml: new XMLSerializer().serializeToString(doc), links };
}
