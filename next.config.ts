import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Dev clients often open http://127.0.0.1 while Next binds as localhost.
  // Without this, Next 16 blocks /_next/hmr and hydration never finishes.
  allowedDevOrigins: ["127.0.0.1", "localhost"],
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "images.unsplash.com",
      },
    ],
  },
};

export default nextConfig;
