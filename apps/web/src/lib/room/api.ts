// Falls back to the page's own hostname instead of a hardcoded "localhost" so
// this also works when the app is opened from another device on the LAN
// (e.g. http://192.168.1.60:3000).
function deriveUrl(envValue: string | undefined, protocol: string, port: number): string {
  if (envValue) return envValue;
  if (typeof window !== "undefined") return `${protocol}://${window.location.hostname}:${port}`;
  return `${protocol}://localhost:${port}`;
}

const API_URL = deriveUrl(process.env.NEXT_PUBLIC_API_URL, "http", 3002);
const LIVEKIT_URL = deriveUrl(process.env.NEXT_PUBLIC_LIVEKIT_URL, "ws", 7880);

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

export { API_URL, LIVEKIT_URL };
