"use client";

import RequireAuth from "@/components/auth/RequireAuth";
import AppShell from "@/components/app/AppShell";
import DashboardContent from "@/components/dashboard/DashboardContent";

export default function DashboardPage() {
  return (
    <RequireAuth>
      <AppShell>
        <DashboardContent />
      </AppShell>
    </RequireAuth>
  );
}
