import type { GPSAdapter, GPSReading, GPSRequestOptions } from "./types.ts";

export class BrowserGPSAdapter implements GPSAdapter {
  readonly id = "browser-geolocation";

  isAvailable() {
    return typeof navigator !== "undefined" && Boolean(navigator.geolocation);
  }

  requestPosition(options: GPSRequestOptions = {}): Promise<GPSReading> {
    if (!this.isAvailable()) {
      return Promise.reject(new Error("GPS is not available in this browser."));
    }
    return new Promise((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(
        (position) => resolve({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracyMeters: position.coords.accuracy,
          capturedAt: new Date(position.timestamp || Date.now()).toISOString()
        }),
        () => reject(new Error("Location permission was denied or the position could not be determined.")),
        {
          enableHighAccuracy: options.enableHighAccuracy ?? false,
          timeout: options.timeoutMs ?? 10_000,
          maximumAge: options.maximumAgeMs ?? 60_000
        }
      );
    });
  }
}

export class UnavailableGPSAdapter implements GPSAdapter {
  readonly id = "gps-unavailable";

  isAvailable() {
    return false;
  }

  requestPosition(): Promise<GPSReading> {
    return Promise.reject(new Error("GPS is not available."));
  }
}
