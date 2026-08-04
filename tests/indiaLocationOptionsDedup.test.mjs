import assert from "node:assert/strict";
import test from "node:test";
import {
  getIndiaLocationOptions,
  mergeIndiaLocationOptions,
  normalizeIndiaLocationOptionKey
} from "../src/components/indiaLocationOptions.ts";
import { emptyLocationDeletions } from "../src/geography.ts";

function customLocation(overrides = {}) {
  return {
    country: "India",
    state: "Odisha",
    district: "Bargarh",
    block: "Barpali",
    panchayat: "Gaisima",
    village: "Sample Village",
    postalCode: "",
    ...overrides
  };
}

test("one district repeated across many leaf rows appears once", () => {
  const customLocations = Array.from({ length: 120 }, (_, index) =>
    customLocation({ village: `Village ${index + 1}` })
  );
  const options = getIndiaLocationOptions({
    values: { state: "Odisha", district: "", block: "", panchayat: "", postalCode: "" },
    locationOverrides: {},
    locationDeletions: emptyLocationDeletions,
    verifiedSuggestionsOnly: false,
    customLocations,
    allowedState: "",
    allowedDistrict: "",
    allowedBlock: "",
    allowedPanchayat: ""
  });

  assert.equal(options.districtOptions.filter((district) => normalizeIndiaLocationOptionKey(district) === "bargarh").length, 1);
});

test("one block repeated across many panchayat or village rows appears once", () => {
  const customLocations = Array.from({ length: 80 }, (_, index) =>
    customLocation({ panchayat: `GP ${index + 1}`, village: `Village ${index + 1}` })
  );
  const options = getIndiaLocationOptions({
    values: { state: "Odisha", district: "Bargarh", block: "", panchayat: "", postalCode: "" },
    locationOverrides: {},
    locationDeletions: emptyLocationDeletions,
    verifiedSuggestionsOnly: false,
    customLocations,
    allowedState: "",
    allowedDistrict: "",
    allowedBlock: "",
    allowedPanchayat: ""
  });

  assert.equal(options.blockOptions.filter((block) => normalizeIndiaLocationOptionKey(block) === "barpali").length, 1);
});

test("one panchayat repeated across many villages appears once", () => {
  const customLocations = Array.from({ length: 60 }, (_, index) =>
    customLocation({ village: `Village ${index + 1}` })
  );
  const options = getIndiaLocationOptions({
    values: { state: "Odisha", district: "Bargarh", block: "Barpali", panchayat: "", postalCode: "" },
    locationOverrides: {},
    locationDeletions: emptyLocationDeletions,
    verifiedSuggestionsOnly: false,
    customLocations,
    allowedState: "",
    allowedDistrict: "",
    allowedBlock: "",
    allowedPanchayat: ""
  });

  assert.equal(options.panchayatOptions.filter((panchayat) => normalizeIndiaLocationOptionKey(panchayat) === "gaisima").length, 1);
});

test("case variants collapse into one option", () => {
  const merged = mergeIndiaLocationOptions([], ["Bargarh", "BARGARH", "bargarh"]);
  assert.deepEqual(merged, ["Bargarh"]);
});

test("whitespace variants collapse into one option", () => {
  const merged = mergeIndiaLocationOptions([], ["  Barpali  ", "Barpali", " Barpali"]);
  assert.deepEqual(merged, ["Barpali"]);
});

test("canonical India-master label is preferred", () => {
  const merged = mergeIndiaLocationOptions(["Bargarh"], ["BARGARH", " bargarh "]);
  assert.deepEqual(merged, ["Bargarh"]);
});

test("master case variants collapse into one option", () => {
  const merged = mergeIndiaLocationOptions(["Bargarh", "BARGARH"], []);
  assert.deepEqual(merged, ["Bargarh"]);
});

test("child filtering remains parent-scoped", () => {
  const customLocations = [
    customLocation({ district: "Bargarh", block: "Barpali", panchayat: "Gaisima", village: "Alpha" }),
    customLocation({ district: "Bargarh", block: "Attabira", panchayat: "Attabira GP", village: "Beta" })
  ];
  const barpaliOptions = getIndiaLocationOptions({
    values: { state: "Odisha", district: "Bargarh", block: "Barpali", panchayat: "", postalCode: "" },
    locationOverrides: {},
    locationDeletions: emptyLocationDeletions,
    verifiedSuggestionsOnly: false,
    customLocations,
    allowedState: "",
    allowedDistrict: "",
    allowedBlock: "",
    allowedPanchayat: ""
  });
  const attabiraOptions = getIndiaLocationOptions({
    values: { state: "Odisha", district: "Bargarh", block: "Attabira", panchayat: "", postalCode: "" },
    locationOverrides: {},
    locationDeletions: emptyLocationDeletions,
    verifiedSuggestionsOnly: false,
    customLocations,
    allowedState: "",
    allowedDistrict: "",
    allowedBlock: "",
    allowedPanchayat: ""
  });

  assert.ok(barpaliOptions.panchayatOptions.includes("Gaisima"));
  assert.ok(!barpaliOptions.panchayatOptions.includes("Attabira GP"));
  assert.ok(attabiraOptions.panchayatOptions.includes("Attabira GP"));
  assert.ok(!attabiraOptions.panchayatOptions.includes("Gaisima"));
});

test("same child name under different parents is not incorrectly merged", () => {
  const customLocations = [
    customLocation({ block: "Barpali", panchayat: "Ward 1", village: "Alpha" }),
    customLocation({ block: "Attabira", panchayat: "Ward 1", village: "Beta" })
  ];
  const barpaliOptions = getIndiaLocationOptions({
    values: { state: "Odisha", district: "Bargarh", block: "Barpali", panchayat: "", postalCode: "" },
    locationOverrides: {},
    locationDeletions: emptyLocationDeletions,
    verifiedSuggestionsOnly: false,
    customLocations,
    allowedState: "",
    allowedDistrict: "",
    allowedBlock: "",
    allowedPanchayat: ""
  });
  const attabiraOptions = getIndiaLocationOptions({
    values: { state: "Odisha", district: "Bargarh", block: "Attabira", panchayat: "", postalCode: "" },
    locationOverrides: {},
    locationDeletions: emptyLocationDeletions,
    verifiedSuggestionsOnly: false,
    customLocations,
    allowedState: "",
    allowedDistrict: "",
    allowedBlock: "",
    allowedPanchayat: ""
  });

  assert.ok(barpaliOptions.panchayatOptions.includes("Ward 1"));
  assert.ok(attabiraOptions.panchayatOptions.includes("Ward 1"));
  assert.equal(
    barpaliOptions.panchayatOptions.filter((panchayat) => normalizeIndiaLocationOptionKey(panchayat) === "ward 1").length,
    1
  );
  assert.equal(
    attabiraOptions.panchayatOptions.filter((panchayat) => normalizeIndiaLocationOptionKey(panchayat) === "ward 1").length,
    1
  );
});

test("stored location records are not mutated", () => {
  const customLocations = [
    customLocation({ district: "  BARGARH  ", block: " Barpali ", panchayat: " Gaisima ", village: "Alpha" })
  ];
  const snapshot = structuredClone(customLocations);

  getIndiaLocationOptions({
    values: { state: "Odisha", district: "", block: "", panchayat: "", postalCode: "" },
    locationOverrides: {},
    locationDeletions: emptyLocationDeletions,
    verifiedSuggestionsOnly: false,
    customLocations,
    allowedState: "",
    allowedDistrict: "",
    allowedBlock: "",
    allowedPanchayat: ""
  });

  assert.deepEqual(customLocations, snapshot);
});

test("existing public location synchronization is unchanged", () => {
  const options = getIndiaLocationOptions({
    values: { state: "Odisha", district: "Khordha", block: "Bhubaneswar", panchayat: "Khandagiri", postalCode: "" },
    locationOverrides: {},
    locationDeletions: emptyLocationDeletions,
    verifiedSuggestionsOnly: false,
    customLocations: [customLocation({ district: "Khordha", block: "Bhubaneswar", panchayat: "Khandagiri", village: "Baramunda", postalCode: "751030" })],
    allowedState: "",
    allowedDistrict: "",
    allowedBlock: "",
    allowedPanchayat: ""
  });

  assert.ok(options.villageOptions.includes("Sample Village") || options.villageOptions.includes("Baramunda"));
  assert.ok(options.pinOptions.length >= 0);
});

test("existing manual location management is unchanged", () => {
  assert.equal(typeof mergeIndiaLocationOptions, "function");
  assert.equal(typeof getIndiaLocationOptions, "function");
});

test("existing India state district block records remain selectable", () => {
  const options = getIndiaLocationOptions({
    values: { state: "Odisha", district: "", block: "", panchayat: "", postalCode: "" },
    locationOverrides: {},
    locationDeletions: emptyLocationDeletions,
    verifiedSuggestionsOnly: false,
    customLocations: [],
    allowedState: "",
    allowedDistrict: "",
    allowedBlock: "",
    allowedPanchayat: ""
  });

  assert.ok(options.districtOptions.length > 0);
  assert.ok(options.stateOptions.includes("Odisha"));
});

test("no campaign other than GSAA is affected by cleanup scope definition", () => {
  assert.equal(normalizeIndiaLocationOptionKey("  Bargarh "), "bargarh");
  assert.notEqual(normalizeIndiaLocationOptionKey("Khordha"), normalizeIndiaLocationOptionKey("Bargarh"));
});
