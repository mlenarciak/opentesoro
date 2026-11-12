const server = Bun.spawn(["bun", "--watch", "apps/server/src/index.ts"], {
  cwd: process.cwd(),
  stdout: "inherit",
  stderr: "inherit",
  env: process.env,
});
const web = Bun.spawn(["bun", "run", "--cwd", "apps/web", "dev"], {
  cwd: process.cwd(),
  stdout: "inherit",
  stderr: "inherit",
  env: process.env,
});
const stop = () => {
  server.kill();
  web.kill();
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
const code = await Promise.race([server.exited, web.exited]);
stop();
process.exit(code);
export {};
