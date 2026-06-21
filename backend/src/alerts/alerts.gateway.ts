import { WebSocketGateway, WebSocketServer, SubscribeMessage } from '@nestjs/websockets';
import { Server } from 'socket.io';

@WebSocketGateway({
  cors: {
    origin: process.env.ALLOWED_ORIGINS
      ? process.env.ALLOWED_ORIGINS.split(',').map((o) => o.trim())
      : true,
  },
  namespace: '/alerts',
})
export class AlertsGateway {
  @WebSocketServer()
  server: Server;

  broadcastAlert(alert: any) {
    this.server.to(`zone:${alert.zoneId}`).emit('alert:new', alert);
    this.server.emit('alert:global', alert);
  }

  @SubscribeMessage('join:zone')
  handleJoin(client: any, zoneId: string) {
    client.join(`zone:${zoneId}`);
  }
}
