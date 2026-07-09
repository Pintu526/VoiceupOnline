interface StatusBadgeProps {
  label: string;
  tone?: "neutral" | "good" | "warning" | "danger" | "info";
}

export function StatusBadge({ label, tone = "neutral" }: StatusBadgeProps) {
  return <span className={`growth-status-badge ${tone}`}>{label}</span>;
}
