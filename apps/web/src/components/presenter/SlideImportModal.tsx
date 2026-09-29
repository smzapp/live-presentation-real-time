"use client";

import { useRef, useState } from "react";
import { FileUp, X } from "lucide-react";
import type { Slide } from "@/lib/room/types";
import { IMPORT_ACCEPT, MAX_IMPORT_PAGES, importSlides, type ImportProgress } from "@/lib/slides/import";

interface SlideImportModalProps {
  // How many slides the deck already has, so "replace" vs "add" makes sense.
  existingCount: number;
  onImport: (slides: Slide[], mode: "replace" | "append") => void;
  onClose: () => void;
}

export default function SlideImportModal({ existingCount, onImport, onClose }: SlideImportModalProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [mode, setMode] = useState<"replace" | "append">(existingCount > 0 ? "append" : "replace");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<ImportProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setBusy(true);
    setError(null);
    setProgress(null);
    try {
      const slides = await importSlides([...files], setProgress);
      onImport(slides, mode);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not import that file");
      setBusy(false);
      setProgress(null);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={busy ? undefined : onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-[var(--color-text)]">Import slides</h2>
            <p className="mt-1 text-sm text-[var(--color-text-muted)]">
              A PDF, pictures, or a PowerPoint file — up to {MAX_IMPORT_PAGES} pages.
            </p>
          </div>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            disabled={busy}
            className="cursor-pointer rounded-lg p-1 text-[var(--color-text-muted)] hover:bg-[var(--color-surface-2)] disabled:opacity-50"
          >
            <X size={16} />
          </button>
        </div>

        {existingCount > 0 && (
          <div className="mt-4 flex gap-1 rounded-xl bg-[var(--color-surface-2)] p-1">
            {(
              [
                { value: "append", label: `Add to the ${existingCount} slides` },
                { value: "replace", label: "Replace the deck" },
              ] as const
            ).map((option) => (
              <button
                key={option.value}
                type="button"
                disabled={busy}
                onClick={() => setMode(option.value)}
                className={`flex-1 cursor-pointer rounded-lg px-2 py-1.5 text-xs font-medium transition-colors disabled:opacity-50 ${
                  mode === option.value
                    ? "bg-[var(--color-surface)] text-[var(--color-text)] shadow-sm"
                    : "text-[var(--color-text-muted)]"
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        )}

        <button
          type="button"
          disabled={busy}
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            if (!busy) void handleFiles(e.dataTransfer.files);
          }}
          className={`mt-4 flex w-full cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed px-4 py-8 text-center transition-colors disabled:cursor-wait ${
            dragging
              ? "border-[var(--color-accent)] bg-[var(--color-accent)]/5"
              : "border-[var(--color-border)] hover:border-[var(--color-accent)]"
          }`}
        >
          <FileUp size={22} className="text-[var(--color-text-muted)]" />
          <span className="text-sm font-medium text-[var(--color-text)]">
            {busy ? "Importing…" : "Choose files or drop them here"}
          </span>
          <span className="text-xs text-[var(--color-text-muted)]">PDF · PNG, JPG, WebP, GIF · PPTX</span>
        </button>

        <input
          ref={inputRef}
          type="file"
          multiple
          accept={IMPORT_ACCEPT}
          className="hidden"
          onChange={(e) => void handleFiles(e.target.files)}
        />

        {progress && (
          <div className="mt-3">
            <div className="h-1.5 overflow-hidden rounded-full bg-[var(--color-surface-2)]">
              <div
                className="h-full rounded-full bg-[var(--color-accent)] transition-[width]"
                style={{ width: `${Math.round((progress.done / Math.max(1, progress.total)) * 100)}%` }}
              />
            </div>
            <p className="mt-1.5 text-xs text-[var(--color-text-muted)]">
              Page {progress.done} of {progress.total}
            </p>
          </div>
        )}

        {error && <p className="mt-3 text-sm text-[var(--color-danger)]">{error}</p>}

        <p className="mt-4 text-xs text-[var(--color-text-muted)]">
          PDF pages and pictures keep their original layout. A PowerPoint file is imported as editable text only —
          export it as a PDF first if the design matters.
        </p>
      </div>
    </div>
  );
}
