export type RoutePatternToken =
  | { type: "literal"; value: string }
  | { type: "wildcard" }
  | { type: "globstar" };

export class InvalidRoutePatternError extends Error {}

export function inferRoutePattern(pathname: string): string {
  const segments = pathname.split("/").filter(Boolean);

  if (segments.length === 0) {
    return "/";
  }

  return `/${segments.join("/")}`;
}

export function tokenizeRoutePattern(pattern: string): RoutePatternToken[] {
  if (pattern === "/") {
    return [];
  }

  if (!pattern.startsWith("/")) {
    throw new InvalidRoutePatternError("Route patterns must start with '/'");
  }

  const segments = pattern.split("/").slice(1);

  return segments.map((segment, index) => {
    if (segment.length === 0) {
      throw new InvalidRoutePatternError("Route patterns cannot contain empty path segments");
    }

    if (segment === "*") {
      return { type: "wildcard" } satisfies RoutePatternToken;
    }

    if (segment === "**") {
      if (index !== segments.length - 1) {
        throw new InvalidRoutePatternError("'**' is only allowed in the final segment");
      }

      return { type: "globstar" } satisfies RoutePatternToken;
    }

    if (segment.includes("*")) {
      throw new InvalidRoutePatternError("Wildcard segments must be exactly '*' or '**'");
    }

    return { type: "literal", value: segment } satisfies RoutePatternToken;
  });
}

export function isValidRoutePattern(pattern: string): boolean {
  try {
    tokenizeRoutePattern(pattern);
    return true;
  } catch {
    return false;
  }
}

export function matchRoutePattern(pattern: string, pathname: string): boolean {
  const patternTokens = tokenizeRoutePattern(pattern);
  const pathSegments = pathname === "/" ? [] : pathname.split("/").filter(Boolean);

  let pathIndex = 0;

  for (let tokenIndex = 0; tokenIndex < patternTokens.length; tokenIndex += 1) {
    const token = patternTokens[tokenIndex];

    if (token.type === "globstar") {
      return true;
    }

    if (pathIndex >= pathSegments.length) {
      return false;
    }

    if (token.type === "literal" && token.value !== pathSegments[pathIndex]) {
      return false;
    }

    pathIndex += 1;
  }

  return pathIndex === pathSegments.length;
}

export function compareRoutePatterns(left: string, right: string): number {
  const leftRank = getRoutePatternRank(left);
  const rightRank = getRoutePatternRank(right);

  if (leftRank.isExact !== rightRank.isExact) {
    return leftRank.isExact ? -1 : 1;
  }

  if (leftRank.staticSegmentCount !== rightRank.staticSegmentCount) {
    return rightRank.staticSegmentCount - leftRank.staticSegmentCount;
  }

  if (leftRank.globstarCount !== rightRank.globstarCount) {
    return leftRank.globstarCount - rightRank.globstarCount;
  }

  if (leftRank.wildcardCount !== rightRank.wildcardCount) {
    return leftRank.wildcardCount - rightRank.wildcardCount;
  }

  if (leftRank.segmentCount !== rightRank.segmentCount) {
    return rightRank.segmentCount - leftRank.segmentCount;
  }

  return left.localeCompare(right);
}

export function getRoutePatternRank(pattern: string): {
  isExact: boolean;
  staticSegmentCount: number;
  globstarCount: number;
  wildcardCount: number;
  segmentCount: number;
} {
  const tokens = tokenizeRoutePattern(pattern);
  const initialRank: {
    isExact: boolean;
    staticSegmentCount: number;
    globstarCount: number;
    wildcardCount: number;
    segmentCount: number;
  } = {
    isExact: true,
    staticSegmentCount: 0,
    globstarCount: 0,
    wildcardCount: 0,
    segmentCount: 0
  };

  return tokens.reduce(
    (rank, token) => ({
      isExact: rank.isExact && token.type === "literal",
      staticSegmentCount: rank.staticSegmentCount + (token.type === "literal" ? 1 : 0),
      globstarCount: rank.globstarCount + (token.type === "globstar" ? 1 : 0),
      wildcardCount: rank.wildcardCount + (token.type === "literal" ? 0 : 1),
      segmentCount: rank.segmentCount + 1
    }),
    initialRank
  );
}
