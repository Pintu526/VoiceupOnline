export type AuthorityDirectoryKind = "Government" | "Political" | "NGO";
export type AuthorityDirectoryStatus = "Active" | "Retired" | "Vacant";

export interface AuthorityDirectoryEntry {
  id: string;
  name: string;
  designation: string;
  department: string;
  category: string;
  level: string;
  country: string;
  state: string;
  district: string;
  block: string;
  panchayat: string;
  ward: string;
  politicalParty: string;
  kind: AuthorityDirectoryKind;
  email: string;
  phone: string;
  officeAddress: string;
  website: string;
  socialLinks: string[];
  status: AuthorityDirectoryStatus;
  notes: string;
}

const authorityGroups = [
  {
    category: "Government",
    level: "National",
    kind: "Government" as const,
    designations: [
      "President",
      "Vice President",
      "Prime Minister",
      "Cabinet Minister",
      "Minister of State",
      "Secretary"
    ]
  },
  {
    category: "Government",
    level: "State",
    kind: "Government" as const,
    designations: ["Governor", "Chief Minister", "Chief Secretary"]
  },
  {
    category: "District",
    level: "District",
    kind: "Government" as const,
    designations: ["Collector", "District Magistrate", "SP", "CDO", "District Education Officer", "School Inspector"]
  },
  {
    category: "Municipal",
    level: "Municipal",
    kind: "Government" as const,
    designations: [
      "Municipal Commissioner",
      "Mayor",
      "Executive Engineer",
      "Junior Engineer",
      "Forest Officer",
      "Animal Husbandry Officer"
    ]
  },
  {
    category: "Block",
    level: "Block",
    kind: "Government" as const,
    designations: ["BDO", "Tehsildar"]
  },
  {
    category: "Panchayat",
    level: "Panchayat",
    kind: "Government" as const,
    designations: ["Sarpanch", "Ward Member"]
  },
  {
    category: "Political",
    level: "Public Representative",
    kind: "Political" as const,
    designations: ["MP", "MLA", "MLC", "Councillor", "Party President", "District President"]
  },
  {
    category: "NGO",
    level: "Community",
    kind: "NGO" as const,
    designations: ["Trust", "Temple Committee", "Citizen Groups"]
  }
];

const departments: Record<string, string> = {
  President: "President Secretariat",
  "Vice President": "Vice President Secretariat",
  "Prime Minister": "Prime Minister Office",
  Governor: "Raj Bhavan",
  "Chief Minister": "Chief Minister Office",
  "Cabinet Minister": "Council of Ministers",
  "Minister of State": "Council of Ministers",
  Secretary: "Department Secretariat",
  "Chief Secretary": "State Secretariat",
  Collector: "District Administration",
  "District Magistrate": "District Administration",
  SP: "Police",
  CDO: "District Development",
  "District Education Officer": "Education",
  "School Inspector": "Education",
  "Municipal Commissioner": "Municipal Administration",
  Mayor: "Municipal Corporation",
  "Executive Engineer": "Public Works",
  "Junior Engineer": "Public Works",
  "Forest Officer": "Forest Department",
  "Animal Husbandry Officer": "Animal Resources",
  BDO: "Block Development",
  Tehsildar: "Revenue",
  Sarpanch: "Gram Panchayat",
  "Ward Member": "Ward Office",
  MP: "Parliament",
  MLA: "Legislative Assembly",
  MLC: "Legislative Council",
  Councillor: "Municipal Council",
  "Party President": "Political Party",
  "District President": "Political Party",
  Trust: "Trust Administration",
  "Temple Committee": "Temple Committee",
  "Citizen Groups": "Citizen Collective"
};

const routingRules: Record<string, string[]> = {
  "Road Repair": ["Municipal Commissioner", "Executive Engineer", "Councillor"],
  "Pothole Repair": ["Municipal Commissioner", "Executive Engineer", "Ward Member"],
  "Street Light": ["Municipal Commissioner", "Junior Engineer", "Councillor"],
  Drainage: ["Municipal Commissioner", "Executive Engineer", "Ward Member"],
  Footpath: ["Municipal Commissioner", "Executive Engineer", "Councillor"],
  "Garbage Collection": ["Municipal Commissioner", "Mayor", "Ward Member"],
  "Public Toilet": ["Municipal Commissioner", "Executive Engineer", "Councillor"],
  "Tree Plantation": ["Forest Officer", "Collector", "Municipal Commissioner"],
  "River Cleaning": ["Collector", "Forest Officer", "Municipal Commissioner"],
  "Cow Protection": ["Animal Husbandry Officer", "Collector", "Chief Minister"],
  Education: ["District Education Officer", "Collector", "MLA"],
  "School Improvement": ["District Education Officer", "Collector", "School Inspector"],
  "Teacher Recruitment": ["District Education Officer", "Secretary", "Collector"],
  "Hospital Upgrade": ["Collector", "Chief Minister", "Secretary"],
  "Medical Camp": ["Collector", "CDO", "Municipal Commissioner"],
  Ambulance: ["Collector", "Chief Minister", "MLA"],
  PHC: ["Collector", "Chief Minister", "CDO"]
};

function slugify(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function makeEntry(group: (typeof authorityGroups)[number], designation: string): AuthorityDirectoryEntry {
  return {
    id: `authority-${slugify(group.category)}-${slugify(designation)}`,
    name: designation,
    designation,
    department: departments[designation] ?? designation,
    category: group.category,
    level: group.level,
    country: "India",
    state: "",
    district: "",
    block: "",
    panchayat: "",
    ward: "",
    politicalParty: group.kind === "Political" ? "Editable" : "",
    kind: group.kind,
    email: "",
    phone: "",
    officeAddress: "",
    website: "",
    socialLinks: [],
    status: "Active",
    notes: "Built-in recommendation profile. Replace with a verified local office before dispatch."
  };
}

export const authorityDirectory = authorityGroups.flatMap((group) =>
  group.designations.map((designation) => makeEntry(group, designation))
);

export const authorityDirectoryCategories = ["All", ...Array.from(new Set(authorityDirectory.map((entry) => entry.category)))];
export const authorityDirectoryKinds: Array<"All" | AuthorityDirectoryKind> = ["All", "Government", "Political", "NGO"];

export function getAuthorityRecommendations(templateName: string, templateCategory: string) {
  const designations = routingRules[templateName] ?? routingRules[templateCategory] ?? [];
  return designations
    .map((designation) =>
      authorityDirectory.find(
        (entry) => entry.designation === designation || entry.department === designation
      )
    )
    .filter((entry): entry is AuthorityDirectoryEntry => Boolean(entry));
}
