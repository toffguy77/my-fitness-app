import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactCompiler: true,
  // Enable standalone output for Docker
  output: 'standalone',
};

export default nextConfig;
