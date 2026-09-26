import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Pin the workspace root to this directory so a lockfile in a parent
  // folder is never mistaken for this project's.
  turbopack: {
    root: path.join(__dirname),
  },
};

export default nextConfig;
