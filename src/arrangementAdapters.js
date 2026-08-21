const noop = () => {};

export const ARRANGEMENT_ADAPTER_KINDS = Object.freeze({
  STATIC: "static",
  GESTURE: "gesture",
  MEDIA: "media",
  LIVECODE: "livecode",
});

export const getArrangementAdapterKind = element => {
  const data = element?.customData || {};
  if (data.underscoresGesture) return ARRANGEMENT_ADAPTER_KINDS.GESTURE;
  if (data.underscoresMediaStream) return ARRANGEMENT_ADAPTER_KINDS.MEDIA;
  if (data.underscoresLivecode) return ARRANGEMENT_ADAPTER_KINDS.LIVECODE;
  return ARRANGEMENT_ADAPTER_KINDS.STATIC;
};

export const createLifecycleAdapter = (value = {}) => Object.freeze({
  getIntrinsicDuration: typeof value.getIntrinsicDuration === "function" ? value.getIntrinsicDuration : () => 0,
  activate: typeof value.activate === "function" ? value.activate : noop,
  seek: typeof value.seek === "function" ? value.seek : noop,
  deactivate: typeof value.deactivate === "function" ? value.deactivate : noop,
});

export class ArrangementAdapterRegistry {
  constructor(adapters = {}) {
    this.adapters = new Map();
    Object.entries(adapters).forEach(([kind, adapter]) => this.register(kind, adapter));
  }

  register(kind, adapter) {
    this.adapters.set(String(kind), createLifecycleAdapter(adapter));
    return () => this.adapters.delete(String(kind));
  }

  get(kind) {
    return this.adapters.get(String(kind)) || createLifecycleAdapter();
  }
}

// Drives adapter transitions without touching authored scene objects. Callers
// retain the last runtime state outside scene JSON and may scrub at any rate.
export const applyArrangementRuntimeState = (adapter, element, previous, next, context = {}) => {
  const lifecycle = createLifecycleAdapter(adapter);
  const wasActive = previous?.active === true;
  const isActive = next?.active === true;
  if (!wasActive && isActive) lifecycle.activate(element, next, context);
  if (isActive) lifecycle.seek(element, next.state?.localTime || 0, next, context);
  if (wasActive && !isActive) lifecycle.deactivate(element, previous, context);
  return next;
};
