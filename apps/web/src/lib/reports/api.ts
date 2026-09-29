import { API_URL } from "@/lib/room/api";
import { errorMessage } from "@/lib/http";

export interface SessionSummary {
  code: string;
  title: string;
  startedAt: string;
  lastActivityAt: string;
  peakOnline: number;
  attendees: number;
  averagePresentMs: number;
  strokes: number;
  chatMessages: number;
  // Still running: its numbers will keep moving.
  live: boolean;
}

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
  online: boolean;
}

export interface SessionReport {
  session: Omit<SessionSummary, "attendees" | "averagePresentMs" | "strokes" | "chatMessages">;
  totals: { attendees: number; strokes: number; chatMessages: number; handRaises: number; reactions: number };
  attendance: AttendanceRow[];
}

async function get<T>(token: string, path: string, fallback: string): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(await errorMessage(res, fallback));
  return (await res.json()) as T;
}

export function listSessionReports(token: string, page = 1) {
  return get<{ page: number; pageCount: number; total: number; sessions: SessionSummary[] }>(
    token,
    `/reports/sessions?page=${page}`,
    "Could not load your sessions",
  );
}

export function getSessionReport(token: string, code: string) {
  return get<SessionReport>(token, `/reports/sessions/${code}`, "Could not load that report");
}

// Fetched rather than linked so the request can carry the auth header, then
// handed to the browser as a download.
export async function downloadAttendanceCsv(token: string, code: string) {
  const res = await fetch(`${API_URL}/reports/sessions/${code}/csv`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(await errorMessage(res, "Could not export that report"));
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `attendance-${code}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

export function formatDuration(ms: number) {
  const minutes = Math.round(ms / 60000);
  if (minutes < 1) return "< 1 min";
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  return `${hours} h ${minutes % 60} min`;
}
