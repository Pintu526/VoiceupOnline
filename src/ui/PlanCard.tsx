interface PlanCardProps {
  title: string;
  price: string;
  features: string[];
  highlighted?: boolean;
  actionLabel?: string;
  onSelect?: () => void;
}

export function PlanCard({
  title,
  price,
  features,
  highlighted,
  actionLabel,
  onSelect
}: PlanCardProps) {
  return (
    <div className={highlighted ? "plan-card highlighted" : "plan-card"}>
      <h3>{title}</h3>
      <strong>{price}</strong>
      <ul>
        {features.map((feature) => (
          <li key={feature}>{feature}</li>
        ))}
      </ul>
      {onSelect && (
        <button
          className={actionLabel === "Selected" ? "primary-button" : "secondary-button"}
          type="button"
          onClick={onSelect}
        >
          {actionLabel ?? "Select plan"}
        </button>
      )}
    </div>
  );
}
