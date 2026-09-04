/**
 * Microsoft Graph (app-only, client_credentials) — vérification O365/Entra ID
 * en repli quand un objet est absent de l'AD on-prem (cf. ad_helper.js pour
 * la voie LDAP, source primaire ; ce module ne sert que de filet pour les
 * objets créés directement dans le cloud, jamais synchronisés on-prem).
 *
 * Config : SQLite azure_ad_settings (id=1) — même app registration que
 * mail_collector/rh/copieurs (scope 'https://graph.microsoft.com/.default').
 *
 * IMPORTANT — deux limites structurelles, pas des bugs :
 *  1. Cette app n'a PAS la permission Group.Read.All (vérifié empiriquement :
 *     403 Authorization_RequestDenied sur /groups). Sans elle, impossible de
 *     confirmer/lister les listes de diffusion ou de sécurité via Graph — il
 *     faut qu'un admin Entra ajoute cette permission applicative + donne le
 *     consentement admin (Azure Portal > Entra ID > App registrations >
 *     [cette app] > API permissions > Add > Microsoft Graph > Application
 *     permissions > Group.Read.All > Grant admin consent).
 *  2. Microsoft Graph n'expose PAS les délégués "Accès total" d'une boîte
 *     partagée, quelle que soit la permission accordée — c'est un concept
 *     Exchange (mailbox permissions), pas Entra ID/Graph. Seule l'API
 *     Exchange Online PowerShell (Get-EXOMailboxPermission, auth par
 *     certificat + rôle Exchange Administrator) le permettrait — intégration
 *     distincte, non mise en place ici. On peut seulement CONFIRMER que la
 *     boîte existe dans le cloud, pas lister ses membres.
 */
const axios = require('axios');

async function getGraphToken(settings) {
    const tokenRes = await axios.post(
        `https://login.microsoftonline.com/${settings.tenant_id}/oauth2/v2.0/token`,
        new URLSearchParams({
            client_id: settings.client_id,
            client_secret: settings.client_secret,
            grant_type: 'client_credentials',
            scope: 'https://graph.microsoft.com/.default',
        }).toString(),
        { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    );
    return tokenRes.data.access_token;
}

function escapeODataString(v) {
    return String(v).replace(/'/g, "''");
}

/**
 * Vérifie l'existence d'un destinataire (boîte partagée ou groupe) dans
 * O365/Entra ID par son adresse mail. Ne lève jamais — renvoie toujours un
 * statut exploitable, y compris en cas d'échec réseau/permission.
 *
 * Renvoie :
 *   { status: 'user_found',   displayName, graphId }
 *   { status: 'group_found',  displayName, graphId, members: [{displayName,email}] }  (si Group.Read.All dispo)
 *   { status: 'group_found',  displayName: null, graphId: null, permissionDenied: true } (groupe potentiel, non vérifiable)
 *   { status: 'not_found' }
 *   { status: 'error', error: '...' }
 */
async function checkO365Existence(email, azureSettings) {
    if (!azureSettings || !azureSettings.is_enabled || !azureSettings.client_id || !azureSettings.client_secret || !azureSettings.tenant_id) {
        return { status: 'error', error: 'Azure AD (Graph) non configuré' };
    }
    try {
        const token = await getGraphToken(azureSettings);
        const headers = { Authorization: `Bearer ${token}` };
        const esc = escapeODataString(email);

        // 1. Boîte partagée = objet "user" dans Entra ID (permission déjà
        // accordée : User.Read.All).
        try {
            const r = await axios.get(
                `https://graph.microsoft.com/v1.0/users?$filter=mail eq '${esc}' or userPrincipalName eq '${esc}'`,
                { headers }
            );
            const found = (r.data.value || [])[0];
            if (found) return { status: 'user_found', displayName: found.displayName || null, graphId: found.id };
        } catch (e) {
            if (e.response?.status !== 404) {
                console.error('[GRAPH] users lookup failed:', e.response?.data?.error?.message || e.message);
            }
        }

        // 2. Liste de diffusion / groupe de sécurité = objet "group".
        // Nécessite Group.Read.All, absente aujourd'hui (403 attendu).
        try {
            const r = await axios.get(
                `https://graph.microsoft.com/v1.0/groups?$filter=mail eq '${esc}'`,
                { headers }
            );
            const found = (r.data.value || [])[0];
            if (found) {
                const members = await listGraphGroupMembers(found.id, token).catch((e) => {
                    console.error('[GRAPH] group members fetch failed:', e.message);
                    return [];
                });
                return { status: 'group_found', displayName: found.displayName || null, graphId: found.id, members };
            }
        } catch (e) {
            if (e.response?.status === 403) {
                return { status: 'group_found', displayName: null, graphId: null, permissionDenied: true };
            }
            console.error('[GRAPH] groups lookup failed:', e.response?.data?.error?.message || e.message);
        }

        return { status: 'not_found' };
    } catch (e) {
        console.error('[GRAPH] checkO365Existence failed:', e.response?.data?.error?.message || e.message);
        return { status: 'error', error: e.response?.data?.error?.message || e.message };
    }
}

/** Membres d'un groupe Graph (pagine si nécessaire — nos groupes font au plus une centaine de membres). */
async function listGraphGroupMembers(groupId, token) {
    const members = [];
    let url = `https://graph.microsoft.com/v1.0/groups/${groupId}/members?$select=displayName,mail,userPrincipalName`;
    while (url) {
        const r = await axios.get(url, { headers: { Authorization: `Bearer ${token}` } });
        for (const m of r.data.value || []) {
            members.push({ displayName: m.displayName || '', email: m.mail || m.userPrincipalName || '' });
        }
        url = r.data['@odata.nextLink'] || null;
    }
    return members;
}

module.exports = { checkO365Existence, getGraphToken };
