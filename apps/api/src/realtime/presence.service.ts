import { Injectable } from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/auth.types.js';

// One entry per open browser tab connected to the /app socket namespace.
export interface PresenceClient {
  socketId: string;
  visitorId: string;
  user: AuthenticatedUser | null;
  path: string;
  connectedAt: number;
  lastSeenAt: number;
}

// Who has the app open right now. In memory only: presence is inherently
// "right now", and a restarted server simply rebuilds it as clients reconnect.
@Injectable()
export class PresenceService {
  private readonly clients = new Map<string, PresenceClient>();

  add(client: PresenceClient) {
    this.clients.set(client.socketId, client);
  }

  update(socketId: string, patch: Partial<Pick<PresenceClient, 'path' | 'user'>>) {
    const client = this.clients.get(socketId);
    if (!client) return;
    Object.assign(client, patch, { lastSeenAt: Date.now() });
  }

  remove(socketId: string) {
    this.clients.delete(socketId);
  }

  get(socketId: string) {
    return this.clients.get(socketId);
  }

  isUserOnline(userId: string) {
    for (const c of this.clients.values()) if (c.user?.id === userId) return true;
    return false;
  }

  isVisitorOnline(visitorId: string) {
    for (const c of this.clients.values()) if (c.visitorId === visitorId) return true;
    return false;
  }

  // Tabs grouped per person: a user with three tabs open counts once.
  snapshot() {
    const users = new Map<
      string,
      { id: string; name: string; email: string; role: string; paths: string[]; tabs: number; since: number; lastSeenAt: number }
    >();
    const guests = new Map<string, { visitorId: string; paths: string[]; tabs: number; since: number; lastSeenAt: number }>();

    for (const c of this.clients.values()) {
      if (c.user) {
        const entry = users.get(c.user.id) ?? {
          id: c.user.id,
          name: c.user.name,
          email: c.user.email,
          role: c.user.role,
          paths: [],
          tabs: 0,
          since: c.connectedAt,
          lastSeenAt: c.lastSeenAt,
        };
        entry.tabs++;
        if (!entry.paths.includes(c.path)) entry.paths.push(c.path);
        entry.since = Math.min(entry.since, c.connectedAt);
        entry.lastSeenAt = Math.max(entry.lastSeenAt, c.lastSeenAt);
        users.set(c.user.id, entry);
      } else {
        const entry = guests.get(c.visitorId) ?? {
          visitorId: c.visitorId,
          paths: [],
          tabs: 0,
          since: c.connectedAt,
          lastSeenAt: c.lastSeenAt,
        };
        entry.tabs++;
        if (!entry.paths.includes(c.path)) entry.paths.push(c.path);
        entry.since = Math.min(entry.since, c.connectedAt);
        entry.lastSeenAt = Math.max(entry.lastSeenAt, c.lastSeenAt);
        guests.set(c.visitorId, entry);
      }
    }
    const bySince = <T extends { since: number }>(a: T, b: T) => a.since - b.since;
    return {
      users: [...users.values()].sort(bySince),
      guests: [...guests.values()].sort(bySince),
    };
  }
}
