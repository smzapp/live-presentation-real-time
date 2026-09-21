"use client";

import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import RequireAuth from "@/components/auth/RequireAuth";
import AppShell from "@/components/app/AppShell";
import { useAuth } from "@/lib/auth/AuthContext";
import { Badge, Button, Card, CardHeader, PageHeader } from "@/components/app/ui";

function SettingsContent() {
  const { user, logout } = useAuth();
  const router = useRouter();
  if (!user) return null;

  return (
    <div className="max-w-2xl">
      <PageHeader title="Account settings" description="Your profile and sign-in details." />
      <Card>
        <CardHeader title="Profile" />
        <dl className="divide-y divide-[var(--lp-border-subtle)]">
          {[
            { label: "Name", value: user.name },
            { label: "Email", value: user.email },
            {
              label: "Role",
              value: user.role === "superadmin" ? <Badge tone="blue">Super admin</Badge> : <Badge>User</Badge>,
            },
          ].map((row) => (
            <div key={row.label} className="flex items-center justify-between gap-4 px-5 py-3.5 text-sm">
              <dt className="text-[var(--lp-text-muted)]">{row.label}</dt>
              <dd className="truncate font-medium text-[var(--lp-text)]">{row.value}</dd>
            </div>
          ))}
        </dl>
      </Card>
      <div className="mt-6">
        <Button
          variant="danger"
          onClick={() => {
            logout();
            router.push("/login");
          }}
        >
          <LogOut size={15} /> Log out
        </Button>
      </div>
    </div>
  );
}

export default function SettingsPage() {
  return (
    <RequireAuth>
      <AppShell>
        <SettingsContent />
      </AppShell>
    </RequireAuth>
  );
}
