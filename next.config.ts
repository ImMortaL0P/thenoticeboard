import type { NextConfig } from "next";

const buildId = process.env.VERCEL_GIT_COMMIT_SHA 
  || process.env.RENDER_GIT_COMMIT 
  || `dev-${Date.now()}`;

const nextConfig: NextConfig = {
  env: {
    NEXT_PUBLIC_APP_VERSION: buildId.slice(0, 7),
  },
  serverExternalPackages: ["pdf-parse"],
  outputFileTracingRoot: process.cwd(),
  experimental: {
    serverActions: {
      bodySizeLimit: "10mb",
    },
  },
};

export default nextConfig;
