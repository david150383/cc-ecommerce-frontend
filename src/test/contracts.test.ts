import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("pinned API contracts (ecommerce-contracts)", () => {
  it("vendored OpenAPI documents match contracts.lock.json (no hand edits)", () => {
    const root = join(__dirname, "..", "..");
    expect(() => execFileSync(process.execPath, [join(root, "scripts", "verify-contracts.mjs"), root], { stdio: "pipe" })).not.toThrow();
  });
});
