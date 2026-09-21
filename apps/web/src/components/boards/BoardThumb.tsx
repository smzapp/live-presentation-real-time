import type { BoardType } from "@/lib/boards/types";

// Board summaries don't carry their drawing/slide data, so this is a
// stylised stand-in: stable per board (seeded from its id) so the same board
// always gets the same doodle, and visibly different between the two types.

const STROKES = [
  "M14 70 C 44 24, 74 86, 104 48 S 150 26, 186 44",
  "M18 40 C 50 80, 90 10, 120 54 S 166 72, 184 30",
  "M16 58 L 60 30 L 100 64 L 140 26 L 184 52",
  "M20 76 C 60 70, 70 22, 110 30 S 170 60, 182 20",
];
const COLORS = ["var(--lp-primary)", "var(--lp-success-strong)", "var(--lp-danger)", "var(--lp-warning)", "var(--lp-primary-light)"];

function seed(id: string) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return Math.abs(h);
}

export default function BoardThumb({ id, type, className = "" }: { id: string; type: BoardType; className?: string }) {
  const n = seed(id);

  if (type === "presentation") {
    const accent = COLORS[n % COLORS.length];
    return (
      <div className={`relative overflow-hidden bg-[var(--lp-primary-soft)] ${className}`} aria-hidden>
        <div className="absolute inset-x-[14%] inset-y-[16%] flex flex-col gap-[7%] rounded-md bg-white p-[6%] shadow-[0_6px_16px_-8px_rgba(24,24,26,.18)]">
          <span className="h-[12%] w-1/2 rounded-sm" style={{ background: accent }} />
          <span className="h-[7%] w-4/5 rounded-sm bg-[var(--lp-border-strong)]" />
          <span className="h-[7%] w-3/5 rounded-sm bg-[var(--lp-border-strong)]" />
          <span className="mt-auto flex gap-[4%]">
            <span className="h-2 w-2 rounded-full" style={{ background: accent }} />
            <span className="h-2 w-2 rounded-full bg-[var(--lp-border-heavy)]" />
            <span className="h-2 w-2 rounded-full bg-[var(--lp-border-heavy)]" />
          </span>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`relative overflow-hidden bg-[var(--lp-surface-2)] bg-[length:16px_16px] ${className}`}
      style={{
        backgroundImage:
          "linear-gradient(var(--lp-surface-3) 1px, transparent 1px), linear-gradient(90deg, var(--lp-surface-3) 1px, transparent 1px)",
      }}
      aria-hidden
    >
      <svg viewBox="0 0 200 100" preserveAspectRatio="none" className="absolute inset-0 h-full w-full" fill="none">
        <path d={STROKES[n % STROKES.length]} stroke={COLORS[n % COLORS.length]} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        {n % 3 === 0 && <rect x="132" y="58" width="48" height="28" rx="4" stroke="var(--lp-text)" strokeWidth="2" />}
        {n % 3 === 1 && <circle cx="160" cy="72" r="14" stroke={COLORS[(n + 2) % COLORS.length]} strokeWidth="2.5" />}
      </svg>
      <span className="absolute left-[12%] top-[16%] h-[9%] w-[26%] rounded-sm bg-[var(--lp-neon)]" />
    </div>
  );
}
