import type { ReactNode } from "react";

interface FieldProps {
  label: string;
  wide?: boolean;
  children: ReactNode;
}

export function Field({ label, wide, children }: FieldProps) {
  return (
    <label className={wide ? "wide field" : "field"}>
      <span className="label">{label}</span>
      {children}
    </label>
  );
}
