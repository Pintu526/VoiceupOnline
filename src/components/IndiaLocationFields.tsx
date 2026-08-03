import { useState } from "react";
import {
  findLocationByPin,
  findPinCode,
  getBlockOptions,
  getDistrictOptions,
  getPanchayatOptions,
  getPinOptions,
  indianStatesAndUnionTerritories,
  type LocationDeletionLevel,
  type LocationDeletions,
  type LocationOverrides,
  type LocationWithPin
} from "../geography";
import type { LocationGovernanceLevel, SignerRequiredField } from "../types";
import { Field } from "../ui/Field";
import { InlineAddOption } from "./InlineAddOption";
import { InlineDeleteOption } from "./InlineDeleteOption";
import { getLocationLevelLabel, isLocationLevelAtLeast } from "../utils/campaign";
import type { PublicCampaignCustomLocation } from "../backend";

interface IndiaLocationFieldsProps {
  idPrefix: string;
  values: LocationWithPin;
  onChange: (values: LocationWithPin) => void;
  locationOverrides: LocationOverrides;
  locationDeletions: LocationDeletions;
  allowInlineAdd?: boolean;
  allowedLocation?: Partial<LocationWithPin>;
  lockedLevel?: LocationGovernanceLevel;
  hiddenLockedLevel?: LocationGovernanceLevel;
  requiredFields?: SignerRequiredField[];
  showOptionalLabels?: boolean;
  labelOverrides?: Partial<Record<SignerRequiredField, string>>;
  fixedCountry?: string;
  verifiedSuggestionsOnly?: boolean;
  onAddLocation?: (values: LocationWithPin) => boolean | Promise<boolean>;
  onRemoveLocation?: (values: LocationWithPin, level: LocationDeletionLevel) => void;
  customLocations?: PublicCampaignCustomLocation[];
}

function optionExists(options: string[], value: string): boolean {
  const normalizedValue = value.trim().toLowerCase();
  return options.some((option) => option.trim().toLowerCase() === normalizedValue);
}

export function IndiaLocationFields({
  idPrefix,
  values,
  onChange,
  locationOverrides,
  locationDeletions,
  allowInlineAdd = false,
  allowedLocation,
  lockedLevel = "none",
  hiddenLockedLevel = "none",
  requiredFields = [],
  showOptionalLabels = false,
  labelOverrides,
  fixedCountry,
  verifiedSuggestionsOnly = false,
  onAddLocation,
  onRemoveLocation,
  customLocations = []
}: IndiaLocationFieldsProps) {
  const [newDistrict, setNewDistrict] = useState("");
  const [newBlock, setNewBlock] = useState("");
  const [newPanchayat, setNewPanchayat] = useState("");
  const [pendingAdd, setPendingAdd] = useState<{
    values: LocationWithPin;
    level: "district" | "block" | "panchayat";
    label: string;
  } | null>(null);
  const [isAddingLocation, setIsAddingLocation] = useState(false);

  const allowedState = allowedLocation?.state ?? "";
  const allowedDistrict = allowedLocation?.district ?? "";
  const allowedBlock = allowedLocation?.block ?? "";
  const allowedPanchayat = allowedLocation?.panchayat ?? "";
  const selectedCountry = (fixedCountry ?? values.country ?? "India").trim().toLowerCase();
  const mergeOptions = (master: string[], additions: string[]) => [...master, ...additions.filter((value) => !master.some((option) => option.trim().toLowerCase() === value.trim().toLowerCase()))];
  const stateOptions = allowedState ? [allowedState] : mergeOptions(indianStatesAndUnionTerritories, customLocations.map((location) => location.state ?? "").filter(Boolean));
  const districtOptions = mergeOptions(getDistrictOptions(
    values.state,
    locationOverrides,
    locationDeletions,
    verifiedSuggestionsOnly
  ), customLocations.filter((location) => location.state?.trim().toLowerCase() === values.state.trim().toLowerCase()).map((location) => location.district ?? "").filter(Boolean)).filter(
    (district) => !allowedDistrict || district === allowedDistrict
  );
  const blockOptions = mergeOptions(getBlockOptions(
    values.state,
    values.district,
    locationOverrides,
    locationDeletions,
    verifiedSuggestionsOnly
  ), customLocations.filter((location) => location.country?.trim().toLowerCase() === selectedCountry && location.state?.trim().toLowerCase() === values.state.trim().toLowerCase() && location.district?.trim().toLowerCase() === values.district.trim().toLowerCase()).map((location) => location.block ?? "").filter(Boolean)).filter(
    (block) => !allowedBlock || block === allowedBlock
  );
  const panchayatOptions = mergeOptions(getPanchayatOptions(
    values.state,
    values.district,
    values.block,
    locationOverrides,
    locationDeletions,
    verifiedSuggestionsOnly
  ), customLocations.filter((location) => location.state?.trim().toLowerCase() === values.state.trim().toLowerCase() && location.district?.trim().toLowerCase() === values.district.trim().toLowerCase() && location.block?.trim().toLowerCase() === values.block.trim().toLowerCase()).map((location) => location.panchayat ?? "").filter(Boolean)).filter((panchayat) => !allowedPanchayat || panchayat === allowedPanchayat);
  const selectedCustomPath = (location: PublicCampaignCustomLocation) =>
    location.country?.trim().toLowerCase() === (fixedCountry ?? values.country ?? "India").trim().toLowerCase()
    && location.state?.trim().toLowerCase() === values.state.trim().toLowerCase()
    && location.district?.trim().toLowerCase() === values.district.trim().toLowerCase()
    && location.block?.trim().toLowerCase() === values.block.trim().toLowerCase()
    && location.panchayat?.trim().toLowerCase() === values.panchayat.trim().toLowerCase();
  const villageOptions = mergeOptions([], customLocations.filter(selectedCustomPath).map((location) => location.village ?? "").filter(Boolean));
  const pinOptions = mergeOptions(getPinOptions(values), customLocations.filter(selectedCustomPath).map((location) => location.postalCode ?? "").filter(Boolean));
  const stateLocked = isLocationLevelAtLeast(lockedLevel, "state");
  const districtLocked = isLocationLevelAtLeast(lockedLevel, "district");
  const blockLocked = isLocationLevelAtLeast(lockedLevel, "block");
  const panchayatLocked = isLocationLevelAtLeast(lockedLevel, "panchayat");
  const hideState = isLocationLevelAtLeast(hiddenLockedLevel, "state");
  const hideDistrict = isLocationLevelAtLeast(hiddenLockedLevel, "district");
  const hideBlock = isLocationLevelAtLeast(hiddenLockedLevel, "block");
  const hidePanchayat = isLocationLevelAtLeast(hiddenLockedLevel, "panchayat");

  const canDeleteDistrict = Boolean(allowInlineAdd && !districtLocked && values.state && values.district);
  const canDeleteBlock = Boolean(allowInlineAdd && !blockLocked && values.state && values.district && values.block);
  const canDeletePanchayat = Boolean(
    allowInlineAdd && !panchayatLocked && values.state && values.district && values.block && values.panchayat
  );

  function LockedBadge({ level }: { level: LocationGovernanceLevel }) {
    return <span className="lock-badge">{getLocationLevelLabel(level)} locked</span>;
  }

  function fieldLabel(label: string, field: SignerRequiredField) {
    const displayLabel = labelOverrides?.[field] ?? label;
    if (requiredFields.includes(field)) return `${displayLabel} *`;
    return showOptionalLabels ? `${displayLabel} (optional)` : displayLabel;
  }

  function updateLocation(nextValues: LocationWithPin) {
    const matchedPin = findPinCode(nextValues);
    onChange({ ...nextValues, postalCode: matchedPin ?? nextValues.postalCode });
  }

  function selectState(state: string) {
    updateLocation(
      verifiedSuggestionsOnly
        ? {
            ...values,
            country: fixedCountry ?? values.country,
            state,
            district: "",
            block: "",
            panchayat: "",
            postalCode: ""
          }
        : { state, district: "", block: "", panchayat: "", postalCode: "" }
    );
  }

  function selectDistrict(district: string) {
    updateLocation({
      ...values,
      district,
      block: "",
      panchayat: "",
      postalCode: ""
    });
  }

  function selectBlock(block: string) {
    updateLocation({
      ...values,
      block,
      panchayat: "",
      postalCode: ""
    });
  }

  function updatePin(postalCode: string) {
    const normalizedPin = postalCode.replace(/\D/g, "").slice(0, 6);
    const matchedLocation = findLocationByPin(normalizedPin);
    onChange(matchedLocation ? { ...matchedLocation } : { ...values, postalCode: normalizedPin });
  }

  function addDistrict() {
    const district = newDistrict.trim();
    if (!values.state || !district || optionExists(districtOptions, district)) return;
    const nextValues = { ...values, district, block: "", panchayat: "", postalCode: "" };
    setPendingAdd({ values: nextValues, level: "district", label: district });
  }

  function addBlock() {
    const block = newBlock.trim();
    if (!values.state || !values.district || !block || optionExists(blockOptions, block)) return;
    const nextValues = { ...values, block, panchayat: "", postalCode: "" };
    setPendingAdd({ values: nextValues, level: "block", label: block });
  }

  function addPanchayat() {
    const panchayat = newPanchayat.trim();
    if (
      !values.state ||
      !values.district ||
      !values.block ||
      !panchayat ||
      optionExists(panchayatOptions, panchayat)
    ) {
      return;
    }
    const nextValues = { ...values, panchayat };
    setPendingAdd({ values: nextValues, level: "panchayat", label: panchayat });
  }

  async function confirmAddLocation() {
    if (!pendingAdd) return;
    setIsAddingLocation(true);
    try {
      const didAdd = (await onAddLocation?.(pendingAdd.values)) !== false;
      if (!didAdd) return;
      updateLocation(pendingAdd.values);
      if (pendingAdd.level === "district") setNewDistrict("");
      if (pendingAdd.level === "block") setNewBlock("");
      if (pendingAdd.level === "panchayat") setNewPanchayat("");
      setPendingAdd(null);
    } finally {
      setIsAddingLocation(false);
    }
  }

  function deleteDistrict() {
    onRemoveLocation?.(values, "district");
    updateLocation({ ...values, district: "", block: "", panchayat: "", postalCode: "" });
  }

  function deleteBlock() {
    onRemoveLocation?.(values, "block");
    updateLocation({ ...values, block: "", panchayat: "", postalCode: "" });
  }

  function deletePanchayat() {
    onRemoveLocation?.(values, "panchayat");
    updateLocation({ ...values, panchayat: "", postalCode: "" });
  }

  return (
    <>
      {fixedCountry && (
        <Field label={fieldLabel("Country", "country")}>
          <input value={fixedCountry} readOnly />
        </Field>
      )}
      {pendingAdd && (
        <div className="modal-backdrop" role="presentation">
          <div className="confirmation-dialog" role="dialog" aria-modal="true" aria-labelledby={`${idPrefix}-add-title`}>
            <span className="eyebrow">Location option</span>
            <h3 id={`${idPrefix}-add-title`}>Add this new location option?</h3>
            <div className="location-confirmation-context">
              {pendingAdd.values.state && <span>State: {pendingAdd.values.state}</span>}
              {pendingAdd.values.district && pendingAdd.level !== "district" && (
                <span>District: {pendingAdd.values.district}</span>
              )}
              {pendingAdd.values.block && pendingAdd.level === "panchayat" && (
                <span>Block: {pendingAdd.values.block}</span>
              )}
              <strong>
                New {getLocationLevelLabel(pendingAdd.level)}: {pendingAdd.label}
              </strong>
            </div>
            <div className="button-row">
              <button
                className="secondary-button"
                type="button"
                disabled={isAddingLocation}
                onClick={() => setPendingAdd(null)}
              >
                Cancel
              </button>
              <button
                className="primary-button"
                type="button"
                disabled={isAddingLocation}
                onClick={confirmAddLocation}
              >
                Add location
              </button>
            </div>
          </div>
        </div>
      )}
      {!hideState && (
        <Field label={fieldLabel("State / Union Territory", "state")}>
          <input
            list={`${idPrefix}-states`}
            placeholder="Search state or leave blank"
            value={values.state}
            onChange={(event) => selectState(event.target.value)}
            disabled={stateLocked}
          />
          <datalist id={`${idPrefix}-states`}>
            {stateOptions.map((state) => (
              <option key={state} value={state}>
                {state}
              </option>
            ))}
          </datalist>
          {stateLocked && <LockedBadge level="state" />}
        </Field>
      )}

      {!hideDistrict && (
        <Field label={fieldLabel("District", "district")}>
          <input
            list={`${idPrefix}-districts`}
            placeholder={values.state ? "Search district or leave blank" : "Choose state first"}
            value={values.district}
            onChange={(event) => selectDistrict(event.target.value)}
            disabled={
              districtLocked ||
              !values.state ||
              (!verifiedSuggestionsOnly && districtOptions.length === 0)
            }
          />
          <datalist id={`${idPrefix}-districts`}>
            {districtOptions.map((district) => (
              <option key={district} value={district}>
                {district}
              </option>
            ))}
          </datalist>
          {districtLocked && <LockedBadge level="district" />}
          {allowInlineAdd && !districtLocked && (
            <>
              <InlineAddOption
                placeholder="Add missing district"
                value={newDistrict}
                onChange={setNewDistrict}
                onAdd={addDistrict}
                disabled={
                  !values.state || !newDistrict.trim() || optionExists(districtOptions, newDistrict)
                }
                duplicate={Boolean(newDistrict.trim() && optionExists(districtOptions, newDistrict))}
              />
              {canDeleteDistrict && (
                <InlineDeleteOption
                  label={`Delete district "${values.district}"`}
                  onDelete={deleteDistrict}
                />
              )}
            </>
          )}
        </Field>
      )}

      {!hideBlock && (
        <Field label={fieldLabel("Block / Tehsil / Taluk", "block")}>
          <input
            list={`${idPrefix}-blocks`}
            placeholder={values.district ? "Search block / ward group or leave blank" : "Choose district first"}
            value={values.block}
            onChange={(event) => selectBlock(event.target.value)}
            disabled={
              blockLocked ||
              !values.district ||
              (!verifiedSuggestionsOnly && blockOptions.length === 0)
            }
          />
          <datalist id={`${idPrefix}-blocks`}>
            {blockOptions.map((block) => (
              <option key={block} value={block}>
                {block}
              </option>
            ))}
          </datalist>
          {blockLocked && <LockedBadge level="block" />}
          {allowInlineAdd && !blockLocked && (
            <>
              <InlineAddOption
                placeholder="Add missing block"
                value={newBlock}
                onChange={setNewBlock}
                onAdd={addBlock}
                disabled={
                  !values.district || !newBlock.trim() || optionExists(blockOptions, newBlock)
                }
                duplicate={Boolean(newBlock.trim() && optionExists(blockOptions, newBlock))}
              />
              {canDeleteBlock && (
                <InlineDeleteOption
                  label={`Delete block "${values.block}"`}
                  onDelete={deleteBlock}
                />
              )}
            </>
          )}
        </Field>
      )}

      {!hidePanchayat && (
        <Field label={fieldLabel("Gram Panchayat / Ward", "panchayat")}>
          <input
            list={`${idPrefix}-panchayats`}
            placeholder={values.block ? "Search panchayat / ward or leave blank" : "Choose block first"}
            value={values.panchayat}
            onChange={(event) => updateLocation({ ...values, panchayat: event.target.value })}
            disabled={
              panchayatLocked ||
              !values.block ||
              (!verifiedSuggestionsOnly && panchayatOptions.length === 0)
            }
          />
          <datalist id={`${idPrefix}-panchayats`}>
            {panchayatOptions.map((panchayat) => (
              <option key={panchayat} value={panchayat}>
                {panchayat}
              </option>
            ))}
          </datalist>
          {panchayatLocked && <LockedBadge level="panchayat" />}
          {allowInlineAdd && !panchayatLocked && (
            <>
              <InlineAddOption
                placeholder="Add missing panchayat/ward"
                value={newPanchayat}
                onChange={setNewPanchayat}
                onAdd={addPanchayat}
                disabled={
                  !values.block ||
                  !newPanchayat.trim() ||
                  optionExists(panchayatOptions, newPanchayat)
                }
                duplicate={Boolean(
                  newPanchayat.trim() && optionExists(panchayatOptions, newPanchayat)
                )}
              />
              {canDeletePanchayat && (
                <InlineDeleteOption
                  label={`Delete panchayat/ward "${values.panchayat}"`}
                  onDelete={deletePanchayat}
                />
              )}
            </>
          )}
        </Field>
      )}

      <Field label={fieldLabel("Village / Locality", "address" as SignerRequiredField)}>
        <input
          list={`${idPrefix}-villages`}
          placeholder="Enter village or locality"
          value={values.address ?? ""}
          required={requiredFields.includes("address" as SignerRequiredField)}
          onChange={(event) => onChange({ ...values, address: event.target.value })}
        />
        <datalist id={`${idPrefix}-villages`}>
          {villageOptions.map((village) => <option key={village} value={village} />)}
        </datalist>
      </Field>

      <Field label={fieldLabel("PIN code", "postalCode")}>
        <input
          inputMode="numeric"
          list={`${idPrefix}-pins`}
          maxLength={6}
          placeholder="Auto-filled or enter 6-digit PIN"
          value={values.postalCode}
          onChange={(event) => updatePin(event.target.value)}
        />
        <datalist id={`${idPrefix}-pins`}>
          {pinOptions.map((pinCode) => (
            <option key={pinCode} value={pinCode} />
          ))}
        </datalist>
      </Field>
    </>
  );
}
