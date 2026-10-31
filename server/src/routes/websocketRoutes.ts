import { FastifyInstance } from 'fastify';
import { realtimeService, ExtendedWebSocket } from '../services/realtimeService';

export async function websocketRoutes(fastify: FastifyInstance) {
  fastify.get('/ws', { websocket: true }, (socket, req) => {
    const ws = (socket as any).socket || socket;
    realtimeService.handleConnection(ws as ExtendedWebSocket, req);
  });
}
