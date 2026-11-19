export interface LocationValues {
  state: string;
  district: string;
  block: string;
  panchayat: string;
}

export interface LocationWithPin extends LocationValues {
  country?: string;
  postalCode: string;
  address?: string;
}

interface LocationCatalogEntry {
  state: string;
  districts: Record<string, Record<string, string[]>>;
}

export interface PinCodeEntry extends LocationWithPin {}

export type LocationOverrides = Record<string, Record<string, Record<string, string[]>>>;
export type LocationOverrideReferences = Record<
  string,
  import("./businessOs/location/persistence/PersistedLocationReference.ts").PersistedLocationReference
>;
export type LocationOverrideLevel = "district" | "block" | "panchayat";
export type LocationDeletionLevel = LocationOverrideLevel;

export interface LocationDeletions {
  districts: string[];
  blocks: string[];
  panchayats: string[];
}

export const emptyLocationDeletions: LocationDeletions = {
  districts: [],
  blocks: [],
  panchayats: []
};

export function addLocationOverride(overrides: LocationOverrides, values: LocationValues) {
  if (!values.state.trim() || !values.district.trim()) return overrides;

  const state = values.state.trim();
  const district = values.district.trim();
  const block = values.block.trim();
  const panchayat = values.panchayat.trim();
  const stateOverrides = overrides[state] ?? {};
  const districtKey = findExistingKey(Object.keys(stateOverrides), district) ?? district;
  const districtOverrides = stateOverrides[districtKey] ?? {};

  if (!block) {
    return {
      ...overrides,
      [state]: {
        ...stateOverrides,
        [districtKey]: districtOverrides
      }
    };
  }

  const blockKey = findExistingKey(Object.keys(districtOverrides), block) ?? block;
  const existingPanchayats = districtOverrides[blockKey] ?? [];
  const nextPanchayats =
    panchayat && !existingPanchayats.some((existing) => equalsIgnoreCase(existing, panchayat))
      ? uniqueOptions([...existingPanchayats, panchayat])
      : existingPanchayats;
  return {
    ...overrides,
    [state]: {
      ...stateOverrides,
      [districtKey]: {
        ...districtOverrides,
        [blockKey]: nextPanchayats
      }
    }
  };
}

export function removeLocationOverride(
  overrides: LocationOverrides,
  values: LocationValues,
  level: LocationOverrideLevel
) {
  const stateKey = findExistingKey(Object.keys(overrides), values.state);
  if (!stateKey) return overrides;

  const stateOverrides = overrides[stateKey];
  const districtKey = findExistingKey(Object.keys(stateOverrides), values.district);
  if (!districtKey) return overrides;

  if (level === "district") {
    const { [districtKey]: _removedDistrict, ...remainingDistricts } = stateOverrides;
    return pruneOverrides({ ...overrides, [stateKey]: remainingDistricts });
  }

  const districtOverrides = stateOverrides[districtKey];
  const blockKey = findExistingKey(Object.keys(districtOverrides), values.block);
  if (!blockKey) return overrides;

  if (level === "block") {
    const { [blockKey]: _removedBlock, ...remainingBlocks } = districtOverrides;
    return {
      ...overrides,
      [stateKey]: {
        ...stateOverrides,
        [districtKey]: remainingBlocks
      }
    };
  }

  const currentPanchayats = districtOverrides[blockKey] ?? [];
  const nextPanchayats = currentPanchayats.filter((panchayat) => !equalsIgnoreCase(panchayat, values.panchayat));

  return {
    ...overrides,
    [stateKey]: {
      ...stateOverrides,
      [districtKey]: {
        ...districtOverrides,
        [blockKey]: nextPanchayats
      }
    }
  };
}

export function addLocationDeletion(deletions: LocationDeletions, values: LocationValues, level: LocationDeletionLevel) {
  const nextDeletions = normalizeDeletions(deletions);
  if (level === "district") {
    return {
      ...nextDeletions,
      districts: addUniqueKey(nextDeletions.districts, districtKey(values.state, values.district))
    };
  }

  if (level === "block") {
    return {
      ...nextDeletions,
      blocks: addUniqueKey(nextDeletions.blocks, blockKey(values.state, values.district, values.block))
    };
  }

  return {
    ...nextDeletions,
    panchayats: addUniqueKey(
      nextDeletions.panchayats,
      panchayatKey(values.state, values.district, values.block, values.panchayat)
    )
  };
}

export function clearLocationDeletion(
  deletions: LocationDeletions,
  values: LocationValues,
  level: LocationDeletionLevel
) {
  const nextDeletions = normalizeDeletions(deletions);
  if (level === "district") {
    return {
      ...nextDeletions,
      districts: removeKey(nextDeletions.districts, districtKey(values.state, values.district))
    };
  }

  if (level === "block") {
    return {
      ...nextDeletions,
      blocks: removeKey(nextDeletions.blocks, blockKey(values.state, values.district, values.block))
    };
  }

  return {
    ...nextDeletions,
    panchayats: removeKey(
      nextDeletions.panchayats,
      panchayatKey(values.state, values.district, values.block, values.panchayat)
    )
  };
}

export function removeLocationOption(
  overrides: LocationOverrides,
  deletions: LocationDeletions,
  values: LocationValues,
  level: LocationDeletionLevel
) {
  return {
    overrides: removeLocationOverride(overrides, values, level),
    deletions: addLocationDeletion(deletions, values, level)
  };
}

export function hasDistrictOverride(overrides: LocationOverrides, state: string, district: string) {
  const stateKey = findExistingKey(Object.keys(overrides), state);
  if (!stateKey) return false;
  return Boolean(findExistingKey(Object.keys(overrides[stateKey]), district));
}

export function hasBlockOverride(overrides: LocationOverrides, state: string, district: string, block: string) {
  const stateKey = findExistingKey(Object.keys(overrides), state);
  if (!stateKey) return false;
  const districtKey = findExistingKey(Object.keys(overrides[stateKey]), district);
  if (!districtKey) return false;
  return Boolean(findExistingKey(Object.keys(overrides[stateKey][districtKey]), block));
}

export function hasPanchayatOverride(
  overrides: LocationOverrides,
  state: string,
  district: string,
  block: string,
  panchayat: string
) {
  const stateKey = findExistingKey(Object.keys(overrides), state);
  if (!stateKey) return false;
  const districtKey = findExistingKey(Object.keys(overrides[stateKey]), district);
  if (!districtKey) return false;
  const blockKey = findExistingKey(Object.keys(overrides[stateKey][districtKey]), block);
  if (!blockKey) return false;
  return overrides[stateKey][districtKey][blockKey]?.some((item) => equalsIgnoreCase(item, panchayat)) ?? false;
}

export function flattenLocationOverrides(overrides: LocationOverrides) {
  return Object.entries(overrides).flatMap(([state, districts]) =>
    Object.entries(districts).flatMap(([district, blocks]) => {
      const blockEntries = Object.entries(blocks);
      if (blockEntries.length === 0) return [{ state, district, block: "", panchayat: "" }];
      return blockEntries.flatMap(([block, panchayats]) => {
        if (panchayats.length === 0) return [{ state, district, block, panchayat: "" }];
        return panchayats.map((panchayat) => ({ state, district, block, panchayat }));
      });
    })
  );
}

export function mergeLocationOverrides(
  first: LocationOverrides = {},
  second: LocationOverrides = {}
): LocationOverrides {
  return Object.entries(second).reduce<LocationOverrides>((stateAccumulator, [state, districts]) => {
    const stateKey = findExistingKey(Object.keys(stateAccumulator), state) ?? state;
    const existingDistricts = stateAccumulator[stateKey] ?? {};
    const nextDistricts = Object.entries(districts).reduce<Record<string, Record<string, string[]>>>(
      (districtAccumulator, [district, blocks]) => {
        const districtKey = findExistingKey(Object.keys(districtAccumulator), district) ?? district;
        const existingBlocks = districtAccumulator[districtKey] ?? {};
        const nextBlocks = Object.entries(blocks).reduce<Record<string, string[]>>(
          (blockAccumulator, [block, panchayats]) => {
            const blockKey = findExistingKey(Object.keys(blockAccumulator), block) ?? block;
            blockAccumulator[blockKey] = uniqueOptions([...(blockAccumulator[blockKey] ?? []), ...panchayats]);
            return blockAccumulator;
          },
          { ...existingBlocks }
        );

        districtAccumulator[districtKey] = nextBlocks;
        return districtAccumulator;
      },
      { ...existingDistricts }
    );

    return {
      ...stateAccumulator,
      [stateKey]: nextDistricts
    };
  }, { ...first });
}

function equalsIgnoreCase(first: string, second: string) {
  return first.trim().toLowerCase() === second.trim().toLowerCase();
}

function uniqueOptions(values: string[]) {
  return Array.from(new Set(values)).sort((first, second) => first.localeCompare(second));
}

function findExistingKey(keys: string[], value: string) {
  return keys.find((key) => equalsIgnoreCase(key, value));
}

function normalizeDeletions(deletions: LocationDeletions | undefined): LocationDeletions {
  return {
    districts: deletions?.districts ?? [],
    blocks: deletions?.blocks ?? [],
    panchayats: deletions?.panchayats ?? []
  };
}

function districtKey(state: string, district: string) {
  return normalizeKey([state, district]);
}

function blockKey(state: string, district: string, block: string) {
  return normalizeKey([state, district, block]);
}

function panchayatKey(state: string, district: string, block: string, panchayat: string) {
  return normalizeKey([state, district, block, panchayat]);
}

function normalizeKey(values: string[]) {
  return values.map((value) => value.trim().toLowerCase()).join("||");
}

function addUniqueKey(values: string[], key: string) {
  return values.includes(key) ? values : [...values, key];
}

function removeKey(values: string[], key: string) {
  return values.filter((value) => value !== key);
}

function pruneOverrides(overrides: LocationOverrides) {
  return Object.entries(overrides).reduce<LocationOverrides>((stateAccumulator, [state, districts]) => {
    const nextDistricts = Object.entries(districts).reduce<Record<string, Record<string, string[]>>>(
      (districtAccumulator, [district, blocks]) => {
        const nextBlocks = Object.entries(blocks).reduce<Record<string, string[]>>(
          (blockAccumulator, [block, panchayats]) => {
            if (panchayats.length > 0) {
              blockAccumulator[block] = panchayats;
            }
            return blockAccumulator;
          },
          {}
        );

        if (Object.keys(nextBlocks).length > 0) {
          districtAccumulator[district] = nextBlocks;
        }
        return districtAccumulator;
      },
      {}
    );

    if (Object.keys(nextDistricts).length > 0) {
      stateAccumulator[state] = nextDistricts;
    }
    return stateAccumulator;
  }, {});
}
