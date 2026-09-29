import { AttendanceService } from './attendance.service.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import type { Participant, Room } from './room.types.js';

// Counters are buffered in memory and written as increments, so the things
// worth pinning down are: time is counted once however often it's flushed,
// a reconnect adds to the totals instead of replacing them, and nothing is
// double-counted across two flushes.

interface Upsert {
  where: { roomCode_participantId: { roomCode: string; participantId: string } };
  create: Record<string, unknown>;
  update: Record<string, unknown>;
}

function fakePrisma() {
  const attendanceUpserts: Upsert[] = [];
  const sessionUpserts: unknown[] = [];
  const prisma = {
    sessionAttendance: {
      upsert: (args: Upsert) => {
        attendanceUpserts.push(args);
        return Promise.resolve({});
      },
    },
    sessionLog: {
      upsert: (args: unknown) => {
        sessionUpserts.push(args);
        return Promise.resolve({});
      },
      updateMany: () => Promise.resolve({ count: 0 }),
    },
  };
  return { prisma: prisma as unknown as PrismaService, attendanceUpserts, sessionUpserts };
}

function fakeRoom(): Room {
  return {
    code: 'ABC123',
    title: 'Lesson',
    hostToken: 'token',
    joinKey: 'K7P2M9QX',
    requireKey: true,
    linkGrantsRights: true,
    ownerId: 'user-1',
    premiumTools: false,
    hostSocketId: 'host-socket',
    hostMedia: { camOn: false, micOn: false },
    mode: 'whiteboard',
    slideIndex: 0,
    gridVisible: true,
    strokes: [],
    slides: [],
    chat: [],
    participants: new Map(),
    personalStrokes: new Map(),
    screenShare: null,
    timer: null,
    createdAt: Date.now(),
    lastActivityAt: Date.now(),
  };
}

function fakeParticipant(id: string, name = 'Ada'): Participant {
  return {
    id,
    socketId: `socket-${id}`,
    name,
    canDraw: true,
    canShareScreen: false,
    handRaised: false,
    onStage: false,
    camOn: false,
    micOn: false,
    joinedAt: Date.now(),
  };
}

// Moves the clock without firing timers, so only the flushes a test asks
// for happen — the service also flushes on an interval of its own.
function advance(ms: number) {
  vi.setSystemTime(Date.now() + ms);
}

describe('AttendanceService', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('records time present and participation for one person', async () => {
    const { prisma, attendanceUpserts } = fakePrisma();
    const attendance = new AttendanceService(prisma);
    const room = fakeRoom();

    attendance.joined(room, fakeParticipant('p1'), 1);
    attendance.record(room.code, 'p1', 'strokes');
    attendance.record(room.code, 'p1', 'strokes');
    attendance.record(room.code, 'p1', 'chatMessages');
    advance(60_000);
    attendance.left(room.code, 'p1');
    await attendance.flush();

    expect(attendanceUpserts).toHaveLength(1);
    expect(attendanceUpserts[0].create).toMatchObject({
      roomCode: 'ABC123',
      participantId: 'p1',
      name: 'Ada',
      presentMs: 60_000,
      joins: 1,
      strokes: 2,
      chatMessages: 1,
    });
  });

  it('counts time once when flushed while someone is still connected', async () => {
    const { prisma, attendanceUpserts } = fakePrisma();
    const attendance = new AttendanceService(prisma);
    const room = fakeRoom();

    attendance.joined(room, fakeParticipant('p1'), 1);
    advance(30_000);
    await attendance.flush();
    advance(45_000);
    attendance.record(room.code, 'p1', 'reactions');
    await attendance.flush();

    expect(attendanceUpserts).toHaveLength(2);
    // Each write carries only what happened since the previous one, so the
    // two add up to the 75 seconds actually spent in the room.
    expect(attendanceUpserts[0].create).toMatchObject({ presentMs: 30_000, joins: 1 });
    expect(attendanceUpserts[1].update).toMatchObject({
      presentMs: { increment: 45_000 },
      joins: { increment: 0 },
      reactions: { increment: 1 },
    });
  });

  it('counts a reconnect as another join without repeating what was written', async () => {
    const { prisma, attendanceUpserts } = fakePrisma();
    const attendance = new AttendanceService(prisma);
    const room = fakeRoom();

    attendance.joined(room, fakeParticipant('p1'), 1);
    advance(10_000);
    attendance.left(room.code, 'p1');
    await attendance.flush();

    attendance.joined(room, fakeParticipant('p1'), 1);
    advance(20_000);
    attendance.left(room.code, 'p1');
    await attendance.flush();

    expect(attendanceUpserts[0].create).toMatchObject({ presentMs: 10_000, joins: 1 });
    expect(attendanceUpserts[1].update).toMatchObject({
      presentMs: { increment: 20_000 },
      joins: { increment: 1 },
    });
  });

  it('stops counting time after someone leaves', async () => {
    const { prisma, attendanceUpserts } = fakePrisma();
    const attendance = new AttendanceService(prisma);
    const room = fakeRoom();

    attendance.joined(room, fakeParticipant('p1'), 1);
    advance(5_000);
    attendance.left(room.code, 'p1');
    advance(600_000);
    await attendance.flush();

    expect(attendanceUpserts[0].create).toMatchObject({ presentMs: 5_000 });
  });

  it('remembers that someone was brought on stage', async () => {
    const { prisma, attendanceUpserts } = fakePrisma();
    const attendance = new AttendanceService(prisma);
    const room = fakeRoom();

    attendance.joined(room, fakeParticipant('p1'), 1);
    attendance.wentOnStage(room.code, 'p1');
    attendance.left(room.code, 'p1');
    await attendance.flush();

    expect(attendanceUpserts[0].create).toMatchObject({ wasOnStage: true });
  });

  it('ignores participation from someone who never joined', async () => {
    const { prisma, attendanceUpserts } = fakePrisma();
    const attendance = new AttendanceService(prisma);

    attendance.record('ABC123', 'ghost', 'strokes');
    await attendance.flush();

    expect(attendanceUpserts).toHaveLength(0);
  });

  it('keeps the highest number of people seen at once', async () => {
    const { prisma, sessionUpserts } = fakePrisma();
    const attendance = new AttendanceService(prisma);
    const room = fakeRoom();

    attendance.joined(room, fakeParticipant('p1'), 3);
    attendance.joined(room, fakeParticipant('p2', 'Grace'), 2);
    await attendance.flush();

    expect(sessionUpserts).toHaveLength(1);
    expect(sessionUpserts[0]).toMatchObject({ create: { peakOnline: 3 } });
  });
});
