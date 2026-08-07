import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@markorbit/contracts", "@markorbit/persistence"],
};

export default nextConfig;
