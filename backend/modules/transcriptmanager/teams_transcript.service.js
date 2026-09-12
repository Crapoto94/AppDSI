/**
 * Récupération des transcripts de réunions Teams via Microsoft Graph
 * (app-only, client_credentials — app registration configurée dans
 * /Admin/entra, azure_ad_settings, qui porte les permissions transcripts).
 *
 * Stratégie (cf. doc Microsoft « Fetch meeting transcripts & recordings ») :
 *   1. on résout l'ID AAD de l'utilisateur (GUID requis par les URLs
 *      /onlineMeetings et /transcripts ; l'email suffit pour calendarView) ;
 *   2. le calendrier de l'utilisateur courant liste les réunions où il était
 *      invité (GET /users/{email}/calendarView) ;
 *   3. chaque événement Teams porte un joinUrl → on résout l'onlineMeeting id
 *      (GET /users/{id}/onlineMeetings?$filter=JoinWebUrl eq '<url>') ;
 *   4. on liste les callTranscript de la réunion
 *      (GET /users/{id}/onlineMeetings/{meetingId}/transcripts) ;
 *   5. source complémentaire : getAllTranscripts(meetingOrganizerUserId=id)
 *      renvoie les transcripts des réunions ORGANISÉES par l'utilisateur (le
 *      calendrier ne remonte que celles où il était invité) ;
 *   6. le contenu est téléchargeable en VTT
 *      (GET .../transcripts/{id}/content avec Accept: text/vtt) — format déjà
 *      géré par parseTranscript() côté controller.
 *
 * Permissions applicatives attendues sur l'app azure_ad_settings :
 * Calendars.Read, OnlineMeetings.Read.All, OnlineMeetingTranscript.Read.All,
 * User.Read.All. Prérequis tenant Teams (PowerShell, hors de portée de l'app) :
 *  - application access policy accordée à l'app sur l'utilisateur
 *    (New-CsApplicationAccessPolicy + Grant-CsApplicationAccessPolicy) pour
 *    lire les transcripts des réunions ;
 *  - GraphAccessToTranscripts activé dans le tenant pour getAllTranscripts.
 *
 * Défensif par design : une réunion en 403 ou sans transcript ne fait jamais
 * échouer l'ensemble — chaque réunion est traitée isolément et les blocages
 * de configuration remontent en warning avec l'action attendue.
 */
const axios = require('axios');
const https = require('https');
const { HttpsProxyAgent } = require('https-proxy-agent');
const { getSqlite } = require('../../shared/database');

function getAxiosOpts() {
    const proxyUrl = process.env.HTTPS_PROXY || process.env.HTTP_PROXY || process.env.https_proxy || process.env.http_proxy || null;
    return proxyUrl
        ? { httpsAgent: new HttpsProxyAgent(proxyUrl, { rejectUnauthorized: false }), proxy: false }
        : { httpsAgent: new https.Agent({ rejectUnauthorized: false }) };
}

async function getGraphToken(settings, axiosOpts) {
    const tokenRes = await axios.post(
        `https://login.microsoftonline.com/${settings.tenant_id}/oauth2/v2.0/token`,
        new URLSearchParams({
            client_id: settings.client_id,
            client_secret: settings.client_secret,
            grant_type: 'client_credentials',
            scope: 'https://graph.microsoft.com/.default'
        }).toString(),
        { ...axiosOpts, headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    );
    return tokenRes.data.access_token;
}

const isNetworkError = (e) => ['ECONNRESET', 'ETIMEDOUT', 'ECONNABORTED', 'EAI_AGAIN', 'ENOTFOUND', 'EPIPE', 'ERR_SOCKET_CONNECTION_TIMEOUT'].includes(e?.code)
    || (e?.message && /socket hang up|network|connect/i.test(e.message));

/** Relance la promesse `fn` sur erreur réseau transitoire (proxy, coupure). */
async function retryNetwork(fn, attempts = 2) {
    let lastErr;
    for (let i = 0; i < attempts; i++) {
        try {
            return await fn();
        } catch (e) {
            lastErr = e;
            if (!isNetworkError(e)) throw e;
            if (i < attempts - 1) await new Promise(r => setTimeout(r, 800 * (i + 1)));
        }
    }
    throw lastErr;
}

/**
 * Relance `fn` sur le 403 « Graph API access to transcripts is disabled for
 * this tenant » : cette erreur est transitoire tant que la bascule tenant
 * n'est pas répliquée partout (on l'a observé : succès intermittent).
 */
async function retryTransientTenantDisabled(fn, attempts = 3, delayMs = 2000) {
    let lastErr;
    for (let i = 0; i < attempts; i++) {
        try {
            return await fn();
        } catch (e) {
            lastErr = e;
            const msg = e.response?.data?.error?.message || '';
            const status = e.response?.status;
            if (status !== 403 || !/transcripts is disabled for this tenant/i.test(msg)) throw e;
            if (i < attempts - 1) await new Promise(r => setTimeout(r, delayMs));
        }
    }
    throw lastErr;
}

// L'app pour les transcripts est celle de /Admin/entra (azure_ad_settings),
// qui porte Calendars.Read, OnlineMeetings.Read.All, OnlineMeetingTranscript.Read.All
// et User.Read.All. L'app o365_settings (collecteur mail) ne sert qu'en repli.
async function getGraphSettings() {
    const sqlite = getSqlite();
    let settings = await sqlite.get('SELECT * FROM azure_ad_settings WHERE id = 1');
    if (!settings || !settings.client_id || !settings.client_secret || !settings.tenant_id) {
        settings = await sqlite.get('SELECT * FROM o365_settings WHERE id = 1');
    }
    if (!settings || !settings.client_id || !settings.client_secret || !settings.tenant_id) {
        throw new Error('Aucune application Microsoft Graph configurée (Entra ou O365)');
    }
    return settings;
}

const escapeODataString = (v) => String(v).replace(/'/g, "''");

// Permissions Graph nécessaires sur l'app azure_ad_settings pour lire les
// transcripts de réunions Teams (mode application) :
const REQUIRED_PERMS = [
    'Calendars.Read (application)',
    'OnlineMeetings.Read.All (application)',
    'OnlineMeetingTranscript.Read.All (application)'
];

/** Aide actionnable quand Graph refuse l'accès (403 = config/premission). */
function graphAccessHint(graphMessage = '', code = '') {
    const combined = `${code || ''} ${graphMessage || ''}`;
    if (combined.includes('OnlineMeetingTranscript.Read.All') || /missing role permissions|roles on the request|Authorization_RequestDenied|ErrorAccessDenied/i.test(combined)) {
        return 'Permissions Graph manquantes sur l\'app /Admin/entra : ajouter « '
            + REQUIRED_PERMS.join(', ')
            + ' » et consentir (admin consent), puis redémarrer le backend.';
    }
    if (/application access policy/i.test(combined)) {
        return 'L\'administration Teams doit accorder une application access policy à cette app (PowerShell : New-CsApplicationAccessPolicy -AppIds <appId> puis Grant-CsApplicationAccessPolicy -User <email>).';
    }
    if (/transcripts is disabled for this tenant/i.test(combined)) {
        return 'Le tenant n\'autorise pas les transcripts via Graph (PowerShell : Set-CsMeetingConfiguration -GraphAccessToTranscripts $true).';
    }
    return null;
}

/** Date ISO UTC (format requis par calendarView / getAllTranscripts). */
const toIsoUtc = (d) => d.toISOString().replace('.000Z', 'Z');

// Cache process des IDs AAD (évite un GET /users par appel).
const aadIdCache = new Map();

/** Résout l'ID AAD (GUID) d'un utilisateur via son email (User.Read.All). */
async function resolveUserAadId(userEmail, axiosOpts, headers) {
    const key = String(userEmail).toLowerCase();
    if (aadIdCache.has(key)) return aadIdCache.get(key);
    try {
        const r = await axios.get(
            `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(userEmail)}?$select=id,userPrincipalName`,
            { ...axiosOpts, headers }
        );
        const id = r.data?.id || null;
        aadIdCache.set(key, id);
        return id;
    } catch (e) {
        console.error(`[TEAMS TRANSCRIPT] resolve AAD id failed: ${e.response?.data?.error?.message || e.message}`);
        return null;
    }
}

/**
 * Liste les transcripts disponibles pour `userEmail` (réunions où il était
 * invité, via le calendrier, complété par les réunions qu'il organise via
 * getAllTranscripts). Ne lève jamais — renvoie { ok, meetings, warnings }.
 *
 * @param {string} userEmail - email O365 de l'utilisateur connecté
 * @param {number} [days=30] - fenêtre de recherche en jours (passé)
 */
async function listTeamsTranscripts(userEmail, days = 30) {
    let settings, axiosOpts, token;
    try {
        settings = await getGraphSettings();
        axiosOpts = getAxiosOpts();
        token = await retryNetwork(() => getGraphToken(settings, axiosOpts));
    } catch (e) {
        const net = isNetworkError(e)
            ? ` (${e.code || 'connexion interrompue'})`
            : ` : ${e.message || e}`;
        return { ok: false, meetings: [], warnings: [], error: `Connexion à Microsoft impossible${net} — réessayez plus tard.` };
    }
    const headers = { Authorization: `Bearer ${token}` };

    const endDate = new Date();
    const startDate = new Date(Date.now() - (Number(days) || 30) * 86400000);

    // L'email suffit pour calendarView, mais /onlineMeetings exige un GUID.
    const aadId = await resolveUserAadId(userEmail, axiosOpts, headers);
    const userKey = aadId || userEmail;
    const warnings = [];

    let events = [];
    try {
        // Pagination OData complète : sans elle, les réunions au-delà des 50
        // premières (ex. réunions périodiques d'un simple participant) sont
        // absentes de la liste.
        let pageUrl = `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(userEmail)}/calendarView`
            + `?startDateTime=${toIsoUtc(startDate)}&endDateTime=${toIsoUtc(endDate)}`
            + `&$select=id,subject,start,end,onlineMeeting,organizer,attendees&$top=50`;
        for (let page = 0; page < 20 && pageUrl; page++) {
            const res = await retryNetwork(() => axios.get(pageUrl, { ...axiosOpts, headers }));
            events.push(...(res.data.value || []));
            pageUrl = res.data['@odata.nextLink'] || null;
        }
    } catch (e) {
        const code = e.response?.data?.error?.code || 'Erreur';
        const msg = e.response?.data?.error?.message || code;
        const hint = (e.response?.status === 403 && graphAccessHint(msg, code)) ? ` — ${graphAccessHint(msg, code)}` : '';
        return { ok: false, meetings: [], warnings, error: `Accès au calendrier impossible (${code})${hint}` };
    }

    // Résolution onlineMeetingId par joinUrl — GET /onlineMeetings n'accepte
    // que $filter=JoinWebUrl ; le filtre (l'URL de jointure contient & et #)
    // doit être encodé dans la query string.
    const withJoinUrl = events.filter(ev => ev.onlineMeeting?.joinUrl);
    const meetingByUrl = new Map();
    try {
        await Promise.all(withJoinUrl.map(async (ev) => {
            const joinUrl = ev.onlineMeeting.joinUrl;
            try {
                const filter = `JoinWebUrl eq '${escapeODataString(joinUrl)}'`;
                const r = await axios.get(
                    `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(userKey)}/onlineMeetings?$filter=${encodeURIComponent(filter)}`,
                    { ...axiosOpts, headers }
                );
                const m = (r.data.value || [])[0];
                if (m?.id) meetingByUrl.set(joinUrl, m.id);
            } catch (err) {
                if (err.response?.status === 403 && /application access policy/i.test(err.response?.data?.error?.message || '')) {
                    const hint = graphAccessHint(err.response?.data?.error?.message, err.response?.data?.error?.code);
                    if (!warnings.some(w => w.includes('application access policy'))) warnings.push(`Réunions Teams inaccessibles — ${hint}`);
                } else {
                    console.error(`[TEAMS TRANSCRIPT] resolve joinUrl failed: ${err.response?.data?.error?.message || err.message}`);
                }
            }
        }));
    } catch (e) {
        console.error(`[TEAMS TRANSCRIPT] resolve batch failed: ${e.message}`);
    }

    // Classification de CHAQUE réunion du calendrier en 3 états :
    //   - meetings     : transcript récupérable (import possible)
    //   - inaccessible : transcript présent mais hébergé sur un autre tenant (403)
    //   - noTranscript : aucun transcript disponible
    const meetings = [];
    const inaccessible = [];
    const noTranscript = [];

    const baseFromEvent = (ev) => ({
        subject: ev.subject || 'Réunion Teams',
        startDateTime: ev.start?.dateTime || null,
        organizer: ev.organizer?.emailAddress?.name || ev.organizer?.emailAddress?.address || null,
        participants: (ev.attendees || [])
            .map(a => a.emailAddress?.name || a.emailAddress?.address || '')
            .filter(Boolean),
        // Emails des invités : stockés à l'import pour que tous les
        // participants (y compris via le Magasin d'applications) voient le
        // transcript importé par l'un d'eux.
        participantEmails: (ev.attendees || [])
            .map(a => (a.emailAddress?.address || '').toLowerCase().trim())
            .filter(e => e.includes('@')),
    });

    // Réunions périodiques : toutes les occurrences partagent le même
    // onlineMeeting.id et /transcripts renvoie TOUS les transcripts de la série.
    // Sans cache + dédoublonnage, chaque occurrence ré-ajouterait les mêmes
    // transcripts (N occurrences × M transcripts).
    const transcriptsCache = new Map(); // meetingId -> liste des transcripts
    const seenTranscriptIds = new Set();
    const seenNoTranscriptKeys = new Set();

    for (const ev of events) {
        const joinUrl = ev.onlineMeeting?.joinUrl;
        const base = baseFromEvent(ev);

        // Réunion non Teams (pas de lien de jointure) → aucun transcript.
        if (!joinUrl) {
            noTranscript.push({ ...base, reason: 'Aucune réunion Teams (pas de lien de jointure)' });
            continue;
        }

        const meetingId = meetingByUrl.get(joinUrl);
        if (!meetingId) {
            noTranscript.push({ ...base, reason: 'Transcript indisponible pour cette réunion' });
            continue;
        }

        try {
            let list;
            if (transcriptsCache.has(meetingId)) {
                list = transcriptsCache.get(meetingId);
            } else {
                const r = await axios.get(
                    `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(userKey)}/onlineMeetings/${encodeURIComponent(meetingId)}/transcripts`,
                    { ...axiosOpts, headers }
                );
                // Graph renvoie TOUS les transcripts de la série (réunions
                // périodiques), y compris ceux hors fenêtre : on ne conserve que
                // ceux dont l'occurrence tombe dans la plage demandée.
                list = (r.data.value || []).filter(t => {
                    const dt = t.createdDateTime ? new Date(t.createdDateTime) : null;
                    return !dt || (dt >= startDate && dt <= endDate);
                });
                transcriptsCache.set(meetingId, list);
            }
            if (list.length === 0) {
                if (!seenNoTranscriptKeys.has(meetingId)) {
                    seenNoTranscriptKeys.add(meetingId);
                    noTranscript.push({ ...base, meetingId, reason: 'Aucun transcript pour cette réunion' });
                }
            } else {
                for (const t of list) {
                    if (seenTranscriptIds.has(t.id)) continue; // évite les doublons de récurrence
                    seenTranscriptIds.add(t.id);
                    meetings.push({
                        ...base,
                        meetingId,
                        transcriptId: t.id,
                        startDateTime: t.createdDateTime || base.startDateTime,
                        createdDateTime: t.createdDateTime || null,
                        transcriptContentUrl: t.transcriptContentUrl || null,
                    });
                }
            }
        } catch (err) {
            if (err.response?.status === 403) {
                // Transcript non accessible depuis notre app : réunion très
                // probablement organisée dans un autre tenant (le transcript est
                // stocké côté organisateur — Graph ne le rend jamais accessible).
                // À défaut d'import Graph, il faut un export VTT de l'organisateur.
                if (!inaccessible.some(m => m.meetingId === meetingId)) {
                    inaccessible.push({
                        ...base,
                        meetingId,
                        reason: "Transcript hébergé sur un autre tenant — demandez le fichier VTT à l'organisateur de la réunion",
                    });
                }
            } else {
                noTranscript.push({ ...base, meetingId, reason: 'Transcript non disponible' });
                console.error(`[TEAMS TRANSCRIPT] list transcripts failed: ${err.response?.data?.error?.message || err.message}`);
            }
        }
    }

    // Source complémentaire : réunions organisées par l'utilisateur.
    // NB : « Graph API access to transcripts is disabled for this tenant »
    // revient en 403 transitoire tant que la bascule Teams Admin Center ne
    // s'est pas propagée à toutes les régions — on réessaie quelques fois.
    if (aadId) {
        const url = `https://graph.microsoft.com/v1.0/users/${aadId}/onlineMeetings/getAllTranscripts(meetingOrganizerUserId='${aadId}', startDateTime=${toIsoUtc(startDate)}, endDateTime=${toIsoUtc(endDate)})`;
        try {
            // Suivi de la pagination OData (@odata.nextLink) pour couvrir
            // réellement toute la fenêtre glissante des N derniers jours.
            const transcripts = [];
            let pageUrl = url;
            for (let page = 0; page < 20 && pageUrl; page++) {
                const r = await retryTransientTenantDisabled(() => axios.get(pageUrl, { ...axiosOpts, headers }));
                transcripts.push(...(r.data.value || []));
                pageUrl = r.data['@odata.nextLink'] || null;
            }
            const organized = transcripts.filter(t => {
                const dt = t.createdDateTime ? new Date(t.createdDateTime) : null;
                if (dt && (dt < startDate || dt > endDate)) return false;
                return !meetings.some(m => m.transcriptId === t.id || (m.meetingId === t.meetingId && m.createdDateTime === t.createdDateTime));
            });
            // getAllTranscripts ne renvoie ni le sujet ni la date d'occurrence.
            // On complète avec le détail de la réunion (sujet) et on utilise
            // createdDateTime comme date réelle d'occurrence.
            await Promise.allSettled(organized.map(async (t) => {
                let subject = null;
                let meetingStart = null;
                let participants = [];
                if (t.meetingId) {
                    try {
                        const m = await axios.get(
                            `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(aadId)}/onlineMeetings/${encodeURIComponent(t.meetingId)}?$select=subject,startDateTime,participants`,
                            { ...axiosOpts, headers }
                        );
                        subject = m.data?.subject || null;
                        meetingStart = m.data?.startDateTime || null;
                        // Les réunions périodiques/organisées n'exposent pas
                        // d'attendees via le calendrier : on les récupère sur
                        // l'onlineMeeting (participants.attendees).
                        participants = (m.data?.participants?.attendees || [])
                            .map(a => a.identity?.user?.displayName || a.identity?.user?.id || '')
                            .filter(Boolean);
                    } catch (err) {
                        console.error(`[TEAMS TRANSCRIPT] meeting detail failed: ${err.response?.data?.error?.message || err.message}`);
                    }
                }
                meetings.push({
                    meetingId: t.meetingId,
                    transcriptId: t.id,
                    subject: (subject && subject !== 'Group chat') ? subject : 'Réunion Teams (organisée par vous)',
                    startDateTime: t.createdDateTime || meetingStart || null,
                    createdDateTime: t.createdDateTime || null,
                    organizer: null,
                    participants,
                    transcriptContentUrl: t.transcriptContentUrl || null
                });
            }));
        } catch (err) {
            if (err.response?.status === 403) {
                const hint = graphAccessHint(err.response?.data?.error?.message, err.response?.data?.error?.code) || 'Vérifier la configuration tenant Teams';
                if (!warnings.some(w => w.includes('Graph'))) warnings.push(`Réunions organisées — ${hint}`);
            } else {
                console.error(`[TEAMS TRANSCRIPT] getAllTranscripts failed: ${err.response?.data?.error?.message || err.message}`);
            }
        }
    }

    // Tri strictement par date décroissante pour les 3 catégories.
    const byDateDesc = (a, b) => (b.startDateTime || b.createdDateTime || '').localeCompare(a.startDateTime || a.createdDateTime || '');
    meetings.sort(byDateDesc);
    inaccessible.sort(byDateDesc);
    noTranscript.sort(byDateDesc);
    return { ok: true, meetings, warnings, inaccessible, noTranscript };
}

/**
 * Télécharge le contenu d'un transcript Graph, en VTT si possible (intervenants
 * nommés) avec repli sur le format non attribué si le tenant refuse le VTT.
 *
 * @param {string} userEmail
 * @param {string} meetingId
 * @param {string} transcriptId
 * @param {string} [transcriptContentUrl] - URL de contenu fournie par Graph
 *        (getAllTranscripts) — permet d'éviter de reconstruire l'URL.
 * @returns {Promise<string>} contenu brut du transcript
 */
async function fetchTranscriptContent(userEmail, meetingId, transcriptId, transcriptContentUrl) {
    const settings = await getGraphSettings();
    const axiosOpts = getAxiosOpts();
    const token = await retryNetwork(() => getGraphToken(settings, axiosOpts));
    const headers = { Authorization: `Bearer ${token}` };
    const url = transcriptContentUrl
        || `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(userEmail)}/onlineMeetings/${encodeURIComponent(meetingId)}/transcripts/${encodeURIComponent(transcriptId)}/content`;

    // Demande d'abord le VTT avec attribution des intervenants.
    try {
        const res = await axios.get(url, {
            ...axiosOpts,
            headers: { ...headers, Accept: 'text/vtt' },
            responseType: 'text'
        });
        return typeof res.data === 'string' ? res.data : JSON.stringify(res.data);
    } catch (e) {
        // Tenant sans attribution des intervenants : le VTT est refusé (403
        // SpeakerAttributionNotAllowed) → repli sur le format non attribué.
        const msg = e.response?.data?.error?.message || '';
        const code = e.response?.data?.error?.code || '';
        if (e.response?.status !== 403 || !/SpeakerAttribution|attribution/i.test(`${code} ${msg}`)) throw e;
        const res = await axios.get(url, {
            ...axiosOpts,
            headers: { ...headers, Accept: 'application/vnd.microsoft.graph.transcript+text' },
            responseType: 'text'
        });
        return typeof res.data === 'string' ? res.data : JSON.stringify(res.data);
    }
}

module.exports = { listTeamsTranscripts, fetchTranscriptContent };