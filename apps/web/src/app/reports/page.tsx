"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, BarChart3 } from "lucide-react";
import RequireAuth from "@/components/auth/RequireAuth";
import AppShell from "@/components/app/AppShell";
import { useAuth } from "@/lib/auth/AuthContext";
import { formatDuration, listSessionReports, type SessionSummary } from "@/lib/reports/api";
import { Alert, Badge, Button, Card, CardHeader, PageHeader, Skeleton, formatDate } from "@/components/app/ui";

function SessionRow({ session }: { session: SessionSummary }) {
  return (
    <tr className="border-b border-[var(--lp-border-subtle)] last:border-0">
      <td className="px-5 py-3">
        <Link href={`/reports/${session.code}`} className="font-medium text-[var(--lp-text)] hover:text-[var(--lp-primary)]">
          {session.title}
        </Link>
        <span className="mt-0.5 flex items-center gap-2 text-xs text-[var(--lp-text-muted)]">
          <code className="rounded bg-[var(--lp-surface-2)] px-1.5 py-0.5">{session.code}</code>
          {formatDate(session.startedAt)}
          {session.live && <Badge tone="green">Live now</Badge>}
        </span>
      </td>
      <td className="px-5 py-3 text-[var(--lp-text)]">{session.attendees}</td>
      <td className="px-5 py-3 text-[var(--lp-text-muted)]">{session.peakOnline}</td>
      <td className="px-5 py-3 text-[var(--lp-text-muted)]">
        {session.attendees ? formatDuration(session.averagePresentMs) : "—"}
      </td>
      <td className="px-5 py-3 text-[var(--lp-text-muted)]">{session.strokes}</td>
      <td className="px-5 py-3 text-[var(--lp-text-muted)]">{session.chatMessages}</td>
      <td className="px-5 py-3 text-right">
        <Link
          href={`/reports/${session.code}`}
          className="inline-flex items-center gap-1 text-[13px] font-medium text-[var(--lp-primary)] hover:text-[var(--lp-text)]"
        >
          Report <ArrowRight size={14} />
        </Link>
      </td>
    </tr>
  );
}

function ReportsContent() {
  const { token } = useAuth();
  const [data, setData] = useState<{ sessions: SessionSummary[]; page: number; pageCount: number } | null>(null);
  const [page, setPage] = useState(1);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    listSessionReports(token, page)
      .then((next) => {
        if (!cancelled) {
          setData(next);
          setError(null);
        }
      })
      .catch((err: Error) => !cancelled && setError(err.message));
    return () => {
      cancelled = true;
    };
  }, [token, page]);

  return (
    <>
      <PageHeader
        title="Session reports"
        description="Who attended each session you hosted, how long they stayed, and what they took part in."
      />
      {error && (
        <div className="mb-4">
          <Alert>{error}</Alert>
        </div>
      )}

      <Card>
        <CardHeader
          title="Your sessions"
          description="Newest first. A session's numbers keep moving until everyone leaves."
        />
        {!data ? (
          <Skeleton className="m-5 h-24" />
        ) : data.sessions.length === 0 ? (
          <div className="px-5 py-12 text-center">
            <BarChart3 size={26} className="mx-auto text-[var(--lp-text-faint)]" />
            <p className="mt-3 text-sm font-medium text-[var(--lp-text)]">No sessions yet</p>
            <p className="mt-1 text-sm text-[var(--lp-text-muted)]">
              Start a live session from your dashboard and its register will show up here.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-[var(--lp-text-muted)]">
                <tr className="border-b border-[var(--lp-border-subtle)]">
                  <th className="px-5 py-2 font-medium">Session</th>
                  <th className="px-5 py-2 font-medium">Attended</th>
                  <th className="px-5 py-2 font-medium">Peak</th>
                  <th className="px-5 py-2 font-medium">Avg. time</th>
                  <th className="px-5 py-2 font-medium">Drawings</th>
                  <th className="px-5 py-2 font-medium">Messages</th>
                  <th className="px-5 py-2" />
                </tr>
              </thead>
              <tbody>
                {data.sessions.map((session) => (
                  <SessionRow key={session.code} session={session} />
                ))}
              </tbody>
            </table>
          </div>
        )}
        {data && data.pageCount > 1 && (
          <div className="flex items-center justify-between gap-3 border-t border-[var(--lp-border-subtle)] px-5 py-3">
            <span className="text-xs text-[var(--lp-text-muted)]">
              Page {data.page} of {data.pageCount}
            </span>
            <span className="flex gap-2">
              <Button size="sm" disabled={data.page <= 1} onClick={() => setPage((p) => p - 1)}>
                Previous
              </Button>
              <Button size="sm" disabled={data.page >= data.pageCount} onClick={() => setPage((p) => p + 1)}>
                Next
              </Button>
            </span>
          </div>
        )}
      </Card>
    </>
  );
}

export default function ReportsPage() {
  return (
    <RequireAuth>
      <AppShell>
        <ReportsContent />
      </AppShell>
    </RequireAuth>
  );
}
