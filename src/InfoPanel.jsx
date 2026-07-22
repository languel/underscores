const DEFAULT_INFO_VIEW = Object.freeze({
  title: "Info",
  body: "Hover or focus a control to see what it does. This view can be docked on either side, docked at the bottom, or kept as a floating reference.",
});

export default function InfoPanel({ info = DEFAULT_INFO_VIEW }) {
  return (
    <div className="info-panel" aria-live="polite">
      <div className="info-panel-title">{info.title || DEFAULT_INFO_VIEW.title}</div>
      <div className="info-panel-body">{info.body || DEFAULT_INFO_VIEW.body}</div>
    </div>
  );
}
