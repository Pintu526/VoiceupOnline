import type { ReactNode } from "react";

export type Tab =
  | "dashboard"
  | "campaigns"
  | "public"
  | "scans"
  | "reports"
  | "engagement"
  | "activity"
  | "saas"
  | "ideas";

interface NavButtonProps {
  icon: ReactNode;
  label: string;
  tab: Tab;
  activeTab: Tab;
  onClick: (tab: Tab) => void;
}

export function NavButton({ icon, label, tab, activeTab, onClick }: NavButtonProps) {
  const isActive = activeTab === tab;
  return (
    <button
      aria-current={isActive ? "page" : undefined}
      aria-label={label}
      className={isActive ? "active" : ""}
      type="button"
      onClick={() => onClick(tab)}
    >
      {icon}
      {label}
    </button>
  );
}
