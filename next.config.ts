import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Lets a second dev server (e.g. fixture mode on another port) run beside the live one.
  distDir: process.env.NEXT_DIST_DIR || ".next",
};

export default nextConfig;
