export interface LocationValues {
  state: string;
  district: string;
  block: string;
  panchayat: string;
}

export interface LocationWithPin extends LocationValues {
  postalCode: string;
}

interface LocationCatalogEntry {
  state: string;
  districts: Record<string, Record<string, string[]>>;
}

export interface PinCodeEntry extends LocationWithPin {}

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

export function getDistrictOptions(state: string) {
  const entry = indiaLocationCatalog.find((item) => item.state === state);
  const catalogDistricts = entry ? Object.keys(entry.districts) : [];
  const fallbackDistricts = districtOptionsByState[state] ?? [];
  return uniqueOptions([...catalogDistricts, ...fallbackDistricts]);
}

export function getBlockOptions(state: string, district: string) {
  const entry = indiaLocationCatalog.find((item) => item.state === state);
  const blocks = entry?.districts[district];
  if (blocks) return Object.keys(blocks);
  if (!district) return [];
  return [`${district} Sadar`, `${district} Rural Block`, `${district} Urban Ward`, `${district} Development Block`];
}

export function getPanchayatOptions(state: string, district: string, block: string) {
  const entry = indiaLocationCatalog.find((item) => item.state === state);
  const panchayats = entry?.districts[district]?.[block];
  if (panchayats) return panchayats;
  if (!block) return [];
  return [`${block} Gram Panchayat`, `${block} Ward 1`, `${block} Ward 2`, `${block} Ward 3`];
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

function uniqueOptions(values: string[]) {
  return Array.from(new Set(values)).sort((first, second) => first.localeCompare(second));
}
