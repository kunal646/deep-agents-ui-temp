import { useEffect, useRef, useCallback } from 'react';

const FILE_API_URL = 'http://localhost:8001/api';
const WS_URL = 'ws://localhost:8001/ws/files';

export interface FileChangeEvent {
  type: 'file_created' | 'file_updated' | 'file_deleted';
  path: string;
  timestamp?: string;
}

export interface UseFileWatcherOptions {
  enabled?: boolean;
  onFileChanged?: (event: FileChangeEvent) => void;
  onError?: (error: Error) => void;
}

export function useFileWatcher(options: UseFileWatcherOptions = {}) {
  const { enabled = true, onFileChanged, onError } = options;
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const maxReconnectAttempts = 5;
  const reconnectDelay = 3000; // 3 seconds

  const connect = useCallback(() => {
    if (!enabled || wsRef.current?.readyState === WebSocket.OPEN) {
      return;
    }

    try {
      const ws = new WebSocket(WS_URL);
      wsRef.current = ws;

      ws.onopen = () => {
        reconnectAttemptsRef.current = 0;
      };

      ws.onmessage = (event) => {
        try {
          const data: any = JSON.parse(event.data);
          
          // Filter out keepalive and connection status messages
          if (data.type === 'keepalive' || data.type === 'connected') {
            return;
          }
          
          // Handle backend event format: file_created, file_updated, file_deleted
          const eventType = data.type || data.event;
          if (eventType && ['file_created', 'file_updated', 'file_deleted'].includes(eventType)) {
            if (onFileChanged) {
              onFileChanged({
                type: eventType,
                path: data.path,
                timestamp: data.timestamp,
              });
            }
          }
        } catch (error) {
          console.error('[useFileWatcher] Error parsing message:', error);
        }
      };

      ws.onerror = (error) => {
        // WebSocket errors during connection are normal and will be handled by onclose
        // Only log persistent errors after reconnection attempts fail
      };

      ws.onclose = (event) => {
        wsRef.current = null;

        // Attempt to reconnect if not a normal closure and we haven't exceeded max attempts
        if (
          event.code !== 1000 && // Not a normal closure
          reconnectAttemptsRef.current < maxReconnectAttempts &&
          enabled
        ) {
          reconnectAttemptsRef.current += 1;
          
          reconnectTimeoutRef.current = setTimeout(() => {
            connect();
          }, reconnectDelay);
        } else if (reconnectAttemptsRef.current >= maxReconnectAttempts && enabled) {
          // Only call onError after exhausting all reconnection attempts
          console.error('[useFileWatcher] Failed to reconnect after', maxReconnectAttempts, 'attempts');
          if (onError) {
            onError(new Error(`WebSocket connection failed after ${maxReconnectAttempts} reconnection attempts`));
          }
        }
      };
    } catch (error) {
      console.error('[useFileWatcher] Failed to create WebSocket:', error);
      if (onError) {
        onError(error instanceof Error ? error : new Error('Failed to create WebSocket'));
      }
    }
  }, [enabled, onFileChanged, onError]);

  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    if (wsRef.current) {
      wsRef.current.close(1000, 'Client disconnecting');
      wsRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (enabled) {
      connect();
    } else {
      disconnect();
    }

    return () => {
      disconnect();
    };
  }, [enabled, connect, disconnect]);

  return {
    isConnected: wsRef.current?.readyState === WebSocket.OPEN,
    reconnect: connect,
    disconnect,
  };
}

