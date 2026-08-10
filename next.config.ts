import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    staleTimes: {
      // Next's client-side router defaults this to 0 for per-user pages,
      // which means every T1 HO ↔ HO switch goes back to the server even
      // when nothing can have changed. 30s matches the window the case and
      // option reads are cached for, so switching back and forth is served
      // straight from the browser and the data still can't go more than
      // half a minute stale. 「重新整理」always fetches live regardless.
      dynamic: 30,
    },
  },
};

export default nextConfig;
