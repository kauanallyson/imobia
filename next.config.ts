import type { NextConfig } from "next";
// Importado para validar as variáveis de ambiente no build.
import "./src/lib/env";

const nextConfig: NextConfig = {
  // Imagem de produção (Containerfile) copia só .next/standalone.
  output: "standalone",
  cacheComponents: true,
  partialPrefetching: true,
  reactCompiler: true,
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
