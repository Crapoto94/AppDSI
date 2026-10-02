import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { X, Download, ExternalLink, ChevronLeft, ChevronRight, File as FileIcon, FileText, Image as ImageIcon } from 'lucide-react';
import EmailMessageView from './EmailMessageView';
import type { EmailPreviewData } from './EmailMessageView';

/**
 * Visionneuse générique de pièces jointes (toutes les PJ d'une page/entité dans une modale).
 *
 * - <AttachmentViewerProvider> (monté dans main.tsx) intercepte les clics sur les liens
 *   <a target="_blank"> pointant vers un fichier du hub et ouvre la visionneuse avec
 *   toutes les PJ de la page (ou de la modale courante) au lieu d'un nouvel onglet.
 * - openAttachmentViewer(items, index) : ouverture programmatique (remplace window.open).
 */

export interface ViewerItem {
    url: string;
    name?: string;
    mime?: string;
}

const OPEN_EVENT = 'attachment-viewer:open';

export function openAttachmentViewer(items: ViewerItem[] | ViewerItem, index = 0) {
    const list = Array.isArray(items) ? items : [items];
    window.dispatchEvent(new CustomEvent(OPEN_EVENT, { detail: { items: list, index } }));
}

const Ctx = createContext<{ open: typeof openAttachmentViewer }>({ open: openAttachmentViewer });
export const useAttachmentViewer = () => useContext(Ctx);

const FILE_PATTERNS: RegExp[] = [
    /\/api\/.*\/attachments?\//,
    /\/api\/.*\/file(\/|$)/,
    /\/api\/documents\/\d+\/versions\/\d+\/content/,
    /\/api\/vols\/\d+\/documents\//,
    /\/api\/uploads\//,
    /\/download$/,
    /^\/(uploads|storage|img)\//,
];

function isFileHref(a: HTMLAnchorElement): boolean {
    try {
        const u = new URL(a.href, window.location.href);
        if (u.origin !== window.location.origin) return false;
        return FILE_PATTERNS.some(re => re.test(u.pathname));
    } catch { return false; }
}

function dedupKey(href: string): string {
    try {
        const u = new URL(href, window.location.href);
        u.searchParams.delete('token');
        u.searchParams.delete('mode');
        return u.pathname + u.search;
    } catch { return href; }
}

function inlineUrl(href: string): string {
    if (href.startsWith('blob:')) return href;
    try {
        const u = new URL(href, window.location.href);
        if (u.searchParams.get('mode') === 'attachment') u.searchParams.set('mode', 'inline');
        return u.pathname + u.search;
    } catch { return href; }
}

function nameFromAnchor(a: HTMLAnchorElement): string {
    const txt = (a.getAttribute('title') && !/^(ouvrir|télécharger|voir)/i.test(a.getAttribute('title')!) ? a.getAttribute('title') : a.textContent) || '';
    const cleaned = txt.replace(/^[^\p{L}\p{N}]+/u, '').replace(/\s*\([\d.,\s]+(o|ko|mo|go|kb|mb)\)\s*$/i, '').trim();
    if (cleaned) return cleaned;
    try {
        const u = new URL(a.href, window.location.href);
        return decodeURIComponent(u.pathname.split('/').filter(Boolean).pop() || 'Fichier');
    } catch { return 'Fichier'; }
}

function collectGroup(clicked: HTMLAnchorElement): { items: ViewerItem[]; index: number } {
    let scope: HTMLElement = document.body;
    for (let el: HTMLElement | null = clicked.parentElement; el && el !== document.body; el = el.parentElement) {
        if (window.getComputedStyle(el).position === 'fixed') { scope = el; break; }
    }
    const anchors = Array.from(scope.querySelectorAll<HTMLAnchorElement>('a[target="_blank"]'))
        .filter(a => !a.hasAttribute('download') && isFileHref(a));
    if (!anchors.includes(clicked)) anchors.push(clicked);
    const seen = new Map<string, number>();
    const items: ViewerItem[] = [];
    for (const a of anchors) {
        const key = dedupKey(a.href);
        if (seen.has(key)) continue;
        seen.set(key, items.length);
        items.push({ url: new URL(a.href, window.location.href).pathname + new URL(a.href, window.location.href).search, name: nameFromAnchor(a) });
    }
    return { items, index: seen.get(dedupKey(clicked.href)) ?? 0 };
}

type Kind = 'pdf' | 'image' | 'video' | 'audio' | 'text' | 'office' | 'email' | 'none';

const OFFICE_EXT = new Set(['doc', 'docx', 'rtf', 'odt', 'xls', 'xlsx', 'xlsm', 'ods', 'ppt', 'pptx', 'pptm', 'odp']);
const EMAIL_EXT = new Set(['msg', 'eml']);

const EXT_MIME: Record<string, string> = {
    pdf: 'application/pdf', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml', bmp: 'image/bmp',
    mp4: 'video/mp4', webm: 'video/webm', mp3: 'audio/mpeg', wav: 'audio/wav', ogg: 'audio/ogg',
    txt: 'text/plain', csv: 'text/csv', log: 'text/plain', json: 'application/json', xml: 'text/xml', md: 'text/plain',
};

function detectKind(mime: string, name: string): Kind {
    const ext0 = name.toLowerCase().split('.').pop() || '';
    if (EMAIL_EXT.has(ext0)) return 'email';
    const mime0 = (mime || '').toLowerCase().split(';')[0].trim();
    if (mime0 === 'message/rfc822' || mime0 === 'application/vnd.ms-outlook') return 'email';
    if (OFFICE_EXT.has(ext0)) return 'office';
    let m = (mime || '').toLowerCase().split(';')[0].trim();
    if (!m || m === 'application/octet-stream') {
        const ext = name.toLowerCase().split('.').pop() || '';
        m = EXT_MIME[ext] || m;
    }
    if (m === 'application/pdf') return 'pdf';
    if (m.startsWith('image/')) return 'image';
    if (m.startsWith('video/')) return 'video';
    if (m.startsWith('audio/')) return 'audio';
    if (m.startsWith('text/') || m === 'application/json') return 'text';
    return 'none';
}

function filenameFromDisposition(cd: string | null): string | null {
    if (!cd) return null;
    const m = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(cd);
    if (!m) return null;
    try { return decodeURIComponent(m[1]); } catch { return m[1]; }
}

interface Loaded { blobUrl: string; kind: Kind; name: string; text?: string; blob?: Blob }


let sdkPromise: Promise<void> | null = null;
let sdkSrc = '';
function loadSdk(src: string): Promise<void> {
    if ((window as any).DocsAPI && sdkSrc === src) return Promise.resolve();
    if (sdkPromise && sdkSrc === src) return sdkPromise;
    sdkSrc = src;
    sdkPromise = new Promise<void>((resolve, reject) => {
        const el = document.createElement('script');
        el.src = src;
        el.onload = () => resolve();
        el.onerror = () => { sdkPromise = null; reject(new Error('Moteur Office injoignable')); };
        document.head.appendChild(el);
    });
    return sdkPromise;
}

function OfficeFrame({ blob, name, downloadUrl }: { blob: Blob; name: string; downloadUrl: string }) {
    const zone = useRef<HTMLDivElement>(null);
    const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
    const [msg, setMsg] = useState('');

    useEffect(() => {
        let alive = true;
        let editor: any = null;
        (async () => {
            try {
                const token = localStorage.getItem('token');
                const r = await fetch(`/api/office-viewer/prepare?name=${encodeURIComponent(name)}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/octet-stream', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
                    body: blob,
                });
                if (!r.ok) {
                    const j = await r.json().catch(() => ({}));
                    throw new Error(r.status === 503 ? 'Visionneuse Office non configurée' : (j.message || `Erreur ${r.status}`));
                }
                const { sdk, config } = await r.json();
                await loadSdk(sdk);
                if (!alive || !zone.current) return;
                const host = document.createElement('div');
                host.id = `office-view-${Math.random().toString(36).slice(2)}`;
                host.style.width = '100%'; host.style.height = '100%';
                zone.current.appendChild(host);
                editor = new (window as any).DocsAPI.DocEditor(host.id, {
                    ...config,
                    events: {
                        onAppReady: () => alive && setState('ready'),
                        onError: (e: any) => { if (alive) { setMsg(e?.data?.errorDescription || 'Erreur du moteur Office'); setState('error'); } },
                    },
                });
                setState('ready');
            } catch (e: any) {
                if (alive) { setMsg(e?.message || "Impossible d'afficher ce document"); setState('error'); }
            }
        })();
        // Le moteur impose des curseurs personnalisés qui s'affichent invisibles : on force la flèche
        // (l'iframe est de même origine grâce au relais nginx /onlyoffice).
        const fixCursor = (win: Window, depth = 0) => {
            try {
                const d = win.document;
                if (!d.getElementById('av-cursor-fix')) {
                    const st = d.createElement('style');
                    st.id = 'av-cursor-fix';
                    st.textContent = '*, *::before, *::after { cursor: default !important; }';
                    d.head.appendChild(st);
                }
                if (depth < 3) Array.from(d.querySelectorAll('iframe')).forEach(f => f.contentWindow && fixCursor(f.contentWindow, depth + 1));
            } catch { /* iframe d'une autre origine */ }
        };
        const cursorTimer = window.setInterval(() => {
            if (zone.current) Array.from(zone.current.querySelectorAll('iframe')).forEach(f => f.contentWindow && fixCursor(f.contentWindow));
        }, 700);
        return () => {
            window.clearInterval(cursorTimer);
            alive = false;
            try { editor?.destroyEditor?.(); } catch { /* déjà détruit */ }
            if (zone.current) zone.current.innerHTML = '';
        };
    }, [blob, name]);

    return (
        <div style={{ flex: 1, position: 'relative', minWidth: 0, background: '#fff' }}>
            <div ref={zone} style={{ position: 'absolute', inset: 0 }} />
            {state === 'loading' && <div style={{ ...S.center, position: 'absolute', inset: 0, pointerEvents: 'none' }}>Chargement du document…</div>}
            {state === 'error' && (
                <div style={{ ...S.center, position: 'absolute', inset: 0, background: '#f3f4f6' }}>
                    <FileIcon size={64} color="#9ca3af" />
                    <div style={{ marginTop: 12, color: '#c53030' }}>{msg}</div>
                    <a href={downloadUrl} download={name} style={{ ...S.btn, marginTop: 16 }}><Download size={16} /> Télécharger {name}</a>
                </div>
            )}
        </div>
    );
}

/** Prévisualisation d'un e-mail (.msg/.eml) non stocké en GED : le blob est renvoyé
 * au backend (/api/documents/email-preview), qui le parse (msgreader OU mailparser)
 * et renvoie la structure normalisée affichée par EmailMessageView. */
function EmailFrame({ blob, name, downloadUrl }: { blob: Blob; name: string; downloadUrl: string }) {
    const [data, setData] = useState<EmailPreviewData | null>(null);
    const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
    const [msg, setMsg] = useState('');

    useEffect(() => {
        let alive = true;
        (async () => {
            try {
                const token = localStorage.getItem('token');
                const fd = new FormData();
                fd.append('file', blob, name);
                const r = await fetch(`/api/documents/email-preview?name=${encodeURIComponent(name)}`, {
                    method: 'POST',
                    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
                    body: fd,
                });
                if (!r.ok) {
                    const j = await r.json().catch(() => ({}));
                    throw new Error(j.error || `Erreur ${r.status}`);
                }
                const parsed = await r.json();
                if (alive) { setData(parsed); setState('ready'); }
            } catch (e: any) {
                if (alive) { setMsg(e?.message || 'Lecture du message impossible'); setState('error'); }
            }
        })();
        return () => { alive = false; };
    }, [blob, name]);

    const downloadAttachment = async (index: number) => {
        try {
            const token = localStorage.getItem('token');
            const fd = new FormData();
            fd.append('file', blob, name);
            const r = await fetch(`/api/documents/email-attachment?name=${encodeURIComponent(name)}&index=${index}`, {
                method: 'POST',
                headers: token ? { Authorization: `Bearer ${token}` } : undefined,
                body: fd,
            });
            if (!r.ok) throw new Error(`Erreur ${r.status}`);
            const url = URL.createObjectURL(await r.blob());
            const a = document.createElement('a');
            a.href = url;
            a.download = name.replace(/\.[^.]+$/, '') + `-pj-${index + 1}`;
            document.body.appendChild(a); a.click(); a.remove();
            setTimeout(() => URL.revokeObjectURL(url), 5000);
        } catch (e: any) { alert(e?.message || 'Téléchargement impossible'); }
    };

    return (
        <div style={{ flex: 1, minHeight: 0, display: 'flex', background: '#fff' }}>
            {state === 'loading' && <div style={S.center}>Lecture du message…</div>}
            {state === 'error' && (
                <div style={{ ...S.center, color: '#c53030' }}>
                    <FileIcon size={64} color="#9ca3af" />
                    <div style={{ marginTop: 12 }}>{msg}</div>
                    <a href={downloadUrl} download={name} style={{ ...S.btn, marginTop: 16 }}><Download size={16} /> Télécharger {name}</a>
                </div>
            )}
            {state === 'ready' && data && (
                <EmailMessageView data={data} accent="#6366f1" onAttachmentClick={downloadAttachment} />
            )}
        </div>
    );
}

function Viewer({ items, startIndex, onClose }: { items: ViewerItem[]; startIndex: number; onClose: () => void }) {
    const [index, setIndex] = useState(startIndex);
    const [loaded, setLoaded] = useState<Loaded | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const cache = useRef(new Map<string, Loaded>());
    const item = items[index];

    useEffect(() => {
        const map = cache.current;
        return () => { map.forEach(l => URL.revokeObjectURL(l.blobUrl)); map.clear(); };
    }, []);

    useEffect(() => {
        let cancelled = false;
        const url = inlineUrl(item.url);
        const hit = cache.current.get(url);
        if (hit) { setLoaded(hit); setError(null); setLoading(false); return; }
        setLoading(true); setError(null); setLoaded(null);
        (async () => {
            try {
                const token = localStorage.getItem('token');
                const res = await fetch(url, token ? { headers: { Authorization: `Bearer ${token}` } } : undefined);
                if (!res.ok) throw new Error(`Erreur ${res.status}`);
                const blob = await res.blob();
                const name = item.name || filenameFromDisposition(res.headers.get('content-disposition')) || 'Fichier';
                const realName = filenameFromDisposition(res.headers.get('content-disposition')) || name;
                const kind = detectKind(item.mime || blob.type, realName);
                let typed = blob;
                const ext = realName.toLowerCase().split('.').pop() || '';
                if ((!blob.type || blob.type === 'application/octet-stream') && EXT_MIME[ext]) typed = new Blob([blob], { type: EXT_MIME[ext] });
                const l: Loaded = { blobUrl: URL.createObjectURL(typed), kind, name: item.name || realName };
                if (kind === 'text') l.text = (await blob.slice(0, 500_000).text());
                if (kind === 'office' || kind === 'email') l.blob = blob;
                cache.current.set(url, l);
                if (!cancelled) { setLoaded(l); setLoading(false); }
            } catch (e: any) {
                if (!cancelled) { setError(e?.message || 'Impossible de charger le fichier'); setLoading(false); }
            }
        })();
        return () => { cancelled = true; };
    }, [item.url]);

    const prev = useCallback(() => setIndex(i => (i - 1 + items.length) % items.length), [items.length]);
    const next = useCallback(() => setIndex(i => (i + 1) % items.length), [items.length]);

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
            else if (e.key === 'ArrowLeft' && items.length > 1) prev();
            else if (e.key === 'ArrowRight' && items.length > 1) next();
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [onClose, prev, next, items.length]);

    const title = loaded?.name || item.name || 'Fichier';
    const dlUrl = item.url;
    const SideIcon = ({ n }: { n: string }) => /\.(png|jpe?g|gif|webp|svg|bmp)$/i.test(n) ? <ImageIcon size={14} /> : /\.pdf$/i.test(n) ? <FileText size={14} /> : <FileIcon size={14} />;

    return (
        <div style={S.backdrop} onClick={onClose}>
            <div style={S.modal} onClick={e => e.stopPropagation()}>
                <div style={S.header}>
                    <FileText size={18} color="#6366f1" />
                    <div style={S.title} title={title}>{title}</div>
                    {items.length > 1 && <span style={S.counter}>{index + 1} / {items.length}</span>}
                    <a href={dlUrl} download={title} style={S.btn} title="Télécharger"><Download size={14} /> Télécharger</a>
                    <a href={inlineUrl(item.url)} target="_blank" rel="noopener noreferrer" data-no-viewer style={S.btnGhost} title="Ouvrir dans un nouvel onglet"><ExternalLink size={14} /></a>
                    <button onClick={onClose} style={S.iconBtn} title="Fermer (Échap)"><X size={20} /></button>
                </div>
                <div style={S.body}>
                    {items.length > 1 && (
                        <div style={S.sidebar}>
                            {items.map((it, i) => (
                                <div key={it.url + i} onClick={() => setIndex(i)} style={{ ...S.sideItem, ...(i === index ? S.sideActive : {}) }} title={it.name}>
                                    <SideIcon n={it.name || it.url} />
                                    <span style={S.sideName}>{it.name || `Fichier ${i + 1}`}</span>
                                </div>
                            ))}
                        </div>
                    )}
                    <div style={S.stage}>
                        {items.length > 1 && <button onClick={prev} style={{ ...S.nav, left: 10 }} title="Précédent (←)"><ChevronLeft size={22} /></button>}
                        {items.length > 1 && <button onClick={next} style={{ ...S.nav, right: 10 }} title="Suivant (→)"><ChevronRight size={22} /></button>}
                        {loading && <div style={S.center}>Chargement…</div>}
                        {error && <div style={{ ...S.center, color: '#c53030' }}>{error}</div>}
                        {!loading && !error && loaded && loaded.kind === 'pdf' && <iframe src={loaded.blobUrl} title={title} style={S.frame} />}
                        {!loading && !error && loaded && loaded.kind === 'image' && <div style={S.imgWrap}><img src={loaded.blobUrl} alt={title} style={S.img} /></div>}
                        {!loading && !error && loaded && loaded.kind === 'video' && <video src={loaded.blobUrl} controls style={{ width: '100%', height: '100%', background: '#000' }} />}
                        {!loading && !error && loaded && loaded.kind === 'audio' && <div style={S.center}><audio src={loaded.blobUrl} controls /></div>}
                        {!loading && !error && loaded && loaded.kind === 'text' && <pre style={S.pre}>{loaded.text}</pre>}
                        {!loading && !error && loaded && loaded.kind === 'office' && loaded.blob && (
                            <OfficeFrame key={loaded.blobUrl} blob={loaded.blob} name={loaded.name} downloadUrl={dlUrl} />
                        )}
                        {!loading && !error && loaded && loaded.kind === 'email' && loaded.blob && (
                            <EmailFrame key={loaded.blobUrl} blob={loaded.blob} name={loaded.name} downloadUrl={dlUrl} />
                        )}
                        {!loading && !error && loaded && loaded.kind === 'none' && (
                            <div style={S.center}>
                                <FileIcon size={64} color="#9ca3af" />
                                <div style={{ marginTop: 12, color: '#6b7280' }}>Prévisualisation non disponible pour ce type de fichier.</div>
                                <a href={dlUrl} download={title} style={{ ...S.btn, marginTop: 16 }}><Download size={16} /> Télécharger {title}</a>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}

export function AttachmentViewerProvider({ children }: { children: React.ReactNode }) {
    const [state, setState] = useState<{ items: ViewerItem[]; index: number } | null>(null);

    useEffect(() => {
        const onOpen = (e: Event) => {
            const d = (e as CustomEvent).detail;
            if (d?.items?.length) setState({ items: d.items, index: Math.min(Math.max(d.index || 0, 0), d.items.length - 1) });
        };
        const onClick = (e: MouseEvent) => {
            if (e.defaultPrevented || e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
            const a = (e.target as HTMLElement | null)?.closest?.('a') as HTMLAnchorElement | null;
            if (!a || a.target !== '_blank' || a.hasAttribute('download') || a.hasAttribute('data-no-viewer') || !isFileHref(a)) return;
            e.preventDefault();
            e.stopPropagation();
            setState(collectGroup(a));
        };
        window.addEventListener(OPEN_EVENT, onOpen);
        document.addEventListener('click', onClick, true);
        return () => { window.removeEventListener(OPEN_EVENT, onOpen); document.removeEventListener('click', onClick, true); };
    }, []);

    const value = useMemo(() => ({ open: openAttachmentViewer }), []);

    return (
        <Ctx.Provider value={value}>
            {children}
            {state && <Viewer items={state.items} startIndex={state.index} onClose={() => setState(null)} />}
        </Ctx.Provider>
    );
}

const S: Record<string, React.CSSProperties> = {
    backdrop: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 20000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 },
    modal: { width: '95vw', maxWidth: 1300, height: '92vh', background: '#fff', borderRadius: 12, display: 'flex', flexDirection: 'column', boxShadow: '0 20px 60px rgba(0,0,0,0.35)', overflow: 'hidden' },
    header: { padding: '10px 16px', borderBottom: '1px solid #e5e7eb', display: 'flex', alignItems: 'center', gap: 10 },
    title: { flex: 1, minWidth: 0, fontSize: 15, fontWeight: 600, color: '#1f2937', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
    counter: { fontSize: 12, color: '#6b7280', background: '#f3f4f6', borderRadius: 10, padding: '2px 8px' },
    btn: { display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, background: '#6366f1', color: '#fff', padding: '6px 12px', borderRadius: 6, textDecoration: 'none', fontWeight: 500 },
    btnGhost: { display: 'inline-flex', alignItems: 'center', color: '#6b7280', padding: 6, borderRadius: 6, border: '1px solid #e5e7eb', textDecoration: 'none' },
    iconBtn: { background: 'transparent', border: 'none', cursor: 'pointer', padding: 6, borderRadius: 6, color: '#6b7280' },
    body: { display: 'flex', flex: 1, minHeight: 0 },
    sidebar: { width: 230, borderRight: '1px solid #e5e7eb', background: '#f9fafb', overflowY: 'auto', flexShrink: 0 },
    sideItem: { display: 'flex', alignItems: 'center', gap: 8, padding: '9px 12px', fontSize: 12, color: '#374151', cursor: 'pointer', borderBottom: '1px solid #f3f4f6', borderLeft: '3px solid transparent' },
    sideActive: { background: '#eef2ff', borderLeft: '3px solid #6366f1', fontWeight: 600 },
    sideName: { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
    stage: { flex: 1, position: 'relative', background: '#f3f4f6', display: 'flex', minWidth: 0 },
    nav: { position: 'absolute', top: '50%', transform: 'translateY(-50%)', zIndex: 2, width: 36, height: 36, borderRadius: '50%', border: 'none', background: 'rgba(17,24,39,0.55)', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' },
    frame: { width: '100%', height: '100%', border: 'none', background: '#fff' },
    imgWrap: { width: '100%', height: '100%', overflow: 'auto', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 },
    img: { maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' },
    pre: { margin: 0, padding: 16, flex: 1, overflow: 'auto', background: '#fff', fontSize: 12, whiteSpace: 'pre-wrap' },
    center: { flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: 40, color: '#6b7280' },
};
