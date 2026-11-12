import { resolve } from "node:path";
import {
  assertPublicDemoEnvironment,
  createPublicDemoApp,
} from "./public-demo";

assertPublicDemoEnvironment(process.env);
const publicOrigin = process.env.PUBLIC_DEMO_ORIGIN;
if (!publicOrigin)
  throw new Error(
    "Set PUBLIC_DEMO_ORIGIN to the public HTTPS origin before starting the demo",
  );
const staticDir =
  process.env.STATIC_DIR ?? resolve(import.meta.dir, "../../web/dist");
const app = createPublicDemoApp({
  publicOrigin,
  staticDir: (await Bun.file(resolve(staticDir, "index.html")).exists())
    ? staticDir
    : undefined,
  maxSessions: process.env.PUBLIC_DEMO_MAX_SESSIONS
    ? Number(process.env.PUBLIC_DEMO_MAX_SESSIONS)
    : undefined,
  idleTtlSeconds: process.env.PUBLIC_DEMO_TTL_SECONDS
    ? Number(process.env.PUBLIC_DEMO_TTL_SECONDS)
    : undefined,
  absoluteTtlSeconds: process.env.PUBLIC_DEMO_ABSOLUTE_TTL_SECONDS
    ? Number(process.env.PUBLIC_DEMO_ABSOLUTE_TTL_SECONDS)
    : undefined,
  maxDatabasePages: process.env.PUBLIC_DEMO_MAX_DB_PAGES
    ? Number(process.env.PUBLIC_DEMO_MAX_DB_PAGES)
    : undefined,
  maxBodyBytes: process.env.PUBLIC_DEMO_MAX_BODY_BYTES
    ? Number(process.env.PUBLIC_DEMO_MAX_BODY_BYTES)
    : undefined,
  maxMutations: process.env.PUBLIC_DEMO_MAX_MUTATIONS
    ? Number(process.env.PUBLIC_DEMO_MAX_MUTATIONS)
    : undefined,
  requestsPerMinute: process.env.PUBLIC_DEMO_REQUESTS_PER_MINUTE
    ? Number(process.env.PUBLIC_DEMO_REQUESTS_PER_MINUTE)
    : undefined,
  maxConcurrent: process.env.PUBLIC_DEMO_MAX_CONCURRENT
    ? Number(process.env.PUBLIC_DEMO_MAX_CONCURRENT)
    : undefined,
  newSessionsPerMinute: process.env.PUBLIC_DEMO_NEW_SESSIONS_PER_MINUTE
    ? Number(process.env.PUBLIC_DEMO_NEW_SESSIONS_PER_MINUTE)
    : undefined,
});
const server = Bun.serve({
  hostname: process.env.HOST ?? "127.0.0.1",
  port: Number(process.env.PORT ?? 3000),
  maxRequestBodySize: app.limits.maxBodyBytes,
  idleTimeout: 30,
  fetch: app.fetch,
});
console.log(
  "OpenTesoro public synthetic demo is running; visitor workspaces are temporary and isolated",
);
function stop() {
  void server.stop(true).then(() => {
    app.close();
    process.exit(0);
  });
}
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
