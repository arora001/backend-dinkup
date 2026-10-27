import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayInit,
  OnGatewayConnection,
  OnGatewayDisconnect,
  ConnectedSocket,
  MessageBody,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger } from '@nestjs/common';

@WebSocketGateway({
  cors: {
    origin: '*',
  },
  namespace: '/realtime',
})
export class RealtimeGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(RealtimeGateway.name);

  afterInit() {
    this.logger.log('WebSocket Gateway initialized on namespace /realtime');
  }

  handleConnection(client: Socket) {
    this.logger.debug(`Client connected: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    this.logger.debug(`Client disconnected: ${client.id}`);
  }

  @SubscribeMessage('join:court')
  handleJoinCourt(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { courtId: number; date: string },
  ) {
    if (!data?.courtId || !data?.date) {
      return { status: 'error', message: 'courtId and date are required' };
    }

    const room = `court:${data.courtId}:${data.date}`;
    void client.join(room);
    this.logger.debug(`Client ${client.id} joined room: ${room}`);

    return { status: 'joined', room };
  }

  @SubscribeMessage('leave:court')
  handleLeaveCourt(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { courtId: number; date: string },
  ) {
    if (!data?.courtId || !data?.date) {
      return { status: 'error', message: 'courtId and date are required' };
    }

    const room = `court:${data.courtId}:${data.date}`;
    void client.leave(room);
    this.logger.debug(`Client ${client.id} left room: ${room}`);

    return { status: 'left', room };
  }

  /**
   * Broadcast that a slot was placed on a 5-minute hold
   */
  broadcastSlotHeld(data: {
    slotId: number;
    courtId: number;
    date: string;
    holdExpiresAt: Date;
    price: number;
  }) {
    const room = `court:${data.courtId}:${data.date}`;
    this.server.to(room).emit('slot:held', data);
    this.server.emit('slot:held:global', data);
    this.logger.debug(`Broadcast slot:held for slot #${data.slotId} to room ${room}`);
  }

  /**
   * Broadcast that a slot hold expired or was released (back to AVAILABLE)
   */
  broadcastSlotReleased(data: {
    slotId: number;
    courtId: number;
    date: string;
  }) {
    const room = `court:${data.courtId}:${data.date}`;
    this.server.to(room).emit('slot:released', data);
    this.server.emit('slot:released:global', data);
    this.logger.debug(`Broadcast slot:released for slot #${data.slotId} to room ${room}`);
  }

  /**
   * Broadcast that a slot was confirmed and booked
   */
  broadcastSlotBooked(data: {
    slotId: number;
    courtId: number;
    date: string;
  }) {
    const room = `court:${data.courtId}:${data.date}`;
    this.server.to(room).emit('slot:booked', data);
    this.server.emit('slot:booked:global', data);
    this.logger.debug(`Broadcast slot:booked for slot #${data.slotId} to room ${room}`);
  }

  /**
   * Broadcast that a slot was blocked by host
   */
  broadcastSlotBlocked(data: {
    slotId: number;
    courtId: number;
    date: string;
  }) {
    const room = `court:${data.courtId}:${data.date}`;
    this.server.to(room).emit('slot:blocked', data);
    this.server.emit('slot:blocked:global', data);
    this.logger.debug(`Broadcast slot:blocked for slot #${data.slotId} to room ${room}`);
  }
}
