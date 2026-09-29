import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { AttendanceService } from '../rooms/attendance.service.js';
import { RoomsService } from '../rooms/rooms.service.js';
import type { AuthenticatedUser } from '../auth/auth.types.js';

const PAGE_SIZE = 20;

export interface AttendanceRow {
  participantId: string;
  name: string;
  firstJoinedAt: string;
  lastSeenAt: string;
  presentMs: number;
  joins: number;
  strokes: number;
  chatMessages: number;
  handRaises: number;
  reactions: number;
  wasOnStage: boolean;
  // Whether they're connected right this second (live sessions only).
  online: boolean;
}

@Injectable()
export class ReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly attendance: AttendanceService,
    private readonly rooms: RoomsService,
  ) {}

  // Sessions the user hosted, newest first. Super admins see every session.
  async listSessions(user: AuthenticatedUser, page = 1) {
    await this.attendance.flush();
    const where = user.role === 'superadmin' ? {} : { ownerId: user.id };
    const take = PAGE_SIZE;
    const skip = (Math.max(1, page) - 1) * take;
    const [sessions, total] = await Promise.all([
      this.prisma.sessionLog.findMany({ where, orderBy: { startedAt: 'desc' }, take, skip }),
      this.prisma.sessionLog.count({ where }),
    ]);

    // One grouped query rather than a count per session.
    const codes = sessions.map((s) => s.code);
    const grouped = codes.length
      ? await this.prisma.sessionAttendance.groupBy({
          by: ['roomCode'],
          where: { roomCode: { in: codes } },
          _count: { _all: true },
          _sum: { presentMs: true, strokes: true, chatMessages: true },
        })
      : [];
    const byCode = new Map(grouped.map((row) => [row.roomCode, row]));

    return {
      page: Math.max(1, page),
      pageCount: Math.max(1, Math.ceil(total / take)),
      total,
      sessions: sessions.map((session) => {
        const stats = byCode.get(session.code);
        const attendees = stats?._count._all ?? 0;
        return {
          code: session.code,
          title: session.title,
          startedAt: session.startedAt.toISOString(),
          lastActivityAt: session.lastActivityAt.toISOString(),
          peakOnline: session.peakOnline,
          attendees,
          // Average time each attendee spent in the session.
          averagePresentMs: attendees ? Math.round((stats?._sum.presentMs ?? 0) / attendees) : 0,
          strokes: stats?._sum.strokes ?? 0,
          chatMessages: stats?._sum.chatMessages ?? 0,
          live: this.isLive(session.code),
        };
      }),
    };
  }

  async session(user: AuthenticatedUser, code: string) {
    await this.attendance.flush();
    const session = await this.prisma.sessionLog.findUnique({ where: { code: code.toUpperCase() } });
    if (!session) throw new NotFoundException('No report for that session');
    if (user.role !== 'superadmin' && session.ownerId !== user.id) {
      throw new ForbiddenException('That session belongs to someone else');
    }

    const rows = await this.prisma.sessionAttendance.findMany({
      where: { roomCode: session.code },
      orderBy: { firstJoinedAt: 'asc' },
    });
    const room = this.rooms.getRoom(session.code);
    const online = new Set(
      room
        ? [...room.participants.values()].filter((p) => this.rooms.isOnline(p)).map((p) => p.id)
        : [],
    );

    const attendance: AttendanceRow[] = rows.map((row) => ({
      participantId: row.participantId,
      name: row.name,
      firstJoinedAt: row.firstJoinedAt.toISOString(),
      lastSeenAt: row.lastSeenAt.toISOString(),
      presentMs: row.presentMs,
      joins: row.joins,
      strokes: row.strokes,
      chatMessages: row.chatMessages,
      handRaises: row.handRaises,
      reactions: row.reactions,
      wasOnStage: row.wasOnStage,
      online: online.has(row.participantId),
    }));

    return {
      session: {
        code: session.code,
        title: session.title,
        startedAt: session.startedAt.toISOString(),
        lastActivityAt: session.lastActivityAt.toISOString(),
        peakOnline: session.peakOnline,
        live: this.isLive(session.code),
      },
      totals: {
        attendees: attendance.length,
        strokes: attendance.reduce((sum, row) => sum + row.strokes, 0),
        chatMessages: attendance.reduce((sum, row) => sum + row.chatMessages, 0),
        handRaises: attendance.reduce((sum, row) => sum + row.handRaises, 0),
        reactions: attendance.reduce((sum, row) => sum + row.reactions, 0),
      },
      attendance,
    };
  }

  // The same rows as the detail view, for a spreadsheet or a gradebook.
  async csv(user: AuthenticatedUser, code: string) {
    const report = await this.session(user, code);
    const header = [
      'Name',
      'First joined',
      'Last seen',
      'Minutes present',
      'Joins',
      'Drawings',
      'Chat messages',
      'Hands raised',
      'Reactions',
      'On stage',
    ];
    const lines = report.attendance.map((row) => [
      row.name,
      row.firstJoinedAt,
      row.lastSeenAt,
      String(Math.round(row.presentMs / 60000)),
      String(row.joins),
      String(row.strokes),
      String(row.chatMessages),
      String(row.handRaises),
      String(row.reactions),
      row.wasOnStage ? 'yes' : 'no',
    ]);
    const body = [header, ...lines].map((cells) => cells.map(csvCell).join(',')).join('\r\n');
    return { filename: `attendance-${report.session.code}.csv`, body };
  }

  // Whether the session is still running, so a report can say it's not final.
  private isLive(code: string) {
    const room = this.rooms.getRoom(code);
    return !!room && (!!room.hostSocketId || this.rooms.onlineCount(room) > 0);
  }
}

// Anything a spreadsheet might misread — and a leading =, +, - or @, which
// Excel would treat as a formula — is quoted.
function csvCell(value: string) {
  const needsQuotes = /[",\r\n]/.test(value) || /^[=+\-@]/.test(value);
  return needsQuotes ? `"${value.replace(/"/g, '""')}"` : value;
}
