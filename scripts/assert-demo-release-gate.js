// The internal demo profile intentionally includes native Strudel. Keep its
// deployment opt-in without changing the stricter public-release gate.
import { readLocalEnv } from "./read-local-env.js";

const acknowledgement = readLocalEnv("UNDERSCORES_AGPL_COMPLIANCE");

if (acknowledgement !== "acknowledged") {
  console.error([
    "Blocked internal demo deployment: this artifact includes native Strudel (AGPL-3.0-or-later).",
    "For a controlled internal demo publish, explicitly acknowledge the opt-in with:",
    "UNDERSCORES_AGPL_COMPLIANCE=acknowledged npm run deploy:demo",
    "This demo path does not replace the full public-release compliance review.",
  ].join("\n"));
  process.exit(1);
}

console.log("Internal Strudel demo deployment acknowledged.");
