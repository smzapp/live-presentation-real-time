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
        onBlue ? "border border-white/[.28] bg-white/[.12]" : "border border-[rgba(21,22,28,.12)] bg-white"
      }`}
    >
      <input
        value={code}
        onChange={(e) => setCode(e.target.value.toUpperCase())}
        placeholder={placeholder}
        aria-label="Session code"
        maxLength={8}
        className={`lp-mono w-[8.5rem] min-w-0 bg-transparent text-[13.5px] tracking-[.1em] outline-none ${
          onBlue ? "text-white placeholder:text-white/70" : "text-[#15161c] placeholder:text-[#9a9ca6]"
        }`}
      />
      <button
        type="submit"
        className="cursor-pointer rounded-[9px] bg-[#15161c] px-4 py-2.5 text-[14.5px] text-[#f6f5f1] transition-colors hover:bg-[#2f43d8] hover:text-white"
      >
        Join
      </button>
    </form>
  );
}
