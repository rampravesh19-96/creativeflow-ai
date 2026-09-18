import "dotenv/config";
import dotenv from "dotenv";
import { readFile, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { Pool } from "pg";

dotenv.config({ path: ".env.local", override: true });

const migrationsDirectory = fileURLToPath(
  new URL("../migrations/", import.meta.url),
);

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("DATABASE_URL is required to run migrations.");
}

const pool = new Pool({ connectionString: databaseUrl, max: 1 });

try {
  const client = await pool.connect();
  try {
    await client.query("SELECT pg_advisory_lock($1)", [85433721]);
    await client.query(`
      CREATE TABLE IF NOT EXISTS creativeflow_schema_migrations (
        filename text PRIMARY KEY,
        applied_at timestamptz NOT NULL DEFAULT now()
      )
    `);

    const migrationFiles = (await readdir(migrationsDirectory))
      .filter((filename) => /^\d+_.+\.sql$/i.test(filename))
      .sort();

    for (const filename of migrationFiles) {
      const applied = await client.query(
        "SELECT 1 FROM creativeflow_schema_migrations WHERE filename = $1",
        [filename],
      );
      if (applied.rowCount) continue;

      const sql = await readFile(`${migrationsDirectory}/${filename}`, "utf8");
      await client.query("BEGIN");
      try {
        await client.query(sql);
        await client.query(
          "INSERT INTO creativeflow_schema_migrations (filename) VALUES ($1)",
          [filename],
        );
        await client.query("COMMIT");
        console.log(`Applied migration ${filename}`);
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
    }
  } finally {
    await client.query("SELECT pg_advisory_unlock($1)", [85433721]);
    client.release();
  }
} finally {
  await pool.end();
}
