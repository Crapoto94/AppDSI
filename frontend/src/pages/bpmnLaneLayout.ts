import type { AssetLink } from './bpmnNormalize';

const BPMN_NS = 'http://www.omg.org/spec/BPMN/20100524/MODEL';
const POOL_X = 160, POOL_Y = 80, HEAD = 60, COL_W = 190, LANE_BASE = 215, ROW_H = 110;

interface Box { x: number; y: number; w: number; h: number }
interface Pt { x: number; y: number }

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const NOT_FLOW_NODE = new Set(['sequenceFlow', 'laneSet', 'documentation', 'association', 'textAnnotation', 'dataStoreReference', 'dataObjectReference', 'dataObject', 'dataStore', 'group', 'property', 'extensionElements', 'ioSpecification', 'messageFlow', 'incoming', 'outgoing']);

function sizeOf(localName: string): [number, number] {
  if (localName.endsWith('Gateway')) return [50, 50];
  if (localName.endsWith('Event')) return [36, 36];
  return [140, 70];
}

/**
 * Mise en page « couloirs » : la mise en page automatique de bpmn-auto-layout ignore les
 * couloirs et le pool, ce qui détruisait la structure d'un diagramme à couloirs dès que l'IA
 * le modifiait. Ici chaque élément reste dans son couloir ; sa colonne suit le chemin le plus
 * long depuis le début ; les actifs logiciels se placent sous la tâche qui les utilise.
 * Renvoie null si le process n'a pas de couloirs (on utilise alors bpmn-auto-layout).
 */
export function layoutWithLanes(xml: string, assetLinks: AssetLink[]): string | null {
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  const proc = Array.from(doc.getElementsByTagNameNS(BPMN_NS, 'process')).find((p) => p.getElementsByTagNameNS(BPMN_NS, 'laneSet').length > 0);
  if (!proc) return null;
  const laneSet = Array.from(proc.children).find((c) => c.localName === 'laneSet' && c.namespaceURI === BPMN_NS);
  if (!laneSet) return null;
  const laneEls = Array.from(laneSet.children).filter((c) => c.localName === 'lane' && c.namespaceURI === BPMN_NS);
  if (laneEls.length === 0) return null;

  // Éléments, couloirs
  const nodeEls = new Map<string, Element>();
  const assetEls = new Map<string, Element>();
  for (const c of Array.from(proc.children)) {
    const id = c.getAttribute('id');
    if (!id || c.namespaceURI !== BPMN_NS) continue;
    if (c.localName === 'dataStoreReference') assetEls.set(id, c);
    else if (!NOT_FLOW_NODE.has(c.localName)) nodeEls.set(id, c);
  }
  const laneOf = new Map<string, number>();
  laneEls.forEach((lane, i) => {
    for (const ref of Array.from(lane.getElementsByTagNameNS(BPMN_NS, 'flowNodeRef'))) laneOf.set((ref.textContent || '').trim(), i);
  });
  for (const id of nodeEls.keys()) if (!laneOf.has(id)) laneOf.set(id, 0);

  // Flux
  const flows = Array.from(proc.children)
    .filter((c) => c.localName === 'sequenceFlow' && c.namespaceURI === BPMN_NS)
    .map((f) => ({ id: f.getAttribute('id') || '', s: f.getAttribute('sourceRef') || '', t: f.getAttribute('targetRef') || '' }))
    .filter((f) => nodeEls.has(f.s) && nodeEls.has(f.t));

  // Colonnes : chemin le plus long en ignorant les arcs de retour (boucles) détectés par parcours en profondeur
  const next = new Map<string, string[]>();
  const indeg = new Map<string, number>();
  for (const id of nodeEls.keys()) { next.set(id, []); indeg.set(id, 0); }
  flows.forEach((f) => next.get(f.s)!.push(f.t));
  const back = new Set<string>();
  const state = new Map<string, number>();
  const dfs = (id: string) => {
    state.set(id, 1);
    for (const t of next.get(id)!) {
      if (state.get(t) === 1) back.add(`${id}>${t}`);
      else if (!state.get(t)) dfs(t);
    }
    state.set(id, 2);
  };
  const hasIncoming = new Set(flows.map((f) => f.t));
  for (const id of nodeEls.keys()) if (!hasIncoming.has(id) && !state.get(id)) dfs(id);
  for (const id of nodeEls.keys()) if (!state.get(id)) dfs(id);
  const fwd = flows.filter((f) => !back.has(`${f.s}>${f.t}`));
  fwd.forEach((f) => indeg.set(f.t, indeg.get(f.t)! + 1));
  const col = new Map<string, number>();
  const queue = [...nodeEls.keys()].filter((id) => indeg.get(id) === 0);
  queue.forEach((id) => col.set(id, 0));
  while (queue.length > 0) {
    const id = queue.shift()!;
    for (const f of fwd.filter((x) => x.s === id)) {
      col.set(f.t, Math.max(col.get(f.t) ?? 0, (col.get(id) ?? 0) + 1));
      indeg.set(f.t, indeg.get(f.t)! - 1);
      if (indeg.get(f.t) === 0) queue.push(f.t);
    }
  }
  for (const id of nodeEls.keys()) if (!col.has(id)) col.set(id, 0);

  // Lignes dans un couloir : un élément par cellule (couloir, colonne)
  const cell = new Map<string, number>();
  const row = new Map<string, number>();
  const laneMaxRow = laneEls.map(() => 0);
  for (const id of [...nodeEls.keys()].sort((a, b) => (col.get(a)! - col.get(b)!))) {
    const key = `${laneOf.get(id)}:${col.get(id)}`;
    const r = cell.get(key) ?? 0;
    cell.set(key, r + 1);
    row.set(id, r);
    laneMaxRow[laneOf.get(id)!] = Math.max(laneMaxRow[laneOf.get(id)!], r);
  }

  // Géométrie
  const maxCol = Math.max(0, ...col.values());
  const laneTop: number[] = [];
  const laneH: number[] = [];
  let y = POOL_Y;
  laneEls.forEach((_, i) => { laneTop.push(y); laneH.push(LANE_BASE + laneMaxRow[i] * ROW_H); y += laneH[i]; });
  const poolW = HEAD + 20 + (maxCol + 1) * COL_W + 20;
  const cxOf = (c: number) => POOL_X + HEAD + 20 + 70 + c * COL_W;

  const box = new Map<string, Box>();
  for (const [id, el] of nodeEls) {
    const [w, h] = sizeOf(el.localName);
    const l = laneOf.get(id)!;
    box.set(id, { x: cxOf(col.get(id)!) - w / 2, y: laneTop[l] + 75 + row.get(id)! * ROW_H - h / 2, w, h });
  }

  // Actifs logiciels sous la tâche qui les utilise
  const assetBox = new Map<string, Box>();
  const perTask = new Map<string, number>();
  let orphan = 0;
  for (const id of assetEls.keys()) {
    const link = assetLinks.find((l) => l.asset === id && box.has(l.task));
    const task = link ? box.get(link.task)! : null;
    const lane = link ? laneOf.get(link.task)! : 0;
    let cx: number;
    if (task && link) {
      const n = perTask.get(link.task) ?? 0;
      perTask.set(link.task, n + 1);
      cx = task.x + task.w / 2; // recentré plus bas si la tâche utilise plusieurs actifs
    } else {
      cx = cxOf(0) + orphan++ * 130;
    }
    assetBox.set(id, { x: cx - 60, y: laneTop[lane] + laneH[lane] - 95, w: 120, h: 70 });
  }
  // Un seul actif par tâche : centré sous elle ; plusieurs : répartis de part et d'autre
  for (const [task, count] of perTask) {
    if (count < 2) continue;
    const t = box.get(task)!;
    const ids = assetLinks.filter((l) => l.task === task && assetBox.has(l.asset)).map((l) => l.asset);
    ids.forEach((id, i) => {
      const b = assetBox.get(id)!;
      b.x = t.x + t.w / 2 + (i - (ids.length - 1) / 2) * 130 - 60;
    });
  }

  // Tracé des flux
  const right = (b: Box): Pt => ({ x: b.x + b.w, y: b.y + b.h / 2 });
  const left = (b: Box): Pt => ({ x: b.x, y: b.y + b.h / 2 });
  const route = (s: string, t: string): Pt[] => {
    const a = box.get(s)!, b = box.get(t)!;
    const ca = col.get(s)!, cb = col.get(t)!;
    if (cb > ca) {
      const p = right(a), q = left(b);
      if (Math.abs(p.y - q.y) < 1) return [p, q];
      const mx = cb - ca > 1 ? q.x - 25 : (p.x + q.x) / 2;
      return [p, { x: mx, y: p.y }, { x: mx, y: q.y }, q];
    }
    if (cb === ca) {
      const down = b.y > a.y;
      return [{ x: a.x + a.w / 2, y: down ? a.y + a.h : a.y }, { x: b.x + b.w / 2, y: down ? b.y : b.y + b.h }];
    }
    // arc de retour : on repasse sous les éléments
    const by = Math.max(a.y + a.h, b.y + b.h) + 30;
    return [{ x: a.x + a.w / 2, y: a.y + a.h }, { x: a.x + a.w / 2, y: by }, { x: b.x + b.w / 2, y: by }, { x: b.x + b.w / 2, y: b.y + b.h }];
  };

  // Pool (participant) : réutilise celui de l'IA ou en crée un
  const root = doc.documentElement;
  const pre = root.prefix ? `${root.prefix}:` : '';
  let collab = Array.from(doc.getElementsByTagNameNS(BPMN_NS, 'collaboration'))[0] as Element | undefined;
  let participant = collab && Array.from(collab.getElementsByTagNameNS(BPMN_NS, 'participant')).find((p) => p.getAttribute('processRef') === proc.getAttribute('id'));
  if (!collab || !participant) {
    if (!collab) {
      collab = doc.createElementNS(BPMN_NS, `${pre}collaboration`);
      collab.setAttribute('id', 'Collaboration_auto');
      root.insertBefore(collab, proc);
    }
    participant = doc.createElementNS(BPMN_NS, `${pre}participant`);
    participant.setAttribute('id', 'Participant_auto');
    participant.setAttribute('name', proc.getAttribute('name') || 'Processus');
    participant.setAttribute('processRef', proc.getAttribute('id') || '');
    collab.appendChild(participant);
  }
  const collabId = collab.getAttribute('id') || '';
  const participantId = participant.getAttribute('id') || '';

  // Plan graphique
  let di = '';
  di += `<bpmndi:BPMNShape id="${participantId}_di" bpmnElement="${participantId}" isHorizontal="true"><dc:Bounds x="${POOL_X}" y="${POOL_Y}" width="${poolW}" height="${y - POOL_Y}" /></bpmndi:BPMNShape>`;
  laneEls.forEach((lane, i) => {
    const id = lane.getAttribute('id') || `Lane_${i}`;
    di += `<bpmndi:BPMNShape id="${esc(id)}_di" bpmnElement="${esc(id)}" isHorizontal="true"><dc:Bounds x="${POOL_X + 30}" y="${laneTop[i]}" width="${poolW - 30}" height="${laneH[i]}" /></bpmndi:BPMNShape>`;
  });
  for (const [id, el] of nodeEls) {
    const b = box.get(id)!;
    const marker = el.localName === 'exclusiveGateway' ? ' isMarkerVisible="true"' : '';
    di += `<bpmndi:BPMNShape id="${esc(id)}_di" bpmnElement="${esc(id)}"${marker}><dc:Bounds x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" /></bpmndi:BPMNShape>`;
  }
  for (const [id, b] of assetBox) {
    di += `<bpmndi:BPMNShape id="${esc(id)}_di" bpmnElement="${esc(id)}"><dc:Bounds x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" /></bpmndi:BPMNShape>`;
  }
  for (const f of flows) {
    const pts = route(f.s, f.t).map((p) => `<di:waypoint x="${p.x}" y="${p.y}" />`).join('');
    di += `<bpmndi:BPMNEdge id="${esc(f.id)}_di" bpmnElement="${esc(f.id)}">${pts}</bpmndi:BPMNEdge>`;
  }

  root.setAttribute('xmlns:bpmndi', 'http://www.omg.org/spec/BPMN/20100524/DI');
  root.setAttribute('xmlns:dc', 'http://www.omg.org/spec/DD/20100524/DC');
  root.setAttribute('xmlns:di', 'http://www.omg.org/spec/DD/20100524/DI');
  const serialized = new XMLSerializer().serializeToString(doc);
  const end = serialized.lastIndexOf('</');
  return `${serialized.slice(0, end)}<bpmndi:BPMNDiagram id="BPMNDiagram_auto"><bpmndi:BPMNPlane id="BPMNPlane_auto" bpmnElement="${collabId}">${di}</bpmndi:BPMNPlane></bpmndi:BPMNDiagram>${serialized.slice(end)}`;
}
