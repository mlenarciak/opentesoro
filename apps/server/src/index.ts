import { Store } from "./store";
import { createApp } from "./app";
import { seedDemo } from "./demo";
import { resolve } from "node:path";

const hostname = process.env.HOST ?? "127.0.0.1";
const token = process.env.OPENTESORO_API_TOKEN;
if (!["127.0.0.1", "localhost", "::1"].includes(hostname) && !token)
  throw new Error(
    "Set OPENTESORO_API_TOKEN before exposing the server beyond loopback.",
  );
if (
  process.env.OPENTESORO_READ_ONLY_TOKEN &&
  (!token || process.env.OPENTESORO_READ_ONLY_TOKEN === token)
)
  throw new Error("Read-only token requires a distinct write token.");
if (token && token.length < 24)
  throw new Error("OPENTESORO_API_TOKEN must have at least 24 characters.");
if (
  process.env.OPENTESORO_READ_ONLY_TOKEN &&
  process.env.OPENTESORO_READ_ONLY_TOKEN.length < 24
)
  throw new Error(
    "OPENTESORO_READ_ONLY_TOKEN must have at least 24 characters.",
  );
const store = new Store(
  process.env.DATABASE_PATH ??
    resolve(import.meta.dir, "../../../.data/opentesoro.sqlite"),
);
if (process.env.OPENTESORO_DEMO !== "false") seedDemo(store);
const staticDir =
  process.env.STATIC_DIR ?? resolve(import.meta.dir, "../../web/dist");
const server = Bun.serve({
  hostname,
  port: Number(process.env.PORT ?? 3000),
  maxRequestBodySize: 2_500_000,
  fetch: createApp(store, {
    token,
    readOnlyToken: process.env.OPENTESORO_READ_ONLY_TOKEN,
    staticDir: (await Bun.file(resolve(staticDir, "index.html")).exists())
      ? staticDir
      : undefined,
    allowedOrigins: (
      process.env.ALLOWED_ORIGINS ??
      "http://localhost:5173,http://127.0.0.1:5173"
    ).split(","),
  }),
});
console.log(
  `OpenTesoro running at ${server.url} (${process.env.OPENTESORO_DEMO === "false" ? "empty installation" : "synthetic demo"})`,
);
function stop() {
  void server.stop(true).then(() => {
    store.close();
    process.exit(0);
  });
}
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
