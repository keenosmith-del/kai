// Disposable local UI verification account. Never seeds the real publication feed.
import { readFile, writeFile, unlink } from "node:fs/promises";
import path from "node:path";
import { pool } from "../src/db/pool.js";
import { hashPassword } from "../src/services/passwords.js";
const file = "/private/tmp/kai-004-browser-fixture.json";
try {
  if (process.argv[2] === "remove") {
    const fixture = JSON.parse(await readFile(file, "utf8"));
    await pool.query("DELETE FROM publications WHERE author_id=$1", [
      fixture.id,
    ]);
    const media = (
      await pool.query("SELECT filename FROM media WHERE owner_id=$1", [
        fixture.id,
      ])
    ).rows;
    await pool.query("DELETE FROM users WHERE id=$1", [fixture.id]);
    for (const m of media)
      await unlink(
        path.resolve(process.env.MEDIA_DIR || "uploads", m.filename),
      ).catch(() => {});
    await unlink(file);
    console.log(
      "Removed disposable UI verification account and its publications.",
    );
  } else {
    const email = `kai-ui-${Date.now()}@example.test`,
      password = "Local-ui-check-004!";
    const u = (
      await pool.query(
        "INSERT INTO users(name,email,password_hash,role,onboarding_completed_at) VALUES('Interface verification',$1,$2,'reader',now()) RETURNING id",
        [email, await hashPassword(password)],
      )
    ).rows[0];
    await writeFile(file, JSON.stringify({ ...u, email, password }), {
      mode: 0o600,
    });
    console.log({ email, password });
  }
} finally {
  await pool.end();
}
