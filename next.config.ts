import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  // Dev clients often open http://127.0.0.1 while Next binds as localhost.
  // Without this, Next 16 blocks /_next/hmr and hydration never finishes.
  allowedDevOrigins: ["127.0.0.1", "localhost"],
  // Pin tracing to this repo so a stray package-lock.json in a parent folder
  // (e.g. C:\Users\<you>\package-lock.json) does not confuse Next on Windows.
  outputFileTracingRoot: path.join(__dirname),
  // sql.js WASM + Playwright stay external so Node can load them from node_modules.
  serverExternalPackages: ["sql.js", "playwright", "playwright-core"],
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
      {
        protocol: "https",
        hostname: "encrypted-tbn0.gstatic.com",
      },
      {
        protocol: "https",
        hostname: "encrypted-tbn1.gstatic.com",
      },
      {
        protocol: "https",
        hostname: "encrypted-tbn2.gstatic.com",
      },
      {
        protocol: "https",
        hostname: "encrypted-tbn3.gstatic.com",
      },
    ],
  },
};

export default nextConfig;
