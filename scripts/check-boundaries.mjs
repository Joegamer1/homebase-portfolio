import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../apps/web/src", import.meta.url));
const forbidden = [
  "/collectors",
  "@prisma/client",
  "prisma/",
  "HOME_ASSISTANT_TOKEN",
  "PLEX_TOKEN",
  "CAREER_JSEARCH_API_KEY",
  "PROXMOX",
];
const violations = [];

async function inspect(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) await inspect(path);
    else if (/\.(ts|tsx|js|jsx)$/.test(entry.name)) {
      const source = await readFile(path, "utf8");
      for (const token of forbidden)
        if (source.includes(token)) violations.push(`${path}: forbidden client token ${token}`);
    }
  }
}

await inspect(root);
if (violations.length) {
  console.error(violations.join("\n"));
  process.exit(1);
}
console.log("Web boundary check passed: no provider, Prisma, or collector imports.");
