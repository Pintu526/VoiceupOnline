import type { AuthorityRule, Campaign, Organization, Signer, SuggestedFeature } from "./types";

export const initialCampaigns: Campaign[] = [
  {
    id: "cmp-clean-water",
    title: "Clean Water for North Ward",
    slug: "clean-water-north-ward",
    category: "Civic",
    description:
      "Request urgent municipal action to repair water pipelines, publish quality test results, and provide safe drinking water to residents.",
    location: "North Ward",
    postalCode: "56001",
    startDate: "2026-06-01",
    endDate: "2026-07-31",
    goal: 5000,
    status: "Published",
    consentText:
      "I consent to Voiceup Online storing my details for this campaign and submitting them to the relevant public authority.",
    requiredFields: ["name", "email", "phone", "address", "postalCode"],
    shareUrl: "https://voiceup.example/c/clean-water-north-ward",
    qrLabel: "VOICEUP-CLEAN-WATER"
  }
];

export const initialSigners: Signer[] = [
  {
    id: "sig-1001",
    campaignId: "cmp-clean-water",
    name: "Anika Rao",
    email: "anika.rao@example.com",
    phone: "+91 90000 10001",
    address: "14 Lake View Road, North Ward",
    postalCode: "56001",
    comment: "Please publish water quality reports every week.",
    source: "online",
    status: "verified",
    signedAt: "2026-06-18T10:30:00.000Z"
  },
  {
    id: "sig-1002",
    campaignId: "cmp-clean-water",
    name: "Ravi Menon",
    email: "ravi.menon@example.com",
    phone: "+91 90000 10002",
    address: "2 Market Street, North Ward",
    postalCode: "56001",
    comment: "Our school children need safe water.",
    source: "field",
    status: "verified",
    signedAt: "2026-06-18T14:20:00.000Z"
  },
  {
    id: "sig-1003",
    campaignId: "cmp-clean-water",
    name: "Farah Khan",
    email: "farah.khan@example.com",
    phone: "+91 90000 10003",
    address: "88 Station Road, North Ward",
    postalCode: "56002",
    comment: "Water tankers should be scheduled until repairs are complete.",
    source: "scan",
    status: "pending",
    signedAt: "2026-06-19T09:15:00.000Z",
    scanFileName: "north-ward-batch-01.png"
  },
  {
    id: "sig-1004",
    campaignId: "cmp-clean-water",
    name: "Joseph D'Souza",
    email: "joseph.dsouza@example.com",
    phone: "+91 90000 10004",
    address: "31 Church Lane, North Ward",
    postalCode: "56001",
    comment: "I support immediate action.",
    source: "online",
    status: "verified",
    signedAt: "2026-06-20T08:05:00.000Z"
  }
];

export const initialAuthorities: AuthorityRule[] = [
  {
    id: "auth-municipal-north",
    name: "North Ward Municipal Commissioner",
    department: "Water Supply and Sanitation",
    category: "Civic",
    locationKeyword: "north",
    postalPrefix: "560",
    email: "commissioner.north@example.gov",
    submissionMethod: "Email",
    confidence: 94
  },
  {
    id: "auth-environment-state",
    name: "State Pollution Control Board",
    department: "Environmental Compliance",
    category: "Environment",
    locationKeyword: "",
    postalPrefix: "",
    email: "complaints.environment@example.gov",
    submissionMethod: "Portal",
    confidence: 82
  },
  {
    id: "auth-transport-city",
    name: "City Transport Authority",
    department: "Roads and Public Transport",
    category: "Transport",
    locationKeyword: "",
    postalPrefix: "56",
    email: "transport.grievance@example.gov",
    submissionMethod: "Portal",
    confidence: 80
  }
];

export const initialOrganization: Organization = {
  name: "Voiceup Online",
  plan: "Professional",
  trialEndsAt: "2026-07-20",
  monthlySignatureLimit: 25000,
  monthlyScanLimit: 2000,
  customBranding: true,
  customDomain: "campaigns.voiceup.example",
  ownerEmail: "admin@voiceup.example"
};

export const suggestedFeatures: SuggestedFeature[] = [
  {
    title: "Volunteer/canvasser mobile mode",
    benefit: "Collect signatures offline during field visits and sync them when internet is available.",
    tier: "Professional"
  },
  {
    title: "Automated supporter updates",
    benefit: "Send SMS, WhatsApp, or email updates when milestones are reached or submissions are made.",
    tier: "Professional"
  },
  {
    title: "White-label portals",
    benefit: "Let client organizations use their own logo, color theme, and domain.",
    tier: "Enterprise"
  },
  {
    title: "Audit log and legal evidence pack",
    benefit: "Export a defensible submission bundle with consent, timestamps, scans, and reviewer actions.",
    tier: "Enterprise"
  }
];
