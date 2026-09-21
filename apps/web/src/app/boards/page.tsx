"use client";

import { Suspense } from "react";
import RequireAuth from "@/components/auth/RequireAuth";
import AppShell from "@/components/app/AppShell";
import BoardsLibrary from "@/components/boards/BoardsLibrary";

export default function BoardsPage() {
  return (
    <RequireAuth>
      <AppShell>
        {/* useSearchParams (the ?folder= deep link) needs a Suspense boundary. */}
        <Suspense fallback={null}>
          <BoardsLibrary />
        </Suspense>
      </AppShell>
    </RequireAuth>
  );
}
