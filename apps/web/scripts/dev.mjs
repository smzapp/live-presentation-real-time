import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { spawn } from "node:child_process";

const port = process.env.PORT || "3000";
const certDir = process.env.HTTPS_CERT_DIR ?? resolve(import.meta.dirname, "..", "..", "..", "certs");
const keyPath = resolve(certDir, "key.pem");
const certPath = resolve(certDir, "cert.pem");

// Same LAN/mobile HTTPS story as the API: serve over HTTPS when a cert is
// present (iOS Safari needs a secure context for camera/mic and the LiveKit
// connection over a LAN IP), otherwise behave exactly as before.
const useHttps = existsSync(keyPath) && existsSync(certPath);
const args = ["next", "dev", "--port", port];
if (useHttps) {
  args.push("--experimental-https", "--experimental-https-key", keyPath, "--experimental-https-cert", certPath);
}

const child = spawn("npx", args, {
  stdio: "inherit",
  shell: process.platform === "win32",
});

child.on("exit", (code) => process.exit(code ?? 0));
