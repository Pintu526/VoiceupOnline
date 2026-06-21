export interface LocationValues {
  state: string;
  district: string;
  block: string;
  panchayat: string;
}

interface LocationCatalogEntry {
  state: string;
  districts: Record<string, Record<string, string[]>>;
}

export const indianStatesAndUnionTerritories = [
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
];

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

export const blankLocation: LocationValues = {
  state: "",
  district: "",
  block: "",
  panchayat: ""
};

export function getDistrictOptions(state: string) {
  const entry = indiaLocationCatalog.find((item) => item.state === state);
  return entry ? Object.keys(entry.districts) : [];
}

export function getBlockOptions(state: string, district: string) {
  const entry = indiaLocationCatalog.find((item) => item.state === state);
  const blocks = entry?.districts[district];
  return blocks ? Object.keys(blocks) : [];
}

export function getPanchayatOptions(state: string, district: string, block: string) {
  const entry = indiaLocationCatalog.find((item) => item.state === state);
  return entry?.districts[district]?.[block] ?? [];
}

export function formatLocation(values: LocationValues) {
  return [values.panchayat, values.block, values.district, values.state].filter(Boolean).join(", ");
}
