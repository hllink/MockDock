export interface WorkspaceResolution {
  workspaceSlug: string;
  normalizedPath: string;
}

export function resolveWorkspacePath(pathname: string): WorkspaceResolution {
  const segments = pathname.split("/").filter(Boolean);

  if (segments.length === 0) {
    return {
      workspaceSlug: "default",
      normalizedPath: "/"
    };
  }

  const [workspaceSlug, ...remainingSegments] = segments;

  return {
    workspaceSlug,
    normalizedPath: remainingSegments.length > 0 ? `/${remainingSegments.join("/")}` : "/"
  };
}
