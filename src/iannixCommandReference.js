/**
 * The Drawerator-supported IanniX command vocabulary.  This is deliberately
 * separate from the command executor: it feeds completions and the in-app
 * reference, while the runtime remains the authority for execution.
 */
export const IANNIX_COMMAND_REFERENCE = Object.freeze([
  {
    command: "add",
    category: "Score objects",
    syntax: "add <curve|cursor|trigger> <id>",
    description: "Create a named score object and make it current.",
    example: "add curve orbit",
  },
  {
    command: "clear",
    category: "Score objects",
    syntax: "clear",
    description: "Remove every score object and clear the current target.",
    example: "clear",
  },
  {
    command: "setcurve",
    category: "Score objects",
    syntax: "setCurve <cursor|trigger> <curve|lastCurve>",
    description: "Attach a cursor or trigger to a curve support.",
    example: "setCurve current orbit",
  },
  {
    command: "setgroup",
    category: "Score objects",
    syntax: "setGroup <target> <group>",
    description: "Assign an object to a group; group colours apply to its members.",
    example: "setGroup current strings",
  },
  {
    command: "setlabel",
    category: "Score objects",
    syntax: "setLabel <target> <label...>",
    description: "Set the object’s readable label.",
    example: "setLabel current First orbit",
  },
  {
    command: "setname",
    category: "Score objects",
    syntax: "setName <target> <label...>",
    description: "Alias for setLabel in the Drawerator score runtime.",
    example: "setName current First orbit",
  },
  {
    command: "setactive",
    category: "Score objects",
    syntax: "setActive <target> <0|1>",
    description: "Make an object inactive or active.",
    example: "setActive current 1",
  },
  {
    command: "settriggeroff",
    category: "Score objects",
    syntax: "setTriggerOff <target> <0|1>",
    description: "Suppress or re-enable a trigger’s output.",
    example: "setTriggerOff current 0",
  },
  {
    command: "setpointat",
    category: "Curve geometry",
    syntax: "setPointAt <target> <index> <x> <y> [z] [c1x c1y c2x c2y]",
    description: "Set one curve anchor, optionally with two cubic control handles.",
    example: "setPointAt current 1 80 20 20 0 60 40",
  },
  {
    command: "setsmoothpointat",
    category: "Curve geometry",
    syntax: "setSmoothPointAt <target> <index> <x> <y> [z] [c1x c1y c2x c2y]",
    description: "Set an anchor with smooth Bézier continuity enabled.",
    example: "setSmoothPointAt current 1 80 20 20 0 60 40",
  },
  {
    command: "setpointslines",
    category: "Curve geometry",
    syntax: "setPointsLines <target> <closed:0|1> <x y [z]>...",
    description: "Replace curve anchors with a polyline or closed polygon.",
    example: "setPointsLines current 1 0 0 80 0 80 60",
  },
  {
    command: "setpointsellipse",
    category: "Curve geometry",
    syntax: "setPointsEllipse <target> <radiusX> [radiusY]",
    description: "Define a curve as an ellipse around its current position.",
    example: "setPointsEllipse current 120 60",
  },
  {
    command: "setequation",
    category: "Curve geometry",
    syntax: "setEquation <target> <type> <xExpr>, <yExpr>, <zExpr>",
    description: "Generate curve coordinates from three comma-separated expressions.",
    example: "setEquation current cartesian cos(t)*80, sin(t)*40, 0",
  },
  {
    command: "setequationparam",
    category: "Curve geometry",
    syntax: "setEquationParam <target> <name> <value>",
    description: "Set a named value available to the curve equation.",
    example: "setEquationParam current radius 80",
  },
  {
    command: "setequationnbpoints",
    category: "Curve geometry",
    syntax: "setEquationNbPoints <target> <count>",
    description: "Set the sample count used to draw an equation curve.",
    example: "setEquationNbPoints current 240",
  },
  {
    command: "setequationpoints",
    category: "Curve geometry",
    syntax: "setEquationPoints <target> <count>",
    description: "Alias for setEquationNbPoints.",
    example: "setEquationPoints current 240",
  },
  {
    command: "setpos",
    category: "Transform and style",
    syntax: "setPos <target> <x> <y> [z]",
    description: "Set an object’s position in IanniX score coordinates.",
    example: "setPos current 12 -8 0",
  },
  {
    command: "setsize",
    category: "Transform and style",
    syntax: "setSize <target> <size>",
    description: "Set an object’s display size.",
    example: "setSize current 12",
  },
  {
    command: "setwidth",
    category: "Transform and style",
    syntax: "setWidth <target> <width>",
    description: "Set an object’s stroke width.",
    example: "setWidth current 2",
  },
  {
    command: "setcolor",
    category: "Transform and style",
    syntax: "setColor <target|group> <r> <g> <b> [a]",
    description: "Set an RGBA colour on an object or all objects in a group.",
    example: "setColor current 23 105 224 255",
  },
  {
    command: "setcolorhue",
    category: "Transform and style",
    syntax: "setColorHue <target|group> <h> <s> <v> [a]",
    description: "Set an HSVA colour on an object or group.",
    example: "setColorHue strings 210 80 90 255",
  },
  {
    command: "setcoloractive",
    category: "Transform and style",
    syntax: "setColorActive <target> <r> <g> <b> [a]",
    description: "Set the active colour used by the runtime.",
    example: "setColorActive current 255 220 120 255",
  },
  {
    command: "setspeed",
    category: "Cursor and trigger time",
    syntax: "setSpeed <cursor> [absolute|auto|autolock] <value>",
    description: "Set cursor speed, or a duration in auto/autolock modes.",
    example: "setSpeed current absolute 80",
  },
  {
    command: "setpattern",
    category: "Cursor and trigger time",
    syntax: "setPattern <cursor> <easing> <offset> <pass...>",
    description: "Set a cursor traversal pattern; negative passes return along the curve.",
    example: "setPattern current 0 0 1 -1 0",
  },
  {
    command: "setoffset",
    category: "Cursor and trigger time",
    syntax: "setOffset <target> <value...>",
    description: "Set an object’s score-time offset data.",
    example: "setOffset current 0",
  },
  {
    command: "setboundssource",
    category: "Cursor and trigger time",
    syntax: "setBoundsSource <target> <six values>",
    description: "Set the source bounds used by a cursor mapping.",
    example: "setBoundsSource current 0 1 0 1 0 1",
  },
  {
    command: "setboundstarget",
    category: "Cursor and trigger time",
    syntax: "setBoundsTarget <target> <six values>",
    description: "Set the target bounds used by a cursor mapping.",
    example: "setBoundsTarget current -1 1 -1 1 0 1",
  },
  {
    command: "setmessage",
    category: "Cursor and trigger time",
    syntax: "setMessage <target> <message...>",
    description: "Attach an outgoing message string to a cursor or trigger.",
    example: "setMessage current /note 60 0.8",
  },
  {
    command: "center",
    category: "Score viewport",
    syntax: "center <x> <y>",
    description: "Record a score viewport centre action.",
    example: "center 0 0",
  },
  {
    command: "zoom",
    category: "Score viewport",
    syntax: "zoom <value>",
    description: "Record a score viewport zoom action.",
    example: "zoom 1.25",
  },
  {
    command: "rotate",
    category: "Score viewport",
    syntax: "rotate <x> <y> <z> [centerX centerY centerZ]",
    description: "Record a score viewport rotation action.",
    example: "rotate 0 0 0",
  },
]);

export const IANNIX_SUPPORTED_COMMANDS = Object.freeze(
  IANNIX_COMMAND_REFERENCE.map(entry => entry.command),
);

export const getIannixCommandReference = command => {
  const normalized = String(command || "").trim().toLowerCase();
  return IANNIX_COMMAND_REFERENCE.find(entry => entry.command === normalized) || null;
};

export const getIannixCommandAtSourcePosition = (source, position) => {
  const text = String(source || "");
  const cursor = Math.max(0, Math.min(text.length, Number(position) || 0));
  const lineStart = text.lastIndexOf("\n", Math.max(0, cursor - 1)) + 1;
  const lineEnd = text.indexOf("\n", cursor);
  const line = text.slice(lineStart, lineEnd === -1 ? text.length : lineEnd);
  const command = line.match(/\brun\s*\(\s*["'`]\s*([a-zA-Z][\w-]*)?/i)?.[1];
  return getIannixCommandReference(command);
};

export const getIannixCommandCategories = () => {
  const categories = new Map();
  for (const entry of IANNIX_COMMAND_REFERENCE) {
    const commands = categories.get(entry.category) || [];
    commands.push(entry);
    categories.set(entry.category, commands);
  }
  return [...categories.entries()].map(([name, commands]) => ({ name, commands }));
};
