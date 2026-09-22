"use client";

import { useEffect, useState } from "react";
import { Radio } from "lucide-react";
import { useAuth } from "@/lib/auth/AuthContext";
import { API_URL } from "@/lib/room/api";
import { errorMessage } from "@/lib/http";
import { Alert, Badge, Card, CardHeader, PageHeader, Skeleton } from "@/components/app/ui";

interface OnlineData {
  at: number;
  counts: { users: number; guests: number; liveSessions: number; sessionParticipants: number };
  users: { id: string; name: string; email: string; role: string; paths: string[]; tabs: number; since: number }[];
  guests: { visitorId: string; paths: string[]; tabs: number; since: number }[];
  sessions: {
    code: string;
    title: string;
    ownerId: string | null;
    hostOnline: boolean;
    createdAt: number;
    participants: { id: string; name: string; onStage: boolean; joinedAt: number }[];
  }[];
}

const REFRESH_MS = 5000;

function since(ms: number) {
  const minutes = Math.max(0, Math.round((Date.now() - ms) / 60000));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  return `${hours} h ${minutes % 60} min`;
}

function describePath(path: string) {
  if (path === "/") return "Home page";
  if (path.startsWith("/present/")) return `Presenting ${path.slice(9)}`;
  if (path.startsWith("/join/")) return `In session ${path.slice(6)}`;
  if (path.startsWith("/boards/")) return "Editing a board";
  if (path.startsWith("/admin")) return "Admin";
  return path.slice(1).replace(/^./, (c) => c.toUpperCase());
}

function Count({ label, value, hint }: { label: string; value: number | undefined; hint: string }) {
  return (
    <Card className="p-5">
      <p className="text-[13px] text-[var(--lp-text-muted)]">{label}</p>
      <div className="mt-2 flex items-center gap-2 text-[28px] font-semibold leading-none tracking-tight text-[var(--lp-text)]">
        {value === undefined ? <Skeleton className="h-7 w-10" /> : value}
        {value !== undefined && value > 0 && <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" aria-hidden />}
      </div>
      <p className="mt-2 text-xs text-[var(--lp-text-muted)]">{hint}</p>
    </Card>
  );
}

function Empty({ children }: { children: string }) {
  return <p className="px-5 py-6 text-center text-sm text-[var(--lp-text-muted)]">{children}</p>;
}

export default function AdminOnlinePage() {
  const { token } = useAuth();
  const [data, setData] = useState<OnlineData | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Polled rather than pushed: a few requests a minute from an admin tab is
  // nothing, and it keeps the page simple.
  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch(`${API_URL}/admin/online`, { headers: { Authorization: `Bearer ${token}` } });
        if (!res.ok) throw new Error(await errorMessage(res, "Couldn't load who's online"));
        const next = (await res.json()) as OnlineData;
        if (!cancelled) {
          setData(next);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) setError((err as Error).message);
      }
    }
    void load();
    const timer = setInterval(() => void load(), REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [token]);

  return (
    <>
      <PageHeader
        title="Who's online"
        description={
          <span className="inline-flex items-center gap-1.5">
            <Radio size={14} className="text-emerald-500" /> Live — refreshes every few seconds.
          </span>
        }
      />
      {error && (
        <div className="mb-4">
          <Alert>{error}</Alert>
        </div>
      )}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Count label="Users online" value={data?.counts.users} hint="Signed-in accounts with the app open" />
        <Count label="Guests online" value={data?.counts.guests} hint="Visitors who aren't signed in" />
        <Count label="Live sessions" value={data?.counts.liveSessions} hint="Sessions with someone connected" />
        <Count label="In live sessions" value={data?.counts.sessionParticipants} hint="Participants connected right now" />
      </div>

      <Card className="mt-4">
        <CardHeader title="Users online" description="Signed-in accounts, one row per person however many tabs they have open" />
        {!data ? (
          <Skeleton className="m-5 h-16" />
        ) : data.users.length === 0 ? (
          <Empty>No signed-in users right now.</Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-[var(--lp-text-muted)]">
                <tr className="border-b border-[var(--lp-border-subtle)]">
                  <th className="px-5 py-2 font-medium">User</th>
                  <th className="px-5 py-2 font-medium">Role</th>
                  <th className="px-5 py-2 font-medium">Where</th>
                  <th className="px-5 py-2 font-medium">Online for</th>
                </tr>
              </thead>
              <tbody>
                {data.users.map((u) => (
                  <tr key={u.id} className="border-b border-[var(--lp-border-subtle)] last:border-0">
                    <td className="px-5 py-2.5">
                      <span className="block font-medium text-[var(--lp-text)]">{u.name}</span>
                      <span className="block text-xs text-[var(--lp-text-muted)]">{u.email}</span>
                    </td>
                    <td className="px-5 py-2.5">
                      {u.role === "superadmin" ? (
                        <Badge tone="blue">Super admin</Badge>
                      ) : u.role === "support" ? (
                        <Badge tone="green">Support agent</Badge>
                      ) : (
                        <Badge>Subscriber</Badge>
                      )}
                    </td>
                    <td className="px-5 py-2.5 text-[var(--lp-text-muted)]">
                      {u.paths.map(describePath).join(", ")}
                      {u.tabs > 1 && <span className="text-xs"> · {u.tabs} tabs</span>}
                    </td>
                    <td className="px-5 py-2.5 text-[var(--lp-text-muted)]">{since(u.since)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Guests online" description="Visitors without an account, counted once per browser" />
          {!data ? (
            <Skeleton className="m-5 h-16" />
          ) : data.guests.length === 0 ? (
            <Empty>No guests right now.</Empty>
          ) : (
            <ul className="divide-y divide-[var(--lp-border-subtle)]">
              {data.guests.map((g, i) => (
                <li key={g.visitorId} className="flex items-center justify-between gap-3 px-5 py-2.5 text-sm">
                  <span className="min-w-0">
                    <span className="block font-medium text-[var(--lp-text)]">Guest {i + 1}</span>
                    <span className="block truncate text-xs text-[var(--lp-text-muted)]">
                      {g.paths.map(describePath).join(", ")}
                      {g.tabs > 1 ? ` · ${g.tabs} tabs` : ""}
                    </span>
                  </span>
                  <span className="shrink-0 text-xs text-[var(--lp-text-muted)]">{since(g.since)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <CardHeader title="Live sessions" description="Who's connected to each session right now" />
          {!data ? (
            <Skeleton className="m-5 h-16" />
          ) : data.sessions.length === 0 ? (
            <Empty>No live sessions right now.</Empty>
          ) : (
            <ul className="divide-y divide-[var(--lp-border-subtle)]">
              {data.sessions.map((s) => (
                <li key={s.code} className="px-5 py-3 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <span className="min-w-0 truncate font-medium text-[var(--lp-text)]">{s.title}</span>
                    <span className="flex shrink-0 items-center gap-1.5">
                      <code className="rounded bg-[var(--lp-surface-2)] px-1.5 py-0.5 text-xs">{s.code}</code>
                      {s.hostOnline ? <Badge tone="green">Host here</Badge> : <Badge tone="amber">Host away</Badge>}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-[var(--lp-text-muted)]">
                    {s.participants.length === 0
                      ? "No participants yet"
                      : s.participants.map((p) => `${p.name}${p.onStage ? " (on stage)" : ""}`).join(", ")}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
