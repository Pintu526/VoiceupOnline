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
import { useTranslation } from "../../i18n/useTranslation";

interface AiCampaignCopilotProps {
  campaignDraft: Campaign | null;
  onApplyAiDraft: (
    result: AiCampaignCopilotResult,
    sectionState: Record<string, "accepted" | "rejected" | "editing">
  ) => void;
  onApplyAiSection: (result: AiCampaignCopilotResult, section: string) => void;
  onUndoAiApply: () => void;
  canUndoAiApply: boolean;
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

function reviewSectionKey(section: string) {
  return section.replace(/\s/g, "").replace(/^./, (value) => value.toLowerCase());
}

function getReviewSectionContent(result: AiCampaignCopilotResult, section: string, t: (key: string) => string) {
  switch (section) {
    case "Campaign Title":
      return [result.draft.title, result.draft.subtitle];
    case "Summary":
      return [result.draft.summary, `${t("copilot.content.tags")}: ${result.draft.suggestedTags.join(", ")}`];
    case "Full Description":
      return [result.draft.fullDescription, `${t("copilot.content.expectedOutcome")}: ${result.draft.expectedOutcome}`];
    case "Objectives":
      return result.draft.objectives;
    case "Authority":
      return [
        result.draft.suggestedAuthority,
        `${t("copilot.content.category")}: ${result.draft.suggestedCategory}`,
        `${t("copilot.content.target")}: ${result.draft.suggestedTarget.toLocaleString()} ${t("copilot.content.supportersIn")} ${result.draft.suggestedDurationDays} ${t("copilot.content.days")}`
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
        `${t("copilot.content.emailSubject")}: ${result.draft.emailSubject}`,
        `${t("copilot.content.qrPoster")}: ${result.draft.qrPosterHeadline}`
      ];
    default:
      return [];
  }
}

function getSectionConfidence(result: AiCampaignCopilotResult, index: number) {
  return Math.max(68, Math.min(96, result.draft.qualityScore + 8 - index * 2));
}

type RewriteTone = "shorter" | "emotional" | "professional" | "legal" | "citizen";

function rewriteText(value: string, tone: RewriteTone, idea: string) {
  if (tone === "shorter") return `Support "${idea}" and request timely action from the responsible authority.`;
  if (tone === "emotional") return `"${idea}" affects real people every day. Add your voice for visible, accountable action.`;
  if (tone === "professional") return `This campaign requests a clear, time-bound response on "${idea}" from the responsible authority.`;
  if (tone === "legal") return `Citizens respectfully request lawful, documented, and time-bound administrative action on "${idea}".`;
  return `We can solve "${idea}" together by signing, sharing, and asking the right authority for action.`;
}

export function AiCampaignCopilot({
  campaignDraft,
  onApplyAiDraft,
  onApplyAiSection,
  onUndoAiApply,
  canUndoAiApply,
  onClose
}: AiCampaignCopilotProps) {
  const { t } = useTranslation();
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
      next.draft.subtitle = `Odia translation can be added for "${generatedIdea}" after language setup.`;
      next.advisor = ["Odia translation is available after language setup.", ...next.advisor];
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

  function rewriteSection(section: string, tone: RewriteTone) {
    if (!result) return;
    const next = { ...result, draft: { ...result.draft }, advisor: [...result.advisor] };
    const ideaText = generatedIdea || idea || "this campaign";
    const rewritten = rewriteText(next.draft.summary, tone, ideaText);
    if (section === "Campaign Title") {
      next.draft.subtitle = rewritten;
    } else if (section === "Summary") {
      next.draft.summary = rewritten;
    } else if (section === "Full Description") {
      next.draft.fullDescription = `${rewritten}\n\nThis petition keeps the request focused, respectful, and ready for authority review.`;
    } else if (section === "Objectives") {
      next.draft.objectives = [
        rewritten,
        `Collect verified support for "${ideaText}"`,
        "Create a clear follow-up trail with the responsible authority"
      ];
    } else if (section === "Authority") {
      next.draft.suggestedAuthority = tone === "legal"
        ? `${next.draft.suggestedAuthority}; legal escalation: District administration`
        : next.draft.suggestedAuthority;
    } else if (section === "Social Posts") {
      next.draft.whatsappMessage = rewritten;
      next.draft.facebookPost = rewritten;
      next.draft.xPost = `${rewritten} #Voiceup`;
      next.draft.linkedInPost = rewritten;
    } else if (section === "Volunteer Plan") {
      next.draft.volunteerPlan = [
        "Assign outreach owners",
        "Collect local evidence",
        "Share citizen-friendly updates",
        "Track authority follow-up"
      ];
    } else if (section === "Press Release") {
      next.draft.pressRelease = rewritten;
    }
    next.advisor = [`${section} rewritten in ${tone === "citizen" ? "citizen friendly" : tone} tone.`, ...next.advisor].slice(0, 6);
    next.draft.qualityScore = Math.min(95, next.draft.qualityScore + 1);
    setResult(next);
    setSectionState((current) => ({ ...current, [section]: "editing" }));
  }

  function applyToDraft() {
    if (!result) return;
    onApplyAiDraft(result, sectionState);
  }

  return (
    <div className="ai-copilot-backdrop" role="dialog" aria-modal="true" aria-label={t("copilot.title")}>
      <section className="ai-copilot-panel">
        <header className="ai-copilot-header">
          <div>
            <span className="eyebrow">{t("copilot.title")}</span>
            <h2>{t("copilot.headline")}</h2>
            <p>{t("copilot.description")}</p>
          </div>
          <button className="icon-button" type="button" aria-label={t("copilot.close")} onClick={onClose}>
            <X size={18} />
          </button>
        </header>

        <div className="ai-copilot-grid">
          <div className="ai-copilot-input">
            <div className="ai-assistant-card">
              <span className="eyebrow">{t("copilot.assistant.workspace")}</span>
              <strong>{result ? t("copilot.assistant.reviewRefine") : t("copilot.assistant.readyIdea")}</strong>
              <p>
                {result
                  ? `${t("copilot.assistant.workingFrom")}: "${generatedIdea}"`
                  : t("copilot.assistant.writeSentence")}
              </p>
            </div>
            <Field label={t("copilot.fields.campaignIdea")}>
              <textarea
                rows={4}
                value={idea}
                onChange={(event) => setIdea(event.target.value)}
                placeholder={t("copilot.fields.ideaPlaceholder")}
              />
            </Field>
            <Field label={t("copilot.fields.language")}>
              <select value={language} onChange={(event) => setLanguage(event.target.value as AiLanguage)}>
                <option value="English">{t("copilot.languages.english")}</option>
                <option value="Hindi">{t("copilot.languages.hindi")}</option>
                <option value="Odia">{t("copilot.languages.odia")}</option>
              </select>
              <small>{t("copilot.languages.setupHelp")}</small>
            </Field>
            <div className="button-row">
              <button className="primary-button" type="button" disabled={isGenerating} onClick={generate}>
                <Wand2 size={18} /> {isGenerating ? t("copilot.actions.generating") : t("copilot.actions.generate")}
              </button>
              <button className="secondary-button" type="button" disabled={!result} onClick={generate}>
                <RefreshCcw size={18} /> {t("copilot.actions.regenerate")}
              </button>
            </div>
            <div className="ai-thinking-timeline" aria-label={t("copilot.thinking.aria")}>
              {[
                ["1", t("copilot.thinking.understanding"), generatedIdea || idea || t("copilot.status.waitingInput")],
                ["2", t("copilot.thinking.detectingCategory"), result ? result.draft.suggestedCategory : isGenerating ? t("copilot.status.analyzing") : t("copilot.status.pending")],
                ["3", t("copilot.thinking.suggestingAuthorities"), result ? result.draft.suggestedAuthority : isGenerating ? t("copilot.status.matching") : t("copilot.status.pending")],
                ["4", t("copilot.thinking.draftingPetition"), result ? t("copilot.thinking.draftReady") : isGenerating ? t("copilot.status.writing") : t("copilot.status.pending")],
                ["5", t("copilot.thinking.socialContent"), result ? t("copilot.thinking.socialReady") : isGenerating ? t("copilot.status.preparing") : t("copilot.status.pending")],
                ["6", t("copilot.thinking.scoringCampaign"), result ? `${result.draft.qualityScore}/100` : isGenerating ? t("copilot.status.scoring") : t("copilot.status.pending")],
                ["7", t("copilot.thinking.readyReview"), result ? t("copilot.thinking.reviewReady") : t("copilot.status.pending")]
              ].map(([step, label, detail], index) => (
                <div className={result || isGenerating || index === 0 ? "thinking-step active" : "thinking-step"} key={label}>
                  <span>{step}</span>
                  <strong>{label}</strong>
                  <small>{detail}</small>
                </div>
              ))}
            </div>
            <div className="available-after-setup-list">
              <span className="eyebrow">{t("copilot.futureProviders")}</span>
              {futureAiProviders.map((provider) => (
                <span key={provider}>{provider}</span>
              ))}
            </div>
            <details className="prompt-preview">
              <summary>{t("copilot.promptPreview")}</summary>
              <pre>{promptPreview}</pre>
            </details>
          </div>

          <div className="ai-copilot-output">
            {!result ? (
              <div className="empty-state compact-empty">
                <Sparkles size={26} />
                <h3>{t("copilot.empty.title")}</h3>
                <p>{t("copilot.empty.example")}</p>
              </div>
            ) : (
              <>
                <div className="ai-quality-card">
                  <div>
                    <span>{t("copilot.qualityScore")}</span>
                    <strong>{result.draft.qualityScore}/100</strong>
                    <small>{result.advisor[0]}</small>
                  </div>
                  <div className="ai-generated-idea">
                    <span className="eyebrow">{t("copilot.generatedFrom")}</span>
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
                            <strong>{t(`copilot.sections.${reviewSectionKey(section)}`)}</strong>
                            <small>{t(`copilot.status.${sectionState[section] ?? "reviewPending"}`)} - {t("copilot.basedOn")} "{generatedIdea}"</small>
                          </div>
                          <span className="confidence-pill">{confidence}% {t("copilot.confidence")}</span>
                        </div>
                        <div className="ai-review-content">
                          {getReviewSectionContent(result, section, t).map((item) => (
                            <p key={item}>{item}</p>
                          ))}
                        </div>
                        <div className="ai-rewrite-actions" aria-label={`${t("copilot.rewrite")} ${t(`copilot.sections.${reviewSectionKey(section)}`)}`}>
                          {[
                            ["shorter", t("copilot.tones.shorter")],
                            ["emotional", t("copilot.tones.emotional")],
                            ["professional", t("copilot.tones.professional")],
                            ["legal", t("copilot.tones.legal")],
                            ["citizen", t("copilot.tones.citizen")]
                          ].map(([tone, label]) => (
                            <button
                              key={tone}
                              type="button"
                              onClick={() => rewriteSection(section, tone as RewriteTone)}
                            >
                              {label}
                            </button>
                          ))}
                        </div>
                      </div>
                      <div className="button-row">
                        <button
                          className="primary-button"
                          type="button"
                          onClick={() => onApplyAiSection(result, section)}
                        >
                          {t("copilot.actions.applySection")}
                        </button>
                        <button
                          className="secondary-button"
                          type="button"
                          onClick={() => setSectionState((current) => ({ ...current, [section]: "accepted" }))}
                        >
                          <Check size={16} /> {t("copilot.actions.accept")}
                        </button>
                        <button
                          className="secondary-button"
                          type="button"
                          onClick={() => setSectionState((current) => ({ ...current, [section]: "rejected" }))}
                        >
                          {t("copilot.actions.reject")}
                        </button>
                        <button
                          className="secondary-button"
                          type="button"
                          onClick={() => setSectionState((current) => ({ ...current, [section]: "editing" }))}
                        >
                          {t("copilot.actions.edit")}
                        </button>
                        <button
                          className="secondary-button"
                          type="button"
                          onClick={() => regenerateSection(section)}
                        >
                          <RefreshCcw size={16} /> {t("copilot.actions.regenerate")}
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
                    aria-label={t("copilot.fields.editableSummary")}
                    rows={3}
                    value={result.draft.summary}
                    onChange={(event) =>
                      setResult({ ...result, draft: { ...result.draft, summary: event.target.value } })
                    }
                  />
                  <textarea
                    aria-label={t("copilot.fields.editableDescription")}
                    rows={5}
                    value={result.draft.fullDescription}
                    onChange={(event) =>
                      setResult({ ...result, draft: { ...result.draft, fullDescription: event.target.value } })
                    }
                  />
                </div>

                <div className="ai-advisor-grid">
                  <div>
                    <span className="eyebrow">{t("copilot.advisor.title")}</span>
                    {result.advisor.map((item) => <p key={item}>{item}</p>)}
                    {[
                      result.draft.title.length > 90 ? t("copilot.advisor.shortenTitle") : t("copilot.advisor.titleGood"),
                      result.draft.fullDescription.length < 240 ? t("copilot.advisor.addEvidence") : t("copilot.advisor.descriptionGood"),
                      result.draft.suggestedAuthority ? t("copilot.advisor.authorityReady") : t("copilot.advisor.addAuthority"),
                      result.draft.suggestedSupporterFields.length <= 3 ? t("copilot.advisor.formFriendly") : t("copilot.advisor.fewerFields")
                    ].map((item) => <p key={item}>{item}</p>)}
                  </div>
                  <div>
                    <span className="eyebrow">{t("copilot.suggestions.title")}</span>
                    {[
                      t("copilot.suggestions.addLocation"),
                      t("copilot.suggestions.uploadPhoto"),
                      t("copilot.suggestions.confirmAuthority"),
                      t("copilot.suggestions.setTarget"),
                      t("copilot.suggestions.reviewFields"),
                      t("copilot.suggestions.generateWhatsapp")
                    ].map((suggestion) => (
                      <p key={suggestion}>{suggestion}</p>
                    ))}
                  </div>
                  <div>
                    <span className="eyebrow">{t("copilot.simulator.title")}</span>
                    <p>{t("copilot.simulator.potentialSupporters")}: {result.simulation.potentialSupporters.toLocaleString()}</p>
                    <p>{t("copilot.simulator.authorityReach")}: {result.simulation.authorityReach}</p>
                    <p>{t("copilot.simulator.volunteerEffort")}: {result.simulation.volunteerEffort}</p>
                    <p>{t("copilot.simulator.communicationEffort")}: {result.simulation.communicationEffort}</p>
                    <p>{t("copilot.simulator.estimatedCompletion")}: {result.simulation.estimatedCompletion}</p>
                    <p>{t("copilot.simulator.riskLevel")}: {result.simulation.riskLevel}</p>
                  </div>
                </div>

                <div className="ai-follow-up-box">
                  <span className="eyebrow">{t("copilot.followup.title")}</span>
                  <Field label={t("copilot.followup.label")}>
                    <textarea
                      rows={3}
                      value={followUpInstruction}
                      onChange={(event) => setFollowUpInstruction(event.target.value)}
                      placeholder={t("copilot.followup.placeholder")}
                    />
                  </Field>
                  <div className="template-chip-row">
                    {[
                      ["Make it stronger", t("copilot.followup.stronger")],
                      ["Make it shorter", t("copilot.followup.shorter")],
                      ["Translate to Odia", t("copilot.followup.translateOdia")],
                      ["Add emotional appeal", t("copilot.followup.emotional")],
                      ["Target Municipal Commissioner", t("copilot.followup.targetCommissioner")]
                    ].map(([value, label]) => (
                      <button key={value} type="button" onClick={() => setFollowUpInstruction(value)}>
                        {label}
                      </button>
                    ))}
                  </div>
                  <button className="primary-button" type="button" onClick={applyFollowUpInstruction}>
                    {t("copilot.followup.apply")}
                  </button>
                </div>

                <div className="ai-language-panel">
                  <span className="eyebrow">{t("copilot.languages.options")}</span>
                  <div>
                    {(["English", "Hindi", "Odia"] as AiLanguage[]).map((item) => (
                      <button
                        key={item}
                        className={language === item ? "active" : ""}
                        type="button"
                        onClick={() => setLanguage(item)}
                      >
                        {t(`copilot.languages.${item.toLowerCase()}`)}
                        <small>{item === "English" ? t("copilot.languages.active") : t("copilot.languages.afterSetup")}</small>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="ai-content-studio">
                  <span className="eyebrow">{t("copilot.contentStudio.title")}</span>
                  {Object.entries(result.contentStudio).map(([label, value]) => (
                    <details key={label}>
                      <summary>{t(`copilot.contentStudio.${label}`)}</summary>
                      <p>{value}</p>
                    </details>
                  ))}
                </div>

                <div className="ai-workspace">
                  <div>
                    <span className="eyebrow">{t("copilot.workspace.conversation")}</span>
                    {history.map((item) => <p key={item}>{item}</p>)}
                  </div>
                  <div>
                    <span className="eyebrow">{t("copilot.workspace.savedDrafts")}</span>
                    <p>{savedDrafts.length} {t("copilot.workspace.savedThisSession")}</p>
                  </div>
                </div>

                <div className="ai-copilot-actions">
                  <button className="secondary-button" type="button" onClick={() => setSavedDrafts((current) => [result, ...current])}>
                    <ClipboardList size={18} /> {t("copilot.actions.saveDraft")}
                  </button>
                  <button className="secondary-button" type="button">
                    <Languages size={18} /> {t("copilot.actions.multilingualSetup")}
                  </button>
                  <button className="secondary-button" type="button" disabled={!canUndoAiApply} onClick={onUndoAiApply}>
                    {t("copilot.actions.undoApply")}
                  </button>
                  <button className="primary-button" type="button" disabled={!result || !campaignDraft} onClick={applyToDraft}>
                    {t("copilot.actions.applyBasics")}
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
