import { useEffect } from 'react';

export const useRealtimeNotifications = (onTicketCreated: (data: any) => void) => {
  useEffect(() => {
    // 1. Demander la permission lors du montage du composant
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }

    // 2. Initialiser SSE avec le token en query param
    const token = localStorage.getItem('token');
    const url = `/api/tickets/updates?token=${token}`;
    console.log('[SSE] Attempting to connect to:', url);
    const eventSource = new EventSource(url);

    eventSource.onopen = () => {
      console.log('[SSE] Connection opened');
    };

    eventSource.onmessage = (event) => {
      console.log('[SSE] Message received:', event.data);
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
      console.error('[SSE] Error:', err);
    };

    return () => {
      console.log('[SSE] Closing connection');
      eventSource.close();
    };  }, [onTicketCreated]);
};
