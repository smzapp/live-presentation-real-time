"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth/AuthContext";
import {
  getMailStatus,
  getSettings,
  listPlans,
  sendTestMail,
  updateSettings,
  type AppSettings,
  type MailStatus,
  type Plan,
} from "@/lib/admin/api";
import { Alert, Badge, Button, Card, CardHeader, Field, PageHeader, Select, Skeleton, Toggle, inputClass } from "@/components/app/ui";

const ANNOUNCEMENT_MAX = 280;

export default function AdminSettingsPage() {
  const { token } = useAuth();
  const [saved, setSaved] = useState<AppSettings | null>(null);
  const [draft, setDraft] = useState<AppSettings | null>(null);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ tone: "red" | "green"; text: string } | null>(null);
  const [mail, setMail] = useState<MailStatus | null>(null);
  const [mailTest, setMailTest] = useState<{ tone: "red" | "green"; text: string } | null>(null);
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    if (!token) return;
    Promise.all([getSettings(token), listPlans(token)])
      .then(([settings, planList]) => {
        setSaved(settings);
        setDraft(settings);
        setPlans(planList);
      })
      .catch((err: Error) => setMessage({ tone: "red", text: err.message }));
    getMailStatus(token)
      .then(setMail)
      .catch(() => setMail({ configured: false, ok: false, error: "Could not check the mail server" }));
  }, [token]);

  async function handleTestEmail() {
    if (!token) return;
    setTesting(true);
    setMailTest(null);
    try {
      const { sent, to } = await sendTestMail(token);
      setMailTest(
        sent
          ? { tone: "green", text: `Test email sent to ${to}.` }
          : { tone: "red", text: "Nothing was sent — email is only being written to the API log." },
      );
    } catch (err) {
      setMailTest({ tone: "red", text: (err as Error).message });
    } finally {
      setTesting(false);
    }
  }

  const dirty = !!saved && !!draft && JSON.stringify(saved) !== JSON.stringify(draft);

  async function handleSave() {
    if (!token || !draft) return;
    setSaving(true);
    setMessage(null);
    try {
      const next = await updateSettings(token, draft);
      setSaved(next);
      setDraft(next);
      setMessage({ tone: "green", text: "Settings saved." });
    } catch (err) {
      setMessage({ tone: "red", text: (err as Error).message });
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <PageHeader
        title="App settings"
        description="Workspace-wide options that apply to every user."
        actions={
          <>
            <Button disabled={!dirty || saving} onClick={() => setDraft(saved)}>
              Discard
            </Button>
            <Button variant="dark" disabled={!dirty || saving} onClick={handleSave}>
              {saving ? "Saving…" : "Save changes"}
            </Button>
          </>
        }
      />

      {message && (
        <div className="mb-4">
          <Alert tone={message.tone}>{message.text}</Alert>
        </div>
      )}

      {!draft ? (
        <Card className="p-5">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="mt-4 h-10" />
          <Skeleton className="mt-4 h-10" />
        </Card>
      ) : (
        <div className="flex flex-col gap-4">
          <Card>
            <CardHeader title="Sign-ups" description="Control how new people get an account." />
            <div className="flex flex-col gap-5 px-5 py-5">
              <div className="flex items-center justify-between gap-6">
                <span>
                  <span className="block text-sm font-medium text-[var(--lp-text)]">Allow public registration</span>
                  <span className="block text-[13px] text-[var(--lp-text-muted)]">
                    When off, only super admins can add users. Existing users can still sign in.
                  </span>
                </span>
                <Toggle
                  checked={draft.allowRegistration}
                  onChange={(allowRegistration) => setDraft({ ...draft, allowRegistration })}
                  label="Allow public registration"
                />
              </div>
              <Field label="Default plan for new users" hint="Assigned automatically at sign-up and when an admin adds a user.">
                <Select
                  value={draft.defaultPlanId ?? ""}
                  onChange={(e) => setDraft({ ...draft, defaultPlanId: e.target.value || null })}
                  className="sm:max-w-xs"
                >
                  <option value="">No plan</option>
                  {plans
                    .filter((p) => p.isActive || p.id === draft.defaultPlanId)
                    .map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                </Select>
              </Field>
              <Field
                label="Whiteboard media for guests"
                hint="What students who join a session without an account can add from the media tool. Signed-in users follow their plan."
              >
                <Select
                  value={draft.guestMedia}
                  onChange={(e) => setDraft({ ...draft, guestMedia: e.target.value as AppSettings["guestMedia"] })}
                  className="sm:max-w-xs"
                >
                  <option value="none">Nothing</option>
                  <option value="icons">Icons only</option>
                  <option value="library">Icons and the shared library</option>
                </Select>
              </Field>
            </div>
          </Card>

          <Card>
            <CardHeader
              title="Email"
              description="Account emails — address confirmation and password resets. Configured with SMTP_* in the API's environment, not here."
              action={
                mail ? (
                  mail.ok ? (
                    <Badge tone="green">Connected</Badge>
                  ) : mail.configured ? (
                    <Badge tone="red">Not reachable</Badge>
                  ) : (
                    <Badge tone="amber">Not configured</Badge>
                  )
                ) : undefined
              }
            />
            <div className="flex flex-col gap-3 px-5 py-5">
              <p className="text-sm text-[var(--lp-text-muted)]">
                {!mail ? (
                  "Checking the mail server…"
                ) : mail.ok ? (
                  "The mail server accepted a connection. Password reset and confirmation emails are being delivered."
                ) : mail.configured ? (
                  <>Configured, but the server didn&apos;t answer: {mail.error}</>
                ) : (
                  <>
                    No SMTP server is set, so emails aren&apos;t sent — each one is written to the API log instead, links
                    included. Set SMTP_HOST (and MAIL_FROM, APP_URL) to start sending them.
                  </>
                )}
              </p>
              {mailTest && <Alert tone={mailTest.tone}>{mailTest.text}</Alert>}
              <div>
                <Button onClick={handleTestEmail} disabled={testing}>
                  {testing ? "Sending…" : "Send me a test email"}
                </Button>
              </div>
            </div>
          </Card>

          <Card>
            <CardHeader title="Announcement" description="Shown at the top of every user's dashboard. Leave empty to hide it." />
            <div className="px-5 py-5">
              <Field label="Message" hint={`${draft.announcement.length}/${ANNOUNCEMENT_MAX} characters`}>
                <textarea
                  rows={3}
                  maxLength={ANNOUNCEMENT_MAX}
                  value={draft.announcement}
                  onChange={(e) => setDraft({ ...draft, announcement: e.target.value })}
                  placeholder="e.g. Scheduled maintenance this Saturday 9–10pm."
                  className={`${inputClass} h-auto resize-y py-2`}
                />
              </Field>
            </div>
          </Card>
        </div>
      )}
    </>
  );
}
