import { describe, expect, it } from "vitest";

import {
  compareRoutePatterns,
  inferRoutePattern,
  isValidRoutePattern,
  matchRoutePattern,
  resolveWorkspacePath
} from "../src/index.js";

describe("resolveWorkspacePath", () => {
  it("extracts workspace and normalized path for nested routes", () => {
    expect(resolveWorkspacePath("/demo/api/v1/user/14/edit")).toEqual({
      workspaceSlug: "demo",
      normalizedPath: "/api/v1/user/14/edit"
    });
  });

  it("falls back to default when no path segment exists", () => {
    expect(resolveWorkspacePath("/")).toEqual({
      workspaceSlug: "default",
      normalizedPath: "/"
    });
  });
});

describe("inferRoutePattern", () => {
  it("keeps numeric and uuid segments literal", () => {
    expect(inferRoutePattern("/api/v1/user/14/edit")).toBe("/api/v1/user/14/edit");
    expect(inferRoutePattern("/api/v1/order/550e8400-e29b-41d4-a716-446655440000/items")).toBe(
      "/api/v1/order/550e8400-e29b-41d4-a716-446655440000/items"
    );
  });

  it("keeps string segments literal", () => {
    expect(inferRoutePattern("/api/v1/user/maria/edit")).toBe("/api/v1/user/maria/edit");
  });
});

describe("route pattern matching", () => {
  it("matches single-segment wildcards only for one segment", () => {
    expect(matchRoutePattern("/foo/*/bar", "/foo/a/bar")).toBe(true);
    expect(matchRoutePattern("/foo/*/bar", "/foo/a/b/bar")).toBe(false);
  });

  it("matches globstar only at the tail", () => {
    expect(matchRoutePattern("/foo/**", "/foo")).toBe(true);
    expect(matchRoutePattern("/foo/**", "/foo/bar/baz")).toBe(true);
    expect(isValidRoutePattern("/foo/**/bar")).toBe(false);
  });

  it("sorts more specific wildcard patterns ahead of broader ones", () => {
    const patterns = ["/**", "/foo/**", "/foo/*", "/foo/*/bar", "/foo/bar"];
    expect(patterns.sort(compareRoutePatterns)).toEqual([
      "/foo/bar",
      "/foo/*/bar",
      "/foo/*",
      "/foo/**",
      "/**"
    ]);
  });
});
