import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Strict Mode double-invokes effects in dev, which causes Fabric.js to try
  // initialising the same <canvas> element twice and duplicate AI canvas draws.
  reactStrictMode: false,
  serverExternalPackages: [],
};

export default nextConfig;
