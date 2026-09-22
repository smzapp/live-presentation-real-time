import { API_URL } from "@/lib/room/api";
import { errorMessage } from "@/lib/http";

export type BillingType = "subscription" | "payg";
export type SubscriptionStatus = "active" | "trialing" | "past_due" | "canceled";

export type DrawingTool =
  | "pen"
  | "signature"
  | "highlighter"
  | "eraser"
  | "line"
  | "rectangle"
  | "ellipse"
  | "shapes"
  | "text"
  | "sticky"
  | "math"
  | "media";

export interface PublicPlan {
  id: string;
  name: string;
  description: string;
  priceCents: number;
  interval: "month" | "year";
  billingType: BillingType;
  // Pay-as-you-go: price per live session hosted.
  unitPriceCents: number;
  maxBoards: number | null;
  mediaLibrary: boolean;
  mediaUpload: boolean;
  maxMediaUploads: number | null;
  premiumTools: boolean;
  highlight: boolean;
}

export interface Entitlements {
  premiumTools: boolean;
  tools: DrawingTool[];
}

export interface BillingAccount {
  // False while no payment provider is connected: plan changes apply
  // immediately and nothing is charged.
  paymentsEnabled: boolean;
  subscription: {
    status: SubscriptionStatus;
    startedAt: string;
    canceledAt: string | null;
    plan: PublicPlan;
  } | null;
  usage: {
    periodStart: string;
    sessions: number;
    amountCents: number;
    recent: { id: string; kind: string; quantity: number; unitPriceCents: number; reference: string | null; createdAt: string }[];
  };
  entitlements: Entitlements;
}

function authHeaders(token: string | null): Record<string, string> {
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function json<T>(res: Response, fallback: string): Promise<T> {
  if (!res.ok) throw new Error(await errorMessage(res, fallback));
  return res.json() as Promise<T>;
}

export async function listPublicPlans(): Promise<PublicPlan[]> {
  return json(await fetch(`${API_URL}/billing/plans`), "Couldn't load plans");
}

export async function getBillingAccount(token: string): Promise<BillingAccount> {
  return json(await fetch(`${API_URL}/billing/me`, { headers: authHeaders(token) }), "Couldn't load your plan");
}

export async function subscribeToPlan(token: string, planId: string): Promise<BillingAccount> {
  return json(
    await fetch(`${API_URL}/billing/subscribe`, {
      method: "POST",
      headers: { ...authHeaders(token), "Content-Type": "application/json" },
      body: JSON.stringify({ planId }),
    }),
    "Couldn't change your plan",
  );
}

export async function cancelPlan(token: string): Promise<BillingAccount> {
  return json(
    await fetch(`${API_URL}/billing/cancel`, { method: "POST", headers: authHeaders(token) }),
    "Couldn't cancel your plan",
  );
}

export async function getDrawingTools(token: string | null): Promise<Entitlements> {
  return json(await fetch(`${API_URL}/drawing/tools`, { headers: authHeaders(token) }), "Couldn't load drawing tools");
}

export function formatCents(cents: number) {
  return cents % 100 === 0 ? `$${cents / 100}` : `$${(cents / 100).toFixed(2)}`;
}

// The feature list a plan card shows.
export function planFeatures(plan: PublicPlan): string[] {
  const features = [
    plan.maxBoards === null ? "Unlimited boards" : `Up to ${plan.maxBoards} boards`,
    plan.premiumTools ? "Every drawing tool, incl. equations & signature pen" : "Core drawing tools",
    plan.mediaUpload
      ? plan.maxMediaUploads === null
        ? "Unlimited image uploads"
        : `${plan.maxMediaUploads} image uploads`
      : "Icons" + (plan.mediaLibrary ? " & shared image library" : ""),
    "Live sessions with video, chat & screen sharing",
  ];
  if (plan.mediaUpload && plan.mediaLibrary) features.splice(3, 0, "Shared image library & icons");
  return features;
}
