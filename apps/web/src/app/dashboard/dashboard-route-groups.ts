import type { MockdockRouteSummaryDto } from "../core/mockdock-api.models";
import type { DashboardRouteToken, DashboardRouteTokenKind, DashboardRouteView } from "./dashboard.models";

const SEGMENT_WILDCARD = "*";
const TAIL_WILDCARD = "**";

export function tokenizeRoutePattern(pattern: string): string[] {
  return pattern.split("/").filter((segment) => segment.length > 0);
}

export function hasWildcardSegments(pattern: string): boolean {
  return tokenizeRoutePattern(pattern).some((segment) => isWildcardSegmentValue(segment));
}

export function deriveDashboardRouteView(
  selectedRoute: MockdockRouteSummaryDto,
  routes: readonly MockdockRouteSummaryDto[],
  literalSegments: readonly string[]
): DashboardRouteView {
  const patternSegments = tokenizeRoutePattern(selectedRoute.route.pattern);
  const memberRoutes = deriveWildcardRouteMembers(selectedRoute, routes);

  return {
    anchorRouteId: selectedRoute.route.id,
    routeId: selectedRoute.route.id,
    method: selectedRoute.route.method,
    pattern: buildRoutePattern(patternSegments),
    displayLabel: buildRouteDisplayLabel(selectedRoute.route.pattern, memberRoutes.length),
    hitCount: aggregateRouteHitCount(memberRoutes),
    memberRouteIds: memberRoutes.map((route) => route.route.id),
    isWildcardRoute: patternSegments.some((segment) => isWildcardSegmentValue(segment)),
    tokens: buildRouteTokens(patternSegments, literalSegments)
  };
}

export function buildRoutePattern(segments: readonly string[]): string {
  if (segments.length === 0) {
    return "/";
  }

  return `/${segments.join("/")}`;
}

export function replaceRouteSegment(
  pattern: string,
  index: number,
  nextValue: string
): string {
  const segments = tokenizeRoutePattern(pattern);
  if (index < 0 || index >= segments.length) {
    return pattern;
  }

  const nextSegments = [...segments];
  nextSegments[index] = nextValue;
  return buildRoutePattern(nextSegments);
}

export function restoreLiteralRouteSegment(
  pattern: string,
  index: number,
  literalSegments: readonly string[]
): string {
  const literalValue = literalSegments[index];
  if (!literalValue) {
    return pattern;
  }

  return replaceRouteSegment(pattern, index, literalValue);
}

export function deriveWildcardRouteMembers(
  selectedRoute: MockdockRouteSummaryDto,
  routes: readonly MockdockRouteSummaryDto[]
): MockdockRouteSummaryDto[] {
  const patternSegments = tokenizeRoutePattern(selectedRoute.route.pattern);
  const hasWildcard = patternSegments.some((segment) => isWildcardSegmentValue(segment));
  if (!hasWildcard) {
    return [selectedRoute];
  }

  return routes.filter((candidateRoute) => {
    if (candidateRoute.route.method !== selectedRoute.route.method) {
      return false;
    }

    if (candidateRoute.route.id === selectedRoute.route.id) {
      return true;
    }

    const candidateSegments = tokenizeRoutePattern(candidateRoute.route.pattern);
    if (candidateSegments.some((segment) => isWildcardSegmentValue(segment))) {
      return false;
    }

    return matchesRoutePattern(patternSegments, candidateSegments);
  });
}

function buildRouteTokens(
  patternSegments: readonly string[],
  literalSegments: readonly string[]
): DashboardRouteToken[] {
  return patternSegments.map((segment, index) => {
    const kind = getRouteTokenKind(segment);

    return {
      index,
      value: segment,
      label: buildRouteSegmentLabel(segment, literalSegments[index] ?? null),
      kind,
      literalValue: literalSegments[index] ?? null,
      canPromoteToWildcard: kind === "literal",
      canPromoteToDeepWildcard: kind === "literal" && index === patternSegments.length - 1,
      canRestoreLiteral: kind !== "literal" && !!literalSegments[index]
    };
  });
}

function buildRouteDisplayLabel(pattern: string, memberCount: number): string {
  return hasWildcardSegments(pattern) && memberCount > 1 ? `${pattern} (${memberCount})` : pattern;
}

function aggregateRouteHitCount(routes: readonly MockdockRouteSummaryDto[]): number {
  return routes.reduce((total, route) => total + route.route.hitCount, 0);
}

function matchesRoutePattern(
  patternSegments: readonly string[],
  candidateSegments: readonly string[]
): boolean {
  let patternIndex = 0;
  let candidateIndex = 0;

  while (patternIndex < patternSegments.length && candidateIndex < candidateSegments.length) {
    const patternSegment = patternSegments[patternIndex];
    if (patternSegment === TAIL_WILDCARD) {
      return patternIndex === patternSegments.length - 1;
    }

    if (patternSegment !== SEGMENT_WILDCARD && patternSegment !== candidateSegments[candidateIndex]) {
      return false;
    }

    patternIndex += 1;
    candidateIndex += 1;
  }

  if (patternIndex === patternSegments.length && candidateIndex === candidateSegments.length) {
    return true;
  }

  return (
    patternIndex === patternSegments.length - 1 &&
    patternSegments[patternIndex] === TAIL_WILDCARD
  );
}

function getRouteTokenKind(segment: string): DashboardRouteTokenKind {
  if (segment === TAIL_WILDCARD) {
    return "deep-wildcard";
  }

  if (segment === SEGMENT_WILDCARD) {
    return "wildcard";
  }

  return "literal";
}

function isWildcardSegmentValue(segment: string): boolean {
  return segment === SEGMENT_WILDCARD || segment === TAIL_WILDCARD;
}

function buildRouteSegmentLabel(segment: string, literalValue: string | null): string {
  if (segment === SEGMENT_WILDCARD) {
    return literalValue ? `Single segment wildcard for ${literalValue}` : "Single segment wildcard";
  }

  if (segment === TAIL_WILDCARD) {
    return literalValue ? `Tail wildcard for ${literalValue}` : "Tail wildcard";
  }

  return segment || "/";
}
