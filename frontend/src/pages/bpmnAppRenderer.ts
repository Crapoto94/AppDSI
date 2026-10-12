import BaseRenderer from 'diagram-js/lib/draw/BaseRenderer';
import type { ElementLike as DiagramElement, ShapeLike as DiagramShape } from 'diagram-js/lib/model/Types';
import { append, attr, create } from 'tiny-svg';

interface ExtendedElement {
  type?: string;
  labelTarget?: ExtendedElement;
  businessObject?: { name?: string; get: (key: string) => unknown };
}

interface TextRendererLike {
  createText: (text: string, options: Record<string, unknown>) => SVGElement;
}

/** Taille par défaut d'un actif logiciel (assez large pour afficher son nom dans la fenêtre). */
export const APP_ASSET_SIZE = { width: 120, height: 70 };

const BAR_HEIGHT = 14;

function isApplication(element?: ExtendedElement): boolean {
  if (!element || element.type !== 'bpmn:DataStoreReference') return false;
  try {
    return !!element.businessObject?.get('dsi:applicationId');
  } catch {
    return false;
  }
}

/**
 * Les applications du Magasin d'applications sont des ACTIFS du diagramme (références de
 * magasin de données portant dsi:applicationId), reliés aux tâches qui les utilisent. Ce
 * moteur de rendu les dessine comme une fenêtre de logiciel : barre de titre avec boutons, et
 * le NOM DU LOGICIEL à l'intérieur de la fenêtre (l'étiquette externe standard est masquée).
 */
export default class AppAssetRenderer extends BaseRenderer {
  static $inject = ['eventBus', 'textRenderer'];

  private textRenderer: TextRendererLike;

  constructor(eventBus: unknown, textRenderer: TextRendererLike) {
    super(eventBus as ConstructorParameters<typeof BaseRenderer>[0], 1500);
    this.textRenderer = textRenderer;
  }

  canRender(element: DiagramElement): boolean {
    const el = element as unknown as ExtendedElement;
    // L'actif lui-même, et son étiquette externe (qu'on n'affiche pas : le nom est dans la fenêtre)
    return isApplication(el) || (el.type === 'label' && isApplication(el.labelTarget));
  }

  drawShape(parent: SVGElement, shape: DiagramShape): SVGElement {
    const el = shape as unknown as ExtendedElement;

    // Étiquette externe masquée
    if (el.type === 'label') {
      const empty = create('g');
      append(parent, empty);
      return empty;
    }

    const { width: w, height: h } = shape;
    const bar = Math.min(BAR_HEIGHT, h / 3);
    const g = create('g');

    const frame = create('rect');
    attr(frame, { x: 0, y: 0, width: w, height: h, rx: 6, ry: 6, fill: '#ffffff', stroke: '#4f46e5', 'stroke-width': 2 });
    append(g, frame);

    // Barre de titre (coins supérieurs arrondis)
    const titleBar = create('path');
    attr(titleBar, { d: `M0,6 a6,6 0 0 1 6,-6 h${w - 12} a6,6 0 0 1 6,6 v${bar - 6} h-${w} z`, fill: '#4f46e5' });
    append(g, titleBar);

    // Boutons de fenêtre
    [8, 16, 24].forEach((x, i) => {
      const dot = create('circle');
      attr(dot, { cx: x, cy: bar / 2 + 0.5, r: 2, fill: ['#fca5a5', '#fde68a', '#86efac'][i] });
      append(g, dot);
    });

    // Nom du logiciel, centré dans la zone de contenu de la fenêtre
    const name = el.businessObject?.name?.trim();
    if (name) {
      const text = this.textRenderer.createText(name, {
        box: { width: w - 10, height: h - bar - 4 },
        align: 'center-middle',
        padding: 2,
        style: { fontSize: 12, fontWeight: 600, fill: '#312e81' },
      });
      attr(text, { transform: `translate(5, ${bar + 2})` });
      append(g, text);
    }

    append(parent, g);
    return g;
  }

  getShapePath(shape: DiagramShape): string {
    const { x, y, width, height } = shape;
    return `M${x},${y} h${width} v${height} h-${width} z`;
  }
}
