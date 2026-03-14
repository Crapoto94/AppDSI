import React, { useState, useEffect, useMemo } from 'react';
import Header from '../components/Header';
import { 
  Upload, CheckCircle, Search, Filter, BookOpen, X, Columns, Eye, EyeOff, 
  Euro, FileText, ShoppingCart, AlertCircle, 
  Plus, Trash2, Send, ExternalLink
} from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import BudgetManagementTab from '../components/BudgetManagementTab';
import { useAuth } from '../contexts/AuthContext';

interface ColumnSetting {
  id: number;
  column_key: string;
  label: string;
  is_visible: number;
  display_order: number;
  color: string | null;
  is_bold: number;
  is_italic: number;
}

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

  const [view, setView] = useState<'summary' | 'lines' | 'invoices' | 'orders' | 'operations' | 'gestion'>('summary');
  const [isRaw, setIsRaw] = useState(false);
  const [rawData, setRawData] = useState<any[]>([]);
  const [budgetLines, setBudgetLines] = useState<any[]>([]);
  const [invoices, setInvoices] = useState<any[]>([]);
  const [orders, setOrders] = useState<any[]>([]);
  const [operations, setOperations] = useState<any[]>([]);
  const [m57Plan, setM57Plan] = useState<any[]>([]);
  const [columnSettings, setColumnSettings] = useState<ColumnSetting[]>([]);
  const [urlSedit, setUrlSedit] = useState<string>('https://seditgfprod.ivry.local/SeditGfSMProd');
  const [budgetPrincipal, setBudgetPrincipal] = useState<string>('Ville');
  
  const [showM57, setShowM57] = useState(false);
  const [showZeroBudget, setShowZeroBudget] = useState(false);
  const [showColumnConfig, setShowColumnConfig] = useState(false);
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

  // New state for import modal
  const [showImportModal, setShowImportModal] = useState(false);
  const [pendingImportFile, setPendingImportFile] = useState<File | null>(null);
  const [pendingImportType, setPendingImportType] = useState<'' | 'lines' | 'invoices' | 'orders'>('');
  const [availableBudgets, setAvailableBudgets] = useState<any[]>([]);
  const [selectedBudgetId, setSelectedBudgetId] = useState<number | ''>('');
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());

  useEffect(() => {
    const fetchBudgets = async () => {
      try {
        const res = await fetch('/api/budgets', {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (res.ok) {
          const data = await res.json();
          setAvailableBudgets(data);
        }
      } catch (e) {
        console.error('Error fetching budgets:', e);
      }
    };

    const fetchFiscalYears = async () => {
      try {
        const res = await fetch('/api/orders/years', {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (res.ok) {
          const data = await res.json();
          setAvailableFiscalYears(data);
          if (data.length > 0 && !data.includes(currentFiscalYear)) {
            setCurrentFiscalYear(data[0]);
          }
        }
      } catch (e) {
        console.error('Error fetching fiscal years:', e);
      }
    };

    fetchBudgets();
    fetchFiscalYears();
  }, [token]);
  
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
    const weeklySums: Record<string, { f: number, i: number }> = {};
    
    orders.forEach(order => {
      const dateStr = order['Date de la commande'] || order.date;
      if (!dateStr) return;
      
      const date = new Date(dateStr);
      if (isNaN(date.getTime())) return;
      
      const week = getWeekNumber(date);
      const year = date.getFullYear();
      const weekKey = `${year}-W${week.toString().padStart(2, '0')}`;
      
      if (!weeklySums[weekKey]) weeklySums[weekKey] = { f: 0, i: 0 };
      
      const amt = parseFloat(order['Montant TTC'] || order.amount_ttc || 0);
      const nature = order['Article par nature'] || order.nature || '';
      const section = order.section || order['Section'] || getSectionFromM57(nature);
      
      if (section === 'Fonctionnement' || section === 'F') {
        weeklySums[weekKey].f += amt;
      } else if (section === 'Investissement' || section === 'I') {
        weeklySums[weekKey].i += amt;
      }
    });
    
    const sortedWeeks = Object.keys(weeklySums).sort();
    let cumF = 0;
    let cumI = 0;
    
    return sortedWeeks.map(week => {
      cumF += weeklySums[week].f;
      cumI += weeklySums[week].i;
      return {
        week,
        fonctionnement: Math.round(cumF),
        investissement: Math.round(cumI)
      };
    });
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

  const isAuthorizedToEdit = ['admin', 'finances', 'compta'].includes(currentUser.role);

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
    const emptyRow = { 'Service': '', 'Service Complément': '', 'LIBELLE': 'Nouvelle Opération', 'MCO': '', 'C. Fonc.': '', 'C. Nature': '', 'Montant prévu': 0, 'Terminé': 'NON', 'Commentaire': '' };
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

    const [linesRes, invoicesRes, ordersRes, operationsRes, m57Res, settingsRes] = await Promise.all([
      fetch(`/api/budget/lines?${queryParams}`, { headers }),
      fetch(`/api/budget/invoices?${queryParams}`, { headers }),
      fetch(`/api/orders?${queryParams}`, { headers }),
      fetch(`/api/budget/operations?${queryParams}`, { headers }),
      fetch('/api/m57-plan', { headers }), // M57 plan is not year/scope specific
      fetch('/api/settings/public', { headers }) // Settings
    ]);
    
    if (linesRes.ok) setBudgetLines(await linesRes.json());
    if (invoicesRes.ok) setInvoices(await invoicesRes.json());
    if (ordersRes.ok) setOrders(await ordersRes.json());
    if (operationsRes.ok) setOperations(await operationsRes.json());
    if (m57Res.ok) setM57Plan(await m57Res.json());
    if (settingsRes.ok) {
      const settings = await settingsRes.json();
      const seditSetting = settings.find((s: any) => s.setting_key === 'url_sedit_fi');
      if (seditSetting) setUrlSedit(seditSetting.setting_value);

      const budgetSetting = settings.find((s: any) => s.setting_key === 'budget_principal');
      if (budgetSetting) setBudgetPrincipal(budgetSetting.setting_value);
    }
  };

  useEffect(() => {
    fetchData();
  }, [currentFiscalYear, budgetScope]);

  useEffect(() => {
    if (['lines', 'invoices', 'orders', 'operations'].includes(view)) {
      fetch(`/api/column-settings/${view}`, { headers: { 'Authorization': `Bearer ${token}` } })
        .then(res => res.json())
        .then(cols => {
          const sortedCols = [...cols].sort((a, b) => {
            if (a.display_order !== 0 || b.display_order !== 0) {
              return (a.display_order || 0) - (b.display_order || 0);
            }
            if (a.column_key === 'num' || a.column_key === 'Service') return -1;
            if (b.column_key === 'num' || b.column_key === 'Service') return 1;
            if (a.column_key === 'Libellé' || a.column_key === 'label' || a.column_key === 'libelle') return -1;
            if (b.column_key === 'Libellé' || b.column_key === 'label' || b.column_key === 'libelle') return 1;
            if (a.column_key === 'Nature' || a.column_key === 'nature') return -1;
            if (b.column_key === 'Nature' || b.column_key === 'nature') return 1;
            return 0;
          });
          setColumnSettings(sortedCols);
        });
    }
  }, [view]);

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

  const updateColumnSettingsBulk = async (newSettings: ColumnSetting[]) => {
    setColumnSettings(newSettings);
    await fetch(`/api/column-settings/${view}/bulk`, {
      method: 'POST',
      headers: { 
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(newSettings)
    });
  };

  const toggleColumnVisibility = (columnKey: string, currentVisible: number) => {
    const updated = columnSettings.map(c => 
      c.column_key === columnKey ? { ...c, is_visible: currentVisible ? 0 : 1 } : c
    );
    updateColumnSettingsBulk(updated);
  };

  const updateColumnStyle = (columnKey: string, field: 'color' | 'is_bold' | 'is_italic', value: any) => {
    const updated = columnSettings.map(c => 
      c.column_key === columnKey ? { ...c, [field]: value } : c
    );
    updateColumnSettingsBulk(updated);
  };

  const handleDragStart = (e: React.DragEvent, index: number) => {
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', index.toString());
  };

  const handleDrop = (e: React.DragEvent, targetIndex: number) => {
    e.preventDefault();
    const sourceIndex = parseInt(e.dataTransfer.getData('text/plain'), 10);
    if (sourceIndex === targetIndex || isNaN(sourceIndex)) return;

    const newSettings = [...columnSettings];
    const [movedItem] = newSettings.splice(sourceIndex, 1);
    newSettings.splice(targetIndex, 0, movedItem);

    const updatedWithOrder = newSettings.map((col, idx) => ({ ...col, display_order: idx + 1 }));
    updateColumnSettingsBulk(updatedWithOrder);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
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
    const groups: Record<string, any> = {};
    orders.forEach(order => {
      const nr = (order['N° Commande'] || order['NÂ° Commande'] || order['NÂ° Commande'] || order['N?? Commande'] || order.order_number || 'SANS_NUMERO').toString();
      if (!groups[nr]) {
        groups[nr] = { 
          ...order, 
          _total_ht: 0,
          _total_ttc: 0, 
          _lines: [] 
        };
      }
      const amtHt = parseFloat(order['Montant HT'] || order.amount_ht || 0);
      const amtTtc = parseFloat(order['Montant TTC'] || 0);
      groups[nr]._total_ht += amtHt;
      groups[nr]._total_ttc += amtTtc;
      
      const nature = order['Article par nature'] || order.nature || '';
      const sectionFromNature = getSectionFromM57(nature);
      // If the group doesn't have a valid section yet, or this line has one, use it
      if (!groups[nr].section || groups[nr].section === '') {
          groups[nr].section = sectionFromNature;
      }

      groups[nr]._lines.push({
        nr: order['N° ligne'],
        desc: order['Désignation'] || order.description,
        amtHt: amtHt,
        amtTtc: amtTtc,
        nature: nature,
        fonction: order['Article par fonction'] || order.fonction || '',
        section: sectionFromNature
      });
    });
    Object.values(groups).forEach((g: any) => {
      g._lines.sort((a: any, b: any) => parseInt(a.nr) - parseInt(b.nr));
    });
    return Object.values(groups);
  }, [orders, m57Plan]);

  const [expandedLines, setExpandedLines] = useState<string[]>([]);
  const toggleExpandLine = (id: string) => setExpandedLines(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);

  const handleAssignOperation = async (operationId: number | null) => {
    if (!selectedOrderForOp) return;
    try {
      const response = await fetch(`/api/orders/${selectedOrderForOp.id}/assign-operation`, {
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
        if (filterValue) {
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
            {['summary', 'lines', 'invoices', 'orders', 'operations', 'gestion'].map(tab => {
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

            {['lines', 'invoices', 'orders', 'operations'].includes(view) && (
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
                    <button className="toolbar-btn" onClick={() => setShowColumnConfig(true)}>
                      <Columns size={16} /> Colonnes
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

                <div className="table-card">
                  <div className="table-responsive">
                    <table className="modern-table table-bordered">
                      <thead>
                        <tr>
                          {(() => {
                            let cols = columnSettings.filter(c => c.is_visible);
                                if (view === 'operations' && !cols.some(c => c.column_key === 'Section' || c.column_key === 'section')) {
                                  const sectionCol = { id: -1, column_key: 'section', label: 'Section', is_visible: 1, display_order: 1, color: null, is_bold: 1, is_italic: 0 };
                                  cols = [cols[0], sectionCol, ...cols.slice(1)];
                                }
                            if (view === 'orders') {
                              // operation_label is rendered as a dedicated hard-coded column
                              cols = cols.filter(c => c.column_key !== 'operation_label');
                            }
                            return cols.map(col => (
                              <th 
                                key={col.column_key}
                                style={{
                                  color: col.color || 'inherit',
                                  fontWeight: col.is_bold ? 'bold' : '600',
                                  fontStyle: col.is_italic ? 'italic' : 'normal'
                                }}
                              >
                                <div className="th-wrapper">
                                  <div className="th-content" onClick={() => requestSort(col.column_key)}>
                                    {col.label}
                                    {sortConfig?.key === col.column_key && (
                                      <span className="sort-indicator">{sortConfig.direction === 'asc' ? ' â†‘' : ' â†“'}</span>
                                    )}
                                  </div>
                                  <input 
                                    type="text" 
                                    placeholder="Filtrer..."
                                    value={columnFilters[col.column_key] || ''}
                                    onChange={(e) => handleColumnFilterChange(col.column_key, e.target.value)}
                                    onClick={(e) => e.stopPropagation()}
                                    className="col-filter-input"
                                  />
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
                          }
                          
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
                                {(() => {
                                  let cols = columnSettings.filter(c => c.is_visible);
                                  if (view === 'operations' && !cols.some(c => c.column_key === 'Section' || c.column_key === 'section')) {
                                    const sectionCol = { id: -1, column_key: 'section', label: 'Section', is_visible: 1, display_order: 1, color: null, is_bold: 1, is_italic: 0 };
                                    cols = [cols[0], sectionCol, ...cols.slice(1)];
                                  }
                                  if (view === 'orders') {
                                    // operation_label is rendered as a dedicated hard-coded column
                                    cols = cols.filter(c => c.column_key !== 'operation_label');
                                  }
                                  const isOrderSection = view === 'orders';
                                  const isInvoiceSection = view === 'invoices';
                                  
                                  const idKeys = ['N° Commande', 'order_number', 'N°', 'num', 'id', 'COMMANDE_COMMANDE'];
                                  const labelKeys = ['COMMANDE_LIBELLE', 'Libellé', 'description', 'label'];
                                  
                                  let specialBtnCol = cols.find(c => idKeys.includes(c.column_key.trim()))?.column_key;
                                  if (!specialBtnCol) {
                                    specialBtnCol = cols.find(c => labelKeys.includes(c.column_key.trim()))?.column_key;
                                  }

                                  return cols.map(col => {
                                  let content: React.ReactNode = row[col.column_key];
                                  let tooltip = '';
                                  let cellStyle: React.CSSProperties = {
                                    color: col.color || 'inherit',
                                    fontWeight: col.is_bold ? 'bold' : 'normal',
                                    fontStyle: col.is_italic ? 'italic' : 'normal'
                                  };

                                  const isCellEditing = view === 'operations' && editingCell?.id === row.id && editingCell?.key === col.column_key;

                                  if (isCellEditing) {
                                    // ... existing editing logic ...
                                    if (['Montant prévu', 'Solde'].includes(col.column_key)) {
                                      content = (
                                        <input 
                                          autoFocus
                                          type="number" 
                                          style={{ width: '80px', padding: '4px' }}
                                          value={cellValue}
                                          onChange={(e) => setCellValue(e.target.value)}
                                          onBlur={() => handleCellUpdate(row, col.column_key, parseFloat(cellValue) || 0)}
                                          onKeyDown={(e) => {
                                            if (e.key === 'Enter') handleCellUpdate(row, col.column_key, parseFloat(cellValue) || 0);
                                            if (e.key === 'Escape') setEditingCell(null);
                                          }}
                                        />
                                      );
                                    } else if (col.column_key === 'Terminé') {
                                      content = (
                                        <select 
                                          autoFocus
                                          value={cellValue}
                                          onChange={(e) => setCellValue(e.target.value)}
                                          onBlur={() => handleCellUpdate(row, col.column_key, cellValue)}
                                          onKeyDown={(e) => {
                                            if (e.key === 'Enter') handleCellUpdate(row, col.column_key, cellValue);
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
                                          onBlur={() => handleCellUpdate(row, col.column_key, cellValue)}
                                          onKeyDown={(e) => {
                                            if (e.key === 'Enter') handleCellUpdate(row, col.column_key, cellValue);
                                            if (e.key === 'Escape') setEditingCell(null);
                                          }}
                                        />
                                      );
                                    }
                                  } else {
                                    if (col.column_key === 'Section' || col.column_key === 'section') {
                                      const sec = col.column_key === 'section' && view === 'operations' ? rowSection : row[col.column_key];
                                      content = (
                                        <span className={`section-badge ${(sec === 'Fonctionnement' || sec === 'F') ? 'f' : 'i'}`}>
                                          {(sec === 'Fonctionnement' || sec === 'F') ? 'F' : 'I'}
                                        </span>
                                      );
                                    } else if (col.column_key === 'used_amount' || col.column_key === 'Montant utilisé') {
                                      const used = parseFloat(row[col.column_key] || 0);
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
                                    } else if (col.column_key === 'status' || col.column_key === 'Etat' || col.column_key === 'termine' || col.column_key === 'Terminé') {
                                      const val = row[col.column_key];
                                      const isDone = val === 'Payée' || val === 'OUI' || val === 1;
                                      content = <span className={`badge ${isDone ? 'success' : 'status'}`}>{val}</span>;
                                    } else if (
                                      col.column_key === 'Montant HT' || col.column_key === 'amount_ht' || 
                                      col.column_key === 'montant_prevu' || col.column_key === 'allocated_amount' ||
                                      col.column_key === 'Budget voté' || col.column_key === 'Disponible' ||
                                      col.column_key === 'Mt. prévision' || col.column_key === 'Mt. pré-engagé' ||
                                      col.column_key === 'Mt. engagé' || col.column_key === 'Mt. facturé' ||
                                      col.column_key === 'Mt. pré-mandaté' || col.column_key === 'Mt. mandaté' ||
                                      col.column_key === 'Mt. payé' || col.column_key === 'Montant prévu' ||
                                      col.column_key.toUpperCase().includes('MONTANT') || col.column_key.toUpperCase().includes('TOTAL')
                                    ) {
                                      const val = view === 'orders' ? (row[col.column_key] || row._total_ht) : row[col.column_key];
                                      content = <span style={cellStyle}>{(parseFloat(String(val).replace(',', '.')) || 0).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })}</span>;
                                    } else if (col.column_key === 'Montant TTC' || col.column_key === 'amount_ttc' || col.column_key === 'solde' || col.column_key === 'Solde') {
                                      const val = view === 'orders' ? (row[col.column_key] || row._total_ttc) : row[col.column_key];
                                      content = <span style={cellStyle}>{(parseFloat(String(val).replace(',', '.')) || 0).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })}</span>;
                                    } else if (
                                      col.column_key === 'date' || 
                                      col.column_key === 'Date de la commande' ||
                                      col.column_key.toUpperCase().includes('DATE') ||
                                      ['Emission', 'Arrivée', 'Début DGP', 'Fin DGP', 'Date Réception Pièce', 'Date Suspension'].includes(col.column_key.trim())
                                    ) {
                                      const d = parseExcelDate(row[col.column_key]);
                                      if (d) {
                                        content = d.toLocaleDateString('fr-FR', { year: 'numeric', month: '2-digit', day: '2-digit' });
                                      } else {
                                        content = row[col.column_key];
                                      }
                                    }
                                    else if (col.column_key === 'Libellé' || col.column_key === 'label' || col.column_key === 'libelle' || col.column_key === 'Nom' || col.column_key === 'LIBELLE' || col.column_key.includes('LIBELLE')) {
                                      tooltip = row[col.column_key];
                                      content = (
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                          {isExpandable && view === 'lines' && (
                                            <span style={{ fontSize: '12px', color: '#64748b' }}>
                                              {isExpanded ? 'â–¼' : 'â–¶'} ({linesCount})
                                            </span>
                                          )}
                                          <span style={{ maxWidth: '450px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                            {row[col.column_key]}
                                          </span>
                                        </div>
                                      );
                                      cellStyle = { ...cellStyle, maxWidth: '450px', minWidth: '300px' };
                                    }
                                    else if (col.column_key === 'Désignation' || col.column_key === 'description' || col.column_key.includes('DESIGNATION')) {
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
                                    else if (col.column_key === 'operation_label') {
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
                                      col.column_key === specialBtnCol
                                    ) {
                                      const isOrder = isOrderSection;
                                      const targetId = row[col.column_key]?.toString();
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
                                          <span>{row[col.column_key]}</span>
                                        </div>
                                      );
                                    }
                                    else if (col.column_key === 'nature' || col.column_key === 'Article par nature' || col.column_key === 'C. Nature') {

                                      tooltip = getM57Label(row[col.column_key], 'nature');
                                      cellStyle = { ...cellStyle, textDecoration: 'underline dotted', cursor: 'help' };
                                    } else if (col.column_key === 'fonction' || col.column_key === 'Article par fonction' || col.column_key === 'C. Fonc.') {
                                      tooltip = getM57Label(row[col.column_key], 'fonction');
                                      cellStyle = { ...cellStyle, textDecoration: 'underline dotted', cursor: 'help' };
                                    }
                                  }

                                  return (
                                    <td 
                                      key={col.column_key} 
                                      style={{ ...cellStyle, ...(isCellEditing ? { padding: '4px' } : {}) }} 
                                      title={!isCellEditing ? (tooltip || row[col.column_key] || '') : undefined}
                                      onDoubleClick={() => {
                                        if (view === 'operations' && isAuthorizedToEdit) {
                                          setEditingCell({ id: row.id, key: col.column_key });
                                          setCellValue(row[col.column_key] || '');
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
                                  <td colSpan={columnSettings.filter(c => c.is_visible).length} style={{ padding: '10px 20px' }}>
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
                                  <td colSpan={columnSettings.filter(c => c.is_visible).length} style={{ padding: '10px 20px' }}>
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
                            </React.Fragment>
                          );
                        }) : (
                          <tr>
                            <td colSpan={columnSettings.filter(c => c.is_visible).length || 1} className="empty-state">
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
          </div>
        )}
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

        {showColumnConfig && (
          <div className="modal-backdrop" onClick={() => setShowColumnConfig(false)}>
            <div className="modal-window" style={{ maxWidth: '600px' }} onClick={e => e.stopPropagation()}>
              <div className="modal-header">
                <h2 className="modal-title">Configuration des Colonnes</h2>
                <button className="icon-btn" onClick={() => setShowColumnConfig(false)}><X size={20} /></button>
              </div>
              <div className="modal-body">
                <p className="modal-desc">
                  Glissez-déposez pour réorganiser. Modifiez la visibilité, la couleur, et le style (Gras/Italique).
                </p>
                <div className="column-toggles">
                  {columnSettings.map((col, index) => (
                    <div 
                      key={col.id} 
                      className="toggle-item"
                      draggable={['admin', 'finances'].includes(currentUser.role)}
                      onDragStart={(e) => handleDragStart(e, index)}
                      onDragOver={handleDragOver}
                      onDrop={(e) => handleDrop(e, index)}
                      style={{ cursor: ['admin', 'finances'].includes(currentUser.role) ? 'grab' : 'default', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                    >
                      <div className="toggle-info" style={{ display: 'flex', alignItems: 'center', flex: 1, gap: '10px' }}>
                        {['admin', 'finances'].includes(currentUser.role) && <span className="drag-handle" style={{ color: '#94a3b8', cursor: 'grab' }}>â˜°</span>}
                        <input 
                          type="text"
                          className="col-label-input"
                          value={col.label}
                          onChange={(e) => {
                            const updated = columnSettings.map(c => c.column_key === col.column_key ? { ...c, label: e.target.value } : c);
                            setColumnSettings(updated);
                          }}
                          onBlur={() => updateColumnSettingsBulk(columnSettings)}
                          disabled={!['admin', 'finances'].includes(currentUser.role)}
                          style={{ 
                            flex: 1, 
                            padding: '4px 8px', 
                            border: '1px solid transparent', 
                            background: 'transparent',
                            fontWeight: 600,
                            fontSize: '0.875rem'
                          }}
                        />
                      </div>
                      
                      <div className="toggle-controls" style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                        {currentUser.role === 'admin' && (
                          <>
                            <input 
                              type="color" 
                              value={col.color || '#334155'} 
                              onChange={(e) => updateColumnStyle(col.column_key, 'color', e.target.value)}
                              title="Couleur de la colonne"
                              style={{ width: '28px', height: '28px', padding: '0', border: '1px solid #cbd5e1', borderRadius: '4px', cursor: 'pointer' }}
                            />
                            <button 
                              onClick={() => updateColumnStyle(col.column_key, 'is_bold', !col.is_bold)}
                              title="Gras"
                              style={{ 
                                fontWeight: 'bold', width: '28px', height: '28px', borderRadius: '4px', 
                                border: '1px solid #cbd5e1', cursor: 'pointer',
                                background: col.is_bold ? '#e2e8f0' : 'white'
                              }}
                            >
                              B
                            </button>
                            <button 
                              onClick={() => updateColumnStyle(col.column_key, 'is_italic', !col.is_italic)}
                              title="Italique"
                              style={{ 
                                fontStyle: 'italic', fontFamily: 'serif', width: '28px', height: '28px', borderRadius: '4px', 
                                border: '1px solid #cbd5e1', cursor: 'pointer',
                                background: col.is_italic ? '#e2e8f0' : 'white'
                              }}
                            >
                              I
                            </button>
                          </>
                        )}
                        <button 
                          className={`toggle-btn ${col.is_visible ? 'on' : 'off'}`}
                          onClick={() => toggleColumnVisibility(col.column_key, col.is_visible)}
                          disabled={!['admin', 'finances'].includes(currentUser.role)}
                          style={{ minWidth: '90px', justifyContent: 'center' }}
                        >
                          {col.is_visible ? <Eye size={16} /> : <EyeOff size={16} />}
                          {col.is_visible ? 'Visible' : 'Masqué'}
                        </button>
                      </div>
                    </div>
                  ))}
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
          max-width: 1400px;
          margin: 0 auto;
          padding: 2rem;
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
        
        .column-toggles { display: flex; flex-direction: column; gap: 0.75rem; }
        .toggle-item {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 0.75rem 1rem;
          background: var(--color-slate-50);
          border: 1px solid var(--color-slate-200);
          border-radius: 0.5rem;
        }
        .toggle-label { font-weight: 500; color: var(--color-slate-700); font-size: 0.875rem; }
        .toggle-btn {
          display: inline-flex;
          align-items: center;
          gap: 0.375rem;
          padding: 0.375rem 0.75rem;
          border-radius: 0.375rem;
          font-size: 0.75rem;
          font-weight: 600;
          transition: all 0.2s;
        }
        .toggle-btn.on { background: var(--color-navy); color: white; border: 1px solid var(--color-navy); }
        .toggle-btn.off { background: white; color: var(--color-slate-500); border: 1px solid var(--color-slate-300); }

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



