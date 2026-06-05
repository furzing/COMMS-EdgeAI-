import { useEffect, useState, useRef } from "react";
import { useToast } from "@/hooks/use-toast";

export function useWebSocket() {
  const [isConnected, setIsConnected] = useState(false);
  const [lastMessage, setLastMessage] = useState<any>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${protocol}//${window.location.host}/ws`;
    
    const connect = () => {
      try {
        socketRef.current = new WebSocket(wsUrl);
        
        socketRef.current.onopen = () => {
          setIsConnected(true);
          console.log('WebSocket connected');
        };
        
        socketRef.current.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            setLastMessage(data);
            
            // Handle different message types
            switch (data.type) {
              case 'device_updated':
                toast({
                  title: "Device Updated",
                  description: `${data.device.name} has been updated`,
                });
                break;
              case 'security_event_acknowledged':
                toast({
                  title: "Security Event Acknowledged",
                  description: "Security event has been acknowledged",
                });
                break;
              default:
                console.log('Received WebSocket message:', data);
            }
          } catch (error) {
            console.error('Error parsing WebSocket message:', error);
          }
        };
        
        socketRef.current.onclose = () => {
          setIsConnected(false);
          console.log('WebSocket disconnected');
          
          // Attempt to reconnect after 3 seconds
          setTimeout(connect, 3000);
        };
        
        socketRef.current.onerror = (error) => {
          console.error('WebSocket error:', error);
          setIsConnected(false);
        };
      } catch (error) {
        console.error('Failed to create WebSocket connection:', error);
        setTimeout(connect, 3000);
      }
    };

    connect();

    return () => {
      if (socketRef.current) {
        socketRef.current.close();
      }
    };
  }, [toast]);

  const sendMessage = (message: any) => {
    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify(message));
    } else {
      console.warn('WebSocket is not connected');
    }
  };

  return {
    isConnected,
    lastMessage,
    sendMessage,
  };
}
