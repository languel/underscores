const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

const parsePercent = value => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? clamp(numeric, 0, 100) : null;
};

const parseNumber = value => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
};

const parseBoolean = value => {
  if (/^(?:on|true|yes)$/i.test(value)) return true;
  if (/^(?:off|false|no)$/i.test(value)) return false;
  return null;
};

const BLEND_MODES = new Set([
  "normal", "multiply", "screen", "overlay", "darken", "lighten",
  "color-dodge", "color-burn", "hard-light", "soft-light", "difference",
  "exclusion", "hue", "saturation", "color", "luminosity",
]);

const NODE_KIND_ALIASES = Object.freeze({
  strudel: "strudel",
  p5: "p5",
  play: "playcore",
  playcore: "playcore",
  markdown: "markdown",
  md: "markdown",
  latex: "latex",
  tex: "latex",
  html: "html",
  orca: "orca",
  shader: "shader",
  glsl: "shader",
});

const parseToggle = value => parseBoolean(value);

const parseNodeSetting = text => {
  const kind = text.match(/^(?:node\s+)?(?:set\s+)?kind\s+([a-z0-9-]+)$/i);
  if (kind && NODE_KIND_ALIASES[kind[1].toLowerCase()]) {
    return { kind: "nodeSetting", setting: "kind", value: NODE_KIND_ALIASES[kind[1].toLowerCase()] };
  }

  const view = text.match(/^(?:node\s+)?(?:set\s+)?view\s+(output|preview|code|source|split|overlay)$/i);
  if (view) return { kind: "nodeSetting", setting: "view", value: view[1].toLowerCase() === "output" ? "preview" : view[1].toLowerCase() === "overlay" ? "code" : view[1].toLowerCase() };

  const mode = text.match(/^(?:node\s+)?(?:set\s+)?(?:background|bg)\s+(auto|transparent|theme|solid)$/i);
  if (mode) return { kind: "nodeSetting", setting: "backgroundMode", value: mode[1].toLowerCase() };

  const persistence = text.match(/^(?:node\s+)?(?:set\s+)?(?:persistence|frame\s+reset)\s+(auto|clear|accumulate)$/i);
  if (persistence) return { kind: "nodeSetting", setting: "persistence", value: persistence[1].toLowerCase() };

  const layer = text.match(/^(?:node\s+)?(?:set\s+)?layer\s+(above|overlay|below|underlay)$/i);
  if (layer) return { kind: "nodeSetting", setting: "compositeMode", value: /^(?:below|underlay)$/i.test(layer[1]) ? "underlay" : "overlay" };

  const source = text.match(/^(?:node\s+)?(?:set\s+)?(?:source|shader\s+mode)\s+(standard|glsl|minimal|twigl|shadertoy)$/i);
  if (source) return { kind: "nodeSetting", setting: "shaderDialect", value: /^(?:minimal|twigl|shadertoy)$/i.test(source[1]) ? "shadertoy" : "standard" };

  const p5Version = text.match(/^(?:node\s+)?(?:set\s+)?p5(?:\s+version)?\s+(1|2)(?:\.\d+)?$/i);
  if (p5Version) return { kind: "nodeSetting", setting: "p5Version", value: p5Version[1] };

  const percent = text.match(/^(?:node\s+)?(?:set\s+)?(?:code\s+opacity|node\s+opacity|composite\s+opacity)\s+(-?(?:\d+(?:\.\d*)?|\.\d+))\s*%?$/i);
  if (percent) {
    const value = parsePercent(percent[1]);
    if (value === null) return null;
    return { kind: "nodeSetting", setting: /composite\s+opacity/i.test(percent[0]) ? "compositeOpacity" : /code\s+opacity/i.test(percent[0]) ? "codeOverlayOpacity" : "compositeOpacity", value: value / 100 };
  }

  const numeric = text.match(/^(?:node\s+)?(?:set\s+)?(size|font\s+size|line|line\s+height|weight|track|letter\s+spacing|grid\s+width|grid\s+height)\s+(-?(?:\d+(?:\.\d*)?|\.\d+))$/i);
  if (numeric) {
    const aliases = {
      size: "fontSize", "font size": "fontSize", line: "lineHeight", "line height": "lineHeight",
      weight: "fontWeight", track: "letterSpacing", "letter spacing": "letterSpacing",
      "grid width": "orcaGridWidth", "grid height": "orcaGridHeight",
    };
    return { kind: "nodeSetting", setting: aliases[numeric[1].toLowerCase()], value: parseNumber(numeric[2]) };
  }

  const font = text.match(/^(?:node\s+)?(?:set\s+)?font\s+([a-z0-9-]+)$/i);
  if (font) {
    const value = font[1].toLowerCase();
    return { kind: "nodeSetting", setting: "font", value: value === "inter" ? "sans" : value === "fira" || value === "fira-mono" ? "mono" : value };
  }

  const enumSetting = text.match(/^(?:node\s+)?(?:set\s+)?(spacing|emitter|emitters|orca\s+density)\s+(compact|spacious|scene|debug)$/i);
  if (enumSetting) {
    const name = enumSetting[1].toLowerCase();
    const value = enumSetting[2].toLowerCase();
    if ((name === "spacing" || name === "orca density") && !["compact", "spacious"].includes(value)) return null;
    if ((name === "emitter" || name === "emitters") && !["scene", "debug"].includes(value)) return null;
    return { kind: "nodeSetting", setting: name.startsWith("emitter") ? "emitterSource" : "orcaDensity", value: enumSetting[2].toLowerCase() };
  }

  const boolean = text.match(/^(?:node\s+)?(?:set\s+)?(last\s+frame|canvas\s+tab|chrome|lines|line\s+numbers|gutter|glyphs|glyphs\s+only|overlay\s+glyphs|ligatures|transport|full\s+sync|visuals|frame\s+visuals|fit|fit\s+frame|guide|grid\s+guide|emission|scene\s+interaction|enabled)\s+(on|off|true|false|yes|no)$/i);
  if (boolean) {
    const value = parseToggle(boolean[2]);
    if (value === null) return null;
    const aliases = {
      "last frame": "keepLastFrame", "canvas tab": "showChrome", chrome: "showChrome",
      lines: "showLineNumbers", "line numbers": "showLineNumbers", gutter: "showFoldGutter",
      glyphs: "glyphOnlyOverlay", "glyphs only": "glyphOnlyOverlay", "overlay glyphs": "glyphOnlyOverlay",
      ligatures: "ligatures", transport: "syncTransport", "full sync": "syncTransport",
      visuals: "frameVisuals", "frame visuals": "frameVisuals", fit: "orcaGridFit", "fit frame": "orcaGridFit",
      guide: "orcaGridGuide", "grid guide": "orcaGridGuide", emission: "sceneInteraction", "scene interaction": "sceneInteraction",
      enabled: "enabled",
    };
    return { kind: "nodeSetting", setting: aliases[boolean[1].toLowerCase()], value };
  }

  const example = text.match(/^(?:node\s+)?(?:set\s+)?example\s+(.+)$/i);
  if (example) return { kind: "nodeSetting", setting: "example", value: example[1].trim().toLowerCase() };

  const name = text.match(/^(?:node\s+)?(?:set\s+)?name\s+(.+)$/i);
  if (name) return { kind: "nodeSetting", setting: "name", value: name[1].trim() };
  return null;
};

const parseObjectPatch = text => {
  const numeric = text.match(/^(?:set\s+)?(x|y|width|height|angle|roughness)\s+(-?(?:\d+(?:\.\d*)?|\.\d+))$/i);
  if (numeric) {
    const value = parseNumber(numeric[2]);
    return value === null ? null : { kind: "objectPatch", property: numeric[1].toLowerCase(), patch: { [numeric[1].toLowerCase()]: value } };
  }

  const strokeWidth = text.match(/^(?:set\s+)?stroke(?:\s*[-_ ]*\s*width)\s+(-?(?:\d+(?:\.\d*)?|\.\d+))$/i);
  if (strokeWidth) {
    const value = parseNumber(strokeWidth[1]);
    return value === null ? null : { kind: "objectPatch", property: "strokeWidth", patch: { strokeWidth: Math.max(0, value) } };
  }

  const locked = text.match(/^(?:set\s+)?(?:lock(?:ed)?|locked)\s+(on|off|true|false|yes|no)$/i);
  if (locked) {
    const value = parseBoolean(locked[1]);
    return value === null ? null : { kind: "objectPatch", property: "locked", patch: { locked: value } };
  }
  if (/^(?:unlock)$/i.test(text)) return { kind: "objectPatch", property: "locked", patch: { locked: false } };

  const style = text.match(/^(?:set\s+)?(fill|stroke)\s+style\s+(solid|hachure|cross-hatch|dashed|dotted)$/i);
  if (style) {
    const key = style[1].toLowerCase() === "fill" ? "fillStyle" : "strokeStyle";
    return { kind: "objectPatch", property: key, patch: { [key]: style[2].toLowerCase() } };
  }

  const color = text.match(/^(?:set\s+)?(background\s+color|fill\s+color|stroke|fill|background|color)\s+(.+)$/i);
  if (color) {
    const property = color[1].toLowerCase().replace(/\s+/g, "") === "stroke" || color[1].toLowerCase() === "color"
      ? "strokeColor"
      : "backgroundColor";
    return { kind: "objectPatch", property, patch: { [property]: color[2].trim() } };
  }

  return null;
};

/**
 * Parse the small, deterministic command vocabulary used by the presentation
 * command field. Anything outside this deliberately conservative set is sent
 * to the assistant, where it can use the selected object's full context.
 */
export const parseContextCommand = input => {
  const text = String(input || "").trim().replace(/\s+/g, " ");
  if (!text) return null;

  const nodeSetting = parseNodeSetting(text);
  if (nodeSetting) return nodeSetting;

  const opacity = text.match(/^(?:set\s+)?opacity\s+(-?(?:\d+(?:\.\d*)?|\.\d+))\s*%?$/i);
  if (opacity) {
    const value = parsePercent(opacity[1]);
    return value === null ? null : { kind: "opacity", value };
  }

  const volume = text.match(/^(?:set\s+)?volume\s+(-?(?:\d+(?:\.\d*)?|\.\d+))\s*%?$/i);
  if (volume) {
    const value = parsePercent(volume[1]);
    return value === null ? null : { kind: "volume", value: value / 100 };
  }

  const clock = text.match(/^(?:set\s+)?clock\s+(free|linked|toggle)$/i);
  if (clock) return { kind: "clock", value: clock[1].toLowerCase() };

  const blend = text.match(/^(?:set\s+)?blend\s+([a-z-]+)$/i);
  if (blend && BLEND_MODES.has(blend[1].toLowerCase())) return { kind: "blend", value: blend[1].toLowerCase() };

  if (/^(?:toggle\s+)?loop$/i.test(text) || /^loop\s+toggle$/i.test(text)) {
    return { kind: "loop", value: "toggle" };
  }
  const loop = text.match(/^loop\s+(on|off|true|false)$/i);
  if (loop) return { kind: "loop", value: /^(?:on|true)$/i.test(loop[1]) };

  if (/^(?:play|start|resume)$/i.test(text)) return { kind: "play" };
  if (/^(?:pause|stop)$/i.test(text)) return { kind: "pause" };
  if (/^(?:mute)$/i.test(text)) return { kind: "mute", value: true };
  if (/^(?:unmute|sound\s+on)$/i.test(text)) return { kind: "mute", value: false };

  const transportLoop = text.match(/^transport\s+loop\s+(.+)$/i);
  if (transportLoop) return { kind: "transportLoop", duration: transportLoop[1].trim() };

  return parseObjectPatch(text);
};
