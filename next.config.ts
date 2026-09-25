import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // This app lives in a subdirectory of a repo whose root has its own
  // package-lock.json; pin the workspace root to this directory.
  turbopack: {
    root: path.join(__dirname),
  },
};

export default nextConfig;
