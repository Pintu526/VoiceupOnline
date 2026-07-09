import type { LocationWithPin } from "../geography";
import type { LocationGovernanceLevel, SignerRequiredField } from "../types";
import { Field } from "../ui/Field";
import {
  getCampaignLocationLabels,
  getLocationLevelLabel,
  isLocationLevelAtLeast
} from "../utils/campaign";

interface GlobalLocationFieldsProps {
  idPrefix: string;
  values: LocationWithPin;
  onChange: (values: LocationWithPin) => void;
  allowedLocation?: Partial<LocationWithPin>;
  lockedLevel?: LocationGovernanceLevel;
  hiddenLockedLevel?: LocationGovernanceLevel;
  requiredFields?: SignerRequiredField[];
  showOptionalLabels?: boolean;
}

export function GlobalLocationFields({
  values,
  onChange,
  allowedLocation,
  lockedLevel = "none",
  hiddenLockedLevel = "none",
  requiredFields = [],
  showOptionalLabels = false
}: GlobalLocationFieldsProps) {
  const labels = getCampaignLocationLabels({ geographyMode: "global", country: values.country });
  const countryLocked = Boolean(allowedLocation?.country);
  const stateLocked = isLocationLevelAtLeast(lockedLevel, "state");
  const districtLocked = isLocationLevelAtLeast(lockedLevel, "district");
  const localityLocked = isLocationLevelAtLeast(lockedLevel, "panchayat");
  const hideState = isLocationLevelAtLeast(hiddenLockedLevel, "state");
  const hideDistrict = isLocationLevelAtLeast(hiddenLockedLevel, "district");
  const hideLocality = isLocationLevelAtLeast(hiddenLockedLevel, "panchayat");

  function fieldLabel(label: string, field: SignerRequiredField) {
    if (requiredFields.includes(field)) return `${label} *`;
    return showOptionalLabels ? `${label} (optional)` : label;
  }

  function LockedBadge({ level }: { level: LocationGovernanceLevel }) {
    return <span className="lock-badge">{getLocationLevelLabel(level, { geographyMode: "global" })} locked</span>;
  }

  return (
    <>
      <Field label={fieldLabel(labels.country, "country")}>
        <input
          placeholder="Country"
          value={allowedLocation?.country ?? values.country ?? ""}
          disabled={countryLocked}
          onChange={(event) => onChange({ ...values, country: event.target.value })}
        />
        {countryLocked && <span className="lock-badge">Country locked</span>}
      </Field>

      {!hideState && (
        <Field label={fieldLabel(labels.state, "state")}>
          <input
            placeholder={labels.state}
            value={allowedLocation?.state ?? values.state}
            disabled={stateLocked}
            onChange={(event) => onChange({ ...values, state: event.target.value, district: "", panchayat: "" })}
          />
          {stateLocked && <LockedBadge level="state" />}
        </Field>
      )}

      {!hideDistrict && (
        <Field label={fieldLabel(labels.district, "district")}>
          <input
            placeholder={labels.district}
            value={allowedLocation?.district ?? values.district}
            disabled={districtLocked}
            onChange={(event) => onChange({ ...values, district: event.target.value, panchayat: "" })}
          />
          {districtLocked && <LockedBadge level="district" />}
        </Field>
      )}

      {!hideLocality && (
        <Field label={fieldLabel(labels.panchayat, "panchayat")}>
          <input
            placeholder={labels.panchayat}
            value={allowedLocation?.panchayat ?? values.panchayat}
            disabled={localityLocked}
            onChange={(event) => onChange({ ...values, panchayat: event.target.value })}
          />
          {localityLocked && <LockedBadge level="panchayat" />}
        </Field>
      )}

      <Field label={fieldLabel(labels.postalCode, "postalCode")}>
        <input
          placeholder={labels.postalCode}
          value={values.postalCode}
          onChange={(event) => onChange({ ...values, postalCode: event.target.value })}
        />
      </Field>
    </>
  );
}
