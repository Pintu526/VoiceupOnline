interface ProgressRingProps {
  value: number;
  size?: number;
  stroke?: number;
  label: string;
}

export function ProgressRing({ value, size = 74, stroke = 8, label }: ProgressRingProps) {
  const bounded = Math.max(0, Math.min(100, value));
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (bounded / 100) * circumference;

  return (
    <div className="growth-progress-ring" role="img" aria-label={label}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle
          className="track"
          cx={size / 2}
          cy={size / 2}
          r={radius}
          strokeWidth={stroke}
          fill="none"
        />
        <circle
          className="value"
          cx={size / 2}
          cy={size / 2}
          r={radius}
          strokeWidth={stroke}
          fill="none"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
        />
      </svg>
      <strong>{Math.round(bounded)}%</strong>
    </div>
  );
}
