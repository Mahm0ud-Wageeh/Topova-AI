import { build } from "esbuild";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
await build({
  absWorkingDir: root,
  entryPoints: ["backend/src/serverless.ts"],
  outfile: "backend/dist/serverless.mjs",
  bundle: true,
  platform: "node",
  target: "node24",
  format: "esm",
  packages: "external",
  tsconfig: "tsconfig.json",
  plugins: [{
    name: "external-generated-prisma-client",
    setup(builder) {
      // Keep Prisma's native engine beside the unbundled generated client.
      builder.onResolve({ filter: /generated\/client$/ }, () => ({
        path: "../generated/client/index.js",
        external: true,
      }));
    },
  }],
});
