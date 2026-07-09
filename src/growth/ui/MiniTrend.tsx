interface MiniTrendProps {
  values: number[];
  ariaLabel: string;
}

export function MiniTrend({ values, ariaLabel }: MiniTrendProps) {
  if (values.length === 0) {
    return <div className="growth-mini-trend empty" aria-hidden="true" />;
  }

  const max = Math.max(1, ...values);
  return (
    <div className="growth-mini-trend" aria-label={ariaLabel}>
      {values.map((value, index) => (
        <span
          key={`${value}-${index}`}
          style={{ height: `${Math.max(12, (value / max) * 100)}%` }}
        />
      ))}
    </div>
  );
}
