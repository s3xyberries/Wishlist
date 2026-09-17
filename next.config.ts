import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  // Dev clients often open http://127.0.0.1 while Next binds as localhost.
  // Without this, Next 16 blocks /_next/hmr and hydration never finishes.
  allowedDevOrigins: ["127.0.0.1", "localhost"],
  // Pin tracing to this repo so a stray package-lock.json in a parent folder
  // (e.g. C:\Users\<you>\package-lock.json) does not confuse Next on Windows.
  outputFileTracingRoot: path.join(__dirname),
  // Native addon — keep out of the webpack/turbopack bundle.
  // Production builds use `next build --webpack` (see package.json) because
  // Turbopack on Windows often fails to resolve better-sqlite3 even when listed here.
  serverExternalPackages: ["better-sqlite3"],
  webpack: (config, { isServer }) => {
    if (isServer) {
      const prev = config.externals;
      config.externals = [
        ...(Array.isArray(prev) ? prev : prev ? [prev] : []),
        ({ request }: { request?: string }, callback: (err?: Error | null, result?: string) => void) => {
          if (request === "better-sqlite3") {
            return callback(null, "commonjs better-sqlite3");
          }
          callback();
        },
      ];
    }
    return config;
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "images.unsplash.com",
      },
      {
        protocol: "https",
        hostname: "store.bblcdn.com",
      },
      {
        protocol: "https",
        hostname: "m.media-amazon.com",
      },
    ],
  },
};

export default nextConfig;
