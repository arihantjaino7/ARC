import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // V2 folded the standalone Step 3-10 pages into the five tab sections.
  // These keep old links (and anything bookmarked during the build) working.
  async redirects() {
    return [
      { source: "/dashboard", destination: "/", permanent: false },
      { source: "/log", destination: "/progress", permanent: false },
      { source: "/score", destination: "/progress", permanent: false },
      { source: "/friends", destination: "/buddies", permanent: false },
      { source: "/profile", destination: "/settings/profile", permanent: false },
    ];
  },
};

export default nextConfig;
