import { ArrowUpRight, Clock3, Layers3 } from "lucide-react";
import { Panel } from "../../ui/Panel";
import { useTranslation } from "../../i18n/useTranslation";

export interface VbossPlaceholderSection {
  name: string;
  purpose: string;
  connected: string;
  future: string;
}

interface VbossModulePlaceholderProps {
  moduleName: string;
  purpose: string;
  sections: VbossPlaceholderSection[];
  onOpenConnected?: () => void;
  connectedActionLabel?: string;
}

export function VbossModulePlaceholder({
  moduleName,
  purpose,
  sections,
  onOpenConnected,
  connectedActionLabel
}: VbossModulePlaceholderProps) {
  const { t } = useTranslation();
  return (
    <section className="page-stack vboss-placeholder">
      <Panel title={moduleName} icon={<Layers3 />}>
        <div className="vboss-placeholder-heading">
          <div>
            <span className="eyebrow">{t("framework.placeholder.module")}</span>
            <h2>{moduleName}</h2>
            <p>{purpose}</p>
          </div>
          <span className="coming-soon-badge"><Clock3 size={14} />{t("framework.placeholder.comingSoon")}</span>
        </div>
        <div className="vboss-placeholder-grid">
          {sections.map((section) => (
            <article className="vboss-placeholder-card" key={section.name}>
              <div className="vboss-placeholder-card-heading">
                <h3>{section.name}</h3>
                <span>{t("framework.placeholder.status")}</span>
              </div>
              <p>{section.purpose}</p>
              <small><strong>{t("framework.placeholder.connected")}</strong> {section.connected}</small>
              <small><strong>{t("framework.placeholder.future")}</strong> {section.future}</small>
            </article>
          ))}
        </div>
        {onOpenConnected && connectedActionLabel && (
          <div className="button-row vboss-placeholder-actions">
            <button className="secondary-button" type="button" onClick={onOpenConnected}>
              {connectedActionLabel} <ArrowUpRight size={16} />
            </button>
          </div>
        )}
      </Panel>
    </section>
  );
}
