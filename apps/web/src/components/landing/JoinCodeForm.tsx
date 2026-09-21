"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function JoinCodeForm({
  tone = "light",
  placeholder,
}: {
  tone?: "light" | "blue";
  placeholder: string;
}) {
  const router = useRouter();
  const [code, setCode] = useState("");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = code.trim().toUpperCase();
    if (trimmed) router.push(`/join/${trimmed}`);
  }

  const onBlue = tone === "blue";

  return (
    <form
      onSubmit={handleSubmit}
      className={`flex items-center gap-2.5 rounded-xl py-[5px] pl-4 pr-1.5 ${
        onBlue ? "border border-white/[.28] bg-white/[.12]" : "border border-[var(--lp-border-strong)] bg-white"
      }`}
    >
      <input
        value={code}
        onChange={(e) => setCode(e.target.value.toUpperCase())}
        placeholder={placeholder}
        aria-label="Session code"
        maxLength={8}
        className={`lp-mono w-[8.5rem] min-w-0 bg-transparent text-[13.5px] tracking-[.1em] outline-none ${
          onBlue ? "text-white placeholder:text-white/70" : "text-[var(--lp-text)] placeholder:text-[var(--lp-text-faint)]"
        }`}
      />
      <button
        type="submit"
        className="cursor-pointer rounded-[9px] bg-[var(--lp-dark-2)] px-4 py-2.5 text-[14.5px] text-white transition-colors hover:bg-[var(--lp-primary)] hover:text-white"
      >
        Join
      </button>
    </form>
  );
}
