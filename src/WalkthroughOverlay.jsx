import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { renderMarkdownWithMath } from "./livecodePresentation.js";

const EMPTY_POINT = { x: -48, y: -48, visible: false };
const POINTER_OFFSET_Y = 18;

export default function WalkthroughOverlay({
  snapshot,
  resolveTarget,
  onPause,
  onResume,
  onNext,
  onPrevious,
  onCheck,
  onHint,
  onDoIt,
  onSkip,
  onStop,
}) {
  const [point, setPoint] = useState(EMPTY_POINT);
  const [hint, setHint] = useState("");
  const [panelPosition, setPanelPosition] = useState(null);
  const dragRef = useRef(null);
  const footerRef = useRef(null);
  const step = snapshot?.step;
  const active = snapshot && !["idle", "stopped"].includes(snapshot.status);
  const waiting = snapshot?.status === "waiting";
  const paused = snapshot?.status === "paused";
  const completed = snapshot?.status === "completed";
  const isFinalStep = Boolean(step && snapshot?.walkthrough?.steps?.length && snapshot.stepIndex >= snapshot.walkthrough.steps.length - 1);

  useEffect(() => {
    if (!active || !step?.focusTarget) {
      setPoint(EMPTY_POINT);
      return undefined;
    }
    let frame = 0;
    const update = () => {
      const focusedButton = document.activeElement?.closest?.(".walkthrough-narration footer button:not(:disabled)");
      const target = focusedButton
        ? { element: focusedButton }
        : resolveTarget?.(step.focusTarget);
      const rect = target?.rect || target?.element?.getBoundingClientRect?.();
      if (rect) setPoint({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 + POINTER_OFFSET_Y, visible: true });
      frame = requestAnimationFrame(update);
    };
    update();
    return () => cancelAnimationFrame(frame);
  }, [active, resolveTarget, step?.focusTarget]);

  useEffect(() => setHint(""), [step?.id]);

  // Keep the tour usable without a pointer. When a step is ready for the
  // learner, focus its primary action unless focus is already in the app (for
  // example, the command palette or an editor). The glow follows whichever
  // tour button is focused, so the visual guide and keyboard focus agree.
  useEffect(() => {
    if (!active || (!waiting && !completed)) return undefined;
    const frame = window.requestAnimationFrame(() => {
      const footer = footerRef.current;
      if (!footer || footer.contains(document.activeElement)) return;
      const buttons = Array.from(footer.querySelectorAll("button:not(:disabled)"));
      const primary = buttons.find(button => button.classList.contains("primary")) || buttons[0];
      primary?.focus();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [active, completed, step?.id, snapshot?.stepIndex, waiting]);

  const handleFooterKeyDown = event => {
    const footer = footerRef.current;
    if (!footer) return;
    const buttons = Array.from(footer.querySelectorAll("button:not(:disabled)"));
    const current = event.target?.closest?.("button") || document.activeElement;
    const currentIndex = buttons.indexOf(current);
    if (currentIndex < 0 || !buttons.length) return;
    if (["ArrowRight", "ArrowDown", "ArrowLeft", "ArrowUp"].includes(event.key)) {
      const direction = event.key === "ArrowRight" || event.key === "ArrowDown" ? 1 : -1;
      const next = buttons[(currentIndex + direction + buttons.length) % buttons.length];
      event.preventDefault();
      event.stopPropagation();
      next?.focus();
      return;
    }
    if ((event.key === "Enter" || event.code === "Space") && !event.metaKey && !event.ctrlKey && !event.altKey) {
      event.preventDefault();
      event.stopPropagation();
      current.click();
    }
  };

  useEffect(() => () => { dragRef.current = null; }, []);

  const handlePanelPointerDown = event => {
    if (event.button !== 0) return;
    const panel = event.currentTarget.closest(".walkthrough-narration");
    if (!panel) return;
    const rect = panel.getBoundingClientRect();
    dragRef.current = { pointerId: event.pointerId, offsetX: event.clientX - rect.left, offsetY: event.clientY - rect.top };
    event.currentTarget.setPointerCapture?.(event.pointerId);
    event.currentTarget.classList.add("is-dragging");
    event.preventDefault();
  };

  const handlePanelPointerMove = event => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const panel = event.currentTarget.closest(".walkthrough-narration");
    if (!panel) return;
    const margin = 8;
    const maxLeft = Math.max(margin, window.innerWidth - panel.offsetWidth - margin);
    const maxTop = Math.max(margin, window.innerHeight - panel.offsetHeight - margin);
    setPanelPosition({
      left: Math.min(maxLeft, Math.max(margin, event.clientX - drag.offsetX)),
      top: Math.min(maxTop, Math.max(margin, event.clientY - drag.offsetY)),
    });
  };

  const handlePanelPointerUp = event => {
    if (!dragRef.current || dragRef.current.pointerId !== event.pointerId) return;
    event.currentTarget.releasePointerCapture?.(event.pointerId);
    event.currentTarget.classList.remove("is-dragging");
    dragRef.current = null;
  };

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
      <section
        className="walkthrough-narration"
        role="dialog"
        aria-label={`Guided walkthrough: ${step.title}`}
        style={panelPosition ? { left: `${panelPosition.left}px`, top: `${panelPosition.top}px`, bottom: "auto", transform: "none" } : undefined}
      >
        <header
          className="walkthrough-drag-handle"
          onPointerDown={handlePanelPointerDown}
          onPointerMove={handlePanelPointerMove}
          onPointerUp={handlePanelPointerUp}
          onPointerCancel={handlePanelPointerUp}
          title="Drag to reposition this walkthrough"
        >
          <span>{snapshot.walkthrough.title}</span>
          <span>{progress}</span>
        </header>
        {step.showTitle !== false && <h2>{step.title}</h2>}
        {step.narration && <div className="walkthrough-narration-markdown livecode-markdown" dangerouslySetInnerHTML={{ __html: renderMarkdownWithMath(step.narration) }} />}
        {snapshot.assertion && <p className={snapshot.assertion.passed ? "is-success" : "is-warning"}>{snapshot.assertion.reason}</p>}
        {hint && <p className="walkthrough-hint">{hint}</p>}
        <footer ref={footerRef} role="toolbar" aria-label="Walkthrough controls" onKeyDown={handleFooterKeyDown}>
          {completed ? <>
            <span className="walkthrough-complete-label">Walkthrough complete</span>
            <button type="button" className="primary" onClick={onStop} title="Finish the walkthrough and choose whether to keep or restore its results">Done</button>
          </> : <>
            <button type="button" onClick={onPrevious} disabled={snapshot.stepIndex <= 0} title="Previous walkthrough step">←</button>
            <button type="button" onClick={paused ? onResume : onPause} title={paused ? "Resume walkthrough" : "Pause walkthrough"}>{paused ? "▶" : "Ⅱ"}</button>
            {step.advance.mode === "assertion" && waiting
              ? <button type="button" className="primary" onClick={onCheck}>Check</button>
              : <button type="button" className="primary" onClick={onNext} disabled={!waiting && step.advance.mode !== "continue"}>Continue</button>}
            {step.hint && <button type="button" onClick={() => setHint(onHint?.() || step.hint)}>Hint</button>}
            <button
              type="button"
              onClick={onDoIt}
              disabled={!waiting}
              title="Try this step yourself first; Do it lets the walkthrough perform it for you."
            >
              Do it
            </button>
            {step.allowSkip && waiting && <button type="button" onClick={onSkip}>Skip</button>}
            <button type="button" onClick={onStop} title={isFinalStep ? "Finish the walkthrough and choose whether to keep or restore its results" : "Stop walkthrough"}>{isFinalStep ? "Done" : "Stop"}</button>
          </>}
        </footer>
      </section>
    </div>,
    portalTarget,
  );
}
