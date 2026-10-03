import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The browser suite drives 127.0.0.1 directly; without this the dev server
  // blocks its own HMR websocket as a cross-origin request.
  allowedDevOrigins: ["127.0.0.1", "localhost"],

  // PGlite ships its WASM binary and its seed data as files next to the bundle.
  // If it is bundled, the asset references become URL objects and
  // `fs.readFile` rejects them, so the driver has to stay external and be
  // resolved from node_modules at runtime. Both Postgres drivers are external
  // for the same reason.
  serverExternalPackages: ["@electric-sql/pglite", "@neondatabase/serverless"],
};

export default nextConfig;