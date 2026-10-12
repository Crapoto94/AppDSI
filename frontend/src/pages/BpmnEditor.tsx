import React, { useEffect, useRef, useState } from 'react';
import { FilePlus, FolderOpen, Download, Image as ImageIcon, ZoomIn, ZoomOut, Maximize, Sparkles, Send, Undo2, X, Search, AppWindow, Save, Library, User } from 'lucide-react';
import axios from 'axios';
import BpmnModeler from 'bpmn-js/lib/Modeler';
import { layoutProcess } from 'bpmn-auto-layout';
import 'diagram-js/assets/diagram-js.css';
import 'bpmn-js/dist/assets/bpmn-js.css';
import 'bpmn-js/dist/assets/bpmn-font/css/bpmn.css';
import Header from '../components/Header';
import frenchTranslation from './bpmnTranslate';
import AppAssetRenderer, { APP_ASSET_SIZE } from './bpmnAppRenderer';
import TypeColorRenderer, { TYPE_COLORS } from './bpmnTypeColors';
import { normalizeBpmn, splitAssetLinks } from './bpmnNormalize';
import { layoutWithLanes } from './bpmnLaneLayout';
import {
  AssetChips, DiagramLibraryDialog, SaveDiagramDialog,
  type DiagramAsset, type DiagramMeta,
} from '../components/bpmn/BpmnLibraryDialogs';

const STORAGE_KEY = 'bpmn_editor_draft';
// Diagramme de la bibliothèque auquel le brouillon est rattaché : sans lui, « Enregistrer » après un
// rechargement de la page créerait un nouveau diagramme au lieu de mettre à jour l'existant.
const CURRENT_KEY = 'bpmn_editor_current';
const DSI_NS = 'http://dsi.ivry/schema/bpmn';
const DEFAULT_TITLE = 'Nouveau processus';

const EMPTY_DIAGRAM = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI" xmlns:dc="http://www.omg.org/spec/DD/20100524/DC" id="Definitions_1" targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:process id="Process_1" isExecutable="false">
    <bpmn:startEvent id="StartEvent_1" name="Début" />
  </bpmn:process>
  <bpmndi:BPMNDiagram id="BPMNDiagram_1">
    <bpmndi:BPMNPlane id="BPMNPlane_1" bpmnElement="Process_1">
      <bpmndi:BPMNShape id="StartEvent_1_di" bpmnElement="StartEvent_1">
        <dc:Bounds x="180" y="160" width="36" height="36" />
        <bpmndi:BPMNLabel><dc:Bounds x="183" y="203" width="31" height="14" /></bpmndi:BPMNLabel>
      </bpmndi:BPMNShape>
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
</bpmn:definitions>`;

// Extension BPMN : un actif (référence de magasin de données) peut représenter une application
// du Magasin d'applications (magapp.apps). Il est relié aux tâches qui l'utilisent.
const dsiModdle = {
  name: 'DSI',
  uri: DSI_NS,
  prefix: 'dsi',
  xml: { tagAlias: 'lowerCase' },
  types: [
    {
      name: 'ApplicationRef',
      extends: ['bpmn:DataStoreReference'],
      properties: [{ name: 'applicationId', isAttr: true, type: 'Integer' }],
    },
  ],
};

interface CanvasApi {
  zoom: (level?: number | string, center?: string) => number;
  viewbox: () => { x: number; y: number; width: number; height: number };
  getRootElement: () => { businessObject: { $type: string } };
}

interface ShapeLike { id: string; type: string; businessObject: { id: string; name?: string; get: (k: string) => unknown } }
interface RegistryApi {
  getAll: () => ShapeLike[];
  get: (id: string) => ShapeLike | undefined;
  find: (fn: (e: ShapeLike) => boolean) => ShapeLike | undefined;
}
interface ModelingApi {
  createShape: (shape: unknown, pos: { x: number; y: number }, parent: unknown) => unknown;
  updateProperties: (el: unknown, props: Record<string, unknown>) => void;
  connect: (source: unknown, target: unknown) => unknown;
}

interface MagApp { id: number; name: string; description?: string; icon?: string }
interface ChatMsg { role: 'user' | 'assistant'; content: string; error?: boolean }

// Entrée « Application » dans la palette : ouvre le sélecteur d'applications (composant React)
interface PaletteLike { registerProvider: (p: unknown) => void }
interface DsiPaletteConfig { openPicker: () => void }
function DsiPalette(this: { _cfg: DsiPaletteConfig }, palette: PaletteLike, config: DsiPaletteConfig) {
  this._cfg = config;
  palette.registerProvider(this);
}
DsiPalette.$inject = ['palette', 'config.dsiApps'];
DsiPalette.prototype.getPaletteEntries = function (this: { _cfg: DsiPaletteConfig }) {
  return {
    'dsi-application': {
      group: 'data',
      title: "Application : ajoute un logiciel du Magasin d'applications comme actif (fenêtre portant son nom).\nReliez-le ensuite à la tâche qui l'utilise avec la flèche du pavé contextuel.",
      html: `<div class="entry" style="display:flex;align-items:center;justify-content:center">
        <svg width="22" height="22" viewBox="0 0 22 22"><rect x="2" y="3" width="18" height="16" rx="2.5" fill="#fff" stroke="#4f46e5" stroke-width="1.6"/><path d="M2 5.5a2.5 2.5 0 0 1 2.5-2.5h13A2.5 2.5 0 0 1 20 5.5V8H2z" fill="#4f46e5"/><rect x="5" y="11" width="12" height="2" rx="1" fill="#c7d2fe"/><rect x="5" y="14.5" width="8" height="2" rx="1" fill="#c7d2fe"/></svg></div>`,
      action: { click: () => this._cfg.openPicker() },
    },
  };
};

// Les infobulles de la palette tiennent d'ordinaire sur une ligne : on autorise plusieurs lignes
// (retours à la ligne des descriptions) et une largeur raisonnable.
const tooltipStyle = `
.djs-hover-tooltip { white-space: pre-line !important; max-width: 340px; line-height: 1.45 !important; text-align: left; }
[data-tip] { position: relative; }
[data-tip]:hover::after {
  content: attr(data-tip); position: absolute; top: calc(100% + 8px); left: 0; z-index: 3000;
  width: max-content; max-width: 320px; white-space: pre-line; text-align: left;
  background: #0f172a; color: #fff; padding: 8px 11px; border-radius: 8px;
  font-size: 0.75rem; font-weight: 500; line-height: 1.45; box-shadow: 0 6px 18px rgba(15, 23, 42, 0.3); pointer-events: none;
}
[data-tip]:nth-last-child(-n+5):hover::after { left: auto; right: 0; }
`;

const download = (content: string, filename: string, type: string) => {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
};

const btn: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '8px 14px',
  borderRadius: '8px', border: '1px solid #cbd5e1', background: 'white',
  color: '#0f172a', fontWeight: 600, fontSize: '0.85rem', cursor: 'pointer',
};

const authHeaders = () => ({ Authorization: `Bearer ${localStorage.getItem('token') || ''}` });

const errMsg = (e: unknown) =>
  axios.isAxiosError(e) ? (e.response?.data?.message || e.message) : (e instanceof Error ? e.message : String(e));

const BpmnEditor: React.FC = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const modelerRef = useRef<BpmnModeler | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const placedCount = useRef(0);
  const dirtyRef = useRef(false);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Diagramme de la bibliothèque actuellement ouvert (null = pas encore enregistré) + métadonnées éditables
  const [current, setCurrent] = useState<DiagramMeta | null>(null);
  const [title, setTitle] = useState(DEFAULT_TITLE);
  const [description, setDescription] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [saveOpen, setSaveOpen] = useState(false);
  const [detectedAssets, setDetectedAssets] = useState<DiagramAsset[]>([]);
  const [libraryOpen, setLibraryOpen] = useState(false);

  const [apps, setApps] = useState<MagApp[]>([]);
  const [appsError, setAppsError] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [appSearch, setAppSearch] = useState('');

  const [aiOpen, setAiOpen] = useState(true);
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [aiInput, setAiInput] = useState('');
  const [aiBusy, setAiBusy] = useState(false);
  const [previousXml, setPreviousXml] = useState<string | null>(null);

  const getCanvas = () => modelerRef.current!.get('canvas') as CanvasApi;
  const getRegistry = () => modelerRef.current!.get('elementRegistry') as RegistryApi;
  const getModeling = () => modelerRef.current!.get('modeling') as ModelingApi;

  const markDirty = (value: boolean) => { dirtyRef.current = value; setDirty(value); };

  const flash = (message: string) => {
    setNotice(message);
    setTimeout(() => setNotice((n) => (n === message ? null : n)), 5000);
  };

  const loadInto = (modeler: BpmnModeler, xml: string) =>
    modeler.importXML(xml).then(
      () => {
        (modeler.get('canvas') as CanvasApi).zoom('fit-viewport', 'auto');
        setError(null);
      },
      (e: unknown) => setError('Diagramme invalide : ' + errMsg(e)),
    );

  const loadXml = (xml: string) => loadInto(modelerRef.current!, xml);

  const saveDraft = async (modeler: BpmnModeler) => {
    try {
      const { xml } = await modeler.saveXML({ format: true });
      if (xml) localStorage.setItem(STORAGE_KEY, xml);
    } catch { /* stockage indisponible */ }
  };

  useEffect(() => {
    if (!containerRef.current) return;
    const modeler = new BpmnModeler({
      container: containerRef.current,
      moddleExtensions: { dsi: dsiModdle },
      additionalModules: [
        frenchTranslation,
        { __init__: ['dsiPalette'], dsiPalette: ['type', DsiPalette] },
        { __init__: ['dsiAppRenderer'], dsiAppRenderer: ['type', AppAssetRenderer] },
        { __init__: ['dsiTypeColors'], dsiTypeColors: ['type', TypeColorRenderer] },
      ],
      dsiApps: { openPicker: () => setPickerOpen(true) },
    });
    modelerRef.current = modeler;

    let draft: string | null = null;
    try { draft = localStorage.getItem(STORAGE_KEY); } catch { /* stockage indisponible */ }
    loadInto(modeler, draft || EMPTY_DIAGRAM);

    // Brouillon local (secours) : sauvegarde automatique dans le navigateur, en plus de la bibliothèque serveur
    let timer: ReturnType<typeof setTimeout>;
    modeler.on('commandStack.changed', () => {
      markDirty(true);
      clearTimeout(timer);
      timer = setTimeout(() => saveDraft(modeler), 800);
    });

    return () => { clearTimeout(timer); modeler.destroy(); };
  }, []);

  // Applications du Magasin d'applications (/admin/magapp)
  useEffect(() => {
    axios.get<MagApp[]>('/api/magapp/apps', { headers: authHeaders() })
      .then((res) => setApps(Array.isArray(res.data) ? res.data : []))
      .catch(() => setAppsError("Impossible de charger les applications du Magasin d'applications."));
  }, []);

  // Retrouve le diagramme de la bibliothèque rattaché au brouillon restauré (rechargement de page)
  useEffect(() => {
    let id: string | null = null;
    let draft: string | null = null;
    try { id = localStorage.getItem(CURRENT_KEY); draft = localStorage.getItem(STORAGE_KEY); } catch { /* stockage indisponible */ }
    if (!id) return;
    if (!draft) { try { localStorage.removeItem(CURRENT_KEY); } catch { /* rien */ } return; }
    axios.get<DiagramMeta & { xml: string }>(`/api/bpmn/diagrams/${id}`, { headers: authHeaders() })
      .then((res) => {
        const { xml, ...meta } = res.data;
        setCurrent(meta);
        setTitle(meta.title);
        setDescription(meta.description || '');
        setTags(meta.tags);
        // Le brouillon diffère de la version enregistrée : des modifications restent à enregistrer
        if (draft && xml.trim() !== draft.trim()) markDirty(true);
      })
      .catch((e) => {
        // Diagramme supprimé entre-temps : le brouillon redevient un diagramme non enregistré
        if (axios.isAxiosError(e) && e.response?.status === 404) { try { localStorage.removeItem(CURRENT_KEY); } catch { /* rien */ } }
      });
  }, []);

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages, aiBusy]);

  // Avertit avant de quitter la page avec des modifications non enregistrées dans la bibliothèque
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => { if (dirtyRef.current) { e.preventDefault(); e.returnValue = ''; } };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, []);

  const confirmDiscard = () => !dirtyRef.current || window.confirm('Des modifications ne sont pas enregistrées dans la bibliothèque. Continuer et les perdre ?');

  const addApplication = (app: MagApp) => {
    const modeler = modelerRef.current!;
    const canvas = getCanvas();
    const factory = modeler.get('elementFactory') as { createShape: (attrs: Record<string, unknown>) => unknown };

    let root: unknown = canvas.getRootElement();
    if (canvas.getRootElement().businessObject.$type === 'bpmn:Collaboration') {
      root = getRegistry().find((e) => e.type === 'bpmn:Participant') ?? root;
    }
    const vb = canvas.viewbox();
    const offset = (placedCount.current++ % 6) * 30;
    const shape = getModeling().createShape(
      factory.createShape({ type: 'bpmn:DataStoreReference', ...APP_ASSET_SIZE }),
      { x: vb.x + vb.width / 2 + offset, y: vb.y + vb.height / 2 + offset },
      root,
    );
    getModeling().updateProperties(shape, { name: app.name, 'dsi:applicationId': app.id });
    setPickerOpen(false);
    setAppSearch('');
    flash(`« ${app.name} » ajouté comme actif. Reliez-le à une tâche avec la flèche du pavé contextuel.`);
  };

  /** Applications référencées par le diagramme courant (pour l'affichage ; le serveur les recalcule). */
  const collectAssets = (): DiagramAsset[] => {
    const seen = new Map<number, DiagramAsset>();
    for (const el of getRegistry().getAll()) {
      let id: unknown;
      try { id = el.businessObject.get('dsi:applicationId'); } catch { continue; }
      if (id) seen.set(Number(id), { type: 'application', id: Number(id), name: el.businessObject.name || apps.find((a) => a.id === Number(id))?.name || `Application ${id}` });
    }
    return [...seen.values()].sort((a, b) => a.name.localeCompare(b.name, 'fr'));
  };

  const rememberCurrent = (meta: DiagramMeta | null) => {
    setCurrent(meta);
    try {
      if (meta) localStorage.setItem(CURRENT_KEY, String(meta.id));
      else localStorage.removeItem(CURRENT_KEY);
    } catch { /* stockage indisponible */ }
  };

  const resetDocument = (xml: string, meta: DiagramMeta | null) => {
    rememberCurrent(meta);
    setTitle(meta?.title || DEFAULT_TITLE);
    setDescription(meta?.description || '');
    setTags(meta?.tags || []);
    setPreviousXml(null);
    markDirty(false);
    return loadXml(xml);
  };

  const handleNew = () => {
    if (!confirmDiscard()) return;
    resetDocument(EMPTY_DIAGRAM, null);
  };

  const handleOpenFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !confirmDiscard()) return;
    const reader = new FileReader();
    reader.onload = () => {
      resetDocument(String(reader.result), null).then(() => setTitle(file.name.replace(/\.(bpmn|xml)$/i, '')));
    };
    reader.readAsText(file);
  };

  // --- Bibliothèque serveur ---
  const openSaveDialog = () => {
    setDetectedAssets(collectAssets());
    setSaveOpen(true);
  };

  const saveToLibrary = async (values: { title: string; description: string; tags: string[]; asCopy: boolean }) => {
    const { xml } = await modelerRef.current!.saveXML({ format: true });
    const body = { title: values.title, description: values.description, tags: values.tags, xml };
    const update = !!current && !!current.can_modify && !values.asCopy;
    const res = update
      ? await axios.put<DiagramMeta>(`/api/bpmn/diagrams/${current!.id}`, body, { headers: authHeaders() })
      : await axios.post<DiagramMeta>('/api/bpmn/diagrams', body, { headers: authHeaders() });
    rememberCurrent(res.data);
    setTitle(res.data.title);
    setDescription(res.data.description || '');
    setTags(res.data.tags);
    markDirty(false);
    setSaveOpen(false);
    flash(`« ${res.data.title} » enregistré dans la bibliothèque.`);
  };

  const openFromLibrary = async (id: number) => {
    if (!confirmDiscard()) return;
    const res = await axios.get<DiagramMeta & { xml: string }>(`/api/bpmn/diagrams/${id}`, { headers: authHeaders() });
    const { xml, ...meta } = res.data;
    await resetDocument(xml, meta);
    setLibraryOpen(false);
    saveDraft(modelerRef.current!);
  };

  const fileName = () => (title.trim() || 'processus').replace(/[^\w\-. ]+/g, '_');

  const exportBpmn = async () => {
    const { xml } = await modelerRef.current!.saveXML({ format: true });
    download(xml ?? '', `${fileName()}.bpmn`, 'application/xml');
  };

  const exportSvg = async () => {
    const { svg } = await modelerRef.current!.saveSVG();
    download(svg, `${fileName()}.svg`, 'image/svg+xml');
  };

  const zoom = (delta: number | 'fit') => {
    const canvas = getCanvas();
    if (delta === 'fit') canvas.zoom('fit-viewport', 'auto');
    else canvas.zoom(canvas.zoom() + delta);
  };

  // --- Assistant IA : construit ou modifie le diagramme à partir d'une demande en langage naturel ---
  const sendToAi = async () => {
    const prompt = aiInput.trim();
    if (!prompt || aiBusy) return;
    const modeler = modelerRef.current!;
    const history = messages.filter((m) => !m.error).map(({ role, content }) => ({ role, content }));
    setMessages((prev) => [...prev, { role: 'user', content: prompt }]);
    setAiInput('');
    setAiBusy(true);
    let warnings: string[] = [];
    let previousForRestore: string | undefined;
    try {
      const { xml: currentXml } = await modeler.saveXML({ format: true });
      previousForRestore = currentXml;
      const res = await axios.post<{ xml: string; message: string }>(
        '/api/bpmn/ai',
        { prompt, xml: currentXml, history },
        { headers: authHeaders(), timeout: 1600000 },
      );
      // Le positionnement est calculé ici : on remet d'abord la réponse de l'IA dans un état fiable
      // (graphique retiré, flèches recalculées, documentation conservée), puis mise en page.
      let semantic = res.data.xml;
      if (semantic.includes('dsi:') && !semantic.includes('xmlns:dsi')) {
        semantic = semantic.replace(/<(\w+:)?definitions/, (m) => `${m} xmlns:dsi="${DSI_NS}"`);
      }
      const normalized = normalizeBpmn(semantic, currentXml);
      warnings = normalized.warnings;
      const { xml: withoutLinks, links } = splitAssetLinks(normalized.xml);
      const laidOut = layoutWithLanes(withoutLinks, links) ?? await layoutProcess(withoutLinks);
      await modeler.importXML(laidOut);
      // Recrée les liaisons tâche → logiciel comme de vraies connexions dessinées
      const registry = getRegistry();
      for (const link of links) {
        const task = registry.get(link.task);
        const asset = registry.get(link.asset);
        if (task && asset) {
          try { getModeling().connect(link.output ? task : asset, link.output ? asset : task); } catch { /* liaison non autorisée : ignorée */ }
        }
      }
      getCanvas().zoom('fit-viewport', 'auto');
      setError(null);
      setPreviousXml(currentXml ?? null);
      markDirty(true);
      saveDraft(modeler);
      setMessages((prev) => [...prev, { role: 'assistant', content: warnings.length ? `${res.data.message}\n⚠ ${warnings.join(' ; ')}.` : res.data.message }]);
    } catch (e) {
      // Un import raté laisse l'éditeur vide : on remet le diagramme d'avant
      if (previousForRestore) { try { await modeler.importXML(previousForRestore); } catch { /* rien de plus à faire */ } }
      setMessages((prev) => [...prev, { role: 'assistant', content: `Échec : ${errMsg(e)}\nLe diagramme précédent a été conservé.`, error: true }]);
    } finally {
      setAiBusy(false);
    }
  };

  const undoAi = async () => {
    if (!previousXml) return;
    await loadXml(previousXml);
    saveDraft(modelerRef.current!);
    setPreviousXml(null);
    setMessages((prev) => [...prev, { role: 'assistant', content: 'Dernière modification IA annulée.' }]);
  };

  const filteredApps = apps.filter((a) => `${a.name} ${a.description || ''}`.toLowerCase().includes(appSearch.toLowerCase()));

  return (
    <div style={{ minHeight: '100vh', backgroundColor: 'var(--bg-color)' }}>
      <style>{tooltipStyle}</style>
      <Header />
      <main style={{ padding: '60px 20px' }}>
        <div style={{ maxWidth: '1500px', margin: '0 auto' }}>
          <h1 style={{ fontSize: '2rem', fontWeight: 900, color: '#0f172a', margin: '0 0 8px' }}>
            Modélisation BPMN
          </h1>
          <p style={{ color: '#64748b', margin: '0 0 16px' }}>
            Création de processus au format BPMN 2.0 (éditeur bpmn.io). Enregistrez vos diagrammes dans la bibliothèque partagée du serveur ;
            un brouillon de secours est aussi conservé dans votre navigateur.
          </p>

          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center', marginBottom: '8px' }}>
            <input
              value={title}
              onChange={(e) => { setTitle(e.target.value); markDirty(true); }}
              placeholder="Titre du diagramme"
              style={{ padding: '8px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.9rem', minWidth: '240px', fontWeight: 600 }}
            />
            <button
              style={{ ...btn, background: '#4f46e5', borderColor: '#4f46e5', color: 'white' }}
              onClick={openSaveDialog}
              data-tip={"Enregistrer dans la bibliothèque du serveur.\nSaisie du titre, de la description et des étiquettes ; les logiciels concernés sont détectés automatiquement.\nMet à jour le diagramme ouvert (si vous en êtes le créateur) ou en crée un nouveau. Le point • signale des modifications non enregistrées."}
            >
              <Save size={16} /> Enregistrer{dirty ? ' •' : ''}
            </button>
            <button style={btn} onClick={() => setLibraryOpen(true)} data-tip={"Bibliothèque de diagrammes partagée.\nRecherche par titre, description, créateur, logiciel ou étiquette ; filtre par logiciel ; ouverture et suppression (créateur ou administrateur)."}>
              <Library size={16} /> Bibliothèque
            </button>
            <button style={btn} onClick={handleNew} data-tip={"Nouveau diagramme vide.\nLe brouillon actuel est remplacé (confirmation demandée s'il contient des modifications non enregistrées)."}>
              <FilePlus size={16} /> Nouveau
            </button>
            <button style={btn} onClick={() => setPickerOpen(true)} data-tip={"Ajouter un logiciel du Magasin d'applications comme actif du diagramme (fenêtre portant son nom).\nReliez-le ensuite à la tâche qui l'utilise avec la flèche du pavé contextuel."}>
              <AppWindow size={16} /> Application
            </button>
            <button style={btn} onClick={() => fileInputRef.current?.click()} data-tip={"Importer un fichier de diagramme depuis votre poste.\nFormats acceptés : .bpmn ou .xml (BPMN 2.0)."}>
              <FolderOpen size={16} /> Importer…
            </button>
            <button style={btn} onClick={exportBpmn} data-tip={"Télécharger le diagramme au format BPMN 2.0 (.bpmn).\nRéutilisable dans d'autres outils de modélisation."}>
              <Download size={16} /> Exporter .bpmn
            </button>
            <button style={btn} onClick={exportSvg} data-tip={"Télécharger une image vectorielle (SVG) du diagramme.\nUtilisable dans un document ou une présentation, sans perte de qualité."}>
              <ImageIcon size={16} /> Exporter SVG
            </button>
            <span style={{ flex: 1 }} />
            <button
              style={{ ...btn, background: aiOpen ? '#eef2ff' : 'white', color: '#4338ca', borderColor: '#c7d2fe' }}
              onClick={() => setAiOpen(!aiOpen)}
              data-tip={"Afficher ou masquer l'assistant IA.\nDécrivez un processus à construire ou une modification du diagramme actuel ; l'IA connaît les applications du Magasin d'applications. Le diagramme est replacé automatiquement et la dernière modification IA peut être annulée."}
            >
              <Sparkles size={16} /> Assistant IA
            </button>
            <button style={btn} onClick={() => zoom(-0.2)} data-tip="Dézoomer (réduire l'affichage)"><ZoomOut size={16} /></button>
            <button style={btn} onClick={() => zoom(0.2)} data-tip="Zoomer (agrandir l'affichage)"><ZoomIn size={16} /></button>
            <button style={btn} onClick={() => zoom('fit')} data-tip="Ajuster le diagramme à la taille de la fenêtre"><Maximize size={16} /></button>
            <input ref={fileInputRef} type="file" accept=".bpmn,.xml" onChange={handleOpenFile} style={{ display: 'none' }} />
          </div>

          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center', margin: '0 0 12px', fontSize: '0.8rem', color: '#64748b', minHeight: '22px' }}>
            {current ? (
              <>
                <span><User size={12} style={{ verticalAlign: '-1px' }} /> Bibliothèque : créé par <strong>{current.created_by || 'inconnu'}</strong>{current.updated_by && current.updated_by !== current.created_by ? `, modifié par ${current.updated_by}` : ''}</span>
                <AssetChips assets={current.assets} />
                {tags.map((t) => <span key={t} style={{ padding: '2px 8px', borderRadius: '999px', background: '#f1f5f9' }}>#{t}</span>)}
              </>
            ) : (
              <span>Non enregistré dans la bibliothèque.</span>
            )}
            {description && <span title={description} style={{ maxWidth: '420px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>— {description}</span>}
          </div>

          <div style={{ display: 'flex', gap: '6px 12px', flexWrap: 'wrap', alignItems: 'center', margin: '0 0 12px', fontSize: '0.75rem', color: '#475569' }}>
            <span style={{ fontWeight: 700 }}>Légende :</span>
            {TYPE_COLORS.map((c) => (
              <span key={c.key} style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
                <span style={{ width: '12px', height: '12px', borderRadius: c.key === 'start' || c.key === 'end' ? '50%' : c.key === 'gateway' ? '2px' : '3px', transform: c.key === 'gateway' ? 'rotate(45deg) scale(0.85)' : undefined, background: c.fill, border: `2px solid ${c.stroke}`, boxSizing: 'border-box' }} />
                {c.label}
              </span>
            ))}
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
              <span style={{ width: '14px', height: '11px', borderRadius: '2px', border: '2px solid #4f46e5', borderTopWidth: '4px', background: 'white', boxSizing: 'border-box' }} />
              Logiciel (application)
            </span>
          </div>

          {notice && (
            <div style={{ background: '#f0fdf4', color: '#166534', padding: '10px 14px', borderRadius: '8px', marginBottom: '12px' }}>{notice}</div>
          )}
          {error && (
            <div style={{ background: '#fef2f2', color: '#b91c1c', padding: '10px 14px', borderRadius: '8px', marginBottom: '12px' }}>
              {error}
            </div>
          )}

          <div style={{ display: 'flex', gap: '12px', alignItems: 'stretch', flexWrap: 'wrap' }}>
            <div
              ref={containerRef}
              style={{ flex: '1 1 600px', height: 'calc(100vh - 360px)', minHeight: '480px', background: 'white', border: '1px solid #e2e8f0', borderRadius: '12px', overflow: 'hidden' }}
            />

            {aiOpen && (
              <aside style={{ flex: '0 0 340px', maxWidth: '100%', height: 'calc(100vh - 360px)', minHeight: '480px', display: 'flex', flexDirection: 'column', background: 'white', border: '1px solid #e2e8f0', borderRadius: '12px', overflow: 'hidden' }}>
                <div style={{ padding: '12px 14px', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Sparkles size={16} color="#4f46e5" />
                  <strong style={{ color: '#0f172a', fontSize: '0.95rem' }}>Assistant IA</strong>
                  <span style={{ flex: 1 }} />
                  {previousXml && (
                    <button style={{ ...btn, padding: '4px 10px', fontSize: '0.75rem' }} onClick={undoAi} title="Revenir au diagramme d'avant la dernière réponse IA">
                      <Undo2 size={13} /> Annuler
                    </button>
                  )}
                </div>

                <div style={{ flex: 1, overflowY: 'auto', padding: '12px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {messages.length === 0 && (
                    <div style={{ color: '#64748b', fontSize: '0.85rem', lineHeight: 1.5 }}>
                      Décrivez un processus à construire ou une modification du diagramme actuel. Exemples :
                      <ul style={{ paddingLeft: '18px', margin: '6px 0 0' }}>
                        <li>« Processus d'arrivée d'un nouvel agent »</li>
                        <li>« Ajoute une validation par le responsable avant la commande »</li>
                      </ul>
                      <div style={{ marginTop: '8px' }}>
                        L'IA connaît les applications du Magasin d'applications et peut les ajouter comme logiciels reliés aux tâches. Le diagramme est replacé automatiquement.
                      </div>
                    </div>
                  )}
                  {messages.map((m, i) => (
                    <div
                      key={i}
                      style={{
                        alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start', maxWidth: '90%',
                        padding: '8px 12px', borderRadius: '10px', fontSize: '0.85rem', lineHeight: 1.45, whiteSpace: 'pre-wrap',
                        background: m.error ? '#fef2f2' : m.role === 'user' ? '#4f46e5' : '#f1f5f9',
                        color: m.error ? '#b91c1c' : m.role === 'user' ? 'white' : '#0f172a',
                      }}
                    >
                      {m.content}
                    </div>
                  ))}
                  {aiBusy && <div style={{ color: '#64748b', fontSize: '0.85rem' }}>L'IA construit le diagramme… (cela peut prendre une minute)</div>}
                  <div ref={chatEndRef} />
                </div>

                <div style={{ padding: '10px', borderTop: '1px solid #e2e8f0', display: 'flex', gap: '8px' }}>
                  <textarea
                    value={aiInput}
                    onChange={(e) => setAiInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendToAi(); } }}
                    placeholder="Votre demande…"
                    rows={3}
                    disabled={aiBusy}
                    style={{ flex: 1, resize: 'none', padding: '8px 10px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.85rem', fontFamily: 'inherit' }}
                  />
                  <button
                    onClick={sendToAi}
                    disabled={aiBusy || !aiInput.trim()}
                    style={{ ...btn, alignSelf: 'flex-end', background: '#4f46e5', color: 'white', borderColor: '#4f46e5', opacity: aiBusy || !aiInput.trim() ? 0.5 : 1 }}
                    title="Envoyer (Entrée)"
                  >
                    <Send size={16} />
                  </button>
                </div>
              </aside>
            )}
          </div>
        </div>
      </main>

      {saveOpen && (
        <SaveDiagramDialog
          current={current}
          initialTitle={title}
          initialDescription={description}
          initialTags={tags}
          detectedAssets={detectedAssets}
          onClose={() => setSaveOpen(false)}
          onSave={saveToLibrary}
        />
      )}

      {libraryOpen && (
        <DiagramLibraryDialog
          apps={apps}
          currentId={current?.id ?? null}
          onClose={() => setLibraryOpen(false)}
          onOpen={openFromLibrary}
        />
      )}

      {pickerOpen && (
        <div
          onClick={() => setPickerOpen(false)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.5)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{ background: 'white', borderRadius: '12px', width: '520px', maxWidth: '100%', maxHeight: '80vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}
          >
            <div style={{ padding: '14px 16px', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <AppWindow size={18} color="#4f46e5" />
              <strong style={{ flex: 1, color: '#0f172a' }}>Ajouter un logiciel au diagramme</strong>
              <button onClick={() => setPickerOpen(false)} style={{ border: 'none', background: 'none', cursor: 'pointer' }}><X size={18} /></button>
            </div>
            <div style={{ padding: '10px 16px', position: 'relative' }}>
              <Search size={15} style={{ position: 'absolute', left: '26px', top: '21px', color: '#94a3b8' }} />
              <input
                autoFocus
                value={appSearch}
                onChange={(e) => setAppSearch(e.target.value)}
                placeholder="Rechercher une application…"
                style={{ width: '100%', boxSizing: 'border-box', padding: '8px 12px 8px 32px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.9rem' }}
              />
            </div>
            <div style={{ overflowY: 'auto', padding: '0 8px 12px' }}>
              {appsError && <div style={{ color: '#b91c1c', padding: '8px 12px' }}>{appsError}</div>}
              {!appsError && filteredApps.length === 0 && (
                <div style={{ color: '#64748b', padding: '8px 12px' }}>Aucune application.</div>
              )}
              {filteredApps.map((a) => (
                <button
                  key={a.id}
                  onClick={() => addApplication(a)}
                  style={{ display: 'block', width: '100%', textAlign: 'left', padding: '8px 12px', border: 'none', background: 'none', borderRadius: '8px', cursor: 'pointer' }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = '#eef2ff'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = 'none'; }}
                >
                  <div style={{ fontWeight: 600, color: '#0f172a', fontSize: '0.9rem' }}>{a.name}</div>
                  {a.description && (
                    <div style={{ color: '#64748b', fontSize: '0.78rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.description}</div>
                  )}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default BpmnEditor;
