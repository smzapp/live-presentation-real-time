"use client";

import { useLayoutEffect } from "react";
import { THEME_INIT_SCRIPT, THEME_STORAGE_KEY } from "@/lib/theme";

// Puts the reader's saved theme on <html> before the first paint.
//
// Two things are going on here, both from Next's "preventing flash before
// hydration" guide:
//
// 1. The inline script runs while the browser parses <head>, long before React
//    loads, so nothing is ever painted in the wrong theme.
// 2. The script's type is text/javascript when it's rendered on the server
//    (so the browser runs it) and text/plain when React renders it in the
//    browser (where a script created by React would never execute anyway).
//    Without that, React warns in development about script tags in components.
//    suppressHydrationWarning covers the type differing between the two.
//
// The layout effect is only for development: React's Strict Mode remounts
// once, and resets <html> to the attributes it knows from JSX — throwing away
// what the script set. Re-applying before paint keeps the dev remount from
// silently reverting the theme. In production it runs once and changes nothing.
export default function ThemeInit() {
  useLayoutEffect(() => {
    try {
      const saved = localStorage.getItem(THEME_STORAGE_KEY);
      if (saved && document.documentElement.getAttribute("data-theme") !== saved) {
        document.documentElement.setAttribute("data-theme", saved);
      }
    } catch {
      // Private browsing, or storage disabled: keep the default theme.
    }
  }, []);

  return (
    <script
      type={typeof window === "undefined" ? "text/javascript" : "text/plain"}
      suppressHydrationWarning
      dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }}
    />
  );
}
