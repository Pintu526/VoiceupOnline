import { Download, FileText, Users } from "lucide-react";
import type { AuthorityRule, Campaign, Signer } from "../../types";
import type { getCampaignMetrics } from "../../lib";
import { exportCsv, exportPdf, exportSignerAppealPdf } from "../../lib";
import { Panel } from "../../ui/Panel";
import { ReportBlock } from "../../ui/ReportBlock";
import { NoCampaignPanel } from "../../ui/NoCampaignPanel";

interface ReportsTabProps {
  activeCampaign: Campaign | undefined;
  campaignSigners: Signer[];
  metrics: ReturnType<typeof getCampaignMetrics>;
  authorityMatch: { authority: AuthorityRule; score: number } | undefined;
  dailyTotals: Record<string, number>;
  weeklyTotals: Record<string, number>;
  stateTotals: Record<string, number>;
  districtTotals: Record<string, number>;
  blockTotals: Record<string, number>;
  panchayatTotals: Record<string, number>;
  onUpdateSignerStatus: (signerId: string, status: Signer["status"]) => void;
  onCreateCampaign: () => void;
}

export function ReportsTab({
  activeCampaign,
  campaignSigners,
  authorityMatch,
  dailyTotals,
  weeklyTotals,
  stateTotals,
  districtTotals,
  blockTotals,
  panchayatTotals,
  onUpdateSignerStatus,
  onCreateCampaign
}: ReportsTabProps) {
  if (!activeCampaign) {
    return (
      <NoCampaignPanel
        title="Reports will appear after campaign setup"
        description="Create a campaign and collect signatures before downloading PDF or CSV reports."
        onCreateCampaign={onCreateCampaign}
      />
    );
  }

  return (
    <section className="page-stack">
      <Panel title="Reports and exports" icon={<Download />}>
        <div className="button-row">
          <button
            className="primary-button"
            type="button"
            onClick={() =>
              exportPdf(activeCampaign, campaignSigners, authorityMatch?.authority)
            }
          >
            <FileText size={18} /> Download PDF report
          </button>
          <button
            className="secondary-button"
            type="button"
            onClick={() => exportCsv(activeCampaign, campaignSigners)}
          >
            <Download size={18} /> Download CSV
          </button>
        </div>
        <div className="report-grid">
          <ReportBlock title="Daily status" data={dailyTotals} />
          <ReportBlock title="Weekly status" data={weeklyTotals} />
          <ReportBlock title="State-wise count" data={stateTotals} />
          <ReportBlock title="District-wise count" data={districtTotals} />
          <ReportBlock title="Block-wise count" data={blockTotals} />
          <ReportBlock title="Panchayat / ward count" data={panchayatTotals} />
        </div>
      </Panel>

      <Panel title="Signer register" icon={<Users />}>
        {campaignSigners.length === 0 ? (
          <p>No signers have been collected for this campaign yet.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Phone</th>
                  <th>Alt contacts</th>
                  <th>OTP</th>
                  <th>State</th>
                  <th>District</th>
                  <th>Block</th>
                  <th>Panchayat / Ward</th>
                  <th>Source</th>
                  <th>Status</th>
                  <th>Signed at</th>
                  <th>Review</th>
                  <th>Appeal PDF</th>
                </tr>
              </thead>
              <tbody>
                {campaignSigners.map((signer) => (
                  <tr key={signer.id}>
                    <td>
                      <strong>{signer.name}</strong>
                      <span>{signer.email}</span>
                    </td>
                    <td>{signer.phone}</td>
                    <td>
                      <span>WA: {signer.whatsappNumber || signer.phone || "-"}</span>
                      <span>TG: {signer.telegramHandle || "-"}</span>
                    </td>
                    <td>{signer.otpVerified ? "Verified" : "Not verified"}</td>
                    <td>{signer.state || "Not captured"}</td>
                    <td>{signer.district || "Not captured"}</td>
                    <td>{signer.block || "Not captured"}</td>
                    <td>{signer.panchayat || "Not captured"}</td>
                    <td>{signer.source}</td>
                    <td>
                      <select
                        value={signer.status}
                        onChange={(e) =>
                          onUpdateSignerStatus(signer.id, e.target.value as Signer["status"])
                        }
                      >
                        <option value="verified">verified</option>
                        <option value="pending">pending</option>
                        <option value="duplicate">duplicate</option>
                        <option value="rejected">rejected</option>
                      </select>
                    </td>
                    <td>{new Date(signer.signedAt).toLocaleString()}</td>
                    <td>{signer.reviewerNote ?? "Ready"}</td>
                    <td>
                      <button
                        className="secondary-button"
                        type="button"
                        onClick={() =>
                          exportSignerAppealPdf(
                            activeCampaign,
                            signer,
                            authorityMatch?.authority
                          )
                        }
                      >
                        PDF
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </section>
  );
}
