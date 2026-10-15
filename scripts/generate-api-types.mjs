// Generates TypeScript types from the PINNED OpenAPI documents (contracts/openapi, vendored from an
// ecommerce-contracts release). Run after re-vendoring:  npm run contracts:types
// src/api/contract-check.ts then fails the typecheck if the API no longer provides what the UI uses.
import { execFileSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dirname, "..");
for (const f of readdirSync(join(root, "contracts", "openapi")).filter((x) => x.endsWith(".openapi.json"))) {
  const out = join(root, "src", "api", "generated", f.replace(".openapi.json", ".ts"));
  execFileSync(join(root, "node_modules", ".bin", "openapi-typescript"), [join(root, "contracts", "openapi", f), "-o", out, "--root-types"], { stdio: "inherit" });
}
