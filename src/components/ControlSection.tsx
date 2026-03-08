import type { ReactNode } from "react";

interface ControlSectionProps {
  title: string;
  children: ReactNode;
}

export function ControlSection({ title, children }: ControlSectionProps) {
  return (
    <section className="panel-section">
      <h2 className="panel-section-title">{title}</h2>
      <div className="panel-section-body">{children}</div>
    </section>
  );
}
