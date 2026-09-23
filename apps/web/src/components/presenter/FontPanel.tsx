"use client";

import { useEffect } from "react";
import { Bold, Check, Italic, X } from "lucide-react";
import IconButton from "./IconButton";
import { ensureGoogleFont, type TextFont } from "@/lib/boards/fonts";

export const TEXT_SIZES = [12, 16, 20, 24, 32, 40, 48, 64, 80, 96];

interface FontPanelProps {
  // Which side the tool rail is docked on; the panel opens next to it.
  side: "left" | "right";
  fonts: TextFont[];
  // The family currently in effect (selected text's, or the default).
  family: string;
  size: number;
  bold: boolean;
  italic: boolean;
  color: string;
  // What each font previews: the text being edited or selected, if any.
  sample?: string;
  // Editing an existing text item rather than setting the default for new text.
  editingSelection: boolean;
  onChange: (patch: { fontId?: string; size?: number; bold?: boolean; italic?: boolean }) => void;
  onClose: () => void;
}

function FontCard({
  font,
  selected,
  sample,
  bold,
  italic,
  color,
  onPick,
}: {
  font: TextFont;
  selected: boolean;
  sample: string;
  bold: boolean;
  italic: boolean;
  color: string;
  onPick: () => void;
}) {
  useEffect(() => {
    ensureGoogleFont(font.google);
  }, [font.google]);
  return (
    <button
      type="button"
      onClick={onPick}
      aria-pressed={selected}
      className={`relative flex w-full flex-col items-start gap-1 rounded-xl border px-3 py-2.5 text-left transition-colors cursor-pointer ${
        selected
          ? "border-[var(--color-accent)] bg-[var(--color-accent)]/10"
          : "border-[var(--color-border)] hover:border-[var(--color-accent)] hover:bg-[var(--color-surface-2)]"
      }`}
    >
      <span
        className="w-full truncate text-xl leading-tight"
        style={{
          fontFamily: font.family,
          fontWeight: bold ? 700 : 400,
          fontStyle: italic ? "italic" : "normal",
          color,
        }}
      >
        {sample}
      </span>
      <span className="text-[11px] font-medium text-[var(--color-text-muted)]">
        {font.label}
        {font.google ? " · Google Font" : ""}
      </span>
      {selected && (
        <span className="absolute right-2 top-2 flex h-5 w-5 items-center justify-center rounded-full bg-[var(--color-accent)] text-[var(--color-accent-contrast)]">
          <Check size={12} strokeWidth={3} />
        </span>
      )}
    </button>
  );
}

// Text style picker, opened from the Text tool: every font shown as a live
// preview (in the text you're writing, when there is some), plus size and
// weight. Mirrors the media panel's placement.
export default function FontPanel({
  side,
  fonts,
  family,
  size,
  bold,
  italic,
  color,
  sample,
  editingSelection,
  onChange,
  onClose,
}: FontPanelProps) {
  const previewText = sample?.trim() || "The quick brown fox";
  // Previews are drawn in the pen color unless that's too light to read.
  const previewColor = /^#f/i.test(color) ? "var(--color-text)" : color;

  return (
    <div
      className={`absolute z-40 flex flex-col overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-2xl top-4 bottom-4 w-[300px] ${
        side === "left" ? "left-[100px]" : "right-[100px]"
      } max-sm:inset-x-2 max-sm:bottom-2 max-sm:top-auto max-sm:h-[65%] max-sm:w-auto`}
      onPointerDown={(e) => e.stopPropagation()}
      // Keep focus in the text being typed: choosing a style mid-sentence
      // restyles it instead of committing it in the old style.
      onMouseDown={(e) => e.preventDefault()}
    >
      <div className="flex items-center justify-between border-b border-[var(--color-border)] px-3 py-2">
        <div>
          <p className="text-sm font-semibold text-[var(--color-text)]">Text style</p>
          <p className="text-[11px] text-[var(--color-text-muted)]">
            {editingSelection ? "Changing the selected text" : "For the next text you write"}
          </p>
        </div>
        <IconButton label="Close text style" size="sm" onClick={onClose}>
          <X size={16} />
        </IconButton>
      </div>

      <div className="flex flex-col gap-2 border-b border-[var(--color-border)] px-3 py-2.5">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">Size</span>
          <div className="flex gap-1">
            <IconButton label="Bold" size="sm" active={bold} onClick={() => onChange({ bold: !bold })}>
              <Bold size={15} />
            </IconButton>
            <IconButton label="Italic" size="sm" active={italic} onClick={() => onChange({ italic: !italic })}>
              <Italic size={15} />
            </IconButton>
          </div>
        </div>
        <div className="flex flex-wrap gap-1">
          {TEXT_SIZES.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => onChange({ size: s })}
              aria-pressed={size === s}
              className={`min-w-9 rounded-lg px-2 py-1 text-xs font-medium cursor-pointer ${
                size === s
                  ? "bg-[var(--color-accent)] text-[var(--color-accent-contrast)]"
                  : "border border-[var(--color-border)] text-[var(--color-text)] hover:bg-[var(--color-surface-2)]"
              }`}
            >
              {s}
            </button>
          ))}
          {!TEXT_SIZES.includes(size) && (
            <span className="rounded-lg bg-[var(--color-accent)] px-2 py-1 text-xs font-medium text-[var(--color-accent-contrast)]">
              {Math.round(size)}
            </span>
          )}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-2.5">
        <span className="mb-2 block text-[11px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">Font</span>
        <div className="flex flex-col gap-2">
          {fonts.map((font) => (
            <FontCard
              key={font.id}
              font={font}
              selected={font.family === family}
              sample={previewText}
              bold={bold}
              italic={italic}
              color={previewColor}
              onPick={() => onChange({ fontId: font.id })}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
