import { Injectable, Logger } from '@nestjs/common';
import { AccessToken, RoomServiceClient } from 'livekit-server-sdk';

@Injectable()
export class LiveKitService {
  private readonly logger = new Logger(LiveKitService.name);
  private readonly apiKey = process.env.LIVEKIT_API_KEY ?? 'devkey';
  private readonly apiSecret = process.env.LIVEKIT_API_SECRET ?? 'secret';
  private readonly httpUrl = process.env.LIVEKIT_HTTP_URL ?? 'http://127.0.0.1:7880';

  private readonly roomService = new RoomServiceClient(
    this.httpUrl,
    this.apiKey,
    this.apiSecret,
  );

  // Broadcast model: only the host and anyone explicitly invited on stage may
  // publish audio/video. Everyone else joins subscribe-only, so a room scales
  // to hundreds of viewers instead of an N-way conference mesh.
  async mintToken(
    roomCode: string,
    identity: string,
    name: string | undefined,
    canPublish: boolean,
  ): Promise<string> {
    const token = new AccessToken(this.apiKey, this.apiSecret, { identity, name });
    token.addGrant({
      room: roomCode,
      roomJoin: true,
      canPublish,
      canPublishData: true,
      canSubscribe: true,
    });
    return token.toJwt();
  }

  // Flips publish permission for an already-connected participant without a
  // reconnect/new token — LiveKit pushes the updated grant over the existing
  // signaling connection and unpublishes any tracks the participant loses the
  // right to send.
  async setCanPublish(roomCode: string, identity: string, canPublish: boolean): Promise<void> {
    try {
      await this.roomService.updateParticipant(roomCode, identity, {
        permission: {
          canPublish,
          canPublishData: true,
          canSubscribe: true,
          canUpdateMetadata: false,
          hidden: false,
        },
      });
    } catch (err) {
      // The participant may not have an active LiveKit session yet (e.g. promoted
      // right as they're joining); their next mint already carries the right grant.
      this.logger.warn(`setCanPublish(${roomCode}, ${identity}) failed: ${(err as Error).message}`);
    }
  }
}
