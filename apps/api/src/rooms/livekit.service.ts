import { Injectable } from '@nestjs/common';
import { AccessToken } from 'livekit-server-sdk';

@Injectable()
export class LiveKitService {
  private readonly apiKey = process.env.LIVEKIT_API_KEY ?? 'devkey';
  private readonly apiSecret = process.env.LIVEKIT_API_SECRET ?? 'secret';

  async mintToken(roomCode: string, identity: string, name?: string): Promise<string> {
    const token = new AccessToken(this.apiKey, this.apiSecret, { identity, name });
    token.addGrant({ room: roomCode, roomJoin: true, canPublish: true, canSubscribe: true });
    return token.toJwt();
  }
}
