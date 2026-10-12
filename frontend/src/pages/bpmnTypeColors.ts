import BaseRenderer from 'diagram-js/lib/draw/BaseRenderer';
import type { ElementLike as DiagramElement, ShapeLike as DiagramShape } from 'diagram-js/lib/model/Types';
import { attr } from 'tiny-svg';

export interface TypeColor {
  key: string;
  label: string;
  fill: string;
  stroke: string;
  types: string[];
}

/** Couleur de chaque famille d'éléments BPMN, selon le type d'action. Sert aussi de légende. */
export const TYPE_COLORS: TypeColor[] = [
  { key: 'start', label: 'Début', fill: '#dcfce7', stroke: '#16a34a', types: ['bpmn:StartEvent'] },
  { key: 'user', label: 'Action humaine', fill: '#dbeafe', stroke: '#2563eb', types: ['bpmn:UserTask'] },
  { key: 'service', label: 'Automatique (système)', fill: '#ccfbf1', stroke: '#0d9488', types: ['bpmn:ServiceTask'] },
  { key: 'manual', label: 'Manuelle / physique', fill: '#ffedd5', stroke: '#ea580c', types: ['bpmn:ManualTask'] },
  { key: 'message', label: 'Communication', fill: '#fce7f3', stroke: '#db2777', types: ['bpmn:SendTask', 'bpmn:ReceiveTask'] },
  { key: 'rule', label: 'Script / règle', fill: '#ede9fe', stroke: '#7c3aed', types: ['bpmn:ScriptTask', 'bpmn:BusinessRuleTask'] },
  { key: 'gateway', label: 'Décision / parallélisme', fill: '#fef3c7', stroke: '#d97706', types: ['bpmn:ExclusiveGateway', 'bpmn:ParallelGateway', 'bpmn:InclusiveGateway', 'bpmn:EventBasedGateway', 'bpmn:ComplexGateway'] },
  { key: 'sub', label: 'Sous-processus', fill: '#e2e8f0', stroke: '#475569', types: ['bpmn:SubProcess', 'bpmn:CallActivity', 'bpmn:Transaction', 'bpmn:AdHocSubProcess'] },
  { key: 'end', label: 'Fin', fill: '#fee2e2', stroke: '#dc2626', types: ['bpmn:EndEvent'] },
];

const BY_TYPE = new Map<string, TypeColor>();
TYPE_COLORS.forEach((c) => c.types.forEach((t) => BY_TYPE.set(t, c)));

interface ExtendedElement {
  type?: string;
  di?: { get?: (k: string) => unknown };
}

/** Une couleur choisie à la main (bioc / color) par l'utilisateur est toujours respectée. */
function hasCustomColor(element: ExtendedElement): boolean {
  try {
    // bpmn-js 18 : le DI n'est lisible que depuis l'élément graphique (pas via businessObject)
    const di = element.di;
    if (!di || typeof di.get !== 'function') return false;
    return !!(di.get('bioc:fill') || di.get('bioc:stroke') || di.get('color:background-color') || di.get('color:border-color'));
  } catch {
    return false;
  }
}

interface BpmnRendererLike {
  drawShape: (parent: SVGElement, shape: unknown) => SVGElement;
  getShapePath: (shape: unknown) => string;
}

/**
 * Habille les formes BPMN standard d'une couleur propre à leur type d'action : on délègue le
 * dessin au moteur de rendu de bpmn-js (icônes, marqueurs, libellés conservés) puis on ne
 * change que le remplissage et le contour de la forme principale.
 */
export default class TypeColorRenderer extends BaseRenderer {
  static $inject = ['eventBus', 'bpmnRenderer'];

  private bpmnRenderer: BpmnRendererLike;

  constructor(eventBus: unknown, bpmnRenderer: BpmnRendererLike) {
    super(eventBus as ConstructorParameters<typeof BaseRenderer>[0], 1200);
    this.bpmnRenderer = bpmnRenderer;
  }

  canRender(element: DiagramElement): boolean {
    const el = element as unknown as ExtendedElement;
    return !!el.type && BY_TYPE.has(el.type) && !hasCustomColor(el);
  }

  drawShape(parent: SVGElement, shape: DiagramShape): SVGElement {
    const visual = this.bpmnRenderer.drawShape(parent, shape);
    const color = BY_TYPE.get((shape as unknown as ExtendedElement).type || '');
    if (color && visual) attr(visual, { fill: color.fill, stroke: color.stroke });
    return visual;
  }

  getShapePath(shape: DiagramShape): string {
    return this.bpmnRenderer.getShapePath(shape);
  }
}
