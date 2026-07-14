import { useMemo, useState } from "react";
import { Bell, CheckCircle2, Clock3, Pin, RotateCcw, ShieldAlert, Sparkles, XCircle } from "lucide-react";
import { useGrowth } from "../../hooks/useGrowth";
import type { GrowthRuntimeState } from "../../lifecycle";
import type { GrowthActionCard, GrowthCommandId } from "../../commands/types";
import { useGrowthActionCenter } from "../../commands/useGrowthActionCenter";
import { Panel } from "../../../ui/Panel";
import { StatusBadge } from "../../ui";
import { useTranslation } from "../../../i18n/useTranslation";

interface ActionCenterProps {
  runtime?: GrowthRuntimeState;
  activeCampaignId?: string;
}

function formatDuration(value?: number) {
  if (!value || value <= 0) return "-";
  if (value < 1000) return `${value} ms`;
  return `${(value / 1000).toFixed(1)} s`;
}

function statusTone(status?: string) {
  if (status === "success") return "good" as const;
  if (status === "failed") return "danger" as const;
  if (status === "running") return "warning" as const;
  return "neutral" as const;
}

function triggerTone(trigger: GrowthActionCard["trigger"]) {
  if (trigger === "automation") return "info" as const;
  if (trigger === "recommendation") return "warning" as const;
  return "neutral" as const;
}

function ActionCard(props: {
  action: GrowthActionCard;
  onExecute: (commandId: GrowthCommandId, trigger?: "manual" | "automation" | "recommendation") => Promise<void>;
  onUndo: (commandId: GrowthCommandId) => Promise<void>;
  onDismiss: (actionId: string) => void;
}) {
  const { t } = useTranslation();
  const { action, onExecute, onUndo, onDismiss } = props;
  const [openPreview, setOpenPreview] = useState(false);
  const execution = action.execution;

  return (
    <article className="growth-action-card">
      <div className="growth-action-head">
        <strong>{action.descriptor.title}</strong>
        <StatusBadge label={action.descriptor.priority} tone={action.descriptor.priority === "high" ? "warning" : action.descriptor.priority === "medium" ? "info" : "neutral"} />
      </div>
      <p>{action.reason}</p>
      <div className="growth-action-meta">
        <span>{t("growth.actions.impact")}: {action.descriptor.expectedImpact}</span>
        <span>{t("growth.actions.reach")}: {action.descriptor.estimatedReach.toLocaleString()}</span>
        <span>{t("growth.actions.difficulty")}: {action.descriptor.difficulty}</span>
        <span>{t("growth.actions.time")}: {action.descriptor.timeRequiredMinutes} {t("growth.actions.minutes")}</span>
      </div>
      <div className="growth-action-meta">
        <StatusBadge label={action.trigger} tone={triggerTone(action.trigger)} />
        {action.scheduledAt ? <small>{t("growth.actions.scheduled")}: {action.scheduledAt}</small> : <small>{t("growth.actions.manualTrigger")}</small>}
        {execution ? <StatusBadge label={execution.status} tone={statusTone(execution.status)} /> : <StatusBadge label={t("growth.actions.notExecuted")} tone="neutral" />}
      </div>
      {execution && (
        <div className="growth-action-progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={execution.progress}>
          <span style={{ width: `${execution.progress}%` }} />
        </div>
      )}
      {execution && (
        <small>
          {t("growth.actions.lastRunBy")} {execution.actor} | {t("growth.actions.duration")} {formatDuration(execution.durationMs)} | {t("growth.actions.retries")} {execution.retryCount}
        </small>
      )}
      <div className="growth-action-buttons">
        <button type="button" className="primary-button" onClick={() => onExecute(action.descriptor.id, action.trigger)}>
          {t("growth.actions.execute")}
        </button>
        <button type="button" className="secondary-button" onClick={() => setOpenPreview((value) => !value)}>
          {t("growth.actions.preview")}
        </button>
        <button type="button" className="secondary-button" onClick={() => onDismiss(action.actionId)}>
          {t("growth.actions.dismiss")}
        </button>
        {action.descriptor.undoSupported && execution?.status === "success" && (
          <button type="button" className="secondary-button" onClick={() => onUndo(action.descriptor.id)}>
            {t("growth.actions.undo")}
          </button>
        )}
      </div>
      {openPreview && (
        <div className="growth-action-preview">
          <p>{action.descriptor.description}</p>
          <small>{t("growth.actions.actionId")}: {action.actionId}</small>
        </div>
      )}
    </article>
  );
}

export function ActionCenter({ runtime, activeCampaignId }: ActionCenterProps) {
  const { t } = useTranslation();
  const { dashboardModel } = useGrowth();
  const {
    model,
    store,
    execute,
    undo,
    dismissAction,
    markNotificationRead,
    toggleNotificationPin,
    dismissNotification,
    archiveNotification,
    markAllNotificationsRead
  } = useGrowthActionCenter({
    model: dashboardModel,
    runtime,
    activeCampaignId
  });

  const notificationIds = useMemo(
    () => [
      ...new Set([
        ...model.timeline.map((item) => item.id),
        ...Object.keys(store.notificationState)
      ])
    ],
    [model.timeline, store.notificationState]
  );

  const allActionableNotifications = notificationIds
    .map((id) => store.notificationState[id] ?? { id, read: false, pinned: false, archived: false, dismissed: false })
    .filter((item) => !item.dismissed)
    .slice(0, 20);

  return (
    <div className="growth-action-center-stack">
      <Panel title={t("growth.actions.title")} icon={<Sparkles />}>
        <div className="growth-action-section">
          <h4>{t("growth.actions.urgent")}</h4>
          <div className="growth-action-grid">
            {model.urgentActions.map((action) => (
              <ActionCard key={action.actionId} action={action} onExecute={execute} onUndo={undo} onDismiss={dismissAction} />
            ))}
            {model.urgentActions.length === 0 && <p className="helper-text">{t("growth.actions.noUrgent")}</p>}
          </div>
        </div>

        <div className="growth-action-section">
          <h4>{t("growth.actions.recommended")}</h4>
          <div className="growth-action-grid">
            {model.recommendedActions.map((action) => (
              <ActionCard key={action.actionId} action={action} onExecute={execute} onUndo={undo} onDismiss={dismissAction} />
            ))}
          </div>
        </div>

        <div className="growth-action-section">
          <h4>{t("growth.actions.scheduledActions")}</h4>
          <div className="growth-action-grid">
            {model.scheduledActions.map((action) => (
              <ActionCard key={action.actionId} action={action} onExecute={execute} onUndo={undo} onDismiss={dismissAction} />
            ))}
            {model.scheduledActions.length === 0 && <p className="helper-text">{t("growth.actions.noSchedules")}</p>}
          </div>
        </div>

        <div className="growth-action-section">
          <h4>{t("growth.actions.completedDismissed")}</h4>
          <div className="growth-action-mini-grid">
            <article>
              <strong>{t("growth.actions.completed")}</strong>
              <span>{model.completedActions.length.toLocaleString()}</span>
            </article>
            <article>
              <strong>{t("growth.actions.dismissed")}</strong>
              <span>{model.dismissedActions.length.toLocaleString()}</span>
            </article>
          </div>
        </div>
      </Panel>

      <Panel title={t("growth.actions.notificationDelivery")} icon={<Bell />}>
        <div className="growth-action-buttons sticky-mobile-actions">
          <button type="button" className="secondary-button" onClick={() => markAllNotificationsRead(allActionableNotifications.map((item) => item.id))}>
            <CheckCircle2 size={15} /> {t("growth.actions.markAllRead")}
          </button>
        </div>
        <div className="growth-notification-grid">
          {allActionableNotifications.map((item) => (
            <article key={item.id} className="growth-notification-card">
              <div>
                <strong>{item.id}</strong>
                <small>{t(item.read ? "growth.actions.read" : "growth.actions.unread")}</small>
              </div>
              <div className="growth-action-buttons">
                <button type="button" className="secondary-button" onClick={() => markNotificationRead(item.id)}>
                  <CheckCircle2 size={14} /> {t("growth.actions.read")}
                </button>
                <button type="button" className="secondary-button" onClick={() => toggleNotificationPin(item.id)}>
                  <Pin size={14} /> {t(item.pinned ? "growth.actions.unpin" : "growth.actions.pin")}
                </button>
                <button type="button" className="secondary-button" onClick={() => archiveNotification(item.id)}>
                  <Clock3 size={14} /> {t("growth.actions.archive")}
                </button>
                <button type="button" className="secondary-button" onClick={() => dismissNotification(item.id)}>
                  <XCircle size={14} /> {t("growth.actions.dismiss")}
                </button>
              </div>
            </article>
          ))}
          {allActionableNotifications.length === 0 && <p className="helper-text">{t("growth.actions.noNotifications")}</p>}
        </div>
      </Panel>

      <Panel title={t("growth.actions.history")} icon={<ShieldAlert />}>
        <div className="growth-history-grid">
          <article>
            <h4>{t("growth.actions.executionLog")}</h4>
            <div className="growth-node-list">
              {store.logs.slice(0, 15).map((log) => (
                <div className="growth-node-row" key={log.id}>
                  <div>
                    <strong>{log.commandId}</strong>
                    <small>{log.message}</small>
                  </div>
                  <div>
                    <small>{log.actor}</small>
                    <StatusBadge label={log.status} tone={statusTone(log.status)} />
                  </div>
                </div>
              ))}
            </div>
          </article>
          <article>
            <h4>{t("growth.actions.auditTimeline")}</h4>
            <div className="growth-node-list">
              {model.auditTrail.slice(0, 10).map((item) => (
                <div className="growth-node-row" key={item.id}>
                  <div>
                    <strong>{item.commandId}</strong>
                    <small>{item.actor}</small>
                  </div>
                  <div>
                    <small>{t("growth.actions.retries")} {item.retryCount}</small>
                    <small>{formatDuration(item.durationMs)}</small>
                  </div>
                </div>
              ))}
            </div>
          </article>
          <article>
            <h4>{t("growth.actions.certificates")}</h4>
            <div className="growth-node-list">
              {store.certificates.slice(0, 10).map((item) => (
                <div className="growth-node-row" key={item.id}>
                  <div>
                    <strong>{item.serialNumber}</strong>
                    <small>{item.templateId}</small>
                  </div>
                  <div>
                    <small>{item.verificationId}</small>
                    <small>{item.source}</small>
                  </div>
                </div>
              ))}
              {store.certificates.length === 0 && <p className="helper-text">{t("growth.actions.noCertificates")}</p>}
            </div>
          </article>
        </div>
      </Panel>
    </div>
  );
}

export default ActionCenter;
