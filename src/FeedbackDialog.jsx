import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

let nextDialogId = 0;

const createRequest = (kind, message, options = {}) => ({
  id: `feedback-dialog-${++nextDialogId}`,
  kind,
  title: options.title || (kind === "alert" ? "Underscores" : kind === "prompt" ? "Enter a value" : "Confirm action"),
  message: String(message || ""),
  defaultValue: options.defaultValue == null ? "" : String(options.defaultValue),
  placeholder: options.placeholder || "",
  confirmLabel: options.confirmLabel || (kind === "alert" ? "OK" : "Continue"),
  cancelLabel: options.cancelLabel || "Cancel",
});

/**
 * Promise-backed, themed replacements for the browser's alert/confirm/prompt.
 * Requests are queued so a walkthrough or command cannot stack multiple
 * native-looking dialogs on top of one another.
 */
export const useFeedbackDialog = () => {
  const [dialog, setDialog] = useState(null);
  const activeRef = useRef(null);
  const queueRef = useRef([]);

  const enqueue = useCallback(request => new Promise(resolve => {
    queueRef.current.push({ ...request, resolve });
    if (!activeRef.current) {
      const next = queueRef.current.shift();
      activeRef.current = next;
      setDialog(next);
    }
  }), []);

  const requestAlert = useCallback((message, options) => enqueue(createRequest("alert", message, options)), [enqueue]);
  const requestConfirm = useCallback((message, options) => enqueue(createRequest("confirm", message, options)), [enqueue]);
  const requestPrompt = useCallback((message, defaultValue = "", options = {}) => enqueue(createRequest("prompt", message, { ...options, defaultValue })), [enqueue]);

  const resolveFeedbackDialog = useCallback(value => {
    const active = activeRef.current;
    if (!active) return;
    activeRef.current = null;
    active.resolve(value);
    const next = queueRef.current.shift() || null;
    activeRef.current = next;
    setDialog(next);
  }, []);

  useEffect(() => () => {
    activeRef.current?.resolve(null);
    queueRef.current.splice(0).forEach(request => request.resolve(null));
    activeRef.current = null;
  }, []);

  return { dialog, requestAlert, requestConfirm, requestPrompt, resolveFeedbackDialog };
};

export default function FeedbackDialog({ dialog, onResolve }) {
  const [inputValue, setInputValue] = useState("");
  const inputRef = useRef(null);
  const confirmRef = useRef(null);

  useEffect(() => {
    if (!dialog) return;
    setInputValue(dialog.defaultValue || "");
    window.requestAnimationFrame(() => {
      if (dialog.kind === "prompt") inputRef.current?.focus();
      else confirmRef.current?.focus();
    });
  }, [dialog]);

  useEffect(() => {
    if (!dialog) return undefined;
    const onKeyDown = event => {
      if (event.key === "Escape") {
        event.preventDefault();
        onResolve(dialog.kind === "alert" ? undefined : null);
      }
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [dialog, onResolve]);

  if (!dialog || typeof document === "undefined") return null;
  const portalTarget = document.querySelector(".underscores-shell") || document.body;
  const submit = event => {
    event?.preventDefault?.();
    onResolve(dialog.kind === "prompt" ? inputValue : true);
  };

  return createPortal(
    <div className="feedback-dialog-overlay" data-feedback-dialog-kind={dialog.kind}>
      <div className="feedback-dialog-backdrop" aria-hidden="true" />
      <section
        className="feedback-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={`${dialog.id}-title`}
        aria-describedby={`${dialog.id}-message`}
      >
        <header>
          <span className="feedback-dialog-kicker">{dialog.kind === "alert" ? "Notice" : dialog.kind === "prompt" ? "Input" : "Confirm"}</span>
          <span className="feedback-dialog-count">Underscores</span>
        </header>
        <h2 id={`${dialog.id}-title`}>{dialog.title}</h2>
        <p id={`${dialog.id}-message`}>{dialog.message}</p>
        {dialog.kind === "prompt" && (
          <input
            ref={inputRef}
            className="feedback-dialog-input"
            value={inputValue}
            placeholder={dialog.placeholder}
            onChange={event => setInputValue(event.target.value)}
            aria-label={dialog.title}
          />
        )}
        <footer>
          {dialog.kind !== "alert" && <button type="button" onClick={() => onResolve(null)}>{dialog.cancelLabel}</button>}
          <button ref={confirmRef} type="button" className="primary" onClick={submit}>{dialog.confirmLabel}</button>
        </footer>
      </section>
    </div>,
    portalTarget,
  );
}
