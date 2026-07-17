import { getElementCenter, getElementCorePaths, normalizeIannixData } from "./iannixEngine.js";

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

const resolveValue = (token, context) => {
  if (Object.prototype.hasOwnProperty.call(context, token)) return Number(context[token]);
  return Number(token);
};

export const IANNIX_MIDI_TEMPLATES = [
  { id: "iannixXY", label: "IanniX XY note" },
  { id: "relativePitch", label: "Cursor-relative pitch" },
  { id: "fixedNote", label: "Fixed note" },
  { id: "cursorCC", label: "Cursor Y → CC" },
  { id: "custom", label: "Custom pattern" },
];

export const getIannixMidiTemplatePattern = (templateId, trigger = {}) => {
  const channel = Math.round(clamp(Number(trigger.midiChannel) || 1, 1, 16));
  const velocity = Math.round(clamp(Number(trigger.midiVelocity) || 100, 0, 127));
  const fixedNote = Math.round(clamp(Number(trigger.midiFixedNote) || 69, 0, 127));
  const controller = Math.round(clamp(Number(trigger.midiController) || 0, 0, 127));
  if (templateId === "relativePitch") {
    return `midi://midi_out/note ${channel} trigger_note ${velocity} trigger_duration`;
  }
  if (templateId === "fixedNote") {
    return `midi://midi_out/note ${channel} ${fixedNote} ${velocity} trigger_duration`;
  }
  if (templateId === "cursorCC") {
    return `midi://midi_out/ccf ${channel} ${controller} cursor_value_y`;
  }
  return `midi://midi_out/notef ${channel} trigger_value_y trigger_value_x trigger_duration`;
};

export const parseIannixMidiPattern = (patterns, context = {}) => {
  const pattern = String(patterns || "")
    .split(",")
    .map(item => item.trim())
    .find(item => item.toLowerCase().startsWith("midi://"));
  if (!pattern) throw new Error("No MIDI pattern found.");

  const [destination, ...tokens] = pattern.split(/\s+/);
  const match = destination.match(/^midi:\/\/([^/]+)(\/(?:note|notef|cc|ccf))$/i);
  if (!match) throw new Error("Supported IanniX MIDI commands are /note, /notef, /cc, and /ccf.");
  const command = match[2].toLowerCase();
  const isControlChange = command === "/cc" || command === "/ccf";
  const argumentCount = isControlChange ? 3 : 4;
  if (tokens.length < argumentCount) {
    throw new Error(isControlChange
      ? "MIDI CC patterns require channel, controller, and value."
      : "MIDI note patterns require channel, note, velocity, and duration.");
  }

  const values = tokens.slice(0, argumentCount).map(token => resolveValue(token, context));
  if (values.some(value => !Number.isFinite(value))) {
    throw new Error("MIDI pattern contains an unresolved value token.");
  }

  const channel = Math.round(clamp(values[0], 1, 16));
  if (isControlChange) {
    const floating = command === "/ccf";
    const controller = Math.round(clamp(values[1], 0, 127));
    const value = Math.round(clamp(floating ? values[2] * 127 : values[2], 0, 127));
    return {
      pattern,
      port: match[1],
      kind: "cc",
      command,
      channel,
      controller,
      value,
      data: [0xb0 + channel - 1, controller, value],
    };
  }
  const floating = command === "/notef";
  // IanniX's floating MIDI commands truncate normalized values when converting
  // to 7-bit MIDI. Rounding shifts many notes and velocities up by one.
  const quantize = value => floating ? Math.trunc(value) : Math.round(value);
  const note = quantize(clamp(floating ? values[1] * 127 : values[1], 0, 127));
  const velocity = quantize(clamp(floating ? values[2] * 127 : values[2], 0, 127));
  const duration = Math.max(0, values[3]);

  return {
    pattern,
    port: match[1],
    kind: "note",
    command,
    channel,
    note,
    velocity,
    duration,
    noteOn: [0x90 + channel - 1, note, velocity],
    noteOff: [0x80 + channel - 1, note, 0],
  };
};

export const sendIannixMidiMessage = (output, message, timestamp = 0) => {
  if (!output?.send) throw new Error("No MIDI output is connected.");
  if (message.kind === "cc") {
    output.send(message.data, timestamp || undefined);
    return;
  }
  output.send(message.noteOn, timestamp || undefined);
  if (message.duration > 0) {
    output.send(message.noteOff, (timestamp || performance.now()) + message.duration * 1000);
  }
};

/**
 * Tracks overlapping notes by output/channel/pitch. A stale note-off from an
 * earlier trigger is held until the final overlapping voice expires, avoiding
 * the short, robotic note fragments produced by independent scheduled offs.
 */
export const createIannixMidiVoiceTracker = ({
  now = () => performance.now(),
  setTimer = (callback, delay) => setTimeout(callback, delay),
  clearTimer = timer => clearTimeout(timer),
} = {}) => {
  const outputIds = new WeakMap();
  const voices = new Map();
  let nextOutputId = 1;

  const getOutputId = output => {
    if (!outputIds.has(output)) outputIds.set(output, nextOutputId++);
    return outputIds.get(output);
  };
  const voiceKey = (output, message) => `${getOutputId(output)}:${message.channel}:${message.note}`;

  const send = (output, message, timestamp = 0) => {
    if (!output?.send) throw new Error("No MIDI output is connected.");
    if (message.kind === "cc") {
      output.send(message.data, timestamp || undefined);
      return;
    }

    const sentAt = timestamp || now();
    output.send(message.noteOn, timestamp || undefined);
    if (!(message.duration > 0)) return;

    const key = voiceKey(output, message);
    const voice = voices.get(key) || {
      count: 0,
      output,
      noteOff: message.noteOff,
      timers: new Set(),
    };
    voice.count += 1;
    voices.set(key, voice);

    let timer = null;
    timer = setTimer(() => {
      const current = voices.get(key);
      if (!current) return;
      current.timers.delete(timer);
      current.count -= 1;
      if (current.count > 0) return;
      try {
        current.output.send(current.noteOff);
      } finally {
        voices.delete(key);
      }
    }, Math.max(0, sentAt + message.duration * 1000 - now()));
    voice.timers.add(timer);
  };

  const panic = () => {
    voices.forEach(voice => {
      voice.timers.forEach(clearTimer);
      try {
        voice.output.send(voice.noteOff);
      } catch {
        // A disconnected output should not prevent the remaining voices from
        // being cleared locally.
      }
    });
    voices.clear();
  };

  return {
    send,
    panic,
    getActiveVoiceCount: () => voices.size,
  };
};

export const describeIannixMidiMessage = (message) => message?.kind === "cc"
  ? `ch ${message.channel} · CC ${message.controller} · value ${message.value}`
  : `ch ${message.channel} · note ${message.note} · velocity ${message.velocity} · ${message.duration}s`;

const mapPointToBounds = (point, bounds) => ({
  x: (point[0] - bounds.minX) / Math.max(0.000001, bounds.maxX - bounds.minX),
  y: 1 - ((point[1] - bounds.minY) / Math.max(0.000001, bounds.maxY - bounds.minY)),
});

const closestPointOnSegment = (point, start, end) => {
  const dx = end[0] - start[0];
  const dy = end[1] - start[1];
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared <= 0.000001) return start;
  const t = clamp(((point[0] - start[0]) * dx + (point[1] - start[1]) * dy) / lengthSquared, 0, 1);
  return [start[0] + t * dx, start[1] + t * dy];
};

const closestPointOnPaths = (point, paths) => {
  let closest = point;
  let closestDistance = Infinity;
  paths.forEach(path => {
    for (let index = 1; index < path.length; index++) {
      const candidate = closestPointOnSegment(point, path[index - 1], path[index]);
      const distance = (candidate[0] - point[0]) ** 2 + (candidate[1] - point[1]) ** 2;
      if (distance < closestDistance) {
        closest = candidate;
        closestDistance = distance;
      }
    }
  });
  return closest;
};

export const getIannixTriggerMidiContext = (cursor, triggerData, triggerElement = null) => {
  const points = cursor?.curveElement ? getElementCorePaths(cursor.curveElement)[0] : [];
  const cursorData = cursor?.data || normalizeIannixData(cursor?.element?.customData?.iannix);
  // IanniX maps trigger_value_* from the triggered trigger's position through
  // the colliding cursor's source/target bounds. The cursor position remains a
  // fallback for older callers that do not provide the trigger element.
  const position = triggerElement
    ? getElementCenter(triggerElement)
    : (cursor?.transform?.position || [0, 0]);
  const xs = points.map(point => point[0]);
  const ys = points.map(point => point[1]);
  // IanniX's default bounds-source mode expands the curve bounds by the
  // cursor's dimensions. This avoids immediately clamping edge hits to 0/1.
  const paddingX = Math.max(0, Number(cursor?.element?.width) || 0) / 2;
  const paddingY = Math.max(0, Number(cursor?.element?.height) || 0) / 2;
  const derivedBounds = {
    minX: (xs.length ? Math.min(...xs) : position[0]) - paddingX,
    maxX: (xs.length ? Math.max(...xs) : position[0] + 1) + paddingX,
    minY: (ys.length ? Math.min(...ys) : position[1]) - paddingY,
    maxY: (ys.length ? Math.max(...ys) : position[1] + 1) + paddingY,
  };
  const source = cursorData.cursor.boundsSource;
  const target = cursorData.cursor.boundsTarget;
  const importData = cursor?.element?.customData?.iannixImport;
  const importScale = Number(importData?.scale);
  const importAnchor = importData?.anchor;
  const hasExplicitSource = Array.isArray(source)
    && source.length >= 4
    && Number.isFinite(importScale)
    && importScale !== 0
    && Array.isArray(importAnchor)
    && importAnchor.length >= 2;
  // Imported IanniX bounds are expressed in score coordinates (Y up), while
  // the Excalidraw host uses canvas coordinates (Y down).
  const bounds = hasExplicitSource ? {
    minX: Number(importAnchor[0]) + Number(source[0]) * importScale,
    maxX: Number(importAnchor[0]) + Number(source[1]) * importScale,
    minY: Number(importAnchor[1]) - Number(source[3]) * importScale,
    maxY: Number(importAnchor[1]) - Number(source[2]) * importScale,
  } : derivedBounds;
  const mapThroughCursorBounds = point => {
    const normalized = mapPointToBounds(point, bounds);
    if (!Array.isArray(target) || target.length < 4) return normalized;
    return {
      x: Number(target[0]) + normalized.x * (Number(target[1]) - Number(target[0])),
      y: Number(target[2]) + normalized.y * (Number(target[3]) - Number(target[2])),
    };
  };
  const triggerValue = mapThroughCursorBounds(position);
  const cursorPosition = cursor?.transform?.position || position;
  const cursorValue = mapThroughCursorBounds(cursorPosition);

  const cursorPaths = cursor?.paths || [];
  const hitPoint = closestPointOnPaths(position, cursorPaths);
  const center = cursorPosition;
  const primaryPath = cursorPaths.find(path => path.length > 1) || [];
  const axisStart = primaryPath[0] || center;
  const axisEnd = primaryPath[primaryPath.length - 1] || center;
  const axisDx = axisEnd[0] - axisStart[0];
  const axisDy = axisEnd[1] - axisStart[1];
  const axisLength = Math.hypot(axisDx, axisDy);
  const axisX = axisLength > 0.000001 ? axisDx / axisLength : 0;
  const axisY = axisLength > 0.000001 ? axisDy / axisLength : -1;
  const halfSpan = Math.max(0.000001,
    Math.abs((axisStart[0] - center[0]) * axisX + (axisStart[1] - center[1]) * axisY),
    Math.abs((axisEnd[0] - center[0]) * axisX + (axisEnd[1] - center[1]) * axisY),
  );
  const relativeOffset = clamp(
    ((hitPoint[0] - center[0]) * axisX + (hitPoint[1] - center[1]) * axisY) / halfSpan,
    -1,
    1,
  );

  const curveData = normalizeIannixData(cursor?.curveElement?.customData?.iannix);
  const sourceData = triggerData?.trigger?.midiBaseSource === "curve" ? curveData : cursorData;
  const baseNote = sourceData.midi.baseNote;
  const pitchRange = sourceData.midi.pitchRangeOctaves * 12;
  const triggerNote = Math.round(clamp(baseNote + relativeOffset * pitchRange, 0, 127));
  return {
    trigger_value_x: triggerValue.x,
    trigger_value_y: triggerValue.y,
    trigger_value_z: 0,
    trigger_value: 127,
    trigger_duration: triggerData?.trigger?.duration ?? 0.35,
    trigger_offset: relativeOffset,
    trigger_value_relative: (relativeOffset + 1) / 2,
    trigger_note: triggerNote,
    trigger_velocity: triggerData?.trigger?.midiVelocity ?? sourceData.midi.velocity,
    cursor_value_x: cursorValue.x,
    cursor_value_y: cursorValue.y,
    cursor_value_z: 0,
    midi_channel: triggerData?.trigger?.midiChannel ?? 1,
    midi_controller: triggerData?.trigger?.midiController ?? 0,
    midi_base_note: baseNote,
  };
};

const pointToSegmentDistanceSquared = (point, start, end) => {
  const dx = end[0] - start[0];
  const dy = end[1] - start[1];
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared <= 0.000001) {
    return (point[0] - start[0]) ** 2 + (point[1] - start[1]) ** 2;
  }
  const t = clamp(((point[0] - start[0]) * dx + (point[1] - start[1]) * dy) / lengthSquared, 0, 1);
  const x = start[0] + t * dx;
  const y = start[1] + t * dy;
  return (point[0] - x) ** 2 + (point[1] - y) ** 2;
};

export const selectIannixTriggerCursor = (cursors, triggerElement, preferredCursorId = null) => {
  if (!triggerElement || !cursors?.length) return null;
  const preferred = preferredCursorId
    ? cursors.find(cursor => cursor.element.id === preferredCursorId)
    : null;
  if (preferred) return preferred;
  const center = getElementCenter(triggerElement);
  return cursors.reduce((best, cursor) => {
    const paths = getElementCorePaths(cursor.curveElement);
    let distance = Infinity;
    paths.forEach(path => {
      if (path.length === 1) {
        distance = Math.min(distance, pointToSegmentDistanceSquared(center, path[0], path[0]));
      }
      for (let index = 1; index < path.length; index++) {
        distance = Math.min(distance, pointToSegmentDistanceSquared(center, path[index - 1], path[index]));
      }
    });
    return !best || distance < best.distance ? { cursor, distance } : best;
  }, null)?.cursor || null;
};
