# Business OS Location API v1 Contract

## Status and purpose

This document defines the future **Business OS canonical Location API v1** contract. It is a contract and migration target only: it does not change any existing application behaviour, data source, selector, API, database schema, or deployment.

Until a separately approved migration is completed, legacy location fields and behaviour remain supported exactly as they are today.

## 1. Canonical `LocationNode`

A canonical administrative geography record is a `LocationNode`.

```ts
type LocationLevel =
  | "country"
  | "state"
  | "district"
  | "block"
  | "local_body"
  | "village"
  | "ward";

interface LocationParentReference {
  nodeId: string;
  officialCode?: string;
  level: LocationLevel;
  relationship: "administrative_parent" | "official_containment";
}

interface LocationLineageEntry {
  nodeId: string;
  officialCode?: string;
  level: LocationLevel;
}

interface LocationNode {
  /** Stable, globally unique Business OS identity. */
  nodeId: string;
  /** The source authority's official code when that authority assigns one. */
  officialCode?: string;
  level: LocationLevel;
  /** Source-defined classification, for example gram_panchayat or municipality. */
  entityKind: string;
  /** Human-readable label; never an identity key. */
  displayName: string;
  /** Immutable source dataset release identifier. */
  datasetVersion: string;
  /** Source and provenance information for this node. */
  source: LocationSource;
  /** Immediate, official parent references only. */
  parents: LocationParentReference[];
  /** Ordered official ancestry, country through immediate parent. */
  lineage: LocationLineageEntry[];
}

interface LocationSource {
  authority: string;
  sourceDataset: string;
  sourceDatasetVersion: string;
  retrievedAt?: string;
  sourceRecordId?: string;
  provenance: "official" | "derived_official";
}
```

`nodeId` is required. `officialCode` is required whenever the governing source issues an official code. A node may have more than one official parent only when the source explicitly records those relationships; each relationship must state its meaning.

## 2. Canonical levels

The v1 administrative hierarchy uses only these levels:

1. `country`
2. `state`
3. `district`
4. `block`
5. `local_body`
6. `village`
7. `ward`

`entityKind` refines a level but does not replace it. Examples include `development_block`, `subdistrict`, `gram_panchayat`, `municipal_corporation`, `municipality`, and `notified_area_council`.

## 3. Relationship rules

- `country` → `state`
- `state` → `district`
- `district` → development block or subdistrict, where officially applicable
- `block` → appropriate rural local body, where officially supported
- `district` → urban local body
- `local_body` → village, where officially supported
- `local_body` → ward

The API must preserve the source's actual relationship model. It must not infer that a village belongs to a local body, a ward belongs to a local body, or a place belongs to a block merely because names, proximity, or common convention suggest it.

**No parent relationship may be fabricated.** An unavailable or unresolved relationship remains unavailable or unresolved.

## 4. Identity rule

`nodeId` and the source's `officialCode` are identity. `displayName` is presentation.

- Names, aliases, translated labels, normalised text, PIN codes, addresses, and coordinates are not canonical administrative identity.
- A consumer must store and compare `nodeId`, not `displayName`.
- A display name may change without changing a node's identity.
- A name lookup may produce a suggestion, a unique match, an ambiguous result, or no match. It must never silently become a canonical identity without validation.

## 5. Dataset version and provenance

Every returned or persisted canonical reference must carry enough information to reproduce its source context:

```ts
interface CanonicalLocationReference {
  nodeId: string;
  officialCode?: string;
  level: LocationLevel;
  datasetVersion: string;
  source: Pick<LocationSource, "authority" | "sourceDataset" | "sourceDatasetVersion">;
  lineage: LocationLineageEntry[];
}
```

The resolver and validator must reject, explicitly flag, or version-map references whose dataset version is unavailable, unsupported, or inconsistent with the requested validation context. Dataset refreshes must be additive and traceable; they must not overwrite provenance for existing persisted references.

## 6. Scope and policy model

Campaign, resource, coordinator, organization, and authority scopes must use canonical references rather than names-only paths.

```ts
interface LocationScope {
  scopeId: string;
  scopeType: "campaign" | "resource" | "coordinator" | "organization" | "authority";
  includedNodeIds: string[];
  excludedNodeIds?: string[];
  datasetVersion: string;
  policyVersion: string;
}
```

Scope evaluation uses a node's validated lineage. It must not depend on string comparison of state, district, block, panchayat, ward, village, or address fields.

## 7. Distinct non-canonical location categories

The following are useful location-related data, but are not `LocationNode` records and must remain distinct from canonical administrative geography:

| Category | Contract treatment |
|---|---|
| Official administrative geography | A versioned `LocationNode` with source provenance and validated lineage. |
| Custom or unverified place | A separate `CustomPlace` record with status, submitter/source, and optional proposed canonical parent. It has no canonical node ID until governed resolution occurs. |
| Street address | An address record/text associated with a party or event; it does not create an administrative node. |
| OCR suggestion | A confidence-bearing extraction candidate; it requires resolution or review before becoming a canonical reference. |
| GPS suggestion | Coordinates, accuracy, timestamp, and optional resolver candidates; coordinates do not establish administrative identity by themselves. |
| PIN/postal information | Postal metadata or a lookup clue; it may suggest candidates but must not assert a canonical hierarchy. |

## 8. Resolver and validator contract

### Resolver

The resolver accepts official identity first and name text second.

```ts
interface ResolveLocationRequest {
  nodeId?: string;
  officialCode?: string;
  normalizedName?: string;
  expectedLevel?: LocationLevel;
  parentNodeId?: string;
  datasetVersion?: string;
}

type ResolveLocationResponse =
  | { status: "resolved"; node: LocationNode }
  | { status: "ambiguous"; candidates: LocationNode[]; reason: string }
  | { status: "unresolved"; reason: string; suggestions?: LocationNode[] }
  | { status: "invalid_request"; reason: string };
```

Rules:

- Resolve by `nodeId` or `officialCode` where supplied.
- Resolve by normalized name only when exactly one candidate remains after any supplied level, parent, dataset, and source constraints.
- Return `ambiguous` when multiple valid candidates remain.
- Return `unresolved` when no canonical result exists.
- Never create, infer, or fabricate a canonical node from text, OCR, GPS, PIN, address, or a missing parent.

### Validator

```ts
interface ValidateLocationReferenceRequest {
  reference: CanonicalLocationReference;
  expectedLevel?: LocationLevel;
  requiredAncestorNodeIds?: string[];
  datasetVersion?: string;
}

type ValidateLocationReferenceResponse =
  | { valid: true; node: LocationNode }
  | { valid: false; code: "not_found" | "level_mismatch" | "parent_mismatch" | "lineage_mismatch" | "dataset_mismatch" | "source_mismatch"; reason: string };
```

Validation must confirm node existence, level, official parent/lineage relationships, dataset membership/version, and source provenance. It must fail explicitly rather than falling back to a similarly named node.

## 9. Conceptual API v1 endpoints

These are contract-level endpoints only. They are not implemented by this document.

| Endpoint | Purpose | High-level response |
|---|---|---|
| `GET /v1/locations/{nodeId}` | Fetch one canonical node | `LocationNode` or not-found result |
| `GET /v1/locations/by-code/{officialCode}` | Resolve an official code within source/version context | Resolver response |
| `POST /v1/locations/resolve` | Resolve ID, code, or constrained normalized name | `resolved`, `ambiguous`, `unresolved`, or invalid request |
| `POST /v1/locations/validate` | Validate a canonical reference and constraints | Validator response |
| `GET /v1/locations/{nodeId}/children` | List official child relationships | Versioned `LocationNode[]` and relationship metadata |
| `GET /v1/locations/{nodeId}/lineage` | Return validated official ancestry | `LocationLineageEntry[]` |
| `POST /v1/location-suggestions` | Submit OCR/GPS/PIN/address/custom-place evidence for candidate resolution | Non-canonical suggestion result; never a fabricated node |
| `POST /v1/location-scopes/validate` | Validate scope node references and lineage | Scope validation result |

Requests that receive text rather than canonical identity must preserve the input as evidence and return explicit resolution state. They must not silently substitute a different administrative node.

### External API host boundary

The framework-neutral v1 service is designed to be mounted under `/v1` by a future HTTP host. It is read-only for canonical geography.

- Authentication is a future API-key or service-identity boundary; no credential is embedded in the service contract.
- A host must apply per-client rate limiting and metering before exposing the API externally.
- A host must permit only explicit CORS origins and must never combine wildcard origins with credentialed requests.
- API consumers can read canonical geography, provenance, lineage, resolution, and validation results; they cannot mutate canonical data.
- Custom places, OCR/GPS/PIN/address evidence, and other unverified input must not mutate the canonical dataset through this API.
- Responses include `apiVersion: "v1"` and the active `datasetVersion`; resolver states remain `resolved`, `ambiguous`, `unresolved`, or `invalid`.

## 10. Backward compatibility and migration boundary

Location API v1 is additive until a later, explicitly approved migration step.

- Existing application location behaviour remains unchanged.
- Existing names-only fields, custom locations, legacy catalogs, generated data, public forms, campaign flows, signing, OTP, CRM, reports, QR, payments, Supabase, and Edge Functions are outside this contract-only change.
- No legacy source is removed by this contract.
- No existing consumer is required to call the future API until its dedicated migration is approved.
- A future migration must provide compatibility reads for legacy names while preventing new canonical writes from losing identity, dataset version, or lineage.
