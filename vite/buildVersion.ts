import { writeFileSync } from "fs";
import path from "path";
import type { Plugin } from "vite";

export type AppVersionPayload = { buildId: string };

/** Stable per deploy on Vercel; unique per local build otherwise. */
export function resolveBuildId(): string {
  const vercelSha = process.env.VERCEL_GIT_COMMIT_SHA;
  if (vercelSha) return vercelSha.slice(0, 12);
  if (process.env.VERCEL_DEPLOYMENT_ID) return process.env.VERCEL_DEPLOYMENT_ID;
  if (process.env.VITE_APP_BUILD_ID) return process.env.VITE_APP_BUILD_ID;
  return `local-${Date.now()}`;
}

export function appVersionPlugin(buildId: string): Plugin {
  const body = JSON.stringify({ buildId } satisfies AppVersionPayload);

  return {
    name: "woof-app-version",
    config() {
      return {
        define: {
          "import.meta.env.VITE_APP_BUILD_ID": JSON.stringify(buildId),
        },
      };
    },
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const pathname = req.url?.split("?")[0];
        if (pathname !== "/version.json") return next();
        res.setHeader("Content-Type", "application/json; charset=utf-8");
        res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
        res.end(body);
      });
    },
    closeBundle() {
      const out = path.resolve(process.cwd(), "dist", "version.json");
      writeFileSync(out, `${body}\n`, "utf8");
    },
  };
}
