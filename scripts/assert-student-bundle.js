import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

const root = "dist";
const forbiddenMarkers = [
  "@strudel/",
  "@font-face{font-family:Monaspace",
  "monaspace-argon-latin-",
  "monaspace-krypton-latin-",
  "monaspace-neon-latin-",
  "monaspace-radon-latin-",
  "monaspace-xenon-latin-",
];

const filesUnder = async directory => {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await filesUnder(path));
    else files.push(path);
  }
  return files;
};

try {
  const files = await filesUnder(root);
  const matches = [];
  for (const file of files) {
    const source = await readFile(file, "utf8");
    for (const marker of forbiddenMarkers) {
      if (source.includes(marker)) matches.push(`${file}: ${marker}`);
    }
  }
  if (matches.length > 0) {
    console.error("Student bundle contains excluded experimental assets:");
    console.error(matches.join("\n"));
    process.exit(1);
  }
  console.log(`Student bundle checked: ${files.length} files, no Strudel or Monaspace assets found.`);
} catch (error) {
  console.error(`Student bundle check failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}
