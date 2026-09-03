import {
  LIVECODE_WALKTHROUGH_ID,
  ONBOARDING_WALKTHROUGH_ID,
  PHYSICS_WALKTHROUGH_ID,
  TIMELINE_WALKTHROUGH_ID,
} from "./walkthroughCatalog.js";

export const WELCOME_STORAGE_KEY = "underscores_welcome_seen_v1";

// The first-run card is an offer, not a wall: it appears only on an empty
// canvas that the visitor did not arrive at deliberately, and any action —
// including simply starting to draw — retires it for good.
export const WELCOME_TOURS = Object.freeze([
  Object.freeze({ id: ONBOARDING_WALKTHROUGH_ID, label: "Take the tour", summary: "Five minutes: the palette, panels, a p5 sketch, a shader, sound, and physics.", primary: true }),
  Object.freeze({ id: LIVECODE_WALKTHROUGH_ID, label: "Livecode", summary: "Grow one p5 node into a parameterized, transport-linked sketch." }),
  Object.freeze({ id: PHYSICS_WALKTHROUGH_ID, label: "Physics", summary: "Build a world, map its collisions to sound, then add your own drawing." }),
  Object.freeze({ id: TIMELINE_WALKTHROUGH_ID, label: "Timeline", summary: "Transport time, a node's clock, and arrangement clips." }),
]);

export const readWelcomeDismissed = (storage = globalThis.localStorage) => {
  try {
    return storage?.getItem(WELCOME_STORAGE_KEY) === "true";
  } catch {
    // A blocked storage backend simply means the offer is shown again.
    return false;
  }
};

export const writeWelcomeDismissed = (storage = globalThis.localStorage) => {
  try {
    storage?.setItem(WELCOME_STORAGE_KEY, "true");
    return true;
  } catch {
    return false;
  }
};

export const shouldOfferWelcome = ({
  dismissed = false,
  elementCount = 0,
  presentationMode = false,
  sceneReference = "",
  restoredScene = false,
  walkthroughStatus = "idle",
} = {}) => {
  if (dismissed) return false;
  // Presenting, following a ?scene= link, or reopening a saved patch are all
  // deliberate arrivals; a greeting would be in the way.
  if (presentationMode) return false;
  if (String(sceneReference || "").trim()) return false;
  if (restoredScene) return false;
  if (Number(elementCount) > 0) return false;
  return ["idle", "stopped", "completed"].includes(walkthroughStatus);
};
