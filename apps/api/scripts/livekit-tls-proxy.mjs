// LiveKit's self-hosted server has no built-in TLS for its main signaling
// port (self-hosted deployments are expected to sit behind a TLS-terminating
// reverse proxy — see LiveKit's deployment docs). iOS Safari refuses the
// LiveKit connection over plain ws:// from a LAN IP (needs a secure context),
// so this is a minimal dependency-free stand-in for that proxy: terminate TLS
// with our local dev cert, then relay raw bytes to LiveKit's plain ws port.
// It doesn't parse HTTP/WS at all, so it works for both regardless of
// protocol details.
import { createServer } from "node:tls";
import { connect } from "node:net";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const CERT_DIR = process.env.HTTPS_CERT_DIR ?? resolve(import.meta.dirname, "..", "..", "..", "certs");
const KEY_PATH = resolve(CERT_DIR, "key.pem");
const CERT_PATH = resolve(CERT_DIR, "cert.pem");
const TARGET_PORT = Number(process.env.LIVEKIT_PLAIN_PORT ?? 7880);
const LISTEN_PORT = Number(process.env.LIVEKIT_TLS_PORT ?? 7443);

if (!existsSync(KEY_PATH) || !existsSync(CERT_PATH)) {
  console.error(`No cert found at ${CERT_DIR} — generate certs/key.pem + certs/cert.pem first.`);
  process.exit(1);
}

const server = createServer(
  { key: readFileSync(KEY_PATH), cert: readFileSync(CERT_PATH) },
  (tlsSocket) => {
    const backend = connect(TARGET_PORT, "127.0.0.1");
    const cleanup = () => {
      tlsSocket.destroy();
      backend.destroy();
    };
    tlsSocket.pipe(backend);
    backend.pipe(tlsSocket);
    tlsSocket.on("error", cleanup);
    backend.on("error", cleanup);
    tlsSocket.on("close", () => backend.destroy());
    backend.on("close", () => tlsSocket.destroy());
  },
);

server.listen(LISTEN_PORT, () => {
  console.log(`LiveKit TLS proxy: wss://<this-host>:${LISTEN_PORT} -> ws://127.0.0.1:${TARGET_PORT}`);
});
