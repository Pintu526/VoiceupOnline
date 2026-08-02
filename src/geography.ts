import {
  GeographyService,
  INDIA_STATE_AND_UNION_TERRITORY_NAMES,
  BUSINESS_OS_COMPATIBILITY_SOURCE,
  createIndiaAdministrativeDataset,
  indiaAdministrativeHierarchy,
  type GeographyLevel,
  type GeographyNode
} from "./businessOs/geography/index.ts";

export interface LocationValues {
  state: string;
  district: string;
  block: string;
  panchayat: string;
}

export interface LocationWithPin extends LocationValues {
  country?: string;
  postalCode: string;
}

interface LocationCatalogEntry {
  state: string;
  districts: Record<string, Record<string, string[]>>;
}

export interface PinCodeEntry extends LocationWithPin {}

export type LocationOverrides = Record<string, Record<string, Record<string, string[]>>>;
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

export const indianStatesAndUnionTerritories = [...INDIA_STATE_AND_UNION_TERRITORY_NAMES];

export const indiaLocationCatalog: LocationCatalogEntry[] = [
  {
    state: "Bihar",
    districts: {
      Patna: {
        "Patna Sadar": ["Bankipur Ward", "Patna City Ward", "Phulwari Gram Panchayat"],
        Bihta: ["Bishunpura", "Katesar", "Painal"]
      },
      Gaya: {
        Gaya: ["Ghutiya", "Kujapi", "Kendui"],
        "Bodh Gaya": ["Mora Mardana", "Bakraur", "Shekhwara"]
      }
    }
  },
  {
    state: "Delhi",
    districts: {
      "Central Delhi": {
        "Karol Bagh": ["Dev Nagar Ward", "Pusa Ward", "Karol Bagh Ward"],
        "Civil Lines": ["Timarpur Ward", "Civil Lines Ward", "Kamla Nagar Ward"]
      },
      "South Delhi": {
        "Hauz Khas": ["Green Park Ward", "Hauz Khas Ward", "Malviya Nagar Ward"],
        Mehrauli: ["Mehrauli Ward", "Chhatarpur Ward", "Saket Ward"]
      }
    }
  },
  {
    state: "Karnataka",
    districts: {
      Bengaluru: {
        "Bengaluru North": ["Yelahanka Ward", "Jakkur Ward", "Vidyaranyapura Ward"],
        "Bengaluru South": ["Jayanagar Ward", "JP Nagar Ward", "Bommanahalli Ward"]
      },
      Mysuru: {
        Mysuru: ["Chamundi Hill", "Hootagalli", "Srirampura"],
        Nanjangud: ["Hadinaru", "Hullahalli", "Devarasanahalli"]
      }
    }
  },
  {
    state: "Maharashtra",
    districts: {
      Mumbai: {
        "Mumbai City": ["Colaba Ward", "Dadar Ward", "Byculla Ward"],
        "Mumbai Suburban": ["Andheri Ward", "Borivali Ward", "Kurla Ward"]
      },
      Pune: {
        Haveli: ["Wagholi", "Manjari Budruk", "Khadakwasla"],
        Mulshi: ["Hinjawadi", "Pirangut", "Lavale"]
      }
    }
  },
  {
    state: "Tamil Nadu",
    districts: {
      Chennai: {
        "Chennai North": ["Tondiarpet Zone", "Royapuram Zone", "Thiru Vi Ka Nagar Zone"],
        "Chennai South": ["Adyar Zone", "Perungudi Zone", "Sholinganallur Zone"]
      },
      Coimbatore: {
        "Coimbatore North": ["Thudiyalur", "Kavundampalayam", "Periyanaickenpalayam"],
        Pollachi: ["Pollachi North", "Pollachi South", "Anamalai"]
      }
    }
  },
  {
    state: "Uttar Pradesh",
    districts: {
      Lucknow: {
        "Lucknow Sadar": ["Indira Nagar Ward", "Aliganj Ward", "Gomti Nagar Ward"],
        "Bakshi Ka Talab": ["Itaunja", "Kumhrava", "Bargadi"]
      },
      Varanasi: {
        Kashi: ["Dashashwamedh Ward", "Bhelupur Ward", "Adampur Ward"],
        Pindra: ["Baragaon", "Pindra", "Phoolpur"]
      }
    }
  },
  {
    state: "West Bengal",
    districts: {
      Kolkata: {
        Kolkata: ["Ballygunge Ward", "Behala Ward", "Jorasanko Ward"],
        "South 24 Parganas": ["Sonarpur", "Baruipur", "Bishnupur"]
      },
      Darjeeling: {
        Darjeeling: ["Lebong", "Rangli Rangliot", "Jorebunglow Sukhiapokhri"],
        Siliguri: ["Matigara", "Naxalbari", "Phansidewa"]
      }
    }
  }
];

const districtOptionsByState: Record<string, string[]> = {
  "Andhra Pradesh": ["Alluri Sitharama Raju", "Anakapalli", "Anantapur", "Chittoor", "East Godavari", "Guntur", "Krishna", "Kurnool", "NTR", "Sri Potti Sriramulu Nellore", "Visakhapatnam", "Vijayawada"],
  "Arunachal Pradesh": ["Anjaw", "Changlang", "East Kameng", "East Siang", "Itanagar Capital Complex", "Lower Dibang Valley", "Lower Subansiri", "Papum Pare", "Tawang", "West Kameng", "West Siang"],
  Assam: ["Baksa", "Barpeta", "Bongaigaon", "Cachar", "Darrang", "Dibrugarh", "Goalpara", "Golaghat", "Jorhat", "Kamrup", "Kamrup Metropolitan", "Nagaon", "Sivasagar", "Sonitpur", "Tinsukia"],
  Bihar: ["Araria", "Aurangabad", "Bhagalpur", "Bhojpur", "Darbhanga", "Gaya", "Muzaffarpur", "Nalanda", "Patna", "Purnia", "Rohtas", "Saran", "Vaishali"],
  Chhattisgarh: ["Balod", "Baloda Bazar", "Bastar", "Bilaspur", "Dhamtari", "Durg", "Janjgir-Champa", "Korba", "Koriya", "Raipur", "Rajnandgaon", "Surguja"],
  Goa: ["North Goa", "South Goa"],
  Gujarat: ["Ahmedabad", "Amreli", "Anand", "Banaskantha", "Bhavnagar", "Gandhinagar", "Jamnagar", "Junagadh", "Kachchh", "Rajkot", "Surat", "Vadodara", "Valsad"],
  Haryana: ["Ambala", "Bhiwani", "Faridabad", "Fatehabad", "Gurugram", "Hisar", "Jhajjar", "Jind", "Karnal", "Kurukshetra", "Panipat", "Rohtak", "Sonipat", "Yamunanagar"],
  "Himachal Pradesh": ["Bilaspur", "Chamba", "Hamirpur", "Kangra", "Kinnaur", "Kullu", "Mandi", "Shimla", "Sirmaur", "Solan", "Una"],
  Jharkhand: ["Bokaro", "Chatra", "Deoghar", "Dhanbad", "Dumka", "East Singhbhum", "Giridih", "Hazaribagh", "Palamu", "Ranchi", "West Singhbhum"],
  Karnataka: ["Bagalkot", "Ballari", "Belagavi", "Bengaluru", "Bengaluru Rural", "Dakshina Kannada", "Dharwad", "Kalaburagi", "Mysuru", "Shivamogga", "Tumakuru", "Udupi"],
  Kerala: ["Alappuzha", "Ernakulam", "Idukki", "Kannur", "Kasaragod", "Kollam", "Kottayam", "Kozhikode", "Malappuram", "Palakkad", "Thiruvananthapuram", "Thrissur", "Wayanad"],
  "Madhya Pradesh": ["Bhopal", "Chhindwara", "Gwalior", "Indore", "Jabalpur", "Morena", "Rewa", "Sagar", "Satna", "Ujjain", "Vidisha"],
  Maharashtra: ["Ahmednagar", "Akola", "Amravati", "Aurangabad", "Jalgaon", "Kolhapur", "Mumbai", "Nagpur", "Nashik", "Pune", "Raigad", "Solapur", "Thane"],
  Manipur: ["Bishnupur", "Chandel", "Churachandpur", "Imphal East", "Imphal West", "Kakching", "Senapati", "Thoubal", "Ukhrul"],
  Meghalaya: ["East Garo Hills", "East Khasi Hills", "Jaintia Hills", "Ri Bhoi", "South Garo Hills", "West Garo Hills", "West Khasi Hills"],
  Mizoram: ["Aizawl", "Champhai", "Kolasib", "Lawngtlai", "Lunglei", "Mamit", "Saiha", "Serchhip"],
  Nagaland: ["Dimapur", "Kiphire", "Kohima", "Longleng", "Mokokchung", "Mon", "Phek", "Tuensang", "Wokha", "Zunheboto"],
  Odisha: ["Balangir", "Balasore", "Cuttack", "Dhenkanal", "Ganjam", "Kalahandi", "Keonjhar", "Khordha", "Koraput", "Mayurbhanj", "Puri", "Sambalpur", "Sundargarh"],
  Punjab: ["Amritsar", "Bathinda", "Faridkot", "Fatehgarh Sahib", "Fazilka", "Gurdaspur", "Hoshiarpur", "Jalandhar", "Ludhiana", "Patiala", "Sangrur", "SAS Nagar"],
  Rajasthan: ["Ajmer", "Alwar", "Bharatpur", "Bikaner", "Chittorgarh", "Jaipur", "Jodhpur", "Kota", "Nagaur", "Pali", "Sikar", "Udaipur"],
  Sikkim: ["East Sikkim", "North Sikkim", "South Sikkim", "West Sikkim"],
  "Tamil Nadu": ["Chennai", "Coimbatore", "Cuddalore", "Dindigul", "Erode", "Kancheepuram", "Madurai", "Salem", "Thanjavur", "Tiruchirappalli", "Tirunelveli", "Vellore"],
  Telangana: ["Adilabad", "Hyderabad", "Karimnagar", "Khammam", "Mahabubnagar", "Medak", "Nalgonda", "Nizamabad", "Rangareddy", "Warangal"],
  Tripura: ["Dhalai", "Gomati", "Khowai", "North Tripura", "Sepahijala", "South Tripura", "Unakoti", "West Tripura"],
  "Uttar Pradesh": ["Agra", "Aligarh", "Ayodhya", "Bareilly", "Gorakhpur", "Kanpur Nagar", "Lucknow", "Meerut", "Prayagraj", "Varanasi"],
  Uttarakhand: ["Almora", "Chamoli", "Dehradun", "Haridwar", "Nainital", "Pauri Garhwal", "Pithoragarh", "Tehri Garhwal", "Udham Singh Nagar", "Uttarkashi"],
  "West Bengal": ["Darjeeling", "Hooghly", "Howrah", "Kolkata", "Malda", "Murshidabad", "Nadia", "North 24 Parganas", "Paschim Bardhaman", "Purba Medinipur", "South 24 Parganas"],
  "Andaman and Nicobar Islands": ["Nicobar", "North and Middle Andaman", "South Andaman"],
  Chandigarh: ["Chandigarh"],
  "Dadra and Nagar Haveli and Daman and Diu": ["Dadra and Nagar Haveli", "Daman", "Diu"],
  Delhi: ["Central Delhi", "East Delhi", "New Delhi", "North Delhi", "North East Delhi", "North West Delhi", "Shahdara", "South Delhi", "South East Delhi", "South West Delhi", "West Delhi"],
  "Jammu and Kashmir": ["Anantnag", "Baramulla", "Budgam", "Doda", "Jammu", "Kathua", "Kupwara", "Pulwama", "Rajouri", "Srinagar", "Udhampur"],
  Ladakh: ["Kargil", "Leh"],
  Lakshadweep: ["Lakshadweep"],
  Puducherry: ["Karaikal", "Mahe", "Puducherry", "Yanam"]
};

export const indiaGeographyService = new GeographyService({
  hierarchies: [indiaAdministrativeHierarchy],
  datasets: [
    createIndiaAdministrativeDataset({
      datasetVersion: "business-os-compatibility-v1",
      source: BUSINESS_OS_COMPATIBILITY_SOURCE,
      districtsByState: districtOptionsByState,
      localCatalog: indiaLocationCatalog
    })
  ]
});

export function getMaintainedDistrictOptions(state: string): string[] {
  return getSharedChildNames(findSharedNode("state", state), "district");
}

export const pinCodeDirectory: PinCodeEntry[] = [
  {
    state: "Bihar",
    district: "Patna",
    block: "Patna Sadar",
    panchayat: "Bankipur Ward",
    postalCode: "800004"
  },
  {
    state: "Bihar",
    district: "Patna",
    block: "Patna Sadar",
    panchayat: "Patna City Ward",
    postalCode: "800008"
  },
  {
    state: "Bihar",
    district: "Patna",
    block: "Bihta",
    panchayat: "Bishunpura",
    postalCode: "801103"
  },
  {
    state: "Delhi",
    district: "Central Delhi",
    block: "Karol Bagh",
    panchayat: "Karol Bagh Ward",
    postalCode: "110005"
  },
  {
    state: "Delhi",
    district: "South Delhi",
    block: "Hauz Khas",
    panchayat: "Hauz Khas Ward",
    postalCode: "110016"
  },
  {
    state: "Karnataka",
    district: "Bengaluru",
    block: "Bengaluru North",
    panchayat: "Yelahanka Ward",
    postalCode: "560064"
  },
  {
    state: "Karnataka",
    district: "Bengaluru",
    block: "Bengaluru South",
    panchayat: "Jayanagar Ward",
    postalCode: "560041"
  },
  {
    state: "Maharashtra",
    district: "Mumbai",
    block: "Mumbai City",
    panchayat: "Colaba Ward",
    postalCode: "400005"
  },
  {
    state: "Maharashtra",
    district: "Pune",
    block: "Haveli",
    panchayat: "Wagholi",
    postalCode: "412207"
  },
  {
    state: "Tamil Nadu",
    district: "Chennai",
    block: "Chennai South",
    panchayat: "Adyar Zone",
    postalCode: "600020"
  },
  {
    state: "Tamil Nadu",
    district: "Coimbatore",
    block: "Pollachi",
    panchayat: "Pollachi North",
    postalCode: "642001"
  },
  {
    state: "Uttar Pradesh",
    district: "Lucknow",
    block: "Lucknow Sadar",
    panchayat: "Gomti Nagar Ward",
    postalCode: "226010"
  },
  {
    state: "Uttar Pradesh",
    district: "Varanasi",
    block: "Kashi",
    panchayat: "Bhelupur Ward",
    postalCode: "221010"
  },
  {
    state: "West Bengal",
    district: "Kolkata",
    block: "Kolkata",
    panchayat: "Ballygunge Ward",
    postalCode: "700019"
  },
  {
    state: "West Bengal",
    district: "Darjeeling",
    block: "Siliguri",
    panchayat: "Matigara",
    postalCode: "734010"
  }
];

export const blankLocation: LocationValues = {
  state: "",
  district: "",
  block: "",
  panchayat: ""
};

export function getDistrictOptions(
  state: string,
  overrides: LocationOverrides = {},
  deletions: LocationDeletions = emptyLocationDeletions,
  verifiedOnly = false
) {
  const sharedDistricts = getSharedChildNames(findSharedNode("state", state), "district");
  const customDistricts = verifiedOnly ? [] : Object.keys(overrides[state] ?? {});
  return uniqueOptions([...sharedDistricts, ...customDistricts]).filter(
    (district) => !isDistrictDeleted(deletions, state, district)
  );
}

export function getBlockOptions(
  state: string,
  district: string,
  overrides: LocationOverrides = {},
  deletions: LocationDeletions = emptyLocationDeletions,
  verifiedOnly = false
) {
  const stateNode = findSharedNode("state", state);
  const districtNode = findSharedNode("district", district, stateNode?.id);
  const blocks = getSharedChildNames(districtNode, "block");
  const customBlocks = verifiedOnly ? [] : Object.keys(overrides[state]?.[district] ?? {});
  if (blocks.length > 0) {
    return uniqueOptions([...blocks, ...customBlocks]).filter(
      (block) => !isBlockDeleted(deletions, state, district, block)
    );
  }
  if (verifiedOnly) return [];
  if (!district) return [];
  return uniqueOptions([
    ...customBlocks,
    `${district} Sadar`,
    `${district} Rural Block`,
    `${district} Urban Ward`,
    `${district} Development Block`
  ]).filter((block) => !isBlockDeleted(deletions, state, district, block));
}

export function getPanchayatOptions(
  state: string,
  district: string,
  block: string,
  overrides: LocationOverrides = {},
  deletions: LocationDeletions = emptyLocationDeletions,
  verifiedOnly = false
) {
  const stateNode = findSharedNode("state", state);
  const districtNode = findSharedNode("district", district, stateNode?.id);
  const blockNode = findSharedNode("block", block, districtNode?.id);
  const panchayats = getSharedChildNames(blockNode, "local_body");
  const customPanchayats = verifiedOnly ? [] : overrides[state]?.[district]?.[block] ?? [];
  if (panchayats.length > 0) {
    return uniqueOptions([...panchayats, ...customPanchayats]).filter(
      (panchayat) => !isPanchayatDeleted(deletions, state, district, block, panchayat)
    );
  }
  if (verifiedOnly) return [];
  if (!block) return [];
  return uniqueOptions([
    ...customPanchayats,
    `${block} Gram Panchayat`,
    `${block} Ward 1`,
    `${block} Ward 2`,
    `${block} Ward 3`
  ]).filter((panchayat) => !isPanchayatDeleted(deletions, state, district, block, panchayat));
}

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

export function findPinCode(values: LocationValues) {
  return pinCodeDirectory.find(
    (entry) =>
      equalsIgnoreCase(entry.state, values.state) &&
      equalsIgnoreCase(entry.district, values.district) &&
      equalsIgnoreCase(entry.block, values.block) &&
      equalsIgnoreCase(entry.panchayat, values.panchayat)
  )?.postalCode;
}

export function findLocationByPin(postalCode: string) {
  const normalizedPin = postalCode.replace(/\D/g, "");
  return pinCodeDirectory.find((entry) => entry.postalCode === normalizedPin);
}

export function getPinOptions(values: Partial<LocationValues>) {
  return pinCodeDirectory
    .filter((entry) => {
      if (values.state && !equalsIgnoreCase(entry.state, values.state)) return false;
      if (values.district && !equalsIgnoreCase(entry.district, values.district)) return false;
      if (values.block && !equalsIgnoreCase(entry.block, values.block)) return false;
      if (values.panchayat && !equalsIgnoreCase(entry.panchayat, values.panchayat)) return false;
      return true;
    })
    .map((entry) => entry.postalCode);
}

export function formatLocation(values: LocationValues) {
  return [values.panchayat, values.block, values.district, values.state].filter(Boolean).join(", ");
}

function equalsIgnoreCase(first: string, second: string) {
  return first.trim().toLowerCase() === second.trim().toLowerCase();
}

function findSharedNode(level: GeographyLevel, name: string, parentId?: string) {
  if (!name.trim()) return undefined;
  return indiaGeographyService.findNode({
    countryCode: "IN",
    level,
    name,
    parentId
  });
}

function getSharedChildNames(parent: GeographyNode | undefined, level: GeographyLevel) {
  if (!parent) return [];
  return indiaGeographyService.getChildren(parent.id, { levels: [level] }).map((node) => node.name);
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

function isDistrictDeleted(deletions: LocationDeletions, state: string, district: string) {
  return normalizeDeletions(deletions).districts.includes(districtKey(state, district));
}

function isBlockDeleted(deletions: LocationDeletions, state: string, district: string, block: string) {
  return normalizeDeletions(deletions).blocks.includes(blockKey(state, district, block));
}

function isPanchayatDeleted(
  deletions: LocationDeletions,
  state: string,
  district: string,
  block: string,
  panchayat: string
) {
  return normalizeDeletions(deletions).panchayats.includes(panchayatKey(state, district, block, panchayat));
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
