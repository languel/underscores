import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { renderMarkdownWithMath } from "./livecodePresentation.js";

const EMPTY_POINT = { x: -48, y: -48, visible: false };

export default function WalkthroughOverlay({
  snapshot,
  resolveTarget,
  onPause,
  onResume,
  onNext,
  onPrevious,
  onCheck,
  onHint,
  onSkip,
  onStop,
}) {
  const [point, setPoint] = useState(EMPTY_POINT);
  const [hint, setHint] = useState("");
  const step = snapshot?.step;
  const active = snapshot && !["idle", "stopped"].includes(snapshot.status);
  const waiting = snapshot?.status === "waiting";
  const paused = snapshot?.status === "paused";

  useEffect(() => {
    if (!active || !step?.focusTarget) {
      setPoint(EMPTY_POINT);
      return undefined;
    }
    let frame = 0;
    const update = () => {
      const target = resolveTarget?.(step.focusTarget);
      const rect = target?.rect || target?.element?.getBoundingClientRect?.();
      if (rect) setPoint({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2, visible: true });
      frame = requestAnimationFrame(update);
    };
    update();
    return () => cancelAnimationFrame(frame);
  }, [active, resolveTarget, step?.focusTarget]);

  useEffect(() => setHint(""), [step?.id]);

  const progress = useMemo(() => {
    const total = snapshot?.walkthrough?.steps?.length || 0;
    return total ? `${Math.max(0, snapshot.stepIndex) + 1} / ${total}` : "";
  }, [snapshot?.stepIndex, snapshot?.walkthrough?.steps?.length]);

  if (!active || !step || typeof document === "undefined") return null;
  // Keep the portal inside the themed shell so its CSS variables follow the
  // active light/dark/custom appearance while remaining above every panel.
  const portalTarget = document.querySelector(".underscores-shell") || document.body;
  return createPortal(
    <div className="walkthrough-overlay" aria-live="polite" data-walkthrough-status={snapshot.status}>
      <div
        className={`walkthrough-cursor ${point.visible ? "is-visible" : ""}`}
        style={{ transform: `translate3d(${point.x}px, ${point.y}px, 0)` }}
        aria-hidden="true"
      >
        <span className="walkthrough-cursor-dot" />
        <span className="walkthrough-cursor-ring" />
      </div>
      <section className="walkthrough-narration" role="dialog" aria-label={`Guided walkthrough: ${step.title}`}>
        <header>
          <span>{snapshot.walkthrough.title}</span>
          <span>{progress}</span>
        </header>
        <h2>{step.title}</h2>
        {step.narration && <div className="walkthrough-narration-markdown livecode-markdown" dangerouslySetInnerHTML={{ __html: renderMarkdownWithMath(step.narration) }} />}
        {snapshot.assertion && <p className={snapshot.assertion.passed ? "is-success" : "is-warning"}>{snapshot.assertion.reason}</p>}
        {hint && <p className="walkthrough-hint">{hint}</p>}
        <footer>
          <button type="button" onClick={onPrevious} disabled={snapshot.stepIndex <= 0} title="Previous walkthrough step">←</button>
          <button type="button" onClick={paused ? onResume : onPause} title={paused ? "Resume walkthrough" : "Pause walkthrough"}>{paused ? "▶" : "Ⅱ"}</button>
          {step.advance.mode === "assertion" && waiting
            ? <button type="button" className="primary" onClick={onCheck}>Check</button>
            : <button type="button" className="primary" onClick={onNext} disabled={!waiting && step.advance.mode !== "continue"}>Continue</button>}
          {step.hint && <button type="button" onClick={() => setHint(onHint?.() || step.hint)}>Hint</button>}
          {step.allowSkip && waiting && <button type="button" onClick={onSkip}>Skip</button>}
          <button type="button" onClick={onStop}>Stop</button>
        </footer>
      </section>
    </div>,
    portalTarget,
  );
}
