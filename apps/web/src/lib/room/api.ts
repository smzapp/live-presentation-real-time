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

export async function createRoom(title: string): Promise<CreateRoomResult> {
  const res = await fetch(`${API_URL}/rooms`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
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
}

export async function lookupRoom(code: string): Promise<RoomLookupResult | null> {
  const res = await fetch(`${API_URL}/rooms/${encodeURIComponent(code)}`);
  if (!res.ok) return null;
  return res.json();
}

export { API_URL, LIVEKIT_URL };
