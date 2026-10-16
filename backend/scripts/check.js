import { readdir } from "node:fs/promises";
import { spawnSync } from "node:child_process";
async function check(directory) {
  for (const item of await readdir(directory, { withFileTypes: true })) {
    const file = `${directory}/${item.name}`;
    if (item.isDirectory()) await check(file);
    else if (item.name.endsWith(".js")) {
      const result = spawnSync(process.execPath, ["--check", file], {
        stdio: "inherit",
      });
      if (result.status !== 0) process.exit(result.status || 1);
    }
  }
}
for (const directory of ["src", "scripts", "test"]) await check(directory);
console.log("All backend JavaScript passed syntax checks.");
