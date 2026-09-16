import type { NextConfig } from "next";

const githubPages = process.env.GITHUB_ACTIONS === "true";

const nextConfig: NextConfig = {
  output: "export",
  trailingSlash: true,
  assetPrefix: githubPages ? "/movemirror" : undefined,
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
