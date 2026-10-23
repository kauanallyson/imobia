import type { NextConfig } from "next";
// Importado para validar as variáveis de ambiente no build.
import "./src/lib/env";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  reactCompiler: true,
  // "bun" (S3Client em src/lib/storage.ts) é módulo nativo do runtime.
  serverExternalPackages: ["bun"],
  experimental: {
    // Upload de material de marketing via Server Action (até ~25 MB de
    // arquivo; o multipart acrescenta alguns KB).
    serverActions: { bodySizeLimit: "26mb" },
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
