export const SHADER_STATUS_EVENT = "drawerator:shader-status";

const activeShaderStatuses = new Map();

export const getShaderStatuses = () => Object.fromEntries(activeShaderStatuses);

export const publishShaderStatus = detail => {
  const elementId = String(detail?.elementId || "");
  if (!elementId) return;
  if (detail.kind === "error" && detail.message) {
    activeShaderStatuses.set(elementId, { ...detail, elementId, message: String(detail.message) });
  } else {
    activeShaderStatuses.delete(elementId);
  }
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(SHADER_STATUS_EVENT, { detail: { ...detail, elementId } }));
};
