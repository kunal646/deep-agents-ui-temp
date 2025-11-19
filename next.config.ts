import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  eslint: {
    // Ignore ESLint errors during build for deployment
    ignoreDuringBuilds: true,
  },
  typescript: {
    // Ignore TypeScript errors during build (optional, but helpful if there are TS errors)
    ignoreBuildErrors: false,
  },
};

export default nextConfig;
