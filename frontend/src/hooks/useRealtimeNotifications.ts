import { useEffect } from 'react';

export const useRealtimeNotifications = (onTicketCreated: (data: any) => void) => {
  useEffect(() => {
    // 1. Demander la permission lors du montage du composant
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }

    // 2. Initialiser SSE
    // Note: ensure the URL is correct for your proxy/API setup
    const eventSource = new EventSource('/api/tickets/updates', { withCredentials: true });

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        
        // Afficher la notification si permission accordée
        if ('Notification' in window && Notification.permission === 'granted') {
          new Notification('DSIHUB', {
            body: `Nouveau ticket #${data.ticket_id} créé.`,
            icon: '/favicon.ico'
          });
        }

        // Déclencher le callback pour mettre à jour l'UI
        onTicketCreated(data);
      } catch (e) {
        console.error('Error processing SSE message:', e);
      }
    };

    eventSource.onerror = (err) => {
      console.error('SSE Error:', err);
      eventSource.close();
    };

    return () => eventSource.close();
  }, [onTicketCreated]);
};
