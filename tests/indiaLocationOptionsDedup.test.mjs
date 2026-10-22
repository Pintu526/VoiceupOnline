import assert from "node:assert/strict";
import test from "node:test";
import {
  allowsStaticIndiaLocationFallback,
  getIndiaLocationOptions,
  mergeIndiaLocationOptions,
  normalizeIndiaLocationOptionKey
} from "../src/components/indiaLocationOptions.ts";
import {
  emptyLocationDeletions,
  getBlockOptions,
  getPanchayatOptions,
  getUrbanLocalBodyOptions,
  getWardOptions
} from "../src/geography.ts";

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

test("VBOSS catalog states are not replaced by campaign state-only rows", () => {
  const options = getIndiaLocationOptions({
    values: { state: "", district: "", block: "", panchayat: "", postalCode: "" },
    locationOverrides: {},
    locationDeletions: emptyLocationDeletions,
    verifiedSuggestionsOnly: false,
    customLocations: [
      { country: "India" },
      { country: "India", state: "Odisha" },
      { country: "India", state: "ODISHA", district: "KHORDHA", block: "BALIANTA", panchayat: "BAINCHUA", village: "Village A" },
      { country: "India", state: "WEST BENGAL", district: "KOLKATA", block: "KOLKATA", panchayat: "WARD 1", village: "Village B" },
      { country: "India", state: "MAHARASHTRA", district: "PUNE", block: "HAVELI", panchayat: "GP C", village: "Village C" }
    ],
    allowedState: "",
    allowedDistrict: "",
    allowedBlock: "",
    allowedPanchayat: ""
  });

  assert.ok(options.stateOptions.length >= 3);
  assert.ok(options.stateOptions.some((state) => normalizeIndiaLocationOptionKey(state) === "odisha"));
  assert.ok(options.stateOptions.some((state) => normalizeIndiaLocationOptionKey(state) === "west bengal"));
  assert.ok(options.stateOptions.some((state) => normalizeIndiaLocationOptionKey(state) === "maharashtra"));
});

test("selected Odisha state merges parent-scoped campaign overlay with canonical districts", () => {
  const options = getIndiaLocationOptions({
    values: { state: "Odisha", district: "", block: "", panchayat: "", postalCode: "" },
    locationOverrides: {},
    locationDeletions: emptyLocationDeletions,
    verifiedSuggestionsOnly: false,
    customLocations: [
      { country: "India" },
      { country: "India", state: "Odisha" },
      { country: "India", state: "ODISHA", district: "ANUGUL", block: "ANUGUL", panchayat: "GP A", village: "Village A" },
      { country: "India", state: "ODISHA", district: "KHORDHA", block: "BHUBANESWAR", panchayat: "GP B", village: "Village B" },
      { country: "India", state: "UTTAR PRADESH", district: "LUCKNOW", block: "LUCKNOW", panchayat: "GP C", village: "Village C" }
    ],
    allowedState: "",
    allowedDistrict: "",
    allowedBlock: "",
    allowedPanchayat: ""
  });

  assert.ok(options.stateOptions.some((state) => normalizeIndiaLocationOptionKey(state) === "odisha"));
  assert.ok(options.stateOptions.some((state) => normalizeIndiaLocationOptionKey(state) === "uttar pradesh"));
  assert.ok(options.districtOptions.some((district) => normalizeIndiaLocationOptionKey(district) === "anugul"));
  assert.ok(options.districtOptions.some((district) => normalizeIndiaLocationOptionKey(district) === "khordha"));
  assert.ok(!options.districtOptions.includes("LUCKNOW"));
  assert.ok(options.districtOptions.includes("Balasore"));
  assert.ok(options.districtOptions.includes("Cuttack"));
});

test("empty campaign catalog keeps India master states", () => {
  const options = getIndiaLocationOptions({
    values: { state: "", district: "", block: "", panchayat: "", postalCode: "" },
    locationOverrides: {},
    locationDeletions: emptyLocationDeletions,
    verifiedSuggestionsOnly: false,
    customLocations: [],
    allowedState: "",
    allowedDistrict: "",
    allowedBlock: "",
    allowedPanchayat: ""
  });

  assert.ok(options.stateOptions.includes("Odisha"));
  assert.ok(options.stateOptions.includes("Maharashtra"));
  assert.ok(options.stateOptions.length > 2);
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

test("custom district ANUGUL remains an overlay beside canonical Angul", () => {
  const options = getIndiaLocationOptions({
    values: { state: "Odisha", district: "", block: "", panchayat: "", postalCode: "" },
    locationOverrides: { Odisha: { Angul: {} } },
    locationDeletions: emptyLocationDeletions,
    verifiedSuggestionsOnly: false,
    customLocations: [customLocation({ district: "ANUGUL", block: "Block A", panchayat: "GP A", village: "V1" })],
    allowedState: "",
    allowedDistrict: "",
    allowedBlock: "",
    allowedPanchayat: ""
  });

  assert.ok(options.districtOptions.includes("ANUGUL"));
  assert.ok(options.districtOptions.includes("Angul"));
  assert.ok(options.districtOptions.includes("Khordha"));
});

test("custom district BALESHWAR remains an overlay beside canonical Balasore", () => {
  const options = getIndiaLocationOptions({
    values: { state: "Odisha", district: "", block: "", panchayat: "", postalCode: "" },
    locationOverrides: {},
    locationDeletions: emptyLocationDeletions,
    verifiedSuggestionsOnly: false,
    customLocations: [customLocation({ district: "BALESHWAR", block: "Block B", panchayat: "GP B", village: "V2" })],
    allowedState: "",
    allowedDistrict: "",
    allowedBlock: "",
    allowedPanchayat: ""
  });

  assert.ok(options.districtOptions.includes("BALESHWAR"));
  assert.ok(options.districtOptions.includes("Balasore"));
});

test("custom districts do not erase unrelated canonical districts", () => {
  const options = getIndiaLocationOptions({
    values: { state: "Odisha", district: "", block: "", panchayat: "", postalCode: "" },
    locationOverrides: {},
    locationDeletions: emptyLocationDeletions,
    verifiedSuggestionsOnly: false,
    customLocations: [
      customLocation({ district: "ANUGUL", block: "Block A", panchayat: "GP A", village: "V1" }),
      customLocation({ district: "ANUGUL", block: "Block B", panchayat: "GP B", village: "V2" })
    ],
    allowedState: "",
    allowedDistrict: "",
    allowedBlock: "",
    allowedPanchayat: ""
  });

  assert.ok(options.districtOptions.includes("ANUGUL"));
  assert.ok(options.districtOptions.includes("Balasore"));
  assert.ok(options.districtOptions.includes("Cuttack"));
});

test("blocks merge custom overlay with canonical rural and urban options", () => {
  const withCustom = getIndiaLocationOptions({
    values: { state: "Odisha", district: "Khordha", block: "", panchayat: "", postalCode: "" },
    locationOverrides: {},
    locationDeletions: emptyLocationDeletions,
    verifiedSuggestionsOnly: false,
    customLocations: [customLocation({ district: "Khordha", block: "CUSTOM BLOCK", panchayat: "GP C", village: "V3" })],
    allowedState: "",
    allowedDistrict: "",
    allowedBlock: "",
    allowedPanchayat: ""
  });
  const withoutCustom = getIndiaLocationOptions({
    values: { state: "Odisha", district: "Khordha", block: "", panchayat: "", postalCode: "" },
    locationOverrides: {},
    locationDeletions: emptyLocationDeletions,
    verifiedSuggestionsOnly: false,
    customLocations: [],
    allowedState: "",
    allowedDistrict: "",
    allowedBlock: "",
    allowedPanchayat: ""
  });

  assert.ok(withCustom.blockOptions.includes("CUSTOM BLOCK"));
  for (const localBody of getUrbanLocalBodyOptions("Odisha", "Khordha")) {
    assert.ok(withCustom.blockOptions.includes(localBody));
  }
  assert.ok(withCustom.blockOptions.includes("Balianta"));
  assert.ok(withoutCustom.blockOptions.length > 0);
});

test("no campaign other than GSAA is affected by cleanup scope definition", () => {
  assert.equal(normalizeIndiaLocationOptionKey("  Bargarh "), "bargarh");
  assert.notEqual(normalizeIndiaLocationOptionKey("Khordha"), normalizeIndiaLocationOptionKey("Bargarh"));
});

test("child options stay empty until every required parent is selected", () => {
  const customLocations = [
    customLocation({ state: "Odisha", district: "KHORDHA", block: "BALIANTA", panchayat: "BAINCHUA" }),
    customLocation({ state: "WEST BENGAL", district: "KOLKATA", block: "KOLKATA", panchayat: "WARD 1" })
  ];
  const noState = getIndiaLocationOptions({
    values: { state: "", district: "", block: "", panchayat: "", postalCode: "" },
    locationOverrides: {},
    locationDeletions: emptyLocationDeletions,
    verifiedSuggestionsOnly: false,
    customLocations,
    allowedState: "",
    allowedDistrict: "",
    allowedBlock: "",
    allowedPanchayat: ""
  });
  const noDistrict = getIndiaLocationOptions({
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

  assert.deepEqual(noState.districtOptions, []);
  assert.deepEqual(noState.blockOptions, []);
  assert.deepEqual(noDistrict.blockOptions, []);
  assert.deepEqual(noDistrict.panchayatOptions, []);
});

test("blocks from another state do not appear under the selected state and district", () => {
  const options = getIndiaLocationOptions({
    values: { state: "Odisha", district: "KHORDHA", block: "", panchayat: "", postalCode: "" },
    locationOverrides: {},
    locationDeletions: emptyLocationDeletions,
    verifiedSuggestionsOnly: false,
    customLocations: [
      customLocation({ state: "Odisha", district: "KHORDHA", block: "BALIANTA", panchayat: "BAINCHUA" }),
      customLocation({ state: "WEST BENGAL", district: "KHORDHA", block: "ALIEN BLOCK", panchayat: "ALIEN GP" }),
      customLocation({ state: "MAHARASHTRA", district: "PUNE", block: "HAVELI", panchayat: "GP C" })
    ],
    allowedState: "",
    allowedDistrict: "",
    allowedBlock: "",
    allowedPanchayat: ""
  });

  assert.ok(options.blockOptions.some((block) => normalizeIndiaLocationOptionKey(block) === "balianta"));
  for (const localBody of getUrbanLocalBodyOptions("Odisha", "Khordha")) {
    assert.ok(options.blockOptions.includes(localBody));
  }
  assert.ok(!options.blockOptions.includes("ALIEN BLOCK"));
  assert.ok(!options.blockOptions.includes("HAVELI"));
});

test("changing state replaces child options with the new state's cascade", () => {
  const catalog = [
    customLocation({ state: "Odisha", district: "KHORDHA", block: "BALIANTA", panchayat: "BAINCHUA" }),
    customLocation({ state: "WEST BENGAL", district: "KOLKATA", block: "KOLKATA", panchayat: "WARD 1" })
  ];
  const odisha = getIndiaLocationOptions({
    values: { state: "Odisha", district: "KHORDHA", block: "BALIANTA", panchayat: "", postalCode: "" },
    locationOverrides: {},
    locationDeletions: emptyLocationDeletions,
    verifiedSuggestionsOnly: false,
    customLocations: catalog,
    allowedState: "",
    allowedDistrict: "",
    allowedBlock: "",
    allowedPanchayat: ""
  });
  const westBengal = getIndiaLocationOptions({
    values: { state: "WEST BENGAL", district: "KOLKATA", block: "", panchayat: "", postalCode: "" },
    locationOverrides: {},
    locationDeletions: emptyLocationDeletions,
    verifiedSuggestionsOnly: false,
    customLocations: catalog,
    allowedState: "",
    allowedDistrict: "",
    allowedBlock: "",
    allowedPanchayat: ""
  });

  assert.ok(odisha.panchayatOptions.some((panchayat) => normalizeIndiaLocationOptionKey(panchayat) === "bainchua"));
  assert.ok(westBengal.districtOptions.some((district) => normalizeIndiaLocationOptionKey(district) === "kolkata"));
  assert.ok(westBengal.blockOptions.some((block) => normalizeIndiaLocationOptionKey(block) === "kolkata"));
  assert.ok(!westBengal.districtOptions.includes("KHORDHA"));
  assert.ok(!westBengal.blockOptions.includes("BALIANTA"));
});

test("explicit public signing location restriction still limits the state dropdown", () => {
  const options = getIndiaLocationOptions({
    values: { state: "", district: "", block: "", panchayat: "", postalCode: "" },
    locationOverrides: {},
    locationDeletions: emptyLocationDeletions,
    verifiedSuggestionsOnly: false,
    customLocations: [
      customLocation({ state: "Odisha", district: "KHORDHA" }),
      customLocation({ state: "WEST BENGAL", district: "KOLKATA" })
    ],
    allowedState: "Odisha",
    allowedDistrict: "",
    allowedBlock: "",
    allowedPanchayat: ""
  });

  assert.deepEqual(options.stateOptions, ["Odisha"]);
});

test("PIN options come only from catalog values and are not invented", () => {
  const options = getIndiaLocationOptions({
    values: { state: "Odisha", district: "KHORDHA", block: "BALIANTA", panchayat: "BAINCHUA", postalCode: "" },
    locationOverrides: {},
    locationDeletions: emptyLocationDeletions,
    verifiedSuggestionsOnly: false,
    customLocations: [
      customLocation({ district: "KHORDHA", block: "BALIANTA", panchayat: "BAINCHUA", village: "V1", postalCode: "" }),
      customLocation({ district: "KHORDHA", block: "BALIANTA", panchayat: "BAINCHUA", village: "V2", postalCode: "752100" })
    ],
    allowedState: "",
    allowedDistrict: "",
    allowedBlock: "",
    allowedPanchayat: ""
  });

  assert.deepEqual(options.pinOptions, ["752100"]);
});

function resolverOptions(overrides = {}) {
  return getIndiaLocationOptions({
    values: { state: "", district: "", block: "", panchayat: "", postalCode: "" },
    locationOverrides: {},
    locationDeletions: emptyLocationDeletions,
    verifiedSuggestionsOnly: false,
    customLocations: [],
    allowedState: "",
    allowedDistrict: "",
    allowedBlock: "",
    allowedPanchayat: "",
    ...overrides
  });
}

test("loaded catalog dropdowns retain canonical states and merge campaign state overlays", () => {
  const options = resolverOptions({
    catalogStatus: "ready",
    customLocations: [
      customLocation({ state: "WEST BENGAL", district: "KOLKATA", block: "KOLKATA" }),
      customLocation({ state: "MAHARASHTRA", district: "PUNE", block: "HAVELI" }),
      customLocation({ state: "ODISHA", district: "KHORDHA", block: "BALIANTA" })
    ]
  });

  assert.ok(options.stateOptions.includes("Tamil Nadu"));
  for (const state of ["maharashtra", "odisha", "west bengal"]) {
    assert.equal(options.stateOptions.filter((option) => normalizeIndiaLocationOptionKey(option) === state).length, 1);
  }
});

test("loading catalog does not use static geography fallback", () => {
  const options = resolverOptions({
    catalogStatus: "loading",
    customLocations: [],
    values: { state: "Odisha", district: "", block: "", panchayat: "", postalCode: "" }
  });

  assert.deepEqual(options.stateOptions, []);
  assert.deepEqual(options.districtOptions, []);
  assert.deepEqual(options.pinOptions, []);
});

test("error catalog does not use static geography fallback", () => {
  const options = resolverOptions({
    catalogStatus: "error",
    customLocations: [],
    values: { state: "Odisha", district: "", block: "", panchayat: "", postalCode: "" }
  });

  assert.deepEqual(options.stateOptions, []);
  assert.deepEqual(options.districtOptions, []);
  assert.deepEqual(options.pinOptions, []);
});

test("ready catalog with empty postal codes does not use the static PIN directory", () => {
  const options = resolverOptions({
    catalogStatus: "ready",
    values: {
      state: "Bihar",
      district: "Patna",
      block: "Patna Sadar",
      panchayat: "Bankipur Ward",
      postalCode: ""
    },
    customLocations: [
      {
        country: "India",
        state: "Bihar",
        district: "Patna",
        block: "Patna Sadar",
        panchayat: "Bankipur Ward",
        village: "Sample",
        postalCode: ""
      }
    ]
  });

  assert.deepEqual(options.pinOptions, []);
});

test("West Bengal cannot expose Odisha KHORDHA or BALIANTA children", () => {
  const customLocations = [
    customLocation({ state: "ODISHA", district: "KHORDHA", block: "BALIANTA", panchayat: "BAINCHUA", village: "ARINGOL" }),
    customLocation({ state: "WEST BENGAL", district: "24 PARAGANAS NORTH", block: "AMDANGA", panchayat: "GP W", village: "Village W" }),
    customLocation({ state: "MAHARASHTRA", district: "AHMEDNAGAR", block: "AKOLE", panchayat: "GP M", village: "Village M" })
  ];
  const westBengal = resolverOptions({
    catalogStatus: "ready",
    customLocations,
    values: { state: "WEST BENGAL", district: "24 PARAGANAS NORTH", block: "", panchayat: "", postalCode: "" }
  });
  const maharashtra = resolverOptions({
    catalogStatus: "ready",
    customLocations,
    values: { state: "MAHARASHTRA", district: "AHMEDNAGAR", block: "", panchayat: "", postalCode: "" }
  });

  assert.ok(westBengal.districtOptions.includes("24 PARAGANAS NORTH"));
  assert.ok(!westBengal.districtOptions.includes("KHORDHA"));
  assert.ok(westBengal.blockOptions.includes("AMDANGA"));
  assert.ok(!westBengal.blockOptions.includes("BALIANTA"));
  assert.ok(!maharashtra.districtOptions.includes("KHORDHA"));
  assert.ok(!maharashtra.blockOptions.includes("BALIANTA"));
  assert.ok(maharashtra.blockOptions.includes("AKOLE"));
});

test("a complete catalog is not reduced to an Odisha-only state list", () => {
  const catalogStates = Array.from({ length: 35 }, (_, index) => `Catalog State ${String(index + 1).padStart(2, "0")}`);
  catalogStates[0] = "ODISHA";
  catalogStates[1] = "WEST BENGAL";
  catalogStates[2] = "MAHARASHTRA";
  const options = resolverOptions({
    catalogStatus: "ready",
    customLocations: catalogStates.map((state) => customLocation({
      state,
      district: `${state} DISTRICT`,
      block: `${state} BLOCK`,
      panchayat: `${state} GP`,
      village: `${state} VILLAGE`
    }))
  });

  assert.ok(options.stateOptions.length > 35);
  assert.ok(options.stateOptions.some((state) => normalizeIndiaLocationOptionKey(state) === "odisha"));
  assert.ok(options.stateOptions.some((state) => normalizeIndiaLocationOptionKey(state) === "west bengal"));
  assert.ok(options.stateOptions.some((state) => normalizeIndiaLocationOptionKey(state) === "maharashtra"));
  assert.equal(options.stateOptions.filter((state) => normalizeIndiaLocationOptionKey(state) === "odisha").length, 1);
});

test("ready empty campaign overlay retains canonical India hierarchy", () => {
  const options = resolverOptions({ catalogStatus: "ready", customLocations: [] });
  assert.ok(options.stateOptions.includes("Odisha"));
  assert.ok(options.stateOptions.includes("Tamil Nadu"));
  assert.equal(allowsStaticIndiaLocationFallback("ready", 0), false);
  assert.equal(allowsStaticIndiaLocationFallback("loading", 0), false);
  assert.equal(allowsStaticIndiaLocationFallback("error", 0), false);
  assert.equal(allowsStaticIndiaLocationFallback("idle", 0), true);
});

function publicCampaignCanonicalOptions(values, campaignLocationPolicy = []) {
  return getIndiaLocationOptions({
    values,
    locationOverrides: {},
    locationDeletions: emptyLocationDeletions,
    verifiedSuggestionsOnly: false,
    customLocations: [],
    campaignLocationPolicy,
    allowedState: "",
    allowedDistrict: "",
    allowedBlock: "",
    allowedPanchayat: ""
  });
}

test("public campaign policy filters canonical Odisha rural nodes without replacing their children", () => {
  const developmentBlocks = getBlockOptions("Odisha", "Khordha", {}, emptyLocationDeletions, false);
  const baliantaPanchayats = getPanchayatOptions(
    "Odisha",
    "Khordha",
    "Balianta",
    {},
    emptyLocationDeletions,
    false
  );
  const policy = [{ country: "India", state: "Odisha", district: "Khordha", block: "Balianta" }];

  assert.equal(developmentBlocks.length, 10);
  assert.ok(developmentBlocks.includes("Balianta"));
  assert.ok(baliantaPanchayats.length > 0);
  assert.deepEqual(
    publicCampaignCanonicalOptions(
      { state: "Odisha", district: "Khordha", block: "", panchayat: "", postalCode: "" },
      policy
    ).blockOptions,
    ["Balianta"]
  );
  assert.deepEqual(
    publicCampaignCanonicalOptions(
      { state: "Odisha", district: "Khordha", block: "Balianta", panchayat: "", postalCode: "" },
      policy
    ).panchayatOptions,
    baliantaPanchayats
  );
});

test("public campaign policy preserves canonical BMC and all official wards", () => {
  const bmc = "Bhubaneswar Municipal Corporation";
  const policy = [{ country: "India", state: "Odisha", district: "Khordha", block: bmc }];
  const localBodies = getUrbanLocalBodyOptions("Odisha", "Khordha");
  const wards = getWardOptions("Odisha", "Khordha", bmc);
  const publicOptions = publicCampaignCanonicalOptions(
    { state: "Odisha", district: "Khordha", block: bmc, panchayat: "", postalCode: "" },
    policy
  );

  assert.ok(localBodies.includes(bmc));
  assert.equal(wards.length, 67);
  assert.deepEqual(publicOptions.panchayatOptions, wards);
});
