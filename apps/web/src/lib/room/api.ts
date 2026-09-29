// Falls back to the page's own hostname instead of a hardcoded "localhost" so
// this also works when the app is opened from another device on the LAN
// (e.g. http://192.168.1.60:3000). Also matches the page's own scheme: when
// this page was loaded over https (LAN/mobile testing — iOS Safari refuses
// camera/mic and other APIs over plain http on a non-localhost origin),
// fetches/websockets to the API and LiveKit must be https/wss too, or the
// browser blocks them as mixed content.
const isSecurePage = typeof window !== "undefined" && window.location.protocol === "https:";

function deriveUrl(
  envValue: string | undefined,
  insecureScheme: string,
  secureScheme: string,
  port: number,
): string {
  if (envValue) return envValue;
  const scheme = isSecurePage ? secureScheme : insecureScheme;
  if (typeof window !== "undefined") return `${scheme}://${window.location.hostname}:${port}`;
  return `${scheme}://localhost:${port}`;
}

const API_URL = deriveUrl(process.env.NEXT_PUBLIC_API_URL, "http", "https", 3002);
// LiveKit's dev config runs a plain ws:// listener on 7880 and a TLS wss://
// listener on 7443 side by side (see apps/api/vendor/livekit/livekit.yaml).
const LIVEKIT_URL = deriveUrl(
  process.env.NEXT_PUBLIC_LIVEKIT_URL,
  "ws",
  "wss",
  isSecurePage ? 7443 : 7880,
);

export interface CreateRoomResult {
  code: string;
  title: string;
  hostToken: string;
}

// Signed in, the session carries the host's plan (paid drawing tools for the
// room; one metered session on pay-as-you-go).
export async function createRoom(title: string, token?: string | null): Promise<CreateRoomResult> {
  const res = await fetch(`${API_URL}/rooms`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify({ title }),
  });
  if (!res.ok) throw new Error("Could not start a session. Please try again.");
  return res.json();
}

export interface RoomLookupResult {
  code: string;
  title: string;
  mode: "slides" | "whiteboard";
  participantCount: number;
  // Whether the join page has to ask for the session passcode. The passcode
  // itself never leaves the host's browser except in the invite link.
  requireKey: boolean;
  // Whether the passcode passed to lookupRoom was the right one. True when
  // the session doesn't need one at all.
  keyValid: boolean;
}

// Passing the passcode checks it in the same round trip, so the join page can
// open the session straight away instead of bouncing off the socket.
export async function lookupRoom(code: string, key?: string): Promise<RoomLookupResult | null> {
  const query = key ? `?key=${encodeURIComponent(key)}` : "";
  const res = await fetch(`${API_URL}/rooms/${encodeURIComponent(code)}${query}`);
  if (!res.ok) return null;
  return res.json();
}

export { API_URL, LIVEKIT_URL };
