import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // standalone: `.next/standalone` gets a self-contained server.js — used by the
  // Docker image (docker-compose.yml). Does not affect `next dev`/`next start`.
  output: "standalone",

  // local-only convenience: proxies /appwrite-mock to a mock Appwrite so the
  // auth+sync flow can be exercised without CORS/Secure-cookie friction.
  // Point NEXT_PUBLIC_APPWRITE_ENDPOINT at http://localhost:3000/appwrite-mock
  // while testing (see /tmp/awmock/mock.cjs). No effect in production.
  async rewrites() {
    return [
      {
        source: "/appwrite-mock/:path*",
        destination: "http://localhost:5070/v1/:path*",
      },
    ];
  },
};

export default nextConfig;
