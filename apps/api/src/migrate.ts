import "dotenv/config";
import dotenv from "dotenv";
import { readFile, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { Pool } from "pg";
import { runMigrationsWithRetry } from "./migration-runner.js";

dotenv.config({ path: ".env.local", override: true });

const migrationsDirectory = fileURLToPath(
  new URL("../migrations/", import.meta.url),
);

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("DATABASE_URL is required to run migrations.");
}

const pool = new Pool({ connectionString: databaseUrl, max: 1 });

await runMigrationsWithRetry({
  connect: () => pool.connect(),
  migrationFiles: () => readdir(migrationsDirectory),
  readMigration: (filename) =>
    readFile(`${migrationsDirectory}/${filename}`, "utf8"),
  close: () => pool.end(),
});
