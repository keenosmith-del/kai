import "dotenv/config";
import { readFile, readdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { pool } from "../src/db/pool.js";
const directory = fileURLToPath(
  new URL("../../database/migrations/", import.meta.url),
);
const client = await pool.connect();
try {
  await client.query("SELECT pg_advisory_lock(494004)");
  await client.query(
    "CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, checksum TEXT NOT NULL, applied_at TIMESTAMPTZ DEFAULT now())",
  );
  for (const name of (await readdir(directory))
    .filter((n) => n.endsWith(".sql"))
    .sort()) {
    const sql = await readFile(`${directory}/${name}`, "utf8");
    const checksum = createHash("sha256").update(sql).digest("hex");
    const applied = (
      await client.query(
        "SELECT checksum FROM schema_migrations WHERE name=$1",
        [name],
      )
    ).rows[0];
    if (applied) {
      if (applied.checksum !== checksum)
        throw new Error(`Migration changed: ${name}`);
      continue;
    }
    await client.query("BEGIN");
    try {
      // Legacy migration 003 contains its own transaction wrapper.
      await client.query(sql.replace(/^\s*(BEGIN|COMMIT);\s*$/gim, ""));
      await client.query(
        "INSERT INTO schema_migrations(name,checksum) VALUES($1,$2)",
        [name, checksum],
      );
      await client.query("COMMIT");
      console.log(`Applied ${name}`);
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  }
} finally {
  await client.query("SELECT pg_advisory_unlock(494004)");
  client.release();
  await pool.end();
}
