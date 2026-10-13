import { describe, expect, it } from "vitest";
import { parseEnv } from "../config/env";

describe("parseEnv", () => {
  it("applies local defaults", () => {
    expect(parseEnv({}).VITE_AUTH_API_URL).toBe("http://localhost:4001");
  });

  it("rejects invalid URLs", () => {
    expect(() => parseEnv({ VITE_AUTH_API_URL: "not a url" })).toThrow(/Invalid frontend configuration/);
  });
});
