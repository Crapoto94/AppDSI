const axios = require('axios');
const https = require('https');
const { HttpsProxyAgent } = require('https-proxy-agent');
const { getSqlite } = require('../../shared/database');

// Crée un évènement Outlook (calendrier O365) dans la boîte de l'utilisateur connecté,
// en utilisant les mêmes identifiants Graph que le collecteur mail (table o365_settings).

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

// Récupère l'app Graph : Azure AD en priorité (Calendars.ReadWrite), repli sur O365 (collecteur mail).
async function getGraphSettings() {
    const sqlite = getSqlite();
    let settings = await sqlite.get('SELECT * FROM azure_ad_settings WHERE id = 1');
    if (!settings || !settings.is_enabled || !settings.client_id || !settings.client_secret || !settings.tenant_id) {
        settings = await sqlite.get('SELECT * FROM o365_settings WHERE id = 1');
    }
    if (!settings || !settings.client_id || !settings.client_secret || !settings.tenant_id) {
        throw new Error('Aucune application Microsoft Graph configurée (Azure AD ou O365)');
    }
    return settings;
}

// Renvoie les composants horaires (heure de Paris) d'une date.
function parisParts(date = new Date()) {
    const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false });
    const p = fmt.formatToParts(date).reduce((a, x) => { a[x.type] = x.value; return a; }, {});
    return { y: +p.year, mo: +p.month, d: +p.day, h: (+p.hour) % 24, mi: +p.minute };
}

const pad2 = (n) => String(n).padStart(2, '0');
const minToHM = (m) => `${pad2(Math.floor(m / 60))}:${pad2(m % 60)}`;

/**
 * Cherche les prochains créneaux communs à plusieurs participants, en indiquant
 * pour chacun le nombre de participants disponibles (et la liste des indisponibles).
 * @param {Object} opts
 * @param {string} opts.organizerEmail - boîte utilisée pour interroger getSchedule
 * @param {string} [opts.organizerName]
 * @param {Array<{email:string,name?:string}>} [opts.participants] - participants (email + nom)
 * @param {string[]} [opts.emails] - alternative : simples emails
 * @param {number} opts.durationMinutes
 * @param {boolean} [opts.afterHours] - étend la plage à 08:00-19:00
 * @param {number} [opts.count] - nombre de créneaux à renvoyer (défaut 5)
 * @returns {Promise<Array<{start:string,end:string,label:string,available:number,total:number,unavailable:string[]}>>}
 */
async function findCommonSlots(opts) {
    const { organizerEmail, organizerName, participants, emails, durationMinutes, afterHours, count = 5 } = opts;
    const duration = Number(durationMinutes) || 60;

    // Liste unique des personnes à interroger (organisateur + participants), avec leur nom
    const people = [];
    const seen = new Set();
    const pushPerson = (email, name) => {
        const addr = (email || '').trim();
        if (!addr || !addr.includes('@')) return;
        const low = addr.toLowerCase();
        if (seen.has(low)) return;
        seen.add(low);
        people.push({ email: addr, name: name || addr });
    };
    pushPerson(organizerEmail, organizerName || 'Organisateur');
    if (Array.isArray(participants)) for (const p of participants) pushPerson(p.email, p.name);
    if (Array.isArray(emails)) for (const e of emails) pushPerson(e, null);
    if (people.length === 0) throw new Error('Aucune adresse email valide pour la recherche de créneaux');

    const schedules = people.map(p => p.email);

    const settings = await getGraphSettings();
    const axiosOpts = getAxiosOpts();
    const token = await getGraphToken(settings, axiosOpts);

    const INTERVAL = 15;               // granularité getSchedule (minutes)
    const DAY_START = 8 * 60;          // 08:00 → base de l'availabilityView
    const DAY_END = 19 * 60;           // 19:00
    const cellsNeeded = Math.ceil(duration / INTERVAL);

    // Fenêtres ouvrées (minutes depuis minuit), selon le jour (dow: 1=lun..5=ven)
    // Normales : 08:30-12:00 et 13:30-17:30 (vendredi après-midi jusqu'à 17:00).
    // Hors heures ouvrées : 08:00-19:00.
    const getWindows = (dow) => afterHours
        ? [[8 * 60, 19 * 60]]
        : [[8 * 60 + 30, 12 * 60], [13 * 60 + 30, dow === 5 ? 17 * 60 : 17 * 60 + 30]];

    const now = parisParts();
    const nowDayKey = `${now.y}-${pad2(now.mo)}-${pad2(now.d)}`;
    const nowMin = now.h * 60 + now.mi;

    const anchor = Date.UTC(now.y, now.mo - 1, now.d, 12, 0, 0);
    const fullSlots = [];     // tout le monde dispo
    const partialSlots = [];  // certains indisponibles (fallback)

    for (let i = 0; i < 30 && fullSlots.length < count; i++) {
        const dt = new Date(anchor + i * 86400000);
        const dow = dt.getUTCDay();
        if (dow === 0 || dow === 6) continue;
        const Y = dt.getUTCFullYear(), Mo = dt.getUTCMonth() + 1, D = dt.getUTCDate();
        const dayKey = `${Y}-${pad2(Mo)}-${pad2(D)}`;

        // availabilityView par personne (index aligné sur `people`). '' => boîte sans données.
        let views;
        try {
            const res = await axios.post(
                `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(organizerEmail)}/calendar/getSchedule`,
                {
                    schedules,
                    startTime: { dateTime: `${dayKey}T${minToHM(DAY_START)}:00`, timeZone: 'Europe/Paris' },
                    endTime: { dateTime: `${dayKey}T${minToHM(DAY_END)}:00`, timeZone: 'Europe/Paris' },
                    availabilityViewInterval: INTERVAL
                },
                { ...axiosOpts, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } }
            );
            const value = res.data.value || [];
            views = people.map((_, k) => (value[k] && value[k].availabilityView) || '');
        } catch (e) {
            throw new Error(e.response?.data?.error?.message || e.message);
        }

        // Évalue la dispo d'un créneau : renvoie {total, available, unavailable[]}
        // total = nb de personnes avec des données free/busy (les externes sans données sont exclus).
        const evaluate = (startMin) => {
            const idx = (startMin - DAY_START) / INTERVAL;
            let total = 0, available = 0;
            const unavailable = [];
            for (let k = 0; k < people.length; k++) {
                const av = views[k];
                if (!av) continue; // pas de données (externe) → non comptabilisé
                total++;
                let free = true;
                for (let c = 0; c < cellsNeeded; c++) {
                    const ch = av[idx + c];
                    if (ch === undefined || ch !== '0') { free = false; break; }
                }
                if (free) available++; else unavailable.push(people[k].name);
            }
            return { total, available, unavailable };
        };

        for (const [wStart, wEnd] of getWindows(dow)) {
            let startMin = wStart;
            while (startMin + duration <= wEnd && fullSlots.length < count) {
                if (dayKey === nowDayKey && startMin <= nowMin + 5) { startMin += INTERVAL; continue; }
                const idx = (startMin - DAY_START) / INTERVAL;
                if (!Number.isInteger(idx) || idx < 0) { startMin += INTERVAL; continue; }
                const { total, available, unavailable } = evaluate(startMin);
                if (total === 0) { startMin += INTERVAL; continue; }
                const endMin = startMin + duration;
                const slot = {
                    start: `${dayKey}T${minToHM(startMin)}`,
                    end: `${dayKey}T${minToHM(endMin)}`,
                    label: `${dt.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })} ${minToHM(startMin)} – ${minToHM(endMin)}`,
                    available, total, unavailable
                };
                if (available === total) {
                    fullSlots.push(slot);
                    startMin += cellsNeeded * INTERVAL; // pas de chevauchement
                } else {
                    // On ne garde qu'au plus 1 créneau partiel par fenêtre (le meilleur)
                    partialSlots.push(slot);
                    startMin += cellsNeeded * INTERVAL;
                }
            }
        }
    }

    // Priorité aux créneaux où tout le monde est dispo ; complète avec les meilleurs partiels.
    if (fullSlots.length >= count) return fullSlots.slice(0, count);
    partialSlots.sort((a, b) => (b.available - a.available) || (a.start < b.start ? -1 : 1));
    return [...fullSlots, ...partialSlots].slice(0, count);
}

// Calcule start/end au format local "YYYY-MM-DDTHH:mm:ss" (sans conversion de fuseau).
// Accepte soit une chaîne datetime-local ("2026-06-07T13:30"), soit un objet Date
// (cas d'une lecture depuis PostgreSQL : TIMESTAMP renvoyé comme Date par node-postgres).
function buildStartEnd(dateReunion, dureeMinutes) {
    const pad = (n) => String(n).padStart(2, '0');
    let Y, Mo, D, H, Mi, Se;

    if (dateReunion instanceof Date && !isNaN(dateReunion.getTime())) {
        // Composants en heure locale du process (le TIMESTAMP sans fuseau est lu en local → mur d'horloge conservé)
        Y = dateReunion.getFullYear(); Mo = dateReunion.getMonth() + 1; D = dateReunion.getDate();
        H = dateReunion.getHours(); Mi = dateReunion.getMinutes(); Se = dateReunion.getSeconds();
    } else {
        const s = String(dateReunion).replace(' ', 'T');
        const m = s.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?/);
        if (!m) return null;
        Y = +m[1]; Mo = +m[2]; D = +m[3]; H = +m[4]; Mi = +m[5]; Se = +(m[6] || 0);
    }

    const startStr = `${Y}-${pad(Mo)}-${pad(D)}T${pad(H)}:${pad(Mi)}:${pad(Se)}`;
    // Arithmétique sur les champs UTC pour éviter tout décalage de fuseau
    const base = new Date(Date.UTC(Y, Mo - 1, D, H, Mi, Se));
    base.setUTCMinutes(base.getUTCMinutes() + (Number(dureeMinutes) || 60));
    const endStr = `${base.getUTCFullYear()}-${pad(base.getUTCMonth() + 1)}-${pad(base.getUTCDate())}T${pad(base.getUTCHours())}:${pad(base.getUTCMinutes())}:${pad(base.getUTCSeconds())}`;
    return { startStr, endStr };
}

/**
 * Crée l'évènement Outlook.
 * @param {Object} opts
 * @param {string} opts.organizerEmail - email O365 de l'utilisateur connecté (boîte cible)
 * @param {string} opts.titre
 * @param {string} opts.dateReunion - datetime local (ex: 2026-06-06T14:30)
 * @param {number} opts.dureeMinutes
 * @param {string} opts.ordreDuJour - HTML (corps de l'évènement)
 * @param {string} [opts.lieu]
 * @param {Array<{email:string,name?:string,optional?:boolean}>} opts.attendees
 * @returns {Promise<{id:string, webLink:string}>}
 */
async function createOutlookEvent(opts) {
    const { organizerEmail, titre, dateReunion, dureeMinutes, ordreDuJour, lieu, attendees, isTeams, attachments } = opts;

    if (!organizerEmail || !organizerEmail.includes('@')) {
        throw new Error("Aucune adresse email O365 trouvée pour l'utilisateur connecté");
    }

    const settings = await getGraphSettings();

    const times = buildStartEnd(dateReunion, dureeMinutes);
    if (!times) throw new Error('Date de réunion invalide');

    const axiosOpts = getAxiosOpts();
    const token = await getGraphToken(settings, axiosOpts);

    const uniqueAttendees = [];
    const seen = new Set();
    for (const a of (attendees || [])) {
        const email = (a.email || '').trim().toLowerCase();
        if (!email || !email.includes('@') || email === organizerEmail.toLowerCase()) continue;
        if (seen.has(email)) continue;
        seen.add(email);
        uniqueAttendees.push({
            emailAddress: { address: a.email, name: a.name || a.email },
            type: a.optional ? 'optional' : 'required'
        });
    }

    const eventBody = {
        subject: titre,
        body: { contentType: 'HTML', content: ordreDuJour || '' },
        start: { dateTime: times.startStr, timeZone: 'Europe/Paris' },
        end: { dateTime: times.endStr, timeZone: 'Europe/Paris' },
        attendees: uniqueAttendees
    };
    if (lieu) eventBody.location = { displayName: lieu };
    if (isTeams) {
        eventBody.isOnlineMeeting = true;
        eventBody.onlineMeetingProvider = 'teamsForBusiness';
    }

    const res = await axios.post(
        `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(organizerEmail)}/events`,
        eventBody,
        { ...axiosOpts, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } }
    );

    const eventId = res.data.id;

    // Pièces jointes : Graph IGNORE les attachments inclus dans le POST de création d'évènement.
    // Il faut les ajouter ensuite, un par un, sur /events/{id}/attachments (fileAttachment < 3 Mo).
    let attachedCount = 0;
    if (Array.isArray(attachments) && attachments.length > 0 && eventId) {
        const MAX_FILE = 3 * 1024 * 1024;
        for (const a of attachments) {
            if (!a || !a.contentBytes) continue;
            const size = a.size || Math.floor((a.contentBytes.length * 3) / 4);
            if (size > MAX_FILE) {
                console.warn(`[REUNION] PJ "${a.name}" non jointe (taille ${Math.round(size / 1024)} Ko > 3 Mo)`);
                continue;
            }
            try {
                await axios.post(
                    `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(organizerEmail)}/events/${encodeURIComponent(eventId)}/attachments`,
                    {
                        '@odata.type': '#microsoft.graph.fileAttachment',
                        name: a.name || 'fichier',
                        contentType: a.contentType || 'application/octet-stream',
                        contentBytes: a.contentBytes
                    },
                    { ...axiosOpts, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } }
                );
                attachedCount++;
            } catch (e) {
                console.error(`[REUNION] Échec ajout PJ "${a.name}" à l'évènement Outlook:`, e.response?.data?.error?.message || e.message);
            }
        }
    }

    return {
        id: eventId,
        webLink: res.data.webLink,
        teamsJoinUrl: res.data.onlineMeeting?.joinUrl || null,
        attachedCount
    };
}

/**
 * Met à jour un évènement Outlook existant (date/heure/lieu).
 * @param {Object} opts
 * @param {string} opts.organizerEmail
 * @param {string} opts.eventId
 * @param {string} opts.dateReunion
 * @param {number} opts.dureeMinutes
 * @param {string} [opts.lieu]
 */
async function updateOutlookEvent(opts) {
    const { organizerEmail, eventId, dateReunion, dureeMinutes, lieu } = opts;
    if (!organizerEmail || !organizerEmail.includes('@')) throw new Error('Email organisateur manquant');
    if (!eventId) throw new Error('Identifiant évènement Outlook manquant');

    const settings = await getGraphSettings();
    const times = buildStartEnd(dateReunion, dureeMinutes);
    if (!times) throw new Error('Date de réunion invalide');

    const axiosOpts = getAxiosOpts();
    const token = await getGraphToken(settings, axiosOpts);

    const patchBody = {
        start: { dateTime: times.startStr, timeZone: 'Europe/Paris' },
        end: { dateTime: times.endStr, timeZone: 'Europe/Paris' }
    };
    if (lieu !== undefined) patchBody.location = { displayName: lieu || '' };

    const res = await axios.patch(
        `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(organizerEmail)}/events/${encodeURIComponent(eventId)}`,
        patchBody,
        { ...axiosOpts, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } }
    );

    return { id: res.data.id, webLink: res.data.webLink };
}

module.exports = { createOutlookEvent, updateOutlookEvent, buildStartEnd, findCommonSlots };
