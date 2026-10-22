export interface WorkspaceCatalogAuthorizationContext {
  workspaceId: string;
  workspaceMember: boolean;
  platformAdmin: boolean;
}

/**
 * Client-side scope selection only. The Edge gateway remains the enforcing
 * authority and repeats platform/workspace authorization for every request.
 */
export function selectAuthorizedLocationCatalogWorkspace(
  requestedWorkspaceId: string,
  context: WorkspaceCatalogAuthorizationContext
): string | null {
  const requested = requestedWorkspaceId.trim();
  if (!requested) return null;
  if (context.platformAdmin) return requested;
  return context.workspaceMember && context.workspaceId === requested
    ? context.workspaceId
    : null;
}
