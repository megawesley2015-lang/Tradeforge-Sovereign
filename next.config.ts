import type { NextConfig } from "next";
import path from "node:path";

/**
 * Next.js config — TradeForge Sovereign
 *
 * Decisões técnicas:
 *
 * 1) `turbopack.root` fixa o workspace root explicitamente.
 *    Sem isso, o Next 16 detectava o lockfile de C:\Users\wesley
 *    como root, gerando o warning:
 *      "We detected multiple lockfiles and selected the directory of
 *       C:\Users\wesley\package-lock.json as the root directory."
 *    Isso causa resolução incorreta de módulos em alguns casos.
 *
 * 2) `turbopack: { ... }` (mesmo que minimal) silencia o erro:
 *      "This build is using Turbopack, with a `webpack` config and
 *       no `turbopack` config."
 *    Em Next.js 16, Turbopack é o default em dev. Mantemos o
 *    `webpack` config abaixo apenas para o caminho de build via
 *    webpack (caso seja forçado com `next build --webpack`).
 *
 * 3) O `webpack` config aplica fallbacks para módulos Node que
 *    não devem ir para o bundle do client (crypto/fs/net/tls).
 *    Em Turbopack isso é tratado automaticamente para os pacotes
 *    deste projeto — não precisa de equivalente explícito.
 */
const nextConfig: NextConfig = {
  // Fixa o root do workspace: evita o Next pegar o lockfile do home do usuário.
  turbopack: {
    root: path.resolve(__dirname),
  },

  // Mantido apenas para `next build` em modo webpack. Turbopack ignora isto.
  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        crypto: false,
        fs:     false,
        net:    false,
        tls:    false,
      };
    }
    return config;
  },

  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '*.supabase.co',
      },
      {
        protocol: 'https',
        hostname: 'bin.bnbstatic.com',
      },
    ],
  },
};

export default nextConfig;
