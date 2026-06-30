interface BarListProps {
  data: Record<string, number>;
  emptyLabel: string;
}

export function BarList({ data, emptyLabel }: BarListProps) {
  const max = Math.max(...Object.values(data), 1);
  const entries = Object.entries(data).sort(([first], [second]) =>
    first.localeCompare(second)
  );

  if (entries.length === 0) return <p>{emptyLabel}</p>;

  return (
    <div className="bar-list">
      {entries.map(([label, value]) => (
        <div className="bar-row" key={label}>
          <span>{label}</span>
          <div>
            <i style={{ width: `${(value / max) * 100}%` }} />
          </div>
          <strong>{value}</strong>
        </div>
      ))}
    </div>
  );
}
