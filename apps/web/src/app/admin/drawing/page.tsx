"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Eraser,
  Highlighter,
  Images,
  Minus,
  Pen,
  RectangleHorizontal,
  Shapes,
  Sigma,
  Signature,
  StickyNote,
  Circle,
  Type,
  type LucideIcon,
} from "lucide-react";
import { useAuth } from "@/lib/auth/AuthContext";
import { getSettings, updateSettings, type AppSettings, type ToolAvailability } from "@/lib/admin/api";
import type { DrawingTool } from "@/lib/billing/api";
import { Alert, Button, Card, CardHeader, PageHeader, Skeleton } from "@/components/app/ui";

const TOOLS: { id: DrawingTool; label: string; body: string; Icon: LucideIcon }[] = [
  { id: "pen", label: "Pen", body: "Freehand drawing", Icon: Pen },
  { id: "signature", label: "Signature pen", body: "Pressure-sensitive ink", Icon: Signature },
  { id: "highlighter", label: "Highlighter", body: "Translucent marker", Icon: Highlighter },
  { id: "eraser", label: "Eraser", body: "Rub out ink", Icon: Eraser },
  { id: "line", label: "Line", body: "Straight lines", Icon: Minus },
  { id: "rectangle", label: "Rectangle", body: "Boxes and squares", Icon: RectangleHorizontal },
  { id: "ellipse", label: "Ellipse", body: "Circles and ovals", Icon: Circle },
  { id: "shapes", label: "More shapes", body: "Diamond, triangle, polygon, star", Icon: Shapes },
  { id: "text", label: "Text", body: "Typed text", Icon: Type },
  { id: "sticky", label: "Sticky notes", body: "Notes that fit their text", Icon: StickyNote },
  { id: "math", label: "Equations", body: "LaTeX math", Icon: Sigma },
  { id: "media", label: "Media", body: "Images and icons (access also depends on media settings)", Icon: Images },
];

const OPTIONS: { value: ToolAvailability; label: string }[] = [
  { value: "on", label: "Everyone" },
  { value: "premium", label: "Paid plans" },
  { value: "off", label: "Off" },
];

export default function AdminDrawingPage() {
  const { token } = useAuth();
  const [saved, setSaved] = useState<AppSettings | null>(null);
  const [draft, setDraft] = useState<AppSettings["drawingTools"] | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ tone: "red" | "green"; text: string } | null>(null);

  useEffect(() => {
    if (!token) return;
    getSettings(token)
      .then((settings) => {
        setSaved(settings);
        setDraft(settings.drawingTools);
      })
      .catch((err: Error) => setMessage({ tone: "red", text: err.message }));
  }, [token]);

  const dirty = !!saved && !!draft && JSON.stringify(saved.drawingTools) !== JSON.stringify(draft);

  async function save() {
    if (!token || !draft) return;
    setSaving(true);
    setMessage(null);
    try {
      const next = await updateSettings(token, { drawingTools: draft });
      setSaved(next);
      setDraft(next.drawingTools);
      setMessage({ tone: "green", text: "Drawing options saved. Live sessions pick them up as people join." });
    } catch (err) {
      setMessage({ tone: "red", text: (err as Error).message });
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <PageHeader
        title="Drawing options"
        description={
          <>
            Choose which whiteboard tools everyone gets, which need a plan with paid tools (set on the{" "}
            <Link href="/admin/plans" className="underline">Plans</Link> page), and which are off. In a live session, students
            get the tools of the host&apos;s plan. Select and pan are always available.
          </>
        }
        actions={
          <>
            <Button disabled={!dirty || saving} onClick={() => setDraft(saved?.drawingTools ?? null)}>
              Reset
            </Button>
            <Button variant="dark" disabled={!dirty || saving} onClick={() => void save()}>
              {saving ? "Saving…" : "Save changes"}
            </Button>
          </>
        }
      />

      {message && (
        <div className="mb-4">
          <Alert tone={message.tone}>{message.text}</Alert>
        </div>
      )}

      <Card>
        <CardHeader title="Whiteboard tools" />
        {!draft ? (
          <div className="flex flex-col gap-3 p-5">
            {Array.from({ length: 6 }, (_, i) => (
              <Skeleton key={i} className="h-10" />
            ))}
          </div>
        ) : (
          <ul className="divide-y divide-[var(--lp-border-subtle)]">
            {TOOLS.map(({ id, label, body, Icon }) => (
              <li key={id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[var(--lp-surface-2)] text-[var(--lp-text-muted)]">
                  <Icon size={17} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium text-[var(--lp-text)]">{label}</span>
                  <span className="block text-xs text-[var(--lp-text-muted)]">{body}</span>
                </span>
                <div role="radiogroup" aria-label={`${label} availability`} className="flex rounded-lg border border-[var(--lp-border)] p-0.5">
                  {OPTIONS.map((opt) => {
                    const selected = draft[id] === opt.value;
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        role="radio"
                        aria-checked={selected}
                        onClick={() => setDraft({ ...draft, [id]: opt.value })}
                        className={`rounded-md px-3 py-1.5 text-xs font-medium cursor-pointer ${
                          selected
                            ? opt.value === "off"
                              ? "bg-[var(--lp-danger-soft)] text-[var(--lp-danger-strong)]"
                              : opt.value === "premium"
                                ? "bg-[var(--lp-warning-soft)] text-[var(--lp-warning-strong)]"
                                : "bg-[var(--lp-success-soft)] text-[var(--lp-success-strong)]"
                            : "text-[var(--lp-text-muted)] hover:text-[var(--lp-text)]"
                        }`}
                      >
                        {opt.label}
                      </button>
                    );
                  })}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
