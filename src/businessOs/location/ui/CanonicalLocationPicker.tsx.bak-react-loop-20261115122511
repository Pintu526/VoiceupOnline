import { useEffect, useId, useState, type FormEvent, type KeyboardEvent } from "react";
import {
  createUnverifiedCustomLocation,
  type CanonicalLocationCatalogReader,
  type CanonicalLocationSelection,
  type UnverifiedCustomLocationSelection
} from "./CanonicalLocationUiModel.ts";
import { useCanonicalLocationUi } from "./useCanonicalLocationUi.ts";

export interface CanonicalLocationPickerProps {
  client: CanonicalLocationCatalogReader;
  rootNodeId: string;
  label: string;
  id?: string;
  disabled?: boolean;
  resultLimit?: number;
  allowCustomLocation?: boolean;
  formatLevelLabel?: (level: string) => string;
  onChange?: (selection: readonly CanonicalLocationSelection[]) => void;
  onCustomLocation?: (selection: UnverifiedCustomLocationSelection) => void;
  onClear?: () => void;
}

function defaultLevelLabel(level: string): string {
  return level
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function CanonicalLocationPicker({
  client,
  rootNodeId,
  label,
  id,
  disabled = false,
  resultLimit,
  allowCustomLocation = false,
  formatLevelLabel = defaultLevelLabel,
  onChange,
  onCustomLocation,
  onClear
}: CanonicalLocationPickerProps) {
  const generatedId = useId();
  const controlId = id ?? `canonical-location-${generatedId.replace(/:/gu, "")}`;
  const [searchText, setSearchText] = useState("");
  const [customText, setCustomText] = useState("");
  const [activeCandidateIndex, setActiveCandidateIndex] = useState(0);
  const { state, actions } = useCanonicalLocationUi({ client, rootNodeId, resultLimit, disabled });

  useEffect(() => {
    onChange?.(state.selection);
  }, [onChange, state.selection]);

  useEffect(() => {
    setActiveCandidateIndex(0);
  }, [state.resolution]);

  const submitSearch = (event: FormEvent) => {
    event.preventDefault();
    if (searchText.trim()) void actions.search(searchText);
  };

  const submitCustom = (event: FormEvent) => {
    event.preventDefault();
    if (!customText.trim()) return;
    onCustomLocation?.(createUnverifiedCustomLocation(customText));
    setCustomText("");
  };

  const candidates = state.resolution.status === "ambiguous" ? state.resolution.candidates : [];
  const handleCandidateKeys = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!candidates.length) return;
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const direction = event.key === "ArrowDown" ? 1 : -1;
      setActiveCandidateIndex((current) => (current + direction + candidates.length) % candidates.length);
    }
    if (event.key === "Enter") {
      event.preventDefault();
      const candidate = candidates[activeCandidateIndex];
      if (candidate) void actions.confirmResolution(candidate.nodeId);
    }
  };

  return (
    <fieldset
      className="canonical-location-picker"
      data-testid="canonical-location-picker"
      data-state={state.status}
      aria-busy={state.status === "loading"}
      disabled={disabled}
    >
      <legend>{label}</legend>

      <div role="status" aria-live="polite" data-testid="canonical-location-status">
        {state.status === "idle" && "Location catalog is ready to load."}
        {state.status === "loading" && "Loading canonical locations…"}
        {state.status === "ready" && "Canonical locations are ready."}
        {state.status === "empty" && "No canonical locations were found."}
      </div>

      {state.status === "idle" && (
        <button type="button" onClick={() => void actions.initialize()} data-testid="canonical-location-load">
          Browse locations
        </button>
      )}

      {state.error && (
        <div role="alert" data-testid="canonical-location-error">
          <p>{state.error.message}</p>
          <button type="button" onClick={() => void actions.retry()} data-testid="canonical-location-retry">
            {state.requiresReselection ? "Refresh catalog" : "Try again"}
          </button>
        </div>
      )}

      {state.branches.map((branch, branchIndex) => {
        const selectId = `${controlId}-branch-${branchIndex}`;
        const selectedNodeId = state.selection[branchIndex + 1]?.nodeId ?? "";
        const levels = [...new Set(branch.options.map((option) => formatLevelLabel(option.level)))];
        const branchLabel = levels.length === 1
          ? `Choose ${levels[0]} within ${branch.parent.label}`
          : `Choose a location within ${branch.parent.label}`;
        return (
          <div key={`${branch.parent.nodeId}-${branchIndex}`} data-testid={`canonical-location-branch-${branchIndex}`}>
            {branch.status === "empty" ? (
              <p data-testid={`canonical-location-empty-${branchIndex}`}>No child locations are available.</p>
            ) : (
              <>
                <label htmlFor={selectId}>{branchLabel}</label>
                <select
                  id={selectId}
                  value={selectedNodeId}
                  onChange={(event) => void actions.select(branchIndex, event.currentTarget.value)}
                  data-testid={`canonical-location-select-${branchIndex}`}
                >
                  <option value="">Select…</option>
                  {branch.options.map((option) => (
                    <option key={option.nodeId} value={option.nodeId}>
                      {option.label} · {formatLevelLabel(option.level)}
                    </option>
                  ))}
                </select>
              </>
            )}
          </div>
        );
      })}

      {state.root && (
        <form onSubmit={submitSearch} role="search" data-testid="canonical-location-search">
          <label htmlFor={`${controlId}-search`}>Search canonical locations</label>
          <input
            id={`${controlId}-search`}
            type="search"
            value={searchText}
            onChange={(event) => setSearchText(event.currentTarget.value)}
            autoComplete="off"
          />
          <button type="submit" disabled={!searchText.trim()}>Search</button>
        </form>
      )}

      {state.resolution.status === "resolved" && (
        <section aria-label="Resolved canonical location" data-testid="canonical-location-resolved">
          <p>{state.resolution.node.label}</p>
          <button
            type="button"
            onClick={() => {
              if (state.resolution.status === "resolved") void actions.confirmResolution(state.resolution.node.nodeId);
            }}
          >
            Use this canonical location
          </button>
        </section>
      )}

      {state.resolution.status === "ambiguous" && (
        <section aria-label="Ambiguous canonical locations" data-testid="canonical-location-ambiguous">
          <p>{state.resolution.reason}</p>
          <div
            role="listbox"
            aria-label="Choose one canonical location"
            tabIndex={0}
            onKeyDown={handleCandidateKeys}
          >
            {state.resolution.candidates.map((candidate, index) => (
              <button
                key={candidate.nodeId}
                type="button"
                role="option"
                aria-selected={index === activeCandidateIndex}
                tabIndex={index === activeCandidateIndex ? 0 : -1}
                onFocus={() => setActiveCandidateIndex(index)}
                onClick={() => void actions.confirmResolution(candidate.nodeId)}
              >
                {candidate.label} · {formatLevelLabel(candidate.level)} · {candidate.officialCode ?? "No official code"}
              </button>
            ))}
          </div>
        </section>
      )}

      {state.resolution.status === "unresolved" && (
        <section aria-label="Unresolved location" data-testid="canonical-location-unresolved">
          <p>{state.resolution.reason}</p>
          {state.resolution.suggestions.length > 0 && (
            <ul aria-label="Canonical suggestions">
              {state.resolution.suggestions.map((suggestion) => <li key={suggestion.nodeId}>{suggestion.label}</li>)}
            </ul>
          )}
        </section>
      )}

      {allowCustomLocation && (
        <form onSubmit={submitCustom} data-testid="unverified-custom-location-form">
          <label htmlFor={`${controlId}-custom`}>Manual location</label>
          <input
            id={`${controlId}-custom`}
            value={customText}
            onChange={(event) => setCustomText(event.currentTarget.value)}
            aria-describedby={`${controlId}-custom-help`}
          />
          <small id={`${controlId}-custom-help`}>Manual locations remain unverified until explicitly matched.</small>
          <button type="submit" disabled={!customText.trim()}>Use unverified location</button>
        </form>
      )}

      {(state.root || state.selection.length > 0) && (
        <button
          type="button"
          onClick={() => {
            actions.clear();
            onClear?.();
          }}
          data-testid="canonical-location-clear"
        >
          Clear location
        </button>
      )}
    </fieldset>
  );
}
