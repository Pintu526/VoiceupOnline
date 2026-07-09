import type { GrowthEvent } from "./types";
import { GrowthEventValidator } from "./validator";

export class GrowthEventSerializer {
  static serialize(event: GrowthEvent): string {
    GrowthEventValidator.assertValid(event);
    return JSON.stringify(event);
  }

  static deserialize(value: string): GrowthEvent {
    const event = JSON.parse(value) as GrowthEvent;
    GrowthEventValidator.assertValid(event);
    return event;
  }

  static clone(event: GrowthEvent): GrowthEvent {
    return GrowthEventSerializer.deserialize(GrowthEventSerializer.serialize(event));
  }
}
