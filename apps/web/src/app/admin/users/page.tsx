"use client";

import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, Plus, Search } from "lucide-react";
import { useAuth, type UserRole } from "@/lib/auth/AuthContext";
import {
  createUser,
  deleteUser,
  listPlans,
  listUsers,
  setSubscription,
  updateUser,
  type AdminUser,
  type Plan,
  type SubscriptionStatus,
  type MediaAccess,
  type UserStatus,
} from "@/lib/admin/api";
import {
  Alert,
  Badge,
  Button,
  Card,
  Field,
  Input,
  Modal,
  PageHeader,
  Select,
  Skeleton,
  formatDate,
} from "@/components/app/ui";

const SUB_STATUSES: SubscriptionStatus[] = ["active", "trialing", "past_due", "canceled"];

function statusTone(status: SubscriptionStatus) {
  if (status === "active") return "green" as const;
  if (status === "canceled") return "red" as const;
  return "amber" as const;
}

export default function AdminUsersPage() {
  const { token, user: me } = useAuth();
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [role, setRole] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<{ users: AdminUser[]; total: number; pageSize: number } | null>(null);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<AdminUser | null>(null);
  const [adding, setAdding] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const load = () => setReloadKey((k) => k + 1);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    listUsers(token, { search: query, page, role, status })
      .then((result) => {
        if (cancelled) return;
        setData(result);
        setError(null);
      })
      .catch((err: Error) => {
        if (!cancelled) setError(err.message);
      });
    return () => {
      cancelled = true;
    };
  }, [token, query, page, role, status, reloadKey]);

  useEffect(() => {
    if (!token) return;
    listPlans(token)
      .then(setPlans)
      .catch(() => {});
  }, [token]);

  // Debounce typing so every keystroke doesn't hit the API.
  useEffect(() => {
    const id = setTimeout(() => {
      setPage(1);
      setQuery(search.trim());
    }, 300);
    return () => clearTimeout(id);
  }, [search]);

  const pageCount = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  function handleSaved(updated: AdminUser) {
    setData((prev) => (prev ? { ...prev, users: prev.users.map((u) => (u.id === updated.id ? updated : u)) } : prev));
    setEditing(updated);
  }

  return (
    <>
      <PageHeader
        title="Users"
        description={data ? `${data.total} user${data.total === 1 ? "" : "s"}` : "Everyone with an account in this workspace."}
        actions={
          <Button variant="dark" onClick={() => setAdding(true)}>
            <Plus size={15} /> Add user
          </Button>
        }
      />

      <Card>
        <div className="flex flex-wrap items-center gap-2 border-b border-[var(--lp-border)] p-4">
          <div className="relative min-w-[200px] flex-1">
            <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--lp-text-faint)]" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name or email"
              aria-label="Search users"
              className="pl-9"
            />
          </div>
          <Select
            aria-label="Filter by role"
            value={role}
            onChange={(e) => {
              setPage(1);
              setRole(e.target.value);
            }}
            className="sm:w-40"
          >
            <option value="">All roles</option>
            <option value="user">User</option>
            <option value="superadmin">Super admin</option>
          </Select>
          <Select
            aria-label="Filter by status"
            value={status}
            onChange={(e) => {
              setPage(1);
              setStatus(e.target.value);
            }}
            className="sm:w-40"
          >
            <option value="">All statuses</option>
            <option value="active">Active</option>
            <option value="suspended">Suspended</option>
          </Select>
        </div>

        {error && (
          <div className="p-4">
            <Alert>{error}</Alert>
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="text-left text-xs text-[var(--lp-text-muted)]">
                <th className="px-4 py-2.5 font-medium">User</th>
                <th className="px-4 py-2.5 font-medium">Role</th>
                <th className="px-4 py-2.5 font-medium">Status</th>
                <th className="px-4 py-2.5 font-medium">Plan</th>
                <th className="px-4 py-2.5 text-right font-medium">Boards</th>
                <th className="px-4 py-2.5 font-medium">Last sign-in</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--lp-border-subtle)] border-t border-[var(--lp-border-subtle)]">
              {!data
                ? Array.from({ length: 5 }, (_, i) => (
                    <tr key={i}>
                      <td colSpan={7} className="px-4 py-3.5">
                        <Skeleton className="h-5" />
                      </td>
                    </tr>
                  ))
                : data.users.length === 0
                  ? (
                    <tr>
                      <td colSpan={7} className="px-4 py-12 text-center text-[var(--lp-text-muted)]">
                        No users match these filters.
                      </td>
                    </tr>
                  )
                  : data.users.map((u) => (
                      <tr key={u.id} className="hover:bg-[var(--lp-surface-2)]">
                        <td className="px-4 py-3">
                          <div className="font-medium text-[var(--lp-text)]">
                            {u.name}
                            {u.id === me?.id && <span className="ml-1.5 text-xs font-normal text-[var(--lp-text-muted)]">(you)</span>}
                          </div>
                          <div className="text-xs text-[var(--lp-text-muted)]">{u.email}</div>
                        </td>
                        <td className="px-4 py-3">
                          {u.role === "superadmin" ? <Badge tone="blue">Super admin</Badge> : <Badge>User</Badge>}
                        </td>
                        <td className="px-4 py-3">
                          {u.status === "active" ? <Badge tone="green">Active</Badge> : <Badge tone="red">Suspended</Badge>}
                        </td>
                        <td className="px-4 py-3">
                          {u.subscription ? (
                            <span className="flex items-center gap-1.5">
                              {u.subscription.plan.name}
                              {u.subscription.status !== "active" && (
                                <Badge tone={statusTone(u.subscription.status)}>{u.subscription.status.replace("_", " ")}</Badge>
                              )}
                            </span>
                          ) : (
                            <span className="text-[var(--lp-text-faint)]">None</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums">{u.boardCount}</td>
                        <td className="whitespace-nowrap px-4 py-3 text-[var(--lp-text-muted)]">{formatDate(u.lastLoginAt)}</td>
                        <td className="px-4 py-3 text-right">
                          <Button size="sm" onClick={() => setEditing(u)}>
                            Manage
                          </Button>
                        </td>
                      </tr>
                    ))}
            </tbody>
          </table>
        </div>

        {data && pageCount > 1 && (
          <div className="flex items-center justify-between border-t border-[var(--lp-border)] px-4 py-3 text-sm text-[var(--lp-text-muted)]">
            <span>
              Page {page} of {pageCount}
            </span>
            <div className="flex gap-2">
              <Button size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)} aria-label="Previous page">
                <ChevronLeft size={15} />
              </Button>
              <Button size="sm" disabled={page >= pageCount} onClick={() => setPage((p) => p + 1)} aria-label="Next page">
                <ChevronRight size={15} />
              </Button>
            </div>
          </div>
        )}
      </Card>

      {adding && token && (
        <AddUserModal
          token={token}
          onClose={() => setAdding(false)}
          onCreated={() => {
            setAdding(false);
            load();
          }}
        />
      )}

      {editing && token && (
        <ManageUserModal
          token={token}
          user={editing}
          isSelf={editing.id === me?.id}
          plans={plans}
          onClose={() => setEditing(null)}
          onSaved={handleSaved}
          onDeleted={() => {
            setEditing(null);
            load();
          }}
        />
      )}
    </>
  );
}

function AddUserModal({ token, onClose, onCreated }: { token: string; onClose: () => void; onCreated: () => void }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<UserRole>("user");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await createUser(token, { name, email, password, role });
      onCreated();
    } catch (err) {
      setError((err as Error).message);
      setSaving(false);
    }
  }

  return (
    <Modal
      title="Add user"
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="dark" type="submit" form="add-user" disabled={saving}>
            {saving ? "Adding…" : "Add user"}
          </Button>
        </>
      }
    >
      <form id="add-user" onSubmit={handleSubmit} className="flex flex-col gap-4">
        <Field label="Full name">
          <Input required value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Email">
          <Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <Field label="Temporary password" hint="At least 8 characters. Share it with them securely.">
          <Input type="password" autoComplete="new-password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} />
        </Field>
        <Field label="Role">
          <Select value={role} onChange={(e) => setRole(e.target.value as UserRole)}>
            <option value="user">User</option>
            <option value="superadmin">Super admin</option>
          </Select>
        </Field>
        <p className="text-xs text-[var(--lp-text-muted)]">New users get the default plan from App settings.</p>
        {error && <Alert>{error}</Alert>}
      </form>
    </Modal>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-b border-[var(--lp-border)] py-5 first:pt-1 last:border-0 last:pb-1">
      <h3 className="mb-3 text-[13px] font-semibold uppercase tracking-wide text-[var(--lp-text-muted)]">{title}</h3>
      {children}
    </section>
  );
}

function ManageUserModal({
  token,
  user,
  isSelf,
  plans,
  onClose,
  onSaved,
  onDeleted,
}: {
  token: string;
  user: AdminUser;
  isSelf: boolean;
  plans: Plan[];
  onClose: () => void;
  onSaved: (user: AdminUser) => void;
  onDeleted: () => void;
}) {
  const [name, setName] = useState(user.name);
  const [email, setEmail] = useState(user.email);
  const [role, setRole] = useState<UserRole>(user.role);
  const [status, setStatus] = useState<UserStatus>(user.status);
  const [mediaAccess, setMediaAccess] = useState<MediaAccess>(user.mediaAccess ?? "plan");
  const [planId, setPlanId] = useState(user.subscription?.plan.id ?? "");
  const [subStatus, setSubStatus] = useState<SubscriptionStatus>(user.subscription?.status ?? "active");
  const [password, setPassword] = useState("");
  const [confirmDelete, setConfirmDelete] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ tone: "red" | "green"; text: string } | null>(null);

  async function run(label: string, action: () => Promise<void>, success: string) {
    setBusy(label);
    setMessage(null);
    try {
      await action();
      setMessage({ tone: "green", text: success });
    } catch (err) {
      setMessage({ tone: "red", text: (err as Error).message });
    } finally {
      setBusy(null);
    }
  }

  const profileDirty =
    name !== user.name ||
    email !== user.email ||
    role !== user.role ||
    status !== user.status ||
    mediaAccess !== user.mediaAccess;
  const planDirty = planId !== (user.subscription?.plan.id ?? "") || (planId !== "" && subStatus !== (user.subscription?.status ?? "active"));

  return (
    <Modal title={`Manage ${user.name}`} onClose={onClose} wide footer={<Button onClick={onClose}>Close</Button>}>
      {message && (
        <div className="mb-2">
          <Alert tone={message.tone}>{message.text}</Alert>
        </div>
      )}

      <Section title="Profile & access">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Full name">
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field label="Email">
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </Field>
          <Field label="Role" hint={isSelf ? "You can't change your own role." : undefined}>
            <Select value={role} disabled={isSelf} onChange={(e) => setRole(e.target.value as UserRole)}>
              <option value="user">User</option>
              <option value="superadmin">Super admin</option>
            </Select>
          </Field>
          <Field
            label="Status"
            hint={isSelf ? "You can't suspend yourself." : "Suspended users are signed out and can't sign in."}
          >
            <Select value={status} disabled={isSelf} onChange={(e) => setStatus(e.target.value as UserStatus)}>
              <option value="active">Active</option>
              <option value="suspended">Suspended</option>
            </Select>
          </Field>
          <Field
            label="Whiteboard media"
            hint={role === "superadmin" ? "Super admins always have full media access." : "Overrides what their plan allows."}
          >
            <Select
              value={mediaAccess}
              disabled={role === "superadmin"}
              onChange={(e) => setMediaAccess(e.target.value as MediaAccess)}
            >
              <option value="plan">Follow their plan</option>
              <option value="full">Library + unlimited uploads</option>
              <option value="none">No media</option>
            </Select>
          </Field>
        </div>
        <div className="mt-4 flex items-center justify-between gap-3">
          <span className="text-xs text-[var(--lp-text-muted)]">
            Joined {formatDate(user.createdAt)} · {user.boardCount} board{user.boardCount === 1 ? "" : "s"}
          </span>
          <Button
            variant="dark"
            size="sm"
            disabled={!profileDirty || busy !== null}
            onClick={() =>
              run(
                "profile",
                async () => {
                  onSaved(
                    await updateUser(token, user.id, {
                      ...(name !== user.name ? { name } : {}),
                      ...(email !== user.email ? { email } : {}),
                      ...(role !== user.role ? { role } : {}),
                      ...(status !== user.status ? { status } : {}),
                      ...(mediaAccess !== user.mediaAccess ? { mediaAccess } : {}),
                    }),
                  );
                },
                "Profile saved.",
              )
            }
          >
            {busy === "profile" ? "Saving…" : "Save profile"}
          </Button>
        </div>
      </Section>

      <Section title="Subscription">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Plan">
            <Select value={planId} onChange={(e) => setPlanId(e.target.value)}>
              <option value="">No plan</option>
              {plans.map((p) => (
                <option key={p.id} value={p.id} disabled={!p.isActive && p.id !== user.subscription?.plan.id}>
                  {p.name}
                  {p.maxBoards === null ? " · unlimited boards" : ` · ${p.maxBoards} boards`}
                  {!p.isActive ? " (inactive)" : ""}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Subscription status">
            <Select value={subStatus} disabled={!planId} onChange={(e) => setSubStatus(e.target.value as SubscriptionStatus)}>
              {SUB_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s.replace("_", " ")}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <div className="mt-4 flex items-center justify-between gap-3">
          <span className="text-xs text-[var(--lp-text-muted)]">Plans are assigned manually — no payment is taken.</span>
          <Button
            variant="dark"
            size="sm"
            disabled={!planDirty || busy !== null}
            onClick={() =>
              run(
                "plan",
                async () => {
                  onSaved(await setSubscription(token, user.id, { planId: planId || null, status: subStatus }));
                },
                "Subscription updated.",
              )
            }
          >
            {busy === "plan" ? "Saving…" : "Update subscription"}
          </Button>
        </div>
      </Section>

      <Section title="Reset password">
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            type="password"
            autoComplete="new-password"
            placeholder="New password (min. 8 characters)"
            aria-label="New password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <Button
            className="flex-none"
            disabled={password.length < 8 || busy !== null}
            onClick={() =>
              run(
                "password",
                async () => {
                  await updateUser(token, user.id, { password });
                  setPassword("");
                },
                "Password changed. Share the new password with the user securely.",
              )
            }
          >
            {busy === "password" ? "Saving…" : "Set password"}
          </Button>
        </div>
      </Section>

      {!isSelf && (
        <Section title="Delete account">
          <p className="text-sm text-[var(--lp-text-muted)]">
            Permanently deletes this user with all of their boards and folders. This can&apos;t be undone. Type{" "}
            <strong className="font-medium text-[var(--lp-text)]">{user.email}</strong> to confirm.
          </p>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <Input
              value={confirmDelete}
              onChange={(e) => setConfirmDelete(e.target.value)}
              placeholder={user.email}
              aria-label="Type the email to confirm deletion"
            />
            <Button
              variant="danger"
              className="flex-none"
              disabled={confirmDelete.trim().toLowerCase() !== user.email || busy !== null}
              onClick={async () => {
                setBusy("delete");
                setMessage(null);
                try {
                  await deleteUser(token, user.id);
                  onDeleted();
                } catch (err) {
                  setMessage({ tone: "red", text: (err as Error).message });
                  setBusy(null);
                }
              }}
            >
              {busy === "delete" ? "Deleting…" : "Delete user"}
            </Button>
          </div>
        </Section>
      )}
    </Modal>
  );
}
