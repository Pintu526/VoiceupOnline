// Centralized plan/upgrade/downgrade entitlement engine.
//
// This module is intentionally self-contained (it only depends on
// `Organization`-shaped data and pure functions from `../utils/subscription`)
// so it can be reused, largely unchanged, by every future Business OS
// application (Goudhan, PanditOnline, CateringHub, Hope Nurse Hub,
// HomeTutorial Hub, TeachToday, ...).
export * from "./featureKeys.ts";
export * from "./entitlementEngine.ts";
export * from "./subscriptionLifecycle.ts";
export * from "./migration.ts";
