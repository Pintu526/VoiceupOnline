import { Plus, Sparkles } from "lucide-react";

interface NoCampaignPanelProps {
  title: string;
  description: string;
  onCreateCampaign: () => void;
}

export function NoCampaignPanel({
  title,
  description,
  onCreateCampaign
}: NoCampaignPanelProps) {
  return (
    <div className="empty-state compact-empty">
      <span className="eyebrow">No campaign data</span>
      <h2>{title}</h2>
      <p>{description}</p>
      <div className="empty-next-steps">
        <span><Sparkles size={16} /> Use AI or a template for a faster first draft.</span>
        <span><Plus size={16} /> Save is still required before anything persists.</span>
      </div>
      <button className="primary-button" type="button" onClick={onCreateCampaign}>
        <Plus size={18} /> Create campaign
      </button>
    </div>
  );
}
