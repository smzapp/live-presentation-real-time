"use client";

import { useSyncExternalStore } from "react";

// Phones and narrow windows, where a session can't afford to spend width on
// rails: the board is the point, so the menus fold away behind buttons.
// Matches Tailwind's `md` breakpoint, so `md:` classes and this hook always
// agree about which layout is on screen.
const COMPACT = "(max-width: 767px)";

function subscribe(onChange: () => void) {
  const query = window.matchMedia(COMPACT);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

// useSyncExternalStore rather than an effect: the value is read during the
// first client render (no flash of the wide layout), and the server snapshot
// is false, so server-rendered markup is the wide one.
export function useIsCompact() {
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(COMPACT).matches,
    () => false,
  );
}
