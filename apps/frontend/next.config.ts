
import type { NextConfig } from 'next';

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:4000';

const nextConfig: NextConfig = {
  output: "standalone",

  // OCR images (base64-encoded camera/photo uploads) easily exceed the
  // default 1 MB Server Action body limit. Raise it so form/card scans
  // go through to the vision flow. Must live under `experimental` in
  // Next 15 — a top-level `serverActions` key is silently ignored (falls
  // back to the 1 MB default, breaking OCR uploads in production).
  experimental: {
    serverActions: {
      bodySizeLimit: 15728640,
    },
    // The OCR pipeline (multi-stage + slice-rescan) can run 30-45s. The dev
    // rewrite proxy defaults to a 30s timeout and returns 500 past it — raise
    // it so /api/v1/ocr/process completes instead of failing mid-scan.
    proxyTimeout: 120_000,
  },

  // Proxy /api/v1/* requests to the backend API server.
  async rewrites() {
    return [
      {
        source: '/api/v1/:path*',
        destination: `${BACKEND_URL}/api/v1/:path*`,
      },
    ];
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
      {
        // Cloudflare R2 — public dev URL (pub-*.r2.dev) for uploaded media.
        // If you later bind a custom domain to the bucket, add that too.
        protocol: 'https',
        hostname: '**.r2.dev',
        port: '',
        pathname: '/**',
      },
    ],
  },
  // This is required to make firebase-admin work with Next.js App Router.
  serverExternalPackages: ['firebase-admin', 'xlsx', 'papaparse', 'handlebars', '@genkit-ai/core', 'genkit'],
};

export default nextConfig;
