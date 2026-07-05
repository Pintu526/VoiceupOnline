import type { Campaign } from "../types";

export const storagePrefix = "voiceup-world-class-campaigns-v4";

export const categories: Campaign["category"][] = [
  "Civic",
  "Environment",
  "Education",
  "Health",
  "Transport",
  "Housing",
  "Other"
];

export const emptyMetrics = {
  total: 0,
  verified: 0,
  pending: 0,
  duplicates: 0,
  online: 0,
  scanned: 0,
  progress: 0
};

export const blankSigner = {
  name: "",
  email: "",
  phone: "",
  whatsappNumber: "",
  telegramHandle: "",
  otpVerified: false,
  selectedAuthorityId: "",
  selectedAuthorityName: "",
  state: "",
  district: "",
  block: "",
  panchayat: "",
  address: "",
  postalCode: "",
  comment: "",
  referralCode: "",
  referredBy: "",
  referredByPhoneOrCode: "",
  referralSource: undefined as "url" | "manual" | undefined
};

export const blankAdminLogin = {
  email: "",
  passcode: ""
};

export const blankAppLogin = {
  email: "",
  passcode: ""
};

export const blankScanTemplate = `Name:
Email:
Phone:
State:
District:
Block:
Gram Panchayat:
Address:
PIN Code:
Comment:`;
