// Native Strudel is AGPL-3.0-or-later. Public deployment is allowed only when
// the repository carries the corresponding license, source offer, notices, and
// release record that travel with the Strudel-enabled artifact.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = relativePath => {
  const absolutePath = path.join(root, relativePath);
  try {
    return fs.readFileSync(absolutePath, "utf8");
  } catch {
    return null;
  }
};

const failures = [];
const packageText = read("package.json");
const contents = new Map();
if (packageText !== null) contents.set("package.json", packageText);
let packageJson = null;
try {
  packageJson = packageText ? JSON.parse(packageText) : null;
} catch {
  failures.push("package.json is not valid JSON");
}

if (!packageJson) failures.push("package.json is missing");
if (packageJson?.license !== "AGPL-3.0-or-later") {
  failures.push('package.json must declare "license": "AGPL-3.0-or-later"');
}

const requiredFiles = [
  "LICENSE",
  "LICENSE-MIT",
  "SOURCE.md",
  "THIRD_PARTY_NOTICES.md",
  "notes/release-compliance.md",
  "package-lock.json",
  "src/DocumentationPanel.jsx",
];
for (const relativePath of requiredFiles) {
  const content = read(relativePath);
  if (content === null) failures.push(`${relativePath} is missing`);
  else contents.set(relativePath, content);
}

const requiredMarkers = [
  ["LICENSE", "GNU AFFERO GENERAL PUBLIC LICENSE"],
  ["LICENSE-MIT", "MIT License"],
  ["SOURCE.md", "https://github.com/languel/underscores"],
  ["SOURCE.md", "npm run build:single"],
  ["SOURCE.md", "THIRD_PARTY_NOTICES.md"],
  ["package.json", "\"@strudel/core\": \"1.2.5\""],
  ["package-lock.json", "\"@strudel/core\": \"1.2.5\""],
  ["THIRD_PARTY_NOTICES.md", "@strudel/core"],
  ["THIRD_PARTY_NOTICES.md", "AGPL-3.0-or-later"],
  ["notes/release-compliance.md", "Public release compliance record"],
  ["notes/release-compliance.md", "asset audit"],
  ["notes/release-compliance.md", "npm run release:check"],
  ["src/DocumentationPanel.jsx", "PROJECT_SOURCE_URL"],
  ["src/DocumentationPanel.jsx", "PROJECT_LICENSE_URL"],
  ["src/DocumentationPanel.jsx", "PROJECT_NOTICES_URL"],
];
for (const [relativePath, marker] of requiredMarkers) {
  if (!contents.get(relativePath)?.includes(marker)) {
    failures.push(`${relativePath} must contain: ${marker}`);
  }
}

if (failures.length > 0) {
  console.error([
    "Blocked public deployment: Strudel compliance artifacts are incomplete.",
    ...failures.map(failure => `- ${failure}`),
    "Complete SOURCE.md, the license files, third-party notices, and the release record before publishing.",
  ].join("\n"));
  process.exit(1);
}

console.log("Strudel public release compliance artifacts verified.");
