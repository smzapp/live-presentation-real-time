"use client";

import { useEffect, useState } from "react";

// A QR code for the invite link, so someone can point a phone at the
// presenter's screen instead of typing a LAN address and a passcode.
//
// Drawn as SVG rather than an image: it stays crisp at any size, needs no
// canvas, and the generator (52 KB) is only fetched the first time a QR is
// actually shown.
//
// Always black on white with a quiet zone around it, whatever the app's
// theme — scanners need that contrast, and a QR on a dark surface often
// won't read at all.

// Error correction level M: about 15% of the code can be obscured (a finger,
// a reflection) and still scan, without making the modules too small.
const ERROR_CORRECTION = "M";
// Quiet zone, in modules. Four is what the spec asks for.
const MARGIN = 4;

// One <rect> per run of dark modules in a row rather than per module: the
// same picture from a fraction of the elements.
function rowRuns(isDark: (row: number, col: number) => boolean, row: number, count: number) {
  const runs: { x: number; width: number }[] = [];
  let start: number | null = null;
  for (let col = 0; col <= count; col++) {
    const dark = col < count && isDark(row, col);
    if (dark && start === null) start = col;
    if (!dark && start !== null) {
      runs.push({ x: start, width: col - start });
      start = null;
    }
  }
  return runs;
}

export default function QrCode({
  value,
  size = 148,
  label = "QR code",
}: {
  value: string;
  size?: number;
  label?: string;
}) {
  const [code, setCode] = useState<{ count: number; rows: { x: number; width: number }[][] } | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function build() {
      try {
        const qrcode = (await import("qrcode-generator")).default;
        // Type number 0 picks the smallest version the data fits in.
        const qr = qrcode(0, ERROR_CORRECTION);
        qr.addData(value);
        qr.make();
        const count = qr.getModuleCount();
        const rows = Array.from({ length: count }, (_, row) =>
          rowRuns((r, c) => qr.isDark(r, c), row, count),
        );
        if (!cancelled) setCode({ count, rows });
      } catch {
        // The link itself is right there to copy, so a QR that can't be
        // built is no reason to break the popover.
        if (!cancelled) setCode(null);
      }
    }
    void build();
    return () => {
      cancelled = true;
    };
  }, [value]);

  if (!code) {
    return (
      <div
        aria-hidden
        className="animate-pulse rounded-lg bg-[var(--color-surface-2)]"
        style={{ width: size, height: size }}
      />
    );
  }

  const span = code.count + MARGIN * 2;

  return (
    <svg
      role="img"
      aria-label={label}
      viewBox={`0 0 ${span} ${span}`}
      width={size}
      height={size}
      shapeRendering="crispEdges"
      className="rounded-lg"
    >
      <rect width={span} height={span} fill="#ffffff" />
      {code.rows.map((runs, row) =>
        runs.map((run) => (
          <rect
            key={`${row}-${run.x}`}
            x={run.x + MARGIN}
            y={row + MARGIN}
            width={run.width}
            height={1}
            fill="#000000"
          />
        )),
      )}
    </svg>
  );
}
