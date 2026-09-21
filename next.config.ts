import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  // Dev clients often open http://127.0.0.1 while Next binds as localhost.
  // Without this, Next 16 blocks /_next/hmr and hydration never finishes.
  allowedDevOrigins: ["127.0.0.1", "localhost"],
  // Pin tracing to this repo so a stray package-lock.json in a parent folder
  // (e.g. C:\Users\<you>\package-lock.json) does not confuse Next on Windows.
  outputFileTracingRoot: path.join(__dirname),
  // sql.js WASM stays external so Node can load sql-wasm.wasm from node_modules.
  serverExternalPackages: ["sql.js"],
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
