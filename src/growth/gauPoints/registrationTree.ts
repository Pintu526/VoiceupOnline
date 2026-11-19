/**
 * Verified-registration referral tree for GauPoint recognition.
 * This module is independent of geographic coordinator assignments.
 * Input records must come from trusted, verified account registration.
 */

export interface VerifiedRegistrationNode {
  supporterId: string;
  parentSupporterId?: string | null;
  verified: boolean;
}

export interface RegistrationTreeResult {
  generations: string[][];
  violations: string[];
}

export function buildVerifiedRegistrationGenerations(
  rootSupporterId: string,
  registrations: readonly VerifiedRegistrationNode[]
): RegistrationTreeResult {
  const violations: string[] = [];
  const nodes = new Map<string, VerifiedRegistrationNode>();
  const duplicateIds = new Set<string>();

  for (const node of registrations) {
    if (!node.supporterId || !node.supporterId.trim()) {
      violations.push("Missing supporter ID.");
      continue;
    }

    if (nodes.has(node.supporterId)) {
      duplicateIds.add(node.supporterId);
      violations.push(`Duplicate supporter ID: ${node.supporterId}`);
      continue;
    }

    nodes.set(node.supporterId, node);
  }

  const children = new Map<string, string[]>();

  for (const node of nodes.values()) {
    if (!node.verified || duplicateIds.has(node.supporterId)) continue;

    const parentId = node.parentSupporterId;
    if (!parentId) continue;

    if (parentId === node.supporterId) {
      violations.push(`Self-referral: ${node.supporterId}`);
      continue;
    }

    const parent = nodes.get(parentId);
    if (!parent || !parent.verified || duplicateIds.has(parentId)) {
      continue;
    }

    const siblings = children.get(parentId) ?? [];
    siblings.push(node.supporterId);
    children.set(parentId, siblings);
  }

  const generations: string[][] = [];
  const visited = new Set<string>([rootSupporterId]);
  let frontier = nodes.get(rootSupporterId)?.verified &&
    !duplicateIds.has(rootSupporterId)
      ? [rootSupporterId]
      : [];

  while (frontier.length > 0) {
    const next: string[] = [];

    for (const parentId of frontier) {
      for (const childId of children.get(parentId) ?? []) {
        if (visited.has(childId)) {
          violations.push(`Circular or repeated referral: ${childId}`);
          continue;
        }

        visited.add(childId);
        next.push(childId);
      }
    }

    if (next.length === 0) break;

    generations.push(next);
    frontier = next;
  }

  return { generations, violations };
}
