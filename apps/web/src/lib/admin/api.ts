import { API_URL } from "@/lib/room/api";
import type { UserRole } from "@/lib/auth/AuthContext";
import { errorMessage } from "@/lib/http";
import type { BillingType, DrawingTool } from "@/lib/billing/api";

export type ToolAvailability = "on" | "premium" | "off";

export type UserStatus = "active" | "suspended";
export type MediaAccess = "plan" | "full" | "none";
export type GuestMediaAccess = "none" | "icons" | "library";
export type SubscriptionStatus = "active" | "trialing" | "past_due" | "canceled";

export interface Plan {
  id: string;
  name: string;
  description: string;
  priceCents: number;
  interval: "month" | "year";
  maxBoards: number | null;
  billingType: BillingType;
  unitPriceCents: number;
  premiumTools: boolean;
  highlight: boolean;
  mediaLibrary: boolean;
  mediaUpload: boolean;
  maxMediaUploads: number | null;
  isActive: boolean;
  createdAt: string;
  subscriberCount?: number;
}

export interface Subscription {
  id: string;
  planId: string;
  status: SubscriptionStatus;
  startedAt: string;
  renewsAt: string | null;
  canceledAt: string | null;
  plan: Plan;
}

export interface AdminUser {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  status: UserStatus;
  mediaAccess: MediaAccess;
  createdAt: string;
  lastLoginAt: string | null;
  boardCount: number;
  subscription: { status: SubscriptionStatus; plan: { id: string; name: string } } | null;
}

export interface AdminStats {
  users: number;
  newUsersThisWeek: number;
  suspendedUsers: number;
  superAdmins: number;
  boards: number;
  mediaAssets: number;
  activeSubscriptions: number;
  // Monthly recurring revenue from flat-price plans (yearly prices / 12).
  mrrCents: number;
  payAsYouGo: { sessions: number; amountCents: number; users: number };
  liveSessions: { thisWeek: number; activeNow: number };
  signups: { date: string; count: number }[];
  usersWithoutPlan: number;
  plans: { id: string; name: string; subscribers: number; isActive: boolean; billingType: BillingType }[];
}

export interface AppSettings {
  allowRegistration: boolean;
  defaultPlanId: string | null;
  announcement: string;
  guestMedia: GuestMediaAccess;
  drawingTools: Record<DrawingTool, ToolAvailability>;
}

export interface Account {
  subscription: Subscription | null;
  boardCount: number;
  announcement: string;
}

async function request<T>(token: string, method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(await errorMessage(res, "Something went wrong. Please try again."));
  return res.json() as Promise<T>;
}

export const getAccount = (token: string) => request<Account>(token, "GET", "/auth/me/account");

export const getStats = (token: string) => request<AdminStats>(token, "GET", "/admin/stats");

export function listUsers(token: string, params: { search?: string; page?: number; role?: string; status?: string }) {
  const qs = new URLSearchParams();
  if (params.search) qs.set("search", params.search);
  if (params.page) qs.set("page", String(params.page));
  if (params.role) qs.set("role", params.role);
  if (params.status) qs.set("status", params.status);
  return request<{ users: AdminUser[]; total: number; page: number; pageSize: number }>(
    token,
    "GET",
    `/admin/users?${qs.toString()}`,
  );
}

export const createUser = (token: string, input: { name: string; email: string; password: string; role: UserRole }) =>
  request<AdminUser>(token, "POST", "/admin/users", input);

export const updateUser = (
  token: string,
  id: string,
  input: Partial<{
    name: string;
    email: string;
    role: UserRole;
    status: UserStatus;
    password: string;
    mediaAccess: MediaAccess;
  }>,
) => request<AdminUser>(token, "PATCH", `/admin/users/${id}`, input);

export const deleteUser = (token: string, id: string) => request<{ ok: true }>(token, "DELETE", `/admin/users/${id}`);

export const setSubscription = (token: string, id: string, input: { planId: string | null; status?: SubscriptionStatus }) =>
  request<AdminUser>(token, "PUT", `/admin/users/${id}/subscription`, input);

export const listPlans = (token: string) => request<Plan[]>(token, "GET", "/admin/plans");

export type PlanInput = Pick<
  Plan,
  | "name"
  | "description"
  | "priceCents"
  | "interval"
  | "maxBoards"
  | "billingType"
  | "unitPriceCents"
  | "premiumTools"
  | "highlight"
  | "mediaLibrary"
  | "mediaUpload"
  | "maxMediaUploads"
  | "isActive"
>;

export const createPlan = (token: string, input: PlanInput) => request<Plan>(token, "POST", "/admin/plans", input);

export const updatePlan = (token: string, id: string, input: Partial<PlanInput>) =>
  request<Plan>(token, "PATCH", `/admin/plans/${id}`, input);

export const deletePlan = (token: string, id: string) => request<{ ok: true }>(token, "DELETE", `/admin/plans/${id}`);

export const getSettings = (token: string) => request<AppSettings>(token, "GET", "/admin/settings");

export const updateSettings = (token: string, input: Partial<AppSettings>) =>
  request<AppSettings>(token, "PATCH", "/admin/settings", input);

export async function getAuthConfig(): Promise<{ allowRegistration: boolean }> {
  const res = await fetch(`${API_URL}/auth/config`);
  if (!res.ok) return { allowRegistration: true };
  return res.json();
}
