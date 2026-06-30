interface UsageCardProps {
  label: string;
  value: string;
  detail: string;
}

export function UsageCard({ label, value, detail }: UsageCardProps) {
  return (
    <div className="usage-card">
      <span className="eyebrow">{label}</span>
      <strong>{value}</strong>
      <small>{detail}</small>
    </div>
  );
}
