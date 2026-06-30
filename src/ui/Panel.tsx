import type { ReactNode } from "react";

interface PanelProps {
  title: string;
  icon: ReactNode;
  children: ReactNode;
}

export function Panel({ title, icon, children }: PanelProps) {
  return (
    <section className="panel">
      <header>
        <div>
          <span className="panel-icon" aria-hidden="true">{icon}</span>
          <h2>{title}</h2>
        </div>
      </header>
      <div className="panel-body">{children}</div>
    </section>
  );
}
