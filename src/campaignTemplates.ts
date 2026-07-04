import type { CampaignCategory, SignerRequiredField } from "./types";

export interface CampaignTemplate {
  id: string;
  categoryGroup: string;
  name: string;
  icon: string;
  campaignTitle: string;
  campaignSubtitle: string;
  summary: string;
  detailedDescription: string;
  objectives: string[];
  suggestedAuthorities: string[];
  suggestedDurationDays: number;
  suggestedTarget: number;
  suggestedCategory: CampaignCategory;
  suggestedTags: string[];
  suggestedBannerStyle: string;
  suggestedSupporterFields: SignerRequiredField[];
  socialShareText: string;
  whatsappMessage: string;
  emailSubject: string;
  preview: string;
}

const categoryMap: Record<string, CampaignCategory> = {
  "Civic Infrastructure": "Civic",
  Utilities: "Other",
  Education: "Education",
  Healthcare: "Health",
  Agriculture: "Other",
  Environment: "Environment",
  "Animal Welfare": "Other",
  Women: "Other",
  Youth: "Other",
  Governance: "Civic",
  Culture: "Other"
};

const icons: Record<string, string> = {
  "Civic Infrastructure": "Road",
  Utilities: "Zap",
  Education: "Book",
  Healthcare: "Heart",
  Agriculture: "Leaf",
  Environment: "Tree",
  "Animal Welfare": "Shield",
  Women: "Users",
  Youth: "Spark",
  Governance: "Landmark",
  Culture: "Temple"
};

const authorityHints: Record<string, string[]> = {
  "Civic Infrastructure": ["Municipal Commissioner", "District Collector", "Public Works Department"],
  Utilities: ["Electricity Board", "Water Supply Department", "Transport Department"],
  Education: ["District Education Officer", "School Management Committee", "Higher Education Department"],
  Healthcare: ["Chief District Medical Officer", "Health Department", "Hospital Superintendent"],
  Agriculture: ["Agriculture Officer", "District Collector", "Irrigation Department"],
  Environment: ["Municipal Commissioner", "Forest Department", "Pollution Control Board"],
  "Animal Welfare": ["Veterinary Officer", "Municipal Commissioner", "Animal Resources Department"],
  Women: ["Women and Child Development Department", "Police Commissioner", "District Collector"],
  Youth: ["District Sports Officer", "Skill Development Mission", "Employment Exchange"],
  Governance: ["District Collector", "Public Grievance Officer", "Relevant Department Secretary"],
  Culture: ["Culture Department", "Endowments Department", "Municipal Commissioner"]
};

const templateNames: Record<string, string[]> = {
  "Civic Infrastructure": [
    "Road Repair",
    "Pothole Repair",
    "Street Light",
    "Drainage",
    "Footpath",
    "Garbage Collection",
    "Public Toilet"
  ],
  Utilities: ["Drinking Water", "Electricity", "Internet", "Public Transport", "Traffic Management"],
  Education: ["School Improvement", "College Infrastructure", "Scholarship", "Library", "Teacher Recruitment"],
  Healthcare: ["Hospital Upgrade", "Blood Donation", "Medical Camp", "Ambulance", "PHC"],
  Agriculture: ["Irrigation", "Farmer Welfare", "Crop Insurance", "Dairy Development"],
  Environment: ["Tree Plantation", "River Cleaning", "Plastic Free", "Lake Restoration"],
  "Animal Welfare": ["Cow Protection", "Animal Shelter", "Veterinary Support"],
  Women: ["Women Safety", "SHG", "Hygiene"],
  Youth: ["Employment", "Startup", "Sports", "Skill Development"],
  Governance: ["RTI", "Citizen Rights", "Anti Corruption", "Public Policy"],
  Culture: ["Temple Development", "Heritage", "Festival"]
};

function slugify(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function makeTemplate(categoryGroup: string, name: string, index: number): CampaignTemplate {
  const lowerName = name.toLowerCase();
  const authorities = authorityHints[categoryGroup];
  const target = categoryGroup === "Governance" || categoryGroup === "Civic Infrastructure" ? 1000 : 500;

  return {
    id: `${slugify(categoryGroup)}-${slugify(name)}`,
    categoryGroup,
    name,
    icon: icons[categoryGroup] ?? "Campaign",
    campaignTitle: `Support ${name} for our community`,
    campaignSubtitle: `A focused public campaign for ${lowerName}.`,
    summary: `Help mobilize residents and request timely action on ${lowerName}.`,
    detailedDescription: `We are requesting the concerned authority to take clear, time-bound action on ${lowerName}. This campaign gathers verified public support, documents the local need, and presents a respectful appeal for practical resolution.`,
    objectives: [
      `Collect community support for ${lowerName}`,
      "Document the issue with clear local context",
      `Submit a consolidated petition to ${authorities[0]}`
    ],
    suggestedAuthorities: authorities,
    suggestedDurationDays: index % 3 === 0 ? 21 : 30,
    suggestedTarget: target + index * 100,
    suggestedCategory: categoryMap[categoryGroup] ?? "Other",
    suggestedTags: [categoryGroup, name, "Community", "Public Petition"],
    suggestedBannerStyle: `Use a clear local photo that shows the ${lowerName} context without heavy text overlays.`,
    suggestedSupporterFields: ["name", "phone"],
    socialShareText: `I signed this petition for ${name}. Join me and support the campaign.`,
    whatsappMessage: `Please support this ${name} campaign. Add your signature and share it with your local network.`,
    emailSubject: `Public support requested: ${name}`,
    preview: `Designed for quick launch with a ${target.toLocaleString()}+ supporter goal and authority-ready appeal copy.`
  };
}

export const campaignTemplates: CampaignTemplate[] = Object.entries(templateNames).flatMap(
  ([categoryGroup, names]) => names.map((name, index) => makeTemplate(categoryGroup, name, index))
);

export const campaignTemplateCategories = ["All", ...Object.keys(templateNames)];
