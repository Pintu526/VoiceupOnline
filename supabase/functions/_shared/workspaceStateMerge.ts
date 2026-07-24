type JsonRecord = Record<string, unknown>;

export interface WorkspaceStateMergeResult {
  state: JsonRecord;
  conflicts: string[];
}

const publicParticipationSignerFields = new Set([
  "id",
  "campaignId",
  "phone",
  "canonicalPhone",
  "otpVerified",
  "source",
  "status",
  "createdAt",
  "name",
  "email",
  "whatsappNumber",
  "telegramHandle",
  "selectedAuthorityId",
  "selectedAuthorityName",
  "countryId",
  "country",
  "stateId",
  "state",
  "districtId",
  "district",
  "blockId",
  "block",
  "panchayatId",
  "panchayat",
  "wardId",
  "ward",
  "address",
  "postalCode",
  "comment",
  "languagePreference",
  "communicationPreference",
  "volunteerInterest",
  "coordinatorInterest",
  "profilePhotoPath",
  "profilePhotoUpdatedAt",
  "profileCompletion",
  "referredBy",
  "referredByPhoneOrCode",
  "referralSource",
  "referralCode",
  "draftUpdatedAt",
  "profileUpdatedAt",
  "supportSubmittedAt",
  "signedAt",
  "digitalSupportedAt",
  "consentAccepted",
  "consentTextSnapshot",
  "consentVersion",
  "consentAcceptedAt",
  "consentSource",
  "consentCampaignId",
  "consentWorkspaceId",
  "consentEvidence",
  "consents",
  "consentHistory",
  "participationSources",
  "coordinatorApplication"
]);

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function asRecord(value: unknown): JsonRecord {
  return isRecord(value) ? value : {};
}

function asRecordArray(value: unknown): JsonRecord[] {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function hasOwn(record: JsonRecord, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(record, key);
}

function valuesEqual(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (Array.isArray(left) && Array.isArray(right)) {
    return left.length === right.length
      && left.every((value, index) => valuesEqual(value, right[index]));
  }
  if (isRecord(left) && isRecord(right)) {
    const leftKeys = Object.keys(left).sort();
    const rightKeys = Object.keys(right).sort();
    return leftKeys.length === rightKeys.length
      && leftKeys.every((key, index) =>
        key === rightKeys[index] && valuesEqual(left[key], right[key])
      );
  }
  return false;
}

export function workspaceStatesEqual(left: unknown, right: unknown): boolean {
  return valuesEqual(left, right);
}

function fieldsEqual(left: JsonRecord, right: JsonRecord, key: string): boolean {
  const leftHasKey = hasOwn(left, key);
  const rightHasKey = hasOwn(right, key);
  return leftHasKey === rightHasKey
    && (!leftHasKey || valuesEqual(left[key], right[key]));
}

function assignField(target: JsonRecord, source: JsonRecord, key: string) {
  if (hasOwn(source, key)) target[key] = source[key];
  else delete target[key];
}

function signerId(signer: JsonRecord): string {
  return String(signer.id ?? "");
}

function campaignId(signer: JsonRecord): string {
  return String(signer.campaignId ?? "");
}

function signerMap(signers: JsonRecord[]): Map<string, JsonRecord> {
  return new Map(
    signers
      .map((signer) => [signerId(signer), signer] as const)
      .filter(([id]) => Boolean(id))
  );
}

function isPublicParticipationSigner(signer: JsonRecord): boolean {
  return Boolean(
    signer.canonicalPhone
    || signer.draftUpdatedAt
    || signer.profileUpdatedAt
    || signer.supportSubmittedAt
    || signer.digitalSupportedAt
    || signer.consents
    || signer.consentHistory
    || signer.coordinatorApplication
  );
}

function mergeSigner(
  serverSigner: JsonRecord,
  requestedSigner: JsonRecord,
  serverBaseSigner: JsonRecord,
  clientBaseSigner: JsonRecord,
  conflicts: string[]
): JsonRecord {
  const merged: JsonRecord = {};
  const keys = new Set([
    ...Object.keys(serverBaseSigner),
    ...Object.keys(clientBaseSigner),
    ...Object.keys(serverSigner),
    ...Object.keys(requestedSigner)
  ]);
  const protectParticipation = isPublicParticipationSigner(serverSigner);
  const id = signerId(serverSigner) || signerId(requestedSigner) || "unknown";

  for (const key of keys) {
    const serverChanged = !fieldsEqual(serverSigner, serverBaseSigner, key);
    const clientChanged = !fieldsEqual(requestedSigner, clientBaseSigner, key);

    if (
      protectParticipation
      && publicParticipationSignerFields.has(key)
      && serverChanged
      && clientChanged
      && !fieldsEqual(serverSigner, requestedSigner, key)
    ) {
      conflicts.push(`signers.${id}.${key}`);
      assignField(merged, serverSigner, key);
      continue;
    }

    if (clientChanged && !serverChanged) {
      assignField(merged, requestedSigner, key);
    } else if (serverChanged && !clientChanged) {
      assignField(merged, serverSigner, key);
    } else if (clientChanged && serverChanged) {
      assignField(merged, requestedSigner, key);
    } else if (hasOwn(serverSigner, key)) {
      assignField(merged, serverSigner, key);
    } else {
      assignField(merged, requestedSigner, key);
    }
  }

  return merged;
}

function mergeSigners(
  serverState: JsonRecord,
  requestedState: JsonRecord,
  serverBaseState: JsonRecord,
  clientBaseState: JsonRecord,
  mergedState: JsonRecord,
  conflicts: string[]
): JsonRecord[] {
  const serverSigners = asRecordArray(serverState.signers);
  const requestedSigners = asRecordArray(requestedState.signers);
  const serverBaseById = signerMap(asRecordArray(serverBaseState.signers));
  const clientBaseById = signerMap(asRecordArray(clientBaseState.signers));
  const serverById = signerMap(serverSigners);
  const requestedIds = new Set(requestedSigners.map(signerId).filter(Boolean));
  const requestedCampaignIds = new Set(
    asRecordArray(mergedState.campaigns)
      .map((campaign) => String(campaign.id ?? ""))
      .filter(Boolean)
  );

  const merged = requestedSigners.map((requestedSigner) => {
    const id = signerId(requestedSigner);
    const serverSigner = id ? serverById.get(id) : undefined;
    if (!serverSigner) return requestedSigner;
    return mergeSigner(
      serverSigner,
      requestedSigner,
      serverBaseById.get(id) ?? {},
      clientBaseById.get(id) ?? {},
      conflicts
    );
  });

  for (const serverSigner of serverSigners) {
    const id = signerId(serverSigner);
    if (id && requestedIds.has(id)) continue;

    const signerCampaignId = campaignId(serverSigner);
    const campaignStillExists = requestedCampaignIds.size === 0
      || !signerCampaignId
      || requestedCampaignIds.has(signerCampaignId);
    const wasVisibleToClient = Boolean(id && clientBaseById.has(id));

    if (
      campaignStillExists
      && (isPublicParticipationSigner(serverSigner) || !wasVisibleToClient)
    ) {
      merged.push(serverSigner);
    }
  }

  return merged;
}

function auditId(entry: JsonRecord): string {
  return String(entry.id ?? "");
}

function mergeAuditLogs(serverState: JsonRecord, requestedState: JsonRecord): JsonRecord[] {
  const merged = new Map<string, JsonRecord>();
  const anonymous: JsonRecord[] = [];

  for (const entry of [
    ...asRecordArray(serverState.auditLogs),
    ...asRecordArray(requestedState.auditLogs)
  ]) {
    const id = auditId(entry);
    if (!id) {
      anonymous.push(entry);
      continue;
    }
    const existing = merged.get(id);
    const existingIsPublicParticipation = String(existing?.action ?? "")
      .startsWith("public_participation.");
    if (!existing || !existingIsPublicParticipation) merged.set(id, entry);
  }

  return [...merged.values(), ...anonymous]
    .sort((left, right) =>
      String(right.createdAt ?? "").localeCompare(String(left.createdAt ?? ""))
    )
    .slice(0, 500);
}

export function mergeWorkspaceStateForSave(
  serverValue: unknown,
  requestedValue: unknown,
  serverBaseValue: unknown,
  clientBaseValue: unknown = serverBaseValue
): WorkspaceStateMergeResult {
  const serverState = asRecord(serverValue);
  const requestedState = asRecord(requestedValue);
  const serverBaseState = asRecord(serverBaseValue);
  const clientBaseState = asRecord(clientBaseValue);
  const state: JsonRecord = {};
  const conflicts: string[] = [];
  const keys = new Set([
    ...Object.keys(serverBaseState),
    ...Object.keys(clientBaseState),
    ...Object.keys(serverState),
    ...Object.keys(requestedState)
  ]);

  for (const key of keys) {
    if (key === "signers" || key === "auditLogs" || key === "publicParticipationIdempotency") {
      continue;
    }
    const serverChanged = !fieldsEqual(serverState, serverBaseState, key);
    const clientChanged = !fieldsEqual(requestedState, clientBaseState, key);
    if (clientChanged && !serverChanged) {
      assignField(state, requestedState, key);
    } else if (serverChanged && !clientChanged) {
      assignField(state, serverState, key);
    } else if (clientChanged && serverChanged) {
      assignField(state, requestedState, key);
    } else if (hasOwn(serverState, key)) {
      assignField(state, serverState, key);
    } else {
      assignField(state, requestedState, key);
    }
  }

  state.signers = mergeSigners(
    serverState,
    requestedState,
    serverBaseState,
    clientBaseState,
    state,
    conflicts
  );
  state.auditLogs = mergeAuditLogs(serverState, requestedState);

  if (hasOwn(serverState, "publicParticipationIdempotency")) {
    state.publicParticipationIdempotency = serverState.publicParticipationIdempotency;
  }

  return { state, conflicts: [...new Set(conflicts)].sort() };
}

export function nextWorkspaceUpdatedAt(
  currentUpdatedAt: string | null | undefined,
  now = Date.now()
): string {
  const current = Date.parse(String(currentUpdatedAt ?? ""));
  const next = Number.isFinite(current) ? Math.max(now, current + 1) : now;
  return new Date(next).toISOString();
}
