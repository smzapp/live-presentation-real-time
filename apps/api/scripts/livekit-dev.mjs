// Starts everything the web app's video needs in local dev, in one command:
//   - the vendored LiveKit server in --dev mode (API key "devkey" / secret
//     "secret", matching LiveKitService's defaults) on ws://<host>:7880
//   - the TLS proxy on wss://<host>:7443, when certs/ exists — the web app
//     connects there whenever the page itself is served over https
// Without these running, the browser reports "could not establish signal
// connection: Failed to fetch" as soon as a camera or mic is turned on.
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const exe = process.platform === "win32" ? "livekit-server.exe" : "livekit-server";
const binary = process.env.LIVEKIT_BIN ?? resolve(root, "vendor", "livekit", exe);
const certDir = process.env.HTTPS_CERT_DIR ?? resolve(root, "..", "..", "certs");
const hasCerts = existsSync(resolve(certDir, "key.pem")) && existsSync(resolve(certDir, "cert.pem"));

if (!existsSync(binary)) {
  console.error(
    `LiveKit server binary not found at ${binary}.\n` +
      "Download livekit-server from https://github.com/livekit/livekit/releases into apps/api/vendor/livekit/ " +
      "(or set LIVEKIT_BIN).",
  );
  process.exit(1);
}

const children = [];

function run(label, command, args) {
  const child = spawn(command, args, { cwd: root, stdio: ["ignore", "pipe", "pipe"] });
  const prefix = (chunk) =>
    chunk
      .toString()
      .split(/\r?\n/)
      .filter(Boolean)
      .map((line) => `[${label}] ${line}`)
      .join("\n") + "\n";
  child.stdout.on("data", (c) => process.stdout.write(prefix(c)));
  child.stderr.on("data", (c) => process.stderr.write(prefix(c)));
  child.on("exit", (code) => {
    console.error(`[${label}] exited with code ${code}`);
    shutdown(code ?? 1);
  });
  children.push(child);
}

let shuttingDown = false;
function shutdown(code) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const child of children) child.kill();
  process.exit(code);
}
process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));

// --bind 0.0.0.0 so phones/laptops on the LAN can reach it too, not just localhost.
run("livekit", binary, ["--dev", "--bind", "0.0.0.0"]);

if (hasCerts) {
  run("tls-proxy", process.execPath, [resolve(root, "scripts", "livekit-tls-proxy.mjs")]);
} else {
  console.log(`[livekit-dev] No certs in ${certDir} — skipping the wss:// proxy (only needed when the web app runs on https).`);
}
