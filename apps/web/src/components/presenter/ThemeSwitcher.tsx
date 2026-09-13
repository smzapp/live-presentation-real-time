"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Palette } from "lucide-react";
import { DEFAULT_THEME, THEME_STORAGE_KEY, THEMES, type ThemeId } from "@/lib/theme";
import IconButton from "./IconButton";

export default function ThemeSwitcher() {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState<ThemeId>(() => {
    if (typeof document === "undefined") return DEFAULT_THEME;
    return (document.documentElement.getAttribute("data-theme") as ThemeId | null) ?? DEFAULT_THEME;
  });
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  function applyTheme(id: ThemeId) {
    document.documentElement.setAttribute("data-theme", id);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, id);
    } catch {
      /* private browsing / storage disabled */
    }
    setActive(id);
    setOpen(false);
  }

  return (
    <div className="relative" ref={rootRef}>
      <IconButton label="Theme" active={open} onClick={() => setOpen((v) => !v)}>
        <Palette size={18} />
      </IconButton>
      {open && (
        <div className="absolute right-0 top-full mt-2 w-60 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-2 shadow-xl z-50">
          <p className="px-2 py-1 text-xs font-medium text-[var(--color-text-muted)]">
            Theme
          </p>
          <div className="flex flex-col gap-0.5">
            {THEMES.map((theme) => (
              <button
                key={theme.id}
                onClick={() => applyTheme(theme.id)}
                className="flex items-center gap-3 rounded-lg px-2 py-2 text-left hover:bg-[var(--color-surface-2)] transition-colors"
              >
                <span className="flex shrink-0 -space-x-1.5">
                  {theme.swatch.map((c, i) => (
                    <span
                      key={i}
                      className="h-4 w-4 rounded-full border border-black/10"
                      style={{ backgroundColor: c }}
                    />
                  ))}
                </span>
                <span className="flex-1 min-w-0">
                  <span className="block text-sm font-medium text-[var(--color-text)]">
                    {theme.name}
                  </span>
                  <span className="block text-xs text-[var(--color-text-muted)]">
                    {theme.description}
                  </span>
                </span>
                {active === theme.id && (
                  <Check size={16} className="text-[var(--color-accent)] shrink-0" />
                )}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
