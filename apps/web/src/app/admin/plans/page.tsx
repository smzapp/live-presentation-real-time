"use client";

import { useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { useAuth } from "@/lib/auth/AuthContext";
import { createPlan, deletePlan, listPlans, updatePlan, type Plan, type PlanInput } from "@/lib/admin/api";
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
  Toggle,
  formatPrice,
} from "@/components/app/ui";

function describeMedia(plan: Plan) {
  const uploads = plan.mediaUpload
    ? plan.maxMediaUploads === null
      ? "Unlimited uploads"
      : `${plan.maxMediaUploads} uploads`
    : null;
  if (uploads && plan.mediaLibrary) return `${uploads} + library`;
  if (uploads) return uploads;
  return plan.mediaLibrary ? "Library & icons" : "Icons only";
}

export default function AdminPlansPage() {
  const { token } = useAuth();
  const [plans, setPlans] = useState<Plan[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Plan | "new" | null>(null);
  const [deleting, setDeleting] = useState<Plan | null>(null);

  const [reloadKey, setReloadKey] = useState(0);
  const load = () => setReloadKey((k) => k + 1);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    listPlans(token)
      .then((result) => {
        if (!cancelled) setPlans(result);
      })
      .catch((err: Error) => {
        if (!cancelled) setError(err.message);
      });
    return () => {
      cancelled = true;
    };
  }, [token, reloadKey]);

  return (
    <>
      <PageHeader
        title="Plans"
        description="Plans set limits for users. There's no payment integration — assign plans from the Users page."
        actions={
          <Button variant="dark" onClick={() => setEditing("new")}>
            <Plus size={15} /> New plan
          </Button>
        }
      />

      {error && (
        <div className="mb-4">
          <Alert>{error}</Alert>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {!plans
          ? Array.from({ length: 2 }, (_, i) => (
              <Card key={i} className="p-5">
                <Skeleton className="h-5 w-24" />
                <Skeleton className="mt-3 h-8 w-20" />
                <Skeleton className="mt-4 h-4" />
              </Card>
            ))
          : plans.map((plan) => (
              <Card key={plan.id} className="flex flex-col p-5">
                <div className="flex items-start justify-between gap-2">
                  <h2 className="text-base font-semibold text-[var(--lp-text)]">{plan.name}</h2>
                  {plan.isActive ? <Badge tone="green">Active</Badge> : <Badge>Inactive</Badge>}
                </div>
                <p className="mt-2 text-[26px] font-semibold tracking-tight text-[var(--lp-text)]">
                  {formatPrice(plan.priceCents, plan.interval)}
                </p>
                {plan.description && <p className="mt-1 text-sm text-[var(--lp-text-muted)]">{plan.description}</p>}
                <dl className="mt-4 grid grid-cols-2 gap-3 border-t border-[var(--lp-border)] pt-4 text-sm">
                  <div>
                    <dt className="text-xs text-[var(--lp-text-muted)]">Board limit</dt>
                    <dd className="font-medium text-[var(--lp-text)]">{plan.maxBoards === null ? "Unlimited" : plan.maxBoards}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-[var(--lp-text-muted)]">Whiteboard media</dt>
                    <dd className="font-medium text-[var(--lp-text)]">{describeMedia(plan)}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-[var(--lp-text-muted)]">Subscribers</dt>
                    <dd className="font-medium text-[var(--lp-text)]">{plan.subscriberCount ?? 0}</dd>
                  </div>
                </dl>
                <div className="mt-5 flex gap-2">
                  <Button size="sm" onClick={() => setEditing(plan)}>
                    Edit
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setDeleting(plan)}>
                    Delete
                  </Button>
                </div>
              </Card>
            ))}
      </div>

      {editing && token && (
        <PlanModal
          token={token}
          plan={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            load();
          }}
        />
      )}

      {deleting && token && (
        <DeletePlanModal
          token={token}
          plan={deleting}
          onClose={() => setDeleting(null)}
          onDeleted={() => {
            setDeleting(null);
            load();
          }}
        />
      )}
    </>
  );
}

function PlanModal({
  token,
  plan,
  onClose,
  onSaved,
}: {
  token: string;
  plan: Plan | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(plan?.name ?? "");
  const [description, setDescription] = useState(plan?.description ?? "");
  const [price, setPrice] = useState(plan ? (plan.priceCents / 100).toString() : "0");
  const [interval, setBillingInterval] = useState<Plan["interval"]>(plan?.interval ?? "month");
  const [maxBoards, setMaxBoards] = useState(plan?.maxBoards === null || !plan ? "" : String(plan.maxBoards));
  const [isActive, setIsActive] = useState(plan?.isActive ?? true);
  const [mediaLibrary, setMediaLibrary] = useState(plan?.mediaLibrary ?? true);
  const [mediaUpload, setMediaUpload] = useState(plan?.mediaUpload ?? false);
  const [maxMediaUploads, setMaxMediaUploads] = useState(
    plan?.maxMediaUploads === null || !plan ? "" : String(plan.maxMediaUploads),
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const priceNumber = Number(price);
    if (!Number.isFinite(priceNumber) || priceNumber < 0) {
      setError("Enter a price of 0 or more.");
      return;
    }
    const limit = maxBoards.trim() === "" ? null : Number(maxBoards);
    if (limit !== null && (!Number.isInteger(limit) || limit < 0)) {
      setError("Board limit must be a whole number, or empty for unlimited.");
      return;
    }
    const uploadLimit = maxMediaUploads.trim() === "" ? null : Number(maxMediaUploads);
    if (uploadLimit !== null && (!Number.isInteger(uploadLimit) || uploadLimit < 0)) {
      setError("Upload limit must be a whole number, or empty for unlimited.");
      return;
    }
    const input: PlanInput = {
      name,
      description,
      priceCents: Math.round(priceNumber * 100),
      interval,
      maxBoards: limit,
      mediaLibrary,
      mediaUpload,
      maxMediaUploads: uploadLimit,
      isActive,
    };
    setSaving(true);
    setError(null);
    try {
      if (plan) await updatePlan(token, plan.id, input);
      else await createPlan(token, input);
      onSaved();
    } catch (err) {
      setError((err as Error).message);
      setSaving(false);
    }
  }

  return (
    <Modal
      title={plan ? `Edit ${plan.name}` : "New plan"}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="dark" type="submit" form="plan-form" disabled={saving}>
            {saving ? "Saving…" : "Save plan"}
          </Button>
        </>
      }
    >
      <form id="plan-form" onSubmit={handleSubmit} className="flex flex-col gap-4">
        <Field label="Name">
          <Input required maxLength={60} value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Description">
          <Input maxLength={300} value={description} onChange={(e) => setDescription(e.target.value)} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Price (USD)">
            <Input type="number" min="0" step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} />
          </Field>
          <Field label="Billing interval">
            <Select value={interval} onChange={(e) => setBillingInterval(e.target.value as Plan["interval"])}>
              <option value="month">Monthly</option>
              <option value="year">Yearly</option>
            </Select>
          </Field>
        </div>
        <Field label="Board limit" hint="Leave empty for unlimited boards.">
          <Input type="number" min="0" step="1" placeholder="Unlimited" value={maxBoards} onChange={(e) => setMaxBoards(e.target.value)} />
        </Field>
        <div className="flex flex-col gap-3 rounded-lg border border-[var(--lp-border)] px-3 py-2.5">
          <span className="text-xs font-semibold uppercase tracking-wide text-[var(--lp-text-muted)]">Whiteboard media</span>
          <div className="flex items-center justify-between gap-4">
            <span>
              <span className="block text-sm font-medium text-[var(--lp-text)]">Shared library</span>
              <span className="block text-xs text-[var(--lp-text-muted)]">
                Browse the images admins add under Admin → Media. Icons are always included.
              </span>
            </span>
            <Toggle checked={mediaLibrary} onChange={setMediaLibrary} label="Shared media library" />
          </div>
          <div className="flex items-center justify-between gap-4">
            <span>
              <span className="block text-sm font-medium text-[var(--lp-text)]">Own uploads</span>
              <span className="block text-xs text-[var(--lp-text-muted)]">Upload their own images and reuse them on any board.</span>
            </span>
            <Toggle checked={mediaUpload} onChange={setMediaUpload} label="Allow image uploads" />
          </div>
          {mediaUpload && (
            <Field label="Upload limit" hint="How many images they can keep. Leave empty for unlimited.">
              <Input
                type="number"
                min="0"
                step="1"
                placeholder="Unlimited"
                value={maxMediaUploads}
                onChange={(e) => setMaxMediaUploads(e.target.value)}
              />
            </Field>
          )}
        </div>
        <div className="flex items-center justify-between gap-4 rounded-lg border border-[var(--lp-border)] px-3 py-2.5">
          <span>
            <span className="block text-sm font-medium text-[var(--lp-text)]">Available</span>
            <span className="block text-xs text-[var(--lp-text-muted)]">Inactive plans can&apos;t be assigned to more users.</span>
          </span>
          <Toggle checked={isActive} onChange={setIsActive} label="Plan available" />
        </div>
        {error && <Alert>{error}</Alert>}
      </form>
    </Modal>
  );
}

function DeletePlanModal({
  token,
  plan,
  onClose,
  onDeleted,
}: {
  token: string;
  plan: Plan;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <Modal
      title={`Delete ${plan.name}?`}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="danger"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              setError(null);
              try {
                await deletePlan(token, plan.id);
                onDeleted();
              } catch (err) {
                setError((err as Error).message);
                setBusy(false);
              }
            }}
          >
            {busy ? "Deleting…" : "Delete plan"}
          </Button>
        </>
      }
    >
      <p className="text-sm text-[var(--lp-text-muted)]">
        This permanently removes the plan. Plans with subscribers or set as the default can&apos;t be deleted — deactivate
        them instead.
      </p>
      {error && (
        <div className="mt-3">
          <Alert>{error}</Alert>
        </div>
      )}
    </Modal>
  );
}
