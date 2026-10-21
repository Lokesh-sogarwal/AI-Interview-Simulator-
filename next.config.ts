import path from "node:path";
import type { NextConfig } from "next";

// Pin the project root: a lockfile in a parent folder otherwise makes Next.js
// infer the wrong workspace root for tracing and Turbopack.
const projectRoot = path.resolve(process.cwd());

const nextConfig: NextConfig = {
  poweredByHeader: false,
  outputFileTracingRoot: projectRoot,
  turbopack: { root: projectRoot },
  // PDF libraries load their pdf.js worker at runtime; bundling them breaks
  // that lookup ("This PDF could not be read"), so run them as plain Node modules.
  serverExternalPackages: ["pdf-parse", "pdfjs-dist"],
  async headers() {
    const headers = [
      { key: "X-Frame-Options", value: "DENY" },
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
      { key: "Cross-Origin-Resource-Policy", value: "same-site" },
    ];

    if (process.env.NODE_ENV === "production") {
      headers.push({
        key: "Strict-Transport-Security",
        value: "max-age=31536000; includeSubDomains; preload",
      });
    }

    return [
      {
        source: "/(.*)",
        headers,
      },
    ];
  },
};

export default nextConfig;
