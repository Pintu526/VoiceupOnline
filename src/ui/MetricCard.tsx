import type { ReactNode } from "react";

interface MetricCardProps {
  icon: ReactNode;
  label: string;
  value: number;
  detail: string;
}

export function MetricCard({ icon, label, value, detail }: MetricCardProps) {
  return (
    <div className="metric-card">
      <div className="metric-card-header">
        <div className="metric-icon" aria-hidden="true">{icon}</div>
        <span>{label}</span>
      </div>
      <strong>{value.toLocaleString()}</strong>
      <small>{detail}</small>
    </div>
  );
}
