interface SectionTabsProps {
  tabs: Array<{ id: string; label: string }>;
  activeTab: string;
  onChange: (tab: string) => void;
}

export function SectionTabs({ tabs, activeTab, onChange }: SectionTabsProps) {
  return (
    <div className="section-tabs" role="tablist" aria-label="SaaS admin sections">
      {tabs.map((tab) => (
        <button
          aria-selected={activeTab === tab.id}
          className={activeTab === tab.id ? "active" : ""}
          key={tab.id}
          role="tab"
          tabIndex={activeTab === tab.id ? 0 : -1}
          type="button"
          onClick={() => onChange(tab.id)}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
