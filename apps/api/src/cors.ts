const LOCALHOST_ORIGIN = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;

const configured = process.env.FRONTEND_ORIGIN?.split(',').map((o) => o.trim());

export function corsOriginCheck(
  origin: string | undefined,
  callback: (err: Error | null, allow?: boolean) => void,
) {
  if (!origin) return callback(null, true);
  if (configured?.includes(origin)) return callback(null, true);
  if (!configured && LOCALHOST_ORIGIN.test(origin)) return callback(null, true);
  callback(null, false);
}
