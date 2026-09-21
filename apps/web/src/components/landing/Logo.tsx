export default function Logo({ size = "md" }: { size?: "md" | "sm" }) {
  const md = size === "md";
  return (
    <span
      className={`grid place-items-center bg-[var(--lp-primary)] ${
        md ? "h-[30px] w-[30px] rounded-[9px] shadow-[0_6px_14px_rgba(103,61,230,.28)]" : "h-6 w-6 rounded-[7px]"
      }`}
    >
      <span
        className={`border-white ${md ? "h-3 w-3 rounded-[3px] border-2" : "h-[9px] w-[9px] rounded-[2px] border-[1.5px]"}`}
      />
    </span>
  );
}
