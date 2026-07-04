import { useMemo, useState } from "react";
import {
  Check,
  ClipboardList,
  Languages,
  RefreshCcw,
  Sparkles,
  Wand2,
  X
} from "lucide-react";
import type { Campaign } from "../../types";
import type { AiCampaignCopilotResult, AiLanguage } from "../../ai/types";
import { futureAiProviders, generateCampaignWithAi, previewCampaignPrompt } from "../../ai/campaignGenerator";
import { Field } from "../../ui/Field";

interface AiCampaignCopilotProps {
  campaignDraft: Campaign | null;
  onApplyAiDraft: (
    result: AiCampaignCopilotResult,
    sectionState: Record<string, "accepted" | "rejected" | "editing">
  ) => void;
  onClose: () => void;
}

const reviewSections = [
  "Campaign Title",
  "Summary",
  "Full Description",
  "Objectives",
  "Authority",
  "Social Posts",
  "Volunteer Plan",
  "Press Release"
];

function getReviewSectionContent(result: AiCampaignCopilotResult, section: string) {
  switch (section) {
    case "Campaign Title":
      return [result.draft.title, result.draft.subtitle];
    case "Summary":
      return [result.draft.summary, `Tags: ${result.draft.suggestedTags.join(", ")}`];
    case "Full Description":
      return [result.draft.fullDescription, `Expected outcome: ${result.draft.expectedOutcome}`];
    case "Objectives":
      return result.draft.objectives;
    case "Authority":
      return [
        result.draft.suggestedAuthority,
        `Category: ${result.draft.suggestedCategory}`,
        `Target: ${result.draft.suggestedTarget.toLocaleString()} supporters in ${result.draft.suggestedDurationDays} days`
      ];
    case "Social Posts":
      return [
        `WhatsApp: ${result.draft.whatsappMessage}`,
        `Facebook: ${result.draft.facebookPost}`,
        `X/Twitter: ${result.draft.xPost}`,
        `LinkedIn: ${result.draft.linkedInPost}`
      ];
    case "Volunteer Plan":
      return result.draft.volunteerPlan;
    case "Press Release":
      return [
        result.draft.pressRelease,
        `Email subject: ${result.draft.emailSubject}`,
        `QR poster: ${result.draft.qrPosterHeadline}`
      ];
    default:
      return [];
  }
}

function getSectionConfidence(result: AiCampaignCopilotResult, index: number) {
  return Math.max(68, Math.min(96, result.draft.qualityScore + 8 - index * 2));
}

export function AiCampaignCopilot({ campaignDraft, onApplyAiDraft, onClose }: AiCampaignCopilotProps) {
  const [idea, setIdea] = useState("");
  const [generatedIdea, setGeneratedIdea] = useState("");
  const [language, setLanguage] = useState<AiLanguage>("English");
  const [result, setResult] = useState<AiCampaignCopilotResult | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [history, setHistory] = useState<string[]>([]);
  const [savedDrafts, setSavedDrafts] = useState<AiCampaignCopilotResult[]>([]);
  const [sectionState, setSectionState] = useState<Record<string, "accepted" | "rejected" | "editing">>({});
  const [followUpInstruction, setFollowUpInstruction] = useState("");

  const promptPreview = useMemo(
    () => previewCampaignPrompt({ idea: idea || "Repair potholes on Nandankanan Road", language }),
    [idea, language]
  );

  async function generate() {
    setIsGenerating(true);
    const campaignIdea = idea.trim() || "Repair potholes on Nandankanan Road";
    const next = await generateCampaignWithAi({ idea: campaignIdea, language });
    setResult(next);
    setGeneratedIdea(campaignIdea);
    setHistory((current) => [campaignIdea, ...current].slice(0, 6));
    setSectionState({});
    setIsGenerating(false);
  }

  function regenerateSection(section: string) {
    if (!result) return;
    const marker = `Refined for "${generatedIdea}"`;
    const next = { ...result, draft: { ...result.draft } };
    if (section === "Campaign Title") {
      next.draft.title = `${generatedIdea}: Community Action Needed Now`;
      next.draft.subtitle = `${marker}: a sharper public appeal with a clear civic ask.`;
    } else if (section === "Summary") {
      next.draft.summary = `${marker}: Citizens are asking for visible, time-bound action and transparent follow-up.`;
    } else if (section === "Full Description") {
      next.draft.fullDescription = `${marker}. This petition explains the public problem, gathers verified support, and requests the responsible authority to publish an action plan with dates, ownership, and citizen updates.`;
    } else if (section === "Objectives") {
      next.draft.objectives = [
        `Build verified public support for "${generatedIdea}"`,
        "Collect evidence and local context from affected citizens",
        "Submit a concise petition and follow up until action is visible"
      ];
    } else if (section === "Authority") {
      next.draft.suggestedAuthority = `Primary: ${next.draft.suggestedAuthority}; escalation: District Collector if unresolved`;
    } else if (section === "Social Posts") {
      next.draft.whatsappMessage = `Please support "${generatedIdea}". Sign, share, and help us request timely action.`;
      next.draft.facebookPost = `Our community is coming together for "${generatedIdea}". Add your signature and share this public appeal.`;
      next.draft.xPost = `Support "${generatedIdea}" with your signature. Public action starts with organized voices. #Voiceup`;
      next.draft.linkedInPost = `A clear public appeal has been created for "${generatedIdea}". Please support the campaign and help route it to the right authority.`;
    } else if (section === "Volunteer Plan") {
      next.draft.volunteerPlan = [
        "Assign one owner for online sharing",
        "Assign one owner for local evidence collection",
        "Assign one owner for authority follow-up",
        "Share daily progress with supporters"
      ];
    } else if (section === "Press Release") {
      next.draft.pressRelease = `Citizens have launched a renewed public appeal for "${generatedIdea}", requesting timely action, a written response, and measurable updates from the responsible authority.`;
    }
    setResult(next);
    setSectionState((current) => ({ ...current, [section]: "editing" }));
  }

  function applyFollowUpInstruction() {
    if (!result || !followUpInstruction.trim()) return;
    const instruction = followUpInstruction.toLowerCase();
    const next = { ...result, draft: { ...result.draft }, advisor: [...result.advisor] };
    if (instruction.includes("shorter")) {
      next.draft.summary = `Support "${generatedIdea}" and request timely action from the responsible authority.`;
      next.draft.fullDescription = `This campaign gathers verified public support for "${generatedIdea}" and asks the authority for a clear action plan.`;
    } else if (instruction.includes("stronger") || instruction.includes("emotional")) {
      next.draft.summary = `"${generatedIdea}" affects daily life and deserves urgent public attention. Add your voice for accountable action.`;
      next.draft.fullDescription = `Every unresolved public issue has a human cost. This campaign for "${generatedIdea}" brings citizens together respectfully but firmly to request visible action, written accountability, and regular updates.`;
    } else if (instruction.includes("odia")) {
      next.draft.subtitle = `Odia translation provider-ready for "${generatedIdea}".`;
      next.advisor = ["Odia translation is marked provider-ready until a real AI provider is connected.", ...next.advisor];
    } else if (instruction.includes("municipal commissioner")) {
      next.draft.suggestedAuthority = "Municipal Commissioner";
      next.advisor = [`Authority focus updated to Municipal Commissioner for "${generatedIdea}".`, ...next.advisor];
    } else {
      next.draft.summary = `${next.draft.summary} Follow-up instruction noted: ${followUpInstruction.trim()}`;
      next.advisor = [`Applied local follow-up instruction: ${followUpInstruction.trim()}`, ...next.advisor];
    }
    setResult(next);
    setHistory((current) => [`Follow-up: ${followUpInstruction.trim()}`, ...current].slice(0, 6));
    setFollowUpInstruction("");
  }

  function applyToDraft() {
    if (!result) return;
    onApplyAiDraft(result, sectionState);
  }

  return (
    <div className="ai-copilot-backdrop" role="dialog" aria-modal="true" aria-label="AI Campaign Copilot">
      <section className="ai-copilot-panel">
        <header className="ai-copilot-header">
          <div>
            <span className="eyebrow">AI Campaign Copilot</span>
            <h2>Create a professional campaign draft from one sentence</h2>
            <p>Provider-ready architecture. Current generation uses the local mock provider only.</p>
          </div>
          <button className="icon-button" type="button" aria-label="Close AI Copilot" onClick={onClose}>
            <X size={18} />
          </button>
        </header>

        <div className="ai-copilot-grid">
          <div className="ai-copilot-input">
            <div className="ai-assistant-card">
              <span className="eyebrow">Assistant workspace</span>
              <strong>{result ? "Review and refine" : "Ready for your idea"}</strong>
              <p>
                {result
                  ? `Working from: "${generatedIdea}"`
                  : "Write one sentence. The mock provider will draft a campaign locally."}
              </p>
            </div>
            <Field label="Campaign idea">
              <textarea
                rows={4}
                value={idea}
                onChange={(event) => setIdea(event.target.value)}
                placeholder="Repair potholes on Nandankanan Road"
              />
            </Field>
            <Field label="Language">
              <select value={language} onChange={(event) => setLanguage(event.target.value as AiLanguage)}>
                <option>English</option>
                <option>Hindi</option>
                <option>Odia</option>
              </select>
              <small>Hindi and Odia are provider-ready placeholders until a real model is connected.</small>
            </Field>
            <div className="button-row">
              <button className="primary-button" type="button" disabled={isGenerating} onClick={generate}>
                <Wand2 size={18} /> {isGenerating ? "Generating..." : "Generate draft"}
              </button>
              <button className="secondary-button" type="button" disabled={!result} onClick={generate}>
                <RefreshCcw size={18} /> Regenerate
              </button>
            </div>
            <div className="ai-thinking-timeline" aria-label="AI thinking timeline">
              {[
                ["1", "Understanding campaign idea", generatedIdea || idea || "Waiting for input"],
                ["2", "Detecting category", result ? result.draft.suggestedCategory : isGenerating ? "Analyzing" : "Pending"],
                ["3", "Suggesting authorities", result ? result.draft.suggestedAuthority : isGenerating ? "Matching" : "Pending"],
                ["4", "Drafting petition", result ? "Title, summary, description ready" : isGenerating ? "Writing" : "Pending"],
                ["5", "Creating social content", result ? "WhatsApp, Facebook, X, LinkedIn ready" : isGenerating ? "Preparing" : "Pending"],
                ["6", "Scoring campaign", result ? `${result.draft.qualityScore}/100` : isGenerating ? "Scoring" : "Pending"],
                ["7", "Ready for review", result ? "Review cards are ready" : "Pending"]
              ].map(([step, label, detail], index) => (
                <div className={result || isGenerating || index === 0 ? "thinking-step active" : "thinking-step"} key={label}>
                  <span>{step}</span>
                  <strong>{label}</strong>
                  <small>{detail}</small>
                </div>
              ))}
            </div>
            <div className="provider-ready-list">
              <span className="eyebrow">Future providers</span>
              {futureAiProviders.map((provider) => (
                <span key={provider}>{provider}</span>
              ))}
            </div>
            <details className="prompt-preview">
              <summary>Prompt preview</summary>
              <pre>{promptPreview}</pre>
            </details>
          </div>

          <div className="ai-copilot-output">
            {!result ? (
              <div className="empty-state compact-empty">
                <Sparkles size={26} />
                <h3>Enter one sentence to generate a campaign draft.</h3>
                <p>Example: Save Chilika Lake, Stop cow slaughter, or Repair potholes on Nandankanan Road.</p>
              </div>
            ) : (
              <>
                <div className="ai-quality-card">
                  <div>
                    <span>Campaign Quality Score</span>
                    <strong>{result.draft.qualityScore}/100</strong>
                    <small>{result.advisor[0]}</small>
                  </div>
                  <div className="ai-generated-idea">
                    <span className="eyebrow">Generated from</span>
                    <p>{generatedIdea}</p>
                  </div>
                </div>

                <div className="ai-review-list">
                  {reviewSections.map((section, index) => {
                    const confidence = getSectionConfidence(result, index);
                    return (
                    <article className="ai-review-card" key={section}>
                      <div className="ai-review-card-main">
                        <div className="ai-review-card-heading">
                          <div>
                            <strong>{section}</strong>
                            <small>{sectionState[section] ?? "Review pending"} - Based on "{generatedIdea}"</small>
                          </div>
                          <span className="confidence-pill">{confidence}% confidence</span>
                        </div>
                        <div className="ai-review-content">
                          {getReviewSectionContent(result, section).map((item) => (
                            <p key={item}>{item}</p>
                          ))}
                        </div>
                      </div>
                      <div className="button-row">
                        <button
                          className="secondary-button"
                          type="button"
                          onClick={() => setSectionState((current) => ({ ...current, [section]: "accepted" }))}
                        >
                          <Check size={16} /> Accept
                        </button>
                        <button
                          className="secondary-button"
                          type="button"
                          onClick={() => setSectionState((current) => ({ ...current, [section]: "rejected" }))}
                        >
                          Reject
                        </button>
                        <button
                          className="secondary-button"
                          type="button"
                          onClick={() => setSectionState((current) => ({ ...current, [section]: "editing" }))}
                        >
                          Edit
                        </button>
                        <button
                          className="secondary-button"
                          type="button"
                          onClick={() => regenerateSection(section)}
                        >
                          <RefreshCcw size={16} /> Regenerate
                        </button>
                      </div>
                    </article>
                    );
                  })}
                </div>

                <div className="ai-draft-preview">
                  <h3>{result.draft.title}</h3>
                  <p>{result.draft.subtitle}</p>
                  <textarea
                    aria-label="Editable generated campaign summary"
                    rows={3}
                    value={result.draft.summary}
                    onChange={(event) =>
                      setResult({ ...result, draft: { ...result.draft, summary: event.target.value } })
                    }
                  />
                  <textarea
                    aria-label="Editable generated full description"
                    rows={5}
                    value={result.draft.fullDescription}
                    onChange={(event) =>
                      setResult({ ...result, draft: { ...result.draft, fullDescription: event.target.value } })
                    }
                  />
                </div>

                <div className="ai-advisor-grid">
                  <div>
                    <span className="eyebrow">Campaign Advisor</span>
                    {result.advisor.map((item) => <p key={item}>{item}</p>)}
                  </div>
                  <div>
                    <span className="eyebrow">Copilot Suggestions</span>
                    {[
                      "Add campaign location",
                      "Upload campaign photo",
                      "Confirm authority",
                      "Set supporter target",
                      "Review public signing fields",
                      "Generate WhatsApp message"
                    ].map((suggestion) => (
                      <p key={suggestion}>{suggestion}</p>
                    ))}
                  </div>
                  <div>
                    <span className="eyebrow">Simulator</span>
                    <p>Potential supporters: {result.simulation.potentialSupporters.toLocaleString()}</p>
                    <p>Authority reach: {result.simulation.authorityReach}</p>
                    <p>Volunteer effort: {result.simulation.volunteerEffort}</p>
                    <p>Communication effort: {result.simulation.communicationEffort}</p>
                    <p>Estimated completion: {result.simulation.estimatedCompletion}</p>
                    <p>Risk level: {result.simulation.riskLevel}</p>
                  </div>
                </div>

                <div className="ai-follow-up-box">
                  <span className="eyebrow">Follow-up instruction</span>
                  <Field label="Tell Copilot what to change">
                    <textarea
                      rows={3}
                      value={followUpInstruction}
                      onChange={(event) => setFollowUpInstruction(event.target.value)}
                      placeholder="Make it stronger, make it shorter, translate to Odia, add emotional appeal, target Municipal Commissioner"
                    />
                  </Field>
                  <div className="template-chip-row">
                    {[
                      "Make it stronger",
                      "Make it shorter",
                      "Translate to Odia",
                      "Add emotional appeal",
                      "Target Municipal Commissioner"
                    ].map((example) => (
                      <button key={example} type="button" onClick={() => setFollowUpInstruction(example)}>
                        {example}
                      </button>
                    ))}
                  </div>
                  <button className="primary-button" type="button" onClick={applyFollowUpInstruction}>
                    Apply follow-up locally
                  </button>
                </div>

                <div className="ai-content-studio">
                  <span className="eyebrow">Content Studio</span>
                  {Object.entries(result.contentStudio).map(([label, value]) => (
                    <details key={label}>
                      <summary>{label.replace(/([A-Z])/g, " $1")}</summary>
                      <p>{value}</p>
                    </details>
                  ))}
                </div>

                <div className="ai-workspace">
                  <div>
                    <span className="eyebrow">Conversation</span>
                    {history.map((item) => <p key={item}>{item}</p>)}
                  </div>
                  <div>
                    <span className="eyebrow">Saved drafts</span>
                    <p>{savedDrafts.length} saved in this session</p>
                  </div>
                </div>

                <div className="ai-copilot-actions">
                  <button className="secondary-button" type="button" onClick={() => setSavedDrafts((current) => [result, ...current])}>
                    <ClipboardList size={18} /> Save AI draft
                  </button>
                  <button className="secondary-button" type="button">
                    <Languages size={18} /> Multi-language provider ready
                  </button>
                  <button className="primary-button" type="button" disabled={!result || !campaignDraft} onClick={applyToDraft}>
                    Apply accepted basics to current draft
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}

export default AiCampaignCopilot;
