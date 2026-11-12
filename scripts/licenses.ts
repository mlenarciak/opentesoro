import {
  readdirSync,
  readFileSync,
  realpathSync,
  statSync,
  existsSync,
} from "node:fs";
import { join } from "node:path";
import ts from "typescript";
const root = join(import.meta.dir, "..");
const lock = ts.parseConfigFileTextToJson(
  "bun.lock",
  readFileSync(join(root, "bun.lock"), "utf8"),
);
if (lock.error) throw new Error("Cannot parse lockfile");
const locked = new Set(
  Object.values(lock.config.packages as Record<string, [string]>).map(
    (x) => x[0],
  ),
);
const packages = new Map<
  string,
  {
    name: string;
    version: string;
    license: string;
    texts: { file: string; text: string }[];
  }
>();
function inspect(path: string) {
  const manifest = join(path, "package.json");
  if (!existsSync(manifest)) return;
  const pkg = JSON.parse(readFileSync(manifest, "utf8")) as {
    name: string;
    version: string;
    license?: string;
  };
  const key = `${pkg.name}@${pkg.version}`;
  if (
    !locked.has(key) ||
    packages.has(key) ||
    pkg.name.startsWith("@opentesoro/")
  )
    return;
  const dir = realpathSync(path);
  const texts = readdirSync(dir)
    .filter(
      (f) =>
        /^(?:licen[cs]e|copying|notice)(?:$|[._-])/i.test(f) &&
        statSync(join(dir, f)).isFile(),
    )
    .map((file) => ({
      file,
      text: readFileSync(join(dir, file), "utf8")
        .trim()
        .replace(/[ \t]+$/gm, ""),
    }));
  packages.set(key, {
    name: pkg.name,
    version: pkg.version,
    license: pkg.license ?? "See upstream package",
    texts,
  });
}
for (const entry of readdirSync(join(root, "node_modules/.bun"))) {
  const nm = join(root, "node_modules/.bun", entry, "node_modules");
  if (!existsSync(nm)) continue;
  for (const name of readdirSync(nm)) {
    if (name.startsWith(".")) continue;
    if (name.startsWith("@")) {
      for (const child of readdirSync(join(nm, name)))
        inspect(join(nm, name, child));
    } else inspect(join(nm, name));
  }
}
const ordered = [...packages.values()].sort(
  (a, b) =>
    a.name.localeCompare(b.name, "en") ||
    a.version.localeCompare(b.version, "en"),
);
let text =
  "# Third-party notices\n\nOpenTesoro is MIT licensed. Third-party components retain their own copyrights and licenses. This inventory includes the installed runtime, build and test packages matching `bun.lock`; not every listed package is embedded in the production bundle. Platform-optional packages not installed on this host are outside this snapshot. Regenerate with `bun run licenses:generate` after dependency changes.\n\n";
text +=
  "## shadcn/ui component sources\n\nSource: https://github.com/shadcn-ui/ui/blob/main/LICENSE.md\n\n````text\n" +
  readFileSync(join(root, "licenses/shadcn-ui-MIT.txt"), "utf8").trim() +
  "\n````\n\n";
for (const p of ordered) {
  text += `## ${p.name} ${p.version}\n\nDeclared license: ${p.license}. Package: https://www.npmjs.com/package/${p.name}/v/${p.version}\n\n`;
  if (!p.texts.length)
    text +=
      "No standalone license file was present in this installed package; consult its upstream distribution.\n\n";
  for (const license of p.texts)
    text += `### ${license.file}\n\n\`\`\`\`text\n${license.text}\n\`\`\`\`\n\n`;
}
await Bun.write(
  join(root, "THIRD_PARTY_NOTICES.md"),
  text
    .replaceAll("\r\n", "\n")
    .replace(/[ \t]+$/gm, "")
    .trimEnd() + "\n",
);
console.log(
  `Wrote notices for shadcn/ui and ${ordered.length} installed locked packages.`,
);
