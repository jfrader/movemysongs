import { execSync } from "node:child_process";
import { rmSync } from "node:fs";
import path from "node:path";

// The sqlite URL "file:./test.db" resolves relative to prisma/schema.prisma.
const dbFile = path.resolve(__dirname, "../prisma/test.db");

export default function setup() {
  rmSync(dbFile, { force: true });
  rmSync(`${dbFile}-journal`, { force: true });
  execSync("npx prisma migrate deploy", {
    env: {
      ...process.env,
      DATABASE_URL: "file:./test.db",
    },
    stdio: "inherit",
  });
}
