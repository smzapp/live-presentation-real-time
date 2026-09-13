const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3002";

export interface CreateRoomResult {
  code: string;
  title: string;
  hostToken: string;
}

export async function createRoom(title: string): Promise<CreateRoomResult> {
  const res = await fetch(`${API_URL}/rooms`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title }),
  });
  if (!res.ok) throw new Error("Could not start a session. Please try again.");
  return res.json();
}

export async function lookupRoom(
  code: string,
): Promise<{ code: string; title: string } | null> {
  const res = await fetch(`${API_URL}/rooms/${encodeURIComponent(code)}`);
  if (!res.ok) return null;
  return res.json();
}

export { API_URL };
