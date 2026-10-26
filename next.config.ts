import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  output: "standalone",
  partialPrefetching: true,
};

export default nextConfig;
