import { useState } from "react";

export default function InspectorSection({
  title,
  children,
  aside = null,
  defaultOpen = true,
  className = "",
  ...sectionProps
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section {...sectionProps} className={`inspector-section ${open ? "open" : ""} ${className}`.trim()}>
      <div className="inspector-section-header">
        <button
          type="button"
          className="inspector-section-toggle"
          aria-expanded={open}
          onClick={() => setOpen(value => !value)}
        >
          <svg viewBox="0 0 12 12" aria-hidden="true"><path d="m2.5 4 3.5 3.5L9.5 4" /></svg>
          <span>{title}</span>
        </button>
        {aside ? <div className="inspector-section-aside">{aside}</div> : null}
      </div>
      {open ? <div className="inspector-section-body">{children}</div> : null}
    </section>
  );
}
