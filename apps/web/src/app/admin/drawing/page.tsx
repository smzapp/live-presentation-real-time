"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Circle,
  Copy,
  Download,
  Eraser,
  Expand,
  Grid3x3,
  Highlighter,
  Images,
  Magnet,
  Minus,
  MousePointer2,
  PaintBucket,
  Pen,
  Plus,
  RectangleHorizontal,
  Shapes,
  Sigma,
  Signature,
  StickyNote,
  Trash2,
  Type,
  Undo2,
  ZoomIn,
  type LucideIcon,
} from "lucide-react";
import { useAuth } from "@/lib/auth/AuthContext";
import { getSettings, updateSettings, type AppSettings, type ToolAvailability } from "@/lib/admin/api";
import type { DrawingTool } from "@/lib/billing/api";
import { ensureGoogleFont, type TextFont } from "@/lib/boards/fonts";
import { Alert, Button, Card, CardHeader, Field, Input, PageHeader, Skeleton } from "@/components/app/ui";

type ToolRow = { id: DrawingTool; label: string; body: string; Icon: LucideIcon };

type Section = "drawing" | "actions" | "fonts";

const SECTIONS: { id: Section; label: string; body: string; Icon: LucideIcon }[] = [
  { id: "drawing", label: "Drawing tools", body: "The tool rail beside the board", Icon: Pen },
  { id: "actions", label: "Board actions", body: "Zoom, grid, export and more", Icon: ZoomIn },
  { id: "fonts", label: "Text fonts", body: "Typefaces for the text tool", Icon: Type },
];

const DRAWING: ToolRow[] = [
  { id: "pen", label: "Pen", body: "Freehand drawing", Icon: Pen },
  { id: "signature", label: "Signature pen", body: "Pressure-sensitive ink", Icon: Signature },
  { id: "highlighter", label: "Highlighter", body: "Translucent marker", Icon: Highlighter },
  { id: "eraser", label: "Eraser", body: "Rub out ink", Icon: Eraser },
  { id: "line", label: "Line", body: "Straight lines", Icon: Minus },
  { id: "rectangle", label: "Rectangle", body: "Boxes and squares", Icon: RectangleHorizontal },
  { id: "ellipse", label: "Ellipse", body: "Circles and ovals", Icon: Circle },
  { id: "shapes", label: "More shapes", body: "Diamond, triangle, polygon, star", Icon: Shapes },
  { id: "text", label: "Text", body: "Typed text, with the fonts below", Icon: Type },
  { id: "sticky", label: "Sticky notes", body: "Notes that fit their text", Icon: StickyNote },
  { id: "math", label: "Equations", body: "LaTeX math", Icon: Sigma },
  { id: "media", label: "Media", body: "Images and icons (access also depends on media settings)", Icon: Images },
];

const QUICK_ACTIONS: ToolRow[] = [
  { id: "zoom", label: "Zoom", body: "Zoom in/out, fit page, Ctrl + scroll and pinch", Icon: ZoomIn },
  { id: "resize", label: "Resize page", body: "Add space around the page (board editor)", Icon: Expand },
  { id: "grid", label: "Grid", body: "Show or hide the grid", Icon: Grid3x3 },
  { id: "snap", label: "Snapping", body: "Alignment guides and snap to grid", Icon: Magnet },
  { id: "background", label: "Background", body: "Dot grid, cream and chalkboard backgrounds", Icon: PaintBucket },
  { id: "history", label: "Undo & redo", body: "Buttons and Ctrl+Z / Ctrl+Shift+Z", Icon: Undo2 },
  { id: "clear", label: "Clear board", body: "Wipe the whole board", Icon: Trash2 },
  { id: "boards", label: "My Boards", body: "Save, duplicate and load boards from a session", Icon: Copy },
  { id: "export", label: "Export", body: "Download as PNG, JPG, PDF or Word", Icon: Download },
  { id: "cursors", label: "Cursors", body: "Show or hide other people's cursors", Icon: MousePointer2 },
];

const OPTIONS: { value: ToolAvailability; label: string }[] = [
  { value: "on", label: "Everyone" },
  { value: "premium", label: "Paid plans" },
  { value: "off", label: "Off" },
];

function optionClass(value: ToolAvailability, selected: boolean) {
  if (!selected) return "text-[var(--lp-text-muted)] hover:text-[var(--lp-text)]";
  if (value === "off") return "bg-[var(--lp-danger-soft)] text-[var(--lp-danger-strong)]";
  if (value === "premium") return "bg-[var(--lp-warning-soft)] text-[var(--lp-warning-strong)]";
  return "bg-[var(--lp-success-soft)] text-[var(--lp-success-strong)]";
}

function ToolSection({
  title,
  description,
  rows,
  draft,
  onChange,
}: {
  title: string;
  description: string;
  rows: ToolRow[];
  draft: AppSettings["drawingTools"];
  onChange: (next: AppSettings["drawingTools"]) => void;
}) {
  function setAll(value: ToolAvailability) {
    const next = { ...draft };
    for (const row of rows) next[row.id] = value;
    onChange(next);
  }
  return (
    <Card>
      <CardHeader
        title={title}
        description={description}
        action={
          <span className="flex flex-wrap items-center gap-1.5 text-xs text-[var(--lp-text-muted)]">
            Set all:
            {OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setAll(opt.value)}
                className="rounded-md border border-[var(--lp-border)] px-2 py-1 font-medium text-[var(--lp-text)] hover:bg-[var(--lp-surface-2)] cursor-pointer"
              >
                {opt.label}
              </button>
            ))}
          </span>
        }
      />
      <ul className="divide-y divide-[var(--lp-border-subtle)]">
        {rows.map(({ id, label, body, Icon }) => (
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
                    onClick={() => onChange({ ...draft, [id]: opt.value })}
                    className={`rounded-md px-3 py-1.5 text-xs font-medium cursor-pointer ${optionClass(opt.value, selected)}`}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}

// A font row being added: either a Google Font by name, or any CSS stack.
function NewFontForm({ onAdd }: { onAdd: (font: Omit<TextFont, "id">) => void }) {
  const [label, setLabel] = useState("");
  const [source, setSource] = useState<"google" | "system">("google");
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const name = label.trim();
    const v = value.trim();
    if (!name || !v) {
      setError("Give the font a name and a family.");
      return;
    }
    if (source === "google" && !/^[A-Za-z0-9 ]{1,60}$/.test(v)) {
      setError("Google Font names use letters, digits and spaces only, e.g. Open Sans.");
      return;
    }
    if (source === "system" && !/^[A-Za-z0-9 "',.-]{1,120}$/.test(v)) {
      setError('Use a CSS font stack, e.g. "Trebuchet MS", sans-serif');
      return;
    }
    onAdd(source === "google" ? { label: name, family: `"${v}", sans-serif`, google: v } : { label: name, family: v });
    setLabel("");
    setValue("");
    setError(null);
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3 border-t border-[var(--lp-border)] px-5 py-4">
      <div className="grid gap-3 sm:grid-cols-[1fr_auto_1.5fr_auto] sm:items-end">
        <Field label="Name shown to users">
          <Input value={label} maxLength={40} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Friendly" />
        </Field>
        <Field label="Source">
          <select
            value={source}
            onChange={(e) => setSource(e.target.value as "google" | "system")}
            className="h-10 rounded-lg border border-[var(--lp-border-strong)] bg-white px-2 text-sm"
          >
            <option value="google">Google Font</option>
            <option value="system">System / CSS stack</option>
          </select>
        </Field>
        <Field label={source === "google" ? "Google Font name" : "CSS font-family"}>
          <Input
            value={value}
            maxLength={120}
            onChange={(e) => setValue(e.target.value)}
            placeholder={source === "google" ? "e.g. Nunito" : 'e.g. "Trebuchet MS", sans-serif'}
          />
        </Field>
        <Button type="submit" variant="dark">
          <Plus size={15} /> Add font
        </Button>
      </div>
      {error && <p className="text-xs text-[var(--lp-danger-strong)]">{error}</p>}
      <p className="text-xs text-[var(--lp-text-muted)]">
        Google Fonts load from fonts.google.com when someone uses them. Browse names at{" "}
        <a href="https://fonts.google.com" target="_blank" rel="noreferrer" className="underline">
          fonts.google.com
        </a>
        .
      </p>
    </form>
  );
}

function FontPreview({ font }: { font: TextFont }) {
  useEffect(() => {
    ensureGoogleFont(font.google);
  }, [font.google]);
  return (
    <span className="truncate text-lg text-[var(--lp-text)]" style={{ fontFamily: font.family }}>
      The quick brown fox
    </span>
  );
}

export default function AdminDrawingPage() {
  const { token } = useAuth();
  const [saved, setSaved] = useState<AppSettings | null>(null);
  const [draft, setDraft] = useState<AppSettings["drawingTools"] | null>(null);
  const [fonts, setFonts] = useState<TextFont[] | null>(null);
  const [saving, setSaving] = useState(false);
  const [section, setSection] = useState<Section>("drawing");
  const [message, setMessage] = useState<{ tone: "red" | "green"; text: string } | null>(null);

  useEffect(() => {
    if (!token) return;
    getSettings(token)
      .then((settings) => {
        setSaved(settings);
        setDraft(settings.drawingTools);
        setFonts(settings.textFonts);
      })
      .catch((err: Error) => setMessage({ tone: "red", text: err.message }));
  }, [token]);

  const dirty =
    !!saved &&
    !!draft &&
    !!fonts &&
    (JSON.stringify(saved.drawingTools) !== JSON.stringify(draft) || JSON.stringify(saved.textFonts) !== JSON.stringify(fonts));

  async function save() {
    if (!token || !draft || !fonts) return;
    setSaving(true);
    setMessage(null);
    try {
      const next = await updateSettings(token, { drawingTools: draft, textFonts: fonts });
      setSaved(next);
      setDraft(next.drawingTools);
      setFonts(next.textFonts);
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
            Choose which whiteboard tools and board actions everyone gets, which need a plan with paid tools (set on the{" "}
            <Link href="/admin/plans" className="underline">Plans</Link> page), and which are off. &quot;Paid plans&quot; items show
            greyed out with a lock for everyone else. In a live session, students get what the host&apos;s plan includes. Select
            and pan are always available.
          </>
        }
        actions={
          <>
            <Button
              disabled={!dirty || saving}
              onClick={() => {
                setDraft(saved?.drawingTools ?? null);
                setFonts(saved?.textFonts ?? null);
              }}
            >
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

      {!draft || !fonts ? (
        <Card className="flex flex-col gap-3 p-5">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-10" />
          ))}
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-[230px_minmax(0,1fr)] md:items-start">
          <nav aria-label="Drawing options sections" className="flex gap-1 overflow-x-auto md:sticky md:top-24 md:flex-col">
            {SECTIONS.map(({ id, label, body, Icon }) => {
              const rows = id === "drawing" ? DRAWING : id === "actions" ? QUICK_ACTIONS : [];
              const paid = rows.filter((r) => draft[r.id] === "premium").length;
              const off = rows.filter((r) => draft[r.id] === "off").length;
              const summary =
                id === "fonts"
                  ? `${fonts.length} font${fonts.length === 1 ? "" : "s"}`
                  : [paid && `${paid} paid`, off && `${off} off`].filter(Boolean).join(" · ") || "All available";
              const active = section === id;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => setSection(id)}
                  aria-current={active ? "page" : undefined}
                  className={`flex min-w-[180px] items-start gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors cursor-pointer md:min-w-0 ${
                    active
                      ? "border-[var(--lp-primary)] bg-[var(--lp-primary-soft)]"
                      : "border-transparent hover:bg-[var(--lp-surface-2)]"
                  }`}
                >
                  <span
                    className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
                      active ? "bg-[var(--lp-primary)] text-white" : "bg-[var(--lp-surface-2)] text-[var(--lp-text-muted)]"
                    }`}
                  >
                    <Icon size={16} />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-medium text-[var(--lp-text)]">{label}</span>
                    <span className="block text-xs text-[var(--lp-text-muted)]">{body}</span>
                    <span className="mt-0.5 block text-[11px] font-medium text-[var(--lp-text-muted)]">{summary}</span>
                  </span>
                </button>
              );
            })}
          </nav>

          <div className="min-w-0">
            {section === "drawing" && (
                <ToolSection
                  title="Drawing tools"
                  description="The tool rail beside the board"
                  rows={DRAWING}
                  draft={draft}
                  onChange={setDraft}
                />
            )}
            {section === "actions" && (
                <ToolSection
                  title="Board actions"
                  description="The quick-actions bar above the board"
                  rows={QUICK_ACTIONS}
                  draft={draft}
                  onChange={setDraft}
                />
            )}
            {section === "fonts" && (
                <Card>
                  <CardHeader
                    title="Text fonts"
                    description="Typefaces the text tool offers. Removing one doesn't change text already written in it."
                  />
                  <ul className="divide-y divide-[var(--lp-border-subtle)]">
                    {fonts.map((font, i) => (
                      <li key={font.id} className="flex items-center gap-3 px-5 py-3">
                        <span className="w-32 shrink-0">
                          <span className="block truncate text-sm font-medium text-[var(--lp-text)]">{font.label}</span>
                          <span className="block truncate text-[11px] text-[var(--lp-text-muted)]">
                            {font.google ? `Google: ${font.google}` : "System font"}
                          </span>
                        </span>
                        <span className="min-w-0 flex-1">
                          <FontPreview font={font} />
                        </span>
                        <span className="flex shrink-0 gap-1">
                          <button
                            type="button"
                            disabled={i === 0}
                            onClick={() => {
                              const next = [...fonts];
                              [next[i - 1], next[i]] = [next[i], next[i - 1]];
                              setFonts(next);
                            }}
                            title="Move up (the first font is the default)"
                            className="rounded-md px-2 py-1 text-xs text-[var(--lp-text-muted)] hover:bg-[var(--lp-surface-2)] disabled:opacity-30 cursor-pointer disabled:cursor-default"
                          >
                            ↑
                          </button>
                          <button
                            type="button"
                            disabled={fonts.length === 1}
                            onClick={() => setFonts(fonts.filter((f) => f.id !== font.id))}
                            aria-label={`Delete ${font.label}`}
                            title={fonts.length === 1 ? "Keep at least one font" : "Delete"}
                            className="rounded-md p-1.5 text-[var(--lp-danger-strong)] hover:bg-[var(--lp-danger-soft)] disabled:opacity-30 cursor-pointer disabled:cursor-default"
                          >
                            <Trash2 size={14} />
                          </button>
                        </span>
                      </li>
                    ))}
                  </ul>
                  <NewFontForm
                    onAdd={(font) => {
                      if (fonts.some((f) => f.label.toLowerCase() === font.label.toLowerCase())) {
                        setMessage({ tone: "red", text: `There's already a font called "${font.label}".` });
                        return;
                      }
                      setFonts([...fonts, { ...font, id: `font-${Date.now().toString(36)}` }]);
                    }}
                  />
                </Card>
            )}
          </div>
        </div>
      )}
    </>
  );
}
