import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Enable standalone output for efficient container deployments
  output: 'standalone',
};

export default nextConfig;
