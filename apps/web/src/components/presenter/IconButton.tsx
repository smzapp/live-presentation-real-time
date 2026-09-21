"use client";

import { forwardRef, type ReactNode } from "react";

interface IconButtonProps {
  children: ReactNode;
  label: string;
  onClick?: () => void;
  active?: boolean;
  danger?: boolean;
  size?: "sm" | "md" | "lg";
  showLabel?: boolean;
  disabled?: boolean;
}

const sizeClasses: Record<NonNullable<IconButtonProps["size"]>, string> = {
  sm: "h-8 w-8",
  md: "h-10 w-10",
  lg: "h-12 w-12",
};

const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { children, label, onClick, active = false, danger = false, size = "md", showLabel = false, disabled = false },
  ref,
) {
  return (
    <button
      ref={ref}
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active}
      onClick={onClick}
      disabled={disabled}
      className={[
        "group relative flex items-center justify-center rounded-xl transition-colors cursor-pointer disabled:cursor-not-allowed disabled:opacity-50",
        showLabel ? "w-full gap-2 px-3 h-10 justify-start" : sizeClasses[size],
        danger
          ? "text-[var(--color-danger)] hover:bg-[var(--color-danger)]/10"
          : active
            ? "bg-[var(--color-accent)] text-[var(--color-accent-contrast)]"
            : "text-[var(--color-text-muted)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-text)]",
      ].join(" ")}
    >
      {children}
      {showLabel && <span className="text-sm font-medium">{label}</span>}
    </button>
  );
});

export default IconButton;
