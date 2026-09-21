"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

// Minimal click-to-open menu: closes on outside click, Escape, or picking an
// item. `trigger` receives the open state so it can style itself.
export default function Dropdown({
  trigger,
  children,
  align = "right",
  width = "w-56",
  label,
}: {
  trigger: (open: boolean) => ReactNode;
  children: (close: () => void) => ReactNode;
  align?: "left" | "right";
  width?: string;
  label: string;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={label}
        onClick={() => setOpen((v) => !v)}
        className="cursor-pointer"
      >
        {trigger(open)}
      </button>
      {open && (
        <div
          role="menu"
          className={`absolute top-full z-50 mt-1.5 overflow-hidden rounded-xl border border-[var(--lp-border)] bg-white py-1.5 shadow-lg ${width} ${
            align === "right" ? "right-0" : "left-0"
          }`}
        >
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  );
}

export function MenuItem({
  onClick,
  children,
  danger = false,
  disabled = false,
}: {
  onClick: () => void;
  children: ReactNode;
  danger?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      disabled={disabled}
      onClick={onClick}
      className={`flex w-full cursor-pointer items-center gap-2.5 px-3 py-2 text-left text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
        danger ? "text-[var(--lp-danger-strong)] hover:bg-[var(--lp-danger-soft)]" : "text-[var(--lp-text)] hover:bg-[var(--lp-bg)]"
      }`}
    >
      {children}
    </button>
  );
}

export function MenuDivider() {
  return <div className="my-1.5 h-px bg-[var(--lp-border)]" />;
}
