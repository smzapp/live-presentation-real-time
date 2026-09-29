"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { DEFAULT_SLIDES } from "@/lib/room/defaultSlides";
import type { Slide } from "@/lib/room/types";
import IconButton from "./IconButton";

interface StageSlidesProps {
  slides?: Slide[];
  slideIndex: number;
  onChange?: (index: number) => void;
}

export default function StageSlides({ slides, slideIndex, onChange }: StageSlidesProps) {
  const deck = slides && slides.length > 0 ? slides : DEFAULT_SLIDES;
  const index = Math.min(slideIndex, deck.length - 1);
  const slide = deck[index];
  // An imported deck can run to dozens of pages; past this many, a counter
  // reads better than a row of dots too small to aim at.
  const dots = deck.length <= 15;
  const counter = (
    <span className="font-mono text-xs tabular-nums text-[var(--color-text-muted)]">
      {index + 1} / {deck.length}
    </span>
  );

  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-6 p-8">
      {slide.image ? (
        // An imported page: shown exactly as it was, letterboxed into the
        // stage rather than stretched.
        <div className="flex min-h-0 w-full max-w-4xl flex-1 items-center justify-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={slide.image}
            alt={slide.title}
            className="max-h-full max-w-full rounded-2xl border border-[var(--color-border)] bg-white object-contain shadow-sm"
          />
        </div>
      ) : (
        <div className="flex aspect-video w-full max-w-4xl flex-col items-center justify-center gap-4 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-10 text-center shadow-sm">
          <span className="text-xs font-medium uppercase tracking-wide text-[var(--color-accent)]">
            Slide {index + 1} of {deck.length}
          </span>
          <h2 className="text-3xl font-semibold text-[var(--color-text)]">{slide.title}</h2>
          <p className="max-w-xl whitespace-pre-line text-lg text-[var(--color-text-muted)]">{slide.body}</p>
        </div>
      )}

      {onChange && (
        <div className="flex shrink-0 items-center gap-3">
          <IconButton label="Previous slide" onClick={() => onChange(Math.max(0, index - 1))}>
            <ChevronLeft size={20} />
          </IconButton>
          {dots ? (
            <div className="flex items-center gap-1.5">
              {deck.map((s, i) => (
                <button
                  key={s.id}
                  onClick={() => onChange(i)}
                  className={`h-1.5 rounded-full transition-all cursor-pointer ${
                    i === index ? "w-6 bg-[var(--color-accent)]" : "w-1.5 bg-[var(--color-border)]"
                  }`}
                />
              ))}
            </div>
          ) : (
            counter
          )}
          <IconButton label="Next slide" onClick={() => onChange(Math.min(deck.length - 1, index + 1))}>
            <ChevronRight size={20} />
          </IconButton>
        </div>
      )}
      {!onChange && (
        <div className="flex shrink-0 items-center gap-1.5">
          {dots
            ? deck.map((s, i) => (
                <span
                  key={s.id}
                  className={`h-1.5 rounded-full transition-all ${
                    i === index ? "w-6 bg-[var(--color-accent)]" : "w-1.5 bg-[var(--color-border)]"
                  }`}
                />
              ))
            : counter}
        </div>
      )}
    </div>
  );
}
