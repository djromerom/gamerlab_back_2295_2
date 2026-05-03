import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { Server, Socket } from 'socket.io';

@WebSocketGateway({
  cors: { origin: '*' }, // public data — no restriction on origin
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

  /**
   * Emits the new like count of a video game to all connected clients.
   * Called by VideogamesService after each toggle.
   */
  emitLikesUpdate(videogameId: number, likeCount: number): void {
    this.server.emit('likes:updated', { videogameId, likeCount });
    this.logger.debug(
      `likes:updated → videogameId=${videogameId} likeCount=${likeCount}`,
    );
  }
}
