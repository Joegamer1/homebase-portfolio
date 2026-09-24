import { cp, mkdir } from "node:fs/promises";
import { join } from "node:path";

const destination = join(".next", "standalone", "apps", "web");
await mkdir(join(destination, ".next"), { recursive: true });
await cp("public", join(destination, "public"), { recursive: true, force: true });
await cp(join(".next", "static"), join(destination, ".next", "static"), { recursive: true, force: true });
