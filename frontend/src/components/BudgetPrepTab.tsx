import React, { useEffect, useMemo, useState, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Upload, Trash2, RefreshCw, TrendingUp, FileSpreadsheet, X, ChevronRight, ChevronDown } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

interface Facet {
    services: { service_code: string; service_label: string }[];
    budgets: string[];
    chapitres: { chapitre_code: string; chapitre_libelle: string }[];
    fonctions: { fonction_code: string; fonction_libelle: string }[];
    articles: { article_code: string; article_libelle: string }[];
    depensesRecettes: string[];
}

interface Column {
    key: string;
    type: 'vote' | 'demande' | 'realise';
    year: number;
}

interface Row {
    fonction_code: string;
    fonction_libelle: string;
    article_code: string;
    article_libelle: string;
    values: Record<string, number>;
}

interface ArticleGroup {
    article_code: string;
    article_libelle: string;
    values: Record<string, number>;
    children: Row[];
}

interface ImportRow {
    id: number;
    filename: string;
    service_code: string;
    service_label: string;
    direction_label: string;
    proposition_year: number;
    row_count: number;
    imported_by: string;
    imported_at: string;
}

const typeLabel = (type: string) => type === 'vote' ? 'Voté' : type === 'demande' ? 'Demandé' : 'Réalisé';

const fmt = (n: number | undefined) => {
    if (n === undefined || n === null) return '';
    return new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 }).format(n);
};

const BudgetPrepTab: React.FC = () => {
    const { token, user } = useAuth();
    const canManage = ['superadmin', 'admin', 'finances', 'compta'].includes((user as any)?.role);

    const [facets, setFacets] = useState<Facet | null>(null);
    const [columns, setColumns] = useState<Column[]>([]);
    const [rows, setRows] = useState<Row[]>([]);
    const [totals, setTotals] = useState<Record<string, number>>({});
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const [serviceFilter, setServiceFilter] = useState('');
    const [budgetFilter, setBudgetFilter] = useState('');
    const [chapitreFilter, setChapitreFilter] = useState('');
    const [fonctionFilter, setFonctionFilter] = useState('');
    const [articleFilter, setArticleFilter] = useState('');
    const [depRecFilter, setDepRecFilter] = useState('');
    const [search, setSearch] = useState('');
    const [showRealise, setShowRealise] = useState(false);

    const [showImportPanel, setShowImportPanel] = useState(false);
    const [imports, setImports] = useState<ImportRow[]>([]);
    const [uploading, setUploading] = useState(false);
    const [uploadMessages, setUploadMessages] = useState<string[]>([]);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const fetchFacets = async () => {
        try {
            const res = await fetch('/api/budget-prep/facets', { headers: { Authorization: `Bearer ${token}` } });
            if (res.ok) setFacets(await res.json());
        } catch (e) { console.error(e); }
    };

    const fetchImports = async () => {
        try {
            const res = await fetch('/api/budget-prep/imports', { headers: { Authorization: `Bearer ${token}` } });
            if (res.ok) setImports(await res.json());
        } catch (e) { console.error(e); }
    };

    const fetchData = async () => {
        setLoading(true);
        setError('');
        try {
            const params = new URLSearchParams();
            if (serviceFilter) params.append('service_code', serviceFilter);
            if (budgetFilter) params.append('budget', budgetFilter);
            if (chapitreFilter) params.append('chapitre_code', chapitreFilter);
            if (fonctionFilter) params.append('fonction_code', fonctionFilter);
            if (articleFilter) params.append('article_code', articleFilter);
            if (depRecFilter) params.append('depenses_recettes', depRecFilter);
            if (search.trim()) params.append('search', search.trim());

            const res = await fetch(`/api/budget-prep/data?${params.toString()}`, { headers: { Authorization: `Bearer ${token}` } });
            if (!res.ok) {
                const errBody = await res.json().catch(() => ({}));
                throw new Error(errBody.error || 'Erreur de chargement');
            }
            const json = await res.json();
            setColumns(json.columns || []);
            setRows(json.rows || []);
            setTotals(json.totals || {});
        } catch (e: any) {
            setError(e.message || 'Erreur de chargement');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { fetchFacets(); fetchImports(); }, [token]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    useEffect(() => { fetchData(); }, [token, serviceFilter, budgetFilter, chapitreFilter, fonctionFilter, articleFilter, depRecFilter, search]);

    const visibleColumns = useMemo(() => showRealise ? columns : columns.filter(c => c.type !== 'realise'), [columns, showRealise]);

    const chartData = useMemo(() => {
        return visibleColumns.map(c => ({
            name: `${typeLabel(c.type)} ${c.year}`,
            montant: totals[c.key] || 0
        }));
    }, [visibleColumns, totals]);

    // Regroupement par nature (article) : les fonctions sont dépliables au sein de chaque nature
    const [expandedArticles, setExpandedArticles] = useState<Set<string>>(new Set());

    const groupedByArticle = useMemo(() => {
        const map = new Map<string, ArticleGroup>();
        for (const row of rows) {
            const key = row.article_code || '(sans nature)';
            if (!map.has(key)) {
                map.set(key, { article_code: row.article_code, article_libelle: row.article_libelle, values: {}, children: [] });
            }
            const g = map.get(key)!;
            g.children.push(row);
            for (const [k, v] of Object.entries(row.values)) {
                g.values[k] = (g.values[k] || 0) + (v || 0);
            }
        }
        return Array.from(map.values()).sort((a, b) => a.article_code.localeCompare(b.article_code));
    }, [rows]);

    const toggleArticle = (code: string) => {
        setExpandedArticles(prev => {
            const next = new Set(prev);
            if (next.has(code)) next.delete(code); else next.add(code);
            return next;
        });
    };

    const resetFilters = () => {
        setServiceFilter(''); setBudgetFilter(''); setChapitreFilter('');
        setFonctionFilter(''); setArticleFilter(''); setDepRecFilter(''); setSearch('');
    };

    const handleFilesSelected = async (files: FileList | null) => {
        if (!files || files.length === 0) return;
        setUploading(true);
        setUploadMessages([]);
        const messages: string[] = [];
        for (const file of Array.from(files)) {
            try {
                const fd = new FormData();
                fd.append('file', file);
                const res = await fetch('/api/budget-prep/import', {
                    method: 'POST',
                    headers: { Authorization: `Bearer ${token}` },
                    body: fd
                });
                const json = await res.json();
                if (!res.ok) throw new Error(json.error || 'Erreur');
                messages.push(`✔ ${file.name} : ${json.rows_imported} lignes importées (${json.service_code}, ${json.year})`);
            } catch (e: any) {
                messages.push(`✘ ${file.name} : ${e.message || 'échec import'}`);
            }
        }
        setUploadMessages(messages);
        setUploading(false);
        fetchImports();
        fetchFacets();
        fetchData();
        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    const handleDeleteImport = async (id: number) => {
        if (!window.confirm('Supprimer cet import et toutes ses données ?')) return;
        try {
            await fetch(`/api/budget-prep/imports/${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
            fetchImports();
            fetchFacets();
            fetchData();
        } catch (e) { console.error(e); }
    };

    return (
        <div className="budget-prep-container">
            <div className="prep-header">
                <div className="header-info">
                    <h2 className="section-title">
                        <TrendingUp size={22} />
                        Préparation budgétaire
                    </h2>
                    <p className="section-desc">
                        Évolution des imputations (fonction / article) entre les montants votés et les propositions, tous services (BF1, BF6, BF8, BF9).
                    </p>
                </div>
                {canManage && (
                    <button className="toolbar-btn" onClick={() => setShowImportPanel(v => !v)}>
                        <Upload size={16} /> Importer des fichiers
                    </button>
                )}
            </div>

            {showImportPanel && canManage && (
                <div className="import-panel">
                    <div className="import-panel-header">
                        <h3><FileSpreadsheet size={18} /> Import des fichiers de préparation budgétaire</h3>
                        <button className="icon-btn" onClick={() => setShowImportPanel(false)}><X size={16} /></button>
                    </div>
                    <p className="import-hint">
                        Sélectionnez un ou plusieurs fichiers Excel (ex : "BP 2027_BF1.xlsx"). Le service (BF1/BF6/BF8/BF9) et l'année
                        sont détectés automatiquement depuis le nom du fichier. Un import remplace l'import précédent du même service pour la même année.
                    </p>
                    <input
                        ref={fileInputRef}
                        type="file"
                        accept=".xlsx,.xls"
                        multiple
                        disabled={uploading}
                        onChange={(e) => handleFilesSelected(e.target.files)}
                    />
                    {uploading && <div className="uploading-msg"><RefreshCw size={14} className="spin" /> Import en cours...</div>}
                    {uploadMessages.length > 0 && (
                        <ul className="upload-results">
                            {uploadMessages.map((m, i) => <li key={i}>{m}</li>)}
                        </ul>
                    )}

                    <table className="imports-table">
                        <thead>
                            <tr>
                                <th>Fichier</th><th>Service</th><th>Libellé service</th><th>Année</th><th>Lignes</th><th>Importé le</th><th></th>
                            </tr>
                        </thead>
                        <tbody>
                            {imports.map(imp => (
                                <tr key={imp.id}>
                                    <td>{imp.filename}</td>
                                    <td>{imp.service_code}</td>
                                    <td>{imp.service_label}</td>
                                    <td>{imp.proposition_year}</td>
                                    <td>{imp.row_count}</td>
                                    <td>{imp.imported_at ? new Date(imp.imported_at).toLocaleString('fr-FR') : ''}</td>
                                    <td>
                                        <button className="icon-btn danger" onClick={() => handleDeleteImport(imp.id)}>
                                            <Trash2 size={14} />
                                        </button>
                                    </td>
                                </tr>
                            ))}
                            {imports.length === 0 && (
                                <tr><td colSpan={7} className="empty-state">Aucun fichier importé pour le moment.</td></tr>
                            )}
                        </tbody>
                    </table>
                </div>
            )}

            <div className="prep-filters">
                <select className="filter-select" value={serviceFilter} onChange={e => setServiceFilter(e.target.value)}>
                    <option value="">Tous les services</option>
                    {facets?.services.map(s => (
                        <option key={s.service_code} value={s.service_code}>{s.service_code} — {s.service_label}</option>
                    ))}
                </select>
                <select className="filter-select" value={budgetFilter} onChange={e => setBudgetFilter(e.target.value)}>
                    <option value="">Tous les budgets</option>
                    {facets?.budgets.map(b => <option key={b} value={b}>{b}</option>)}
                </select>
                <select className="filter-select" value={depRecFilter} onChange={e => setDepRecFilter(e.target.value)}>
                    <option value="">Dépenses / Recettes</option>
                    {facets?.depensesRecettes.map(d => <option key={d} value={d}>{d === 'D' ? 'Dépenses' : d === 'R' ? 'Recettes' : d}</option>)}
                </select>
                <select className="filter-select" value={chapitreFilter} onChange={e => setChapitreFilter(e.target.value)}>
                    <option value="">Tous les chapitres</option>
                    {facets?.chapitres.map(c => <option key={c.chapitre_code} value={c.chapitre_code}>{c.chapitre_code} — {c.chapitre_libelle}</option>)}
                </select>
                <select className="filter-select" value={fonctionFilter} onChange={e => setFonctionFilter(e.target.value)}>
                    <option value="">Toutes les fonctions</option>
                    {facets?.fonctions.map(f => <option key={f.fonction_code} value={f.fonction_code}>{f.fonction_code} — {f.fonction_libelle}</option>)}
                </select>
                <select className="filter-select" value={articleFilter} onChange={e => setArticleFilter(e.target.value)}>
                    <option value="">Tous les articles</option>
                    {facets?.articles.map(a => <option key={a.article_code} value={a.article_code}>{a.article_code} — {a.article_libelle}</option>)}
                </select>
                <input
                    className="prep-search"
                    type="text"
                    placeholder="Rechercher un libellé..."
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                />
                <label className="realise-toggle">
                    <input type="checkbox" checked={showRealise} onChange={e => setShowRealise(e.target.checked)} />
                    Afficher le réalisé
                </label>
                <button className="toolbar-btn" onClick={resetFilters}>Réinitialiser</button>
            </div>

            {error && <div className="alert alert-error">{error}</div>}

            <div className="table-card">
                <div className="table-responsive">
                    <table className="modern-table prep-table">
                        <thead>
                            <tr>
                                <th>Nature (article)</th>
                                <th>Fonction</th>
                                {visibleColumns.map(c => (
                                    <th key={c.key} className={`col-${c.type}`}>{typeLabel(c.type)} {c.year}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {groupedByArticle.length === 0 && !loading && (
                                <tr><td colSpan={2 + visibleColumns.length} className="empty-state">Aucune imputation ne correspond à vos critères.</td></tr>
                            )}
                            {groupedByArticle.map(group => {
                                const expanded = expandedArticles.has(group.article_code);
                                return (
                                    <React.Fragment key={group.article_code}>
                                        <tr className="article-row" onClick={() => toggleArticle(group.article_code)}>
                                            <td className="article-cell">
                                                {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                                                <strong>{group.article_code}</strong>
                                                {group.article_libelle && <span className="lib">— {group.article_libelle}</span>}
                                            </td>
                                            <td className="muted">{group.children.length} fonction{group.children.length > 1 ? 's' : ''}</td>
                                            {visibleColumns.map(c => (
                                                <td key={c.key} className={`col-${c.type} num`}><strong>{fmt(group.values[c.key])}</strong></td>
                                            ))}
                                        </tr>
                                        {expanded && group.children.map(child => (
                                            <tr key={`${group.article_code}-${child.fonction_code}`} className="fonction-row">
                                                <td></td>
                                                <td>{child.fonction_code} {child.fonction_libelle && <span className="lib">— {child.fonction_libelle}</span>}</td>
                                                {visibleColumns.map(c => (
                                                    <td key={c.key} className={`col-${c.type} num`}>{fmt(child.values[c.key])}</td>
                                                ))}
                                            </tr>
                                        ))}
                                    </React.Fragment>
                                );
                            })}
                        </tbody>
                        <tfoot>
                            <tr>
                                <td colSpan={2}><strong>Total</strong></td>
                                {visibleColumns.map(c => (
                                    <td key={c.key} className={`col-${c.type} num`}><strong>{fmt(totals[c.key])}</strong></td>
                                ))}
                            </tr>
                        </tfoot>
                    </table>
                </div>
            </div>

            <div className="prep-chart-card">
                <h3 className="chart-title">Évolution du total (selon filtres appliqués)</h3>
                <ResponsiveContainer width="100%" height={340}>
                    <BarChart data={chartData} margin={{ top: 10, right: 20, left: 10, bottom: 10 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                        <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                        <YAxis tickFormatter={(v) => fmt(v)} width={90} />
                        <Tooltip formatter={(v: any) => fmt(Number(v)) + ' €'} />
                        <Legend />
                        <Bar dataKey="montant" name="Montant (€)" fill="#003366" radius={[4, 4, 0, 0]} />
                    </BarChart>
                </ResponsiveContainer>
            </div>

            <style>{`
                .budget-prep-container { display: flex; flex-direction: column; gap: 1.5rem; }
                .prep-header { display: flex; justify-content: space-between; align-items: flex-start; gap: 1rem; flex-wrap: wrap; }
                .section-title { display: flex; align-items: center; gap: 0.75rem; margin: 0; color: #003366; font-size: 1.25rem; font-weight: 800; }
                .section-desc { color: #64748b; margin: 0.25rem 0 0 0; font-size: 0.9rem; max-width: 60ch; }

                .import-panel { background: white; border: 1px solid var(--color-slate-200); border-radius: 1rem; padding: 1.25rem; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05); }
                .import-panel-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem; }
                .import-panel-header h3 { display: flex; align-items: center; gap: 0.5rem; margin: 0; font-size: 1rem; color: #1e293b; }
                .import-hint { color: #64748b; font-size: 0.85rem; margin: 0.25rem 0 1rem 0; }
                .icon-btn { background: transparent; border: none; cursor: pointer; padding: 0.25rem; border-radius: 0.375rem; color: #64748b; }
                .icon-btn:hover { background: var(--color-slate-100); }
                .icon-btn.danger { color: #dc2626; }
                .uploading-msg { display: flex; align-items: center; gap: 0.5rem; margin-top: 0.75rem; color: #003366; font-size: 0.85rem; }
                .spin { animation: prep-spin 1s linear infinite; }
                @keyframes prep-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
                .upload-results { margin: 0.75rem 0 0 0; padding: 0; list-style: none; font-size: 0.85rem; }
                .upload-results li { padding: 0.25rem 0; }
                .imports-table { width: 100%; border-collapse: collapse; margin-top: 1rem; font-size: 0.85rem; }
                .imports-table th, .imports-table td { padding: 0.5rem 0.75rem; border-bottom: 1px solid var(--color-slate-100); text-align: left; }

                .prep-filters { display: flex; flex-wrap: wrap; gap: 0.5rem; align-items: center; background: white; padding: 0.75rem; border-radius: 0.75rem; border: 1px solid var(--color-slate-200); }
                .prep-filters .filter-select { border: 1px solid var(--color-slate-200); border-radius: 0.5rem; padding: 0.4rem 0.5rem; background: white; }
                .prep-search { border: 1px solid var(--color-slate-200); border-radius: 0.5rem; padding: 0.4rem 0.6rem; font-size: 0.85rem; min-width: 180px; }
                .realise-toggle { display: flex; align-items: center; gap: 0.4rem; font-size: 0.85rem; color: #475569; white-space: nowrap; }

                .prep-table th.col-vote, .prep-table td.col-vote { background: #eef2ff; }
                .prep-table th.col-demande, .prep-table td.col-demande { background: #fff7ed; }
                .prep-table th.col-realise, .prep-table td.col-realise { background: #f0fdf4; }
                .prep-table td.num { text-align: right; font-variant-numeric: tabular-nums; }
                .prep-table .lib { color: #94a3b8; font-weight: 400; margin-left: 0.35rem; }
                .prep-table .article-row { cursor: pointer; background: #f8fafc; }
                .prep-table .article-row:hover { background: #f1f5f9; }
                .prep-table .article-cell { display: flex; align-items: center; gap: 0.35rem; }
                .prep-table .muted { color: #94a3b8; font-size: 0.8rem; }
                .prep-table .fonction-row td:nth-child(2) { padding-left: 1.75rem; }
                .prep-table tfoot td { position: sticky; bottom: 0; background: #f8fafc; box-shadow: 0 -1px 0 var(--color-slate-200); z-index: 2; }

                .prep-chart-card { background: white; border: 1px solid var(--color-slate-200); border-radius: 1rem; padding: 1.25rem; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05); }
                .chart-title { margin: 0 0 1rem 0; font-size: 1rem; color: #1e293b; }
                .alert-error { background: #fef2f2; color: #b91c1c; padding: 0.75rem 1rem; border-radius: 0.5rem; border: 1px solid #fecaca; }
            `}</style>
        </div>
    );
};

export default BudgetPrepTab;
