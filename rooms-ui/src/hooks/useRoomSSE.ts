import { useEffect, useRef } from 'react';
import { useRoomStore } from '../store/roomStore';
import type { CastEvent, RoomInstance } from '../types/room.types';

export interface UseSSEOptions {
  instanceId?: string;
  roomId?: string;
  enabled?: boolean;
  baseUrl?: string;
}

/**
 * Hook para conectar ao SSE do Room Server (porta 3335)
 * 
 * - Reconecta automaticamente quando a conexão cai
 * - Filtra eventos por instanceId e roomId
 * - Dispatch automático dos eventos para o Zustand store
 */
export function useRoomSSE(options: UseSSEOptions = {}) {
  const {
    instanceId = 'all',
    roomId,
    enabled = true,
    baseUrl = '',
  } = options;

  const dispatch = useRoomStore((s) => s.dispatch);
  const addInstance = useRoomStore((s) => s.addInstance);
  const removeInstance = useRoomStore((s) => s.removeInstance);
  const esRef = useRef<EventSource | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!enabled) {
      if (esRef.current) {
        esRef.current.close();
        esRef.current = null;
      }
      return;
    }

    const connect = () => {
      // Build URL com query params
      const params = new URLSearchParams();
      if (instanceId && instanceId !== 'all') {
        params.set('instanceId', instanceId);
      }
      if (roomId) {
        params.set('roomId', roomId);
      }

      const url = `${baseUrl}/rooms/events${params.size ? `?${params.toString()}` : ''}`;

      console.log('[SSE] Connecting to:', url);

      const es = new EventSource(url);
      esRef.current = es;

      // Handler para mensagens genéricas
      es.onmessage = (e) => {
        try {
          const event: CastEvent = JSON.parse(e.data);
          dispatch(event);
        } catch (err) {
          console.error('[SSE] Parse error:', err);
        }
      };

      // Handler para erro de conexão
      es.onerror = (err) => {
        console.error('[SSE] Error:', err);
        es.close();
        esRef.current = null;

        // Tenta reconectar após 3 segundos
        if (reconnectTimeoutRef.current) {
          clearTimeout(reconnectTimeoutRef.current);
        }
        reconnectTimeoutRef.current = setTimeout(() => {
          console.log('[SSE] Reconnecting...');
          connect();
        }, 3000);
      };

      // Evento: instance.created
      es.addEventListener('instance.created', (e) => {
        try {
          const event: CastEvent = JSON.parse((e as MessageEvent).data);
          const instance: RoomInstance = {
            id: event.instanceId,
            name: (event.payload.instanceName as string) || 'Unknown',
            model: (event.payload.model as string) || 'unknown',
            provider: (event.payload.provider as string) || 'unknown',
            roomId: event.roomId,
            color: (event.payload.color as string) || '#38bdf8',
            status: 'active',
            source: event.source,
            bridgeTool: event.payload.bridgeTool as string | undefined,
          };
          addInstance(instance);
        } catch (err) {
          console.error('[SSE] instance.created parse error:', err);
        }
      });

      // Evento: instance.destroyed
      es.addEventListener('instance.destroyed', (e) => {
        try {
          const event: CastEvent = JSON.parse((e as MessageEvent).data);
          removeInstance(event.instanceId);
        } catch (err) {
          console.error('[SSE] instance.destroyed parse error:', err);
        }
      });

      // Evento: bridge.connected
      es.addEventListener('bridge.connected', (e) => {
        try {
          const event: CastEvent = JSON.parse((e as MessageEvent).data);
          console.log('[SSE] Bridge connected:', event.instanceId);
        } catch (err) {
          console.error('[SSE] bridge.connected parse error:', err);
        }
      });

      // Evento: bridge.disconnected
      es.addEventListener('bridge.disconnected', (e) => {
        try {
          const event: CastEvent = JSON.parse((e as MessageEvent).data);
          console.log('[SSE] Bridge disconnected:', event.instanceId);
        } catch (err) {
          console.error('[SSE] bridge.disconnected parse error:', err);
        }
      });

      console.log('[SSE] Connected successfully');
    };

    connect();

    // Cleanup
    return () => {
      if (esRef.current) {
        esRef.current.close();
        esRef.current = null;
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
    };
  }, [instanceId, roomId, enabled, baseUrl, dispatch, addInstance, removeInstance]);

  // Função para disconnectar manualmente
  const disconnect = () => {
    if (esRef.current) {
      esRef.current.close();
      esRef.current = null;
    }
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
    }
  };

  return { disconnect };
}
