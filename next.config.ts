
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: "standalone",
  // This allows the Next_js dev server to accept requests from the
  // Firebase Studio environment.

  // OCR images (base64-encoded camera/photo uploads) easily exceed the
  // default 1 MB Server Action body limit. Raise it so form/card scans
  // go through to the vision flow. Must live under `experimental` in
  // Next 15 — a top-level `serverActions` key is silently ignored (falls
  // back to the 1 MB default, breaking OCR uploads in production).
  experimental: {
    serverActions: {
      bodySizeLimit: 15728640,
    },
  },

  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'placehold.co',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'images.unsplash.com',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'picsum.photos',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'firebasestorage.googleapis.com',
        port: '',
        pathname: '/**',
      },
    ],
  },
  // This is required to make firebase-admin work with Next.js App Router.
  serverExternalPackages: ['firebase-admin', 'xlsx', 'papaparse', 'handlebars', '@genkit-ai/core', 'genkit'],
};

export default nextConfig;
