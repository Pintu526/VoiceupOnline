import { Sparkles } from "lucide-react";
import type { CelebrationItem } from "../types";
import { ProgressRing, StatusBadge } from "../../ui";

interface CelebrationCardProps {
  item: CelebrationItem;
}

export function CelebrationCard({ item }: CelebrationCardProps) {
  const ready = item.progressPercentage >= 100;
  return (
    <article className={`growth-celebration-card ${ready ? "ready" : ""}`}>
      <div className="growth-celebration-head">
        <div>
          <StatusBadge label={item.kind.replace(/_/g, " ")} tone={ready ? "good" : "info"} />
          <h4>{item.title}</h4>
        </div>
        <ProgressRing value={item.progressPercentage} size={64} stroke={7} label={`${item.title} progress`} />
      </div>
      <p>{item.description}</p>
      <div className="growth-celebration-meta">
        <span>Next target: {item.nextTarget}</span>
        <span>{item.certificateReady ? "Certificate preview ready" : "Certificate locked"}</span>
      </div>
      <button type="button" className="secondary-button">
        <Sparkles size={14} /> {item.shareLabel}
      </button>
    </article>
  );
}
