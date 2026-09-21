import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from "react";

// Shared building blocks for the signed-in pages (dashboard, admin, auth),
// in the same fixed palette as the landing page. Rendered inside `.lp`.

type Variant = "primary" | "dark" | "outline" | "ghost" | "danger";

const VARIANTS: Record<Variant, string> = {
  primary: "bg-[var(--lp-primary)] text-white hover:bg-[var(--lp-primary-hover)]",
  dark: "bg-[var(--lp-dark-2)] text-white hover:bg-[var(--lp-primary)]",
  outline: "border border-[var(--lp-border-strong)] bg-white text-[var(--lp-text)] hover:border-[var(--lp-text-disabled)]",
  ghost: "text-[var(--lp-text-muted)] hover:bg-[var(--lp-surface-3)] hover:text-[var(--lp-text)]",
  danger: "border border-[var(--lp-danger-border)] bg-white text-[var(--lp-danger-strong)] hover:bg-[var(--lp-danger-soft)]",
};

export function buttonClass(variant: Variant = "outline", size: "sm" | "md" = "md") {
  return `inline-flex cursor-pointer items-center justify-center gap-1.5 rounded-lg font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
    size === "sm" ? "h-8 px-3 text-[13px]" : "h-10 px-4 text-sm"
  } ${VARIANTS[variant]}`;
}

export function Button({
  variant = "outline",
  size = "md",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: "sm" | "md" }) {
  return <button {...props} className={`${buttonClass(variant, size)} ${className}`} />;
}

export const inputClass =
  "h-10 w-full rounded-lg border border-[var(--lp-border-strong)] bg-white px-3 text-sm text-[var(--lp-text)] outline-none transition-colors placeholder:text-[var(--lp-text-faint)] focus:border-[var(--lp-primary)] focus:ring-2 focus:ring-[var(--lp-primary)]/15 disabled:bg-[#f3f2ee]";

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`${inputClass} ${props.className ?? ""}`} />;
}

export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={`${inputClass} pr-8 ${props.className ?? ""}`} />;
}

export function Field({ label, hint, children }: { label: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[13px] font-medium text-[var(--lp-text)]">{label}</span>
      {children}
      {hint && <span className="text-xs text-[var(--lp-text-muted)]">{hint}</span>}
    </label>
  );
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-xl border border-[var(--lp-border)] bg-white ${className}`}>{children}</div>;
}

export function CardHeader({ title, description, action }: { title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[var(--lp-border)] px-5 py-4">
      <div className="min-w-0">
        <h2 className="text-[15px] font-semibold text-[var(--lp-text)]">{title}</h2>
        {description && <p className="mt-0.5 text-[13px] text-[var(--lp-text-muted)]">{description}</p>}
      </div>
      {action}
    </div>
  );
}

export function PageHeader({ title, description, actions }: { title: string; description?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold tracking-tight text-[var(--lp-text)] sm:text-[28px]">{title}</h1>
        {description && <p className="mt-1 text-sm text-[var(--lp-text-muted)]">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

const BADGE_TONES = {
  neutral: "bg-[var(--lp-surface-3)] text-[var(--lp-text-muted)]",
  blue: "bg-[var(--lp-primary-soft)] text-[var(--lp-primary)]",
  green: "bg-[var(--lp-success-soft)] text-[var(--lp-success-strong)]",
  amber: "bg-[var(--lp-warning-soft)] text-[var(--lp-warning-strong)]",
  red: "bg-[var(--lp-danger-soft)] text-[var(--lp-danger-strong)]",
} as const;

export function Badge({ tone = "neutral", children }: { tone?: keyof typeof BADGE_TONES; children: ReactNode }) {
  return (
    <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ${BADGE_TONES[tone]}`}>
      {children}
    </span>
  );
}

export function Alert({ tone = "red", children }: { tone?: "red" | "blue" | "green"; children: ReactNode }) {
  const styles = {
    red: "border-[var(--lp-danger-border)] bg-[var(--lp-danger-soft)] text-[var(--lp-danger-strong)]",
    blue: "border-[var(--lp-primary-border)] bg-[var(--lp-primary-soft)] text-[var(--lp-primary-hover)]",
    green: "border-[var(--lp-neon)] bg-[var(--lp-success-soft)] text-[var(--lp-success-strong)]",
  }[tone];
  return <div className={`rounded-lg border px-4 py-3 text-sm ${styles}`}>{children}</div>;
}

export function Toggle({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative h-6 w-11 flex-none cursor-pointer rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
        checked ? "bg-[var(--lp-primary)]" : "bg-[var(--lp-border-heavy)]"
      }`}
    >
      <span
        className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-[left] ${checked ? "left-[22px]" : "left-0.5"}`}
      />
    </button>
  );
}

export function Skeleton({ className = "" }: { className?: string }) {
  return <span className={`block animate-pulse rounded bg-[var(--lp-surface-3)] ${className}`} />;
}

export function Modal({
  title,
  children,
  onClose,
  footer,
  wide = false,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  footer?: ReactNode;
  wide?: boolean;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-[var(--lp-overlay)] p-4 sm:items-center" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`flex max-h-[90vh] w-full flex-col rounded-xl bg-white shadow-xl ${wide ? "max-w-2xl" : "max-w-md"}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b border-[var(--lp-border)] px-5 py-4">
          <h2 className="text-base font-semibold text-[var(--lp-text)]">{title}</h2>
        </div>
        <div className="overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="flex justify-end gap-2 border-t border-[var(--lp-border)] px-5 py-3">{footer}</div>}
      </div>
    </div>
  );
}

export function formatPrice(priceCents: number, interval: string) {
  if (priceCents === 0) return "Free";
  return `$${(priceCents / 100).toFixed(priceCents % 100 === 0 ? 0 : 2)}/${interval === "year" ? "yr" : "mo"}`;
}

export function formatDate(iso: string | null | undefined) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

export function relativeTime(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const minutes = Math.round(diff / 60000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hr ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days} day${days === 1 ? "" : "s"} ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
