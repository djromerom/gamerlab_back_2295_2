import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { Server, Socket } from 'socket.io';

@WebSocketGateway({
  cors: {
    origin: true, // Coherente con app.enableCors() en main.ts
    credentials: true,
  },
})
export class VideogamesGateway
  implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(VideogamesGateway.name);

  handleConnection(client: Socket) {
    this.logger.log(`Client connected: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Client disconnected: ${client.id}`);
  }

  @SubscribeMessage('subscribe:likes')
  handleSubscribeLikes(client: Socket) {
    client.join('likes_room');
    this.logger.debug(`Client ${client.id} joined likes_room`);
  }

  @SubscribeMessage('unsubscribe:likes')
  handleUnsubscribeLikes(client: Socket) {
    client.leave('likes_room');
    this.logger.debug(`Client ${client.id} left likes_room`);
  }

  /**
   * Emits the new like count of a video game to clients in the 'likes_room'.
   * Called by VideogamesService after each toggle.
   */
  emitLikesUpdate(videogameId: number, likeCount: number, triggerUserId?: string, liked?: boolean): void {
    this.server.to('likes_room').emit('likes:updated', { videogameId, likeCount, triggerUserId, liked });
    this.logger.debug(
      `likes:updated (to likes_room) → videogameId=${videogameId} likeCount=${likeCount}`,
    );
  }
}
