// Crée un ticket DSI pour signaler qu'un agent existe dans RH Studio mais que
// son adresse email n'a pas été trouvée dans l'Active Directory (lien RH/AD à
// refaire). Utilisé depuis la recherche d'agent du module Réunions.
export async function createAgentLinkTicket(
    token: string | null,
    agentName: string,
    requester?: { name?: string; email?: string }
): Promise<number | null> {
    const safeName = String(agentName || '').trim() || 'agent inconnu';
    const res = await fetch('/api/tickets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token || ''}` },
        body: JSON.stringify({
            title: `Refaire lien RH/AD pour l'agent suivant : ${safeName}`,
            content: `<p>L'agent <strong>${safeName}</strong> a été trouvé dans RH Studio mais son adresse email n'a pas été trouvée dans l'Active Directory.</p><p>Merci de refaire le lien RH/AD pour cet agent.</p>`,
            type: 'demande',
            priority: 3,
            requester_name: requester?.name || '',
            requester_email: requester?.email || '',
        }),
    });
    if (!res.ok) return null;
    const data = await res.json().catch(() => null);
    return data?.id ?? null;
}
