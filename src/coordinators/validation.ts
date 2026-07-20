import { normalizeEmail, normalizeIndianPhone, normalizePersonNameForComparison } from "../shared/deduplication/supporterIdentity.ts";
import {
  coordinatorRoles,
  coordinatorStatuses,
  type CoordinatorDraft,
  type CoordinatorGeographyInput,
  type CoordinatorGeographyLevel,
  type CoordinatorRole
} from "./types.ts";

export interface CoordinatorValidationResult {
  valid: boolean;
  errors: Partial<Record<"fullName" | "phone" | "email" | "role" | "status" | "geography", string>>;
}

const roleLevel: Partial<Record<CoordinatorRole, CoordinatorGeographyLevel>> = {
  national_coordinator: "country",
  state_coordinator: "state",
  district_coordinator: "district",
  block_coordinator: "block",
  panchayat_coordinator: "panchayat",
  ward_coordinator: "ward",
  field_coordinator: "ward"
};

export function getCoordinatorRoleLevel(role: CoordinatorRole): CoordinatorGeographyLevel | undefined {
  return roleLevel[role];
}

export function getCoordinatorGeographyLabel(geography: CoordinatorGeographyInput): string {
  return [
    geography.ward,
    geography.panchayat,
    geography.block,
    geography.district,
    geography.state,
    geography.country
  ].filter(Boolean).join(", ");
}

export function geographyForRole(
  geography: CoordinatorGeographyInput,
  role: CoordinatorRole
): CoordinatorGeographyInput {
  const next = { ...geography, country: geography.country.trim() || "India" };
  if (role === "national_coordinator") {
    return { ...next, state: "", district: "", block: "", panchayat: "", ward: "", postalCode: "" };
  }
  if (role === "state_coordinator") {
    return { ...next, district: "", block: "", panchayat: "", ward: "", postalCode: "" };
  }
  if (role === "district_coordinator") {
    return { ...next, block: "", panchayat: "", ward: "", postalCode: "" };
  }
  if (role === "block_coordinator") {
    return { ...next, panchayat: "", ward: "", postalCode: "" };
  }
  if (role === "panchayat_coordinator") {
    return { ...next, ward: "" };
  }
  if (role === "ward_coordinator") {
    return next;
  }
  return next;
}

export function validateCoordinatorDraft(draft: CoordinatorDraft): CoordinatorValidationResult {
  const errors: CoordinatorValidationResult["errors"] = {};
  const normalizedName = normalizePersonNameForComparison(draft.fullName);
  const normalizedPhone = normalizeIndianPhone(draft.phone);
  const normalizedEmail = normalizeEmail(draft.email);
  if (normalizedName.display.length < 2) errors.fullName = "Enter the coordinator's full name.";
  if (!normalizedPhone.verified) errors.phone = "Enter a valid 10-digit Indian mobile number.";
  if (draft.email.trim() && !normalizedEmail.verified) errors.email = "Enter a valid email address.";
  if (!coordinatorRoles.includes(draft.role)) errors.role = "Choose a valid coordinator role.";
  if (!coordinatorStatuses.includes(draft.status)) errors.status = "Choose a valid coordinator status.";
  const geography = geographyForRole(draft.geography, draft.role);
  const requiredLevel = getCoordinatorRoleLevel(draft.role);
  if (!geography.country || (requiredLevel && !geography[requiredLevel])) {
    errors.geography = "Choose geography that matches the coordinator role.";
  }
  return { valid: Object.keys(errors).length === 0, errors };
}
