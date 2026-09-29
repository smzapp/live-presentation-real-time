import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Opening the dev server from another device on the Wi-Fi (a phone at
  // https://192.168.1.60:3000) otherwise renders a blank page: Next blocks
  // cross-origin requests to dev-only endpoints, so the HTML arrives but the
  // App Router's own fetches come back 403. Only the hostname is matched,
  // and each `*` stands in for one label — so these cover a machine on any
  // private network. Development only; it has no effect on a build.
  allowedDevOrigins: ["192.168.*.*", "10.*.*.*", "172.16.*.*", "172.17.*.*"],
};

export default nextConfig;
