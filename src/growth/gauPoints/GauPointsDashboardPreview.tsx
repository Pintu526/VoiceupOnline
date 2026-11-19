import { useEffect, useState } from "react";
import { getAuthContext, getGauPointsClient } from "../../backend";
import { GauPointsAdminPanel } from "./GauPointsAdminPanel";
import { GauPointsPanel } from "./GauPointsPanel";

interface Props {
  campaignId: string;
}

export function GauPointsDashboardPreview({ campaignId }: Props) {
  const [workspaceId, setWorkspaceId] = useState("");

  useEffect(() => {
    let active = true;
    setWorkspaceId("");

    getAuthContext()
      .then((context) => {
        if (active && context.workspaceMember && context.workspaceId) {
          setWorkspaceId(context.workspaceId);
        }
      })
      .catch(() => {
        if (active) setWorkspaceId("");
      });

    return () => {
      active = false;
    };
  }, [campaignId]);

  const client = getGauPointsClient();
  const enabled =
    import.meta.env.DEV &&
    import.meta.env.VITE_GAUPOINTS_READ_ONLY === "true" &&
    Boolean(workspaceId) &&
    Boolean(campaignId);

  if (!enabled || !client) return null;

  return (
    <section className="page-stack" aria-label="GauPoints module">
      <GauPointsPanel
        client={client}
        workspaceId={workspaceId}
        campaignId={campaignId}
        enabled={true}
        signedIn={false}
      />
      <GauPointsAdminPanel
        client={client}
        workspaceId={workspaceId}
        campaignId={campaignId}
        enabled={true}
      />
    </section>
  );
}
