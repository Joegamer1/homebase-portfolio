import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  outputFileTracingRoot: new URL("../..", import.meta.url).pathname,
  transpilePackages: ["@homebase/api-contracts"],
};

export default nextConfig;
