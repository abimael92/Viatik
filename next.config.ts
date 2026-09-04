import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Enable production source maps for better error debugging (can be disabled for smaller bundles)
  productionBrowserSourceMaps: false,

  // Optimize images
  images: {
    formats: ["image/avif", "image/webp"],
  },

  // Enable React strict mode for better development experience
  reactStrictMode: true,

  // Optimize package imports
  experimental: {
    optimizePackageImports: ["lucide-react", "@radix-ui/react-dialog", "@radix-ui/react-label"],
  },

  // Compress output
  compress: true,

  // Development only: allow the browser preview proxy (127.0.0.1) and
  // localhost to load Next.js dev resources (JS chunks / HMR). Next blocks
  // cross-origin dev requests by default for safety.
  allowedDevOrigins: ["127.0.0.1", "localhost"],
};

export default nextConfig;
