"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { SLIDES } from "@/lib/mock-data";
import IconButton from "./IconButton";

interface StageSlidesProps {
  slideIndex: number;
  onChange?: (index: number) => void;
}

export default function StageSlides({ slideIndex, onChange }: StageSlidesProps) {
  const index = Math.min(slideIndex, SLIDES.length - 1);
  const slide = SLIDES[index];

  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-6 p-8">
      <div className="flex aspect-video w-full max-w-4xl flex-col items-center justify-center gap-4 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-10 text-center shadow-sm">
        <span className="text-xs font-medium uppercase tracking-wide text-[var(--color-accent)]">
          Slide {slide.id} of {SLIDES.length}
        </span>
        <h2 className="text-3xl font-semibold text-[var(--color-text)]">{slide.title}</h2>
        <p className="max-w-xl text-lg text-[var(--color-text-muted)]">{slide.body}</p>
      </div>

      {onChange && (
        <div className="flex items-center gap-3">
          <IconButton label="Previous slide" onClick={() => onChange(Math.max(0, index - 1))}>
            <ChevronLeft size={20} />
          </IconButton>
          <div className="flex items-center gap-1.5">
            {SLIDES.map((s, i) => (
              <button
                key={s.id}
                onClick={() => onChange(i)}
                className={`h-1.5 rounded-full transition-all cursor-pointer ${
                  i === index ? "w-6 bg-[var(--color-accent)]" : "w-1.5 bg-[var(--color-border)]"
                }`}
              />
            ))}
          </div>
          <IconButton label="Next slide" onClick={() => onChange(Math.min(SLIDES.length - 1, index + 1))}>
            <ChevronRight size={20} />
          </IconButton>
        </div>
      )}
      {!onChange && (
        <div className="flex items-center gap-1.5">
          {SLIDES.map((s, i) => (
            <span
              key={s.id}
              className={`h-1.5 rounded-full transition-all ${
                i === index ? "w-6 bg-[var(--color-accent)]" : "w-1.5 bg-[var(--color-border)]"
              }`}
            />
          ))}
        </div>
      )}
    </div>
  );
}
