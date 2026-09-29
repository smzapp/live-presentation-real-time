"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Download, Hand, MessageSquare, PenLine, Smile, Users } from "lucide-react";
import RequireAuth from "@/components/auth/RequireAuth";
import AppShell from "@/components/app/AppShell";
import { useAuth } from "@/lib/auth/AuthContext";
import {
  downloadAttendanceCsv,
  formatDuration,
  getSessionReport,
  type SessionReport,
} from "@/lib/reports/api";
import { Alert, Badge, Button, Card, CardHeader, PageHeader, Skeleton, formatDate } from "@/components/app/ui";

// A live session's numbers keep changing, so the page refreshes itself while
// it's still running.
const LIVE_REFRESH_MS = 15000;

function Stat({ label, value, icon: Icon }: { label: string; value: string | number; icon: typeof Users }) {
  return (
    <Card className="p-5">
      <p className="flex items-center gap-1.5 text-[13px] text-[var(--lp-text-muted)]">
        <Icon size={14} /> {label}
      </p>
      <p className="mt-2 text-[28px] font-semibold leading-none tracking-tight text-[var(--lp-text)]">{value}</p>
    </Card>
  );
}

function Content({ code }: { code: string }) {
  const { token } = useAuth();
  const [report, setReport] = useState<SessionReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  // While the session is still running its numbers keep moving, so the page
  // reloads itself on a timer until it has ended.
  const live = report?.session.live ?? false;
  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    async function load() {
      try {
        const next = await getSessionReport(token!, code);
        if (cancelled) return;
        setReport(next);
        setError(null);
      } catch (err) {
        if (!cancelled) setError((err as Error).message);
      }
    }
    void load();
    if (!live) {
      return () => {
        cancelled = true;
      };
    }
    const timer = setInterval(() => void load(), LIVE_REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [token, code, live]);

  async function handleExport() {
    if (!token) return;
    setExporting(true);
    try {
      await downloadAttendanceCsv(token, code);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setExporting(false);
    }
  }

  if (error) {
    return (
      <>
        <PageHeader title="Session report" />
        <Alert>{error}</Alert>
        <Link href="/reports" className="mt-4 inline-flex items-center gap-1.5 text-sm text-[var(--lp-primary)]">
          <ArrowLeft size={14} /> All reports
        </Link>
      </>
    );
  }

  if (!report) return <Skeleton className="h-64" />;

  const { session, totals, attendance } = report;

  return (
    <>
      <Link
        href="/reports"
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-[var(--lp-text-muted)] hover:text-[var(--lp-text)]"
      >
        <ArrowLeft size={14} /> All reports
      </Link>
      <PageHeader
        title={session.title}
        description={
          <span className="inline-flex flex-wrap items-center gap-2">
            <code className="rounded bg-[var(--lp-surface-2)] px-1.5 py-0.5 text-xs">{session.code}</code>
            Started {formatDate(session.startedAt)}
            {session.live ? <Badge tone="green">Live now</Badge> : <>· Ended {formatDate(session.lastActivityAt)}</>}
          </span>
        }
        actions={
          <Button onClick={handleExport} disabled={exporting || attendance.length === 0}>
            <Download size={15} /> {exporting ? "Exporting…" : "Export CSV"}
          </Button>
        }
      />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        <Stat label="Attended" value={totals.attendees} icon={Users} />
        <Stat label="Most at once" value={session.peakOnline} icon={Users} />
        <Stat label="Drawings" value={totals.strokes} icon={PenLine} />
        <Stat label="Messages" value={totals.chatMessages} icon={MessageSquare} />
        <Stat label="Reactions" value={totals.reactions} icon={Smile} />
      </div>

      <Card className="mt-4">
        <CardHeader
          title="Attendance"
          description="One row per person, counted from when they joined to when they left — reconnects included."
        />
        {attendance.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-[var(--lp-text-muted)]">
            Nobody joined this session.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-[var(--lp-text-muted)]">
                <tr className="border-b border-[var(--lp-border-subtle)]">
                  <th className="px-5 py-2 font-medium">Name</th>
                  <th className="px-5 py-2 font-medium">Joined</th>
                  <th className="px-5 py-2 font-medium">Last seen</th>
                  <th className="px-5 py-2 font-medium">Time present</th>
                  <th className="px-5 py-2 font-medium">Drawings</th>
                  <th className="px-5 py-2 font-medium">Messages</th>
                  <th className="px-5 py-2 font-medium">
                    <Hand size={13} className="inline" /> Hands
                  </th>
                  <th className="px-5 py-2 font-medium">Reactions</th>
                </tr>
              </thead>
              <tbody>
                {attendance.map((row) => (
                  <tr key={row.participantId} className="border-b border-[var(--lp-border-subtle)] last:border-0">
                    <td className="px-5 py-2.5">
                      <span className="flex flex-wrap items-center gap-1.5">
                        <span className="font-medium text-[var(--lp-text)]">{row.name}</span>
                        {row.online && <Badge tone="green">In session</Badge>}
                        {row.wasOnStage && <Badge tone="blue">On stage</Badge>}
                      </span>
                      {row.joins > 1 && (
                        <span className="text-xs text-[var(--lp-text-muted)]">Reconnected {row.joins - 1}×</span>
                      )}
                    </td>
                    <td className="px-5 py-2.5 text-[var(--lp-text-muted)]">{formatDate(row.firstJoinedAt)}</td>
                    <td className="px-5 py-2.5 text-[var(--lp-text-muted)]">{formatDate(row.lastSeenAt)}</td>
                    <td className="px-5 py-2.5 text-[var(--lp-text)]">{formatDuration(row.presentMs)}</td>
                    <td className="px-5 py-2.5 text-[var(--lp-text-muted)]">{row.strokes}</td>
                    <td className="px-5 py-2.5 text-[var(--lp-text-muted)]">{row.chatMessages}</td>
                    <td className="px-5 py-2.5 text-[var(--lp-text-muted)]">{row.handRaises}</td>
                    <td className="px-5 py-2.5 text-[var(--lp-text-muted)]">{row.reactions}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}

export default function SessionReportView({ code }: { code: string }) {
  return (
    <RequireAuth>
      <AppShell>
        <Content code={code} />
      </AppShell>
    </RequireAuth>
  );
}
