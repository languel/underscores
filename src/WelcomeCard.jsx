import { WELCOME_TOURS } from "./welcomeExperience.js";

// A quiet first-run offer rendered over an empty canvas. It follows the panel
// surface tokens rather than introducing a splash-screen visual language.
export default function WelcomeCard({ onStartWalkthrough, onOpenDocumentation, onDismiss }) {
  const [primary, ...tours] = WELCOME_TOURS;
  return (
    <div className="underscores-welcome" role="dialog" aria-label="Welcome to Underscores">
      <div className="underscores-welcome-card">
        <header>
          <h2>Underscores</h2>
          <button type="button" className="underscores-welcome-close" onClick={onDismiss} title="Start with a blank canvas" aria-label="Dismiss and start with a blank canvas">×</button>
        </header>
        <p className="underscores-welcome-lede">
          An infinite canvas where drawing, code, sound, motion, physics, and time share one document.
        </p>
        <button
          type="button"
          className="underscores-welcome-primary"
          onClick={() => onStartWalkthrough?.(primary.id)}
          title={primary.summary}
        >
          <strong>{primary.label}</strong>
          <span>{primary.summary}</span>
        </button>
        <div className="underscores-welcome-tours">
          <h3>Or start with one area</h3>
          {tours.map(tour => (
            <button
              key={tour.id}
              type="button"
              onClick={() => onStartWalkthrough?.(tour.id)}
              title={tour.summary}
            >
              <strong>{tour.label}</strong>
              <span>{tour.summary}</span>
            </button>
          ))}
        </div>
        <footer>
          <button type="button" onClick={onOpenDocumentation}>Browse documentation</button>
          <button type="button" onClick={onDismiss}>Start blank</button>
        </footer>
        <p className="underscores-welcome-hint">
          Everything stays on this machine. Reopen this from Documentation → quick tour, or run <code>/welcome</code>.
        </p>
      </div>
    </div>
  );
}
