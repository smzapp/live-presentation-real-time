import { networkInterfaces } from 'node:os';

// Private IPv4 ranges (RFC 1918) — the addresses a phone on the same Wi-Fi
// can actually reach.
const PRIVATE_RANGES = [/^192\.168\./, /^10\./, /^172\.(1[6-9]|2\d|3[01])\./];

// The machine's address on the local network, for invite links that have to
// work on another device. A host presenting from http://localhost:3000 would
// otherwise hand out a link — and a QR code — that only their own machine can
// open.
//
// Read fresh each time rather than cached: a laptop that moves between
// networks would otherwise keep handing out the address of the one it left.
// Returns null when there's no private address (a deployed server), and the
// invite link then simply uses whatever host the page was opened on.
export function lanAddress(): string | null {
  const candidates: string[] = [];
  for (const addresses of Object.values(networkInterfaces())) {
    for (const address of addresses ?? []) {
      // Node 18+ reports family as the number 4; older typings say '4'.
      const isIPv4 = address.family === 'IPv4' || (address.family as unknown as number) === 4;
      if (!isIPv4 || address.internal) continue;
      if (PRIVATE_RANGES.some((range) => range.test(address.address))) {
        candidates.push(address.address);
      }
    }
  }
  // 192.168.x.x first: on a laptop with Docker or a VPN up, that's the one
  // the phone in the room is on.
  candidates.sort((a, b) => Number(b.startsWith('192.168.')) - Number(a.startsWith('192.168.')));
  return candidates[0] ?? null;
}
