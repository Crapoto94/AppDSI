import React, { useState, useEffect, useMemo, useRef } from 'react';
import Header from '../components/Header';
import { 
  Upload, CheckCircle, Search, Filter, BookOpen, X, Eye, 
  Euro, FileText, ShoppingCart, AlertCircle, 
  Plus, Trash2, Send, ExternalLink, Columns, Palette, ChevronRight, ChevronDown
} from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import BudgetManagementTab from '../components/BudgetManagementTab';
import MappedDataTable from '../components/MappedDataTable';
import { useAuth } from '../contexts/AuthContext';

const Budget: React.FC = () => {
  const { token, user } = useAuth();
  const currentUser = user || { role: 'user', username: '', service_code: undefined, service_complement: undefined, id: 0 };

  const SockIcon = ({ size = 24, color = 'currentColor' }) => (
    <svg 
      width={size} 
      height={size} 
      viewBox="0 0 64 64" 
      fill={color}
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* Chaussette arrière */}
      <path d="M38,5 L58,15 L51,35 C49,42 53,48 59,51 L64,54 C70,57 67,64 60,64 L42,63 C36,62 32,57 30,51 L27,30 L38,5 Z" opacity="0.4" />
      {/* Chaussette avant */}
      <path d="M12,18 L32,28 L25,48 C23,55 27,61 33,64 L39,67 C45,70 42,77 35,77 L17,76 C11,75 7,70 5,64 L0,43 L12,18 Z" transform="translate(2,-4)" />
      {/* Rayures blanches sur la chaussette avant */}
      <g transform="translate(2,-4)" stroke="white" strokeWidth="1.5" strokeLinecap="round">
        <path d="M18,25 L28,30" />
        <path d="M19.5,28.5 L29.5,33.5" />
        <path d="M21,32 L31,37" />
        {/* Détail du talon */}
        <path d="M10,55 C7,62 10,68 18,70" fill="none" opacity="0.5" />
      </g>
    </svg>
  );

  const [view, setView] = useState<'summary' | 'lines' | 'invoices' | 'orders' | 'tiers' | 'operations' | 'gestion'>('summary');
  const [isRaw, setIsRaw] = useState(false);
  const [rawData, setRawData] = useState<any[]>([]);
  const [budgetLines, setBudgetLines] = useState<any[]>([]);
  const [invoices, setInvoices] = useState<any[]>([]);
  const [orders, setOrders] = useState<any[]>([]);
  const [operations, setOperations] = useState<any[]>([]);
  const [m57Plan, setM57Plan] = useState<any[]>([]);
  const [urlSedit, setUrlSedit] = useState<string>('https://seditgfprod.ivry.local/SeditGfSMProd');
  const [budgetPrincipal, setBudgetPrincipal] = useState<string>('Ville');
  
  const [showM57, setShowM57] = useState(false);
  const [showZeroBudget, setShowZeroBudget] = useState(false);
  const [message, setMessage] = useState('');
  
  // New state for fiscal year and budget scope
  const currentYear = new Date().getFullYear();
  const [currentFiscalYear, setCurrentFiscalYear] = useState(currentYear);
  const [budgetScope, setBudgetScope] = useState<'Ville' | 'All'>('Ville'); // Default to 'Ville'
  
  const [searchTerm, setSearchTerm] = useState('');
  const [sectionFilter, setSectionFilter] = useState('all');
  const [sortConfig, setSortConfig] = useState<{ key: string, direction: 'asc' | 'desc' } | null>(null);

  useEffect(() => {
    if (view === 'invoices') {
      setSortConfig({ key: 'Arrivée', direction: 'desc' });
    } else {
      setSortConfig(null);
    }
  }, [view]);

  const [columnFilters, setColumnFilters] = useState<Record<string, string>>(() => {
    const filters: Record<string, string> = {};
    if (!['admin', 'finances'].includes(currentUser.role)) {
      if (view === 'orders' || view === 'operations') {
        const u = currentUser as any;
        if (u.service_code) {
          const serviceKey = view === 'orders' ? 'Service émetteur' : 'Service';
          filters[serviceKey] = u.service_code;
        }
        if (u.service_complement) {
          const complementKey = view === 'orders' ? 'Service complément' : 'Service Complément';
          filters[complementKey] = u.service_complement;
        }
      }
    }
    return filters;
  });
  
  // Attachments state
  const [showAttachments, setShowAttachments] = useState(false);
  const [activeAttachmentTarget, setActiveAttachmentTarget] = useState<{type: 'order' | 'invoice', id: string} | null>(null);
  const [currentAttachments, setCurrentAttachments] = useState<any[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  
  const [availableFiscalYears, setAvailableFiscalYears] = useState<number[]>([]);

  // Column selector state
  const [showColumnSelector, setShowColumnSelector] = useState(false);
  const DEFAULT_ORDER_COLUMNS = ['N° Commande', 'Libellé', 'Date de la commande', 'Budget', 'Service émetteur', 'Section', 'Montant HT', 'Montant TTC', 'Nb lignes'];
  const DEFAULT_INVOICE_COLUMNS = ['N° Facture interne', 'N° Facture fournisseur', 'Libellé', 'Fournisseur', 'Arrivée', 'Échéance', 'Montant TTC', 'Budget', 'Etat'];
  const DEFAULT_OP_COLUMNS = ['LIBELLE', 'Service', 'Section', 'C. Nature', 'Montant prévu', 'used_amount', 'Terminé'];

  const getStoredColumns = (viewKey: string, defaults: string[]) => {
    try {
      const stored = localStorage.getItem(`budgetCols_${viewKey}`);
      let cols = stored ? JSON.parse(stored) : defaults;

      // Migrate lowercase 'section' to uppercase 'Section'
      if (cols.includes('section')) {
        cols = cols.map((c: string) => c === 'section' ? 'Section' : c);
        localStorage.setItem(`budgetCols_${viewKey}`, JSON.stringify(cols));
      }

      // Ensure 'Section' is in orders columns if it's missing
      if (viewKey === 'orders' && !cols.includes('Section')) {
        const idx = cols.indexOf('Service émetteur');
        if (idx !== -1) {
          cols.splice(idx + 1, 0, 'Section');
        } else {
          cols.push('Section');
        }
        localStorage.setItem(`budgetCols_${viewKey}`, JSON.stringify(cols));
      }

      return cols;
    } catch { return defaults; }
  };
  const setStoredColumns = (viewKey: string, cols: string[]) => {
    localStorage.setItem(`budgetCols_${viewKey}`, JSON.stringify(cols));
  };

  const [orderColumns, setOrderColumns] = useState<string[]>(() => getStoredColumns('orders', DEFAULT_ORDER_COLUMNS));
  const [invoiceColumns, setInvoiceColumns] = useState<string[]>(() => getStoredColumns('invoices', DEFAULT_INVOICE_COLUMNS));
  const [opColumns, setOpColumns] = useState<string[]>(() => getStoredColumns('operations', DEFAULT_OP_COLUMNS));

  useEffect(() => {
    let cols = orderColumns;

    if (!cols.includes('Section') && !cols.includes('section')) {
      const idx = cols.indexOf('Service émetteur');
      const newCols = [...cols];
      if (idx !== -1) {
        newCols.splice(idx + 1, 0, 'Section');
      } else {
        newCols.push('Section');
      }
      setOrderColumns(newCols);
      setStoredColumns('orders', newCols);
    }
  }, [orderColumns, setOrderColumns]);

  interface ColumnStyle { bold: boolean; color: string; }
  type ColumnStyles = Record<string, ColumnStyle>;
  const getStoredColumnStyles = (viewKey: string): ColumnStyles => {
    try {
      const stored = localStorage.getItem(`budgetColStyles_${viewKey}`);
      return stored ? JSON.parse(stored) : {};
    } catch { return {}; }
  };
  const setStoredColumnStyles = (viewKey: string, styles: ColumnStyles) => {
    localStorage.setItem(`budgetColStyles_${viewKey}`, JSON.stringify(styles));
  };

  const [orderColumnStyles, setOrderColumnStyles] = useState<ColumnStyles>(() => getStoredColumnStyles('orders'));
  const [invoiceColumnStyles, setInvoiceColumnStyles] = useState<ColumnStyles>(() => getStoredColumnStyles('invoices'));
  const [opColumnStyles, setOpColumnStyles] = useState<ColumnStyles>(() => getStoredColumnStyles('operations'));
  const [tierColumnStyles, setTierColumnStyles] = useState<ColumnStyles>(() => getStoredColumnStyles('tiers'));

  const getColumnStyle = (col: string): ColumnStyle | null => {
    const styles = view === 'orders' ? orderColumnStyles : view === 'invoices' ? invoiceColumnStyles : view === 'operations' ? opColumnStyles : tierColumnStyles;
    return styles[col] || null;
  };
  const setColumnStyle = (col: string, style: ColumnStyle) => {
    if (view === 'orders') {
      const next = { ...orderColumnStyles, [col]: style };
      setOrderColumnStyles(next);
      setStoredColumnStyles('orders', next);
    } else if (view === 'invoices') {
      const next = { ...invoiceColumnStyles, [col]: style };
      setInvoiceColumnStyles(next);
      setStoredColumnStyles('invoices', next);
    } else if (view === 'operations') {
      const next = { ...opColumnStyles, [col]: style };
      setOpColumnStyles(next);
      setStoredColumnStyles('operations', next);
    } else {
      const next = { ...tierColumnStyles, [col]: style };
      setTierColumnStyles(next);
      setStoredColumnStyles('tiers', next);
    }
  };
  const removeColumnStyle = (col: string) => {
    if (view === 'orders') {
      const next = { ...orderColumnStyles }; delete next[col];
      setOrderColumnStyles(next);
      setStoredColumnStyles('orders', next);
    } else if (view === 'invoices') {
      const next = { ...invoiceColumnStyles }; delete next[col];
      setInvoiceColumnStyles(next);
      setStoredColumnStyles('invoices', next);
    } else if (view === 'operations') {
      const next = { ...opColumnStyles }; delete next[col];
      setOpColumnStyles(next);
      setStoredColumnStyles('operations', next);
    } else {
      const next = { ...tierColumnStyles }; delete next[col];
      setTierColumnStyles(next);
      setStoredColumnStyles('tiers', next);
    }
  };

  const [dragCol, setDragCol] = useState<string | null>(null);
  const [dragOverCol, setDragOverCol] = useState<string | null>(null);
  const [colorPickerCol, setColorPickerCol] = useState<string | null>(null);

  const [mappedColumns, setMappedColumns] = useState<Record<string, string[]>>({});
  const colsInited = useRef<Record<string, boolean>>({});

  useEffect(() => {
    const sync = (rubrique: string, stateCols: string[], setter: (cols: string[]) => void, storageKey: string) => {
      const mapped = mappedColumns[rubrique];
      if (!mapped || mapped.length === 0 || colsInited.current[rubrique]) return;
      const hasMatch = stateCols.some(c => mapped.includes(c));
      if (!hasMatch) {
        setter(mapped);
        setStoredColumns(storageKey, mapped);
      }
      colsInited.current[rubrique] = true;
    };
    sync('Commandes', orderColumns, setOrderColumns, 'orders');
    sync('Factures', invoiceColumns, setInvoiceColumns, 'invoices');
    sync('Opérations', opColumns, setOpColumns, 'operations');
  }, [mappedColumns]);

  // New state for import modal
  const [showImportModal, setShowImportModal] = useState(false);
  const [pendingImportFile, setPendingImportFile] = useState<File | null>(null);
  // @ts-ignore - setPendingImportType is used in a pending feature or might be triggered by external logic
  const [pendingImportType, setPendingImportType] = useState<'' | 'lines' | 'invoices' | 'orders'>('');
  const [availableBudgets, setAvailableBudgets] = useState<any[]>([]);
  const [selectedBudgetId, setSelectedBudgetId] = useState<number | ''>('');
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());

  useEffect(() => {
    const fetchBudgets = async () => {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);

        const res = await fetch('/api/budgets', {
          headers: { 'Authorization': `Bearer ${token}` },
          signal: controller.signal
        });
        clearTimeout(timeoutId);

        if (res.ok) {
          const data = await res.json();
          setAvailableBudgets(data);
        }
      } catch (e) {
        // Silently fail if timeout or error - don't block the page
      }
    };

    if (token) fetchBudgets();
  }, [token]);

  useEffect(() => {
    if (!token) return;

    const fetchFiscalYears = async () => {
      try {
        const rubriqueName = view === 'orders' ? 'Commandes' : view === 'invoices' ? 'Factures' : view === 'tiers' ? 'Tiers' : null;
        let data: number[] = [];

        if (rubriqueName) {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 5000);

          const res = await fetch(`/api/finance/field-mapping/years/${encodeURIComponent(rubriqueName)}`, {
            headers: { 'Authorization': `Bearer ${token}` },
            signal: controller.signal
          });
          clearTimeout(timeoutId);

          if (res.ok) data = await res.json();
        } else if (view === 'summary') {
          // For summary, get years from all rubriques
          const rubriques = ['Commandes', 'Factures', 'Tiers'];
          const allYears = new Set<number>();

          for (const rubrique of rubriques) {
            try {
              const controller = new AbortController();
              const timeoutId = setTimeout(() => controller.abort(), 5000);

              const res = await fetch(`/api/finance/field-mapping/years/${encodeURIComponent(rubrique)}`, {
                headers: { 'Authorization': `Bearer ${token}` },
                signal: controller.signal
              });
              clearTimeout(timeoutId);

              if (res.ok) {
                const years = await res.json();
                years.forEach((y: number) => allYears.add(y));
              }
            } catch (e) {
              // Silently continue if one rubrique fails
            }
          }

          data = Array.from(allYears).sort((a, b) => b - a);
        }

        console.log('[fetchFiscalYears] view:', view, 'years:', data);
        setAvailableFiscalYears(data);
        if (data.length > 0 && !data.includes(currentFiscalYear)) {
          setCurrentFiscalYear(data[0]);
        }
      } catch (e) {
        console.error('[fetchFiscalYears] error:', e);
      }
    };
    fetchFiscalYears();
  }, [token, view]);
  
  // Gestion state
  const [showOpSelector, setShowOpSelector] = useState(false);
  const [selectedOrderForOp, setSelectedOrderForOp] = useState<any>(null);
  const [opSearchTerm, setOpSearchTerm] = useState('');

  const [expandedOrders, setExpandedOrders] = useState<string[]>([]);
  const toggleExpand = (id: string) => setExpandedOrders(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);

  const fetchAttachments = async (type: 'order' | 'invoice', id: string) => {
    try {
      const response = await fetch(`/api/attachments/${type}/${encodeURIComponent(id)}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.ok) {
        const data = await response.json();
        setCurrentAttachments(data);
      }
    } catch (e) {
      console.error('Error fetching attachments:', e);
    }
  };

  const handleOpenAttachments = (type: 'order' | 'invoice', id: string) => {
    setActiveAttachmentTarget({ type, id });
    setCurrentAttachments([]);
    setShowAttachments(true);
    fetchAttachments(type, id);
  };

  const handleUploadAttachment = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !activeAttachmentTarget) return;

    if (currentAttachments.length > 0) {
      const existingName = currentAttachments[0].original_name;
      if (!window.confirm(`Le fichier "${existingName}" existe déjà. Voulez-vous le remplacer ?`)) {
        e.target.value = '';
        return;
      }
    }

    setIsUploading(true);

    const formData = new FormData();
    formData.append('target_type', activeAttachmentTarget.type);
    formData.append('target_id', activeAttachmentTarget.id);
    formData.append('file', file);

    try {
      const response = await fetch('/api/attachments/upload', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
        body: formData
      });
      if (response.ok) {
        await fetchAttachments(activeAttachmentTarget.type, activeAttachmentTarget.id);
        e.target.value = '';
      } else {
        alert('Erreur lors de l\'envoi du fichier');
      }
    } catch (e) {
      console.error('Upload error:', e);
    } finally {
      setIsUploading(false);
    }
  };

  const handleSendOrder = async (attachmentId: number) => {
    try {
      // 1. Récupérer les destinataires pour confirmation
      const recRes = await fetch(`/api/attachments/${attachmentId}/recipients`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      if (!recRes.ok) {
        const errData = await recRes.json();
        alert(errData.message || "Erreur lors de la récupération des destinataires");
        return;
      }
      
      const recipients: any[] = await recRes.json();
      
      if (recipients.length === 0) {
        alert("Aucun contact \"Destinataire des commandes\" n'a été trouvé pour ce fournisseur dans la base des Tiers.");
        return;
      }

      const validRecipients = recipients.filter(r => r.email && r.email.includes('@'));
      if (validRecipients.length === 0) {
        const list = recipients.map(r => `- ${r.prenom || ''} ${r.nom || ''}`).join('\n');
        alert(`Les contacts suivants sont bien ciblés mais aucun n'a d'adresse email valide :\n\n${list}\n\nVeuillez corriger cela dans la gestion des Tiers.`);
        return;
      }

      const recipientsList = recipients
        .map(r => `- ${r.prenom || ''} ${r.nom || ''} (${r.email || 'Pas d\'email'})`)
        .join('\n');

      if (!window.confirm(`Voulez-vous envoyer cette commande aux destinataires suivants :\n\n${recipientsList}`)) {
        return;
      }

      // 2. Envoyer la commande
      const res = await fetch(`/api/attachments/${attachmentId}/send-order`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      alert(data.message);
    } catch (err) {
      console.error('Send error:', err);
      alert("Erreur lors de l'envoi");
    }
  };
  const handleDeleteAttachment = async (id: number) => {
    if (!window.confirm('Supprimer ce fichier ?')) return;
    try {
      const response = await fetch(`/api/attachments/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.ok && activeAttachmentTarget) {
        fetchAttachments(activeAttachmentTarget.type, activeAttachmentTarget.id);
      }
    } catch (e) {
      console.error('Delete error:', e);
    }
  };

  const getM57Label = (code: string, type: 'nature' | 'fonction') => {
    if (!code) return '';
    const cleanCode = code.toString().trim();
    const plan = m57Plan.find(p => p.code === cleanCode && (p.type === type || !p.type));
    return plan ? plan.label : 'Inconnu dans le référentiel';
  };

  const getSectionFromM57 = (natureCode: string) => {
    if (!natureCode) return '';
    const cleanCode = natureCode.toString().trim();
    // In M57, nature codes starting with 2 are Investment, others are usually Operating
    // But we check the plan first if available
    const plan = m57Plan.find(p => p.code === cleanCode);
    if (plan && plan.section) return plan.section;
    
    // Fallback: nature starting with 2 or 1 (some 1) is Investment? 
    // Usually: Nature 2xxx = Investissement, 6xxx/7xxx = Fonctionnement
    if (cleanCode.startsWith('2')) return 'I';
    if (cleanCode.startsWith('6') || cleanCode.startsWith('7') || cleanCode.startsWith('0')) return 'F';
    return '';
  };

  const getWeekNumber = (d: Date) => {
    d = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
    var yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    var weekNo = Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
    return weekNo;
  };

  const parseExcelDate = (val: any) => {
    if (!val) return null;
    const serial = parseFloat(val);
    // Excel dates for 2000-2050 are roughly between 36526 and 54789
    if (!isNaN(serial) && serial > 30000 && serial < 60000) {
      return new Date(Math.round((serial - 25569) * 86400 * 1000));
    }
    const d = new Date(val);
    return isNaN(d.getTime()) ? null : d;
  };

  const chartData = useMemo(() => {
    console.log('[CHART] Orders count:', orders.length);
    if (orders.length > 0) {
      console.log('[CHART] First order:', orders[0]);
      console.log('[CHART] First order montant:', orders[0]['Montant TTC'], 'type:', typeof orders[0]['Montant TTC']);
    }

    const weeklySums: Record<string, { f: number, i: number }> = {};
    let debugCount = 0;
    let validDates = 0;
    let validAmounts = 0;

    orders.forEach((order, idx) => {
      const dateStr = order['Date de la commande'] || order.date;
      if (!dateStr) {
        if (idx === 0) console.log('[CHART] No date found for first order');
        return;
      }

      let date = new Date(dateStr);
      if (isNaN(date.getTime())) {
        // Fallback: try parsing as ISO string or Oracle format
        const isoMatch = String(dateStr).match(/(\d{4})-(\d{2})-(\d{2})/);
        if (isoMatch) {
          date = new Date(isoMatch[0]);
        }
        if (isNaN(date.getTime())) {
          if (idx === 0) console.log('[CHART] Invalid date:', dateStr);
          return;
        }
      }
      validDates++;

      const week = getWeekNumber(date);
      const year = date.getFullYear();
      const weekKey = `${year}-W${week.toString().padStart(2, '0')}`;

      if (!weeklySums[weekKey]) weeklySums[weekKey] = { f: 0, i: 0 };

      const amt = typeof order['Montant TTC'] === 'number' ? order['Montant TTC'] : parseFloat(String(order['Montant TTC'] || order.amount_ttc || 0).replace(',', '.')) || 0;
      if (amt > 0) {
        validAmounts++;
        if (validAmounts === 1) console.log('[CHART] First valid amount:', amt, 'for week:', weekKey);
      }

      const nature = order['Article par nature'] || order.nature || '';
      const section = order.section || order['Section'] || getSectionFromM57(nature);

      if (validAmounts === 1 || (validAmounts <= 3 && amt > 0)) {
        console.log(`[CHART] Order section: "${section}", nature: "${nature}", amount: ${amt}`);
      }

      if (amt > 0) debugCount++;

      if (section === 'Fonctionnement' || section === 'F') {
        weeklySums[weekKey].f += amt;
      } else if (section === 'Investissement' || section === 'I') {
        weeklySums[weekKey].i += amt;
      }
    });

    console.log('[CHART] Summary - Valid dates:', validDates, 'Valid amounts:', validAmounts, 'Debug count:', debugCount, 'Weekly sums keys:', Object.keys(weeklySums).length);

    if (debugCount === 0 && orders.length > 0) {
      console.warn('[CHART DEBUG] Aucune commande avec montant valide. Total commandes:', orders.length);
    }

    const sortedWeeks = Object.keys(weeklySums).sort();
    let cumF = 0;
    let cumI = 0;

    const result = sortedWeeks.map(week => {
      cumF += weeklySums[week].f;
      cumI += weeklySums[week].i;
      return {
        week,
        fonctionnement: Math.round(cumF),
        investissement: Math.round(cumI)
      };
    });

    if (result.length > 0) {
      console.log('[CHART] Final data points:', result.length);
      console.log('[CHART] First point:', result[0]);
      console.log('[CHART] Last point:', result[result.length - 1]);
    }

    return result;
  }, [orders, m57Plan]);

  const invoiceStats = useMemo(() => {
    const now = new Date();
    const stats = {
      totalTtc: 0,
      suspended: 0,
      saisie10: 0,
      saisie20: 0,
      saisie30: 0,
      list10: [] as any[],
      list20: [] as any[],
      list30: [] as any[]
    };

    invoices.forEach(inv => {
      const amt = parseFloat(inv['Montant TTC'] || 0);
      stats.totalTtc += amt;

      const etat = (inv['Etat'] || '').toUpperCase();
      // Factures à traiter : tout ce qui n'est pas "MANDATEE" et qui est dans un état de saisie/attente
      // On considère que par défaut si ce n'est pas mandaté, c'est à traiter
      if (etat.includes('SUSPENDUE')) {
        stats.suspended++;
      } else if (!etat.includes('MANDATEE') && etat !== '') {
        const arrivalDate = parseExcelDate(inv['Arrivée']);
        if (arrivalDate) {
          const diffDays = Math.floor((now.getTime() - arrivalDate.getTime()) / (1000 * 60 * 60 * 24));
          const invInfo = `${inv['Fournisseur'] || 'Inconnu'} (${amt.toLocaleString()}€) - ${inv['Libellé'] || ''}`;
          
          if (diffDays > 30) {
            stats.saisie30++;
            stats.list30.push(invInfo);
          } else if (diffDays > 20) {
            stats.saisie20++;
            stats.list20.push(invInfo);
          } else if (diffDays > 10) {
            stats.saisie10++;
            stats.list10.push(invInfo);
          }
        }
      }
    });

    return stats;
  }, [invoices]);

  const [m57View, setM57View] = useState<'nature' | 'fonction'>('nature');
  const [rawSql, setRawSql] = useState('');

  const [editingCell, setEditingCell] = useState<{ id: number, key: string } | null>(null);
  const [cellValue, setCellValue] = useState<any>('');

  const isAuthorizedToEdit = ['superadmin', 'admin', 'finances', 'compta'].includes(currentUser.role);

  const handleCellUpdate = async (row: any, key: string, newValue: any) => {
    if (row[key] === newValue) {
      setEditingCell(null);
      return;
    }
    const updatedRow = { ...row, [key]: newValue };
    try {
      const response = await fetch(`/api/budget/operations/${row.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify(updatedRow)
      });
      if (response.ok) {
        setEditingCell(null);
        await fetchData();
      } else {
        const err = await response.json().catch(() => ({}));
        alert('Erreur: ' + (err.message || response.status));
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleCreateOp = async () => {
    const emptyRow = { 'Service': '', 'Service Complément': '', 'LIBELLE': 'Nouvelle Opération', 'MCO': '', 'C. Fonc.': '', 'C. Nature': '', 'Montant prévu': 0, 'Terminé': 'NON', 'Commentaire': '', 'exercice': String(currentFiscalYear) };
    try {
      const response = await fetch('/api/budget/operations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify(emptyRow)
      });
      if (response.ok) {
        const result = await response.json();
        await fetchData();
        setEditingCell({ id: result.id, key: 'LIBELLE' });
        setCellValue('Nouvelle Opération');
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleDeleteOp = async (id: number) => {
    if (!window.confirm('Supprimer cette opération ?')) return;
    try {
      const response = await fetch(`/api/budget/operations/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.ok) await fetchData();
    } catch (e) {
      console.error(e);
    }
  };

  const fetchRawData = async (table: string) => {
    const response = await fetch(`/api/raw-data/${table}`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (response.ok) {
      const result = await response.json();
      setRawData(result.data);
      setRawSql(result.query);
    }
  };

  const fetchData = async () => {
    const headers = { 'Authorization': `Bearer ${token}` };
    const queryParams = new URLSearchParams({
      fiscalYear: String(currentFiscalYear),
      budgetScope: budgetScope
    }).toString();

    const createFetch = async (url: string): Promise<Response> => {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);
      try {
        const res = await fetch(url, { headers, signal: controller.signal });
        clearTimeout(timeoutId);
        return res;
      } catch (e) {
        clearTimeout(timeoutId);
        return new Response('{}', { status: 500 });
      }
    };

    const [linesRes, invoicesRes, ordersRes, operationsRes, m57Res, settingsRes] = await Promise.all([
      createFetch(`/api/budget/lines?${queryParams}`),
      createFetch(`/api/budget/invoices?${queryParams}`),
      createFetch(`/api/budget/orders?${queryParams}`),
      createFetch(`/api/budget/operations?${queryParams}`),
      createFetch('/api/m57-plan'),
      createFetch('/api/settings/public')
    ]);

    try {
      if (linesRes.ok) setBudgetLines(await linesRes.json());
      if (invoicesRes.ok) setInvoices(await invoicesRes.json());
      if (ordersRes.ok) setOrders(await ordersRes.json());
      if (operationsRes.ok) setOperations(await operationsRes.json());
      if (m57Res.ok) setM57Plan(await m57Res.json());
      if (settingsRes.ok) {
        const settings = await settingsRes.json();
        if (Array.isArray(settings)) {
          const seditSetting = settings.find((s: any) => s.setting_key === 'url_sedit_fi');
          if (seditSetting) setUrlSedit(seditSetting.setting_value);

          const budgetSetting = settings.find((s: any) => s.setting_key === 'budget_principal');
          if (budgetSetting) setBudgetPrincipal(budgetSetting.setting_value);
        }
      }
    } catch (e) {
      // Silently fail if JSON parsing fails due to timeout
    }
  };

  useEffect(() => {
    if (token) fetchData();
  }, [currentFiscalYear, budgetScope, token]);

  useEffect(() => {
    if (isRaw) {
      const tableMap: any = { 'lines': 'budget_lines', 'invoices': 'invoices', 'orders': 'orders', 'operations': 'operations' };
      if (tableMap[view]) fetchRawData(tableMap[view]);
    }
  }, [isRaw, view]);

  const confirmImport = async () => {
    if (!pendingImportFile || !pendingImportType || !selectedBudgetId) {
      alert("Veuillez sélectionner un budget.");
      return;
    }
    
    setIsUploading(true);
    const formData = new FormData();
    formData.append('file', pendingImportFile);
    formData.append('budgetId', String(selectedBudgetId));
    formData.append('year', String(selectedYear));

    let endpoint = '';
    if (pendingImportType === 'lines') endpoint = 'api/budget/import-lines';
    else if (pendingImportType === 'invoices') endpoint = 'api/budget/import-invoices';
    else if (pendingImportType === 'orders') endpoint = 'api/orders/import';

    try {
      const response = await fetch(`/${endpoint}`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
        body: formData
      });

      if (response.ok) {
        const result = await response.json();
        setMessage(result.message);
        fetchData();
        setShowImportModal(false);
        setPendingImportFile(null);
        setTimeout(() => setMessage(''), 3000);
      } else {
        const errText = await response.text();
        alert(`Erreur: ${errText}`);
      }
    } catch (e) {
      alert('Erreur de connexion');
    } finally {
      setIsUploading(false);
    }
  };

  const requestSort = (key: string) => {
    let direction: 'asc' | 'desc' = 'asc';
    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  const handleColumnFilterChange = (key: string, value: string) => {
    setColumnFilters(prev => ({ ...prev, [key]: value }));
  };

  const groupedOrders = useMemo(() => {
    if (!orders || orders.length === 0) return [];
    const groups: Record<string, any> = {};
    orders.forEach(order => {
      const orderId = String(order.id || order['N° Commande'] || order.order_number || order.COMMANDE_COMMANDE || '0').trim();
      if (!groups[orderId]) {
        groups[orderId] = {
          ...order,
          id: orderId,
          _total_ht: order._total_ht || parseFloat(order['Montant HT'] || order.COMMANDE_MONTANT_HT || order.amount_ht || 0),
          _total_ttc: order._total_ttc || parseFloat(order['Montant TTC'] || order.COMMANDE_MONTANT_TTC || 0),
          _lines: order._lines || []
        };
      }
    });
    return Object.values(groups);
  }, [orders, m57Plan]);

  const [expandedLines, setExpandedLines] = useState<string[]>([]);
  const toggleExpandLine = (id: string) => setExpandedLines(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);

  const [expandedOps, setExpandedOps] = useState<Set<number>>(new Set());
  const [opsCommandsData, setOpsCommandsData] = useState<Record<number, { columns: any[], rows: any[] }>>({});
  const [opsCmdVisibleCols, setOpsCmdVisibleCols] = useState<string[]>([]);
  const toggleExpandedOp = (opId: number) => {
    setExpandedOps(prev => {
      const next = new Set(prev);
      if (next.has(opId)) { next.delete(opId); }
      else {
        next.add(opId);
        if (!opsCommandsData[opId]) {
          fetch(`/api/budget/operations/${opId}/orders`, {
            headers: { 'Authorization': `Bearer ${token}` }
          }).then(r => r.ok && r.json()).then(data => {
            if (data) setOpsCommandsData(prev => ({ ...prev, [opId]: { columns: data.columns || [], rows: data.rows || [] } }));
          }).catch(() => {});
        }
      }
      return next;
    });
  };

  const handleAssignOperation = async (operationId: number | null) => {
    if (!selectedOrderForOp) return;
    try {
      const response = await fetch(`/api/budget/orders/${selectedOrderForOp.id}/assign-operation`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ operation_id: operationId })
      });
      if (response.ok) {
        setShowOpSelector(false);
        setSelectedOrderForOp(null);
        await fetchData();
      } else {
        alert('Erreur lors de l\'affectation');
      }
    } catch (e) {
      console.error(e);
    }
  };

  const groupedBudgetLines = useMemo(() => {
    const chapters: Record<string, any> = {};
    const financialCols = ['Budget voté', 'Disponible', 'Mt. prévision', 'Mt. pré-engagé', 'Mt. engagé', 'Mt. facturé', 'Mt. pré-mandaté', 'Mt. mandaté', 'Mt. payé', 'allocated_amount'];
    
    budgetLines.forEach(line => {
      const chapter = (line['Chapitre par nature'] || line.chapter || 'SANS_CHAPITRE').toString().trim();
      const label = (line['Libellé'] || line.label || 'SANS_LIBELLE').toString().trim();
      
      if (!chapters[chapter]) {
        chapters[chapter] = {
          _isChapter: true,
          chapter: chapter,
          "Chapitre par nature": chapter,
          _labels: {},
          _total: {}
        };
        financialCols.forEach(col => chapters[chapter]._total[col] = 0);
      }
      
      if (!chapters[chapter]._labels[label]) {
        chapters[chapter]._labels[label] = {
          ...line,
          "Libellé": label,
          label: label,
          _isGroup: true,
          _lines: []
        };
        financialCols.forEach(col => chapters[chapter]._labels[label][col] = 0);
      }
      
      financialCols.forEach(col => {
        const val = parseFloat(line[col] || 0);
        chapters[chapter]._labels[label][col] += val;
        chapters[chapter]._total[col] += val;
      });
      
      chapters[chapter]._labels[label]._lines.push(line);
    });
    
    // Convert to flat list for rendering (Chapter Header then its Grouped Labels)
    const result: any[] = [];
    Object.keys(chapters).sort().forEach(chKey => {
      const chapter = chapters[chKey];
      result.push({
        ...chapter,
        "Libellé": `CHAPITRE ${chKey}`,
        _isChapter: true,
        // Map totals for rendering
        ...chapter._total
      });
      
      const labels = Object.values(chapter._labels);
      // Sort labels by name or amount? Let's sort by name for now
      labels.sort((a: any, b: any) => a.label.localeCompare(b.label));
      result.push(...labels);
    });
    
    return result;
  }, [budgetLines]);

  const filteredOrders = groupedOrders.filter(order => {
    const orderNumber = (order.order_number || order['N° Commande'] || '').toString().toLowerCase();
    const globalLabel = (order['Libellé'] || '').toString().toLowerCase();
    const provider = (order.provider || order['Fournisseur'] || '').toString().toLowerCase();
    const sTerm = searchTerm.toLowerCase();

    const linesMatch = order._lines.some((l: any) => l.desc?.toLowerCase().includes(sTerm));

    const matchesGlobalSearch = 
      orderNumber.includes(sTerm) ||
      globalLabel.includes(sTerm) ||
      provider.includes(sTerm) ||
      linesMatch;
    
    if (!matchesGlobalSearch) return false;

    const sectionValue = order.section || order.Section || order['Section'];
    const matchesSection = 
      sectionFilter === 'all' || 
      (sectionFilter === 'F' && (sectionValue === 'Fonctionnement' || sectionValue === 'F')) ||
      (sectionFilter === 'I' && (sectionValue === 'Investissement' || sectionValue === 'I'));

    if (!matchesSection) return false;

    for (const [key, filterValue] of Object.entries(columnFilters)) {
      if (filterValue) {
        if (key === 'Désignation' || key === 'description') {
           if (!order._lines.some((l: any) => l.desc?.toLowerCase().includes(filterValue.toLowerCase()))) return false;
        } else {
          const val = (order[key] || '').toString().toLowerCase();
          if (!val.includes(filterValue.toLowerCase())) return false;
        }
      }
    }

    return true;
  }).sort((a, b) => {
    if (!sortConfig) return 0;
    
    const key = sortConfig.key;
    let aVal = a[key];
    let bVal = b[key];

    if (key === 'Montant HT' || key === 'amount_ht') {
      aVal = a._total_ht;
      bVal = b._total_ht;
    } else if (key === 'Montant TTC') {
      aVal = a._total_ttc;
      bVal = b._total_ttc;
    }
    
    if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
    if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
    return 0;
  });

  const filteredData = useMemo(() => {
    let data = view === 'lines' ? groupedBudgetLines : view === 'invoices' ? invoices : view === 'operations' ? operations : filteredOrders;

    if (view === 'operations') {
      const seen = new Set<string>();
      data = data.filter((row: any) => {
        const key = `${row.id ?? row.ID}`;
        if (seen.has(key)) return false;
        seen.add(key);
        // Also check for business-key duplicates (different ids, same name)
        const bizKey = `${(row['LIBELLE'] || row['Libellé'] || '').trim().toLowerCase()}|${row['Section'] || ''}|${row['exercice'] || ''}`;
        if (seen.has(bizKey)) return false;
        seen.add(bizKey);
        return true;
      });
    }
    
    if (view === 'lines') {
      if (!showZeroBudget) {
        data = data.filter((row: any) => parseFloat(row['Budget voté'] || 0) !== 0);
      }
      if (sectionFilter !== 'all') {
        data = data.filter((row: any) => row.Section === sectionFilter || row.section === sectionFilter);
      }
    }

    if (view === 'operations') {
      if (sectionFilter !== 'all') {
        data = data.filter((op: any) => {
          const section = getSectionFromM57(op['C. Nature']);
          return section === sectionFilter;
        });
      }
    }

    // Suppression du filtre restrictif sur le numéro de facture fournisseur
    // car beaucoup de factures Oracle n'en ont pas et cela les masquait.

    if (view !== 'orders') {
      const sTerm = searchTerm.toLowerCase();
      if (sTerm) {
        data = data.filter((row: any) => Object.values(row).some(v => v?.toString().toLowerCase().includes(sTerm)));
      }
      for (const [key, filterValue] of Object.entries(columnFilters)) {
        if (!filterValue) continue;
        if ((key === 'Section' || key === 'section') && view === 'operations') {
          data = data.filter((row: any) => getSectionFromM57(row['C. Nature']) === filterValue);
        } else {
          data = data.filter((row: any) => (row[key] || '').toString().toLowerCase().includes(filterValue.toLowerCase()));
        }
      }
      if (sortConfig) {
        data = [...data].sort((a: any, b: any) => {
          const aVal = a[sortConfig.key];
          const bVal = b[sortConfig.key];
          if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
          if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
          return 0;
        });
      }
    }
    return data;
  }, [view, budgetLines, groupedBudgetLines, invoices, operations, filteredOrders, searchTerm, columnFilters, sortConfig, showZeroBudget, sectionFilter, m57Plan]);

  // Évolution cumulée des commandes liées aux opérations actuellement filtrées.
  const opsChartData = useMemo(() => {
    if (view !== 'operations') return [];
    const opIds = new Set(
      (filteredData as any[]).filter(o => o && o.id != null).map(o => String(o.id))
    );
    const weekly: Record<string, { f: number; i: number }> = {};
    orders.forEach((order: any) => {
      const opId = order.operation_id;
      if (opId == null || !opIds.has(String(opId))) return;
      const dateStr = order['Date de la commande'] || order.date;
      if (!dateStr) return;
      let date = new Date(dateStr);
      if (isNaN(date.getTime())) {
        const m = String(dateStr).match(/(\d{4})-(\d{2})-(\d{2})/);
        if (m) date = new Date(m[0]);
      }
      if (isNaN(date.getTime())) return;
      const key = `${date.getFullYear()}-W${getWeekNumber(date).toString().padStart(2, '0')}`;
      const amt = typeof order['Montant TTC'] === 'number'
        ? order['Montant TTC']
        : parseFloat(String(order['Montant TTC'] || order.amount_ttc || 0).replace(',', '.')) || 0;
      const section = order.section || order['Section'] || getSectionFromM57(order['Article par nature'] || order.nature || '');
      if (!weekly[key]) weekly[key] = { f: 0, i: 0 };
      if (section === 'F' || section === 'Fonctionnement') weekly[key].f += amt;
      else if (section === 'I' || section === 'Investissement') weekly[key].i += amt;
    });
    let cf = 0, ci = 0;
    return Object.keys(weekly).sort().map(k => {
      cf += weekly[k].f; ci += weekly[k].i;
      return { week: k, fonctionnement: Math.round(cf), investissement: Math.round(ci), total: Math.round(cf + ci) };
    });
  }, [view, filteredData, orders, m57Plan]);

  // Valeurs distinctes pour les filtres en liste déroulante (service, nature, section…)
  const filterOptions = useMemo(() => {
    const base: any[] = view === 'orders' ? groupedOrders : view === 'operations' ? operations : groupedBudgetLines;
    const opts: Record<string, string[]> = {};
    for (const c of ['Service', 'Service émetteur', 'Service Complément', 'C. Nature']) {
      const s = new Set<string>();
      base.forEach((r: any) => { const v = r?.[c]; if (v != null && String(v).trim() !== '') s.add(String(v).trim()); });
      opts[c] = [...s].sort((a, b) => a.localeCompare(b, 'fr'));
    }
    if (view === 'operations') {
      const s = new Set<string>();
      base.forEach((r: any) => { const sec = getSectionFromM57(r['C. Nature']); if (sec) s.add(sec); });
      opts['Section'] = [...s].sort();
    }
    return opts;
  }, [view, groupedOrders, operations, groupedBudgetLines, m57Plan]);

  const DROPDOWN_FILTER_COLS = ['Service', 'Service émetteur', 'Service Complément', 'C. Nature', 'Section'];

  const visibleColumns = useMemo(() => {
    if (filteredData.length === 0) return [];
    const allKeys = new Set<string>();
    filteredData.forEach((row: any) => {
      Object.keys(row).forEach(k => {
        if (!k.startsWith('_')) allKeys.add(k);
      });
    });
    const excluded = ['_lines', '_total_ht', '_total_ttc', '_isGroup', '_isChapter', 'operation_label'];
    const available = Array.from(allKeys).filter(k => !excluded.includes(k));

    if (view === 'orders') {
      return orderColumns.filter(c => available.includes(c));
    } else if (view === 'invoices') {
      return invoiceColumns.filter(c => available.includes(c));
    } else if (view === 'operations') {
      return opColumns.filter(c => available.includes(c));
    }
    return available;
  }, [filteredData, view, orderColumns, invoiceColumns, opColumns]);

  const getRowClass = (section: string) => {
    if (section === 'Fonctionnement' || section === 'F') return 'row-operating';
    if (section === 'Investissement' || section === 'I') return 'row-investment';
    return '';
  };

  return (
    <div className="budget-page">
      <Header />
      <main className="main-content">
        <div className="page-header">
          <div>
            <h1 className="page-title">Suivi Budgétaire & Commandes</h1>
            <p className="page-subtitle">Gérez vos lignes budgétaires, factures et commandes centralisées.</p>
          </div>
          <div className="header-controls">
            <div className="select-wrapper">
              <label htmlFor="fiscal-year-select" className="sr-only">Année Fiscale</label>
              <select
                id="fiscal-year-select"
                className="filter-select"
                value={currentFiscalYear}
                onChange={(e) => setCurrentFiscalYear(parseInt(e.target.value))}
              >
                {availableFiscalYears.length > 0 ? (
                  availableFiscalYears.map(year => (
                    <option key={year} value={year}>{year}</option>
                  ))
                ) : (
                  <option value={currentYear}>{currentYear}</option>
                )}
              </select>
            </div>
            <div className="budget-scope-toggle">
              <button
                className={`toggle-btn ${budgetScope === 'Ville' ? 'active' : ''}`}
                onClick={() => setBudgetScope('Ville')}
              >
                Budget {budgetPrincipal || 'Ville'}
              </button>
              <button
                className={`toggle-btn ${budgetScope === 'All' ? 'active' : ''}`}
                onClick={() => setBudgetScope('All')}
              >
                Tous les budgets
              </button>
            </div>
          </div>
          <div className="view-tabs">
            {['summary', 'lines', 'invoices', 'orders', 'tiers', 'operations', 'gestion'].map(tab => {
              // Only admin/finances/compta can see 'gestion'
              if (tab === 'gestion' && !['admin', 'finances', 'compta'].includes(currentUser.role)) return null;
              return (
                <button 
                  key={tab}
                  className={`tab-btn ${view === tab ? 'active' : ''}`} 
                  onClick={() => {
                    setView(tab as any); 
                    setIsRaw(false);
                    setSortConfig(null);
                    
                    // Gérer le filtre de service auto si applicable (seulement sur Commandes et Opérations)
                    const u = currentUser as any;
                    if (u.service_code && !['admin', 'finances'].includes(u.role) && (tab === 'orders' || tab === 'operations')) {
                      const filters: Record<string, string> = {};
                      const serviceKey = tab === 'orders' ? 'Service émetteur' : 'Service';
                      filters[serviceKey] = u.service_code;
                      
                      if (u.service_complement) {
                        const complementKey = tab === 'orders' ? 'Service complément' : 'Service Complément';
                        filters[complementKey] = u.service_complement;
                      }
                      setColumnFilters(filters);
                    } else {
                      setColumnFilters({});
                    }
                    
                    if (tab !== 'summary') {
                      setSearchTerm('');
                    }
                  }}
                >
                  {tab === 'summary' && 'Résumé'}
                  {tab === 'lines' && 'Lignes'}
                  {tab === 'invoices' && 'Factures'}
                  {tab === 'orders' && 'Commandes'}
                  {tab === 'tiers' && 'Tiers'}
                  {tab === 'operations' && 'Opérations'}
                  {tab === 'gestion' && 'Gestion'}
                </button>
              );
            })}
          </div>
        </div>


        {message && (
          <div className="alert alert-success">
            <CheckCircle size={20} className="alert-icon" /> 
            <span>{message}</span>
          </div>
        )}

        {isRaw ? (
          <div className="raw-view-container">
            <div className="sql-box">
              <div className="sql-box-header">Requête SQL Exécutée</div>
              <code>{rawSql}</code>
            </div>
            <div className="table-card">
              <div className="table-responsive">
                <table className="modern-table">
                  <thead>
                    <tr>
                      {rawData.length > 0 && Object.keys(rawData[0]).map(key => <th key={key}>{key}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {rawData.map((row, i) => (
                      <tr key={i}>
                        {Object.values(row).map((val: any, j) => <td key={j}>{val}</td>)}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        ) : (
          <div className="view-content-wrapper">
            {view === 'summary' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
                <div className="dashboard-grid">
                  <div className="dashboard-card primary" style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '0.5rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                      <div className="card-icon"><Euro size={24} /></div>
                      <div>
                        <h3 className="card-title">Budget Alloué Total</h3>
                        <p className="card-value">{Math.round(budgetLines.reduce((acc, curr) => acc + (curr.allocated_amount || 0), 0)).toLocaleString()} €</p>
                      </div>
                    </div>
                    <div style={{ width: '100%', fontSize: '0.85rem', color: '#64748b', display: 'flex', justifyContent: 'space-between', marginTop: '0.5rem', borderTop: '1px solid #f1f5f9', paddingTop: '0.5rem' }}>
                      <span>Fonc: {Math.round(budgetLines.filter(l => l.section === 'F').reduce((acc, curr) => acc + (curr.allocated_amount || 0), 0)).toLocaleString()} €</span>
                      <span>Inv: {Math.round(budgetLines.filter(l => l.section === 'I').reduce((acc, curr) => acc + (curr.allocated_amount || 0), 0)).toLocaleString()} €</span>
                    </div>
                  </div>
                  <div className="dashboard-card secondary" style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '0.5rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                      <div className="card-icon"><ShoppingCart size={24} /></div>
                      <div>
                        <h3 className="card-title">Total Commandé (TTC)</h3>
                        <p className="card-value">{Math.round(groupedOrders.reduce((acc, curr) => acc + (curr._total_ttc || 0), 0)).toLocaleString()} €</p>
                      </div>
                    </div>
                    <div style={{ width: '100%', fontSize: '0.85rem', color: '#64748b', display: 'flex', justifyContent: 'space-between', marginTop: '0.5rem', borderTop: '1px solid #f1f5f9', paddingTop: '0.5rem' }}>
                      <span>Fonc: {Math.round(groupedOrders.filter(o => o.section === 'F' || o.section === 'Fonctionnement').reduce((acc, curr) => acc + (curr._total_ttc || 0), 0)).toLocaleString()} €</span>
                      <span>Inv: {Math.round(groupedOrders.filter(o => o.section === 'I' || o.section === 'Investissement').reduce((acc, curr) => acc + (curr._total_ttc || 0), 0)).toLocaleString()} €</span>
                    </div>
                  </div>
                  <div className="dashboard-card warning" style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '0.5rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                      <div className="card-icon"><FileText size={24} /></div>
                      <div>
                        <h3 className="card-title">Total Facturé (TTC)</h3>
                        <p className="card-value">{Math.round(invoiceStats.totalTtc).toLocaleString()} €</p>
                      </div>
                    </div>
                    <div style={{ width: '100%', fontSize: '0.85rem', color: '#64748b', display: 'flex', justifyContent: 'space-between', marginTop: '0.5rem', borderTop: '1px solid #f1f5f9', paddingTop: '0.5rem' }}>
                      <span>En attente : {invoiceStats.saisie10 + invoiceStats.saisie20 + invoiceStats.saisie30} dossiers</span>
                      <span>Suspendues : {invoiceStats.suspended}</span>
                    </div>
                  </div>
                  <div className="dashboard-card neutral" style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '0.5rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                      <div className="card-icon"><AlertCircle size={24} /></div>
                      <div>
                        <h3 className="card-title">Factures à traiter</h3>
                        <p className="card-value" style={{ fontSize: '1.2rem' }}>
                          <span 
                            style={{ color: invoiceStats.saisie30 > 0 ? '#ef4444' : 'inherit', cursor: invoiceStats.saisie30 > 0 ? 'help' : 'default' }}
                            title={invoiceStats.list30.join('\n')}
                          >
                            {invoiceStats.saisie30} (+30j)
                          </span>
                        </p>
                      </div>
                    </div>
                    <div style={{ width: '100%', fontSize: '0.8rem', color: '#64748b', display: 'flex', justifyContent: 'space-between', marginTop: '0.5rem', borderTop: '1px solid #f1f5f9', paddingTop: '0.5rem' }}>
                      <span title={invoiceStats.list20.join('\n')} style={{ cursor: invoiceStats.saisie20 > 0 ? 'help' : 'default' }}>+20j : {invoiceStats.saisie20}</span>
                      <span title={invoiceStats.list10.join('\n')} style={{ cursor: invoiceStats.saisie10 > 0 ? 'help' : 'default' }}>+10j : {invoiceStats.saisie10}</span>
                    </div>
                  </div>
                </div>

                <div className="table-card">
                  <div style={{ padding: '1.25rem', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <h3 style={{ margin: 0, color: 'var(--color-navy)', fontSize: '1.1rem', fontWeight: 700 }}>Évolution Cumulée des Dépenses (par semaine)</h3>
                    <span style={{ fontSize: '0.8rem', color: '#64748b', fontStyle: 'italic' }}>* Basé sur les dates de commande et le montant TTC</span>
                  </div>
                  <div style={{ padding: '1.5rem', height: '400px' }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={chartData}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                        <XAxis 
                          dataKey="week" 
                          axisLine={false} 
                          tickLine={false} 
                          tick={{ fill: '#64748b', fontSize: 12 }}
                          dy={10}
                        />
                        <YAxis 
                          axisLine={false} 
                          tickLine={false} 
                          tick={{ fill: '#64748b', fontSize: 12 }}
                          tickFormatter={(val) => `${(val / 1000).toFixed(0)}k€`}
                        />
                        <Tooltip 
                          formatter={(value: any) => [new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(value), '']}
                          contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                        />
                        <Legend wrapperStyle={{ paddingTop: '20px' }} />
                        <Line 
                          type="monotone" 
                          dataKey="fonctionnement" 
                          name="Fonctionnement" 
                          stroke="#22c55e" 
                          strokeWidth={3} 
                          dot={{ r: 4, fill: '#22c55e', strokeWidth: 2, stroke: '#fff' }}
                          activeDot={{ r: 6 }} 
                        />
                        <Line 
                          type="monotone" 
                          dataKey="investissement" 
                          name="Investissement" 
                          stroke="#3b82f6" 
                          strokeWidth={3} 
                          dot={{ r: 4, fill: '#3b82f6', strokeWidth: 2, stroke: '#fff' }}
                          activeDot={{ r: 6 }}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>
            )}

            {['lines', 'operations'].includes(view) && (
              <div className="orders-container">
                <div className="toolbar">
                  <div className="toolbar-actions">
                    {view === 'operations' && isAuthorizedToEdit && (
                      <button className="toolbar-btn active" style={{ background: 'var(--color-green-500)', color: 'white', border: 'none' }} onClick={handleCreateOp}>
                        <Plus size={16} /> Nouvelle Opération
                      </button>
                    )}
                    <button className="toolbar-btn" onClick={() => setShowM57(true)}>
                      <BookOpen size={16} /> Plan M57
                    </button>
                    {view === 'lines' && (
                      <button 
                        className={`toolbar-btn ${showZeroBudget ? 'active' : ''}`}
                        onClick={() => setShowZeroBudget(!showZeroBudget)}
                        style={{ background: showZeroBudget ? 'var(--color-navy)' : 'white', color: showZeroBudget ? 'white' : 'var(--color-slate-700)' }}
                      >
                        <Eye size={16} /> {showZeroBudget ? 'Masquer nuls' : 'Afficher tout'}
                      </button>
                    )}
                  </div>
                    {view === 'operations' && (
                      <div className="chaussette-indicators" style={{ display: 'flex', gap: '1rem', alignItems: 'center', marginLeft: '0.5rem', marginRight: 'auto' }}>
                        {(() => {
                          const stats = operations.reduce((acc, op) => {
                            const isDone = (op['Terminé'] || '').toString().toUpperCase() === 'OUI';
                            if (!isDone) return acc;

                            const section = getSectionFromM57(op['C. Nature']);
                            const planned = parseFloat(op['Montant prévu'] || 0);
                            const used = parseFloat(op['used_amount'] || op['Montant utilisé'] || 0);
                            const diff = planned - used;
                            
                            if (section === 'F') {
                              acc.fDiff += diff;
                            } else if (section === 'I') {
                              acc.iDiff += diff;
                            }
                            return acc;
                          }, { fDiff: 0, iDiff: 0 });

                          return (
                            <>
                              <div className="chaussette-card f" title="Pour les opérations terminées : Somme(Prévu) - Somme(Utilisé)">
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                  <span className="chaussette-label">Chaussette Fonc.</span>
                                  <SockIcon size={18} color="var(--color-green-500)" />
                                </div>
                                <span className={`chaussette-value ${stats.fDiff < 0 ? 'negative' : ''}`}>
                                  {stats.fDiff.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })}
                                </span>
                              </div>
                              <div className="chaussette-card i" title="Pour les opérations terminées : Somme(Prévu) - Somme(Utilisé)">
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                  <span className="chaussette-label">Chaussette Inv.</span>
                                  <SockIcon size={18} color="var(--color-blue-500)" />
                                </div>
                                <span className={`chaussette-value ${stats.iDiff < 0 ? 'negative' : ''}`}>
                                  {stats.iDiff.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })}
                                </span>
                              </div>
                            </>
                          );
                        })()}
                      </div>
                    )}
                    <div className="toolbar-filters">
                    <div className="search-input-wrapper">
                      <Search size={16} className="search-icon" />
                      <input 
                        type="text" 
                        placeholder="Rechercher..." 
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="search-input"
                      />
                    </div>
                    {['orders', 'operations', 'lines'].includes(view) && (
                      <div className="section-quick-filters" style={{ display: 'flex', gap: '0.5rem' }}>
                        <button 
                          className={`toolbar-btn ${sectionFilter === 'F' ? 'active' : ''}`}
                          onClick={() => setSectionFilter(sectionFilter === 'F' ? 'all' : 'F')}
                          style={{ 
                            background: sectionFilter === 'F' ? 'var(--color-green-500)' : 'white', 
                            color: sectionFilter === 'F' ? 'white' : 'inherit',
                            borderColor: sectionFilter === 'F' ? 'var(--color-green-500)' : 'var(--color-slate-200)'
                          }}
                        >
                          Fonc.
                        </button>
                        <button 
                          className={`toolbar-btn ${sectionFilter === 'I' ? 'active' : ''}`}
                          onClick={() => setSectionFilter(sectionFilter === 'I' ? 'all' : 'I')}
                          style={{ 
                            background: sectionFilter === 'I' ? 'var(--color-blue-500)' : 'white', 
                            color: sectionFilter === 'I' ? 'white' : 'inherit',
                            borderColor: sectionFilter === 'I' ? 'var(--color-blue-500)' : 'var(--color-slate-200)'
                          }}
                        >
                          Inv.
                        </button>
                      </div>
                    )}
                    {view === 'orders' && (
                      <div className="select-wrapper">
                        <Filter size={14} className="select-icon" />
                        <select 
                          value={sectionFilter} 
                          onChange={(e) => setSectionFilter(e.target.value)}
                          className="filter-select"
                        >
                          <option value="all">Toutes les sections</option>
                          <option value="F">Fonctionnement (F)</option>
                          <option value="I">Investissement (I)</option>
                        </select>
                      </div>
                    )}
                  </div>
                </div>

                {view === 'operations' && (() => {
                  const kpi = operations.reduce((acc, op) => {
                    const section = getSectionFromM57(op['C. Nature']);
                    const planned = parseFloat(op['Montant prévu'] || op['montant_prevu'] || 0) || 0;
                    const used = parseFloat(op['used_amount'] || op['Montant utilisé'] || 0) || 0;
                    acc.planned += planned;
                    acc.used += used;
                    if (section === 'F') { acc.usedF += used; acc.plannedF += planned; }
                    else if (section === 'I') { acc.usedI += used; acc.plannedI += planned; }
                    return acc;
                  }, { planned: 0, used: 0, usedF: 0, usedI: 0, plannedF: 0, plannedI: 0 });
                  const pct = kpi.planned > 0 ? (kpi.used / kpi.planned) * 100 : 0;
                  const fmt = (n: number) => n.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
                  const card: React.CSSProperties = {
                    flex: '1 1 0', minWidth: '160px', background: 'white', border: '1px solid var(--color-slate-200)',
                    borderRadius: '12px', padding: '0.85rem 1.1rem', display: 'flex', flexDirection: 'column', gap: '0.25rem'
                  };
                  const label: React.CSSProperties = { fontSize: '0.72rem', fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.03em' };
                  const value: React.CSSProperties = { fontSize: '1.25rem', fontWeight: 700, color: 'var(--color-navy)' };
                  return (
                    <div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
                      <div style={card}>
                        <span style={label}>Réalisé Fonctionnement</span>
                        <span style={{ ...value, color: 'var(--color-green-500)' }}>{fmt(kpi.usedF)}</span>
                        <span style={{ fontSize: '0.72rem', color: '#94a3b8' }}>Prévu : {fmt(kpi.plannedF)}</span>
                      </div>
                      <div style={card}>
                        <span style={label}>Réalisé Investissement</span>
                        <span style={{ ...value, color: 'var(--color-blue-500)' }}>{fmt(kpi.usedI)}</span>
                        <span style={{ fontSize: '0.72rem', color: '#94a3b8' }}>Prévu : {fmt(kpi.plannedI)}</span>
                      </div>
                      <div style={card}>
                        <span style={label}>Montant total prévu</span>
                        <span style={value}>{fmt(kpi.planned)}</span>
                        <span style={{ fontSize: '0.72rem', color: '#94a3b8' }}>F {fmt(kpi.plannedF)} · I {fmt(kpi.plannedI)}</span>
                      </div>
                      <div style={card}>
                        <span style={label}>Réalisation globale</span>
                        <span style={{ ...value, color: pct > 100 ? '#ef4444' : 'var(--color-navy)' }}>{Math.round(pct)}%</span>
                        <div className="progress-track" style={{ marginTop: '2px' }}>
                          <div className="progress-bar" style={{ width: `${Math.min(pct, 100)}%`, backgroundColor: pct > 100 ? '#ef4444' : 'var(--color-green-500)' }} />
                        </div>
                      </div>
                    </div>
                  );
                })()}

                {view === 'operations' && opsChartData.length > 0 && (
                  <div className="table-card" style={{ marginBottom: '1rem' }}>
                    <div style={{ padding: '1.25rem', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <h3 style={{ margin: 0, color: 'var(--color-navy)', fontSize: '1.1rem', fontWeight: 700 }}>Évolution cumulée des commandes affectées aux opérations</h3>
                      <span style={{ fontSize: '0.8rem', color: '#64748b', fontStyle: 'italic' }}>* S'adapte aux filtres (section, service, nature, recherche)</span>
                    </div>
                    <div style={{ padding: '1.5rem', height: '340px' }}>
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={opsChartData}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                          <XAxis dataKey="week" axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 12 }} dy={10} />
                          <YAxis axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 12 }} tickFormatter={(val) => `${(val / 1000).toFixed(0)}k€`} />
                          <Tooltip formatter={(value: any) => [new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(value), '']} contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                          <Legend wrapperStyle={{ paddingTop: '20px' }} />
                          <Line type="monotone" dataKey="total" name="Total" stroke="#0f172a" strokeWidth={3} dot={false} activeDot={{ r: 6 }} />
                          <Line type="monotone" dataKey="fonctionnement" name="Fonctionnement" stroke="#22c55e" strokeWidth={2} dot={false} activeDot={{ r: 5 }} />
                          <Line type="monotone" dataKey="investissement" name="Investissement" stroke="#3b82f6" strokeWidth={2} dot={false} activeDot={{ r: 5 }} />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                )}

                <div className="table-card">
                  <div className="table-responsive">
                    <table className="modern-table table-bordered">
                      <thead>
                        <tr>
                            {view === 'operations' && <th key="__expand" style={{ width: '32px', minWidth: '32px', padding: '10px 4px' }}></th>}
                          {(() => {
                            let cols = [...visibleColumns];
                            if (view === 'orders') {
                              cols = cols.filter(c => c !== 'operation_label');
                            }
                            return cols.map(col => (
                              <th key={col}>
                                <div className="th-wrapper">
                                  <div className="th-content" onClick={() => requestSort(col)}>
                                    {col}
                                    {sortConfig?.key === col && (
                                      <span className="sort-indicator">{sortConfig.direction === 'asc' ? ' ↑' : ' ↓'}</span>
                                    )}
                                  </div>
                                  {DROPDOWN_FILTER_COLS.includes(col) && (col === 'Section' || (filterOptions[col]?.length)) ? (
                                    <select
                                      value={columnFilters[col] || ''}
                                      onChange={(e) => handleColumnFilterChange(col, e.target.value)}
                                      onClick={(e) => e.stopPropagation()}
                                      className="col-filter-input"
                                    >
                                      <option value="">Tous</option>
                                      {col === 'Section'
                                        ? ([['F', 'Fonctionnement'], ['I', 'Investissement']] as [string, string][])
                                            .filter(([v]) => !(filterOptions['Section']?.length) || filterOptions['Section'].includes(v))
                                            .map(([v, l]) => (<option key={v} value={v}>{l}</option>))
                                        : (filterOptions[col] || []).map(v => (<option key={v} value={v}>{v}</option>))}
                                    </select>
                                  ) : (
                                    <input
                                      type="text"
                                      placeholder="Filtrer..."
                                      value={columnFilters[col] || ''}
                                      onChange={(e) => handleColumnFilterChange(col, e.target.value)}
                                      onClick={(e) => e.stopPropagation()}
                                      className="col-filter-input"
                                    />
                                  )}
                                </div>
                              </th>
                            ));
                          })()}
                          {view === 'orders' && <th style={{ whiteSpace: 'nowrap', minWidth: '110px' }}>Opération</th>}
                        </tr>
                      </thead>
                      <tbody>
                        {filteredData.length > 0 ? filteredData.map((row: any, index: number) => {
                          const hasLines = (view === 'orders' || (view === 'lines' && row._isGroup)) && row._lines && row._lines.length > 0;
                          const linesCount = hasLines ? row._lines.length : 0;
                          
                          let isExpandable = false;
                          let isExpanded = false;

                          if (view === 'orders') {
                            const firstLineDesc = hasLines ? row._lines[0].desc?.trim() : '';
                            const globalLabel = (row['Libellé'] || row.label || '').trim();
                            isExpandable = hasLines && (linesCount > 1 || (linesCount === 1 && firstLineDesc !== globalLabel));
                            isExpanded = expandedOrders.includes(row.id || index.toString());
                          } else if (view === 'lines') {
                            isExpandable = hasLines && linesCount > 1;
                            isExpanded = expandedLines.includes(row['Libellé'] || index.toString());
                          } else if (view === 'operations') {
                            isExpandable = true;
                            isExpanded = expandedOps.has(row.id);
                          }

                          const opsChild = view === 'operations' && expandedOps.has(row.id) ? opsCommandsData[row.id] : null;
                          
                          const rowSection = row.Section || row.section || (view === 'operations' ? getSectionFromM57(row['C. Nature']) : '');
                          const isRowCompleted = view === 'operations' && (row['Terminé'] || '').toString().toUpperCase() === 'OUI';

                          return (
                            <React.Fragment key={row.id || index}>
                              <tr 
                                className={`${getRowClass(rowSection)} ${row._isChapter ? 'chapter-header-row' : ''} ${isRowCompleted ? 'row-completed' : ''}`}
                                onClick={() => {
                                  if (isExpandable) {
                                    if (view === 'orders') toggleExpand(row.id || index.toString());
                                    else toggleExpandLine(row['Libellé'] || index.toString());
                                  }
                                }}
                                style={{ 
                                  cursor: isExpandable ? 'pointer' : 'default',
                                  backgroundColor: row._isChapter ? '#f1f5f9' : undefined,
                                  fontWeight: row._isChapter ? 'bold' : 'normal'
                                }}
                              >
                                {view === 'operations' && (
                                  <td style={{ textAlign: 'center', verticalAlign: 'middle', width: '32px', padding: '4px' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}>
                                      <button className="icon-btn" onClick={(e) => { e.stopPropagation(); toggleExpandedOp(row.id); }}
                                        style={{ width: '28px', height: '28px', cursor: 'pointer' }} title="Voir les commandes liées">
                                        {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                                      </button>
                                      {(() => {
                                        const cnt = parseInt(row.orders_count ?? 0, 10) || 0;
                                        return (
                                          <span
                                            title={`${cnt} commande${cnt > 1 ? 's' : ''} associée${cnt > 1 ? 's' : ''}`}
                                            style={{
                                              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                                              minWidth: '20px', height: '20px', padding: '0 6px', borderRadius: '10px',
                                              fontSize: '0.7rem', fontWeight: 700, lineHeight: 1,
                                              background: cnt > 0 ? 'var(--color-navy)' : '#e2e8f0',
                                              color: cnt > 0 ? 'white' : '#94a3b8'
                                            }}
                                          >
                                            {cnt}
                                          </span>
                                        );
                                      })()}
                                    </div>
                                  </td>
                                )}
                                {(() => {
                                  let cols = [...visibleColumns];
                                  if (view === 'orders') {
                                    cols = cols.filter(c => c !== 'operation_label');
                                  }
                                  const isOrderSection = view === 'orders';
                                  const isInvoiceSection = view === 'invoices';
                                  
                                    const idKeys = ['N° Commande', 'order_number', 'N°', 'num', 'id', 'COMMANDE_COMMANDE', 'command_id'];
                                  const labelKeys = ['COMMANDE_LIBELLE', 'Libellé', 'description', 'label'];
                                  const specialBtnCol = cols.find(c => idKeys.includes(c.trim())) || cols.find(c => labelKeys.includes(c.trim()));

                                  return cols.map(col => {
                                  let content: React.ReactNode = row[col];
                                  let tooltip = '';
                                  let cellStyle: React.CSSProperties = {};

                                  const isCellEditing = view === 'operations' && editingCell?.id === row.id && editingCell?.key === col;

                                  if (isCellEditing) {
                                    if (['Montant prévu', 'Solde'].includes(col)) {
                                      content = (
                                        <input 
                                          autoFocus
                                          type="number" 
                                          style={{ width: '80px', padding: '4px' }}
                                          value={cellValue}
                                          onChange={(e) => setCellValue(e.target.value)}
                                          onBlur={() => handleCellUpdate(row, col, parseFloat(cellValue) || 0)}
                                          onKeyDown={(e) => {
                                            if (e.key === 'Enter') handleCellUpdate(row, col, parseFloat(cellValue) || 0);
                                            if (e.key === 'Escape') setEditingCell(null);
                                          }}
                                        />
                                      );
                                    } else if (col === 'Terminé') {
                                      content = (
                                        <select 
                                          autoFocus
                                          value={cellValue}
                                          onChange={(e) => setCellValue(e.target.value)}
                                          onBlur={() => handleCellUpdate(row, col, cellValue)}
                                          onKeyDown={(e) => {
                                            if (e.key === 'Enter') handleCellUpdate(row, col, cellValue);
                                            if (e.key === 'Escape') setEditingCell(null);
                                          }}
                                        >
                                          <option value="OUI">OUI</option>
                                          <option value="NON">NON</option>
                                        </select>
                                      );
                                    } else {
                                      content = (
                                        <input 
                                          autoFocus
                                          type="text" 
                                          style={{ width: '100%', padding: '4px' }}
                                          value={cellValue}
                                          onChange={(e) => setCellValue(e.target.value)}
                                          onBlur={() => handleCellUpdate(row, col, cellValue)}
                                          onKeyDown={(e) => {
                                            if (e.key === 'Enter') handleCellUpdate(row, col, cellValue);
                                            if (e.key === 'Escape') setEditingCell(null);
                                          }}
                                        />
                                      );
                                    }
                                  } else {
                                    if (col === 'Section' || col === 'section') {
                                      let sec = col === 'section' && view === 'operations' ? rowSection : (row[col] || row['section'] || row['Section']);
                                      // If section doesn't exist in row, get it from the first line
                                      if (!sec && view === 'orders' && row._lines && row._lines.length > 0) {
                                        sec = row._lines[0].section || row._lines[0].Section;
                                      }
                                      if (sec) {
                                        content = (
                                          <span className={`section-badge ${(sec === 'Fonctionnement' || sec === 'F') ? 'f' : 'i'}`}>
                                            {(sec === 'Fonctionnement' || sec === 'F') ? 'F' : 'I'}
                                          </span>
                                        );
                                      }
                                    } else if (col === 'used_amount' || col === 'Montant utilisé') {
                                      const used = parseFloat(row[col] || 0);
                                      const planned = parseFloat(row['Montant prévu'] || row['montant_prevu'] || 0);
                                      const percent = planned > 0 ? (used / planned) * 100 : 0;
                                      
                                      let barColor = 'var(--color-green-500)';
                                      if (percent > 100) barColor = '#ef4444'; // Red
                                      else if (percent > 75) barColor = '#f97316'; // Orange
                                      else if (percent > 50) barColor = '#eab308'; // Yellow/Gold
                                      
                                      content = (
                                        <div className="progress-cell">
                                          <div className="progress-info">
                                            <span className="amount-used">{used.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })}</span>
                                            <span className="percent-label" style={{ color: percent > 100 ? '#ef4444' : 'inherit' }}>{Math.round(percent)}%</span>
                                          </div>
                                          <div className="progress-track">
                                            <div 
                                              className="progress-bar" 
                                              style={{ 
                                                width: `${Math.min(percent, 100)}%`, 
                                                backgroundColor: barColor,
                                                boxShadow: percent > 100 ? '0 0 8px rgba(239, 68, 68, 0.4)' : 'none'
                                              }} 
                                            />
                                          </div>
                                        </div>
                                      );
                                    } else if (col === 'status' || col === 'Etat' || col === 'termine' || col === 'Terminé') {
                                      const val = row[col];
                                      const isDone = val === 'Payée' || val === 'OUI' || val === 1;
                                      content = <span className={`badge ${isDone ? 'success' : 'status'}`}>{val}</span>;
                                    } else if (
                                      col === 'Montant HT' || col === 'amount_ht' || 
                                      col === 'montant_prevu' || col === 'allocated_amount' ||
                                      col === 'Budget voté' || col === 'Disponible' ||
                                      col === 'Mt. prévision' || col === 'Mt. pré-engagé' ||
                                      col === 'Mt. engagé' || col === 'Mt. facturé' ||
                                      col === 'Mt. pré-mandaté' || col === 'Mt. mandaté' ||
                                      col === 'Mt. payé' || col === 'Montant prévu' ||
                                      col.toUpperCase().includes('MONTANT') || col.toUpperCase().includes('TOTAL')
                                    ) {
                                      const val = view === 'orders' ? (row[col] || row._total_ht) : row[col];
                                      content = <span style={cellStyle}>{(parseFloat(String(val).replace(',', '.')) || 0).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })}</span>;
                                    } else if (col === 'Montant TTC' || col === 'amount_ttc' || col === 'solde' || col === 'Solde') {
                                      const val = view === 'orders' ? (row[col] || row._total_ttc) : row[col];
                                      content = <span style={cellStyle}>{(parseFloat(String(val).replace(',', '.')) || 0).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })}</span>;
                                    } else if (
                                      col === 'date' || 
                                      col === 'Date de la commande' ||
                                      col.toUpperCase().includes('DATE') ||
                                      ['Emission', 'Arrivée', 'Début DGP', 'Fin DGP', 'Date Réception Pièce', 'Date Suspension'].includes(col.trim())
                                    ) {
                                      const d = parseExcelDate(row[col]);
                                      if (d) {
                                        content = d.toLocaleDateString('fr-FR', { year: 'numeric', month: '2-digit', day: '2-digit' });
                                      } else {
                                        content = row[col];
                                      }
                                    }
                                    else if (col === 'Libellé' || col === 'label' || col === 'libelle' || col === 'Nom' || col === 'LIBELLE' || col.includes('LIBELLE')) {
                                      tooltip = row[col];
                                      content = (
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                          {isExpandable && view === 'lines' && (
                                            <span style={{ fontSize: '12px', color: '#64748b' }}>
                                              {isExpanded ? 'â–¼' : 'â–¶'} ({linesCount})
                                            </span>
                                          )}
                                          <span style={{ maxWidth: '450px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                            {row[col]}
                                          </span>
                                        </div>
                                      );
                                      cellStyle = { ...cellStyle, maxWidth: '450px', minWidth: '300px' };
                                    }
                                    else if (col === 'Désignation' || col === 'description' || col.includes('DESIGNATION')) {
                                      if (view === 'orders') {
                                        const firstLineDesc = hasLines ? row._lines[0].desc?.trim() : '';
                                        content = (
                                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            {isExpandable && (
                                              <span style={{ fontSize: '12px', color: '#64748b' }}>
                                                {isExpanded ? 'â–¼' : 'â–¶'} {linesCount > 1 ? `(${linesCount} lignes)` : ''}
                                              </span>
                                            )}
                                            <span style={{ maxWidth: '450px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={firstLineDesc || row.description}>
                                              {firstLineDesc || row.description}
                                            </span>
                                          </div>
                                        );
                                        cellStyle = { ...cellStyle, maxWidth: '450px', minWidth: '300px' };
                                      }
                                    }
                                    else if (col === 'operation_label') {
                                      const label = row.operation_label;
                                      if (label) {
                                        content = (
                                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            <span style={{ fontWeight: 600, color: 'var(--color-navy)' }}>{label}</span>
                                            {isAuthorizedToEdit && (
                                              <button 
                                                className="icon-btn" 
                                                style={{ padding: '2px', color: 'var(--color-ivry)' }}
                                                onClick={(e) => {
                                                  e.stopPropagation();
                                                  setSelectedOrderForOp(row);
                                                  handleAssignOperation(null);
                                                }}
                                                title="Désaffecter l'opération"
                                              >
                                                <X size={14} />
                                              </button>
                                            )}
                                          </div>
                                        );
                                      } else {
                                        content = (
                                          <button 
                                            className="toolbar-btn" 
                                            style={{ padding: '4px 8px', fontSize: '0.75rem', background: 'var(--color-navy)', color: 'white' }}
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              setSelectedOrderForOp(row);
                                              setShowOpSelector(true);
                                            }}
                                          >
                                            <Plus size={12} /> Affecter
                                          </button>
                                        );
                                      }
                                    }
                                    else if (
                                      (isOrderSection || isInvoiceSection) && 
                                      col === specialBtnCol
                                    ) {
                                      const isOrder = isOrderSection;
                                      const targetId = row[col]?.toString();
                                      const seditId = row['COMMANDE_ROO_IMA_REF'];
                                      content = (
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                          <button 
                                            className="icon-btn" 
                                            style={{ padding: '2px', color: 'var(--color-navy)' }}
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              handleOpenAttachments(isOrder ? 'order' : 'invoice', targetId);
                                            }}
                                            title="Gérer les pièces jointes"
                                          >
                                            <FileText size={16} />
                                          </button>
                                          {isOrder && seditId && (
                                            <button 
                                              className="icon-btn" 
                                              style={{ padding: '2px', color: '#3b82f6' }}
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                const url = `${urlSedit}/FicheCommande.html?commandeId=${seditId}`;
                                                window.open(url, '_blank');
                                              }}
                                              title="Ouvrir dans Sedit"
                                            >
                                              <ExternalLink size={16} />
                                            </button>
                                          )}
                                          <span>{row[col]}</span>
                                        </div>
                                      );
                                    }
                                    else if (col === 'nature' || col === 'Article par nature' || col === 'C. Nature') {

                                      tooltip = getM57Label(row[col], 'nature');
                                      cellStyle = { ...cellStyle, textDecoration: 'underline dotted', cursor: 'help' };
                                    } else if (col === 'fonction' || col === 'Article par fonction' || col === 'C. Fonc.') {
                                      tooltip = getM57Label(row[col], 'fonction');
                                      cellStyle = { ...cellStyle, textDecoration: 'underline dotted', cursor: 'help' };
                                    }
                                  }

                                  return (
                                    <td 
                                      key={col} 
                                      style={{ ...cellStyle, ...(isCellEditing ? { padding: '4px' } : {}) }} 
                                      title={!isCellEditing ? (tooltip || row[col] || '') : undefined}
                                      onDoubleClick={() => {
                                        if (view === 'operations' && isAuthorizedToEdit && col !== 'used_amount' && col !== 'Montant utilisé') {
                                          setEditingCell({ id: row.id, key: col });
                                          setCellValue(row[col] || '');
                                        }
                                      }}
                                    >
                                      {content}
                                    </td>
                                  );
                                });
                                })()}

                                {view === 'orders' && (
                                  <td style={{ whiteSpace: 'nowrap' }}>
                                    {row.operation_label ? (
                                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <span style={{ fontWeight: 600, color: 'var(--color-navy)', fontSize: '0.85rem' }}>{row.operation_label}</span>
                                        {isAuthorizedToEdit && (
                                          <button
                                            className="icon-btn"
                                            style={{ padding: '2px', color: 'var(--color-ivry)' }}
                                            onClick={(e) => { e.stopPropagation(); setSelectedOrderForOp(row); handleAssignOperation(null); }}
                                            title="Désaffecter l'opération"
                                          >
                                            <X size={14} />
                                          </button>
                                        )}
                                      </div>
                                    ) : (
                                      <button
                                        className="toolbar-btn"
                                        style={{ padding: '4px 8px', fontSize: '0.75rem', background: 'var(--color-navy)', color: 'white' }}
                                        onClick={(e) => { e.stopPropagation(); setSelectedOrderForOp(row); setShowOpSelector(true); }}
                                      >
                                        <Plus size={12} /> Affecter
                                      </button>
                                    )}
                                  </td>
                                )}

                                {view === 'operations' && isAuthorizedToEdit && (
                                  <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                                    <button className="icon-btn" onClick={() => handleDeleteOp(row.id)} style={{ color: 'var(--color-ivry)' }} title="Supprimer l'opération">
                                      <Trash2 size={16}/>
                                    </button>
                                  </td>
                                )}
                              </tr>
                              {isExpandable && isExpanded && view === 'orders' && (
                                <tr className="expanded-row-bg" style={{ backgroundColor: '#f1f5f9' }}>
                                  <td colSpan={visibleColumns.length} style={{ padding: '10px 20px' }}>
                                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                                      <thead>
                                        <tr style={{ color: '#64748b', borderBottom: '1px solid #cbd5e1' }}>
                                          <th style={{ padding: '4px', textAlign: 'center' }}>N° Ligne</th>
                                          <th style={{ padding: '4px' }}>Description</th>
                                          <th style={{ padding: '4px' }}>Nature</th>
                                          <th style={{ padding: '4px' }}>Fonction</th>
                                          <th style={{ padding: '4px', textAlign: 'right' }}>Montant TTC</th>
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {row._lines.map((line: any, idx: number) => (
                                          <tr key={idx} style={{ borderBottom: '1px dashed #e2e8f0' }}>
                                            <td style={{ padding: '4px', textAlign: 'center', fontWeight: 'bold' }}>{line.nr}</td>
                                            <td style={{ padding: '4px' }}>{line.desc}</td>
                                            <td style={{ padding: '4px' }} title={getM57Label(line.nature, 'nature')}>{line.nature}</td>
                                            <td style={{ padding: '4px' }} title={getM57Label(line.fonction, 'fonction')}>{line.fonction}</td>
                                            <td style={{ padding: '4px', textAlign: 'right', fontWeight: 'bold', color: 'var(--color-ivry)' }}>
                                              {line.amtTtc.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })}
                                            </td>
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                  </td>
                                </tr>
                              )}
                              {isExpandable && isExpanded && view === 'lines' && (
                                <tr className="expanded-row-bg" style={{ backgroundColor: '#f8fafc' }}>
                                  <td colSpan={visibleColumns.length} style={{ padding: '10px 20px' }}>
                                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                                      <thead>
                                        <tr style={{ color: '#64748b', borderBottom: '1px solid #cbd5e1' }}>
                                          <th style={{ padding: '4px' }}>Code</th>
                                          <th style={{ padding: '4px' }}>Masque</th>
                                          <th style={{ padding: '4px', textAlign: 'right' }}>Budget Voté</th>
                                          <th style={{ padding: '4px', textAlign: 'right' }}>Disponible</th>
                                          <th style={{ padding: '4px', textAlign: 'right' }}>Mt. Engagé</th>
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {row._lines.map((line: any, idx: number) => (
                                          <tr key={idx} style={{ borderBottom: '1px dashed #e2e8f0' }}>
                                            <td style={{ padding: '4px', fontWeight: 'bold' }}>{line['Code']}</td>
                                            <td style={{ padding: '4px' }}>{line['Masque']}</td>
                                            <td style={{ padding: '4px', textAlign: 'right' }}>{(parseFloat(line['Budget voté']) || 0).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })}</td>
                                            <td style={{ padding: '4px', textAlign: 'right' }}>{(parseFloat(line['Disponible']) || 0).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })}</td>
                                            <td style={{ padding: '4px', textAlign: 'right' }}>{(parseFloat(line['Mt. engagé']) || 0).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })}</td>
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                  </td>
                                </tr>
                              )}
                              {isExpanded && view === 'operations' && opsChild && (
                                <tr className="expanded-row-bg" style={{ backgroundColor: '#f8fafc' }}>
                                  <td colSpan={visibleColumns.length + 1} style={{ padding: '10px 20px' }}>
                                    {opsChild.rows.length === 0 ? (
                                      <span style={{ color: '#94a3b8', fontSize: '0.8rem' }}>Aucune commande associée.</span>
                                    ) : (
                                      <>
                                        <div style={{ display: 'flex', justifyContent: 'flex-end', paddingBottom: '4px' }}>
                                          <div style={{ position: 'relative' }}>
                                            <button className="mdt-col-btn" style={{ fontSize: '0.7rem', padding: '2px 8px' }}
                                              onClick={() => {
                                                const el = document.getElementById(`ops-child-cols`);
                                                if (el) el.style.display = el.style.display === 'none' ? 'block' : 'none';
                                              }}>
                                              <Columns size={12} /> Colonnes
                                            </button>
                                            <div id="ops-child-cols" className="mdt-col-dropdown" style={{ display: 'none', right: 0, left: 'auto', minWidth: '150px' }}>
                                              {opsChild.columns.map((cc: any) => {
                                                const cur = opsCmdVisibleCols.length > 0 ? opsCmdVisibleCols : opsChild.columns.map((c: any) => c.name);
                                                return (
                                                  <label key={cc.name} className="mdt-col-item">
                                                    <input type="checkbox" checked={cur.includes(cc.name)}
                                                      onChange={e => {
                                                        const next = e.target.checked ? [...cur, cc.name] : cur.filter((n: string) => n !== cc.name);
                                                        setOpsCmdVisibleCols(next);
                                                      }} />
                                                    <span>{cc.name}</span>
                                                  </label>
                                                );
                                              })}
                                            </div>
                                          </div>
                                        </div>
                                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                                          <thead>
                                            <tr style={{ color: '#64748b', borderBottom: '1px solid #cbd5e1' }}>
                                              {(opsCmdVisibleCols.length > 0 ? opsCmdVisibleCols : opsChild.columns.map((c: any) => c.name)).map((cn: string) => (
                                                <th key={cn} style={{ padding: '4px', whiteSpace: 'nowrap' }}>{cn}</th>
                                              ))}
                                            </tr>
                                          </thead>
                                          <tbody>
                                            {opsChild.rows.map((cr: any, ci: number) => (
                                              <tr key={ci} style={{ borderBottom: '1px dashed #e2e8f0' }}>
                                                {(opsCmdVisibleCols.length > 0 ? opsCmdVisibleCols : opsChild.columns.map((c: any) => c.name)).map((cn: string) => (
                                                  <td key={cn} style={{ padding: '4px' }}>{cr[cn]}</td>
                                                ))}
                                              </tr>
                                            ))}
                                          </tbody>
                                        </table>
                                      </>
                                    )}
                                  </td>
                                </tr>
                              )}
                            </React.Fragment>
                          );
                        }) : (
                          <tr>
                            <td colSpan={visibleColumns.length || 1} className="empty-state">
                              Aucune donnée ne correspond à vos critères.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}
            {view === 'gestion' && (
              <div className="gestion-view animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '2.5rem' }}>
                <div className="glass-card" style={{ padding: '2rem' }}>
                   <BudgetManagementTab />
                </div>
</div>
                    )}
            {view === 'tiers' && (
              <div className="animate-fade-in">
                <MappedDataTable rubriqueName="Tiers" title="Tiers" fiscalYear={currentFiscalYear}
                  onOpenColumnSettings={() => setShowColumnSelector(true)}
                  columnStyles={tierColumnStyles}
                  onColumnsReady={(cols) => setMappedColumns(prev => ({ ...prev, 'Tiers': cols }))} />
              </div>
            )}
            {view === 'orders' && (
              <div className="animate-fade-in">
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
                  <button
                    className={`toolbar-btn ${sectionFilter === 'F' ? 'active' : ''}`}
                    onClick={() => setSectionFilter(sectionFilter === 'F' ? 'all' : 'F')}
                    style={{ 
                      background: sectionFilter === 'F' ? 'var(--color-green-500)' : 'white', 
                      color: sectionFilter === 'F' ? 'white' : 'inherit',
                      borderColor: sectionFilter === 'F' ? 'var(--color-green-500)' : 'var(--color-slate-200)'
                    }}
                  >
                    Fonc.
                  </button>
                  <button
                    className={`toolbar-btn ${sectionFilter === 'I' ? 'active' : ''}`}
                    onClick={() => setSectionFilter(sectionFilter === 'I' ? 'all' : 'I')}
                    style={{ 
                      background: sectionFilter === 'I' ? 'var(--color-blue-500)' : 'white', 
                      color: sectionFilter === 'I' ? 'white' : 'inherit',
                      borderColor: sectionFilter === 'I' ? 'var(--color-blue-500)' : 'var(--color-slate-200)'
                    }}
                  >
                    Inv.
                  </button>
                </div>
                <MappedDataTable rubriqueName="Commandes" title="Commandes" fiscalYear={currentFiscalYear}
                  onOpenColumnSettings={() => setShowColumnSelector(true)}
                  columnStyles={orderColumnStyles}
                  visibleColumns={orderColumns}
                  sectionFilter={sectionFilter}
                  onColumnsReady={(cols) => setMappedColumns(prev => ({ ...prev, 'Commandes': cols }))} />
              </div>
            )}
            {view === 'invoices' && (
              <div className="animate-fade-in">
                <MappedDataTable rubriqueName="Factures" title="Factures" fiscalYear={currentFiscalYear}
                  onOpenColumnSettings={() => setShowColumnSelector(true)}
                  columnStyles={invoiceColumnStyles}
                  visibleColumns={invoiceColumns}
                  onColumnsReady={(cols) => setMappedColumns(prev => ({ ...prev, 'Factures': cols }))} />
              </div>
            )}
            {['orders', 'invoices', 'operations', 'tiers'].includes(view) && (
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '1rem' }}>
                <button
                  className="toolbar-btn"
                  onClick={() => setShowColumnSelector(true)}
                  title="Choisir les colonnes"
                  style={{ display: 'flex', alignItems: 'center', gap: '4px' }}
                >
                  <Columns size={16} />
                  Colonnes
                </button>
              </div>
            )}
                  </div>
        )}
        {showColumnSelector && (() => {
          const mappedCols = mappedColumns[view === 'tiers' ? 'Tiers' : view === 'orders' ? 'Commandes' : view === 'invoices' ? 'Factures' : 'Opérations'] || [];
          const currentCols = view === 'orders' ? orderColumns : view === 'invoices' ? invoiceColumns : view === 'operations' ? opColumns : [];
          const setCurrentCols: React.Dispatch<React.SetStateAction<string[]>> | null = view === 'orders' ? setOrderColumns : view === 'invoices' ? setInvoiceColumns : view === 'operations' ? setOpColumns : null;
          const storageKey = view === 'orders' ? 'orders' : view === 'invoices' ? 'invoices' : view === 'operations' ? 'operations' : '';
          const isTiers = view === 'tiers';
          const COLORS = ['', '#ef4444', '#f97316', '#eab308', '#22c55e', '#06b6d4', '#3b82f6', '#8b5cf6', '#ec4899', '#64748b'];
          return (
            <div className="modal-backdrop" onClick={() => { setShowColumnSelector(false); setColorPickerCol(null); }}>
              <div className="modal-window modal-lg" onClick={e => e.stopPropagation()} style={{ maxWidth: '600px' }}>
                <div className="modal-header">
                  <h2 className="modal-title">Personnaliser les colonnes</h2>
                  <button className="icon-btn" onClick={() => { setShowColumnSelector(false); setColorPickerCol(null); }}><X size={20} /></button>
                </div>
                <div className="modal-body" style={{ maxHeight: '60vh', overflowY: 'auto' }}>
                  {mappedCols.length === 0 ? (
                    <p style={{ color: '#94a3b8', fontSize: '0.9rem' }}>Aucune colonne configurée.</p>
                  ) : (
                    mappedCols.map((col) => {
                      const style = getColumnStyle(col);
                      const isVisible = currentCols.includes(col) || isTiers;
                      return (
                        <div key={col}
                          draggable
                          onDragStart={() => setDragCol(col)}
                          onDragOver={(e) => { e.preventDefault(); setDragOverCol(col); }}
                          onDrop={() => {
                            if (!dragCol || dragCol === col || !setCurrentCols || !storageKey) { setDragCol(null); setDragOverCol(null); return; }
                            const next = [...currentCols];
                            const fromIdx = next.indexOf(dragCol);
                            const toIdx = next.indexOf(col);
                            if (fromIdx === -1 || toIdx === -1) { setDragCol(null); setDragOverCol(null); return; }
                            next.splice(fromIdx, 1);
                            next.splice(toIdx, 0, dragCol);
                            setCurrentCols(next);
                            setStoredColumns(storageKey, next);
                            setDragCol(null);
                            setDragOverCol(null);
                          }}
                          onDragEnd={() => { setDragCol(null); setDragOverCol(null); }}
                          style={{
                            display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 8px',
                            borderRadius: '6px', cursor: 'grab', userSelect: 'none',
                            background: dragOverCol === col && dragCol !== col ? '#f1f5f9' : 'transparent',
                            borderTop: dragOverCol === col && dragCol !== col ? '2px solid var(--color-blue-400)' : '2px solid transparent',
                            marginTop: '2px'
                          }}
                        >
                          <span style={{ color: '#94a3b8', fontSize: '14px' }}>⠿</span>
                          {!isTiers && setCurrentCols && (
                            <input
                              type="checkbox"
                              checked={isVisible}
                              onChange={() => {
                                const next = currentCols.includes(col)
                                  ? currentCols.filter(c => c !== col)
                                  : [...currentCols, col];
                                setCurrentCols(next);
                                setStoredColumns(storageKey, next);
                              }}
                              style={{ cursor: 'pointer' }}
                            />
                          )}
                          {isTiers && (
                            <input type="checkbox" checked disabled style={{ cursor: 'not-allowed', opacity: 0.5 }} />
                          )}
                          <span style={{ flex: 1, fontSize: '13px', fontWeight: style?.bold ? 'bold' : 'normal', color: style?.color || 'inherit' }}>
                            {col}
                          </span>
                          <button
                            className="icon-btn"
                            onClick={() => {
                              const existing = getColumnStyle(col);
                              if (existing?.bold) { removeColumnStyle(col); } else { setColumnStyle(col, { bold: true, color: existing?.color || '' }); }
                            }}
                            style={{ width: '28px', height: '28px', fontWeight: 'bold', fontSize: '13px', opacity: style?.bold ? 1 : 0.4 }}
                            title="Gras"
                          >
                            B
                          </button>
                          <div style={{ position: 'relative' }}>
                            <button
                              className="icon-btn"
                              onClick={(e) => { e.stopPropagation(); setColorPickerCol(colorPickerCol === col ? null : col); }}
                              style={{ width: '28px', height: '28px', color: style?.color || '#94a3b8', opacity: style?.color ? 1 : 0.4 }}
                              title="Couleur"
                            >
                              <Palette size={14} />
                            </button>
                            {colorPickerCol === col && (
                              <div style={{
                                position: 'absolute', right: 0, top: '100%', zIndex: 1100,
                                background: 'white', border: '1px solid var(--color-slate-200)',
                                borderRadius: '8px', padding: '6px', display: 'flex', gap: '4px',
                                flexWrap: 'wrap', width: '180px', boxShadow: '0 4px 12px rgba(0,0,0,0.15)'
                              }}>
                                {COLORS.map(c => (
                                  <div key={c || 'none'} onClick={(e) => { e.stopPropagation(); setColumnStyle(col, { bold: style?.bold || false, color: c }); setColorPickerCol(null); }}
                                    style={{
                                      width: '24px', height: '24px', borderRadius: '6px', cursor: 'pointer',
                                      background: c || 'transparent', border: c ? `2px solid ${c}` : '2px dashed #cbd5e1',
                                      outline: (style?.color || '') === c ? '2px solid var(--color-blue-400)' : 'none',
                                      outlineOffset: '2px'
                                    }}
                                    title={c || 'Aucune'}
                                  />
                                ))}
                              </div>
                    )}
                    {['orders', 'invoices', 'operations', 'tiers'].includes(view) && (
                      <button
                        className="toolbar-btn"
                        onClick={() => setShowColumnSelector(true)}
                        title="Choisir les colonnes"
                        style={{ display: 'flex', alignItems: 'center', gap: '4px' }}
                      >
                        <Columns size={14} />
                        Colonnes
                      </button>
                    )}
                  </div>
                </div>
                      );
                    })
                  )}
                </div>
              </div>
            </div>
          );
        })()}
        {showM57 && (
          <div className="modal-backdrop" onClick={() => setShowM57(false)}>
            <div className="modal-window" onClick={e => e.stopPropagation()}>
              <div className="modal-header">
                <h2 className="modal-title">Référentiel M57</h2>
                <button className="icon-btn" onClick={() => setShowM57(false)}><X size={20} /></button>
              </div>
              <div className="modal-body p-0">
                <div style={{ display: 'flex', borderBottom: '1px solid #e2e8f0' }}>
                  <button 
                    style={{ flex: 1, padding: '10px', background: m57View === 'nature' ? '#f1f5f9' : 'white', border: 'none', borderBottom: m57View === 'nature' ? '2px solid var(--color-navy)' : '2px solid transparent', fontWeight: m57View === 'nature' ? 'bold' : 'normal', cursor: 'pointer' }}
                    onClick={() => setM57View('nature')}
                  >
                    Natures
                  </button>
                  <button 
                    style={{ flex: 1, padding: '10px', background: m57View === 'fonction' ? '#f1f5f9' : 'white', border: 'none', borderBottom: m57View === 'fonction' ? '2px solid var(--color-navy)' : '2px solid transparent', fontWeight: m57View === 'fonction' ? 'bold' : 'normal', cursor: 'pointer' }}
                    onClick={() => setM57View('fonction')}
                  >
                    Fonctions
                  </button>
                </div>
                <div className="table-responsive max-h-[60vh]">
                  <table className="modern-table">
                    <thead>
                      <tr>
                        <th>Code</th>
                        <th>Libellé</th>
                        <th className="text-center">Section</th>
                      </tr>
                    </thead>
                    <tbody>
                      {m57Plan.filter(item => item.type === m57View || (!item.type && m57View === 'nature')).map(item => (
                        <tr key={item.id}>
                          <td className="font-bold text-secondary">{item.code}</td>
                          <td>{item.label}</td>
                          <td className="text-center">
                             <span className={`section-badge ${item.section === 'F' ? 'f' : 'i'}`}>
                              {item.section}
                            </span>
                          </td>
                        </tr>
                      ))}
                      {m57Plan.filter(item => item.type === m57View || (!item.type && m57View === 'nature')).length === 0 && (
                        <tr><td colSpan={3} className="text-center py-8 text-gray">Aucun code trouvé.</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        )}

        {showOpSelector && (
          <div className="modal-backdrop" onClick={() => setShowOpSelector(false)}>
            <div className="modal-window" onClick={e => e.stopPropagation()}>
              <div className="modal-header">
                <h2 className="modal-title">Affecter une opération</h2>
                <button className="icon-btn" onClick={() => setShowOpSelector(false)}><X size={20} /></button>
              </div>
              <div className="modal-body">
                <div className="search-input-wrapper" style={{ marginBottom: '1.5rem' }}>
                  <Search size={16} className="search-icon" />
                  <input 
                    type="text" 
                    placeholder="Filtrer les opérations (nom, service...)" 
                    value={opSearchTerm}
                    onChange={(e) => setOpSearchTerm(e.target.value)}
                    className="search-input"
                    style={{ width: '100%' }}
                    autoFocus
                  />
                </div>
                <div className="table-responsive" style={{ maxHeight: '50vh' }}>
                  <table className="modern-table">
                    <thead>
                      <tr>
                        <th>Opération</th>
                        <th>Service</th>
                        <th>Montant prévu</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr key="none">
                        <td colSpan={3} style={{ color: '#64748b', fontStyle: 'italic' }}>Aucune opération (Désaffecter)</td>
                        <td style={{ textAlign: 'right' }}>
                          <button 
                            className="toolbar-btn" 
                            style={{ padding: '4px 8px', fontSize: '0.75rem' }}
                            onClick={() => handleAssignOperation(null)}
                          >
                            Désaffecter
                          </button>
                        </td>
                      </tr>
                      {operations.filter(op => {
                        const s = opSearchTerm.toLowerCase();
                        return (op.LIBELLE || '').toLowerCase().includes(s) || 
                               (op.Service || '').toLowerCase().includes(s);
                      }).map(op => (
                        <tr key={op.id}>
                          <td style={{ fontWeight: 600 }}>{op.LIBELLE}</td>
                          <td style={{ fontSize: '0.8rem' }}>{op.Service}</td>
                          <td>{(op['Montant prévu'] || 0).toLocaleString()} €</td>
                          <td style={{ textAlign: 'right' }}>
                            <button 
                              className="toolbar-btn" 
                              style={{ padding: '4px 8px', fontSize: '0.75rem', background: 'var(--color-navy)', color: 'white' }}
                              onClick={() => handleAssignOperation(op.id)}
                            >
                              Choisir
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        )}

        {showAttachments && activeAttachmentTarget && (
          <div className="modal-backdrop" onClick={() => setShowAttachments(false)}>
            <div className="modal-window modal-lg" style={{ maxWidth: '1000px' }} onClick={e => e.stopPropagation()}>
              <div className="modal-header">
                <h2 className="modal-title">Pièce Jointe : {activeAttachmentTarget.id}</h2>
                <button className="icon-btn" onClick={() => setShowAttachments(false)}><X size={20} /></button>
              </div>
              <div className="modal-body" style={{ display: 'flex', gap: '20px', minHeight: '600px' }}>
                <div style={{ flex: '0 0 300px' }}>
                  <p style={{ fontSize: '0.9rem', color: '#64748b', marginBottom: '1.5rem' }}>
                    Identifiant unique : <strong>{activeAttachmentTarget.id}</strong>
                  </p>
                  
                  <div style={{ marginBottom: '20px' }}>
                    <label className="import-btn" style={{ width: '100%', justifyContent: 'center' }}>
                      {isUploading ? 'Envoi en cours...' : <><Upload size={16} /> Remplacer le fichier</>}
                      <input type="file" hidden onChange={handleUploadAttachment} disabled={isUploading} accept=".pdf" />
                    </label>
                  </div>

                  <div className="attachments-list">
                    {currentAttachments.length > 0 ? currentAttachments.map(att => (
                      <div key={att.id} style={{ padding: '15px', background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '10px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <FileText size={20} color="var(--color-navy)" />
                            <span style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--color-navy)', wordBreak: 'break-all' }}>
                              {att.original_name}
                            </span>
                          </div>
                          <button 
                            onClick={() => handleDeleteAttachment(att.id)}
                            style={{ border: 'none', background: 'transparent', color: '#ef4444', cursor: 'pointer' }}
                            title="Supprimer"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                        <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
                          <div>Ajouté par {att.username}</div>
                          <div>le {new Date(att.uploaded_at).toLocaleString()}</div>
                        </div>
                        
                        {activeAttachmentTarget?.type === 'order' && (
                          <button 
                            onClick={() => handleSendOrder(att.id)}
                            className="toolbar-btn"
                            style={{ width: '100%', marginTop: '15px', justifyContent: 'center', background: 'var(--color-ivry)', color: 'white', border: 'none' }}
                          >
                            <Send size={16} /> Envoyer au fournisseur
                          </button>
                        )}

                        <a 
                          href={`/${att.file_path}`} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="toolbar-btn"
                          style={{ width: '100%', marginTop: '10px', justifyContent: 'center', background: 'var(--color-navy)', color: 'white' }}
                        >
                          Ouvrir dans un onglet
                        </a>
                      </div>
                    )) : (
                      <div style={{ textAlign: 'center', padding: '40px 20px', background: '#f8fafc', borderRadius: '8px', border: '2px dashed #e2e8f0' }}>
                        <AlertCircle size={32} color="#cbd5e1" style={{ marginBottom: '10px' }} />
                        <p style={{ fontSize: '0.85rem', color: '#94a3b8', fontStyle: 'italic' }}>
                          Aucun PDF associé.
                        </p>
                      </div>
                    )}
                  </div>
                </div>

                <div style={{ flex: 1, background: '#f1f5f9', borderRadius: '8px', overflow: 'hidden', border: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {currentAttachments.length > 0 ? (
                    <iframe 
                      src={`/${currentAttachments[0].file_path}#toolbar=0`}
                      style={{ width: '100%', height: '100%', border: 'none' }}
                      title="Aperçu PDF"
                    />
                  ) : (
                    <div style={{ color: '#94a3b8', textAlign: 'center' }}>
                      <FileText size={48} style={{ marginBottom: '10px', opacity: 0.5 }} />
                      <p>Aperçu non disponible</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
        {showImportModal && (
          <div className="modal-backdrop" onClick={() => setShowImportModal(false)}>
            <div className="modal-window" style={{ maxWidth: '500px' }} onClick={e => e.stopPropagation()}>
              <div className="modal-header">
                <h2 className="modal-title">Paramètres de l'import</h2>
                <button className="icon-btn" onClick={() => setShowImportModal(false)}><X size={20} /></button>
              </div>
              <div className="modal-body">
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                  <p className="modal-desc">
                    Fichier : <strong>{pendingImportFile?.name}</strong><br/>
                    Veuillez confirmer le budget et l'année pour cet import.
                  </p>
                  
                  <div className="form-group">
                    <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 600, fontSize: '0.9rem' }}>Budget</label>
                    <select 
                      className="filter-select" 
                      style={{ width: '100%', border: '1px solid var(--color-slate-200)', padding: '0.5rem', borderRadius: '0.5rem' }}
                      value={selectedBudgetId}
                      onChange={(e) => setSelectedBudgetId(parseInt(e.target.value))}
                    >
                      <option value="">-- Sélectionner un budget --</option>
                      {availableBudgets.map(b => (
                        <option key={b.id} value={b.id}>{b.Libelle} ({b.Annee})</option>
                      ))}
                    </select>
                  </div>

                  <div className="form-group">
                    <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 600, fontSize: '0.9rem' }}>Année</label>
                    <input 
                      type="number" 
                      className="search-input" 
                      style={{ width: '100%' }}
                      value={selectedYear}
                      onChange={(e) => setSelectedYear(parseInt(e.target.value))}
                    />
                  </div>
                  <div className="toggle-group" style={{ display: 'inline-flex', background: 'var(--color-slate-100)', padding: '0.25rem', borderRadius: '0.75rem' }}>
                <button 
                  className={`toggle-btn ${budgetScope === 'Ville' ? 'active' : ''}`}
                  onClick={() => setBudgetScope('Ville')}
                >
                  Budget {budgetPrincipal}
                </button>
                <button 
                  className={`toggle-btn ${budgetScope === 'All' ? 'active' : ''}`}
                  onClick={() => setBudgetScope('All')}
                >
                  Tous budgets
                </button>
              </div>
                  <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem' }}>
                    <button 
                      className="toolbar-btn" 
                      style={{ flex: 1, justifyContent: 'center' }}
                      onClick={() => setShowImportModal(false)}
                    >
                      Annuler
                    </button>
                    <button 
                      className="toolbar-btn" 
                      style={{ flex: 1, justifyContent: 'center', background: 'var(--color-navy)', color: 'white' }}
                      onClick={confirmImport}
                      disabled={isUploading || !selectedBudgetId}
                    >
                      {isUploading ? 'Import en cours...' : 'Confirmer l\'import'}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

      <style>{`
        /* Page Layout */
        .budget-page {
          min-height: 100vh;
          background-color: #f8fafc;
          font-family: 'Inter', system-ui, -apple-system, sans-serif;
        }
        .main-content {
          max-width: 1600px;
          margin: 0 auto;
          padding: 1rem 1.5rem;
        }

        /* Typography & Colors */
        :root {
          --color-ivry: #e30613;
          --color-navy: #003366;
          --color-navy-light: #1a4c80;
          --color-slate-50: #f8fafc;
          --color-slate-100: #f1f5f9;
          --color-slate-200: #e2e8f0;
          --color-slate-300: #cbd5e1;
          --color-slate-600: #475569;
          --color-slate-700: #334155;
          --color-slate-800: #1e293b;
          --color-green-500: #22c55e;
          --color-green-50: #f0fdf4;
          --color-blue-500: #3b82f6;
          --color-blue-50: #eff6ff;
        }

        .text-primary { color: var(--color-ivry); }
        .text-secondary { color: var(--color-navy); }
        .text-gray { color: var(--color-slate-600); }
        .font-medium { font-weight: 500; }
        .font-bold { font-weight: 700; }
        .text-center { text-align: center; }
        .text-right { text-align: right; }
        .py-8 { padding-top: 2rem; padding-bottom: 2rem; }
        .p-0 { padding: 0 !important; }

        /* Header & Tabs */
        .page-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start; /* Changed to flex-start to align top */
          margin-bottom: 2rem;
          padding-bottom: 1.5rem;
          border-bottom: 1px solid var(--color-slate-200);
          flex-wrap: wrap; /* Allow wrapping on smaller screens */
          gap: 1.5rem; /* Space between elements */
        }
        .header-controls {
          display: flex;
          gap: 1rem;
          align-items: center;
          margin-left: auto; /* Push to the right */
        }
        .budget-scope-toggle {
          display: flex;
          background: white;
          padding: 0.25rem;
          border-radius: 0.5rem;
          box-shadow: 0 1px 3px rgba(0,0,0,0.1);
        }
        .budget-scope-toggle .toggle-btn {
          padding: 0.5rem 1rem;
          border-radius: 0.375rem;
          font-weight: 600;
          font-size: 0.875rem;
          color: var(--color-slate-600);
          background: transparent;
          border: none;
          transition: all 0.2s;
        }
        .budget-scope-toggle .toggle-btn:hover { background: var(--color-slate-50); color: var(--color-navy); }
        .budget-scope-toggle .toggle-btn.active {
          background: var(--color-navy);
          color: white;
          box-shadow: 0 1px 2px rgba(0,0,0,0.1);
        }

        .page-title {
          font-size: 1.875rem;
          font-weight: 700;
          color: var(--color-navy);
          margin: 0 0 0.5rem 0;
        }
        .page-subtitle {
          color: var(--color-slate-600);
          margin: 0;
          font-size: 0.95rem;
        }
        .view-tabs {
          display: flex;
          gap: 0.5rem;
          background: white;
          padding: 0.25rem;
          border-radius: 0.5rem;
          box-shadow: 0 1px 3px rgba(0,0,0,0.1);
        }
        .tab-btn {
          padding: 0.5rem 1rem;
          border-radius: 0.375rem;
          font-weight: 600;
          font-size: 0.875rem;
          color: var(--color-slate-600);
          background: transparent;
          border: none;
          transition: all 0.2s;
        }
        .tab-btn:hover { background: var(--color-slate-50); color: var(--color-navy); }
        .tab-btn.active {
          background: var(--color-navy);
          color: white;
          box-shadow: 0 1px 2px rgba(0,0,0,0.1);
        }
        .tab-btn.raw-toggle {
          color: var(--color-slate-500);
          font-family: monospace;
          border: 1px dashed var(--color-slate-300);
        }
        .tab-btn.raw-toggle.active {
          background: var(--color-slate-800);
          color: white;
          border-color: var(--color-slate-800);
        }

        /* Alerts */
        .alert {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          padding: 1rem;
          border-radius: 0.5rem;
          margin-bottom: 1.5rem;
          font-weight: 500;
          animation: slideIn 0.3s ease-out;
        }
        .alert-success {
          background-color: var(--color-green-50);
          color: var(--color-green-500);
          border: 1px solid #bbf7d0;
        }
        @keyframes slideIn {
          from { opacity: 0; transform: translateY(-10px); }
          to { opacity: 1; transform: translateY(0); }
        }

        /* Dashboard Grid */
        .dashboard-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
          gap: 1.5rem;
          margin-bottom: 2rem;
        }
        .dashboard-card {
          background: white;
          border-radius: 1rem;
          padding: 1.5rem;
          display: flex;
          align-items: center;
          gap: 1.25rem;
          box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 2px 4px -1px rgba(0, 0, 0, 0.03);
          border-top: 4px solid transparent;
          transition: transform 0.2s, box-shadow 0.2s;
        }
        .dashboard-card:hover {
          transform: translateY(-2px);
          box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05);
        }
        .dashboard-card.primary { border-top-color: var(--color-ivry); }
        .dashboard-card.secondary { border-top-color: var(--color-navy); }
        .dashboard-card.warning { border-top-color: #f59e0b; }
        .dashboard-card.neutral { border-top-color: var(--color-slate-400); }
        
        .card-icon {
          width: 3rem;
          height: 3rem;
          border-radius: 0.75rem;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .primary .card-icon { background: #fee2e2; color: var(--color-ivry); }
        .secondary .card-icon { background: var(--color-blue-50); color: var(--color-navy); }
        .warning .card-icon { background: #fef3c7; color: #d97706; }
        .neutral .card-icon { background: var(--color-slate-100); color: var(--color-slate-600); }

        .card-content { flex: 1; }
        .card-title {
          font-size: 0.875rem;
          color: var(--color-slate-500);
          margin: 0 0 0.25rem 0;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.025em;
        }
        .card-value {
          font-size: 1.5rem;
          font-weight: 800;
          color: var(--color-slate-800);
          margin: 0;
        }
        .card-subvalue { font-size: 0.875rem; font-weight: 500; color: var(--color-slate-400); }

        /* Toolbar & Imports */
        .import-toolbar {
          display: flex;
          align-items: center;
          gap: 1rem;
          margin-bottom: 1.5rem;
          background: white;
          padding: 1rem 1.5rem;
          border-radius: 0.75rem;
          box-shadow: 0 1px 2px rgba(0,0,0,0.05);
        }
        .import-label { font-weight: 600; color: var(--color-slate-700); font-size: 0.9rem; }
        .import-btn {
          display: inline-flex;
          align-items: center;
          gap: 0.5rem;
          background: var(--color-slate-50);
          color: var(--color-slate-700);
          padding: 0.5rem 1rem;
          border-radius: 0.5rem;
          border: 1px solid var(--color-slate-200);
          font-size: 0.875rem;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s;
        }
        .import-btn:hover { background: var(--color-slate-100); border-color: var(--color-slate-300); }

        .toolbar {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 1rem;
          flex-wrap: wrap;
          gap: 1rem;
        }
        .toolbar-actions { display: flex; gap: 0.5rem; }
        .toolbar-btn {
          display: inline-flex;
          align-items: center;
          gap: 0.5rem;
          padding: 0.5rem 1rem;
          background: white;
          border: 1px solid var(--color-slate-200);
          border-radius: 0.5rem;
          color: var(--color-slate-700);
          font-weight: 600;
          font-size: 0.875rem;
          box-shadow: 0 1px 2px rgba(0,0,0,0.05);
        }
        .toolbar-btn:hover { background: var(--color-slate-50); }
        
        .toolbar-filters { display: flex; gap: 0.75rem; }
        .search-input-wrapper {
          position: relative;
          display: flex;
          align-items: center;
        }
        .search-icon { position: absolute; left: 0.75rem; color: var(--color-slate-400); }
        .search-input {
          padding: 0.5rem 1rem 0.5rem 2.25rem;
          border: 1px solid var(--color-slate-200);
          border-radius: 0.5rem;
          font-size: 0.875rem;
          min-width: 250px;
          outline: none;
          box-shadow: 0 1px 2px rgba(0,0,0,0.05);
          transition: border-color 0.2s, box-shadow 0.2s;
        }
        .search-input:focus { border-color: var(--color-navy); box-shadow: 0 0 0 3px rgba(0, 51, 102, 0.1); }
        
        .select-wrapper {
          position: relative;
          display: flex;
          align-items: center;
          background: white;
          border: 1px solid var(--color-slate-200);
          border-radius: 0.5rem;
          padding: 0 0.75rem;
          box-shadow: 0 1px 2px rgba(0,0,0,0.05);
        }
        .select-icon { color: var(--color-slate-400); margin-right: 0.25rem; }
        .filter-select {
          border: none;
          background: transparent;
          padding: 0.5rem 0;
          font-size: 0.875rem;
          font-weight: 500;
          color: var(--color-slate-700);
          outline: none;
          cursor: pointer;
        }

        /* Modern Tables */
        .table-card {
          background: white;
          border-radius: 1rem;
          box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 2px 4px -1px rgba(0, 0, 0, 0.03);
          overflow: hidden;
          border: 1px solid var(--color-slate-200);
        }
        .table-responsive {
          max-height: calc(100vh - 300px);
          overflow: auto;
        }
        .table-responsive::-webkit-scrollbar { width: 8px; height: 8px; }
        .table-responsive::-webkit-scrollbar-track { background: var(--color-slate-50); }
        .table-responsive::-webkit-scrollbar-thumb { background: var(--color-slate-300); border-radius: 4px; }
        .table-responsive::-webkit-scrollbar-thumb:hover { background: var(--color-slate-400); }

        .modern-table {
          width: 100%;
          border-collapse: separate;
          border-spacing: 0;
          text-align: left;
        }
        .modern-table th {
          background: var(--color-slate-50);
          padding: 1rem;
          font-weight: 600;
          font-size: 0.75rem;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          color: var(--color-slate-500);
          position: sticky;
          top: 0;
          z-index: 10;
          border-bottom: 1px solid var(--color-slate-200);
        }
        .modern-table td {
          padding: 1rem;
          font-size: 0.875rem;
          border-bottom: 1px solid var(--color-slate-100);
          color: var(--color-slate-800);
          vertical-align: top;
        }
        .modern-table tbody tr:last-child td { border-bottom: none; }
        .modern-table tbody tr:hover { background-color: var(--color-slate-50); }

        .th-wrapper { display: flex; flex-direction: column; gap: 0.5rem; }
        .th-content {
          display: flex;
          align-items: center;
          cursor: pointer;
          user-select: none;
          transition: color 0.2s;
        }
        .th-content:hover { color: var(--color-navy); }
        .sort-indicator { color: var(--color-navy); margin-left: 0.25rem; font-weight: bold; }
        
        .col-filter-input {
          width: 100%;
          padding: 0.25rem 0.5rem;
          border: 1px solid var(--color-slate-200);
          border-radius: 0.25rem;
          font-size: 0.75rem;
          outline: none;
          background: white;
          font-weight: normal;
          text-transform: none;
          letter-spacing: normal;
        }
        .col-filter-input:focus { border-color: var(--color-blue-500); }

        /* Table Specific Content */
        .row-operating td { background-color: rgba(34, 197, 94, 0.03); }
        .row-investment td { background-color: rgba(59, 130, 246, 0.03); }
        
        .row-completed td {
          opacity: 0.6;
          background-color: #f1f5f9 !important;
          color: #64748b !important;
        }
        .row-completed .amount-ht, .row-completed .amount-ttc {
          color: #64748b !important;
          text-decoration: line-through;
        }
        
        .section-badge {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 1.75rem;
          height: 1.75rem;
          border-radius: 0.375rem;
          font-weight: 800;
          font-size: 0.75rem;
        }
        .section-badge.f { background: var(--color-green-50); color: var(--color-green-500); border: 1px solid #bbf7d0; }
        .section-badge.i { background: var(--color-blue-50); color: var(--color-blue-500); border: 1px solid #bfdbfe; }

        .progress-cell {
          display: flex;
          flex-direction: column;
          gap: 0.25rem;
          min-width: 140px;
        }
        .progress-info {
          display: flex;
          justify-content: space-between;
          align-items: center;
          font-size: 0.75rem;
          font-weight: 700;
        }
        .amount-used { color: var(--color-navy); }
        .percent-label { font-family: monospace; }
        .progress-track {
          width: 100%;
          height: 6px;
          background-color: var(--color-slate-100);
          border-radius: 999px;
          overflow: hidden;
        }
        .progress-bar {
          height: 100%;
          border-radius: 999px;
          transition: width 0.5s ease-out, background-color 0.3s;
        }

        .badge {
          padding: 0.25rem 0.5rem;
          border-radius: 9999px;
          font-size: 0.75rem;
          font-weight: 600;
          display: inline-block;
        }
        .badge.year { background: var(--color-slate-100); color: var(--color-slate-600); }
        .badge.status { background: var(--color-slate-100); color: var(--color-slate-700); }
        .badge.success { background: var(--color-green-50); color: var(--color-green-500); border: 1px solid #bbf7d0; }
        .badge.neutral { background: white; border: 1px solid var(--color-slate-200); color: var(--color-slate-600); }

        .amount-ht { font-weight: 800; color: var(--color-navy); }
        .amount-ttc { font-weight: 800; color: var(--color-ivry); }
        
        .order-label {
          font-weight: 600;
          color: var(--color-slate-800);
          display: inline-block;
          min-width: 250px;
        }
        
        .order-lines-list {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
          min-width: 300px;
          max-width: 450px;
        }
        .order-line-item {
          display: flex;
          align-items: flex-start;
          gap: 0.5rem;
          font-size: 0.75rem;
          padding-bottom: 0.5rem;
          border-bottom: 1px dashed var(--color-slate-200);
        }
        .order-line-item:last-child { border-bottom: none; padding-bottom: 0; }
        .line-num {
          background: var(--color-slate-100);
          color: var(--color-slate-600);
          padding: 0.125rem 0.375rem;
          border-radius: 0.25rem;
          font-weight: 700;
          min-width: 1.5rem;
          text-align: center;
        }
        .line-desc { flex: 1; color: var(--color-slate-700); line-height: 1.4; }
        .line-amt { font-style: italic; color: var(--color-slate-500); white-space: nowrap; font-weight: 500; }

        .empty-state {
          text-align: center;
          padding: 3rem !important;
          color: var(--color-slate-500);
          font-style: italic;
        }

        /* Raw SQL View */
        .raw-view-container { display: flex; flex-direction: column; gap: 1rem; }
        .sql-box {
          background: #1e1e1e;
          border-radius: 0.75rem;
          overflow: hidden;
          box-shadow: 0 4px 6px rgba(0,0,0,0.1);
        }
        .sql-box-header {
          background: #2d2d2d;
          padding: 0.75rem 1rem;
          color: #a0a0a0;
          font-size: 0.75rem;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }
        .sql-box code {
          display: block;
          padding: 1.5rem;
          color: #d4d4d4;
          font-family: 'Consolas', 'Monaco', monospace;
          font-size: 0.875rem;
          line-height: 1.5;
          overflow-x: auto;
        }

        /* Modals */
        .modal-backdrop {
          position: fixed;
          top: 0; left: 0; right: 0; bottom: 0;
          background: rgba(15, 23, 42, 0.4);
          backdrop-filter: blur(4px);
          display: flex;
          justify-content: center;
          align-items: center;
          z-index: 50;
          padding: 1rem;
        }
        .modal-window {
          background: white;
          border-radius: 1rem;
          width: 100%;
          max-width: 800px;
          box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04);
          display: flex;
          flex-direction: column;
          max-height: 90vh;
        }
        .modal-window.modal-sm { max-width: 500px; }
        .modal-header {
          padding: 1.25rem 1.5rem;
          border-bottom: 1px solid var(--color-slate-200);
          display: flex;
          justify-content: space-between;
          align-items: center;
        }
        .modal-title { font-size: 1.25rem; font-weight: 700; color: var(--color-navy); margin: 0; }
        .icon-btn {
          background: transparent;
          border: none;
          color: var(--color-slate-400);
          cursor: pointer;
          padding: 0.5rem;
          border-radius: 0.5rem;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: all 0.2s;
        }
        .icon-btn:hover { background: var(--color-slate-100); color: var(--color-slate-600); }
        .modal-body { padding: 1.5rem; overflow-y: auto; }
        .modal-desc { color: var(--color-slate-500); font-size: 0.875rem; margin: 0 0 1.5rem 0; line-height: 1.5; }
        /* Chaussette Indicators */
        .chaussette-card {
          display: flex;
          flex-direction: column;
          background: white;
          padding: 0.5rem 0.75rem;
          border-radius: 0.5rem;
          border: 1px solid var(--color-slate-200);
          box-shadow: 0 1px 2px rgba(0,0,0,0.05);
          min-width: 130px;
        }
        .chaussette-card.f { border-left: 4px solid var(--color-green-500); }
        .chaussette-card.i { border-left: 4px solid var(--color-blue-500); }
        .chaussette-label {
          font-size: 0.65rem;
          font-weight: 700;
          color: var(--color-slate-500);
          text-transform: uppercase;
          letter-spacing: 0.025em;
        }
        .chaussette-value {
          font-size: 1rem;
          font-weight: 800;
          color: var(--color-navy);
        }
        .chaussette-value.negative {
          color: var(--color-ivry);
        }
      `}</style>
    </div>
  );
};

export default Budget;



