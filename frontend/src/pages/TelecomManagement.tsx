import React, { useState, useEffect } from 'react';
import { 
  Plus, 
  Edit2,
  Trash2, 
  Search, 
  Building2, 
  ChevronDown,
  ChevronUp,
  ArrowLeft,
  CreditCard,
  List,
  Upload,
  Save,
  X,
  FileText,
  Wifi,
  Phone,
  AlertTriangle,
  MapPin,
  Network,
  Check,
  ExternalLink,
  FileSpreadsheet,
  TrendingUp,
  TrendingDown,
  ArrowRight,
  MessageSquare
} from 'lucide-react';import { useNavigate } from 'react-router-dom';
import { BarChart, Bar, Cell, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import Header from '../components/Header';

interface Tier {
  id: number;
  nom: string;
  code: string;
  complement_nom?: string;
  siret?: string;
}

interface Operator {
  id: number;
  tier_id: number;
  tier_code?: string;
  name: string;
  rejected_count?: number;
}

interface BillingAccount {
  id: number;
  operator_id: number;
  account_number: string;
  type: string;
  designation: string;
  customer_number: string;
  market_number: string;
  function_code: string;
  commitment_number: string;
  commitment_amount?: number;
  commitment_label?: string;
  invoice_count?: number;
  total_invoiced?: number;
  account_balance?: number;
  rejected_count?: number;
}

interface Commitment {
  id?: number;
  commitment_number: string;
  label: string;
  amount: number;
  invoiced_amount: number;
  year: number;
  operator_name: string;
  function_code?: string;
  section?: string;
  // Champs dynamiques renvoyés par /api/telecom/engagements (issus du budget)
  engaged_amount?: number | null;
  remaining_amount?: number | null;
}

interface TelecomInvoice {
  id: number;
  invoice_number: string;
  operator_id: number;
  billing_account_id: number;
  amount_ttc: number;
  invoice_date: string;
  file_path: string;
  uploaded_at: string;
  operator_name?: string;
  account_number?: string;
  general_status?: string;
  sedit_ref?: string;
  billing_month?: string | null;
  description?: string | null;
  effective_month?: string | null;
}

interface AvailableBudgetInvoice {
  invoice_number: string;
  libelle: string;
  fournisseur: string;
  amount_ttc: number | null;
  invoice_date: string | null;
  sedit_ref: string | null;
  etat: string | null;
}

interface RejectedInvoice {
  id: number;
  invoice_number: string;
  reason: string | null;
  category: 'rejetee' | 'hors_telecom';
  rejected_by: string | null;
  rejected_at: string;
  fournisseur: string | null;
  amount_ttc: number | null;
  sedit_ref: string | null;
  etat: string | null;
  invoice_date: string | null;
}

interface TelecomLine {
  id: number;
  category: 'fixe' | 'internet';
  site_number: string;
  site_name: string;
  address: string;
  postal_code: string;
  city: string;
  contract: string;
  billing_account: string;
  mid: string;
  offer: string;
  access_type: string;
  to_migrate: boolean;
  copper_end_lot: string;
  commercial_closure: string;
  technical_closure: string;
  ndi: string;
  status: string;
  service_date: string | null;
  company_name: string;
}

interface LinesStats {
  total: number;
  fixe: number;
  internet: number;
  inService: number;
  resiliation: number;
  toMigrate: number;
  byAccessType: Record<string, number>;
  byOffer: Record<string, number>;
  byStatus: Record<string, number>;
  byCity: Record<string, number>;
  topSites: { site: string; total: number; fixe: number; internet: number }[];
  migrationList: { site_name: string; city: string; access_type: string; offer: string; copper_end_lot: string; ndi: string; mid: string }[];
  resiliationList: { site_name: string; city: string; access_type: string; offer: string; status: string; ndi: string; mid: string }[];
  trunkList: { site_name: string; city: string; access_type: string; ndi: string; mid: string; billing_account: string; capacity: string }[];
}

interface BillingStats {
  period: string | null;
  totalLines: number;
  mobileLines: number;
  fixeLines: number;
  totalHT: number;
  totalMobile: number;
  totalFixe: number;
  totalSubscriptions: number;
  totalConso: number;
  totalDiscounts: number;
  dormant: number;
  dormantCost: number;
  dormantList: { line_number: string; user_name: string; plan: string; list_label: string; amt_total: number; monthsWithoutConso: number }[];
  annualEstimate: number;
  topLines: { line_number: string; user_name: string; site_name: string; plan: string; is_mobile: boolean; amt_total: number }[];
  byPlan: Record<string, number>;
  bySite: { site: string; amount: number }[];
  byList: { list: string; amount: number }[];
}

interface Reconciliation {
  inventoryTotal: number;
  billingTotal: number;
  matched: number;
  matchedCost: number;
  resilieesFacturees: { ndi: string; site_name: string; access_type: string; status: string; cost: number }[];
  resilieesFactureesCost: number;
  enServiceNonFacturees: { ndi: string; site_name: string; access_type: string; category: string }[];
  factureesHorsInventaire: { line_number: string; site_name: string; cf_label: string; amt_total: number }[];
  factureesHorsInventaireCost: number;
}

interface BillingLine {
  id: number;
  line_number: string;
  invoice_number: string;
  invoice_date: string;
  user_name: string;
  site_name: string;
  list_label: string;
  plan: string;
  is_mobile: boolean;
  access_type: string | null;
  amt_subscriptions: number;
  amt_total: number;
  resiliation: string;
}

interface MonthCellInvoice {
  id: number;
  invoice_number: string;
  amount_ttc: number;
  description: string | null;
  general_status: string | null;
  sedit_ref: string | null;
}

interface MonthCell {
  total: number | null;
  invoices: MonthCellInvoice[];
  comment: string | null;
  isPast: boolean;
}

interface MonthlySummaryRow {
  account_id: number;
  operator_id: number;
  operator_name: string;
  account_number: string;
  designation: string;
  type: string;
  monthly: Record<string, MonthCell>;
  total: number;
  landing: number | null;
}

interface MonthlySummaryOperator {
  operator_id: number;
  operator_name: string;
  monthly: Record<string, number>;
  total: number;
  landing: number | null;
}

interface MonthlySummaryData {
  year: number;
  months: string[];
  currentMonth: string;
  rows: MonthlySummaryRow[];
  operators: MonthlySummaryOperator[];
  global: { monthly: Record<string, number>; total: number; landing: number | null };
}

// Sparkline minimaliste (SVG inline) pour l'évolution mensuelle d'un tiers.
const Sparkline: React.FC<{ values: number[]; width?: number; height?: number; color?: string }> = ({ values, width = 90, height = 22, color = '#6366f1' }) => {
  if (values.length < 2) return null;
  const max = Math.max(...values, 0.0001);
  const min = Math.min(...values, 0);
  const range = max - min || 1;
  const step = width / (values.length - 1);
  const points = values.map((v, i) => `${(i * step).toFixed(1)},${(height - ((v - min) / range) * height).toFixed(1)}`).join(' ');
  return (
    <svg width={width} height={height} style={{ display: 'block', opacity: 0.55 }}>
      <polyline points={points} fill="none" stroke={color} strokeWidth={1.5} />
    </svg>
  );
};

// Tendance d'un mois par rapport au précédent — même code couleur que /contrats :
// rouge = hausse (alerte dépense), vert = baisse, gris = stable. Seuil ±15%.
const TREND_UP_COLOR = '#dc2626';
const TREND_DOWN_COLOR = '#16a34a';
const TREND_STABLE_COLOR = '#9ca3af';
const monthTrend = (curr: number, prev: number): { Icon: typeof TrendingUp; color: string; title: string } => {
  if (prev === 0) {
    return curr > 0
      ? { Icon: TrendingUp, color: TREND_UP_COLOR, title: 'En hausse par rapport au mois précédent (base nulle)' }
      : { Icon: ArrowRight, color: TREND_STABLE_COLOR, title: 'Stable par rapport au mois précédent' };
  }
  const pct = ((curr - prev) / Math.abs(prev)) * 100;
  if (pct > 15) return { Icon: TrendingUp, color: TREND_UP_COLOR, title: `En hausse de ${pct.toFixed(0)}% par rapport au mois précédent` };
  if (pct < -15) return { Icon: TrendingDown, color: TREND_DOWN_COLOR, title: `En baisse de ${Math.abs(pct).toFixed(0)}% par rapport au mois précédent` };
  return { Icon: ArrowRight, color: TREND_STABLE_COLOR, title: `Stable par rapport au mois précédent (${pct >= 0 ? '+' : ''}${pct.toFixed(0)}%)` };
};

const TelecomManagement: React.FC = () => {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<'invoices' | 'lines' | 'pdfs' | 'network' | 'billing' | 'optim' | 'summary'>('invoices');

  // Synthèse mensuelle par compte (façon onglet "Suivi" de l'Excel)
  const [monthlySummary, setMonthlySummary] = useState<MonthlySummaryData | null>(null);
  const [loadingSummary, setLoadingSummary] = useState(false);
  const [summaryYear, setSummaryYear] = useState(new Date().getFullYear());
  const [viewingCell, setViewingCell] = useState<{ label: string; invoices: MonthCellInvoice[] } | null>(null);
  const [commentEditor, setCommentEditor] = useState<{ accountId: number; month: string; value: string } | null>(null);
  const [savingComment, setSavingComment] = useState(false);

  // Lignes fixes & internet
  const [lines, setLines] = useState<TelecomLine[]>([]);
  const [linesStats, setLinesStats] = useState<LinesStats | null>(null);
  const [lineCategory, setLineCategory] = useState<'all' | 'fixe' | 'internet'>('all');
  const [lineSearch, setLineSearch] = useState('');
  const [lineAccessType, setLineAccessType] = useState('all');
  const [linePage, setLinePage] = useState(0);
  const LINE_PAGE_SIZE = 25;
  const [importingLines, setImportingLines] = useState(false);

  // Coûts & mobile (facturation SFR)
  const [billingStats, setBillingStats] = useState<BillingStats | null>(null);
  const [billingTrend, setBillingTrend] = useState<{ month: string; total: number }[]>([]);
  const [billingLines, setBillingLines] = useState<BillingLine[]>([]);
  const [billingType, setBillingType] = useState<'all' | 'mobile' | 'fixe'>('all');
  const [billingTechno, setBillingTechno] = useState('all');
  const [billingSearch, setBillingSearch] = useState('');
  const [importingBilling, setImportingBilling] = useState(false);
  const [invoiceFiles, setInvoiceFiles] = useState<Record<string, string>>({});
  const [importingInvoices, setImportingInvoices] = useState(false);
  const [importingSuivi, setImportingSuivi] = useState(false);
  const [urlSedit, setUrlSedit] = useState<string>('https://seditgfprod.ivry.local/SeditGfSMProd');

  // Optimisation (rapprochement inventaire ↔ facturation)
  const [reconciliation, setReconciliation] = useState<Reconciliation | null>(null);
  const [dormantPage, setDormantPage] = useState(0);
  const [dormantSearch, setDormantSearch] = useState('');
  const DORMANT_PAGE_SIZE = 20;

  // Fiche historique d'une ligne (12 mois glissants)
  const [lineHistory, setLineHistory] = useState<any>(null);
  const [lineHistoryNumber, setLineHistoryNumber] = useState<string | null>(null);
  const [loadingHistory, setLoadingHistory] = useState(false);

  const openLineHistory = async (number: string) => {
    if (!number) return;
    setLineHistoryNumber(number);
    setLineHistory(null);
    setLoadingHistory(true);
    try {
      const res = await fetch(`/api/telecom/billing/line/${encodeURIComponent(number)}`, { headers: { 'Authorization': `Bearer ${token}` } });
      if (res.ok) setLineHistory(await res.json());
      else setLineHistory({ error: true });
    } catch (e) {
      setLineHistory({ error: true });
    } finally {
      setLoadingHistory(false);
    }
  };
  const [operators, setOperators] = useState<Operator[]>([]);
  const [billingAccounts, setBillingAccounts] = useState<Record<number, BillingAccount[]>>({});
  const [commitments, setCommitments] = useState<Commitment[]>([]);
  const [telecomInvoices, setTelecomInvoices] = useState<TelecomInvoice[]>([]);
  const [allTiers, setAllTiers] = useState<Tier[]>([]);
  const [showAddOperator, setShowAddOperator] = useState(false);
  const [selectedTier, setSelectedTier] = useState<Tier | null>(null);
  const [newOperatorName, setNewOperatorName] = useState('');
  const [editingOperator, setEditingOperator] = useState<Operator | null>(null);
  const [tierSearch, setTierSearch] = useState('');
  const [editTierSearch, setEditTierSearch] = useState('');
  const [expandedOperators, setExpandedOperators] = useState<number[]>([]);
  const [showAddAccount, setShowAddAccount] = useState<number | null>(null);
  const [editingAccount, setEditingAccount] = useState<BillingAccount | null>(null);
  
  // Invoices Filtering & Grouping State
  const [invoiceSearch, setInvoiceSearch] = useState('');
  const [invoiceAccountFilter, setInvoiceAccountFilter] = useState<number | null>(null);
  const [invoiceOperatorFilter, setInvoiceOperatorFilter] = useState<number | null>(null);
  
  // Ajout d'une facture depuis le budget (remplace l'upload PDF) : liste des factures du
  // fournisseur de ce compte pas encore intégrées à /telecom. Ouvrable soit depuis un compte
  // précis (onglet Comptes), soit depuis la liste des factures (avec choix opérateur/compte).
  const [showAddInvoiceModal, setShowAddInvoiceModal] = useState(false);
  const [addInvoiceOperatorId, setAddInvoiceOperatorId] = useState<number | null>(null);
  const [addInvoiceAccountId, setAddInvoiceAccountId] = useState<number | null>(null);
  const [availableInvoices, setAvailableInvoices] = useState<AvailableBudgetInvoice[]>([]);
  const [loadingAvailable, setLoadingAvailable] = useState(false);
  const [availableSearch, setAvailableSearch] = useState('');
  const [addingInvoiceNumber, setAddingInvoiceNumber] = useState<string | null>(null);
  // Rejet d'une facture du budget proposée dans la liste "Ajouter une facture"
  const [rejectCandidate, setRejectCandidate] = useState<AvailableBudgetInvoice | null>(null);
  const [rejectCategory, setRejectCategory] = useState<'rejetee' | 'hors_telecom'>('rejetee');
  const [rejectReason, setRejectReason] = useState('');
  const [rejecting, setRejecting] = useState(false);
  const [rejectedDetail, setRejectedDetail] = useState<{ title: string; operator_id: number; billing_account_id: number } | null>(null);
  const [rejectedInvoices, setRejectedInvoices] = useState<RejectedInvoice[]>([]);
  const [loadingRejected, setLoadingRejected] = useState(false);
  // Édition inline du mois de rattachement / de la description d'une facture déjà intégrée
  const [editingMeta, setEditingMeta] = useState<{ id: number; billing_month: string; description: string } | null>(null);

  const [newAccount, setNewAccount] = useState<Partial<BillingAccount>>({
    type: 'Fixe',
    account_number: '',
    designation: '',
    customer_number: '',
    market_number: '',
    function_code: '',
    commitment_number: ''
  });

  const token = localStorage.getItem('token');

  useEffect(() => {
    fetchData();
  }, [token]);

  useEffect(() => {
    fetch('/api/settings', { headers: { 'Authorization': `Bearer ${token}` } })
      .then(res => res.ok ? res.json() : [])
      .then((settings: any[]) => {
        const s = (settings || []).find((s: any) => s.setting_key === 'url_sedit_fi');
        if (s) setUrlSedit(s.setting_value);
      })
      .catch(() => {});
  }, [token]);

  const fetchData = async () => {
    try {
      const opRes = await fetch('/api/telecom/operators', { headers: { 'Authorization': `Bearer ${token}` } });
      if (opRes.ok) {
        const ops = await opRes.json();
        setOperators(ops);
        ops.forEach((op: Operator) => fetchAccounts(op.id));
      }

      const tiersRes = await fetch('/api/tiers?all=true', { headers: { 'Authorization': `Bearer ${token}` } });
      if (tiersRes.ok) {
        const data = await tiersRes.json();
        setAllTiers(data.tiers || []);
      }

      // Engagements télécom récupérés depuis le budget (nature 6262), pas d'import.
      const commRes = await fetch('/api/telecom/engagements', { headers: { 'Authorization': `Bearer ${token}` } });
      if (commRes.ok) setCommitments(await commRes.json());

      const invRes = await fetch('/api/telecom/invoices', { headers: { 'Authorization': `Bearer ${token}` } });
      if (invRes.ok) setTelecomInvoices(await invRes.json());

      const ifRes = await fetch('/api/telecom/billing/invoice-files', { headers: { 'Authorization': `Bearer ${token}` } });
      if (ifRes.ok) setInvoiceFiles(await ifRes.json());
    } catch (e) {
      console.error(e);
    }
  };

  const fetchInvoiceFiles = async () => {
    try {
      const res = await fetch('/api/telecom/billing/invoice-files', { headers: { 'Authorization': `Bearer ${token}` } });
      if (res.ok) setInvoiceFiles(await res.json());
    } catch (e) { console.error(e); }
  };

  const handleImportSuivi = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportingSuivi(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch('/api/telecom/invoices/import-suivi', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
        body: formData,
      });
      const data = await res.json();
      if (res.ok) {
        const skipped = (data.skipped_rows || []).length;
        alert(
          `Import du fichier Suivi terminé\n\n` +
          `${data.operators_created} opérateur(s) créé(s)\n` +
          `${data.accounts_created} compte(s) créé(s)\n` +
          `${data.invoices_created} facture(s) affectée(s)\n` +
          `${data.invoices_reassigned} facture(s) réaffectée(s)\n` +
          `${data.invoices_unchanged} facture(s) déjà à jour` +
          (skipped ? `\n${skipped} ligne(s) ignorée(s) (compte manquant)` : '')
        );
        await fetchData();
      } else {
        alert('Erreur : ' + (data.message || 'inconnue'));
      }
    } catch (err) {
      alert("Erreur lors de l'import du fichier Suivi");
    } finally {
      setImportingSuivi(false);
      e.target.value = '';
    }
  };

  const handleImportInvoices = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportingInvoices(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch('/api/telecom/billing/invoices/import', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
        body: formData,
      });
      const data = await res.json();
      if (res.ok) {
        alert(`Factures PDF importées\n\n${data.imported} ajoutée(s), ${data.updated} remplacée(s) sur ${data.total} PDF`);
        await fetchInvoiceFiles();
      } else {
        alert('Erreur : ' + (data.message || 'inconnue'));
      }
    } catch (err) {
      alert("Erreur lors de l'import des factures");
    } finally {
      setImportingInvoices(false);
      e.target.value = '';
    }
  };

  // Rendu d'un n° de facture : cliquable (ouvre le PDF GED) si disponible
  const renderInvoiceNumber = (num: string | null | undefined) => {
    if (!num) return <span style={{ color: '#cbd5e1' }}>—</span>;
    return <>{String(num).split(/,\s*/).map((nm, i) => {
      const path = invoiceFiles[nm];
      return (
        <React.Fragment key={nm}>
          {i > 0 && ', '}
          {path
            ? <a href={`/api/${path}`} target="_blank" rel="noopener noreferrer" className="ndi-link" title="Voir le PDF de la facture">{nm}</a>
            : <span title="PDF non importé — importez le ZIP de duplicatas contenant cette facture" style={{ borderBottom: '1px dotted #cbd5e1', cursor: 'help' }}>{nm}</span>}
        </React.Fragment>
      );
    })}</>;
  };

  const fetchLines = async () => {
    try {
      const [linesRes, statsRes] = await Promise.all([
        fetch('/api/telecom/lines', { headers: { 'Authorization': `Bearer ${token}` } }),
        fetch('/api/telecom/lines/stats', { headers: { 'Authorization': `Bearer ${token}` } }),
      ]);
      if (linesRes.ok) setLines(await linesRes.json());
      if (statsRes.ok) setLinesStats(await statsRes.json());
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    if (activeTab === 'network') fetchLines();
  }, [activeTab, token]);

  const handleImportLines = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setImportingLines(true);
    try {
      let summary: string[] = [];
      for (const file of Array.from(files)) {
        const formData = new FormData();
        formData.append('file', file);
        const res = await fetch('/api/telecom/lines/import', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${token}` },
          body: formData,
        });
        const data = await res.json();
        if (res.ok) summary.push(`${file.name} : ${data.inserted} ajoutée(s), ${data.updated} mise(s) à jour`);
        else summary.push(`${file.name} : erreur — ${data.message || 'inconnue'}`);
      }
      alert('Import terminé\n\n' + summary.join('\n'));
      await fetchLines();
    } catch (err) {
      alert("Erreur lors de l'import");
    } finally {
      setImportingLines(false);
      e.target.value = '';
    }
  };

  const fetchBilling = async () => {
    try {
      const [statsRes, trendRes, linesRes] = await Promise.all([
        fetch('/api/telecom/billing/stats', { headers: { 'Authorization': `Bearer ${token}` } }),
        fetch('/api/telecom/billing/trend', { headers: { 'Authorization': `Bearer ${token}` } }),
        fetch('/api/telecom/billing/lines', { headers: { 'Authorization': `Bearer ${token}` } }),
      ]);
      if (statsRes.ok) setBillingStats(await statsRes.json());
      if (trendRes.ok) setBillingTrend(await trendRes.json());
      if (linesRes.ok) setBillingLines(await linesRes.json());
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    if (activeTab === 'billing') { fetchBilling(); fetchInvoiceFiles(); }
  }, [activeTab, token]);

  const fetchOptim = async () => {
    try {
      const [statsRes, recRes] = await Promise.all([
        fetch('/api/telecom/billing/stats', { headers: { 'Authorization': `Bearer ${token}` } }),
        fetch('/api/telecom/billing/reconciliation', { headers: { 'Authorization': `Bearer ${token}` } }),
      ]);
      if (statsRes.ok) setBillingStats(await statsRes.json());
      if (recRes.ok) setReconciliation(await recRes.json());
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    if (activeTab === 'optim') fetchOptim();
  }, [activeTab, token]);

  const fetchMonthlySummary = async () => {
    setLoadingSummary(true);
    try {
      const res = await fetch(`/api/telecom/invoices/monthly-summary?year=${summaryYear}`, { headers: { 'Authorization': `Bearer ${token}` } });
      if (res.ok) setMonthlySummary(await res.json());
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingSummary(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'summary') fetchMonthlySummary();
  }, [activeTab, token, summaryYear]);

  const handleSaveComment = async () => {
    if (!commentEditor) return;
    setSavingComment(true);
    try {
      const res = await fetch(`/api/telecom/billing-accounts/${commentEditor.accountId}/monthly-comment`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ month: commentEditor.month, comment: commentEditor.value }),
      });
      if (res.ok) {
        setCommentEditor(null);
        await fetchMonthlySummary();
      } else {
        alert("Erreur lors de l'enregistrement du commentaire");
      }
    } catch (e) {
      alert('Erreur de connexion');
    } finally {
      setSavingComment(false);
    }
  };

  const handleImportBilling = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportingBilling(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch('/api/telecom/billing/import', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
        body: formData,
      });
      const data = await res.json();
      if (res.ok) {
        alert(`Import réussi\n\nPériode ${data.period}\n${data.billing} ligne(s) de facturation\n${data.trend} point(s) de tendance`);
        await fetchBilling();
      } else {
        alert('Erreur : ' + (data.message || 'inconnue'));
      }
    } catch (err) {
      alert("Erreur lors de l'import");
    } finally {
      setImportingBilling(false);
      e.target.value = '';
    }
  };

  const fetchAccounts = async (operatorId: number) => {
    try {
      const res = await fetch(`/api/telecom/operators/${operatorId}/accounts`, { headers: { 'Authorization': `Bearer ${token}` } });
      if (res.ok) {
        const accounts = await res.json();
        setBillingAccounts(prev => ({ ...prev, [operatorId]: accounts }));
      }
    } catch (e) {
      console.error(e);
    }
  };

  // Création d'un opérateur : le tiers (issu du budget) est obligatoire, on stocke son code
  // (source fiable pour retrouver ses factures) et on laisse saisir un nom distinct du tiers.
  const handleAddOperator = async () => {
    if (!selectedTier) return;
    const name = newOperatorName.trim();
    if (!name) {
      alert("Veuillez saisir un nom pour l'opérateur");
      return;
    }
    try {
      const res = await fetch('/api/telecom/operators', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ tier_code: selectedTier.code, name })
      });
      if (res.ok) {
        setShowAddOperator(false);
        setSelectedTier(null);
        setTierSearch('');
        fetchData();
      } else {
        const err = await res.json();
        alert(err.message || "Erreur lors de l'ajout");
      }
    } catch (e) {
      alert("Erreur de connexion");
    }
  };

  const handleDeleteOperator = async (id: number) => {
    if (!window.confirm("Supprimer cet opérateur et tous ses comptes ?")) return;
    try {
      const res = await fetch(`/api/telecom/operators/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) fetchData();
    } catch (e) {
      alert("Erreur");
    }
  };

  // Renommage d'un opérateur a posteriori : son nom peut différer du nom de son tiers
  // (ex. opérateur "CFI" facturant le tiers "moji"). Le lien tiers est mis à jour si un
  // nouveau tiers a été choisi dans le formulaire (association possible a posteriori).
  const handleUpdateOperator = async () => {
    if (!editingOperator) return;
    const name = editingOperator.name.trim();
    if (!name) {
      alert("Le nom de l'opérateur ne peut pas être vide");
      return;
    }
    const payload: Record<string, unknown> = { name };
    if ('tier_code' in editingOperator) {
      payload.tier_code = editingOperator.tier_code ?? null;
    }
    try {
      const res = await fetch(`/api/telecom/operators/${editingOperator.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        setEditingOperator(null);
        setEditTierSearch('');
        await fetchData();
      } else {
        const err = await res.json();
        alert(err.message || "Erreur lors de la mise à jour");
      }
    } catch (e) {
      alert("Erreur de connexion");
    }
  };

  const handleRejectInvoice = async () => {
    if (!rejectCandidate) return;
    if (rejectCategory === 'rejetee' && !rejectReason.trim()) {
      alert("Veuillez saisir une description du rejet");
      return;
    }
    setRejecting(true);
    try {
      const res = await fetch('/api/telecom/invoices/reject', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({
          invoice_number: rejectCandidate.invoice_number,
          reason: rejectReason.trim() || null,
          category: rejectCategory,
          operator_id: addInvoiceOperatorId,
          billing_account_id: addInvoiceAccountId,
        }),
      });
      if (res.ok) {
        setAvailableInvoices(prev => prev.filter(c => c.invoice_number !== rejectCandidate.invoice_number));
        setRejectCandidate(null);
        setRejectReason('');
        setRejectCategory('rejetee');
        await fetchData();
      } else {
        const data = await res.json();
        alert('Erreur : ' + (data.message || 'inconnue'));
      }
    } catch (e) {
      alert("Erreur lors du rejet de la facture");
    } finally {
      setRejecting(false);
    }
  };

  const handleSaveAccount = async (operatorId: number) => {
    const isEditing = !!editingAccount;
    const url = isEditing ? `/api/telecom/billing-accounts/${editingAccount.id}` : '/api/telecom/billing-accounts';
    const method = isEditing ? 'PUT' : 'POST';
    const body = isEditing ? editingAccount : { ...newAccount, operator_id: operatorId };

    try {
      const res = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(body)
      });
      if (res.ok) {
        setShowAddAccount(null);
        setEditingAccount(null);
        setNewAccount({ type: 'Fixe', account_number: '', designation: '', customer_number: '', market_number: '', function_code: '', commitment_number: '' });
        fetchAccounts(operatorId);
      }
    } catch (e) {
      alert("Erreur");
    }
  };

  const handleDeleteAccount = async (id: number, operatorId: number) => {
    if (!window.confirm("Supprimer ce compte de facturation ?")) return;
    try {
      const res = await fetch(`/api/telecom/billing-accounts/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) fetchAccounts(operatorId);
    } catch (e) {
      alert("Erreur");
    }
  };

  const startEditAccount = (acc: BillingAccount) => {
    setEditingAccount(acc);
    setShowAddAccount(acc.operator_id);
  };

  const handleDeleteTelecomInvoice = async (id: number) => {
    if (!window.confirm("Supprimer cette facture ?")) return;
    try {
      const res = await fetch(`/api/telecom/invoices/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) fetchData();
    } catch (e) {
      alert("Erreur");
    }
  };

  const loadAvailableInvoices = async (operatorId: number) => {
    setAvailableInvoices([]);
    setLoadingAvailable(true);
    try {
      const res = await fetch(`/api/telecom/operators/${operatorId}/available-invoices`, { headers: { 'Authorization': `Bearer ${token}` } });
      if (res.ok) setAvailableInvoices(await res.json());
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingAvailable(false);
    }
  };

  const openAddInvoice = (acc: BillingAccount) => {
    setShowAddInvoiceModal(true);
    setAddInvoiceOperatorId(acc.operator_id);
    setAddInvoiceAccountId(acc.id);
    setAvailableSearch('');
    loadAvailableInvoices(acc.operator_id);
  };

  const openAddInvoicePicker = () => {
    setShowAddInvoiceModal(true);
    setAddInvoiceOperatorId(invoiceOperatorFilter);
    setAddInvoiceAccountId(invoiceAccountFilter);
    setAvailableInvoices([]);
    setAvailableSearch('');
    if (invoiceOperatorFilter) loadAvailableInvoices(invoiceOperatorFilter);
  };

  const handleAddInvoiceFromBudget = async (candidate: AvailableBudgetInvoice) => {
    if (!addInvoiceOperatorId) return;
    setAddingInvoiceNumber(candidate.invoice_number);
    try {
      const res = await fetch('/api/telecom/invoices/from-budget', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({
          operator_id: addInvoiceOperatorId,
          billing_account_id: addInvoiceAccountId,
          invoice_number: candidate.invoice_number,
        }),
      });
      if (res.ok) {
        setAvailableInvoices(prev => prev.filter(c => c.invoice_number !== candidate.invoice_number));
        await fetchAccounts(addInvoiceOperatorId);
        await fetchData();
      } else {
        const data = await res.json();
        alert('Erreur : ' + (data.message || 'inconnue'));
      }
    } catch (e) {
      alert("Erreur lors de l'ajout de la facture");
    } finally {
      setAddingInvoiceNumber(null);
    }
  };

  const startEditMeta = (inv: TelecomInvoice) => {
    setEditingMeta({
      id: inv.id,
      billing_month: inv.billing_month || inv.effective_month || '',
      description: inv.description || '',
    });
  };

  const handleSaveMeta = async () => {
    if (!editingMeta) return;
    try {
      const res = await fetch(`/api/telecom/invoices/${editingMeta.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ billing_month: editingMeta.billing_month, description: editingMeta.description }),
      });
      if (res.ok) {
        setEditingMeta(null);
        await fetchData();
      } else {
        alert('Erreur lors de la mise à jour');
      }
    } catch (e) {
      alert('Erreur de connexion');
    }
  };

  const toggleOperator = (id: number) => {
    setExpandedOperators(prev =>
      prev.includes(id) ? prev.filter(oid => oid !== id) : [...prev, id]
    );
  };

  const handleViewInvoices = (accountId: number, operatorId: number) => {
    setInvoiceAccountFilter(accountId);
    setInvoiceOperatorFilter(operatorId);
    setActiveTab('pdfs');
  };

  const openRejectedInvoices = async (acc: BillingAccount, op: Operator) => {
    setRejectedDetail({ title: `${op.name} — ${acc.account_number}`, operator_id: op.id, billing_account_id: acc.id });
    setRejectedInvoices([]);
    setLoadingRejected(true);
    try {
      const res = await fetch(`/api/telecom/invoices/rejected?operator_id=${op.id}&billing_account_id=${acc.id}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) setRejectedInvoices(await res.json());
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingRejected(false);
    }
  };

  const tierDisplayName = (t?: Tier) =>
    t ? (t.complement_nom ? `${t.nom} ${t.complement_nom}` : t.nom) : '';

  const filteredTiers = allTiers.filter(t => 
    ((t.nom + ' ' + (t.complement_nom || '') + ' ' + t.code).toLowerCase().includes(tierSearch.toLowerCase())) && 
    !operators.some(op => op.tier_code === t.code)
  ).slice(0, 5);

  const editFilteredTiers = allTiers.filter(t =>
    ((t.nom + ' ' + (t.complement_nom || '') + ' ' + t.code).toLowerCase().includes(editTierSearch.toLowerCase())) &&
    !operators.some(op => op.tier_code === t.code && op.id !== editingOperator?.id)
  ).slice(0, 5);

  const filteredInvoices = telecomInvoices.filter(inv => {
    const matchesSearch = !invoiceSearch || 
      inv.invoice_number.toLowerCase().includes(invoiceSearch.toLowerCase()) || 
      (inv.account_number || '').toLowerCase().includes(invoiceSearch.toLowerCase());
    const matchesOperator = !invoiceOperatorFilter || inv.operator_id === invoiceOperatorFilter;
    const matchesAccount = !invoiceAccountFilter || inv.billing_account_id === invoiceAccountFilter;
    return matchesSearch && matchesOperator && matchesAccount;
  }).sort((a, b) => new Date(b.invoice_date).getTime() - new Date(a.invoice_date).getTime());

  // Group by month — le mois "effectif" tient compte de l'éventuelle correction manuelle (billing_month)
  const groupedInvoices: Record<string, TelecomInvoice[]> = {};
  filteredInvoices.forEach(inv => {
    const monthKey = inv.effective_month || inv.billing_month || 'Inconnue';
    if (!groupedInvoices[monthKey]) groupedInvoices[monthKey] = [];
    groupedInvoices[monthKey].push(inv);
  });

  const monthNames = ["Janvier", "Février", "Mars", "Avril", "Mai", "Juin", "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"];
  const formatMonthKey = (key: string) => {
    if (key === 'Inconnue') return 'Date inconnue';
    const [year, month] = key.split('-');
    return `${monthNames[parseInt(month) - 1]} ${year}`;
  };

  return (
    <div className="telecom-container">
      <Header />
      <main className={`telecom-main${activeTab === 'summary' ? ' summary-wide' : ''}`}>
        <div className="telecom-page-header">
          <button className="back-button" onClick={() => navigate('/')}>
            <ArrowLeft size={20} />
          </button>
          <div className="title-group">
            <h1>Gestion Télécom</h1>
            <p>Factures, comptes et engagements</p>
          </div>
          <div className="tab-switcher">
            <button className={activeTab === 'invoices' ? 'active' : ''} onClick={() => setActiveTab('invoices')}>
              <Building2 size={18} /> Comptes
            </button>
            <button className={activeTab === 'pdfs' ? 'active' : ''} onClick={() => setActiveTab('pdfs')}>
              <CreditCard size={18} /> Factures PDF
            </button>
            <button className={activeTab === 'summary' ? 'active' : ''} onClick={() => setActiveTab('summary')}>
              <FileSpreadsheet size={18} /> Synthèse mensuelle
            </button>
            <button className={activeTab === 'lines' ? 'active' : ''} onClick={() => setActiveTab('lines')}>
              <List size={18} /> Engagements
            </button>
            <button className={activeTab === 'network' ? 'active' : ''} onClick={() => setActiveTab('network')}>
              <Network size={18} /> Lignes & Internet
            </button>
            <button className={activeTab === 'billing' ? 'active' : ''} onClick={() => setActiveTab('billing')}>
              <Phone size={18} /> Coûts & Mobile
            </button>
            <button className={activeTab === 'optim' ? 'active' : ''} onClick={() => setActiveTab('optim')}>
              <AlertTriangle size={18} /> Optimisation
            </button>
          </div>
        </div>

        {activeTab === 'invoices' && (
          <div className="tab-content">
            <div className="section-header">
              <h2>Opérateurs et Comptes de facturation</h2>
              <button className="add-btn" onClick={() => setShowAddOperator(true)}>
                <Plus size={18} /> Ajouter un opérateur
              </button>
            </div>

            {showAddOperator && (
              <div className="operator-search-card">
                <div className="search-input-wrapper">
                  <Search size={18} className="search-icon" />
                  <input 
                    type="text" 
                    placeholder="Rechercher un tiers par nom ou code..." 
                    value={tierSearch}
                    onChange={e => { setTierSearch(e.target.value); setSelectedTier(null); }}
                    autoFocus
                  />
                  <button className="close-search" onClick={() => { setShowAddOperator(false); setSelectedTier(null); }}>Annuler</button>
                </div>
                {selectedTier ? (
                  <div className="tier-create-box">
                    <div className="tier-selected-info">
                      Tiers choisi : <strong>{tierDisplayName(selectedTier)}</strong> <span className="tier-code">{selectedTier.code}</span>
                    </div>
                    <div className="form-grid" style={{ gridTemplateColumns: '1fr', marginBottom: 15 }}>
                      <div className="form-group">
                        <label>Nom de l'opérateur (tel qu'il apparaît sur les factures)</label>
                        <input
                          type="text"
                          value={newOperatorName}
                          onChange={e => setNewOperatorName(e.target.value)}
                          onKeyDown={e => { if (e.key === 'Enter') handleAddOperator(); }}
                          autoFocus
                        />
                      </div>
                    </div>
                    <div className="form-actions">
                      <button className="cancel-btn" onClick={() => setSelectedTier(null)}>Changer de tiers</button>
                      <button className="save-btn" onClick={handleAddOperator}><Plus size={16} /> Créer l'opérateur</button>
                    </div>
                  </div>
                ) : tierSearch ? (
                  <div className="tier-results">
                    {filteredTiers.map(t => (
                      <div key={t.code} className="tier-result-item" onClick={() => { setSelectedTier(t); setNewOperatorName(t.nom); }}>
                        <span className="tier-name">{tierDisplayName(t)}</span>
                        <span className="tier-code">{t.code}</span>
                      </div>
                    ))}
                    {filteredTiers.length === 0 && <div className="no-result">Aucun tiers trouvé</div>}
                  </div>
                ) : (
                  <div className="no-result" style={{ padding: '12px 4px 4px', textAlign: 'left' }}>Saisissez un nom de tiers pour démarrer la recherche.</div>
                )}
              </div>
            )}

            <div className="operators-list">
              {operators.map(op => (
                <div key={op.id} className={`operator-card ${expandedOperators.includes(op.id) ? 'expanded' : ''}`}>
                  <div className="operator-card-header" onClick={() => toggleOperator(op.id)}>
                    <div className="op-info">
                      <div className="op-icon"><Building2 size={24} /></div>
                      <div>
                        <h3>{op.name}</h3>
                        <span className="account-count">{billingAccounts[op.id]?.length || 0} compte(s)</span>
                      </div>
                    </div>
                    <div className="op-actions">
                      <button className="edit-op-btn" title="Modifier l'opérateur (nom ou tiers)" onClick={(e) => { e.stopPropagation(); setEditTierSearch(''); setEditingOperator({ ...op }); }}>
                        <Edit2 size={18} />
                      </button>
                      <button className="delete-op-btn" onClick={(e) => { e.stopPropagation(); handleDeleteOperator(op.id); }}>
                        <Trash2 size={18} />
                      </button>
                      {expandedOperators.includes(op.id) ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
                    </div>
                  </div>

                  {editingOperator && editingOperator.id === op.id && (
                    <div className="operator-edit-form">
                      <div className="form-header-small">Modifier l'opérateur</div>
                      <div style={{ fontSize: '0.82rem', color: '#64748b', marginBottom: 12 }}>
                        {op.tier_code != null
                          ? <>Tiers d'origine : <strong style={{ color: '#1e293b' }}>{tierDisplayName(allTiers.find(t => t.code === op.tier_code)) || op.tier_code}</strong> — le nom de l'opérateur peut en différer (ex. « moji » facturé par « CFI »).</>
                          : 'Aucun tiers lié.'}
                      </div>
                      <div className="form-grid" style={{ gridTemplateColumns: '1fr', marginBottom: 15 }}>
                        <div className="form-group">
                          <label>Nom de l'opérateur (tel qu'il apparaît sur les factures)</label>
                          <input
                            type="text"
                            value={editingOperator.name}
                            autoFocus
                            onChange={e => setEditingOperator({ ...editingOperator, name: e.target.value })}
                            onKeyDown={e => { if (e.key === 'Enter') handleUpdateOperator(); if (e.key === 'Escape') setEditingOperator(null); }}
                          />
                        </div>
                        <div className="form-group">
                          <label>Associer un tiers (facultatif, permet de proposer ses factures du budget)</label>
                          <div className="search-input-wrapper">
                            <Search size={14} />
                            <input
                              type="text"
                              placeholder="Rechercher un tiers par nom ou code..."
                              value={editTierSearch}
                              onChange={e => { setEditTierSearch(e.target.value); }}
                            />
                          </div>
                          {editTierSearch && (
                            <div className="tier-results">
                              {editFilteredTiers.map(t => (
                                <div key={t.code} className="tier-result-item" onClick={() => { setEditingOperator({ ...editingOperator, tier_code: t.code }); setEditTierSearch(''); }}>
                                  <span className="tier-name">{tierDisplayName(t)}</span>
                                  <span className="tier-code">{t.code}</span>
                                </div>
                              ))}
                              {editFilteredTiers.length === 0 && <div className="no-result">Aucun tiers trouvé</div>}
                            </div>
                          )}
                          {editingOperator.tier_code && (
                            <div style={{ marginTop: 6 }}>
                              <button className="cancel-btn" onClick={() => setEditingOperator({ ...editingOperator, tier_code: undefined })}>
                                Retirer le tiers
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="form-actions">
                        <button className="cancel-btn" onClick={() => { setEditingOperator(null); setEditTierSearch(''); }}>Annuler</button>
                        <button className="save-btn" onClick={handleUpdateOperator}><Save size={16} /> Enregistrer</button>
                      </div>
                    </div>
                  )}

                  {expandedOperators.includes(op.id) && (
                    <div className="operator-card-body">
                      <div className="accounts-header">
                        <h4>Comptes de facturation</h4>
                        <button className="add-account-btn" onClick={() => { setEditingAccount(null); setShowAddAccount(op.id); }}>
                          <Plus size={14} /> Nouveau compte
                        </button>
                      </div>

                      {showAddAccount === op.id && (
                        <div className="add-account-form">
                          <div className="form-header-small">
                            {editingAccount ? "Modifier le compte" : "Ajouter un nouveau compte"}
                          </div>
                          <div className="form-grid">
                            <div className="form-group">
                              <label>N° de compte</label>
                              <input type="text" value={editingAccount ? editingAccount.account_number : newAccount.account_number} onChange={e => editingAccount ? setEditingAccount({...editingAccount, account_number: e.target.value}) : setNewAccount({...newAccount, account_number: e.target.value})} />
                            </div>
                            <div className="form-group">
                              <label>Type</label>
                              <select value={editingAccount ? editingAccount.type : newAccount.type} onChange={e => editingAccount ? setEditingAccount({...editingAccount, type: e.target.value}) : setNewAccount({...newAccount, type: e.target.value})}>
                                <option value="Fixe">Téléphonie fixe</option>
                                <option value="Mobile">Téléphonie mobile</option>
                                <option value="Interco">Liens interco</option>
                                <option value="Internet">Accès internet</option>
                              </select>
                            </div>
                            <div className="form-group">
                              <label>Désignation</label>
                              <input type="text" value={editingAccount ? editingAccount.designation : newAccount.designation} onChange={e => editingAccount ? setEditingAccount({...editingAccount, designation: e.target.value}) : setNewAccount({...newAccount, designation: e.target.value})} />
                            </div>
                            <div className="form-group">
                              <label>N° Client</label>
                              <input type="text" value={editingAccount ? editingAccount.customer_number : newAccount.customer_number} onChange={e => editingAccount ? setEditingAccount({...editingAccount, customer_number: e.target.value}) : setNewAccount({...newAccount, customer_number: e.target.value})} />
                            </div>
                            <div className="form-group">
                              <label>N° Marché</label>
                              <input type="text" value={editingAccount ? editingAccount.market_number : newAccount.market_number} onChange={e => editingAccount ? setEditingAccount({...editingAccount, market_number: e.target.value}) : setNewAccount({...newAccount, market_number: e.target.value})} />
                            </div>
                            <div className="form-group">
                              <label>Code Fonction</label>
                              <input type="text" value={editingAccount ? editingAccount.function_code : newAccount.function_code} onChange={e => editingAccount ? setEditingAccount({...editingAccount, function_code: e.target.value}) : setNewAccount({...newAccount, function_code: e.target.value})} />
                            </div>
                            <div className="form-group">
                              <label>N° Engagement</label>
                              <input type="text" value={editingAccount ? editingAccount.commitment_number : newAccount.commitment_number} onChange={e => editingAccount ? setEditingAccount({...editingAccount, commitment_number: e.target.value}) : setNewAccount({...newAccount, commitment_number: e.target.value})} />
                            </div>
                          </div>
                          <div className="form-actions">
                            <button className="cancel-btn" onClick={() => { setShowAddAccount(null); setEditingAccount(null); }}>Annuler</button>
                            <button className="save-btn" onClick={() => handleSaveAccount(op.id)}><Save size={16} /> {editingAccount ? "Mettre à jour" : "Enregistrer"}</button>
                          </div>
                        </div>
                      )}

                      <div className="accounts-table-wrapper">
                        {(() => {
                          const accountsByCommitment: Record<string, BillingAccount[]> = {};
                          (billingAccounts[op.id] || []).forEach(acc => {
                            const key = acc.commitment_number || 'Sans engagement';
                            if (!accountsByCommitment[key]) accountsByCommitment[key] = [];
                            accountsByCommitment[key].push(acc);
                          });

                          return Object.entries(accountsByCommitment).map(([commNum, accounts]) => {
                            const totalInvoicedForComm = accounts.reduce((sum, a) => sum + (a.total_invoiced || 0), 0);
                            const commAmount = accounts[0]?.commitment_amount || 0;
                            const commBalance = commAmount - totalInvoicedForComm;

                            return (
                              <div key={commNum} className="commitment-group">
                                <div className="commitment-group-header">
                                  <div className="comm-info-tag">
                                    <span className="comm-label">Engagement : </span>
                                    <span className="comm-value">{commNum}</span>
                                    {commNum !== 'Sans engagement' && (
                                      <>
                                        <span className="comm-amount-tag">
                                          ({commAmount.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })})
                                        </span>
                                        <span className={`comm-balance-tag ${commBalance < 0 ? 'negative' : 'positive'}`}>
                                          Solde : {commBalance.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })}
                                        </span>
                                      </>
                                    )}
                                  </div>
                                </div>
                                <table className="accounts-table">
                                  <thead>
                                    <tr>
                                      <th style={{ width: '100px' }}>Type</th>
                                      <th style={{ width: '150px' }}>N° Compte</th>
                                      <th>Désignation</th>
                                      <th style={{ width: '80px', textAlign: 'center' }}>Factures</th>
                                      <th style={{ width: '120px', textAlign: 'right' }}>Facturé</th>
                                      <th style={{ width: '100px', textAlign: 'center' }}>Actions</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {accounts.map(acc => (
                                      <tr key={acc.id}>
                                        <td><span className={`type-badge ${acc.type.toLowerCase()}`}>{acc.type}</span></td>
                                        <td style={{ fontWeight: 600 }}>{acc.account_number}</td>
                                        <td>{acc.designation}</td>
                                        <td style={{ textAlign: 'center' }}>
                                          <button 
                                            className="invoice-count-btn" 
                                            onClick={() => handleViewInvoices(acc.id, op.id)}
                                            title="Voir les factures de ce compte"
                                          >
                                            <FileText size={14} />
                                            <span>{acc.invoice_count || 0}</span>
                                          </button>
                                          {(acc.rejected_count ?? 0) > 0 && (
                                            <button
                                              className="invoice-count-btn rejected"
                                              onClick={() => openRejectedInvoices(acc, op)}
                                              title="Voir les factures rejetées / écartées"
                                            >
                                              <X size={14} />
                                              <span>{acc.rejected_count}</span>
                                            </button>
                                          )}
                                        </td>
                                        <td className="amount-col">
                                          {(acc.total_invoiced || 0).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })}
                                        </td>
                                        <td>
                                          <div className="action-btns" style={{ justifyContent: 'center' }}>
                                            <button className="edit-icon-btn" title="Ajouter une facture depuis le budget" onClick={() => openAddInvoice(acc)}>
                                              <Plus size={16} />
                                            </button>
                                            <button className="edit-icon-btn" onClick={() => startEditAccount(acc)}>
                                              <Edit2 size={16} />
                                            </button>
                                            <button className="delete-icon-btn" onClick={() => handleDeleteAccount(acc.id, op.id)}>
                                              <Trash2 size={16} />
                                            </button>
                                          </div>
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            );
                          });
                        })()}
                        {(!billingAccounts[op.id] || billingAccounts[op.id].length === 0) && (
                          <div style={{ textAlign: 'center', padding: '40px', color: '#64748b' }}>Aucun compte configuré</div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              ))}
              {operators.length === 0 && (
                <div className="empty-state">
                  <Building2 size={48} />
                  <p>Aucun opérateur configuré. Commencez par en ajouter un.</p>
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'pdfs' && (
          <div className="tab-content">
            <div className="section-header">
              <h2>Historique des factures</h2>
              <div className="action-group">
                <button className="add-btn" onClick={openAddInvoicePicker}>
                  <Plus size={18} /> Ajouter une facture
                </button>
                <input
                  type="file"
                  id="import-telecom-suivi"
                  style={{ display: 'none' }}
                  accept=".xlsx,.xls"
                  onChange={handleImportSuivi}
                />
                <button className="add-btn" disabled={importingSuivi} onClick={() => document.getElementById('import-telecom-suivi')?.click()}
                  title="Importe l'onglet Suivi du fichier SUIVI TELECOM (n° de facture affectés automatiquement, opérateur/compte créés si besoin)">
                  <FileSpreadsheet size={18} /> {importingSuivi ? 'Import en cours...' : 'Importer le fichier Suivi'}
                </button>
              </div>
            </div>

            <div className="invoice-filters admin-card">
              <div className="filters-grid">
                <div className="filter-group">
                  <label>Rechercher</label>
                  <div className="search-input-wrapper-mini">
                    <Search size={14} />
                    <input 
                      type="text" 
                      placeholder="N° facture, compte..." 
                      value={invoiceSearch}
                      onChange={e => setInvoiceSearch(e.target.value)}
                    />
                  </div>
                </div>
                <div className="filter-group">
                  <label>Opérateur</label>
                  <select 
                    value={invoiceOperatorFilter || ''} 
                    onChange={e => {
                      const val = e.target.value ? parseInt(e.target.value) : null;
                      setInvoiceOperatorFilter(val);
                      setInvoiceAccountFilter(null);
                    }}
                  >
                    <option value="">Tous les opérateurs</option>
                    {operators.map(op => <option key={op.id} value={op.id}>{op.name}</option>)}
                  </select>
                </div>
                <div className="filter-group">
                  <label>Compte</label>
                  <select 
                    value={invoiceAccountFilter || ''} 
                    onChange={e => setInvoiceAccountFilter(e.target.value ? parseInt(e.target.value) : null)}
                    disabled={!invoiceOperatorFilter}
                  >
                    <option value="">Tous les comptes</option>
                    {invoiceOperatorFilter && billingAccounts[invoiceOperatorFilter]?.map(acc => (
                      <option key={acc.id} value={acc.id}>{acc.account_number} ({acc.designation})</option>
                    ))}
                  </select>
                </div>
                <div className="filter-group-actions">
                  <button className="clear-filters" onClick={() => {
                    setInvoiceSearch('');
                    setInvoiceOperatorFilter(null);
                    setInvoiceAccountFilter(null);
                  }}>Réinitialiser</button>
                </div>
              </div>
            </div>

            <div className="invoices-list admin-card">
              <table className="commitments-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>N° Facture</th>
                    <th>Opérateur</th>
                    <th>N° Compte</th>
                    <th>Mois</th>
                    <th>Description</th>
                    <th>Montant TTC</th>
                    <th>État</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(groupedInvoices).sort((a, b) => b[0].localeCompare(a[0])).map(([monthKey, invoices]) => (
                    <React.Fragment key={monthKey}>
                      <tr className="month-break-row">
                        <td colSpan={9}>{formatMonthKey(monthKey)}</td>
                      </tr>
                      {invoices.map(inv => {
                        const isEditing = editingMeta?.id === inv.id;
                        return (
                        <tr key={inv.id}>
                          <td>{inv.invoice_date ? new Date(inv.invoice_date).toLocaleDateString('fr-FR') : 'Inconnue'}</td>
                          <td style={{ fontWeight: 700 }}>{inv.invoice_number}</td>
                          <td>{inv.operator_name || <span style={{ color: '#ef4444' }}>Inconnu</span>}</td>
                          <td>{inv.account_number || <span style={{ color: '#ef4444' }}>Inconnu</span>}</td>
                          <td>
                            {isEditing ? (
                              <input type="month" value={editingMeta!.billing_month} style={{ width: 130 }}
                                onChange={e => setEditingMeta(m => m ? { ...m, billing_month: e.target.value } : m)} />
                            ) : (inv.effective_month ? formatMonthKey(inv.effective_month) : '—')}
                          </td>
                          <td>
                            {isEditing ? (
                              <input type="text" value={editingMeta!.description} placeholder="Description..." style={{ width: 160 }}
                                onChange={e => setEditingMeta(m => m ? { ...m, description: e.target.value } : m)} />
                            ) : (inv.description || <span style={{ color: '#cbd5e1' }}>—</span>)}
                          </td>
                          <td style={{ fontWeight: 700 }}>{inv.amount_ttc != null ? inv.amount_ttc.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' }) : <span style={{ color: '#94a3b8' }}>—</span>}</td>
                          <td>
                            {inv.general_status ? (
                              <span className="status-tag imported" title={`Statut budget : ${inv.general_status}`}>
                                {inv.general_status}
                              </span>
                            ) : (
                              <span className="status-tag pending">Statut inconnu</span>
                            )}
                          </td>
                          <td>
                            <div className="action-btns">
                              {isEditing ? (
                                <>
                                  <button className="edit-icon-btn" title="Enregistrer" onClick={handleSaveMeta}><Check size={18} /></button>
                                  <button className="delete-icon-btn" title="Annuler" onClick={() => setEditingMeta(null)}><X size={18} /></button>
                                </>
                              ) : (
                                <>
                                  <button className="edit-icon-btn" title="Modifier le mois / la description" onClick={() => startEditMeta(inv)}>
                                    <Edit2 size={18} />
                                  </button>
                                  {inv.file_path ? (
                                    <a href={`/api/${inv.file_path}`} target="_blank" rel="noopener noreferrer" className="edit-icon-btn" title="Voir le PDF">
                                      <FileText size={18} />
                                    </a>
                                  ) : inv.sedit_ref ? (
                                    <a href={`${urlSedit}/FicheFacture.html?factureId=${encodeURIComponent(inv.sedit_ref)}`} target="_blank" rel="noopener noreferrer" className="edit-icon-btn" title="Ouvrir dans Sedit">
                                      <ExternalLink size={18} />
                                    </a>
                                  ) : null}
                                  <button className="delete-icon-btn" onClick={() => handleDeleteTelecomInvoice(inv.id)}>
                                    <Trash2 size={18} />
                                  </button>
                                </>
                              )}
                            </div>
                          </td>
                        </tr>
                        );
                      })}
                    </React.Fragment>
                  ))}
                  {filteredInvoices.length === 0 && (
                    <tr><td colSpan={9} style={{ textAlign: 'center', padding: '40px', color: '#64748b' }}>Aucune facture trouvée</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === 'summary' && (
          <div className="tab-content">
            <div className="section-header">
              <h2>Synthèse mensuelle par compte</h2>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: '0.85rem', color: '#64748b' }}>Montant facturé par mois — cliquez sur un montant pour voir la ou les factures</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <button className="page-btn" onClick={() => setSummaryYear(y => y - 1)}>◀</button>
                  <span style={{ fontWeight: 700, fontSize: 14, minWidth: 44, textAlign: 'center' }}>{summaryYear}</span>
                  <button className="page-btn" onClick={() => setSummaryYear(y => y + 1)}>▶</button>
                </div>
              </div>
            </div>

            {loadingSummary ? (
              <div style={{ textAlign: 'center', padding: '40px', color: '#64748b' }}>Chargement...</div>
            ) : !monthlySummary || monthlySummary.rows.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px', color: '#64748b' }}>Aucune donnée</div>
            ) : (
              <div className="accounts-table-wrapper admin-card" style={{ overflowX: 'auto' }}>
                <table className="commitments-table summary-table" style={{ minWidth: `${640 + monthlySummary.months.length * 110}px` }}>
                  <thead>
                    <tr>
                      <th style={{ width: 160, minWidth: 160, maxWidth: 160 }}>Opérateur</th>
                      <th style={{ width: 130, minWidth: 130, maxWidth: 130 }}>N° Compte</th>
                      <th style={{ minWidth: 190 }}>Désignation</th>
                      {monthlySummary.months.map(m => (
                        <th key={m} style={{ textAlign: 'right', minWidth: 108 }}>
                          {monthNames[parseInt(m.split('-')[1], 10) - 1].slice(0, 3)} {m.split('-')[0].slice(2)}
                        </th>
                      ))}
                      <th style={{ textAlign: 'right', minWidth: 110, fontWeight: 800 }}>Total</th>
                      <th style={{ textAlign: 'right', minWidth: 120, fontWeight: 800 }}>Atterrissage</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(() => {
                      let currentOperatorId: number | null = null;
                      const nodes: React.ReactNode[] = [];
                      monthlySummary.rows.forEach(row => {
                        if (row.operator_id !== currentOperatorId) {
                          currentOperatorId = row.operator_id;
                          const op = monthlySummary!.operators.find(o => o.operator_id === row.operator_id);
                          const sparkValues = op ? monthlySummary!.months.map(m => op.monthly[m] || 0) : [];
                          nodes.push(
                            <tr key={`op-${currentOperatorId}`} className="month-break-row">
                              <td style={{ fontWeight: 700 }} title={row.operator_name}>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 2, overflow: 'hidden' }}>
                                  <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{row.operator_name}</span>
                                  <Sparkline values={sparkValues} width={130} height={16} />
                                </div>
                              </td>
                              <td></td>
                              <td></td>
                              {monthlySummary!.months.map((m, i) => {
                                const val = op?.monthly[m] || 0;
                                const prevVal = i > 0 ? (op?.monthly[monthlySummary!.months[i - 1]] || 0) : null;
                                const trend = prevVal != null ? monthTrend(val, prevVal) : null;
                                return (
                                  <td key={m} style={{ textAlign: 'right', fontWeight: 700 }}>
                                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                                      {trend && val > 0 && <span title={trend.title} style={{ display: 'inline-flex' }}><trend.Icon size={11} color={trend.color} /></span>}
                                      {val > 0 ? val.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' }) : <span style={{ color: '#cbd5e1' }}>—</span>}
                                    </span>
                                  </td>
                                );
                              })}
                              <td style={{ textAlign: 'right', fontWeight: 800 }}>
                                {op ? op.total.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' }) : '—'}
                              </td>
                              <td style={{ textAlign: 'right', fontWeight: 800, color: '#6366f1' }}>
                                {op?.landing != null ? op.landing.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' }) : '—'}
                              </td>
                            </tr>
                          );
                        }
                        nodes.push(
                          <tr key={row.account_id}>
                            <td></td>
                            <td style={{ fontWeight: 600 }}>{row.account_number}</td>
                            <td>{row.designation || <span style={{ color: '#94a3b8' }}>—</span>}</td>
                            {monthlySummary!.months.map((m, i) => {
                              const cell = row.monthly[m];
                              const prevCell = i > 0 ? row.monthly[monthlySummary!.months[i - 1]] : null;
                              const trend = cell.total != null && prevCell?.total != null ? monthTrend(cell.total, prevCell.total) : null;
                              const isMissing = cell.isPast && cell.total == null && !cell.comment;
                              return (
                                <td key={m} className="summary-cell" style={{ textAlign: 'right', background: isMissing ? '#fef2f2' : undefined }}>
                                  {cell.total != null ? (
                                    <button className="summary-cell-btn"
                                      onClick={() => setViewingCell({ label: `${row.account_number} — ${formatMonthKey(m)}`, invoices: cell.invoices })}>
                                      {trend && <span title={trend.title} style={{ display: 'inline-flex' }}><trend.Icon size={10} color={trend.color} /></span>}
                                      {cell.total.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })}
                                    </button>
                                  ) : isMissing ? (
                                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                                      <span style={{ color: '#dc2626', fontSize: 10.5, fontWeight: 600 }}>Manquant</span>
                                      <button className="summary-comment-btn missing"
                                        title="Ajouter un commentaire"
                                        onClick={() => setCommentEditor({ accountId: row.account_id, month: m, value: cell.comment || '' })}>+</button>
                                    </span>
                                  ) : cell.comment ? (
                                    <button className="summary-comment-btn" title={cell.comment}
                                      onClick={() => setCommentEditor({ accountId: row.account_id, month: m, value: cell.comment || '' })}>
                                      <MessageSquare size={12} />
                                    </button>
                                  ) : (
                                    <span style={{ color: '#cbd5e1' }}>—</span>
                                  )}
                                </td>
                              );
                            })}
                            <td style={{ textAlign: 'right', fontWeight: 700 }}>
                              {row.total.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })}
                            </td>
                            <td style={{ textAlign: 'right', color: '#6366f1', fontWeight: 600 }}>
                              {row.landing != null ? row.landing.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' }) : '—'}
                            </td>
                          </tr>
                        );
                      });

                      // Ligne de total général
                      nodes.push(
                        <tr key="global-total" className="month-break-row" style={{ borderTop: '2px solid #cbd5e1' }}>
                          <td style={{ fontWeight: 800 }}>TOTAL GÉNÉRAL</td>
                          <td></td>
                          <td></td>
                          {monthlySummary!.months.map((m, i) => {
                            const val = monthlySummary!.global.monthly[m] || 0;
                            const prevVal = i > 0 ? (monthlySummary!.global.monthly[monthlySummary!.months[i - 1]] || 0) : null;
                            const trend = prevVal != null ? monthTrend(val, prevVal) : null;
                            return (
                              <td key={m} style={{ textAlign: 'right', fontWeight: 800 }}>
                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                                  {trend && val > 0 && <span title={trend.title} style={{ display: 'inline-flex' }}><trend.Icon size={11} color={trend.color} /></span>}
                                  {val > 0 ? val.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' }) : <span style={{ color: '#cbd5e1' }}>—</span>}
                                </span>
                              </td>
                            );
                          })}
                          <td style={{ textAlign: 'right', fontWeight: 800 }}>
                            {monthlySummary!.global.total.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })}
                          </td>
                          <td style={{ textAlign: 'right', fontWeight: 800, color: '#6366f1' }}>
                            {monthlySummary!.global.landing != null ? monthlySummary!.global.landing.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' }) : '—'}
                          </td>
                        </tr>
                      );

                      return nodes;
                    })()}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {activeTab === 'lines' && (
          <div className="tab-content">
            <div className="section-header">
              <h2>Engagements Télécom (nature 6262)</h2>
              <span style={{ fontSize: '0.85rem', color: '#64748b' }}>Issus du suivi budgétaire — montant engagé et reste actualisés automatiquement</span>
            </div>

            <div className="commitments-table-wrapper admin-card">
              <table className="commitments-table">
                <thead>
                  <tr>
                    <th>Année</th>
                    <th>N° Engagement</th>
                    <th>Libellé</th>
                    <th>Opérateur</th>
                    <th>Montant Engagé</th>
                    <th>Reste Engagé</th>
                    <th>Montant Facturé</th>
                    <th>Solde</th>
                  </tr>
                </thead>
                <tbody>
                  {commitments.map(c => {
                    const engaged = c.engaged_amount ?? c.amount ?? 0;
                    const remaining = c.remaining_amount;
                    const dynamic = c.engaged_amount != null;
                    return (
                    <tr key={c.id ?? c.commitment_number}>
                      <td className="year-cell">{c.year}</td>
                      <td className="num-cell">{c.commitment_number}</td>
                      <td>{c.label}</td>
                      <td>{c.operator_name}</td>
                      <td className="amount-cell" title={dynamic ? 'Montant récupéré dynamiquement depuis les engagements budgétaires' : 'Montant importé (engagement budgétaire non trouvé)'}>
                        {(engaged || 0).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })}
                        {!dynamic && <span style={{ color: '#f59e0b', marginLeft: 4 }} title="Engagement budgétaire non trouvé">*</span>}
                      </td>
                      <td className="amount-cell" style={{ color: remaining == null ? '#cbd5e1' : (remaining > 0 ? '#2563eb' : '#059669'), fontWeight: 600 }}>
                        {remaining == null ? '—' : remaining.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })}
                      </td>
                      <td className="amount-cell" style={{ color: '#64748b' }}>{(c.invoiced_amount || 0).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })}</td>
                      <td className="amount-cell" style={{ color: ((engaged || 0) - (c.invoiced_amount || 0)) < 0 ? '#ef4444' : '#059669', fontWeight: 700 }}>
                        {((engaged || 0) - (c.invoiced_amount || 0)).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })}
                      </td>
                    </tr>
                    );
                  })}
                  {commitments.length === 0 && (
                    <tr><td colSpan={8} style={{ textAlign: 'center', padding: '40px', color: '#64748b' }}>Aucun engagement télécom (nature 6262) dans le suivi budgétaire</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === 'network' && (
          <div className="tab-content">
            <div className="section-header">
              <div>
                <h2>Lignes fixes & accès internet</h2>
                <span style={{ fontSize: '0.85rem', color: '#64748b' }}>
                  Inventaire des lignes téléphoniques et accès data importé depuis les fichiers opérateur
                </span>
              </div>
              <div className="action-group">
                <input
                  type="file"
                  id="import-telecom-lines"
                  style={{ display: 'none' }}
                  accept=".xlsx,.xls"
                  multiple
                  onChange={handleImportLines}
                />
                <button className="add-btn" disabled={importingLines}
                  onClick={() => document.getElementById('import-telecom-lines')?.click()}>
                  <Upload size={18} /> {importingLines ? 'Import en cours…' : 'Importer / Réimporter (Excel)'}
                </button>
              </div>
            </div>

            {/* KPI cards */}
            {linesStats && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 12, marginBottom: 24 }}>
                {[
                  { label: 'Lignes totales', value: linesStats.total, color: '#0078a4', icon: <Network size={18} /> },
                  { label: 'Téléphonie fixe', value: linesStats.fixe, color: '#059669', icon: <Phone size={18} /> },
                  { label: 'Accès internet', value: linesStats.internet, color: '#d97706', icon: <Wifi size={18} /> },
                  { label: 'En service', value: linesStats.inService, color: '#2563eb', icon: <Check size={18} /> },
                  { label: 'Résiliation en cours', value: linesStats.resiliation, color: '#ef4444', icon: <X size={18} /> },
                  { label: 'À migrer (cuivre)', value: linesStats.toMigrate, color: '#7c3aed', icon: <AlertTriangle size={18} /> },
                ].map(k => (
                  <div key={k.label} className="admin-card" style={{ padding: '14px 16px', borderTop: `3px solid ${k.color}` }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: k.color }}>
                      {k.icon}
                      <span style={{ fontSize: '1.6rem', fontWeight: 800 }}>{k.value}</span>
                    </div>
                    <div style={{ fontSize: '0.78rem', color: '#64748b', marginTop: 4 }}>{k.label}</div>
                  </div>
                ))}
              </div>
            )}

            {/* Exploitation : alertes prioritaires */}
            {linesStats && (linesStats.migrationList.length > 0 || linesStats.resiliationList.length > 0) && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 24 }}>
                {linesStats.migrationList.length > 0 && (
                  <div className="admin-card" style={{ padding: 18, borderLeft: '4px solid #7c3aed' }}>
                    <h3 style={{ margin: '0 0 4px', fontSize: '1rem', color: '#1e293b', display: 'flex', alignItems: 'center', gap: 8 }}>
                      <AlertTriangle size={18} color="#7c3aed" /> Migration fin du cuivre (RTC) — {linesStats.migrationList.length} ligne(s)
                    </h3>
                    <p style={{ fontSize: '0.8rem', color: '#64748b', margin: '0 0 12px' }}>
                      Lignes marquées « à migrer » par l'opérateur avant fermeture du réseau cuivre. À planifier en priorité (bascule fibre / ToIP).
                    </p>
                    {linesStats.migrationList.map((l, i) => (
                      <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderTop: i ? '1px solid #f1f5f9' : 'none', fontSize: '0.85rem' }}>
                        <div>
                          <div style={{ fontWeight: 600, color: '#1e293b' }}>{l.site_name}</div>
                          <div style={{ color: '#94a3b8', fontSize: '0.75rem' }}>{l.access_type} · {l.ndi || l.mid}</div>
                        </div>
                        <span style={{ background: '#f3e8ff', color: '#7c3aed', padding: '2px 10px', borderRadius: 6, fontWeight: 700, height: 'fit-content' }}>Lot {l.copper_end_lot || '?'}</span>
                      </div>
                    ))}
                  </div>
                )}
                {linesStats.resiliationList.length > 0 && (
                  <div className="admin-card" style={{ padding: 18, borderLeft: '4px solid #ef4444' }}>
                    <h3 style={{ margin: '0 0 4px', fontSize: '1rem', color: '#1e293b', display: 'flex', alignItems: 'center', gap: 8 }}>
                      <X size={18} color="#ef4444" /> Résiliations en cours — {linesStats.resiliationList.length}
                    </h3>
                    <p style={{ fontSize: '0.8rem', color: '#64748b', margin: '0 0 12px' }}>
                      À surveiller : vérifier l'arrêt effectif de la facturation sur les comptes correspondants.
                    </p>
                    {linesStats.resiliationList.map((l, i) => (
                      <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderTop: i ? '1px solid #f1f5f9' : 'none', fontSize: '0.85rem' }}>
                        <div>
                          <div style={{ fontWeight: 600, color: '#1e293b' }}>{l.site_name}</div>
                          <div style={{ color: '#94a3b8', fontSize: '0.75rem' }}>{l.access_type} · {l.offer}</div>
                        </div>
                        <span style={{ color: '#94a3b8', fontSize: '0.75rem', height: 'fit-content' }}>{l.ndi || l.mid}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Répartition par type d'accès + Top sites */}
            {linesStats && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 24 }}>
                <div className="admin-card" style={{ padding: 18 }}>
                  <h3 style={{ margin: '0 0 14px', fontSize: '1rem', color: '#1e293b' }}>Répartition par type d'accès</h3>
                  {Object.entries(linesStats.byAccessType).sort((a, b) => b[1] - a[1]).map(([type, count]) => (
                    <div key={type} style={{ marginBottom: 10 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem', marginBottom: 3 }}>
                        <span style={{ color: '#475569' }}>{type}</span>
                        <span style={{ fontWeight: 700, color: '#1e293b' }}>{count}</span>
                      </div>
                      <div style={{ background: '#f1f5f9', borderRadius: 4, height: 7 }}>
                        <div style={{ background: '#0078a4', height: '100%', borderRadius: 4, width: `${(count / linesStats.total) * 100}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
                <div className="admin-card" style={{ padding: 18 }}>
                  <h3 style={{ margin: '0 0 14px', fontSize: '1rem', color: '#1e293b', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <MapPin size={16} color="#0078a4" /> Top 10 sites par nombre de lignes
                  </h3>
                  {linesStats.topSites.map((s, i) => (
                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderTop: i ? '1px solid #f1f5f9' : 'none', fontSize: '0.85rem' }}>
                      <span style={{ color: '#1e293b' }}>{s.site}</span>
                      <span style={{ display: 'flex', gap: 6 }}>
                        {s.fixe > 0 && <span style={{ background: '#ecfdf5', color: '#059669', padding: '1px 7px', borderRadius: 5, fontWeight: 600, fontSize: '0.72rem' }}>{s.fixe} fixe</span>}
                        {s.internet > 0 && <span style={{ background: '#fff7ed', color: '#d97706', padding: '1px 7px', borderRadius: 5, fontWeight: 600, fontSize: '0.72rem' }}>{s.internet} net</span>}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Groupements / têtes de ligne mutualisées */}
            {linesStats && linesStats.trunkList.length > 0 && (
              <div className="admin-card" style={{ padding: 18, marginBottom: 24, borderLeft: '4px solid #2563eb' }}>
                <h3 style={{ margin: '0 0 4px', fontSize: '1rem', color: '#1e293b', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Network size={18} color="#2563eb" /> Liens mutualisés — têtes de ligne ({linesStats.trunkList.length})
                </h3>
                <p style={{ fontSize: '0.8rem', color: '#64748b', margin: '0 0 12px' }}>
                  Chaque entrée est une <strong>tête de ligne</strong> (T2, T0, groupement) regroupant plusieurs numéros/canaux derrière un seul NDI.
                  Les numéros SDA secondaires ne figurent pas dans l'export opérateur. Cibles privilégiées de consolidation / bascule SIP.
                </p>
                <table className="commitments-table">
                  <thead>
                    <tr>
                      <th>Site</th>
                      <th>Type</th>
                      <th>NDI (tête de ligne)</th>
                      <th>Capacité</th>
                      <th>Compte fact.</th>
                    </tr>
                  </thead>
                  <tbody>
                    {linesStats.trunkList.map((t, i) => (
                      <tr key={i}>
                        <td style={{ fontWeight: 600 }}>{t.site_name}</td>
                        <td><span className="type-badge interco">{t.access_type}</span></td>
                        <td style={{ fontFamily: 'monospace', fontWeight: 700, color: '#0078a4' }}>{t.ndi || '—'}</td>
                        <td style={{ fontSize: '0.8rem', color: '#64748b' }}>{t.capacity}</td>
                        <td>{t.billing_account}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Filtres + tableau */}
            <div className="invoice-filters admin-card" style={{ marginBottom: 16 }}>
              <div style={{ display: 'flex', gap: 16, alignItems: 'flex-end', flexWrap: 'wrap' }}>
                <div className="filter-group">
                  <label>Catégorie</label>
                  <select value={lineCategory} onChange={e => { setLineCategory(e.target.value as any); setLinePage(0); }}>
                    <option value="all">Toutes</option>
                    <option value="fixe">Téléphonie fixe</option>
                    <option value="internet">Accès internet</option>
                  </select>
                </div>
                <div className="filter-group">
                  <label>Type d'accès</label>
                  <select value={lineAccessType} onChange={e => { setLineAccessType(e.target.value); setLinePage(0); }}>
                    <option value="all">Tous les types</option>
                    {[...new Set(lines.map(l => l.access_type).filter(Boolean))].sort().map(t => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </div>
                <div className="filter-group" style={{ flex: 1, minWidth: 220 }}>
                  <label>Rechercher</label>
                  <div className="search-input-wrapper-mini">
                    <Search size={14} />
                    <input type="text" placeholder="Site, MID, NDI, compte, adresse…" value={lineSearch} onChange={e => { setLineSearch(e.target.value); setLinePage(0); }} />
                  </div>
                </div>
              </div>
            </div>

            <div className="admin-card">
              <table className="commitments-table">
                <thead>
                  <tr>
                    <th>Catégorie</th>
                    <th>Site</th>
                    <th>Ville</th>
                    <th>Offre / Type</th>
                    <th>NDI / MID</th>
                    <th>Compte fact.</th>
                    <th>Statut</th>
                  </tr>
                </thead>
                <tbody>
                  {(() => {
                    const q = lineSearch.toLowerCase();
                    const filtered = lines
                      .filter(l => lineCategory === 'all' || l.category === lineCategory)
                      .filter(l => lineAccessType === 'all' || l.access_type === lineAccessType)
                      .filter(l => !q || [l.site_name, l.mid, l.ndi, l.billing_account, l.address].some(v => (v || '').toLowerCase().includes(q)));
                    const totalPages = Math.max(1, Math.ceil(filtered.length / LINE_PAGE_SIZE));
                    const page = Math.min(linePage, totalPages - 1);
                    const slice = filtered.slice(page * LINE_PAGE_SIZE, page * LINE_PAGE_SIZE + LINE_PAGE_SIZE);
                    if (filtered.length === 0) {
                      return (
                        <tr><td colSpan={7} style={{ textAlign: 'center', padding: '40px', color: '#64748b' }}>
                          {lines.length === 0 ? 'Aucune ligne importée. Cliquez sur « Importer » pour charger un fichier Excel opérateur.' : 'Aucune ligne ne correspond aux filtres.'}
                        </td></tr>
                      );
                    }
                    return slice.map(l => (
                      <tr key={l.id}>
                        <td>
                          <span className={`type-badge ${l.category === 'fixe' ? 'fixe' : 'internet'}`}>
                            {l.category === 'fixe' ? 'Fixe' : 'Internet'}
                          </span>
                        </td>
                        <td style={{ fontWeight: 600 }}>
                          {l.site_name}
                          {l.to_migrate && <span title="À migrer (fin du cuivre)" style={{ marginLeft: 6, color: '#7c3aed', fontSize: '0.7rem', fontWeight: 700 }}>⚠ MIGRATION</span>}
                        </td>
                        <td style={{ color: '#64748b' }}>{l.city}</td>
                        <td>{l.offer}<div style={{ fontSize: '0.72rem', color: '#94a3b8' }}>{l.access_type}</div></td>
                        <td style={{ fontSize: '0.8rem' }}>{l.ndi ? <button className="ndi-link" onClick={() => openLineHistory(l.ndi)} title="Voir la facturation sur 12 mois">{l.ndi}</button> : <span style={{ color: '#cbd5e1' }}>—</span>}<div style={{ color: '#94a3b8', fontSize: '0.7rem', fontFamily: 'monospace' }}>{l.mid}</div></td>
                        <td>{l.billing_account}</td>
                        <td>
                          <span className={`status-tag ${/en service/i.test(l.status) ? 'imported' : 'pending'}`}>{l.status}</span>
                        </td>
                      </tr>
                    ));
                  })()}
                </tbody>
              </table>
              {(() => {
                const q = lineSearch.toLowerCase();
                const filtered = lines
                  .filter(l => lineCategory === 'all' || l.category === lineCategory)
                  .filter(l => lineAccessType === 'all' || l.access_type === lineAccessType)
                  .filter(l => !q || [l.site_name, l.mid, l.ndi, l.billing_account, l.address].some(v => (v || '').toLowerCase().includes(q)));
                const totalPages = Math.max(1, Math.ceil(filtered.length / LINE_PAGE_SIZE));
                const page = Math.min(linePage, totalPages - 1);
                if (totalPages <= 1) return null;
                return (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderTop: '1px solid #f1f5f9' }}>
                    <span style={{ fontSize: '0.8rem', color: '#64748b' }}>
                      {page * LINE_PAGE_SIZE + 1}–{Math.min(page * LINE_PAGE_SIZE + LINE_PAGE_SIZE, filtered.length)} sur {filtered.length}
                    </span>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button className="page-btn" disabled={page === 0} onClick={() => setLinePage(page - 1)}>Précédent</button>
                      <span style={{ fontSize: '0.82rem', color: '#475569', alignSelf: 'center', padding: '0 8px' }}>{page + 1} / {totalPages}</span>
                      <button className="page-btn" disabled={page >= totalPages - 1} onClick={() => setLinePage(page + 1)}>Suivant</button>
                    </div>
                  </div>
                );
              })()}
            </div>
          </div>
        )}

        {activeTab === 'billing' && (
          <div className="tab-content">
            <div className="section-header">
              <div>
                <h2>Coûts de facturation & parc mobile</h2>
                <span style={{ fontSize: '0.85rem', color: '#64748b' }}>
                  Import de l'export de facturation opérateur (ZIP SFR){billingStats?.period ? ` — période ${new Date(billingStats.period).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })}` : ''}
                </span>
              </div>
              <div className="action-group" style={{ display: 'flex', gap: 8 }}>
                <input type="file" id="import-telecom-billing" style={{ display: 'none' }} accept=".zip" onChange={handleImportBilling} />
                <button className="add-btn" disabled={importingBilling}
                  onClick={() => document.getElementById('import-telecom-billing')?.click()}>
                  <Upload size={18} /> {importingBilling ? 'Import en cours…' : 'Importer facturation (ZIP)'}
                </button>
                <input type="file" id="import-telecom-invoices" style={{ display: 'none' }} accept=".zip" onChange={handleImportInvoices} />
                <button className="add-btn" style={{ background: '#475569' }} disabled={importingInvoices}
                  onClick={() => document.getElementById('import-telecom-invoices')?.click()}>
                  <FileText size={18} /> {importingInvoices ? 'Import en cours…' : 'Importer factures PDF (ZIP)'}
                </button>
              </div>
            </div>

            {!billingStats || billingStats.totalLines === 0 ? (
              <div className="empty-state">
                <Phone size={48} />
                <p>Aucune facturation importée. Déposez l'export ZIP de votre opérateur (SFR).</p>
              </div>
            ) : (
              <>
                {/* KPI coûts */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 12, marginBottom: 24 }}>
                  {[
                    { label: 'Total / mois', value: `${billingStats.totalHT.toLocaleString('fr-FR')} €`, color: '#0078a4' },
                    { label: 'Estimation annuelle', value: `${billingStats.annualEstimate.toLocaleString('fr-FR')} €`, color: '#1e293b' },
                    { label: 'Coût mobile', value: `${billingStats.totalMobile.toLocaleString('fr-FR')} €`, color: '#3b82f6' },
                    { label: 'Coût fixe / data', value: `${billingStats.totalFixe.toLocaleString('fr-FR')} €`, color: '#059669' },
                    { label: 'Lignes mobiles', value: billingStats.mobileLines, color: '#7c3aed' },
                    { label: 'Lignes dormantes', value: billingStats.dormant, color: '#ef4444' },
                  ].map(k => (
                    <div key={k.label} className="admin-card" style={{ padding: '14px 16px', borderTop: `3px solid ${k.color}` }}>
                      <div style={{ fontSize: '1.4rem', fontWeight: 800, color: k.color }}>{k.value}</div>
                      <div style={{ fontSize: '0.76rem', color: '#64748b', marginTop: 4 }}>{k.label}</div>
                    </div>
                  ))}
                </div>

                {/* Tendance 13 mois */}
                {billingTrend.length > 0 && (
                  <div className="admin-card" style={{ padding: 18, marginBottom: 24 }}>
                    <h3 style={{ margin: '0 0 4px', fontSize: '1rem', color: '#1e293b' }}>Évolution des dépenses (mensuel)</h3>
                    <p style={{ margin: '0 0 12px', fontSize: '0.78rem', color: '#94a3b8' }}>Dépenses récurrentes — hors achats ponctuels d'équipement/terminaux</p>
                    <ResponsiveContainer width="100%" height={220}>
                      <BarChart data={billingTrend}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} />
                        <XAxis dataKey="month" fontSize={12} />
                        <YAxis fontSize={12} />
                        <Tooltip formatter={(v) => `${Number(v).toLocaleString('fr-FR')} € HT`} />
                        <Bar dataKey="total" fill="#0078a4" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}

                {/* Top lignes + forfaits + directions */}
                <div style={{ display: 'grid', gridTemplateColumns: '1.3fr 1fr', gap: 16, marginBottom: 24 }}>
                  <div className="admin-card" style={{ padding: 18 }}>
                    <h3 style={{ margin: '0 0 12px', fontSize: '1rem', color: '#1e293b' }}>Top 15 lignes les plus coûteuses</h3>
                    <table className="commitments-table">
                      <thead><tr><th>Numéro</th><th>Utilisateur / Site</th><th>Forfait</th><th style={{ textAlign: 'right' }}>€/mois</th></tr></thead>
                      <tbody>
                        {billingStats.topLines.map((l, i) => (
                          <tr key={i}>
                            <td><button className="ndi-link" onClick={() => openLineHistory(l.line_number)} title="Voir la facturation sur 12 mois">{l.line_number}</button></td>
                            <td>{l.user_name || l.site_name}</td>
                            <td style={{ fontSize: '0.8rem', color: '#64748b' }}>{l.plan || (l.is_mobile ? 'Mobile' : 'Fixe')}</td>
                            <td style={{ textAlign: 'right', fontWeight: 700 }}>{l.amt_total.toLocaleString('fr-FR')} €</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                    <div className="admin-card" style={{ padding: 18 }}>
                      <h3 style={{ margin: '0 0 12px', fontSize: '1rem', color: '#1e293b' }}>Parc mobile par forfait</h3>
                      {Object.entries(billingStats.byPlan).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([plan, count]) => (
                        <div key={plan} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', borderTop: '1px solid #f8fafc', fontSize: '0.83rem' }}>
                          <span style={{ color: '#475569' }}>{plan}</span>
                          <span style={{ fontWeight: 700, color: '#1e293b' }}>{count}</span>
                        </div>
                      ))}
                    </div>
                    <div className="admin-card" style={{ padding: 18 }}>
                      <h3 style={{ margin: '0 0 12px', fontSize: '1rem', color: '#1e293b' }}>Coût par direction / service</h3>
                      {billingStats.byList.slice(0, 8).map((d, i) => (
                        <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', borderTop: '1px solid #f8fafc', fontSize: '0.83rem' }}>
                          <span style={{ color: '#475569' }}>{d.list}</span>
                          <span style={{ fontWeight: 700, color: '#0078a4' }}>{d.amount.toLocaleString('fr-FR')} €</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Détail filtrable */}
                <div className="invoice-filters admin-card" style={{ marginBottom: 16 }}>
                  <div style={{ display: 'flex', gap: 16, alignItems: 'flex-end', flexWrap: 'wrap' }}>
                    <div className="filter-group">
                      <label>Type</label>
                      <select value={billingType} onChange={e => setBillingType(e.target.value as any)}>
                        <option value="all">Toutes</option>
                        <option value="mobile">Mobile</option>
                        <option value="fixe">Fixe / data</option>
                      </select>
                    </div>
                    <div className="filter-group">
                      <label>Techno</label>
                      <select value={billingTechno} onChange={e => setBillingTechno(e.target.value)}>
                        <option value="all">Toutes technos</option>
                        <option value="Mobile">Mobile</option>
                        {[...new Set(billingLines.filter(l => !l.is_mobile && l.access_type).map(l => l.access_type as string))].sort().map(t => (
                          <option key={t} value={t}>{t}</option>
                        ))}
                      </select>
                    </div>
                    <div className="filter-group" style={{ flex: 1, minWidth: 220 }}>
                      <label>Rechercher</label>
                      <div className="search-input-wrapper-mini">
                        <Search size={14} />
                        <input type="text" placeholder="Numéro, utilisateur, site, forfait, service…" value={billingSearch} onChange={e => setBillingSearch(e.target.value)} />
                      </div>
                    </div>
                  </div>
                </div>

                <div className="admin-card">
                  <table className="commitments-table">
                    <thead>
                      <tr><th>Type</th><th>Numéro</th><th>N° Facture</th><th>Utilisateur</th><th>Site / Service</th><th>Forfait</th><th style={{ textAlign: 'right' }}>€/mois HT</th></tr>
                    </thead>
                    <tbody>
                      {(() => {
                        const q = billingSearch.toLowerCase();
                        const filtered = billingLines
                          .filter(l => billingType === 'all' || (billingType === 'mobile' ? l.is_mobile : !l.is_mobile))
                          .filter(l => billingTechno === 'all' || (billingTechno === 'Mobile' ? l.is_mobile : l.access_type === billingTechno))
                          .filter(l => !q || [l.line_number, l.user_name, l.site_name, l.plan, l.list_label, l.invoice_number].some(v => (v || '').toLowerCase().includes(q)));
                        if (filtered.length === 0) return <tr><td colSpan={7} style={{ textAlign: 'center', padding: 30, color: '#94a3b8' }}>Aucune ligne ne correspond aux filtres.</td></tr>;
                        return filtered.slice(0, 300).map(l => (
                          <tr key={l.id}>
                            <td><span className={`type-badge ${l.is_mobile ? 'mobile' : 'fixe'}`}>{l.is_mobile ? 'Mobile' : (l.access_type || 'Fixe')}</span></td>
                            <td><button className="ndi-link" onClick={() => openLineHistory(l.line_number)} title="Voir la facturation sur 12 mois">{l.line_number}</button></td>
                            <td style={{ fontFamily: 'monospace', fontSize: '0.8rem', color: '#64748b' }}>{renderInvoiceNumber(l.invoice_number)}</td>
                            <td>{l.user_name || <span style={{ color: '#cbd5e1' }}>—</span>}</td>
                            <td style={{ color: '#64748b' }}>{l.site_name}{l.list_label ? <span style={{ fontSize: '0.72rem', color: '#94a3b8' }}> · {l.list_label}</span> : ''}</td>
                            <td style={{ fontSize: '0.82rem' }}>{l.plan}</td>
                            <td style={{ textAlign: 'right', fontWeight: 700 }}>{(l.amt_total || 0).toLocaleString('fr-FR')} €</td>
                          </tr>
                        ));
                      })()}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        )}

        {activeTab === 'optim' && (
          <div className="tab-content">
            <div className="section-header">
              <div>
                <h2>Optimisation & économies</h2>
                <span style={{ fontSize: '0.85rem', color: '#64748b' }}>
                  Rapprochement inventaire ↔ facturation et détection des dépenses évitables
                </span>
              </div>
            </div>

            {!billingStats || !reconciliation ? (
              <div className="empty-state">
                <AlertTriangle size={48} />
                <p>Importez d'abord l'inventaire des lignes et l'export de facturation pour activer l'analyse.</p>
              </div>
            ) : (
              <>
                {/* Bandeau économies potentielles */}
                {(() => {
                  const savings = (billingStats.dormantCost || 0) + (reconciliation.resilieesFactureesCost || 0);
                  return (
                    <div className="admin-card" style={{ padding: 22, marginBottom: 24, background: 'linear-gradient(135deg,#ecfdf5,#f0fdfa)', borderLeft: '5px solid #059669' }}>
                      <div style={{ fontSize: '0.85rem', color: '#047857', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Économies potentielles identifiées</div>
                      <div style={{ fontSize: '2.2rem', fontWeight: 800, color: '#059669', margin: '6px 0' }}>
                        {savings.toLocaleString('fr-FR')} € / mois
                        <span style={{ fontSize: '1rem', color: '#047857', marginLeft: 12 }}>≈ {Math.round(savings * 12).toLocaleString('fr-FR')} € / an</span>
                      </div>
                      <div style={{ fontSize: '0.85rem', color: '#475569' }}>
                        {billingStats.dormant} ligne(s) mobile(s) dormante(s) ({(billingStats.dormantCost || 0).toLocaleString('fr-FR')} €) + {reconciliation.resilieesFacturees.length} ligne(s) résiliée(s) encore facturée(s) ({(reconciliation.resilieesFactureesCost || 0).toLocaleString('fr-FR')} €)
                      </div>
                    </div>
                  );
                })()}

                {/* KPI rapprochement */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12, marginBottom: 24 }}>
                  {[
                    { label: 'Lignes inventaire', value: reconciliation.inventoryTotal, color: '#0078a4' },
                    { label: 'Rapprochées (coût connu)', value: reconciliation.matched, color: '#059669' },
                    { label: 'Mobiles dormantes', value: billingStats.dormant, color: '#ef4444' },
                    { label: 'Résiliées facturées', value: reconciliation.resilieesFacturees.length, color: '#f59e0b' },
                    { label: 'Facturées hors inventaire', value: reconciliation.factureesHorsInventaire.length, color: '#7c3aed' },
                  ].map(k => (
                    <div key={k.label} className="admin-card" style={{ padding: '14px 16px', borderTop: `3px solid ${k.color}` }}>
                      <div style={{ fontSize: '1.5rem', fontWeight: 800, color: k.color }}>{k.value}</div>
                      <div style={{ fontSize: '0.76rem', color: '#64748b', marginTop: 4 }}>{k.label}</div>
                    </div>
                  ))}
                </div>

                {/* Résiliées encore facturées */}
                {reconciliation.resilieesFacturees.length > 0 && (
                  <div className="admin-card" style={{ padding: 18, marginBottom: 20, borderLeft: '4px solid #f59e0b' }}>
                    <h3 style={{ margin: '0 0 4px', fontSize: '1rem', color: '#1e293b' }}>🔴 Lignes résiliées encore facturées</h3>
                    <p style={{ fontSize: '0.8rem', color: '#64748b', margin: '0 0 12px' }}>Marquées « résiliation » dans l'inventaire mais toujours présentes sur la facture. À faire cesser en priorité.</p>
                    <table className="commitments-table">
                      <thead><tr><th>NDI</th><th>Site</th><th>Type</th><th>Statut inventaire</th><th style={{ textAlign: 'right' }}>€/mois</th></tr></thead>
                      <tbody>
                        {reconciliation.resilieesFacturees.map((l, i) => (
                          <tr key={i}>
                            <td><button className="ndi-link" onClick={() => openLineHistory(l.ndi)} title="Voir la facturation sur 12 mois">{l.ndi}</button></td>
                            <td>{l.site_name}</td>
                            <td style={{ fontSize: '0.82rem', color: '#64748b' }}>{l.access_type}</td>
                            <td><span className="status-tag pending">{l.status}</span></td>
                            <td style={{ textAlign: 'right', fontWeight: 700, color: '#ef4444' }}>{l.cost.toLocaleString('fr-FR')} €</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* Mobiles dormantes */}
                {billingStats.dormantList && billingStats.dormantList.length > 0 && (() => {
                  const q = dormantSearch.trim().toLowerCase();
                  const filtered = q
                    ? billingStats.dormantList.filter(l => [l.line_number, l.user_name, l.list_label, l.plan].some(v => (v || '').toLowerCase().includes(q)))
                    : billingStats.dormantList;
                  const totalPages = Math.max(1, Math.ceil(filtered.length / DORMANT_PAGE_SIZE));
                  const page = Math.min(dormantPage, totalPages - 1);
                  const start = page * DORMANT_PAGE_SIZE;
                  const slice = filtered.slice(start, start + DORMANT_PAGE_SIZE);
                  return (
                  <div className="admin-card" style={{ padding: 18, marginBottom: 20, borderLeft: '4px solid #ef4444' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
                      <div>
                        <h3 style={{ margin: '0 0 4px', fontSize: '1rem', color: '#1e293b' }}>📱 Lignes mobiles dormantes ({billingStats.dormant})</h3>
                        <p style={{ fontSize: '0.8rem', color: '#64748b', margin: '0 0 12px' }}>Facturées mais <strong>aucune consommation</strong> (ni voix ni data). Candidates à résiliation ou mise en veille — triées par ancienneté de dormance.</p>
                      </div>
                      <div className="search-input-wrapper-mini" style={{ minWidth: 240 }}>
                        <Search size={14} />
                        <input type="text" placeholder="Numéro, utilisateur, service, forfait…" value={dormantSearch}
                          onChange={e => { setDormantSearch(e.target.value); setDormantPage(0); }} />
                      </div>
                    </div>
                    {filtered.length === 0 ? (
                      <div style={{ textAlign: 'center', padding: 24, color: '#94a3b8', fontSize: '0.85rem' }}>Aucune ligne dormante ne correspond à « {dormantSearch} ».</div>
                    ) : (<>
                    <table className="commitments-table">
                      <thead><tr><th>Numéro</th><th>Utilisateur</th><th>Service</th><th>Forfait</th><th style={{ textAlign: 'center' }}>Mois sans conso</th><th style={{ textAlign: 'right' }}>€/mois</th></tr></thead>
                      <tbody>
                        {slice.map((l, i) => (
                          <tr key={start + i}>
                            <td><button className="ndi-link" onClick={() => openLineHistory(l.line_number)} title="Voir la facturation sur 12 mois">{l.line_number}</button></td>
                            <td>{l.user_name || <span style={{ color: '#cbd5e1' }}>—</span>}</td>
                            <td style={{ fontSize: '0.8rem', color: '#64748b' }}>{l.list_label}</td>
                            <td style={{ fontSize: '0.8rem' }}>{l.plan}</td>
                            <td style={{ textAlign: 'center' }}>
                              <span style={{
                                display: 'inline-block', minWidth: 24, padding: '2px 8px', borderRadius: 9999, fontWeight: 700, fontSize: '0.78rem',
                                background: l.monthsWithoutConso >= 3 ? '#fef2f2' : l.monthsWithoutConso === 2 ? '#fff7ed' : '#f1f5f9',
                                color: l.monthsWithoutConso >= 3 ? '#dc2626' : l.monthsWithoutConso === 2 ? '#d97706' : '#64748b',
                              }} title={`Dormante depuis ${l.monthsWithoutConso} mois consécutif(s)`}>
                                {l.monthsWithoutConso}
                              </span>
                            </td>
                            <td style={{ textAlign: 'right', fontWeight: 700 }}>{l.amt_total.toLocaleString('fr-FR')} €</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {totalPages > 1 && (
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 12 }}>
                        <span style={{ fontSize: '0.8rem', color: '#64748b' }}>
                          {start + 1}–{Math.min(start + DORMANT_PAGE_SIZE, filtered.length)} sur {filtered.length}{q ? ` (filtré sur ${billingStats.dormantList.length})` : ''}
                        </span>
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button className="page-btn" disabled={page === 0} onClick={() => setDormantPage(page - 1)}>Précédent</button>
                          <span style={{ fontSize: '0.82rem', color: '#475569', alignSelf: 'center', padding: '0 8px' }}>{page + 1} / {totalPages}</span>
                          <button className="page-btn" disabled={page >= totalPages - 1} onClick={() => setDormantPage(page + 1)}>Suivant</button>
                        </div>
                      </div>
                    )}
                    </>)}
                  </div>
                  );
                })()}

                {/* Hors inventaire + non facturées */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                  <div className="admin-card" style={{ padding: 18, borderLeft: '4px solid #7c3aed' }}>
                    <h3 style={{ margin: '0 0 4px', fontSize: '1rem', color: '#1e293b' }}>Lignes fixes facturées hors inventaire</h3>
                    <p style={{ fontSize: '0.8rem', color: '#64748b', margin: '0 0 12px' }}>Présentes sur la facture mais absentes de l'inventaire — à recenser ({reconciliation.factureesHorsInventaireCost.toLocaleString('fr-FR')} €/mois).</p>
                    {reconciliation.factureesHorsInventaire.length === 0 ? <div style={{ color: '#94a3b8', fontSize: '0.85rem' }}>Aucune — inventaire complet ✔</div> :
                      reconciliation.factureesHorsInventaire.map((l, i) => (
                        <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderTop: i ? '1px solid #f1f5f9' : 'none', fontSize: '0.85rem' }}>
                          <span><button className="ndi-link" onClick={() => openLineHistory(l.line_number)} title="Voir la facturation sur 12 mois">{l.line_number}</button> <span style={{ color: '#94a3b8' }}>{l.cf_label}</span></span>
                          <span style={{ fontWeight: 700 }}>{l.amt_total.toLocaleString('fr-FR')} €</span>
                        </div>
                      ))}
                  </div>
                  <div className="admin-card" style={{ padding: 18, borderLeft: '4px solid #0078a4' }}>
                    <h3 style={{ margin: '0 0 4px', fontSize: '1rem', color: '#1e293b' }}>Lignes en service non facturées</h3>
                    <p style={{ fontSize: '0.8rem', color: '#64748b', margin: '0 0 12px' }}>En service dans l'inventaire mais sans ligne de facturation trouvée — à vérifier (facturé ailleurs ?).</p>
                    {reconciliation.enServiceNonFacturees.length === 0 ? <div style={{ color: '#94a3b8', fontSize: '0.85rem' }}>Aucune ✔</div> :
                      reconciliation.enServiceNonFacturees.slice(0, 20).map((l, i) => (
                        <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderTop: i ? '1px solid #f1f5f9' : 'none', fontSize: '0.85rem' }}>
                          <span><button className="ndi-link" onClick={() => openLineHistory(l.ndi)} title="Voir la facturation sur 12 mois">{l.ndi}</button> {l.site_name}</span>
                          <span style={{ color: '#94a3b8', fontSize: '0.78rem' }}>{l.access_type}</span>
                        </div>
                      ))}
                  </div>
                </div>
              </>
            )}
          </div>
        )}
      </main>

      {/* Fiche historique de facturation d'une ligne (12 mois glissants) */}
      {lineHistoryNumber && (
        <div className="line-history-overlay" onClick={e => { if (e.target === e.currentTarget) { setLineHistoryNumber(null); setLineHistory(null); } }}>
          <div className="line-history-modal">
            <div className="line-history-header">
              <div>
                <h2 style={{ margin: 0, fontSize: '1.1rem', color: '#1e293b', display: 'flex', alignItems: 'center', gap: 10 }}>
                  <Phone size={20} color="#0078a4" /> {lineHistoryNumber}
                </h2>
                {lineHistory && !lineHistory.error && (
                  <span style={{ fontSize: '0.82rem', color: '#64748b' }}>
                    {lineHistory.is_mobile ? 'Mobile' : 'Fixe / data'}
                    {lineHistory.user_name ? ` · ${lineHistory.user_name}` : ''}
                    {lineHistory.site_name ? ` · ${lineHistory.site_name}` : ''}
                    {lineHistory.plan ? ` · ${lineHistory.plan}` : ''}
                  </span>
                )}
              </div>
              <button className="close-btn" onClick={() => { setLineHistoryNumber(null); setLineHistory(null); }}><X size={22} /></button>
            </div>
            <div className="line-history-body">
              {loadingHistory ? (
                <div style={{ textAlign: 'center', padding: 40, color: '#94a3b8' }}>Chargement…</div>
              ) : !lineHistory || lineHistory.error ? (
                <div style={{ textAlign: 'center', padding: 40, color: '#ef4444' }}>Erreur lors du chargement.</div>
              ) : lineHistory.history.length === 0 ? (
                <div style={{ textAlign: 'center', padding: 40, color: '#64748b' }}>
                  Aucune facturation trouvée pour ce numéro.<br />
                  <span style={{ fontSize: '0.8rem' }}>Importez les exports mensuels pour construire l'historique sur 12 mois.</span>
                </div>
              ) : (() => {
                const SPIKE = 0.20; // seuil d'alerte de hausse mensuelle (+20%)
                const hist = lineHistory.history; // ordre chronologique (ancien → récent)
                const pctByPeriod: Record<string, number> = {};
                for (let i = 1; i < hist.length; i++) {
                  const prev = hist[i - 1].amt_total;
                  if (prev > 0) {
                    const pct = (hist[i].amt_total - prev) / prev;
                    if (pct > SPIKE) pctByPeriod[hist[i].period] = pct;
                  }
                }
                const spikes = hist.filter((h: any) => pctByPeriod[h.period] != null);
                return (
                <>
                  <div style={{ display: 'flex', gap: 12, marginBottom: 18 }}>
                    {[
                      { label: 'Total 12 mois', value: `${lineHistory.total12m.toLocaleString('fr-FR')} €`, color: '#0078a4' },
                      { label: 'Moyenne / mois', value: `${lineHistory.avgMonthly.toLocaleString('fr-FR')} €`, color: '#1e293b' },
                      { label: 'Mois facturés', value: lineHistory.months, color: '#059669' },
                    ].map(k => (
                      <div key={k.label} style={{ flex: 1, background: '#f8fafc', borderRadius: 8, padding: '10px 12px', borderTop: `3px solid ${k.color}` }}>
                        <div style={{ fontSize: '1.3rem', fontWeight: 800, color: k.color }}>{k.value}</div>
                        <div style={{ fontSize: '0.74rem', color: '#64748b' }}>{k.label}</div>
                      </div>
                    ))}
                  </div>
                  {lineHistory.resiliation && (
                    <div style={{ background: '#fff7ed', border: '1px solid #ffedd5', color: '#d97706', padding: '8px 12px', borderRadius: 8, fontSize: '0.82rem', marginBottom: 16 }}>
                      ⚠ Résiliation renseignée : {lineHistory.resiliation}
                    </div>
                  )}
                  {spikes.length > 0 && (
                    <div style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', padding: '8px 12px', borderRadius: 8, fontSize: '0.82rem', marginBottom: 16 }}>
                      ⚠ Hausse {'>'} 20 % détectée : {spikes.map((h: any) => `${new Date(h.period).toLocaleDateString('fr-FR', { month: 'short', year: '2-digit' })} (+${Math.round(pctByPeriod[h.period] * 100)} %)`).join(', ')}
                    </div>
                  )}
                  <ResponsiveContainer width="100%" height={200}>
                    <BarChart data={lineHistory.history}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="period" fontSize={11} tickFormatter={(v) => new Date(v).toLocaleDateString('fr-FR', { month: 'short', year: '2-digit' })} />
                      <YAxis fontSize={11} />
                      <Tooltip
                        labelFormatter={(v) => new Date(v).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })}
                        formatter={(val, name) => [`${Number(val).toLocaleString('fr-FR')} €`, name === 'amt_total' ? 'Total' : name]}
                      />
                      <Bar dataKey="amt_total" radius={[4, 4, 0, 0]}>
                        {lineHistory.history.map((h: any, i: number) => (
                          <Cell key={i} fill={pctByPeriod[h.period] != null ? '#ef4444' : '#0078a4'} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                  <table className="commitments-table" style={{ marginTop: 16 }}>
                    <thead>
                      <tr><th>Mois</th><th>N° Facture</th><th>Forfait</th><th style={{ textAlign: 'right' }}>Abonnement</th><th style={{ textAlign: 'right' }}>Conso</th><th style={{ textAlign: 'right' }}>Remises</th><th style={{ textAlign: 'right' }}>Total HT</th></tr>
                    </thead>
                    <tbody>
                      {lineHistory.history.slice().reverse().map((h: any, i: number) => (
                        <tr key={i}>
                          <td style={{ fontWeight: 600 }}>{new Date(h.period).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })}</td>
                          <td style={{ fontFamily: 'monospace', fontSize: '0.78rem', color: '#64748b' }}>{renderInvoiceNumber(h.invoice_number)}</td>
                          <td style={{ fontSize: '0.8rem', color: '#64748b' }}>{h.plan || h.cf_label}</td>
                          <td style={{ textAlign: 'right' }}>{h.amt_subscriptions.toLocaleString('fr-FR')} €</td>
                          <td style={{ textAlign: 'right' }}>{h.amt_conso.toLocaleString('fr-FR')} €</td>
                          <td style={{ textAlign: 'right', color: '#059669' }}>{h.amt_discounts.toLocaleString('fr-FR')} €</td>
                          <td style={{ textAlign: 'right', fontWeight: 700 }}>
                            {h.amt_total.toLocaleString('fr-FR')} €
                            {pctByPeriod[h.period] != null && (
                              <span title={`+${Math.round(pctByPeriod[h.period] * 100)} % vs mois précédent`} style={{ marginLeft: 6, color: '#ef4444', fontWeight: 700, fontSize: '0.78rem' }}>▲ +{Math.round(pctByPeriod[h.period] * 100)}%</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </>
                );
              })()}
            </div>
          </div>
        </div>
      )}

      {/* Ajout d'une facture depuis le budget (remplace l'ancien upload PDF) */}
      {showAddInvoiceModal && (
        <div className="validation-modal-overlay" onClick={() => setShowAddInvoiceModal(false)}>
          <div style={{ background: '#fff', borderRadius: 12, width: '90%', maxWidth: 780, maxHeight: '85vh', display: 'flex', flexDirection: 'column' }} onClick={e => e.stopPropagation()}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <h2 style={{ margin: 0, fontSize: 16 }}>Ajouter une facture{addInvoiceOperatorId ? ` — ${operators.find(o => o.id === addInvoiceOperatorId)?.name || ''}` : ''}</h2>
                <p style={{ margin: '2px 0 0', fontSize: 12, color: '#64748b' }}>Les factures en attente sur le tiers de l'opérateur sont listées ci-dessous.</p>
              </div>
              <button className="close-btn" onClick={() => setShowAddInvoiceModal(false)}><X size={22} /></button>
            </div>
            <div style={{ padding: '12px 20px', display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', borderBottom: '1px solid #f1f5f9' }}>
              <select value={addInvoiceOperatorId || ''} style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid #e2e8f0' }}
                onChange={e => {
                  const opId = e.target.value ? parseInt(e.target.value) : null;
                  setAddInvoiceOperatorId(opId);
                  setAddInvoiceAccountId(null);
                  setAvailableInvoices([]);
                  if (opId) loadAvailableInvoices(opId);
                }}>
                <option value="">-- Opérateur --</option>
                {operators.map(op => <option key={op.id} value={op.id}>{op.name}</option>)}
              </select>
              <select value={addInvoiceAccountId || ''} disabled={!addInvoiceOperatorId} style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid #e2e8f0' }}
                onChange={e => {
                  const accId = e.target.value ? parseInt(e.target.value) : null;
                  setAddInvoiceAccountId(accId);
                }}>
                <option value="">-- Compte (facultatif) --</option>
                {addInvoiceOperatorId && billingAccounts[addInvoiceOperatorId]?.map(acc => (
                  <option key={acc.id} value={acc.id}>{acc.account_number} ({acc.designation})</option>
                ))}
              </select>
              <div className="search-input-wrapper-mini" style={{ flex: 1, minWidth: 180 }}>
                <Search size={14} />
                <input type="text" placeholder="Rechercher un numéro, un libellé..." value={availableSearch} onChange={e => setAvailableSearch(e.target.value)} />
              </div>
            </div>
            <div style={{ overflowY: 'auto', padding: '0 20px 16px' }}>
              {loadingAvailable ? (
                <div style={{ textAlign: 'center', padding: 30, color: '#64748b' }}>Recherche des factures dans le budget...</div>
              ) : (
                <table className="commitments-table">
                  <thead>
                    <tr>
                      <th>N° Facture</th>
                      <th>Libellé</th>
                      <th>Date</th>
                      <th>Montant</th>
                      <th>État</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {availableInvoices
                      .filter(c => !availableSearch ||
                        c.invoice_number.toLowerCase().includes(availableSearch.toLowerCase()) ||
                        (c.libelle || '').toLowerCase().includes(availableSearch.toLowerCase()))
                      .slice(0, 100)
                      .map(c => (
                        <tr key={c.invoice_number}>
                          <td style={{ fontWeight: 700 }} title={c.libelle}>{c.invoice_number}</td>
                          <td style={{ maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={c.libelle}>{c.libelle || '—'}</td>
                          <td>{c.invoice_date ? new Date(c.invoice_date).toLocaleDateString('fr-FR') : '—'}</td>
                          <td>{c.amount_ttc != null ? Number(c.amount_ttc).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' }) : '—'}</td>
                          <td>{c.etat || '—'}</td>
                          <td>
                            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                              {c.sedit_ref && (
                                <a href={`${urlSedit}/FicheFacture.html?factureId=${encodeURIComponent(c.sedit_ref)}`} target="_blank" rel="noopener noreferrer" className="edit-icon-btn" title="Ouvrir dans Sedit">
                                  <ExternalLink size={18} />
                                </a>
                              )}
                              <button className="add-btn" style={{ padding: '4px 10px', fontSize: 12 }}
                                disabled={addingInvoiceNumber === c.invoice_number}
                                onClick={() => handleAddInvoiceFromBudget(c)}>
                                {addingInvoiceNumber === c.invoice_number ? '...' : 'Ajouter'}
                              </button>
                              <button className="reject-btn" title="Rejeter ou écarter cette facture (ne sera plus proposée)"
                                onClick={() => { setRejectCandidate(c); setRejectCategory('rejetee'); setRejectReason(''); }}>
                                Rejeter
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    {availableInvoices.length === 0 && (
                      <tr><td colSpan={6} style={{ textAlign: 'center', padding: 30, color: '#94a3b8' }}>
                        {addInvoiceOperatorId ? 'Aucune facture disponible pour ce fournisseur dans le budget' : 'Sélectionnez un opérateur pour voir ses factures en attente'}
                      </td></tr>
                    )}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Rejet / écartement d'une facture du budget */}
      {rejectCandidate && (
        <div className="validation-modal-overlay" onClick={() => setRejectCandidate(null)}>
          <div style={{ background: '#fff', borderRadius: 12, width: '90%', maxWidth: 480, padding: 20 }} onClick={e => e.stopPropagation()}>
            <h2 style={{ margin: '0 0 4px', fontSize: 16 }}>Rejeter la facture {rejectCandidate.invoice_number}</h2>
            <p style={{ margin: '0 0 14px', fontSize: 12.5, color: '#64748b' }}>
              {rejectCandidate.libelle || `Montant : ${rejectCandidate.amount_ttc != null ? Number(rejectCandidate.amount_ttc).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' }) : '—'}`}
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 14 }}>
              <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 13, cursor: 'pointer' }}>
                <input type="radio" checked={rejectCategory === 'rejetee'} onChange={() => setRejectCategory('rejetee')} style={{ marginTop: 3 }} />
                <span>
                  <strong>Rejeter la facture</strong> — décrire le motif du rejet (facture en double, annulée, ...).
                  Elle ne sera plus proposée.
                </span>
              </label>
              <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 13, cursor: 'pointer' }}>
                <input type="radio" checked={rejectCategory === 'hors_telecom'} onChange={() => setRejectCategory('hors_telecom')} style={{ marginTop: 3 }} />
                <span>
                  <strong>Ne concerne pas les télécoms</strong> — ce tiers facture aussi d'autres services ;
                  cette facture ne doit plus jamais être reproposée.
                </span>
              </label>
            </div>
            <textarea
              value={rejectReason}
              rows={3}
              autoFocus={rejectCategory === 'rejetee'}
              placeholder={rejectCategory === 'rejetee' ? "Motif du rejet (obligatoire)..." : "Commentaire éventuel..."}
              style={{ width: '100%', boxSizing: 'border-box', padding: 8, borderRadius: 6, border: '1px solid #e2e8f0', fontFamily: 'inherit', fontSize: 13 }}
              onChange={e => setRejectReason(e.target.value)}
            />
            <div style={{ marginTop: 12, display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button className="cancel-btn" onClick={() => setRejectCandidate(null)}>Annuler</button>
              <button className="save-btn reject-confirm" disabled={rejecting} onClick={handleRejectInvoice}>
                {rejecting ? 'Rejet en cours...' : rejectCategory === 'hors_telecom' ? 'Écarter définitivement' : 'Confirmer le rejet'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Factures rejetées / écartées d'un compte */}
      {rejectedDetail && (
        <div className="validation-modal-overlay" onClick={() => setRejectedDetail(null)}>
          <div style={{ background: '#fff', borderRadius: 12, width: '90%', maxWidth: 640, maxHeight: '80vh', display: 'flex', flexDirection: 'column' }} onClick={e => e.stopPropagation()}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <h2 style={{ margin: 0, fontSize: 16 }}>Factures rejetées — {rejectedDetail.title}</h2>
              <button className="close-btn" onClick={() => setRejectedDetail(null)}><X size={22} /></button>
            </div>
            <div style={{ overflowY: 'auto', padding: '12px 20px 20px' }}>
              {loadingRejected ? (
                <div style={{ textAlign: 'center', padding: 20, color: '#64748b' }}>Chargement...</div>
              ) : rejectedInvoices.length === 0 ? (
                <div style={{ textAlign: 'center', padding: 20, color: '#94a3b8' }}>Aucune facture rejetée pour ce compte</div>
              ) : rejectedInvoices.map(r => (
                <div key={r.id} style={{ padding: '12px 0', borderBottom: '1px solid #f1f5f9' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <strong>{r.invoice_number}</strong>
                      <span className={`reject-category-tag ${r.category}`}>
                        {r.category === 'hors_telecom' ? 'Hors télécom' : 'Rejetée'}
                      </span>
                    </div>
                    {r.sedit_ref && (
                      <a href={`${urlSedit}/FicheFacture.html?factureId=${encodeURIComponent(r.sedit_ref)}`} target="_blank" rel="noopener noreferrer" className="edit-icon-btn" title="Ouvrir dans Sedit">
                        <ExternalLink size={16} />
                      </a>
                    )}
                  </div>
                  <div style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>
                    {r.invoice_date ? new Date(r.invoice_date).toLocaleDateString('fr-FR') : '—'}
                    {r.amount_ttc != null ? ` · ${Number(r.amount_ttc).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })}` : ''}
                    {r.etat ? ` · ${r.etat}` : ''}
                    {r.fournisseur ? ` · ${r.fournisseur}` : ''}
                  </div>
                  {r.reason && (
                    <div style={{ fontSize: 12.5, marginTop: 6, background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', padding: '6px 10px', borderRadius: 6 }}>
                      {r.reason}
                    </div>
                  )}
                  <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 4 }}>
                    {r.rejected_by ? `Rejetée par ${r.rejected_by}` : 'Rejetée'}
                    {r.rejected_at ? ` · ${new Date(r.rejected_at).toLocaleString('fr-FR')}` : ''}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Détail des factures d'une case de la synthèse mensuelle */}
      {viewingCell && (
        <div className="validation-modal-overlay" onClick={() => setViewingCell(null)}>
          <div style={{ background: '#fff', borderRadius: 12, width: '90%', maxWidth: 560, maxHeight: '80vh', display: 'flex', flexDirection: 'column' }} onClick={e => e.stopPropagation()}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <h2 style={{ margin: 0, fontSize: 16 }}>{viewingCell.label}</h2>
              <button className="close-btn" onClick={() => setViewingCell(null)}><X size={22} /></button>
            </div>
            <div style={{ overflowY: 'auto', padding: '12px 20px 20px' }}>
              {viewingCell.invoices.length === 0 ? (
                <div style={{ textAlign: 'center', padding: 20, color: '#94a3b8' }}>Aucune facture</div>
              ) : viewingCell.invoices.map(inv => (
                <div key={inv.id} style={{ padding: '10px 0', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
                  <div>
                    <div style={{ fontWeight: 700 }}>{inv.invoice_number}</div>
                    {inv.description && <div style={{ fontSize: 12, color: '#64748b' }}>{inv.description}</div>}
                    {inv.general_status && <div style={{ fontSize: 11, color: '#94a3b8' }}>Statut : {inv.general_status}</div>}
                  </div>
                  <div style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
                    <span style={{ fontWeight: 700 }}>{inv.amount_ttc.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })}</span>
                    {inv.sedit_ref && (
                      <a href={`${urlSedit}/FicheFacture.html?factureId=${encodeURIComponent(inv.sedit_ref)}`} target="_blank" rel="noopener noreferrer"
                        style={{ fontSize: 11, color: '#3b82f6', display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                        <ExternalLink size={11} /> Sedit
                      </a>
                    )}
                  </div>
                </div>
              ))}
              {viewingCell.invoices.length > 1 && (
                <div style={{ marginTop: 10, textAlign: 'right', fontWeight: 700 }}>
                  Total : {viewingCell.invoices.reduce((s, i) => s + i.amount_ttc, 0).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Commentaire sur un mois (justifier une absence de facture, par ex.) */}
      {commentEditor && (
        <div className="validation-modal-overlay" onClick={() => setCommentEditor(null)}>
          <div style={{ background: '#fff', borderRadius: 12, width: '90%', maxWidth: 420, padding: 20 }} onClick={e => e.stopPropagation()}>
            <h2 style={{ margin: '0 0 12px', fontSize: 16 }}>Commentaire — {formatMonthKey(commentEditor.month)}</h2>
            <textarea value={commentEditor.value} rows={4} autoFocus
              placeholder="Ex : facture pas encore reçue, compte résilié, ..."
              style={{ width: '100%', boxSizing: 'border-box', padding: 8, borderRadius: 6, border: '1px solid #e2e8f0', fontFamily: 'inherit', fontSize: 13 }}
              onChange={e => setCommentEditor(c => c ? { ...c, value: e.target.value } : c)} />
            <div style={{ marginTop: 12, display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button className="cancel-btn" onClick={() => setCommentEditor(null)}>Annuler</button>
              <button className="save-btn" disabled={savingComment} onClick={handleSaveComment}>
                <Save size={16} /> {savingComment ? 'Enregistrement...' : 'Enregistrer'}
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        .telecom-container { min-height: 100vh; background: #f8fafc; }
        .telecom-main { max-width: 1200px; margin: 0 auto; padding: 40px 20px; }

        .page-btn { background: white; border: 1px solid #e2e8f0; padding: 6px 14px; border-radius: 8px; font-size: 0.82rem; font-weight: 600; color: #475569; cursor: pointer; }
        .page-btn:hover:not(:disabled) { background: #f1f5f9; }
        .page-btn:disabled { opacity: 0.5; cursor: not-allowed; }
        .summary-table td.summary-cell { padding: 4px 8px; }
        .summary-cell-btn { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 3px 8px; font-size: 12.5px; font-weight: 700; color: #18181b; cursor: pointer; display: inline-flex; align-items: center; gap: 4px; }
        .summary-cell-btn:hover { background: #eef2ff; border-color: #c7d2fe; }
        .summary-comment-btn { background: none; border: 1px dashed #94a3b8; border-radius: 4px; color: #64748b; width: 20px; height: 20px; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; padding: 0; }
        .summary-comment-btn.missing { border-color: #dc2626; color: #dc2626; font-size: 13px; font-weight: 700; }
        .summary-comment-btn:hover { background: #f1f5f9; }
        .ndi-link { background: none; border: none; padding: 0; font-family: monospace; font-weight: 700; color: #0078a4; cursor: pointer; text-decoration: underline; text-underline-offset: 2px; font-size: inherit; }
        .ndi-link:hover { color: #005d80; }
        .line-history-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.6); z-index: 1100; display: flex; align-items: center; justify-content: center; padding: 30px; }
        .line-history-modal { background: white; width: 760px; max-width: 95vw; max-height: 88vh; border-radius: 16px; display: flex; flex-direction: column; overflow: hidden; box-shadow: 0 24px 48px rgba(0,0,0,.25); }
        .line-history-header { display: flex; justify-content: space-between; align-items: flex-start; padding: 18px 24px; border-bottom: 1px solid #e2e8f0; }
        .line-history-header .close-btn { background: none; border: none; cursor: pointer; color: #64748b; padding: 4px; border-radius: 6px; }
        .line-history-body { padding: 20px 24px; overflow-y: auto; }
        .telecom-page-header { display: flex; align-items: flex-start; gap: 20px; margin-bottom: 40px; }
        .back-button { background: white; border: 1px solid #e2e8f0; padding: 10px; border-radius: 12px; cursor: pointer; color: #64748b; }
        .title-group h1 { margin: 0; font-size: 1.875rem; color: #1e293b; }
        .title-group p { margin: 5px 0 0; color: #64748b; }
        
        .tab-switcher { margin-left: auto; background: #f1f5f9; padding: 4px; border-radius: 12px; display: flex; gap: 4px; }
        .tab-switcher button { border: none; padding: 8px 16px; border-radius: 8px; font-weight: 600; cursor: pointer; display: flex; align-items: center; gap: 8px; color: #64748b; background: none; transition: all 0.2s; }
        .tab-switcher button.active { background: white; color: #0078a4; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }

        .section-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px; }
        .section-header h2 { font-size: 1.25rem; color: #1e293b; }
        
        .add-btn, .import-btn { background: #0078a4; color: white; border: none; padding: 10px 20px; border-radius: 10px; font-weight: 600; cursor: pointer; display: flex; align-items: center; gap: 8px; }
        
        .operator-search-card { background: white; border: 1px solid #e2e8f0; border-radius: 12px; padding: 15px; margin-bottom: 24px; position: relative; }
        .search-input-wrapper { display: flex; align-items: center; gap: 10px; }
        .search-input-wrapper input { flex-grow: 1; border: none; padding: 10px; font-size: 1rem; outline: none; }
        .close-search { background: none; border: none; color: #ef4444; font-weight: 600; cursor: pointer; }
        .tier-results { position: absolute; top: 100%; left: 0; right: 0; background: white; border: 1px solid #e2e8f0; border-radius: 0 0 12px 12px; box-shadow: 0 10px 15px -3px rgba(0,0,0,0.1); z-index: 10; max-height: 250px; overflow-y: auto; }
        .tier-result-item { padding: 12px 20px; display: flex; justify-content: space-between; cursor: pointer; border-bottom: 1px solid #f1f5f9; }
        .tier-result-item:hover { background: #f8fafc; }
        .tier-name { font-weight: 600; color: #1e293b; }
        .tier-code { color: #64748b; font-size: 0.875rem; }
        .tier-create-box { border-top: 1px solid #e2e8f0; padding: 16px 4px 4px; }
        .tier-selected-info { font-size: 0.85rem; color: #64748b; margin-bottom: 14px; display: flex; align-items: center; gap: 8px; }
        .tier-selected-info strong { color: #1e293b; font-size: 0.95rem; }
        .tier-selected-info .tier-code { background: #f1f5f9; padding: 2px 8px; border-radius: 6px; font-size: 0.75rem; }

        .operators-list { display: flex; flex-direction: column; gap: 16px; }
        .operator-card { background: white; border: 1px solid #e2e8f0; border-radius: 16px; overflow: hidden; }
        .operator-card-header { padding: 20px; display: flex; justify-content: space-between; align-items: center; cursor: pointer; }
        .operator-card-header:hover { background: #fdfdfd; }
        .op-info { display: flex; align-items: center; gap: 15px; }
        .op-icon { width: 48px; height: 48px; background: #eff6ff; color: #3b82f6; border-radius: 12px; display: flex; align-items: center; justify-content: center; }
        .op-info h3 { margin: 0; font-size: 1.1rem; color: #1e293b; }
        .account-count { font-size: 0.875rem; color: #64748b; }
        .op-actions { display: flex; align-items: center; gap: 15px; color: #64748b; }
        .delete-op-btn { background: none; border: none; color: #ef4444; padding: 8px; border-radius: 8px; cursor: pointer; opacity: 0; transition: opacity 0.2s; }
        .operator-card:hover .delete-op-btn { opacity: 1; }
        .delete-op-btn:hover { background: #fef2f2; }
        .edit-op-btn { background: none; border: none; color: #94a3b8; padding: 8px; border-radius: 8px; cursor: pointer; opacity: 0; transition: opacity 0.2s; }
        .operator-card:hover .edit-op-btn { opacity: 1; }
        .edit-op-btn:hover { color: #0078a4; }
        .operator-edit-form { padding: 18px 20px; border-bottom: 1px solid #f1f5f9; background: #f8fafc; }
        .reject-btn { background: white; border: 1px solid #ef4444; color: #ef4444; padding: 4px 10px; border-radius: 6px; font-size: 12px; font-weight: 600; cursor: pointer; transition: all 0.2s; }
        .reject-btn:hover { background: #fef2f2; }
        .reject-confirm { background: #ef4444; }

        .operator-card-body { padding: 0 20px 20px; border-top: 1px solid #f1f5f9; }
        .accounts-header { display: flex; justify-content: space-between; align-items: center; margin-top: 20px; margin-bottom: 15px; }
        .accounts-header h4 { margin: 0; font-size: 0.95rem; color: #475569; }
        .add-account-btn { background: #f1f5f9; color: #475569; border: none; padding: 4px 12px; border-radius: 6px; font-size: 0.8rem; font-weight: 600; cursor: pointer; display: flex; align-items: center; gap: 4px; }

        .add-account-form { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 20px; margin-bottom: 20px; }
        .form-header-small { font-size: 0.85rem; font-weight: 700; color: #0078a4; margin-bottom: 15px; text-transform: uppercase; }
        .form-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 15px; margin-bottom: 20px; }
        .form-group label { display: block; font-size: 0.8rem; font-weight: 600; color: #64748b; margin-bottom: 5px; }
        .form-group input, .form-group select { width: 100%; padding: 8px 12px; border: 1px solid #e2e8f0; border-radius: 8px; font-size: 0.9rem; }
        .form-actions { display: flex; justify-content: flex-end; gap: 10px; }
        .cancel-btn { background: white; border: 1px solid #e2e8f0; padding: 8px 16px; border-radius: 8px; font-size: 0.9rem; font-weight: 600; cursor: pointer; }
        .save-btn { background: #0078a4; color: white; border: none; padding: 8px 16px; border-radius: 8px; font-size: 0.9rem; font-weight: 600; cursor: pointer; display: flex; align-items: center; gap: 8px; }

        .accounts-table { width: 100%; border-collapse: collapse; }
        .accounts-table th { text-align: left; padding: 12px; font-size: 0.8rem; color: #64748b; text-transform: uppercase; letter-spacing: 0.025em; border-bottom: 1px solid #f1f5f9; }
        .accounts-table td { padding: 12px; font-size: 0.9rem; color: #1e293b; border-bottom: 1px solid #f1f5f9; }
        .type-badge { padding: 2px 8px; border-radius: 9999px; font-size: 0.75rem; font-weight: 600; }
        .type-badge.fixe { background: #ecfdf5; color: #059669; }
        .type-badge.mobile { background: #eff6ff; color: #2563eb; }
        .type-badge.interco { background: #faf5ff; color: #7c3aed; }
        .type-badge.internet { background: #fff7ed; color: #d97706; }
        .num-badge { font-weight: 700; color: #0078a4; }
        .amount-col { font-weight: 700; color: #1e293b; text-align: right; }
        .action-btns { display: flex; gap: 8px; }
        .edit-icon-btn { color: #0078a4; background: none; border: none; cursor: pointer; transition: color 0.2s; }
        .delete-icon-btn { color: #94a3b8; background: none; border: none; cursor: pointer; transition: color 0.2s; }
        .delete-icon-btn:hover { color: #ef4444; }

        .commitment-group { margin-bottom: 24px; border: 1px solid #f1f5f9; border-radius: 12px; overflow: hidden; }
        .commitment-group-header { background: #f8fafc; padding: 10px 15px; border-bottom: 1px solid #f1f5f9; }
        .comm-info-tag { display: flex; align-items: center; gap: 10px; font-size: 0.85rem; }
        .comm-label { color: #64748b; font-weight: 600; }
        .comm-value { color: #0078a4; font-weight: 800; }
        .comm-amount-tag { color: #64748b; font-weight: 500; }
        .comm-balance-tag { margin-left: auto; padding: 2px 10px; border-radius: 6px; font-weight: 700; }
        .comm-balance-tag.positive { background: #ecfdf5; color: #059669; }
        .comm-balance-tag.negative { background: #fef2f2; color: #ef4444; }

        .invoice-count-btn { 
          display: inline-flex; 
          align-items: center; 
          gap: 6px; 
          background: #eff6ff; 
          color: #2563eb; 
          border: 1px solid #dbeafe; 
          padding: 4px 10px; 
          border-radius: 8px; 
          font-weight: 700; 
          cursor: pointer; 
          transition: all 0.2s;
          font-size: 0.85rem;
        }
        .invoice-count-btn:hover { 
          background: #2563eb; 
          color: white; 
          transform: translateY(-1px);
          box-shadow: 0 4px 6px -1px rgba(37, 99, 235, 0.2);
        }
        .invoice-count-btn.rejected {
          background: #fef2f2;
          color: #dc2626;
          border-color: #fecaca;
          margin-left: 6px;
        }
        .invoice-count-btn.rejected:hover {
          background: #dc2626;
          color: white;
          box-shadow: 0 4px 6px -1px rgba(220, 38, 38, 0.2);
        }
        .reject-category-tag { font-size: 11px; font-weight: 700; padding: 2px 8px; border-radius: 999px; text-transform: uppercase; letter-spacing: 0.03em; }
        .reject-category-tag.rejetee { background: #fef2f2; color: #dc2626; border: 1px solid #fecaca; }
        .reject-category-tag.hors_telecom { background: #f1f5f9; color: #64748b; border: 1px solid #e2e8f0; }

        .invoice-count-badge.clickable { cursor: pointer; transition: all 0.2s; }
        .invoice-count-badge.clickable:hover { background: #0078a4; color: white; transform: scale(1.1); }

        .invoice-filters { padding: 20px; margin-bottom: 24px; }
        .filters-grid { display: grid; grid-template-columns: 1fr 1fr 1fr auto; gap: 20px; align-items: flex-end; }
        .filter-group label { display: block; font-size: 0.75rem; font-weight: 700; color: #64748b; margin-bottom: 6px; text-transform: uppercase; }
        .filter-group select { width: 100%; padding: 8px 12px; border: 1px solid #e2e8f0; border-radius: 8px; font-size: 0.9rem; background: white; }
        .search-input-wrapper-mini { display: flex; align-items: center; gap: 8px; background: white; border: 1px solid #e2e8f0; border-radius: 8px; padding: 0 12px; height: 38px; }
        .search-input-wrapper-mini input { border: none; outline: none; font-size: 0.9rem; width: 100%; }
        .clear-filters { background: #f1f5f9; border: none; padding: 8px 16px; border-radius: 8px; font-size: 0.85rem; font-weight: 600; color: #64748b; cursor: pointer; height: 38px; transition: all 0.2s; }
        .clear-filters:hover { background: #e2e8f0; color: #1e293b; }

        .month-break-row td { background: #f8fafc; font-weight: 700; color: #0078a4; font-size: 0.85rem; text-transform: uppercase; letter-spacing: 0.05em; padding: 10px 15px; border-bottom: 2px solid #e2e8f0; }

        /* Synthèse mensuelle : tableau étendu (~90% de la fenêtre) + colonnes opérateur/compte figées au scroll */
        .telecom-main.summary-wide { max-width: none; width: 90vw; }
        .summary-table th:nth-child(1), .summary-table td:nth-child(1),
        .summary-table th:nth-child(2), .summary-table td:nth-child(2) {
          position: sticky;
          z-index: 3;
          background: #fff;
          padding-left: 12px;
          padding-right: 12px;
        }
        .summary-table th:nth-child(1), .summary-table td:nth-child(1) {
          left: 0;
          width: 160px; min-width: 160px; max-width: 160px;
          overflow: hidden;
        }
        .summary-table th:nth-child(2), .summary-table td:nth-child(2) {
          left: 160px;
          width: 130px; min-width: 130px; max-width: 130px;
          overflow: hidden;
        }
        .summary-table th:nth-child(1), .summary-table th:nth-child(2) { z-index: 4; }
        .summary-table .month-break-row td:nth-child(1),
        .summary-table .month-break-row td:nth-child(2) { background: #f8fafc; z-index: 4; }

        .status-tag { padding: 4px 10px; border-radius: 6px; font-size: 0.75rem; font-weight: 700; display: inline-block; }
        .status-tag.imported { background: #ecfdf5; color: #059669; border: 1px solid #d1fae5; }
        .status-tag.pending { background: #fff7ed; color: #d97706; border: 1px solid #ffedd5; }

        .commitments-table { width: 100%; border-collapse: collapse; }
        .commitments-table th { background: #f8fafc; padding: 15px; text-align: left; font-size: 0.8rem; color: #64748b; border-bottom: 1px solid #e2e8f0; }
        .commitments-table td { padding: 15px; font-size: 0.9rem; border-bottom: 1px solid #f1f5f9; }
        .year-cell { font-weight: 700; color: #64748b; }
        .num-cell { font-weight: 700; color: #0078a4; }
        .amount-cell { font-weight: 700; text-align: right; }
        .admin-card { background: white; border-radius: 16px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }

        .empty-state { text-align: center; padding: 60px; color: #94a3b8; }
        .empty-state p { margin-top: 15px; font-size: 1.1rem; }

        /* Validation Modal Styles */
        .validation-modal-overlay { position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.7); z-index: 1000; display: flex; align-items: center; justify-content: center; padding: 40px; }
        .validation-modal-content { background: white; width: 100%; height: 100%; border-radius: 20px; display: flex; flex-direction: column; overflow: hidden; }
        .validation-header { padding: 20px 30px; border-bottom: 1px solid #e2e8f0; display: flex; justify-content: space-between; align-items: center; }
        .validation-body { flex-grow: 1; display: flex; overflow: hidden; }
        .pdf-viewer-side { flex: 1; background: #525659; border-right: 1px solid #e2e8f0; }
        .form-side { width: 400px; padding: 30px; overflow-y: auto; background: #f8fafc; }
        .validation-hint { font-size: 0.9rem; color: #64748b; margin-bottom: 20px; padding: 12px; background: #fffbeb; border: 1px solid #fde68a; border-radius: 8px; line-height: 1.4; }
        .validation-form { display: flex; flex-direction: column; gap: 20px; }
        .confirm-btn { margin-top: 10px; background: #059669; color: white; border: none; padding: 14px; border-radius: 12px; font-weight: 700; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 10px; transition: all 0.2s; }
        .confirm-btn:hover { background: #047857; transform: translateY(-1px); }
      `}</style>
    </div>
  );
};

export default TelecomManagement;
