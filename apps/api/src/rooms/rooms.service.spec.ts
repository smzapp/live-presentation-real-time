import { RoomsService } from './rooms.service.js';
import type { RoomStore } from './room-store.service.js';
import type { SettingsService } from '../platform/settings.service.js';
import type { Room } from './room.types.js';

// The countdown lives in memory and is only ever changed by the host, so
// what matters is that pausing banks exactly what was left, resuming gives
// it back, and neither can be talked into a nonsense state.

function service() {
  const store = {
    markDirty: () => {},
    markBoardDirty: () => {},
  } as unknown as RoomStore;
  const settings = { current: () => ({ drawingTools: {}, textFonts: [] }) } as unknown as SettingsService;
  return new RoomsService(store, settings);
}

function room(): Room {
  return {
    code: 'ABC123',
    title: 'Lesson',
    hostToken: 'token',
    joinKey: 'K7P2M9QX',
    requireKey: true,
    linkGrantsRights: true,
    ownerId: null,
    premiumTools: false,
    hostSocketId: null,
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

describe('RoomsService join passcode', () => {
  it('accepts the passcode however it was typed', () => {
    const rooms = service();
    const r = room();
    expect(rooms.isJoinKeyValid(r, 'K7P2M9QX')).toBe(true);
    expect(rooms.isJoinKeyValid(r, 'k7p2m9qx')).toBe(true);
    expect(rooms.isJoinKeyValid(r, ' K7P2 M9QX ')).toBe(true);
  });

  it('turns away a wrong or missing passcode', () => {
    const rooms = service();
    const r = room();
    expect(rooms.isJoinKeyValid(r, 'WRONGKEY')).toBe(false);
    expect(rooms.isJoinKeyValid(r, '')).toBe(false);
    expect(rooms.isJoinKeyValid(r, undefined)).toBe(false);
    expect(rooms.isJoinKeyValid(r, 12345678)).toBe(false);
  });

  it('lets anyone in once the host turns the passcode off', () => {
    const rooms = service();
    const r = room();
    rooms.setRequireKey(r, false);
    expect(rooms.isJoinKeyValid(r, undefined)).toBe(true);
    expect(rooms.isJoinKeyValid(r, 'nonsense')).toBe(true);
  });

  it('refuses an empty passcode even if the room has none stored', () => {
    const rooms = service();
    const r = room();
    r.joinKey = '';
    expect(rooms.isJoinKeyValid(r, '')).toBe(false);
    expect(rooms.isJoinKeyValid(r, undefined)).toBe(false);
  });

  it('issues a different passcode on reset', () => {
    const rooms = service();
    const r = room();
    const next = rooms.resetJoinKey(r);
    expect(next).not.toBe('K7P2M9QX');
    expect(next).toMatch(/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{8}$/);
    expect(rooms.isJoinKeyValid(r, 'K7P2M9QX')).toBe(false);
    expect(rooms.isJoinKeyValid(r, next)).toBe(true);
  });
});

describe('RoomsService guests', () => {
  it('numbers guests who arrive without a name', () => {
    const rooms = service();
    const r = room();
    const first = rooms.createOrResumeParticipant(r, 'socket-1', '');
    const second = rooms.createOrResumeParticipant(r, 'socket-2', '   ');
    expect(first.name).toBe('Guest 1');
    expect(second.name).toBe('Guest 2');
  });

  it('reuses a number freed up by someone who left', () => {
    const rooms = service();
    const r = room();
    const first = rooms.createOrResumeParticipant(r, 'socket-1', '');
    rooms.createOrResumeParticipant(r, 'socket-2', '');
    rooms.removeParticipant(r, first.id);
    expect(rooms.createOrResumeParticipant(r, 'socket-3', '').name).toBe('Guest 1');
  });

  it('keeps a name that was typed in', () => {
    const rooms = service();
    const r = room();
    expect(rooms.createOrResumeParticipant(r, 'socket-1', '  Ada Lovelace  ').name).toBe('Ada Lovelace');
  });

  it('renames a guest, ignoring an empty name', () => {
    const rooms = service();
    const r = room();
    const guest = rooms.createOrResumeParticipant(r, 'socket-1', '');
    expect(rooms.renameParticipant(r, guest.id, '  Grace  ')?.name).toBe('Grace');
    expect(rooms.renameParticipant(r, guest.id, '   ')).toBeUndefined();
    expect(r.participants.get(guest.id)?.name).toBe('Grace');
  });
});

describe('RoomsService invite rights', () => {
  it('gives someone who came through the invite link the run of the session', () => {
    const rooms = service();
    const r = room();
    const guest = rooms.createOrResumeParticipant(r, 'socket-1', '');
    expect({ canDraw: guest.canDraw, canShareScreen: guest.canShareScreen, onStage: guest.onStage }).toEqual({
      canDraw: false,
      canShareScreen: false,
      onStage: false,
    });

    rooms.grantInviteRights(guest);
    expect({ canDraw: guest.canDraw, canShareScreen: guest.canShareScreen, onStage: guest.onStage }).toEqual({
      canDraw: true,
      canShareScreen: true,
      onStage: true,
    });
  });

  it('remembers the host turning that off', () => {
    const rooms = service();
    const r = room();
    expect(rooms.setLinkGrantsRights(r, false)).toBe(false);
    expect(r.linkGrantsRights).toBe(false);
  });
});

describe('RoomsService countdown', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('starts a countdown that ends after the requested time', () => {
    const rooms = service();
    const r = room();
    const timer = rooms.startTimer(r, 300);
    expect(timer.durationMs).toBe(300_000);
    expect(timer.endsAt).toBe(Date.now() + 300_000);
  });

  it('refuses silly lengths instead of failing', () => {
    const rooms = service();
    const r = room();
    expect(rooms.startTimer(r, 0).durationMs).toBe(5_000);
    expect(rooms.startTimer(r, -90).durationMs).toBe(5_000);
    expect(rooms.startTimer(r, 60 * 60 * 24).durationMs).toBe(4 * 60 * 60 * 1000);
  });

  it('banks what is left when paused and hands it back on resume', () => {
    const rooms = service();
    const r = room();
    rooms.startTimer(r, 600);
    vi.setSystemTime(Date.now() + 100_000);

    const paused = rooms.pauseTimer(r);
    expect(paused?.endsAt).toBeNull();
    expect(paused?.remainingMs).toBe(500_000);

    // Time passing while paused doesn't eat into the countdown.
    vi.setSystemTime(Date.now() + 60_000);
    const resumed = rooms.resumeTimer(r);
    expect(resumed?.endsAt).toBe(Date.now() + 500_000);
    expect(resumed?.remainingMs).toBe(500_000);
  });

  it('ignores a pause or resume that does not apply', () => {
    const rooms = service();
    const r = room();
    expect(rooms.pauseTimer(r)).toBeNull();
    expect(rooms.resumeTimer(r)).toBeNull();

    rooms.startTimer(r, 60);
    // Already running: resuming again must not push the deadline out.
    const endsAt = r.timer?.endsAt;
    rooms.resumeTimer(r);
    expect(r.timer?.endsAt).toBe(endsAt);

    rooms.pauseTimer(r);
    const remaining = r.timer?.remainingMs;
    rooms.pauseTimer(r);
    expect(r.timer?.remainingMs).toBe(remaining);
  });

  it('never leaves a negative amount of time on a paused timer', () => {
    const rooms = service();
    const r = room();
    rooms.startTimer(r, 10);
    vi.setSystemTime(Date.now() + 60_000);
    expect(rooms.pauseTimer(r)?.remainingMs).toBe(0);
    // Nothing left: resuming would just restart a finished countdown.
    expect(rooms.resumeTimer(r)?.endsAt).toBeNull();
  });

  it('clears the countdown', () => {
    const rooms = service();
    const r = room();
    rooms.startTimer(r, 60);
    rooms.stopTimer(r);
    expect(r.timer).toBeNull();
  });
});
