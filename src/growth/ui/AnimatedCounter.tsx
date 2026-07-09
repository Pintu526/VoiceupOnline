import { useEffect, useMemo, useState } from "react";

interface AnimatedCounterProps {
  value: number;
  format?: (value: number) => string;
  durationMs?: number;
}

export function AnimatedCounter({ value, format, durationMs = 680 }: AnimatedCounterProps) {
  const [displayValue, setDisplayValue] = useState(0);

  useEffect(() => {
    const start = performance.now();
    const from = displayValue;
    const to = value;
    const delta = to - from;
    let frameId = 0;

    const tick = (now: number) => {
      const progress = Math.min(1, (now - start) / durationMs);
      const eased = 1 - Math.pow(1 - progress, 3);
      const next = from + delta * eased;
      setDisplayValue(next);
      if (progress < 1) {
        frameId = requestAnimationFrame(tick);
      }
    };

    frameId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frameId);
  }, [durationMs, value]);

  const rendered = useMemo(() => {
    const rounded = Math.round(displayValue * 100) / 100;
    return format ? format(rounded) : Math.round(rounded).toLocaleString();
  }, [displayValue, format]);

  return <>{rendered}</>;
}
