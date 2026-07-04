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
  onAddLocation?: (values: LocationWithPin) => boolean | Promise<boolean>;
  onRemoveLocation?: (values: LocationWithPin, level: LocationDeletionLevel) => void;
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
  onAddLocation,
  onRemoveLocation
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
  const stateOptions = allowedState ? [allowedState] : indianStatesAndUnionTerritories;
  const districtOptions = getDistrictOptions(values.state, locationOverrides, locationDeletions).filter(
    (district) => !allowedDistrict || district === allowedDistrict
  );
  const blockOptions = getBlockOptions(values.state, values.district, locationOverrides, locationDeletions).filter(
    (block) => !allowedBlock || block === allowedBlock
  );
  const panchayatOptions = getPanchayatOptions(
    values.state,
    values.district,
    values.block,
    locationOverrides,
    locationDeletions
  ).filter((panchayat) => !allowedPanchayat || panchayat === allowedPanchayat);
  const pinOptions = getPinOptions(values);
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
    if (requiredFields.includes(field)) return `${label} *`;
    return showOptionalLabels ? `${label} (optional)` : label;
  }

  function updateLocation(nextValues: LocationWithPin) {
    const matchedPin = findPinCode(nextValues);
    onChange({ ...nextValues, postalCode: matchedPin ?? nextValues.postalCode });
  }

  function selectState(state: string) {
    const districts = getDistrictOptions(state, locationOverrides, locationDeletions);
    const district = districts[0] ?? "";
    const blocks = getBlockOptions(state, district, locationOverrides, locationDeletions);
    const block = blocks[0] ?? "";
    const panchayats = getPanchayatOptions(state, district, block, locationOverrides, locationDeletions);
    const panchayat = panchayats[0] ?? "";
    updateLocation({ state, district, block, panchayat, postalCode: "" });
  }

  function selectDistrict(district: string) {
    const blocks = getBlockOptions(values.state, district, locationOverrides, locationDeletions);
    const block = blocks[0] ?? "";
    const panchayats = getPanchayatOptions(values.state, district, block, locationOverrides, locationDeletions);
    const panchayat = panchayats[0] ?? "";
    updateLocation({ ...values, district, block, panchayat, postalCode: "" });
  }

  function selectBlock(block: string) {
    const panchayats = getPanchayatOptions(values.state, values.district, block, locationOverrides, locationDeletions);
    const panchayat = panchayats[0] ?? "";
    updateLocation({ ...values, block, panchayat, postalCode: "" });
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
          <select
            value={values.state}
            onChange={(event) => selectState(event.target.value)}
            disabled={stateLocked}
          >
            <option value="">Select state</option>
            {stateOptions.map((state) => (
              <option key={state} value={state}>
                {state}
              </option>
            ))}
          </select>
          {stateLocked && <LockedBadge level="state" />}
        </Field>
      )}

      {!hideDistrict && (
        <Field label={fieldLabel("District", "district")}>
          <select
            value={values.district}
            onChange={(event) => selectDistrict(event.target.value)}
            disabled={districtLocked || !values.state || districtOptions.length === 0}
          >
            <option value="">
              {districtOptions.length ? "Select district" : "Select state first"}
            </option>
            {districtOptions.map((district) => (
              <option key={district} value={district}>
                {district}
              </option>
            ))}
          </select>
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
          <select
            value={values.block}
            onChange={(event) => selectBlock(event.target.value)}
            disabled={blockLocked || !values.district || blockOptions.length === 0}
          >
            <option value="">
              {blockOptions.length ? "Select block / ward group" : "Select district first"}
            </option>
            {blockOptions.map((block) => (
              <option key={block} value={block}>
                {block}
              </option>
            ))}
          </select>
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
          <select
            value={values.panchayat}
            onChange={(event) => updateLocation({ ...values, panchayat: event.target.value })}
            disabled={panchayatLocked || !values.block || panchayatOptions.length === 0}
          >
            <option value="">
              {panchayatOptions.length ? "Select panchayat / ward" : "Select block first"}
            </option>
            {panchayatOptions.map((panchayat) => (
              <option key={panchayat} value={panchayat}>
                {panchayat}
              </option>
            ))}
          </select>
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
