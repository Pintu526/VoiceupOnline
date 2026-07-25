import type {
  AddressLookupAdapter,
  AddressLookupOptions,
  AddressLookupSuggestion,
  GeographyCoordinates
} from "./types.ts";

export type AddressLookupFunction = (
  coordinates: GeographyCoordinates,
  options?: AddressLookupOptions
) => Promise<AddressLookupSuggestion[]>;

export class FunctionAddressLookupAdapter implements AddressLookupAdapter {
  readonly id: string;
  private readonly lookup: AddressLookupFunction;

  constructor(id: string, lookup: AddressLookupFunction) {
    this.id = id;
    this.lookup = lookup;
  }

  reverseLookup(coordinates: GeographyCoordinates, options?: AddressLookupOptions) {
    return this.lookup(coordinates, options);
  }
}

export class UnavailableAddressLookupAdapter implements AddressLookupAdapter {
  readonly id = "address-lookup-unavailable";

  async reverseLookup(): Promise<AddressLookupSuggestion[]> {
    return [];
  }
}

export function isValidCoordinates(coordinates: GeographyCoordinates) {
  return Number.isFinite(coordinates.latitude)
    && Number.isFinite(coordinates.longitude)
    && coordinates.latitude >= -90
    && coordinates.latitude <= 90
    && coordinates.longitude >= -180
    && coordinates.longitude <= 180;
}
