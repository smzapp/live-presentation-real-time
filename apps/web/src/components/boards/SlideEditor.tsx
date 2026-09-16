"use client";

import { useState } from "react";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import type { Slide } from "@/lib/boards/types";

interface SlideEditorProps {
  slides: Slide[];
  onChange: (slides: Slide[]) => void;
}

function newSlide(): Slide {
  return { id: crypto.randomUUID(), title: "New slide", body: "" };
}

export default function SlideEditor({ slides, onChange }: SlideEditorProps) {
  const [activeId, setActiveId] = useState<string | null>(slides[0]?.id ?? null);
  const active = slides.find((s) => s.id === activeId) ?? slides[0] ?? null;

  function addSlide() {
    const slide = newSlide();
    onChange([...slides, slide]);
    setActiveId(slide.id);
  }

  function updateActive(patch: Partial<Slide>) {
    if (!active) return;
    onChange(slides.map((s) => (s.id === active.id ? { ...s, ...patch } : s)));
  }

  function removeSlide(id: string) {
    const next = slides.filter((s) => s.id !== id);
    onChange(next);
    if (activeId === id) setActiveId(next[0]?.id ?? null);
  }

  function move(id: string, dir: -1 | 1) {
    const idx = slides.findIndex((s) => s.id === id);
    const swapWith = idx + dir;
    if (idx === -1 || swapWith < 0 || swapWith >= slides.length) return;
    const next = [...slides];
    [next[idx], next[swapWith]] = [next[swapWith], next[idx]];
    onChange(next);
  }

  return (
    <div className="flex h-full w-full">
      <div className="w-64 shrink-0 overflow-y-auto border-r border-[var(--color-border)] p-3">
        <button
          onClick={addSlide}
          className="mb-3 flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-[var(--color-border)] px-3 py-2 text-sm text-[var(--color-text-muted)] hover:bg-[var(--color-surface-2)] cursor-pointer"
        >
          <Plus size={15} /> Add slide
        </button>
        <div className="flex flex-col gap-2">
          {slides.map((slide, i) => (
            <div
              key={slide.id}
              onClick={() => setActiveId(slide.id)}
              className={`cursor-pointer rounded-lg border p-2.5 text-sm ${
                slide.id === active?.id
                  ? "border-[var(--color-accent)] bg-[var(--color-accent)]/10"
                  : "border-[var(--color-border)] bg-[var(--color-surface)] hover:bg-[var(--color-surface-2)]"
              }`}
            >
              <span className="block truncate font-medium text-[var(--color-text)]">
                {i + 1}. {slide.title || "Untitled"}
              </span>
              <div className="mt-1.5 flex items-center gap-1">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    move(slide.id, -1);
                  }}
                  disabled={i === 0}
                  className="rounded p-1 text-[var(--color-text-muted)] hover:bg-[var(--color-surface-2)] disabled:opacity-30 cursor-pointer"
                >
                  <ArrowUp size={13} />
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    move(slide.id, 1);
                  }}
                  disabled={i === slides.length - 1}
                  className="rounded p-1 text-[var(--color-text-muted)] hover:bg-[var(--color-surface-2)] disabled:opacity-30 cursor-pointer"
                >
                  <ArrowDown size={13} />
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    removeSlide(slide.id);
                  }}
                  className="ml-auto rounded p-1 text-[var(--color-danger)] hover:bg-[var(--color-danger)]/10 cursor-pointer"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            </div>
          ))}
          {slides.length === 0 && <p className="px-1 text-sm text-[var(--color-text-muted)]">No slides yet.</p>}
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-4 overflow-y-auto p-6">
        {active ? (
          <>
            <input
              value={active.title}
              onChange={(e) => updateActive({ title: e.target.value })}
              placeholder="Slide title"
              className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-lg font-semibold text-[var(--color-text)] outline-none focus:border-[var(--color-accent)]"
            />
            <textarea
              value={active.body}
              onChange={(e) => updateActive({ body: e.target.value })}
              placeholder="Slide content"
              rows={10}
              className="flex-1 resize-none rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-[var(--color-text)] outline-none focus:border-[var(--color-accent)]"
            />
            <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-8 text-center shadow-sm">
              <span className="text-xs font-medium uppercase tracking-wide text-[var(--color-accent)]">Preview</span>
              <h2 className="mt-2 text-2xl font-semibold text-[var(--color-text)]">{active.title || "Untitled"}</h2>
              <p className="mt-2 whitespace-pre-wrap text-[var(--color-text-muted)]">{active.body}</p>
            </div>
          </>
        ) : (
          <p className="text-sm text-[var(--color-text-muted)]">Add a slide to get started.</p>
        )}
      </div>
    </div>
  );
}
