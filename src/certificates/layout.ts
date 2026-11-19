import {
  DEFAULT_CERTIFICATE_PLACEMENT,
  type CertificatePlacement,
  type CertificateTextPlacement
} from "./types.ts";

export type CertificateTextRole = keyof Omit<CertificatePlacement, "layoutVersion" | "qr">;

export interface PercentRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export interface ResolvedCertificatePlacement {
  placement: CertificatePlacement;
  adjustedRoles: CertificateTextRole[];
}

export interface CertificateArtworkExclusion {
  id: string;
  rect: PercentRect;
  roles: readonly CertificateTextRole[];
}

const CENTRAL_ROLES: readonly CertificateTextRole[] = [
  "heading",
  "intro",
  "name",
  "acknowledgement",
  "campaignLabel",
  "campaign",
  "slogan"
];

const LEFT_DETAIL_ROLES: readonly CertificateTextRole[] = ["date", "certificateId", "issuer"];
const RIGHT_DETAIL_ROLES: readonly CertificateTextRole[] = ["qrHeading", "qrInstructions"];

export const GSAA_CERTIFICATE_ARTWORK_EXCLUSIONS: readonly CertificateArtworkExclusion[] = [
  { id: "top-emblem", rect: { left: 36, top: 0, right: 64, bottom: 28.5 }, roles: CENTRAL_ROLES },
  { id: "upper-decorative-rule", rect: { left: 33, top: 46, right: 67, bottom: 48.5 }, roles: CENTRAL_ROLES },
  { id: "lower-decorative-rule", rect: { left: 30, top: 56.5, right: 70, bottom: 58.8 }, roles: CENTRAL_ROLES },
  { id: "left-artwork", rect: { left: 0, top: 29, right: 24.5, bottom: 72 }, roles: CENTRAL_ROLES },
  { id: "right-artwork", rect: { left: 75.5, top: 29, right: 100, bottom: 72 }, roles: CENTRAL_ROLES },
  { id: "medal", rect: { left: 42, top: 72.4, right: 58, bottom: 91.5 }, roles: CENTRAL_ROLES }
];

function clonePlacement(value: CertificatePlacement): CertificatePlacement {
  return {
    ...value,
    heading: { ...value.heading },
    intro: { ...value.intro },
    name: { ...value.name },
    acknowledgement: { ...value.acknowledgement },
    campaignLabel: { ...value.campaignLabel },
    campaign: { ...value.campaign },
    date: { ...value.date },
    certificateId: { ...value.certificateId },
    issuer: { ...value.issuer },
    qrHeading: { ...value.qrHeading },
    qrInstructions: { ...value.qrInstructions },
    slogan: { ...value.slogan },
    footer: { ...value.footer },
    qr: { ...value.qr }
  };
}

export function certificateTextRect(item: CertificateTextPlacement): PercentRect {
  return {
    left: item.x - item.width / 2,
    top: item.y - item.height / 2,
    right: item.x + item.width / 2,
    bottom: item.y + item.height / 2
  };
}

export function certificateQrRect(placement: CertificatePlacement, artworkAspectRatio = 1.5): PercentRect {
  const height = placement.qr.width * artworkAspectRatio;
  return {
    left: placement.qr.x,
    top: placement.qr.y,
    right: placement.qr.x + placement.qr.width,
    bottom: placement.qr.y + height
  };
}

export function certificateRectsOverlap(first: PercentRect, second: PercentRect, gap = 0): boolean {
  return first.left < second.right + gap
    && first.right + gap > second.left
    && first.top < second.bottom + gap
    && first.bottom + gap > second.top;
}

function groupNeedsPacking(placement: CertificatePlacement, roles: readonly CertificateTextRole[], gap: number): boolean {
  return roles.some((role, index) => roles.slice(index + 1).some((otherRole) =>
    certificateRectsOverlap(certificateTextRect(placement[role]), certificateTextRect(placement[otherRole]), 0.05)
  ));
}

function packVerticalGroup(
  placement: CertificatePlacement,
  roles: readonly CertificateTextRole[],
  top: number,
  bottom: number,
  gap: number,
  adjusted: Set<CertificateTextRole>
) {
  if (!groupNeedsPacking(placement, roles, gap)) return;
  // Preserve issued coordinates when restoring just one unsafe role resolves the collision.
  for (const role of roles) {
    const original = placement[role];
    const candidate = DEFAULT_CERTIFICATE_PLACEMENT[role];
    if (original.x === candidate.x && original.y === candidate.y && original.height === candidate.height) continue;
    placement[role] = { ...candidate };
    if (!groupNeedsPacking(placement, roles, gap)) {
      adjusted.add(role);
      return;
    }
    placement[role] = original;
  }
  const availableHeight = bottom - top;
  const requestedHeight = roles.reduce((total, role) => total + placement[role].height, 0) + gap * (roles.length - 1);
  const heightScale = requestedHeight > availableHeight
    ? (availableHeight - gap * (roles.length - 1)) / (requestedHeight - gap * (roles.length - 1))
    : 1;
  let cursor = top;
  roles.forEach((role) => {
    const item = placement[role];
    const height = Math.max(1.6, item.height * heightScale);
    item.height = height;
    item.y = cursor + height / 2;
    cursor += height + gap;
    adjusted.add(role);
  });
}

function copyDefaultRole(placement: CertificatePlacement, role: CertificateTextRole, adjusted: Set<CertificateTextRole>) {
  placement[role] = { ...DEFAULT_CERTIFICATE_PLACEMENT[role] };
  adjusted.add(role);
}

export function resolveCollisionSafeCertificatePlacement(
  value: CertificatePlacement,
  artworkAspectRatio = 1.5,
  exclusions: readonly CertificateArtworkExclusion[] = []
): ResolvedCertificatePlacement {
  const placement = clonePlacement(value);
  const adjusted = new Set<CertificateTextRole>();
  packVerticalGroup(placement, CENTRAL_ROLES, 28.8, 71.8, 0.55, adjusted);
  packVerticalGroup(placement, LEFT_DETAIL_ROLES, 73.1, 89.5, 0.5, adjusted);
  packVerticalGroup(placement, RIGHT_DETAIL_ROLES, 73.2, 88.8, 0.75, adjusted);

  for (const exclusion of exclusions) {
    for (const role of exclusion.roles) {
      if (certificateRectsOverlap(certificateTextRect(placement[role]), exclusion.rect, 0.15)) {
        copyDefaultRole(placement, role, adjusted);
      }
    }
  }

  // Resetting one unsafe legacy role can expose an old text-to-text collision.
  // Repack once, then re-assert the exact artwork exclusions.
  packVerticalGroup(placement, CENTRAL_ROLES, 28.8, 71.8, 0.55, adjusted);
  for (const exclusion of exclusions) {
    for (const role of exclusion.roles) {
      if (certificateRectsOverlap(certificateTextRect(placement[role]), exclusion.rect, 0.15)) {
        copyDefaultRole(placement, role, adjusted);
      }
    }
  }

  const qrRect = certificateQrRect(placement, artworkAspectRatio);
  const qrHeadingRect = certificateTextRect(placement.qrHeading);
  const qrInstructionsRect = certificateTextRect(placement.qrInstructions);
  if (certificateRectsOverlap(qrRect, qrHeadingRect, 0.35)
    || certificateRectsOverlap(qrRect, qrInstructionsRect, 0.35)) {
    copyDefaultRole(placement, "qrHeading", adjusted);
    copyDefaultRole(placement, "qrInstructions", adjusted);
  }

  const issuerRect = certificateTextRect(placement.issuer);
  if (certificateRectsOverlap(issuerRect, certificateQrRect(placement, artworkAspectRatio), 0.35)
    || certificateRectsOverlap(issuerRect, certificateTextRect(placement.qrHeading), 0.35)
    || certificateRectsOverlap(issuerRect, certificateTextRect(placement.qrInstructions), 0.35)) {
    copyDefaultRole(placement, "issuer", adjusted);
  }

  return { placement, adjustedRoles: [...adjusted] };
}

export function listCertificatePlacementCollisions(
  placement: CertificatePlacement,
  artworkAspectRatio = 1.5
): string[] {
  const collisions: string[] = [];
  const textRoles = Object.keys(placement).filter((key): key is CertificateTextRole =>
    key !== "layoutVersion" && key !== "qr"
  );
  textRoles.forEach((role, index) => {
    textRoles.slice(index + 1).forEach((otherRole) => {
      if (certificateRectsOverlap(certificateTextRect(placement[role]), certificateTextRect(placement[otherRole]), 0.05)) {
        collisions.push(`${role}:${otherRole}`);
      }
    });
  });
  const qrRect = certificateQrRect(placement, artworkAspectRatio);
  textRoles.forEach((role) => {
    if (certificateRectsOverlap(qrRect, certificateTextRect(placement[role]), 0.05)) {
      collisions.push(`qr:${role}`);
    }
  });
  return collisions;
}
