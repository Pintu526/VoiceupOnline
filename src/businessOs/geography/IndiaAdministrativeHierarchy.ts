import type {
  AdministrativeHierarchyConfig,
  GeographyDataSource,
  GeographyDataset,
  GeographyEntityKind,
  GeographyLevel,
  GeographyNode
} from "./types.ts";

export const INDIA_LGD_SOURCE: GeographyDataSource = {
  id: "india-lgd",
  name: "Local Government Directory",
  publisher: "Ministry of Panchayati Raj, Government of India",
  homepage: "https://lgdirectory.gov.in/",
  downloadPage: "https://lgdirectory.gov.in/demo/downloadDirectory.do",
  licenseName: "Government Open Data License - India",
  licenseUrl: "https://www.data.gov.in/godl",
  attribution:
    "Data source: Local Government Directory, Ministry of Panchayati Raj, Government of India; licensed under GODL-India.",
  authoritative: true,
  updateCadence: "monthly"
};

export const BUSINESS_OS_COMPATIBILITY_SOURCE: GeographyDataSource = {
  id: "business-os-compatibility-seed",
  name: "Business OS existing geography catalog",
  publisher: "Business OS",
  homepage: "",
  licenseName: "Internal compatibility data",
  attribution: "Existing Business OS compatibility catalog; replace with an authoritative country dataset.",
  authoritative: false
};

export const indiaAdministrativeHierarchy: AdministrativeHierarchyConfig = {
  countryCode: "IN",
  countryName: "India",
  rootId: "in",
  levels: [
    {
      level: "country",
      parentLevels: [],
      acceptedKinds: ["country"],
      terminology: { singular: "Country", plural: "Countries" }
    },
    {
      level: "state",
      parentLevels: ["country"],
      acceptedKinds: ["state", "union_territory"],
      terminology: {
        singular: "State / Union Territory",
        plural: "States / Union Territories",
        alternatives: ["State", "Union Territory", "UT"]
      }
    },
    {
      level: "district",
      parentLevels: ["state"],
      acceptedKinds: ["district"],
      terminology: { singular: "District", plural: "Districts" }
    },
    {
      level: "block",
      parentLevels: ["district"],
      acceptedKinds: ["development_block", "subdistrict", "taluk", "tehsil"],
      terminology: {
        singular: "Block / Taluk / Tehsil",
        plural: "Blocks / Taluks / Tehsils",
        alternatives: ["Development Block", "Sub-district", "Taluka", "Mandal"]
      }
    },
    {
      level: "local_body",
      parentLevels: ["block", "district"],
      acceptedKinds: [
        "gram_panchayat",
        "municipality",
        "municipal_corporation",
        "town_panchayat",
        "other_local_body"
      ],
      terminology: {
        singular: "Gram Panchayat / Municipality",
        plural: "Gram Panchayats / Municipalities",
        alternatives: ["Local Body", "Urban Local Body", "PRI Local Body"]
      }
    },
    {
      level: "village",
      parentLevels: ["local_body", "block"],
      acceptedKinds: ["village"],
      terminology: { singular: "Village", plural: "Villages" },
      optional: true
    },
    {
      level: "ward",
      parentLevels: ["local_body"],
      acceptedKinds: ["ward"],
      terminology: { singular: "Ward", plural: "Wards" },
      optional: true
    }
  ]
};

export const INDIA_STATE_AND_UNION_TERRITORY_NAMES = [
  "Andhra Pradesh",
  "Arunachal Pradesh",
  "Assam",
  "Bihar",
  "Chhattisgarh",
  "Goa",
  "Gujarat",
  "Haryana",
  "Himachal Pradesh",
  "Jharkhand",
  "Karnataka",
  "Kerala",
  "Madhya Pradesh",
  "Maharashtra",
  "Manipur",
  "Meghalaya",
  "Mizoram",
  "Nagaland",
  "Odisha",
  "Punjab",
  "Rajasthan",
  "Sikkim",
  "Tamil Nadu",
  "Telangana",
  "Tripura",
  "Uttar Pradesh",
  "Uttarakhand",
  "West Bengal",
  "Andaman and Nicobar Islands",
  "Chandigarh",
  "Dadra and Nagar Haveli and Daman and Diu",
  "Delhi",
  "Jammu and Kashmir",
  "Ladakh",
  "Lakshadweep",
  "Puducherry"
] as const;

const unionTerritories = new Set<string>([
  "Andaman and Nicobar Islands",
  "Chandigarh",
  "Dadra and Nagar Haveli and Daman and Diu",
  "Delhi",
  "Jammu and Kashmir",
  "Ladakh",
  "Lakshadweep",
  "Puducherry"
]);

export interface IndiaCompatibilityCatalogEntry {
  state: string;
  districts: Record<string, Record<string, readonly string[]>>;
}

export interface CreateIndiaDatasetInput {
  datasetVersion: string;
  source?: GeographyDataSource;
  districtsByState?: Record<string, readonly string[]>;
  localCatalog?: readonly IndiaCompatibilityCatalogEntry[];
}

export function getIndiaTerminology(level: GeographyLevel) {
  return indiaAdministrativeHierarchy.levels.find((item) => item.level === level)?.terminology;
}

export function isValidIndiaParentChild(parent: GeographyNode, child: GeographyNode): boolean {
  const definition = indiaAdministrativeHierarchy.levels.find((item) => item.level === child.level);
  return Boolean(
    definition
    && child.countryCode === "IN"
    && parent.countryCode === "IN"
    && definition.parentLevels.includes(parent.level)
    && definition.acceptedKinds.includes(child.kind)
  );
}

export function createIndiaAdministrativeDataset(input: CreateIndiaDatasetInput): GeographyDataset {
  const source = input.source ?? BUSINESS_OS_COMPATIBILITY_SOURCE;
  const nodes = new Map<string, GeographyNode>();
  const addNode = (node: GeographyNode) => {
    if (!nodes.has(node.id)) nodes.set(node.id, node);
  };
  const countryNode: GeographyNode = {
    id: indiaAdministrativeHierarchy.rootId,
    code: "IN",
    sourceId: source.id,
    countryCode: "IN",
    ancestorIds: [],
    level: "country",
    kind: "country",
    name: "India",
    active: true
  };
  addNode(countryNode);

  for (const stateName of INDIA_STATE_AND_UNION_TERRITORY_NAMES) {
    addNode({
      id: stateId(stateName),
      sourceId: source.id,
      countryCode: "IN",
      parentId: countryNode.id,
      ancestorIds: [countryNode.id],
      level: "state",
      kind: unionTerritories.has(stateName) ? "union_territory" : "state",
      name: stateName,
      active: true
    });
  }

  for (const [stateName, districts] of Object.entries(input.districtsByState ?? {})) {
    for (const districtName of districts) {
      addDistrict(addNode, source.id, stateName, districtName);
    }
  }

  for (const stateEntry of input.localCatalog ?? []) {
    for (const [districtName, blocks] of Object.entries(stateEntry.districts)) {
      const district = addDistrict(addNode, source.id, stateEntry.state, districtName);
      for (const [blockName, localBodies] of Object.entries(blocks)) {
        const block: GeographyNode = {
          id: `${district.id}-block-${slugify(blockName)}`,
          sourceId: source.id,
          countryCode: "IN",
          parentId: district.id,
          ancestorIds: [...district.ancestorIds, district.id],
          level: "block",
          kind: inferBlockKind(blockName),
          name: blockName,
          active: true
        };
        addNode(block);
        for (const localBodyName of localBodies) {
          addNode({
            id: `${block.id}-local-${slugify(localBodyName)}`,
            sourceId: source.id,
            countryCode: "IN",
            parentId: block.id,
            ancestorIds: [...block.ancestorIds, block.id],
            level: "local_body",
            kind: inferLocalBodyKind(localBodyName),
            name: localBodyName,
            active: true
          });
        }
      }
    }
  }

  const nodeList = [...nodes.values()];
  const count = (level: GeographyLevel) => nodeList.filter((node) => node.level === level).length;
  return {
    schemaVersion: 1,
    datasetVersion: input.datasetVersion,
    countryCode: "IN",
    source,
    coverage: [
      { level: "country", status: "complete", recordCount: 1 },
      {
        level: "state",
        status: "complete",
        recordCount: count("state"),
        note: "All 28 states and 8 Union Territories are represented."
      },
      {
        level: "district",
        status: "partial",
        recordCount: count("district"),
        note: "Compatibility seed only; load the current LGD districts dataset for production coverage."
      },
      {
        level: "block",
        status: "partial",
        recordCount: count("block"),
        note: "Compatibility seed only; LGD development blocks and sub-districts are the production sources."
      },
      {
        level: "local_body",
        status: "partial",
        recordCount: count("local_body"),
        note: "Compatibility seed only; load LGD PRI and urban local bodies for production coverage."
      },
      {
        level: "village",
        status: "planned",
        recordCount: count("village"),
        note: "The model and search APIs are ready for an LGD village dataset."
      },
      {
        level: "ward",
        status: "planned",
        recordCount: count("ward"),
        note: "The model and search APIs are ready for LGD rural and urban ward datasets."
      }
    ],
    nodes: nodeList
  };
}

function addDistrict(
  addNode: (node: GeographyNode) => void,
  sourceId: string,
  stateName: string,
  districtName: string
) {
  const state = stateId(stateName);
  const district: GeographyNode = {
    id: `${state}-district-${slugify(districtName)}`,
    sourceId,
    countryCode: "IN",
    parentId: state,
    ancestorIds: [indiaAdministrativeHierarchy.rootId, state],
    level: "district",
    kind: "district",
    name: districtName,
    active: true
  };
  addNode(district);
  return district;
}

function stateId(name: string) {
  return `in-state-${slugify(name)}`;
}

function inferBlockKind(name: string): GeographyEntityKind {
  const normalized = name.toLowerCase();
  if (normalized.includes("taluk")) return "taluk";
  if (normalized.includes("tehsil")) return "tehsil";
  if (normalized.includes("sub-district")) return "subdistrict";
  return "development_block";
}

function inferLocalBodyKind(name: string): GeographyEntityKind {
  const normalized = name.toLowerCase();
  if (normalized.includes("municipal corporation")) return "municipal_corporation";
  if (normalized.includes("municipality") || normalized.includes("ward") || normalized.includes("zone")) {
    return "municipality";
  }
  if (normalized.includes("town panchayat")) return "town_panchayat";
  return "gram_panchayat";
}

function slugify(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}
