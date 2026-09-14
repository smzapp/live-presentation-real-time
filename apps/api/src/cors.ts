const LOCALHOST_ORIGIN = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;

// Private-network IP ranges (RFC 1918) so the dev server is reachable from
// another device on the same LAN, e.g. a phone hitting http://192.168.1.60:3000.
const LAN_ORIGIN =
  /^https?:\/\/(10(\.\d{1,3}){3}|192\.168(\.\d{1,3}){2}|172\.(1[6-9]|2\d|3[01])(\.\d{1,3}){2})(:\d+)?$/;

const configured = process.env.FRONTEND_ORIGIN?.split(',').map((o) => o.trim());

export function corsOriginCheck(
  origin: string | undefined,
  callback: (err: Error | null, allow?: boolean) => void,
) {
  if (!origin) return callback(null, true);
  if (configured?.includes(origin)) return callback(null, true);
  if (!configured && (LOCALHOST_ORIGIN.test(origin) || LAN_ORIGIN.test(origin))) {
    return callback(null, true);
  }
  callback(null, false);
}
