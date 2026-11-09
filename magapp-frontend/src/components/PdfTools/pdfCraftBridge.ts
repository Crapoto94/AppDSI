/**
 * Pont MagApp ⇄ PdfCraft (iframe même origine, API de contrôle `?control`).
 * Voir docs/PDFCRAFT-INTEGRATION.md. Deux services :
 *
 * 1. getPdf()  — récupère les octets du document OUVERT dans PdfCraft : on exécute la commande native
 *    `file.save` ; PdfCraft fabrique alors un Blob PDF (URL.createObjectURL) puis clique un lien
 *    `<a download>`. On intercepte ce Blob (et on supprime le téléchargement) uniquement pendant la capture.
 *
 * 2. Menu « Assistant IA » natif — ses entrées Résumer / Interroger / Traduire (descriptions « … — ai.summary /
 *    ai.ask / ai.translate ») sont inertes dans PdfCraft 0.20.0. On repère leur rectangle (uiInspect, en pixels CSS
 *    du viewport de l'iframe) et on intercepte le clic (phase de capture) pour ouvrir « Mon assistant IA ».
 */
export type AiMode = 'summary' | 'ask' | 'translate';

export interface PdfCraftBridge {
  /** PDF actuellement ouvert (null si aucun document). */
  getPdf: () => Promise<File | null>;
  dispose: () => void;
}

const AI_COMMANDS: Record<string, AiMode> = { 'ai.summary': 'summary', 'ai.ask': 'ask', 'ai.translate': 'translate' };

export function installPdfCraftBridge(frame: HTMLIFrameElement | null, onAiRequest: (mode: AiMode) => void): PdfCraftBridge | null {
  const win = frame?.contentWindow as any;
  if (!win) return null;

  // --- 1. Capture du PDF produit par « file.save » -------------------------------------------------
  const capture: { active: boolean; blob: Blob | null } = { active: false, blob: null };
  const origCreate = win.URL.createObjectURL.bind(win.URL);
  win.URL.createObjectURL = (obj: any) => {
    if (capture.active && obj instanceof win.Blob) capture.blob = obj;
    return origCreate(obj);
  };
  const origAnchorClick = win.HTMLAnchorElement.prototype.click;
  win.HTMLAnchorElement.prototype.click = function (this: HTMLAnchorElement) {
    if (capture.active && this.download) return; // pas de téléchargement réel pendant la capture
    return origAnchorClick.call(this);
  };

  const getPdf = async (): Promise<File | null> => {
    const api = win.pdfcraft;
    if (!api || typeof api.execute !== 'function') return null;
    const cmds = await api.commands();
    const save = (cmds?.commands || cmds || []).find((c: any) => c.id === 'file.save');
    if (!save || save.enabled === false) return null; // aucun document ouvert
    capture.blob = null;
    capture.active = true;
    try {
      await api.execute('file.save', {});
      for (let i = 0; i < 40 && !capture.blob; i++) await new Promise((r) => setTimeout(r, 200));
    } finally {
      capture.active = false;
    }
    const blob = capture.blob as Blob | null;
    if (!blob) return null;
    return new File([blob], 'document.pdf', { type: 'application/pdf' });
  };

  // --- 2. Interception des clics sur le menu natif « Assistant IA » -------------------------------
  let aiItems: { mode: AiMode; rect: number[] }[] = [];
  let polling = false;
  const refresh = async () => {
    if (polling) return;
    polling = true;
    try {
      const api = win.pdfcraft;
      if (!api || typeof api.uiInspect !== 'function') return;
      const insp = await api.uiInspect({});
      const next: { mode: AiMode; rect: number[] }[] = [];
      for (const w of insp?.widgets || []) {
        const m = /—\s*(ai\.(?:summary|ask|translate))\s*$/.exec(w.description || '');
        if (m && w.rect) next.push({ mode: AI_COMMANDS[m[1]], rect: w.rect });
      }
      aiItems = next;
    } catch { /* PdfCraft pas encore prêt */ } finally { polling = false; }
  };
  const timer = window.setInterval(refresh, 400);

  const hit = (e: MouseEvent | PointerEvent) =>
    aiItems.find(({ rect }) => e.clientX >= rect[0] && e.clientX <= rect[2] && e.clientY >= rect[1] && e.clientY <= rect[3]);
  const handler = (e: Event) => {
    const item = hit(e as MouseEvent);
    if (!item) return;
    e.stopImmediatePropagation();
    e.preventDefault();
    if (e.type === 'click') onAiRequest(item.mode); // un seul déclenchement par clic
  };
  const events = ['pointerdown', 'pointerup', 'mousedown', 'mouseup', 'click'];
  events.forEach((t) => win.addEventListener(t, handler, true));

  return {
    getPdf,
    dispose: () => {
      window.clearInterval(timer);
      try { events.forEach((t) => win.removeEventListener(t, handler, true)); } catch { /* iframe détruit */ }
    },
  };
}
