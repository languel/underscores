// Native Strudel is AGPL-3.0-or-later.  We intentionally permit local Vite
// development while refusing public gh-pages deployment until the project has
// adopted a compatible licence, published corresponding source/build
// instructions, and recorded upstream notices and any bundled assets.
const acknowledgement = process.env.DRAWERATOR_AGPL_COMPLIANCE;

if (acknowledgement !== "acknowledged") {
  console.error([
    "Blocked public deployment: this build includes native Strudel (AGPL-3.0-or-later).",
    "Before publishing, adopt an AGPL-compatible project licence; publish complete corresponding source and build instructions; preserve Strudel notices and modification records; and audit bundled fonts, samples, and assets.",
    "After those requirements are complete, deploy with DRAWERATOR_AGPL_COMPLIANCE=acknowledged.",
  ].join("\n"));
  process.exit(1);
}
