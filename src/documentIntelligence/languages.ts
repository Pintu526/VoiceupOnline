import type { DocumentLanguagePack } from "./types.ts";

export const englishDocumentLanguagePack: DocumentLanguagePack = {
  code: "en",
  labels: {
    name: ["name", "full name", "applicant", "beneficiary", "person"],
    mobile: ["mobile", "mobile number", "phone", "phone number", "contact", "contact number"],
    village: ["village", "village name", "gram", "gram panchayat", "panchayat", "ward", "locality", "address"],
    district: ["district", "dist", "district name", "city"],
    state: ["state", "state name"]
  },
  labelCorrections: {
    narne: "name",
    nane: "name",
    nanne: "name",
    moblle: "mobile",
    rnobile: "mobile",
    mobilc: "mobile",
    ph0ne: "phone",
    vilage: "village",
    villagc: "village",
    viilage: "village",
    distrlct: "district",
    distnct: "district",
    districf: "district",
    statc: "state",
    sfate: "state"
  }
};

export type DocumentLanguageCode = "en" | "hi" | "or";

export function createDocumentLanguageRegistry(
  extensions: Partial<Record<"hi" | "or", DocumentLanguagePack>> = {}
): Partial<Record<DocumentLanguageCode, DocumentLanguagePack>> {
  return { en: englishDocumentLanguagePack, ...extensions };
}
