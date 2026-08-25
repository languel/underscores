// Adapted from Excalidraw v0.17.6's MIT-licensed collaboration reconciler.
// Kept isolated so upgrading to a package export is a one-module replacement.
export const PRECEDING_ELEMENT_KEY = "__precedingElement__";

const arrayToMapWithIndex = elements => new Map((elements || []).map((element, index) => [element.id, [element, index]]));

const shouldDiscardRemoteElement = (appState, local, remote) => Boolean(local && (
  local.id === appState?.editingElement?.id
  || local.id === appState?.resizingElement?.id
  || local.id === appState?.draggingElement?.id
  || local.id === appState?.newElement?.id
  || local.id === appState?.multiElement?.id
  || Number(local.version || 0) > Number(remote.version || 0)
  || (
    Number(local.version || 0) === Number(remote.version || 0)
    && Number(local.versionNonce || 0) < Number(remote.versionNonce || 0)
  )
));

export const addPrecedingElementMarkers = elements => (elements || []).map((element, index) => ({
  ...structuredClone(element),
  [PRECEDING_ELEMENT_KEY]: index === 0 ? "^" : elements[index - 1].id,
}));

export const reconcileCollaborationElements = (localElements = [], remoteElements = [], appState = {}) => {
  const localData = arrayToMapWithIndex(localElements);
  const reconciled = localElements.slice();
  const duplicates = new WeakMap();
  let cursor = 0;
  let offset = 0;

  remoteElements.forEach((source, remoteIndex) => {
    const remote = structuredClone(source);
    const local = localData.get(remote.id);
    if (shouldDiscardRemoteElement(appState, local?.[0], remote)) return;
    if (local) duplicates.set(local[0], true);
    const parent = remote[PRECEDING_ELEMENT_KEY] || remoteElements[remoteIndex - 1]?.id || null;
    delete remote[PRECEDING_ELEMENT_KEY];

    if (parent != null) {
      if (parent === "^") {
        offset += 1;
        if (cursor === 0) {
          reconciled.unshift(remote);
          localData.set(remote.id, [remote, cursor - offset]);
        } else {
          reconciled.splice(cursor + 1, 0, remote);
          localData.set(remote.id, [remote, cursor + 1 - offset]);
          cursor += 1;
        }
      } else {
        let index = localData.has(parent) ? localData.get(parent)[1] : null;
        if (index != null) index += offset;
        if (index != null && index >= cursor) {
          reconciled.splice(index + 1, 0, remote);
          offset += 1;
          localData.set(remote.id, [remote, index + 1 - offset]);
          cursor = index + 1;
        } else if (index != null) {
          reconciled.splice(cursor + 1, 0, remote);
          offset += 1;
          localData.set(remote.id, [remote, cursor + 1 - offset]);
          cursor += 1;
        } else {
          reconciled.push(remote);
          localData.set(remote.id, [remote, reconciled.length - 1 - offset]);
        }
      }
    } else if (local) {
      reconciled[local[1]] = remote;
      localData.set(remote.id, [remote, local[1]]);
    } else {
      reconciled.push(remote);
      localData.set(remote.id, [remote, reconciled.length - 1 - offset]);
    }
  });

  return reconciled.filter(element => !duplicates.has(element));
};
