const numberText = value => Number.isFinite(Number(value)) ? Number(value).toFixed(2) : "—";

const brushDetail = status => {
  const source = status?.source?.available ? "source live" : "source waiting";
  const gate = status?.gate?.open ? "gate open" : "gate closed";
  const xy = status?.point ? `xy ${numberText(status.point.x)}, ${numberText(status.point.y)}` : "xy —";
  const pressure = `pressure ${numberText(status?.pressure?.value)}`;
  return `${source} · ${gate} · ${xy} · ${pressure}`;
};

export const buildConsoleLiveStatus = ({ channels = [], channelStatus = {}, inputStatuses = {} } = {}) => {
  const brushRows = channels
    .filter(channel => !channel.nativePointer)
    .map(channel => {
      const status = channelStatus[channel.id];
      const isLive = Boolean(status?.source?.available);
      const gateOpen = Boolean(status?.gate?.open);
      return {
        id: `brush:${channel.id}`,
        category: "brush",
        label: channel.name,
        state: !channel.enabled ? "disarmed" : !isLive ? "waiting" : gateOpen ? "open" : "closed",
        tone: !channel.enabled ? "muted" : !isLive ? "warning" : gateOpen ? "success" : "neutral",
        detail: brushDetail(status),
        logSignature: `${channel.enabled}:${isLive}:${gateOpen}`,
      };
    });
  const inputRows = Object.entries(inputStatuses)
    .filter(([, status]) => status?.message)
    .map(([id, status]) => ({
      id: `input:${id}`,
      category: "input",
      label: id,
      state: status.kind || "info",
      tone: status.kind === "error" ? "error" : status.kind === "success" ? "success" : "neutral",
      detail: String(status.message),
      logSignature: `${status.kind || "info"}:${status.message}`,
    }));
  return [...brushRows, ...inputRows];
};

export const changedConsoleStatusRows = (previous = new Map(), rows = []) => rows.filter(row => previous.get(row.id) !== row.logSignature);
