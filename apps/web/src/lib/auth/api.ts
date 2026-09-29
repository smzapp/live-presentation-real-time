import { API_URL } from "@/lib/room/api";
import { errorMessage } from "@/lib/http";
import type { AuthUser } from "./AuthContext";

// Account emails: confirming an address and resetting a forgotten password.
// Signing in and registering live in AuthContext, since they also set the
// signed-in session.

async function post<T>(path: string, body: unknown, fallback: string, token?: string): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await errorMessage(res, fallback));
  return (await res.json()) as T;
}

// Always succeeds, whether or not that address has an account — the answer
// deliberately doesn't say.
export function requestPasswordReset(email: string) {
  return post<{ ok: true }>("/auth/forgot-password", { email }, "Could not send the reset email");
}

// Resolves to a session: choosing a new password signs you straight in.
export function resetPassword(token: string, password: string) {
  return post<{ token: string; user: AuthUser }>(
    "/auth/reset-password",
    { token, password },
    "Could not reset your password",
  );
}

export function verifyEmail(token: string) {
  return post<{ email: string }>("/auth/verify-email", { token }, "Could not confirm your email");
}

export function resendVerification(token: string) {
  return post<{ verified: boolean }>(
    "/auth/resend-verification",
    {},
    "Could not send the confirmation email",
    token,
  );
}
