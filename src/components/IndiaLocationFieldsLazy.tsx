import { lazy, Suspense, type ComponentProps } from "react";

let locationFieldsPromise: Promise<typeof import("./IndiaLocationFields")> | undefined;

function loadIndiaLocationFields() {
  locationFieldsPromise ??= import("./IndiaLocationFields");
  return locationFieldsPromise.then((module) => ({
    default: module.IndiaLocationFields
  }));
}

const LoadedIndiaLocationFields = lazy(loadIndiaLocationFields);

export function preloadIndiaLocationFields(): void {
  void loadIndiaLocationFields().catch(() => {
    locationFieldsPromise = undefined;
  });
}

/**
 * Same API as IndiaLocationFields, but its module graph (and therefore the
 * 20 MB Odisha LGD geography dataset) loads only when location fields render.
 */
export function IndiaLocationFields(props: ComponentProps<typeof LoadedIndiaLocationFields>) {
  return (
    <Suspense fallback={<div aria-busy="true" style={{ minHeight: "9rem" }} />}>
      <LoadedIndiaLocationFields {...props} />
    </Suspense>
  );
}
