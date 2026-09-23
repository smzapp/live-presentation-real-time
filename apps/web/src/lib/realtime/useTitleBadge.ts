"use client";

import { useEffect } from "react";

const PREFIX = /^\(\d+\+?\)\s|^💬 [^·]*· /;
const FLASH_MS = 1500;

function baseTitle() {
  return document.title.replace(PREFIX, "").replace(PREFIX, "");
}

// Puts the unread count in the tab title — "(2) LivePresentation" — so a new
// message shows up in the tab strip while you're elsewhere. While the tab is
// in the background it also alternates with "💬 New message" to catch the eye.
// Next.js rewrites <title> on navigation, so the prefix is re-applied whenever
// the title element changes.
export function useTitleBadge(count: number) {
  useEffect(() => {
    if (typeof document === "undefined") return;
    let flashOn = false;
    let applying = false;

    const apply = () => {
      const base = baseTitle();
      const label = count > 99 ? "99+" : String(count);
      const next =
        count <= 0
          ? base
          : document.hidden && flashOn
            ? `💬 ${count === 1 ? "New message" : `${label} new messages`} · ${base}`
            : `(${label}) ${base}`;
      if (document.title !== next) {
        applying = true;
        document.title = next;
        applying = false;
      }
    };

    apply();
    const titleObserver = new MutationObserver(() => {
      if (!applying) apply();
    });
    titleObserver.observe(document.head, { subtree: true, childList: true, characterData: true });

    const timer =
      count > 0
        ? setInterval(() => {
            flashOn = document.hidden ? !flashOn : false;
            apply();
          }, FLASH_MS)
        : null;
    const onVisibility = () => {
      flashOn = false;
      apply();
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      titleObserver.disconnect();
      if (timer) clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibility);
      // Leave a clean title behind for whoever renders next.
      const base = baseTitle();
      if (document.title !== base) document.title = base;
    };
  }, [count]);
}
