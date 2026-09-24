import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import SignatureCanvas from 'react-signature-canvas';
import { AlertCircle, CheckCircle2, Clock, Download, Eraser, Eye, FileText, Loader2, Lock, LogOut, Paperclip, PenLine, ShieldCheck, Smartphone, User, Users, XCircle } from 'lucide-react';
import PdfPageCanvas from '../../components/parapheur/PdfPageCanvas';
import DocumentPdfViewer from '../../components/parapheur/DocumentPdfViewer';
import { usePdfDocument, type PageSize } from '../../components/parapheur/pdf';
import SignaturePad from '../../components/parapheur/SignaturePad';
import { handwrittenTextDataUrl, signatureDataUrl } from '../../components/parapheur/signatureUtils';

const AUTH_KEY = 'parapheur_sign_auth';

const MODE_LABEL: Record<string, string> = {
  sequentiel: 'Séquentiel (puis)',
  parallele: 'Parallèle (et)',
  alternative: 'Alternatif (ou)',
};

interface SignerAuth { token: string; username: string; displayName: string; email: string; }

interface PublicInfo {
  parapheur: { id: number; title: string; reference: string; message: string; mode: string; status: string; deadline?: string | null; requester: string; bulk_sign_mention?: string };
  signataire: { nom: string; email: string; status: string; signature_mode: string; has_memorized_signature: boolean };
  documents: { id: number; original_name: string; mime_type: string; size?: number; page_count?: number | null }[];
  annexes?: { id: number; original_name: string; mime_type: string; size?: number; page_count?: number | null }[];
  delegation?: { delegant_nom: string; delegant_email: string; delegate_nom: string; delegate_email: string; date_start: string; date_end: string } | null;
  signatures_summary?: { name: string; mode: string; signed_at?: string | null; delegated_by?: string | null; note?: string | null; technique_certificate?: { serial?: string | null; issuer?: string | null; fingerprint?: string | null; signing_time?: string | null } | null; certificate?: { subject?: string | null; issuer?: string | null; serial?: string | null; valid_from?: string | null; valid_to?: string | null } | null }[];
  seal?: { sealed_at?: string | null; serial?: string | null } | null;
  positions: { document_id: number; page: number; x: number; y: number; w: number; h: number; applied: boolean }[];
}

/**
 * Résout l'identité du signataire :
 *  - d'abord une authentification déjà faite sur la page de signature (session),
 *  - sinon la session DSIHUB en cours (l'agent est déjà identifié dans le Hub) —
 *    l'identification n'est donc requise QUE pour un accès direct depuis l'email,
 *    c'est-à-dire sans session ouverte.
 */
function resolveInitialAuth(): SignerAuth | null {
  try {
    const fromSession = JSON.parse(sessionStorage.getItem(AUTH_KEY) || 'null');
    if (fromSession && fromSession.token) return fromSession;
  } catch { /* ignore */ }
  try {
    const token = localStorage.getItem('token');
    const userRaw = localStorage.getItem('user');
    if (token && userRaw) {
      const u = JSON.parse(userRaw);
      if (u && u.username) {
        const email = u.email && String(u.email).trim() ? u.email : `${u.username}@ivry94.fr`;
        return { token, username: u.username, displayName: u.displayName || u.username, email };
      }
    }
  } catch { /* ignore */ }
  return null;
}

export default function SignatureSignataire() {
  const { token } = useParams();
  const [forceLogin, setForceLogin] = useState(false);
  const [auth, setAuth] = useState<SignerAuth | null>(() => resolveInitialAuth());
  const [access, setAccess] = useState<{ is_external?: boolean; nom?: string; email_masked?: string; otp_required?: boolean; accessToken?: string; user?: any; expired?: boolean } | null>(null);
  const [accessLoaded, setAccessLoaded] = useState(false);

  useEffect(() => {
    if (auth || forceLogin) return;
    let cancelled = false;
    fetch(`/api/parapheur/public/${token}/access`)
      .then(r => (r.ok ? r.json() : null))
      .then(d => { if (!cancelled) { setAccess(d); setAccessLoaded(true); } })
      .catch(() => { if (!cancelled) setAccessLoaded(true); });
    return () => { cancelled = true; };
  }, [auth, forceLogin, token]);

  const onLogged = (a: SignerAuth) => { sessionStorage.setItem(AUTH_KEY, JSON.stringify(a)); setAuth(a); setForceLogin(false); };

  if (forceLogin || !auth) {
    if (!accessLoaded) return <Center><Loader2 size={40} className="spin" color="#7c3aed" /><p style={{ color: '#64748b', marginTop: 12 }}>Chargement…</p></Center>;
    if (access?.expired) {
      return (
        <Center>
          <AlertCircle size={40} color="#e11d48" />
          <h1 style={{ fontSize: 20, fontWeight: 800, color: '#0f172a', margin: '14px 0 6px' }}>Lien de signature expiré</h1>
          <p style={{ color: '#64748b', maxWidth: 420, textAlign: 'center' }}>Ce lien n'est plus valable. Demandez au demandeur de vous transmettre un nouveau lien de signature.</p>
        </Center>
      );
    }
    if (access?.is_external) {
      return <ExternalSignerLogin token={token || ''} nom={access.nom || ''} emailMasked={access.email_masked || ''} otpRequired={access.otp_required !== false} accessToken={access.accessToken} user={access.user} onLogged={onLogged} />;
    }
    return <SignerLogin onLogged={onLogged} />;
  }
  return <SignerView
    token={token || ''}
    auth={auth}
    onLogout={() => { sessionStorage.removeItem(AUTH_KEY); setAuth(null); setForceLogin(true); }}
  />;
}

// ─── Écran de connexion d'un signataire extérieur (code par e-mail, sans AD) ──
function ExternalSignerLogin({ token, nom, emailMasked, otpRequired, accessToken, user, onLogged }: { token: string; nom: string; emailMasked: string; otpRequired: boolean; accessToken?: string; user?: any; onLogged: (a: SignerAuth) => void }) {
  const [step, setStep] = useState<'request' | 'verify'>('request');
  const [code, setCode] = useState('');
  const [sentTo, setSentTo] = useState(emailMasked);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Accès DIRECT (1re heure après envoi) : aucun code demandé.
  useEffect(() => {
    if (accessToken) {
      onLogged({ token: accessToken, username: (user && user.username) || 'signataire-externe', displayName: (user && user.displayName) || nom, email: (user && user.email) || '' });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken]);

  const request = async () => {
    setLoading(true); setError(null);
    try {
      const r = await fetch(`/api/parapheur/public/${token}/email-otp/request`, { method: 'POST' });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.message || 'Envoi impossible');
      setSentTo(d.email_masked || emailMasked);
      setStep('verify');
    } catch (e: unknown) { setError(e instanceof Error ? e.message : 'Erreur'); }
    finally { setLoading(false); }
  };

  const verify = async () => {
    setLoading(true); setError(null);
    try {
      const r = await fetch(`/api/parapheur/public/${token}/email-otp/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || !d.accessToken) throw new Error(d.message || 'Code de vérification invalide');
      onLogged({ token: d.accessToken, username: d.user?.username || 'signataire-externe', displayName: d.user?.displayName || nom, email: d.user?.email || '' });
    } catch (e: unknown) { setError(e instanceof Error ? e.message : 'Erreur'); }
    finally { setLoading(false); }
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(135deg,#f0f4f8,#d9e2ec)', padding: 20, fontFamily: "'Inter',-apple-system,sans-serif" }}>
      <div style={{ background: '#fff', borderRadius: 20, boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)', padding: 36, width: '100%', maxWidth: 420 }}>
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <div style={{ width: 54, height: 54, borderRadius: 14, background: '#ecfeff', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px' }}>
            <ShieldCheck size={26} color="#0e7490" />
          </div>
          <h1 style={{ fontSize: 20, fontWeight: 800, color: '#0f172a', margin: 0 }}>Signature — signataire extérieur</h1>
          <p style={{ fontSize: 13, color: '#64748b', marginTop: 6 }}>
            {nom ? `Bonjour ${nom}.` : ''} {otpRequired ? 'Confirmez votre identité pour accéder au parapheur.' : 'Vous allez accéder directement au parapheur.'}
          </p>
        </div>

        {otpRequired && (
          <div style={{ display: 'flex', gap: 10, background: '#eff6ff', border: '1px solid #bfdbfe', color: '#1e3a8a', padding: 12, borderRadius: 10, fontSize: 12.5, marginBottom: 16, lineHeight: 1.5 }}>
            <ShieldCheck size={16} style={{ flexShrink: 0, marginTop: 1 }} />
            <span>
              Ce lien a été ouvert plus d'une heure après son envoi. Pour confirmer que vous êtes bien le destinataire,
              un code à 6 chiffres vous sera envoyé par e-mail à <strong>{sentTo}</strong> : saisissez-le pour accéder au parapheur.
            </span>
          </div>
        )}

        {error && <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#fff1f2', color: '#e11d48', border: '1px solid #fecdd3', padding: 12, borderRadius: 10, fontSize: 13, marginBottom: 16 }}><AlertCircle size={16} /> {error}</div>}

        {step === 'request' ? (
          <button onClick={request} disabled={loading} style={{ width: '100%', padding: 13, background: '#0e7490', color: '#fff', border: 'none', borderRadius: 11, fontWeight: 800, fontSize: 15, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, opacity: loading ? 0.6 : 1 }}>
            {loading ? <Loader2 size={18} className="spin" /> : <Lock size={16} />} Recevoir un code par e-mail
          </button>
        ) : (
          <>
            <p style={{ fontSize: 13, color: '#64748b', marginTop: 0 }}>
              Un code à 6 chiffres a été envoyé à <strong>{sentTo}</strong>. Saisissez-le pour continuer.
            </p>
            <input
              value={code}
              onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              inputMode="numeric"
              autoFocus
              placeholder="000000"
              style={{ width: '100%', padding: 12, fontSize: 24, letterSpacing: 8, textAlign: 'center', border: '1px solid #e2e8f0', borderRadius: 10, boxSizing: 'border-box', fontFamily: 'monospace' }}
            />
            <button onClick={verify} disabled={code.length !== 6 || loading} style={{ width: '100%', marginTop: 14, padding: 13, background: '#0e7490', color: '#fff', border: 'none', borderRadius: 11, fontWeight: 800, fontSize: 15, cursor: 'pointer', opacity: (code.length === 6 && !loading) ? 1 : 0.5 }}>
              {loading ? <Loader2 size={18} className="spin" /> : 'Vérifier et continuer'}
            </button>
            <div style={{ textAlign: 'center', marginTop: 10 }}>
              <button onClick={request} disabled={loading} style={{ border: 'none', background: 'none', color: '#0e7490', fontSize: 12, fontWeight: 700, cursor: loading ? 'default' : 'pointer', textDecoration: 'underline' }}>
                Renvoyer un code
              </button>
            </div>
          </>
        )}

        <p style={{ textAlign: 'center', fontSize: 11, color: '#94a3b8', marginTop: 22, borderTop: '1px solid #f1f5f9', paddingTop: 16 }}>DSI Ville d'Ivry-sur-Seine — Parapheur électronique</p>
      </div>
    </div>
  );
}

// ─── Écran de connexion (mécanisme magasin d'applications) ────────────────────
function SignerLogin({ onLogged }: { onLogged: (a: SignerAuth) => void }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username || !password) return;
    setLoading(true); setError(null);
    try {
      const r = await fetch('/api/auth/magapp-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username.trim(), password }),
      });
      const d = await r.json();
      if (!r.ok || !d.accessToken) throw new Error(d.message || 'Identifiants invalides');
      const email = (d.user?.email && d.user.email.trim()) ? d.user.email : `${d.user.username}@ivry94.fr`;
      onLogged({ token: d.accessToken, username: d.user.username, displayName: d.user.displayName || d.user.username, email });
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Erreur de connexion');
    } finally { setLoading(false); }
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(135deg,#f0f4f8,#d9e2ec)', padding: 20, fontFamily: "'Inter',-apple-system,sans-serif" }}>
      <div style={{ background: '#fff', borderRadius: 20, boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)', padding: 36, width: '100%', maxWidth: 400 }}>
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <div style={{ width: 54, height: 54, borderRadius: 14, background: '#f5f3ff', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px' }}>
            <PenLine size={26} color="#7c3aed" />
          </div>
          <h1 style={{ fontSize: 20, fontWeight: 800, color: '#0f172a', margin: 0 }}>Signature électronique</h1>
          <p style={{ fontSize: 13, color: '#64748b', marginTop: 6 }}>Identifiez-vous avec vos identifiants de session Windows (AD)</p>
        </div>
        <form onSubmit={submit}>
          {error && <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#fff1f2', color: '#e11d48', border: '1px solid #fecdd3', padding: 12, borderRadius: 10, fontSize: 13, marginBottom: 16 }}><AlertCircle size={16} /> {error}</div>}
          <label style={lbl}>Identifiant Windows</label>
          <div style={inputWrap}>
            <User size={17} style={inputIcon} />
            <input value={username} onChange={e => setUsername(e.target.value)} placeholder="Votre login windows" style={input} autoFocus disabled={loading} />
          </div>
          <label style={lbl}>Mot de passe</label>
          <div style={inputWrap}>
            <Lock size={17} style={inputIcon} />
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="********" style={input} disabled={loading} />
          </div>
          <button type="submit" disabled={loading || !username || !password} style={{ width: '100%', marginTop: 16, padding: 13, background: '#7c3aed', color: '#fff', border: 'none', borderRadius: 11, fontWeight: 800, fontSize: 15, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, opacity: (loading || !username || !password) ? 0.6 : 1 }}>
            {loading ? <Loader2 size={18} className="spin" /> : <Lock size={16} />} Se connecter
          </button>
        </form>
        <p style={{ textAlign: 'center', fontSize: 11, color: '#94a3b8', marginTop: 22, borderTop: '1px solid #f1f5f9', paddingTop: 16 }}>DSI Ville d'Ivry-sur-Seine — Parapheur électronique</p>
      </div>
    </div>
  );
}

// ─── Écran de signature ───────────────────────────────────────────────────────
function SignerView({ token, auth, onLogout }: { token: string; auth: SignerAuth; onLogout: () => void }) {
  const sigRef = useRef<SignatureCanvas | null>(null);
  const [info, setInfo] = useState<PublicInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [identityError, setIdentityError] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState<{ done: boolean; rejected?: boolean } | null>(null);
  const [viewedDocs, setViewedDocs] = useState<Set<number>>(new Set());
  const [redraw, setRedraw] = useState(false);
  const [showReject, setShowReject] = useState(false);
  const [comment, setComment] = useState('');
  const [memorizedUrl, setMemorizedUrl] = useState<string | null>(null);
  const [certInfo, setCertInfo] = useState<{ has_certificate: boolean; filename?: string | null } | null>(null);
  const [certFile, setCertFile] = useState<File | null>(null);
  const [password, setPassword] = useState('');
  const [rememberCert, setRememberCert] = useState(true);
  const [resign, setResign] = useState(false);
  const [viewer, setViewer] = useState<{ docId: number; signed: boolean; name: string } | null>(null);
  const [showOtp, setShowOtp] = useState(false);
  const [otpPhone, setOtpPhone] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [otpSending, setOtpSending] = useState(false);
  const [note, setNote] = useState('');
  const [noteOffset, setNoteOffset] = useState<{ x: number; y: number }>({ x: 0, y: 66 });
  const [noteSize, setNoteSize] = useState(12);
  // Signature « en masse » : documents cochés sans lecture intégrale.
  const [ackDocs, setAckDocs] = useState<Set<number>>(new Set());
  const [showBulkConfirm, setShowBulkConfirm] = useState(false);
  const bulkSigningRef = useRef(false);

  const toggleAck = (id: number) => setAckDocs(prev => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const toggleAckAll = () => setAckDocs(prev => {
    const docs = info?.documents || [];
    if (docs.length && docs.every(d => prev.has(d.id))) return new Set();
    return new Set(docs.map(d => d.id));
  });
  const bulkAllChecked = !!info && info.documents.length > 0 && info.documents.every(d => ackDocs.has(d.id));

  const DEFAULT_BULK_MENTION = "En cochant les documents et en validant, je reconnais avoir eu connaissance des documents listés et je consens à leur signature électronique en masse. Cette signature vaut acceptation pleine et entière des documents concernés et emporte les mêmes effets que ma signature manuscrite. Je renonce expressément à toute contestation tirée de l'absence de lecture intégrale de chaque document.";

  const notePreview = useMemo(() => (note.trim() ? handwrittenTextDataUrl(note) : null), [note]);

  const h = { Authorization: `Bearer ${auth.token}` };

  // Le signataire ne peut signer qu'après avoir fait défiler chaque document
  // jusqu'à sa dernière page.
  const markViewed = useCallback((id: number, v: boolean) => {
    setViewedDocs(prev => {
      const next = new Set(prev);
      if (v) next.add(id); else next.delete(id);
      return next;
    });
  }, []);

  useEffect(() => {
    if (!info?.signataire.has_memorized_signature || redraw) { setMemorizedUrl(null); return; }
    let url: string | null = null;
    let cancelled = false;
    fetch(`/api/parapheur/public/${token}/signature-image`, { headers: { Authorization: `Bearer ${auth.token}` } })
      .then(r => (r.ok ? r.blob() : null))
      .then(b => { if (b && !cancelled) { url = URL.createObjectURL(b); setMemorizedUrl(url); } })
      .catch(() => { /* pas d'image */ });
    return () => { cancelled = true; if (url) URL.revokeObjectURL(url); };
  }, [info?.signataire.has_memorized_signature, redraw, token, auth.token]);

  useEffect(() => {
    if (info?.signataire.signature_mode !== 'securise') return;
    let cancelled = false;
    fetch(`/api/parapheur/public/${token}/certificate`, { headers: { Authorization: `Bearer ${auth.token}` } })
      .then(r => (r.ok ? r.json() : null))
      .then(d => { if (d && !cancelled) setCertInfo(d); })
      .catch(() => { /* ignore */ });
    return () => { cancelled = true; };
  }, [info?.signataire.signature_mode, token, auth.token]);

  const uploadCertificate = async (): Promise<boolean> => {
    if (!certFile) return false;
    try {
      const fd = new FormData();
      fd.append('file', certFile);
      if (password) fd.append('certificatePassword', password);
      fd.append('remember', rememberCert ? 'true' : 'false');
      const r = await fetch(`/api/parapheur/public/${token}/certificate`, { method: 'POST', headers: { Authorization: `Bearer ${auth.token}` }, body: fd });
      const raw = await r.text();
      let d: { message?: string } = {};
      try { d = raw ? JSON.parse(raw) : {}; } catch { d = {}; }
      if (!r.ok) { setError(d.message || `Import du certificat impossible (${r.status})`); return false; }
      setCertInfo({ has_certificate: true, filename: certFile.name });
      setCertFile(null);
      return true;
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Erreur');
      return false;
    }
  };

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const r = await fetch(`/api/parapheur/public/${token}`, { headers: { Authorization: `Bearer ${auth.token}` } });
      const d = await r.json();
      if (r.status === 403) { setIdentityError(true); setError(d.message || 'Identité non conforme'); return; }
      if (!r.ok) throw new Error(d.message || 'Document introuvable');
      setInfo(d);
    } catch (e: unknown) { setError(e instanceof Error ? e.message : 'Erreur'); }
    finally { setLoading(false); }
  }, [token, auth.token]);

  useEffect(() => { load(); }, [load]);

  // Sélection des documents à signer : tous cochés par défaut, le signataire
  // peut en décocher un ou plusieurs pour n'en signer qu'une partie.
  useEffect(() => {
    if (info) setAckDocs(new Set((info.documents || []).map(d => d.id)));
  }, [info]);

  const sign = async (otpCodeValue?: string) => {
    setSubmitting(true);
    setError(null);
    try {
      if (!info) return;
      // Signature en masse/partielle : seuls les documents cochés sont signés.
      const docs = (info.documents || []).filter(d => ackDocs.has(d.id));
      const bulk = bulkSigningRef.current;
      const viewedAll = bulk || (docs.length > 0 && docs.every(d => viewedDocs.has(d.id)));
      if (!viewedAll) {
        setError('Veuillez consulter chaque document jusqu\'à sa dernière page, ou cocher les documents à signer.');
        return;
      }
      const isSecure = info.signataire.signature_mode === 'securise';

      const needDraw = redraw || !info.signataire.has_memorized_signature;
      let drawnDataUrl: string | undefined;
      if (needDraw) {
        const dataUrl = signatureDataUrl(sigRef.current || null);
        if (!dataUrl) { setError('Veuillez dessiner votre signature.'); return; }
        drawnDataUrl = dataUrl;
      }

      if (isSecure) {
        if (!certInfo?.has_certificate && !certFile) { setError('Importez votre certificat P12 avant de signer.'); return; }
        if (!password) { setError('Saisissez le mot de passe de votre certificat.'); return; }
        if (certFile && !certInfo?.has_certificate) {
          const ok = await uploadCertificate();
          if (!ok) return;
        }
      }

      const body: Record<string, unknown> = { signatureDataUrl: drawnDataUrl, memorize: true };
      if (note.trim()) {
        body.signatureNote = note.trim().slice(0, 120);
        body.noteOffsetX = noteOffset.x;
        body.noteOffsetY = noteOffset.y;
        body.noteSize = noteSize;
        const noteImg = handwrittenTextDataUrl(note.trim());
        if (noteImg) body.signatureNoteDataUrl = noteImg;
      }
      if (isSecure) body.certificatePassword = password;
      body.documentIds = Array.from(ackDocs);
      if (otpCodeValue) body.otpCode = otpCodeValue;

      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 120000);
      let r: Response;
      try {
        r = await fetch(`/api/parapheur/public/${token}/sign`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...h },
          body: JSON.stringify(body),
          signal: ctrl.signal,
        });
      } finally {
        clearTimeout(timer);
      }
      const raw = await r.text();
      let d: { message?: string; done?: boolean } = {};
      try { d = raw ? JSON.parse(raw) : {}; } catch { d = {}; }
      if (!r.ok) throw new Error(d.message || `Signature impossible (${r.status})`);
      setSuccess({ done: !!d.done });
    } catch (e: unknown) {
      const msg = e instanceof Error
        ? (e.name === 'AbortError' ? 'Le serveur met trop de temps à répondre. Réessayez.' : e.message)
        : 'Erreur inattendue';
      console.error('[signature] échec:', e);
      setError(msg);
    } finally {
      bulkSigningRef.current = false;
      setSubmitting(false);
    }
  };

  // Parcours de signature (SMS ou direct) — appelé après validation de l'engagement
  // éventuel de signature en masse.
  const startSignFlow = async () => {
    if (!info) return;
    if (info.signataire.signature_mode === 'sms') {
      // Valider la signature visuelle avant d'envoyer le code.
      const needDraw = redraw || !info.signataire.has_memorized_signature;
      if (needDraw) {
        const dataUrl = signatureDataUrl(sigRef.current || null);
        if (!dataUrl) { setError('Veuillez dessiner votre signature.'); return; }
      }
      setOtpSending(true);
      try {
        const r = await fetch(`/api/parapheur/public/${token}/otp/request`, { method: 'POST', headers: h });
        const raw = await r.text();
        let d: { message?: string; phone_masked?: string } = {};
        try { d = raw ? JSON.parse(raw) : {}; } catch { d = {}; }
        if (!r.ok) throw new Error(d.message || 'Envoi du code impossible');
        setOtpPhone(d.phone_masked || '');
        setOtpCode('');
        setShowOtp(true);
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : 'Envoi du code impossible');
      } finally { setOtpSending(false); }
      return;
    }
    await sign();
  };

  const confirmBulkSign = async () => {
    setShowBulkConfirm(false);
    bulkSigningRef.current = true;
    await startSignFlow();
  };

  const handleSignClick = async () => {
    if (!info) return;
    setError(null);
    const selected = (info.documents || []).filter(d => ackDocs.has(d.id));
    if (selected.length === 0) { setError('Sélectionnez au moins un document à signer.'); return; }
    const selectedAllViewed = selected.every(d => viewedDocs.has(d.id));
    // Documents cochés sans lecture intégrale : engagement via la modale.
    if (!selectedAllViewed) { setShowBulkConfirm(true); return; }
    bulkSigningRef.current = false;
    await startSignFlow();
  };

  const resendOtp = async () => {
    setOtpSending(true); setError(null);
    try {
      const r = await fetch(`/api/parapheur/public/${token}/otp/request`, { method: 'POST', headers: h });
      const raw = await r.text();
      let d: { message?: string; phone_masked?: string } = {};
      try { d = raw ? JSON.parse(raw) : {}; } catch { d = {}; }
      if (!r.ok) throw new Error(d.message || 'Envoi impossible');
      setOtpPhone(d.phone_masked || otpPhone);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Envoi impossible');
    } finally { setOtpSending(false); }
  };

  const reject = async () => {
    setSubmitting(true); setError(null);
    try {
      const r = await fetch(`/api/parapheur/public/${token}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...h },
        body: JSON.stringify({ comment }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.message || 'Refus impossible');
      setSuccess({ done: false, rejected: true });
      setShowReject(false);
    } catch (e: unknown) { setError(e instanceof Error ? e.message : 'Erreur'); }
    finally { setSubmitting(false); }
  };

  if (loading) return <Center><Loader2 size={40} className="spin" color="#7c3aed" /><p style={{ color: '#64748b', marginTop: 12 }}>Chargement…</p></Center>;

  if (identityError) return (
    <Center>
      <AlertCircle size={52} color="#dc2626" />
      <h2 style={{ color: '#0f172a', margin: '14px 0 6px' }}>Identité non conforme</h2>
      <p style={{ color: '#64748b', maxWidth: 420, textAlign: 'center' }}>{error || "Vous êtes connecté(e) avec un compte qui ne correspond pas au signataire attendu pour ce document."}</p>
      <button onClick={onLogout} style={btnPrimary}><LogOut size={16} /> Changer de compte</button>
    </Center>
  );

  if (error && !info) return (
    <Center>
      <AlertCircle size={52} color="#dc2626" />
      <h2 style={{ color: '#0f172a', margin: '14px 0 6px' }}>Erreur</h2>
      <p style={{ color: '#64748b', maxWidth: 420, textAlign: 'center' }}>{error}</p>
    </Center>
  );

  if (!info) return null;

  const allViewed = info.documents.length > 0 && info.documents.every(d => viewedDocs.has(d.id));
  const sStatus = info.signataire.status;
  const downloadSigned = async (docId: number) => {
    try {
      const r = await fetch(`/api/parapheur/public/${token}/doc/${docId}?signed=1&download=1`, { headers: h });
      if (!r.ok) return;
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'document_signe.pdf';
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
    } catch { /* ignore */ }
  };

  if (success?.rejected) {
    return (
      <Center>
        <XCircle size={56} color="#dc2626" />
        <h2 style={{ color: '#0f172a', margin: '14px 0 6px' }}>Refus enregistré</h2>
        <p style={{ color: '#64748b', maxWidth: 460, textAlign: 'center' }}>
          Votre refus de signer a bien été enregistré. Le demandeur en a été informé.
        </p>
        <p style={{ fontSize: 12, color: '#94a3b8' }}>Réf. {info.parapheur.reference}</p>
      </Center>
    );
  }

  if ((sStatus === 'a_signe' || success) && !resign) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', background: '#f8fafc', padding: '60px 24px' }}>
        <CheckCircle2 size={56} color="#16a34a" />
        <h2 style={{ color: '#0f172a', margin: '14px 0 6px' }}>{success?.done ? (info.parapheur.mode === 'alternative' ? 'Parapheur validé' : 'Parapheur entièrement signé') : 'Signature enregistrée'}</h2>
        <p style={{ color: '#64748b', maxWidth: 460, textAlign: 'center', margin: '0 0 4px' }}>
          {success?.done
            ? (info.parapheur.mode === 'alternative'
              ? 'Le circuit alternatif est validé : la signature d\'un seul signataire suffisait. Le demandeur a été notifié.'
              : 'Toutes les signatures ont été recueillies. Le demandeur a été notifié.')
            : 'Votre signature a bien été apposée sur le(s) document(s). Le demandeur a été notifié.'}
        </p>
        <p style={{ fontSize: 12, color: '#94a3b8', marginBottom: 22 }}>Réf. {info.parapheur.reference}</p>

        <div style={{ width: '100%', maxWidth: 560, display: 'grid', gap: 10 }}>
          <div style={{ fontSize: 11, fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '.05em' }}>Documents signés</div>
          {info.documents.map(d => (
            <div key={d.id} style={{ display: 'flex', alignItems: 'center', gap: 10, background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, padding: '10px 14px' }}>
              <FileText size={16} color="#ef4444" />
              <span style={{ flex: 1, minWidth: 0, fontSize: 13, color: '#1e293b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.original_name}</span>
              <button onClick={() => setViewer({ docId: d.id, signed: true, name: d.original_name })} style={btnGhost}><Eye size={14} /> Voir</button>
              {info.parapheur.status === 'termine' && (
                <button onClick={() => downloadSigned(d.id)} title="Télécharger le PDF signé" style={btnGhost}><Download size={14} /></button>
              )}
            </div>
          ))}
        </div>

        {info.parapheur.status !== 'termine' && (
          <p style={{ fontSize: 11, color: '#94a3b8', marginTop: 12, textAlign: 'center' }}>
            Le téléchargement sera disponible une fois toutes les signatures recueillies.
          </p>
        )}

        {!success?.done && info.parapheur.status === 'en_cours' && (
          <button onClick={() => { setResign(true); setSuccess(null); }} style={{ ...btnGhost, marginTop: 18 }}>
            <PenLine size={14} /> Signer à nouveau {info.signataire.signature_mode === 'securise' ? 'avec mon certificat' : ''}
          </button>
        )}

        {viewer && (
          <DocumentPdfViewer
            open
            url={`/api/parapheur/public/${token}/doc/${viewer.docId}?signed=${viewer.signed ? '1' : '0'}`}
            authToken={auth.token}
            title={viewer.name}
            signatureInfo={(info.signatures_summary && info.signatures_summary.length) ? { signers: info.signatures_summary, seal: info.seal || null } : null}
            onClose={() => setViewer(null)}
          />
        )}
      </div>
    );
  }
  if (sStatus === 'refuse') {
    return (
      <Center>
        <XCircle size={56} color="#dc2626" />
        <h2 style={{ color: '#0f172a', margin: '14px 0 6px' }}>Vous avez refusé de signer</h2>
        <p style={{ color: '#64748b' }}>Le demandeur en a été informé.</p>
      </Center>
    );
  }
  if (info.parapheur.status === 'annule') {
    return <Center><XCircle size={56} color="#64748b" /><h2 style={{ color: '#0f172a', margin: '14px 0 6px' }}>Parapheur annulé</h2><p style={{ color: '#64748b' }}>Ce parapheur n'est plus disponible.</p></Center>;
  }

  // Circuit « ou » clôturé par un autre signataire, ou parapheur finalisé sans
  // que ce signataire ait eu à signer : plus rien à faire ici.
  if (info.parapheur.status === 'termine' && sStatus !== 'a_signe') {
    return (
      <Center>
        <CheckCircle2 size={56} color="#16a34a" />
        <h2 style={{ color: '#0f172a', margin: '14px 0 6px' }}>Parapheur déjà validé</h2>
        <p style={{ color: '#64748b', maxWidth: 460, textAlign: 'center' }}>
          {info.parapheur.mode === 'alternative'
            ? "Ce document a été validé par un autre signataire : dans un circuit « ou », une seule signature suffit."
            : 'Ce parapheur a déjà été finalisé. Votre signature n\'est plus requise.'}
        </p>
        <p style={{ fontSize: 12, color: '#94a3b8' }}>Réf. {info.parapheur.reference}</p>
      </Center>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: '#f8fafc' }}>
      <div style={{ background: '#fff', borderBottom: '1px solid #e2e8f0' }}>
        <div style={{ maxWidth: 860, margin: '0 auto', padding: '18px 20px', display: 'flex', alignItems: 'center', gap: 14 }}>
          <PenLine size={26} color="#7c3aed" />
          <div style={{ flex: 1 }}>
            <h1 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: '#0f172a' }}>{info.parapheur.title}</h1>
            <p style={{ margin: '2px 0 0', fontSize: 12, color: '#64748b' }}>
              Réf. {info.parapheur.reference} · Demandeur : {info.parapheur.requester} · {MODE_LABEL[info.parapheur.mode] || 'Parallèle'}
            </p>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: '#7c3aed', display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'flex-end' }}>
              {info.signataire.signature_mode === 'securise' && <ShieldCheck size={14} />} {info.signataire.nom}
            </div>
            <button onClick={onLogout} style={{ border: 'none', background: 'none', color: '#94a3b8', fontSize: 11, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4 }}><LogOut size={11} /> Changer de compte</button>
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 860, margin: '0 auto', padding: '24px 20px 80px' }}>
        {info.parapheur.message && <div style={{ background: '#f5f3ff', border: '1px solid #ddd6fe', borderRadius: 10, padding: '12px 16px', fontSize: 13, color: '#5b21b6', marginBottom: 18, whiteSpace: 'pre-wrap' }}>{info.parapheur.message}</div>}
        {info.parapheur.deadline && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 10, padding: '10px 14px', fontSize: 13, color: '#b45309', marginBottom: 18 }}>
            <Clock size={16} /> Merci de signer avant le {new Date(info.parapheur.deadline).toLocaleDateString('fr-FR')}.
          </div>
        )}

        {error && (
          <div style={{ position: 'fixed', top: 12, left: '50%', transform: 'translateX(-50%)', zIndex: 3000, background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', borderRadius: 10, padding: '12px 18px', fontSize: 13, fontWeight: 600, maxWidth: '92%', boxShadow: '0 8px 24px rgba(0,0,0,0.15)' }}>
            {error}
          </div>
        )}

        {info.delegation && (
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 10, padding: '12px 16px', fontSize: 13, color: '#92400e', marginBottom: 18 }}>
            <Users size={16} style={{ marginTop: 1, flexShrink: 0 }} />
            <div>
              Vous signez <strong>par délégation</strong> de <strong>{info.delegation.delegant_nom}</strong>
              {` (du ${new Date(info.delegation.date_start).toLocaleDateString('fr-FR')} au ${new Date(info.delegation.date_end).toLocaleDateString('fr-FR')})`}.
              La signature portera la mention « signé {info.delegation.delegate_nom} par délégation de {info.delegation.delegant_nom} ».
            </div>
          </div>
        )}

        <h2 style={{ fontSize: 15, fontWeight: 800, color: '#0f172a', margin: '0 0 6px' }}>Documents à signer ({info.documents.length})</h2>
        <p style={{ fontSize: 12, color: '#64748b', margin: '0 0 12px' }}>
          Consultez chaque document jusqu'à sa dernière page : la signature n'est débloquée qu'après lecture complète.
        </p>
        {info.documents.length > 1 && (
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#475569', margin: '0 0 12px', cursor: 'pointer', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 9, padding: '9px 12px' }}>
            <input type="checkbox" checked={bulkAllChecked} onChange={toggleAckAll} style={{ width: 16, height: 16, cursor: 'pointer' }} />
            <span><b>Tout cocher</b> — signer en masse sans lecture intégrale (une confirmation vous sera demandée).</span>
          </label>
        )}
        <div style={{ display: 'grid', gap: 18 }}>
          {info.documents.map(d => {
            const pos = info.positions.find(p => p.document_id === d.id);
            const seen = viewedDocs.has(d.id);
            return (
              <div key={d.id} style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, overflow: 'hidden' }}>
                <div style={{ padding: '10px 16px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 700, color: '#334155' }}>
                  <input type="checkbox" checked={ackDocs.has(d.id)} onChange={() => toggleAck(d.id)} title="Cocher pour signer en masse" style={{ width: 16, height: 16, cursor: 'pointer', flexShrink: 0 }} />
                  <FileText size={15} color="#ef4444" /> {d.original_name}
                  {d.page_count ? <span style={{ fontSize: 11, color: '#94a3b8', fontWeight: 600 }}>{d.page_count} page(s)</span> : null}
                  <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 10 }}>
                    {pos?.applied && <span style={{ fontSize: 11, color: '#15803d', display: 'flex', alignItems: 'center', gap: 4 }}><CheckCircle2 size={12} /> signé</span>}
                    {seen
                      ? <span style={{ fontSize: 11, color: '#15803d', display: 'flex', alignItems: 'center', gap: 4 }}><Eye size={12} /> lu</span>
                      : <span style={{ fontSize: 11, color: '#b45309', display: 'flex', alignItems: 'center', gap: 4 }}><Clock size={12} /> à lire</span>}
                  </span>
                </div>
                <div style={{ padding: 16 }}>
                  {pos
                    ? <SignableDocumentView docId={d.id} url={`/api/parapheur/public/${token}/doc/${d.id}`} authToken={auth.token} position={pos} signerName={info.signataire.nom} onViewed={markViewed} noteImage={notePreview} noteOffset={noteOffset} noteSize={noteSize} onNoteOffsetChange={setNoteOffset} />
                    : <p style={{ fontSize: 12, color: '#94a3b8' }}>Aucune position définie.</p>}
                </div>
              </div>
            );
          })}
        </div>

        {info.annexes && info.annexes.length > 0 && (
          <>
            <h2 style={{ fontSize: 15, fontWeight: 800, color: '#0f172a', margin: '28px 0 6px', display: 'flex', alignItems: 'center', gap: 6 }}>
              <Paperclip size={15} /> Annexes ({info.annexes.length})
            </h2>
            <p style={{ fontSize: 12, color: '#64748b', margin: '0 0 12px' }}>Documents complémentaires fournis pour information : ils ne sont pas signés.</p>
            <div style={{ display: 'grid', gap: 10 }}>
              {info.annexes.map(a => (
                <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 10, background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, padding: '10px 14px' }}>
                  <FileText size={16} color="#64748b" />
                  <span style={{ flex: 1, minWidth: 0, fontSize: 13, color: '#1e293b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {a.original_name}{a.page_count ? <span style={{ color: '#94a3b8' }}> · {a.page_count} page(s)</span> : null}
                  </span>
                  <button onClick={() => setViewer({ docId: a.id, signed: false, name: a.original_name })} style={btnGhost}><Eye size={14} /> Consulter</button>
                </div>
              ))}
            </div>
          </>
        )}

        {info.signataire.signature_mode === 'securise' && (
          <div style={{ background: '#faf5ff', border: '1px solid #e9d5ff', borderRadius: 12, padding: 20, marginTop: 24 }}>
            <h2 style={{ fontSize: 15, fontWeight: 800, color: '#5b21b6', margin: '0 0 6px', display: 'flex', alignItems: 'center', gap: 6 }}>
              <ShieldCheck size={16} /> Signature sécurisée (certificat P12)
            </h2>
            {certInfo?.has_certificate ? (
              <p style={{ fontSize: 12, color: '#7e22ce', margin: '0 0 12px' }}>
                Certificat enregistré{certInfo.filename ? ` : ${certInfo.filename}` : ''}. Saisissez votre mot de passe pour signer.
              </p>
            ) : (
              <>
                <p style={{ fontSize: 12, color: '#7e22ce', margin: '0 0 8px' }}>
                  Aucun certificat enregistré. Importez votre fichier .p12 : il sera mémorisé pour vos prochaines signatures.
                </p>
                <input type="file" accept=".p12,.pfx,application/x-pkcs12" onChange={e => setCertFile(e.target.files?.[0] || null)} style={{ fontSize: 12, marginBottom: 10 }} />
              </>
            )}
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="Mot de passe du certificat"
              style={{ width: '100%', padding: '10px 12px', border: '1px solid #e9d5ff', borderRadius: 8, fontSize: 13, boxSizing: 'border-box' }}
            />
            {!certInfo?.has_certificate && (
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#6d28d9', marginTop: 10, cursor: 'pointer' }}>
                <input type="checkbox" checked={rememberCert} onChange={e => setRememberCert(e.target.checked)} />
                Mémoriser ce certificat pour mes prochaines signatures
              </label>
            )}
          </div>
        )}

        {info.signataire.signature_mode === 'sms' && (
          <div style={{ background: '#ecfeff', border: '1px solid #a5f3fc', borderRadius: 12, padding: 20, marginTop: 24 }}>
            <h2 style={{ fontSize: 15, fontWeight: 800, color: '#0e7490', margin: '0 0 6px', display: 'flex', alignItems: 'center', gap: 6 }}>
              <Smartphone size={16} /> Vérification par SMS
            </h2>
            <p style={{ fontSize: 12, color: '#0e7490', margin: 0 }}>
              Un code à 6 chiffres vous sera envoyé par SMS sur votre portable au moment de signer. La signature n'est validée qu'après saisie correcte du code.
            </p>
          </div>
        )}

        <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: 20, marginTop: 24 }}>
          <h2 style={{ fontSize: 15, fontWeight: 800, color: '#0f172a', margin: '0 0 4px' }}>Votre signature</h2>
          {info.signataire.has_memorized_signature && !redraw ? (
            <>
              <p style={{ fontSize: 12, color: '#64748b', margin: '0 0 12px' }}>Votre signature enregistrée sera apposée sur les documents.</p>
              {memorizedUrl && <img src={memorizedUrl} alt="signature" style={{ maxHeight: 90, border: '1px solid #e2e8f0', borderRadius: 8, background: '#fff' }} />}
              <div style={{ marginTop: 12 }}>
                <button onClick={() => setRedraw(true)} style={btnGhost}><Eraser size={14} /> Redessiner</button>
              </div>
            </>
          ) : (
            <>
              <p style={{ fontSize: 12, color: '#64748b', margin: '0 0 12px' }}>Dessinez votre signature ci-dessous (elle sera mémorisée pour vos prochaines signatures).</p>
              <SignaturePad sigRef={sigRef} />
              <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
                <button onClick={() => sigRef.current?.clear()} style={btnGhost}><Eraser size={14} /> Effacer</button>
                {info.signataire.has_memorized_signature && <button onClick={() => setRedraw(false)} style={btnGhost}>Annuler</button>}
              </div>
            </>
          )}

          <div style={{ marginTop: 16, borderTop: '1px solid #f1f5f9', paddingTop: 14 }}>
            <label style={{ display: 'block', fontSize: 12, color: '#64748b', marginBottom: 6 }}>
              Mention libre (optionnel) — ex. « Avis favorable » : elle s'affiche en écriture manuscrite près de votre signature. Faites-la glisser sur le document pour la positionner.
            </label>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              <input
                value={note}
                onChange={e => setNote(e.target.value.slice(0, 120))}
                placeholder="Avis favorable"
                style={{ flex: '1 1 260px', maxWidth: 420, padding: '9px 12px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 13, boxSizing: 'border-box', fontFamily: 'inherit' }}
              />
              <label style={{ fontSize: 12, color: '#64748b', display: 'flex', alignItems: 'center', gap: 6 }}>
                Taille
                <select
                  value={noteSize}
                  onChange={e => setNoteSize(Number(e.target.value))}
                  style={{ padding: '8px 10px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 12, fontFamily: 'inherit' }}
                >
                  <option value={9}>Petite</option>
                  <option value={12}>Moyenne</option>
                  <option value={16}>Grande</option>
                </select>
              </label>
            </div>
            {notePreview && (
              <div style={{ marginTop: 10 }}>
                <img src={notePreview} alt="mention manuscrite" style={{ height: noteSize, maxWidth: '100%' }} />
              </div>
            )}
          </div>
        </div>

        {!allViewed && (
          <p style={{ fontSize: 12, color: '#b45309', marginTop: 18, textAlign: 'center' }}>
            Consultez chaque document jusqu'à sa dernière page (faites défiler), ou cochez les documents à signer pour débloquer la signature.
          </p>
        )}

        <div style={{ display: 'flex', gap: 12, marginTop: 22 }}>
          <button onClick={() => handleSignClick()} disabled={submitting || otpSending || ackDocs.size === 0} style={{ ...btnPrimary, flex: 2, justifyContent: 'center', padding: '14px 0', fontSize: 15, opacity: (submitting || otpSending || ackDocs.size === 0) ? 0.5 : 1, cursor: (submitting || otpSending || ackDocs.size === 0) ? 'not-allowed' : 'pointer' }}>
            {(submitting || otpSending) ? <Loader2 size={18} className="spin" /> : <CheckCircle2 size={18} />}
            {otpSending
              ? 'Envoi du SMS…'
              : ackDocs.size === 0
                ? 'Sélectionnez un document'
                : (ackDocs.size < info.documents.length
                  ? `Signer la sélection (${ackDocs.size}/${info.documents.length})`
                  : (bulkAllChecked && !allViewed ? 'Signer en masse' : 'Signer le(s) document(s)'))}
          </button>
          <button onClick={() => setShowReject(true)} disabled={submitting} style={{ ...btnGhost, flex: 1, justifyContent: 'center', padding: '14px 0' }}>
            <XCircle size={16} /> Refuser
          </button>
        </div>
      </div>

      {showBulkConfirm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 3000, padding: 16 }}>
          <div style={{ background: '#fff', borderRadius: 14, padding: 24, width: '100%', maxWidth: 540 }}>
            <h3 style={{ margin: '0 0 8px', fontSize: 17, fontWeight: 800, color: '#0f172a', display: 'flex', alignItems: 'center', gap: 8 }}>
              <ShieldCheck size={18} color="#7c3aed" /> Signature en masse
            </h3>
            <p style={{ fontSize: 13, color: '#64748b', marginTop: 0 }}>
              Vous allez signer <strong>{ackDocs.size} document(s)</strong>{ackDocs.size < info.documents.length ? ' (sélection partielle)' : ''} sans en avoir nécessairement pris connaissance de façon intégrale. Cette signature vous engage.
            </p>
            <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 10, padding: '12px 14px', fontSize: 13, color: '#92400e', lineHeight: 1.6 }}>
              {info.parapheur.bulk_sign_mention || DEFAULT_BULK_MENTION}
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
              <button onClick={() => setShowBulkConfirm(false)} style={{ ...btnGhost, flex: 1, justifyContent: 'center' }}>Annuler</button>
              <button
                onClick={confirmBulkSign}
                disabled={submitting || otpSending}
                style={{ flex: 1, padding: '11px 0', background: '#16a34a', color: '#fff', border: 'none', borderRadius: 10, fontWeight: 800, cursor: 'pointer', opacity: (submitting || otpSending) ? 0.6 : 1 }}
              >
                Je confirme et je signe
              </button>
            </div>
          </div>
        </div>
      )}

      {showOtp && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 3000, padding: 16 }}>
          <div style={{ background: '#fff', borderRadius: 14, padding: 24, width: '100%', maxWidth: 420 }}>
            <h3 style={{ margin: '0 0 8px', fontSize: 17, fontWeight: 800, color: '#0f172a', display: 'flex', alignItems: 'center', gap: 8 }}>
              <Smartphone size={18} color="#0e7490" /> Code de vérification
            </h3>
            <p style={{ fontSize: 13, color: '#64748b', marginTop: 0 }}>
              Un code à 6 chiffres vous a été envoyé par SMS au <strong>{otpPhone}</strong>. Saisissez-le pour valider votre signature.
            </p>
            <input
              value={otpCode}
              onChange={e => setOtpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              inputMode="numeric"
              autoFocus
              placeholder="000000"
              style={{ width: '100%', padding: 12, fontSize: 24, letterSpacing: 8, textAlign: 'center', border: '1px solid #e2e8f0', borderRadius: 10, boxSizing: 'border-box', fontFamily: 'monospace' }}
            />
            <div style={{ textAlign: 'center', marginTop: 8 }}>
              <button onClick={resendOtp} disabled={otpSending} style={{ border: 'none', background: 'none', color: '#0e7490', fontSize: 12, fontWeight: 700, cursor: otpSending ? 'default' : 'pointer', textDecoration: 'underline' }}>
                {otpSending ? 'Envoi…' : 'Renvoyer un code'}
              </button>
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
              <button onClick={() => setShowOtp(false)} style={{ ...btnGhost, flex: 1, justifyContent: 'center' }}>Annuler</button>
              <button
                onClick={() => { setShowOtp(false); sign(otpCode); }}
                disabled={otpCode.length !== 6 || submitting}
                style={{ flex: 1, padding: '11px 0', background: '#0e7490', color: '#fff', border: 'none', borderRadius: 10, fontWeight: 800, cursor: 'pointer', opacity: (otpCode.length === 6 && !submitting) ? 1 : 0.5 }}
              >
                Valider et signer
              </button>
            </div>
          </div>
        </div>
      )}

      {showReject && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 }}>
          <div style={{ background: '#fff', borderRadius: 14, padding: 24, width: '100%', maxWidth: 460 }}>
            <h3 style={{ margin: '0 0 10px', fontSize: 17, fontWeight: 800, color: '#0f172a' }}>Refuser de signer</h3>
            <p style={{ fontSize: 13, color: '#64748b', marginTop: 0 }}>Vous pouvez indiquer un motif (optionnel).</p>
            <textarea value={comment} onChange={e => setComment(e.target.value.slice(0, 1000))} rows={4} placeholder="Motif du refus…" style={{ width: '100%', padding: 10, border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 13, resize: 'vertical', boxSizing: 'border-box', fontFamily: 'inherit' }} />
            <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
              <button onClick={() => setShowReject(false)} style={{ ...btnGhost, flex: 1, justifyContent: 'center' }}>Annuler</button>
              <button onClick={reject} disabled={submitting} style={{ flex: 1, padding: '11px 0', background: '#dc2626', color: '#fff', border: 'none', borderRadius: 10, fontWeight: 800, cursor: 'pointer' }}>Confirmer le refus</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Affiche un document signable en intégralité (toutes les pages) dans une zone
 * défilante, en commençant par la première page. Le signataire doit atteindre
 * la fin du document — le bas du défilement — pour que `onViewed(true)` soit
 * émis, ce qui débloque la signature.
 */
function SignableDocumentView({ docId, url, authToken, position, signerName, onViewed, noteImage, noteOffset, noteSize, onNoteOffsetChange }: {
  docId: number;
  url: string;
  authToken: string;
  position: { page: number; x: number; y: number; w: number; h: number };
  signerName: string;
  onViewed: (id: number, viewed: boolean) => void;
  noteImage?: string | null;
  noteOffset?: { x: number; y: number };
  noteSize?: number;
  onNoteOffsetChange?: (o: { x: number; y: number }) => void;
}) {
  const { doc, loading, error } = usePdfDocument({ url }, authToken);
  const [size, setSize] = useState<PageSize | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const reported = useRef(false);
  const noteDrag = useRef<{ startX: number; startY: number; offX: number; offY: number } | null>(null);

  const onNoteDown = (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    noteDrag.current = { startX: e.clientX, startY: e.clientY, offX: noteOffset?.x ?? 0, offY: noteOffset?.y ?? 66 };
  };
  const onNoteMove = (e: React.PointerEvent) => {
    if (!noteDrag.current) return;
    const pxScale = size && size.baseWidth ? size.width / size.baseWidth : 1;
    const dx = (e.clientX - noteDrag.current.startX) / pxScale;
    const dy = (e.clientY - noteDrag.current.startY) / pxScale;
    onNoteOffsetChange?.({ x: Math.round(noteDrag.current.offX + dx), y: Math.round(noteDrag.current.offY - dy) });
  };
  const onNoteUp = () => { noteDrag.current = null; };

  const evaluate = useCallback(() => {
    const el = scrollRef.current;
    if (!el || reported.current) return;
    const noScroll = el.scrollHeight <= el.clientHeight + 8;
    const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 24;
    if (noScroll || atBottom) {
      reported.current = true;
      onViewed(docId, true);
    }
  }, [onViewed, docId]);

  useEffect(() => {
    reported.current = false;
    onViewed(docId, false);
    if (!doc) return;
    const t = setTimeout(evaluate, 80);
    return () => clearTimeout(t);
  }, [doc, docId, evaluate, onViewed]);

  useEffect(() => {
    const onResize = () => evaluate();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [evaluate]);

  const box = size ? { w: (position.w / size.baseWidth) * size.width, h: (position.h / size.baseHeight) * size.height } : { w: 120, h: 48 };
  const pxScale = size && size.baseWidth ? size.width / size.baseWidth : 1;
  const sigLeft = size ? (position.x / 100) * size.width - box.w / 2 : 0;
  const sigBottom = size ? (position.y / 100) * size.height - box.h / 2 + box.h : 0;
  const noteLeft = sigLeft + (noteOffset?.x ?? 0) * pxScale;
  const noteTop = sigBottom - (noteOffset?.y ?? 72) * pxScale;

  if (loading) return <div style={{ textAlign: 'center', padding: 30, color: '#94a3b8' }}><Loader2 size={22} className="spin" /></div>;
  if (error) return <div style={{ padding: 14, background: '#fef2f2', color: '#b91c1c', borderRadius: 8, fontSize: 12 }}>{error}</div>;
  if (!doc) return null;

  return (
    <div
      ref={scrollRef}
      onScroll={evaluate}
      style={{ maxHeight: 560, overflowY: 'auto', background: '#e2e8f0', borderRadius: 8, padding: 12 }}
    >
      {Array.from({ length: doc.numPages }, (_, i) => i + 1).map((p) => (
        <div key={p} style={{ position: 'relative', marginBottom: 12, boxShadow: '0 1px 3px rgba(0,0,0,0.15)' }}>
          <PdfPageCanvas doc={doc} page={p} onSize={p === position.page ? setSize : undefined}>
            {p === position.page && (
              <>
                <div style={{
                  position: 'absolute',
                  left: `calc(${position.x}% - ${box.w / 2}px)`,
                  top: `calc(${position.y}% - ${box.h / 2}px)`,
                  width: box.w, height: box.h,
                  border: '2px solid #7c3aed', background: 'rgba(237,233,254,0.85)', borderRadius: 6,
                  display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 12px rgba(124,58,237,0.25)',
                }}>
                  <PenLine size={13} color="#7c3aed" />
                  <span style={{ fontSize: 9, fontWeight: 800, color: '#6d28d9', textTransform: 'uppercase', textAlign: 'center', padding: '0 4px', lineHeight: 1.1 }}>{signerName}</span>
                </div>
                {noteImage && size && (
                  <img
                    src={noteImage}
                    alt="mention"
                    onPointerDown={onNoteDown}
                    onPointerMove={onNoteMove}
                    onPointerUp={onNoteUp}
                    title="Faites glisser pour positionner votre mention"
                    style={{
                      position: 'absolute',
                      left: noteLeft,
                      top: noteTop,
                      height: (noteSize || 40) * pxScale,
                      width: 'auto',
                      maxWidth: Math.max(box.w, 240),
                      objectFit: 'contain',
                      cursor: 'grab',
                      touchAction: 'none',
                      border: '1px dashed #0e7490',
                      background: 'rgba(236,254,255,0.7)',
                      borderRadius: 4,
                      zIndex: 6,
                      userSelect: 'none',
                    }}
                  />
                )}
              </>
            )}
          </PdfPageCanvas>
          <div style={{ position: 'absolute', bottom: 4, right: 6, fontSize: 10, color: '#64748b', background: 'rgba(255,255,255,0.85)', borderRadius: 4, padding: '0 5px' }}>{p}/{doc.numPages}</div>
        </div>
      ))}
      <p style={{ textAlign: 'center', fontSize: 11, color: '#64748b', margin: '4px 0 0' }}>— Fin du document —</p>
    </div>
  );
}

function Center({ children }: { children: React.ReactNode }) {
  return <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: '#f8fafc', padding: 24, textAlign: 'center' }}>{children}</div>;
}

const lbl: React.CSSProperties = { display: 'block', fontSize: 12, fontWeight: 700, color: '#475569', margin: '14px 0 6px' };
const inputWrap: React.CSSProperties = { position: 'relative', display: 'flex', alignItems: 'center' };
const inputIcon: React.CSSProperties = { position: 'absolute', left: 12, color: '#94a3b8' };
const input: React.CSSProperties = { width: '100%', padding: '11px 12px 11px 38px', border: '1.5px solid #e2e8f0', borderRadius: 11, fontSize: 14, outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit' };
const btnPrimary: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 8, padding: '11px 20px', background: '#7c3aed', color: '#fff', border: 'none', borderRadius: 10, fontWeight: 800, fontSize: 13, cursor: 'pointer', marginTop: 6 };
const btnGhost: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '10px 16px', background: '#fff', color: '#475569', border: '1px solid #e2e8f0', borderRadius: 9, fontWeight: 700, fontSize: 13, cursor: 'pointer' };
