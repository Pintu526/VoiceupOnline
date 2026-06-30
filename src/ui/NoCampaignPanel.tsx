import { Plus } from "lucide-react";

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
      <button className="primary-button" type="button" onClick={onCreateCampaign}>
        <Plus size={18} /> Create campaign
      </button>
    </div>
  );
}
