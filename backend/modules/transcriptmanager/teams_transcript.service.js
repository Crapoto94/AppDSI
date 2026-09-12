/**
 * Récupération des transcripts de réunions Teams via Microsoft Graph
 * (app-only, client_credentials — app registration de la « Messagerie O365 »,
 * o365_settings, sur laquelle les permissions transcripts sont configurées).
 *
 * Stratégie (cf. doc Microsoft « Fetch meeting transcripts & recordings ») :
 *   1. le calendrier de l'utilisateur courant liste les réunions où il était
 *      invité (GET /users/{email}/calendarView) ;
 *   2. chaque événement Teams porte un joinUrl → on résout l'onlineMeeting id
 *      (GET /users/{email}/onlineMeetings?$filter=JoinWebUrl eq '<url>') ;
 *   3. on liste les callTranscript de la réunion
 *      (GET /users/{email}/onlineMeetings/{id}/transcripts) ;
 *   4. le contenu est téléchargeable en VTT
 *      (GET .../transcripts/{id}/content avec Accept: text/vtt) — format déjà
 *      géré par parseTranscript() côté controller.
 *
 * Permissions applicatives attendues sur l'app o365_settings :
 * Calendars.Read, OnlineMeetings.Read.All, OnlineMeetingTranscript.Read.All
 * (+ éventuellement une application access policy accordée par l'admin pour
 * les artifacts de réunion).
 *
 * Défensif par design : une réunion cross-tenant (403) ou sans transcript ne
 * fait jamais échouer l'ensemble — chaque réunion est traitée isolément.
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

// Récupère l'app Graph : O365 en priorité (collecteur mail / « Messagerie O365 »,
// c'est sur cette app registration que les permissions transcripts Teams
// (OnlineMeetingTranscript.Read.All, OnlineMeetings.Read.All, Calendars.Read)
// sont configurées), repli sur Azure AD.
async function getGraphSettings() {
    const sqlite = getSqlite();
    let settings = await sqlite.get('SELECT * FROM o365_settings WHERE id = 1');
    if (!settings || !settings.is_enabled || !settings.client_id || !settings.client_secret || !settings.tenant_id) {
        settings = await sqlite.get('SELECT * FROM azure_ad_settings WHERE id = 1');
    }
    if (!settings || !settings.client_id || !settings.client_secret || !settings.tenant_id) {
        throw new Error('Aucune application Microsoft Graph configurée (O365 ou Azure AD)');
    }
    return settings;
}

const escapeODataString = (v) => String(v).replace(/'/g, "''");

/** Date ISO UTC (format requis par calendarView / getAllTranscripts). */
const toIsoUtc = (d) => d.toISOString().replace('.000Z', 'Z');

/**
 * Liste les dernières réunions Teams (calendrier de `userEmail`) disposant d'un
 * transcript Graph. Ne lève jamais — renvoie { ok, meetings, warnings, error }.
 *
 * @param {string} userEmail - email O365 de l'utilisateur connecté
 * @param {number} [days=30] - fenêtre de recherche en jours (passé)
 */
async function listTeamsTranscripts(userEmail, days = 30) {
    const settings = await getGraphSettings();
    const axiosOpts = getAxiosOpts();
    const token = await getGraphToken(settings, axiosOpts);
    const headers = { Authorization: `Bearer ${token}` };

    const endDate = new Date();
    const startDate = new Date(Date.now() - (Number(days) || 30) * 86400000);

    const url = `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(userEmail)}/calendarView`
        + `?startDateTime=${toIsoUtc(startDate)}&endDateTime=${toIsoUtc(endDate)}`
        + `&$select=id,subject,start,end,onlineMeeting,organizer&$top=50`;

    let events;
    try {
        const res = await axios.get(url, { ...axiosOpts, headers });
        events = res.data.value || [];
    } catch (e) {
        const msg = e.response?.data?.error?.code || e.response?.data?.error?.message || e.message;
        return { ok: false, meetings: [], warnings: [], error: `Accès au calendrier impossible (${msg})` };
    }

    // Résolution onlineMeetingId par joinUrl : GET /onlineMeetings n'accepte
    // que $filter=JoinWebUrl — on ne le fait que pour les événements Teams,
    // en parallèle par petites rafales.
    const withJoinUrl = events.filter(ev => ev.onlineMeeting?.joinUrl);
    const meetingByUrl = new Map();

    const resolveAll = async () => {
        for (let i = 0; i < withJoinUrl.length; i += 5) {
            const batch = withJoinUrl.slice(i, i + 5);
            await Promise.all(batch.map(async (ev) => {
                const joinUrl = ev.onlineMeeting.joinUrl;
                try {
                    const r = await axios.get(
                        `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(userEmail)}/onlineMeetings?$filter=JoinWebUrl eq '${escapeODataString(joinUrl)}'`,
                        { ...axiosOpts, headers }
                    );
                    const m = (r.data.value || [])[0];
                    if (m?.id) meetingByUrl.set(joinUrl, m.id);
                } catch (err) {
                    // 403 attendu pour les réunions cross-tenant ou si la
                    // permission OnlineMeetings.Read.All / access policy manque
                    console.error(`[TEAMS TRANSCRIPT] resolve joinUrl failed: ${err.response?.data?.error?.message || err.message}`);
                }
            }));
        }
    };
    await resolveAll();

    // Pour chaque réunion résolue, on liste les transcripts disponibles.
    const meetings = [];
    const warnings = [];
    for (const ev of withJoinUrl) {
        const meetingId = meetingByUrl.get(ev.onlineMeeting.joinUrl);
        if (!meetingId) continue;
        try {
            const r = await axios.get(
                `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(userEmail)}/onlineMeetings/${encodeURIComponent(meetingId)}/transcripts`,
                { ...axiosOpts, headers }
            );
            for (const t of r.data.value || []) {
                meetings.push({
                    meetingId,
                    transcriptId: t.id,
                    subject: ev.subject || 'Réunion Teams',
                    startDateTime: ev.start?.dateTime || null,
                    createdDateTime: t.createdDateTime || null,
                    organizer: ev.organizer?.emailAddress?.name || ev.organizer?.emailAddress?.address || null,
                    transcriptContentUrl: t.transcriptContentUrl || null
                });
            }
        } catch (err) {
            // 403 = transcript indisponible pour le compte app (permission
            // OnlineMeetingTranscript.Read.All ou access policy manquante)
            if (err.response?.status === 403) {
                warnings.push(`Transcripts de « ${ev.subject || 'réunion'} » inaccessibles (permission Graph) : ${err.response?.data?.error?.message || '403'}`);
            } else {
                console.error(`[TEAMS TRANSCRIPT] list transcripts failed: ${err.response?.data?.error?.message || err.message}`);
            }
        }
    }

    meetings.sort((a, b) => (b.startDateTime || b.createdDateTime || '').localeCompare(a.startDateTime || a.createdDateTime || ''));
    return { ok: true, meetings, warnings };
}

/**
 * Télécharge le contenu VTT d'un transcript Graph.
 * @param {string} userEmail
 * @param {string} meetingId
 * @param {string} transcriptId
 * @returns {Promise<string>} contenu VTT brut
 */
async function fetchTranscriptContent(userEmail, meetingId, transcriptId) {
    const settings = await getGraphSettings();
    const axiosOpts = getAxiosOpts();
    const token = await getGraphToken(settings, axiosOpts);
    const res = await axios.get(
        `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(userEmail)}/onlineMeetings/${encodeURIComponent(meetingId)}/transcripts/${encodeURIComponent(transcriptId)}/content`,
        { ...axiosOpts, headers: { Authorization: `Bearer ${token}`, Accept: 'text/vtt' }, responseType: 'text' }
    );
    return typeof res.data === 'string' ? res.data : JSON.stringify(res.data);
}

module.exports = { listTeamsTranscripts, fetchTranscriptContent };