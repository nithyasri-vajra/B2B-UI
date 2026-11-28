import { useEffect, useRef } from "react";

// Our modal dialog: native <dialog>, closes on Escape or the Close button.
export function OurDialog({ title, onClose, children, actions }) {
  const ref = useRef(null);
  useEffect(() => { ref.current?.showModal?.(); }, []);
  return (
    <dialog ref={ref} className="our-dialog" aria-label={title}
      onCancel={(event) => { event.preventDefault(); onClose(); }}>
      <div className="our-between"><h2>{title}</h2><button type="button" className="btn" onClick={onClose}>Close</button></div>
      <div className="our-stack">{children}</div>
      {actions && <div className="our-row our-dialog-actions">{actions}</div>}
    </dialog>
  );
}

export function KnowledgeTabs({ link, current, showSources = true }) {
  const tabs = [["Readiness.dc.html", "Overview"], showSources && ["KnowledgeSetup.dc.html", "Sources"], ["RecordReview.dc.html", "Records"]].filter(Boolean);
  return (
    <nav className="our-tabs" aria-label="Knowledge sections">
      {tabs.map(([file, label]) => label === current
        ? <span key={label} className="our-tab on" aria-current="page">{label}</span>
        : <a key={label} className="our-tab" {...link(file)}>{label}</a>)}
    </nav>
  );
}
