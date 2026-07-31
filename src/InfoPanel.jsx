import { getIannixCommandCategories } from "./iannixCommandReference.js";

const DEFAULT_INFO_VIEW = Object.freeze({
  title: "Info",
  body: "Hover or focus a control to see what it does. This view can be docked on either side, docked at the bottom, or kept as a floating reference.",
});

const SvgInfoGuide = () => (
  <div className="info-svg-guide">
    <section>
      <h3>Document</h3>
      <pre><code>{`<svg viewBox="0 0 320 180">
  <path d="M20 90 C80 20 240 160 300 90"
        fill="none" stroke="currentColor"/>
</svg>`}</code></pre>
      <p><code>viewBox="x y width height"</code> defines SVG coordinates. Common drawable nodes are <code>path</code>, <code>rect</code>, <code>circle</code>, <code>ellipse</code>, <code>line</code>, <code>polyline</code>, <code>polygon</code>, and <code>text</code>. Use <code>g</code> to group and transform children.</p>
    </section>

    <section>
      <h3>Path data</h3>
      <p>Commands in <code>d</code> are followed by coordinates. Uppercase commands are absolute; lowercase commands are relative.</p>
      <dl className="info-svg-command-list">
        <div><dt><code>M x y</code></dt><dd>Move to; starts a path or subpath.</dd></div>
        <div><dt><code>L x y</code></dt><dd>Straight line. <code>H</code> and <code>V</code> are horizontal and vertical lines.</dd></div>
        <div><dt><code>C x1 y1 x2 y2 x y</code></dt><dd>Cubic curve: two handles, then the endpoint.</dd></div>
        <div><dt><code>S x2 y2 x y</code></dt><dd>Smooth cubic continuing the previous handle.</dd></div>
        <div><dt><code>Q x1 y1 x y</code></dt><dd>Quadratic curve. <code>T</code> continues it smoothly.</dd></div>
        <div><dt><code>A rx ry rot large sweep x y</code></dt><dd>Elliptical arc ending at <code>x y</code>.</dd></div>
        <div><dt><code>Z</code></dt><dd>Close the current subpath.</dd></div>
      </dl>
      <p>Each later <code>M</code> begins another subpath inside the same <code>path</code>.</p>
    </section>

    <section>
      <h3>Edit on canvas</h3>
      <ul>
        <li><strong>Enter path editing:</strong> Command-click a rendered path, or select its path/subpath in Properties or Outliner. Double-clicking a segment enters editing and inserts an anchor at that exact position.</li>
        <li><strong>SVG pen:</strong> Option-click empty space inside an SVG host to start a path. Then click to add straight anchors, or click-drag to set a cubic handle. Press Enter or Escape to finish.</li>
        <li><strong>Select and move:</strong> click an anchor, then drag it. Drag the round handle controls to reshape its curve.</li>
        <li><strong>Insert a point:</strong> double-click a segment at the desired position. <em>Insert point</em> in Properties inserts halfway after the selected anchor.</li>
        <li><strong>Remove a point:</strong> select an anchor and press Delete/Backspace, or use <em>Remove point</em>. A path keeps at least two anchors.</li>
        <li><strong>Break handles:</strong> hold Option while dragging a handle. Connected anchors otherwise preserve curve continuity.</li>
        <li><strong>Shared endpoints:</strong> coincident subpath endpoints move together. Use <em>Detach joint</em> before moving one independently.</li>
      </ul>
    </section>

    <section>
      <h3>Source and canvas</h3>
      <ul>
        <li>Canvas, Properties, Outliner, and source selections follow one another. A selected compound subpath highlights only its corresponding <code>d</code> segment.</li>
        <li>After a 650 ms typing pause, valid source updates the canvas. Transient or invalid edits keep the last valid render.</li>
        <li><code>fill</code>, <code>stroke</code>, <code>stroke-width</code>, transforms, CSS rules, SMIL, and unknown metadata remain part of the canonical SVG source.</li>
      </ul>
    </section>
    <EditorKeys />
  </div>
);

const EditorKeys = () => (
  <section>
    <h3>Code editor keys</h3>
    <ul>
      <li><strong>Tab</strong> or <strong>Enter</strong> accepts the highlighted suggestion.</li>
      <li><strong>↑ / ↓</strong> choose suggestions; <strong>Page Up / Page Down</strong> move by a page.</li>
      <li><strong>⌘/Ctrl A</strong> selects source only. <strong>⌘/Ctrl Z</strong> and <strong>⌘/Ctrl Shift Z</strong> undo and redo source edits only.</li>
      <li><strong>⌘/Ctrl F</strong> opens Find. <strong>Escape</strong> closes completion or Find. <strong>⌘/Ctrl Enter</strong> runs the active script.</li>
      <li>When this editor has focus, its selection, navigation, clipboard, and shortcut keys do not reach the canvas.</li>
      <li><strong>Settings → Board → Code editor palette</strong> can follow Drawerator, use a fully transparent adaptive skin, stay monochrome for live coding, use adaptive VS Code colors, or switch to Teaching.</li>
    </ul>
  </section>
);

const DraweratorApiGuide = () => (
  <section>
    <h3>Drawerator API</h3>
    <p>The shared <code>__</code> bridge is available in trusted p5, Play Core, Strudel, Brush, and Livecode runtimes. It is live: scene queries, selection, transport, theme, parameters, and streams reflect the current app state. Use <code>__.api</code> for deliberate application-level operations. The legacy <code>drawerator</code> name remains available for compatibility.</p>
    <details className="info-api-group" open>
      <summary>Frame bridge</summary>
      <dl className="info-svg-command-list">
        <div><dt><code>element</code></dt><dd>The script host: <code>&#123; id, width, height &#125;</code>.</dd></div>
        <div><dt><code>object</code></dt><dd>Live read-only snapshot of the host’s Drawerator scene object.</dd></div>
        <div><dt><code>frame</code></dt><dd>The p5 or Play Core frame configuration.</dd></div>
        <div><dt><code>params</code></dt><dd>Values declared with <code>@param</code>; object parameters resolve to live object snapshots.</dd></div>
        <div><dt><code>currentColor</code></dt><dd>Current foreground CSS color. Use <code>colors.foreground.css</code> when opacity must be included.</dd></div>
        <div><dt><code>currentOpacity</code></dt><dd>Foreground opacity from 0 to 1.</dd></div>
        <div><dt><code>colors</code></dt><dd><code>foreground</code>, <code>accent</code>, <code>highlight</code>, and <code>muted</code>, each with <code>color</code>, <code>opacity</code>, and composited <code>css</code>.</dd></div>
        <div><dt><code>theme</code> / <code>appearance</code></dt><dd>Current theme id, or the complete live appearance snapshot.</dd></div>
        <div><dt><code>time</code></dt><dd>Shortcut for <code>transport.time</code>, in score seconds.</dd></div>
      </dl>
    </details>
    <details className="info-api-group">
      <summary>Scene, events, and transport</summary>
      <dl className="info-svg-command-list">
        <div><dt><code>canvas.all()</code></dt><dd>Read-only snapshots of all non-deleted scene objects.</dd></div>
        <div><dt><code>canvas.get(id)</code></dt><dd>Get one object by element id, label, or IanniX group; returns <code>null</code> when absent.</dd></div>
        <div><dt><code>canvas.find(query)</code></dt><dd>Search by text, or filter snapshots with a predicate. <code>objects</code> is an alias of <code>canvas</code>.</dd></div>
        <div><dt><code>canvas.selected()</code></dt><dd>Read-only snapshots of the current canvas selection.</dd></div>
        <div><dt><code>events.on(pattern, listener)</code></dt><dd>Subscribe to the event bus; supports a trailing <code>.*</code> wildcard and returns an unsubscribe function.</dd></div>
        <div><dt><code>events.recent(limit)</code> / <code>latest(pattern)</code></dt><dd>Inspect captured Drawerator events.</dd></div>
        <div><dt><code>transport.time</code> / <code>transport.context</code></dt><dd>Current score time and its timing context.</dd></div>
      </dl>
    </details>
    <details className="info-api-group">
      <summary>Application API · <code>__.api</code></summary>
      <dl className="info-svg-command-list">
        <div><dt><code>api.apiVersion</code></dt><dd>Current public API version; use it when a script requires a particular capability.</dd></div>
        <div><dt><code>api.commands</code></dt><dd><code>list()</code>, <code>describe(id)</code>, <code>execute(id, args, options)</code>, and <code>subscribe(listener)</code>.</dd></div>
        <div><dt><code>api.scene</code></dt><dd><code>get()</code> returns scene elements; <code>getAppState()</code> returns Excalidraw application state.</dd></div>
        <div><dt><code>api.canvas</code> / <code>api.objects</code></dt><dd>The same read-only scene-query bridge exposed locally.</dd></div>
        <div><dt><code>api.time</code></dt><dd><code>parse()</code>, <code>resolve()</code>, <code>format()</code>, and <code>quantize()</code> score-time values.</dd></div>
        <div><dt><code>api.grid</code></dt><dd>Read/update the global grid, snap points, convert grid units, map values to/from world space, and resolve object timing.</dd></div>
        <div><dt><code>api.history</code> / <code>api.macros</code></dt><dd>Record, replay, import/export, save, insert, and remove reusable command history.</dd></div>
        <div><dt><code>api.inputs</code> / <code>api.events</code></dt><dd>Register or emit input adapters, and subscribe to application events.</dd></div>
        <div><dt><code>api.mixer</code></dt><dd>Read the mixer or add, update, and remove tracks.</dd></div>
        <div><dt><code>api.streams</code></dt><dd>List or resolve typed space, time, value, event, and image streams. Semantic MediaPipe <code>feature()</code>/<code>features()</code> remain available. <code>inputs</code> and <code>outputs</code> are filtered views, not separate systems.</dd></div>
      </dl>
    </details>
    <pre><code>{`// Follow the current Drawerator foreground
return { char: "●", color: __.colors.foreground.css };

// Read a selected score object
const cursor = __.canvas.selected()[0];

// Invoke a documented app command
await __.api.commands.execute("grid.global.update", {
  patch: { enabled: true }
});`}</code></pre>
  </section>
);

const P5InfoGuide = () => (
  <div className="info-svg-guide">
    <section>
      <h3>p5 sketch</h3>
      <pre><code>{`function setup() {
  createCanvas(__.element.width, __.element.height);
}

function draw() {
  background(18);
  stroke("#1769e0");
  circle(width / 2, height / 2, 80);
}`}</code></pre>
      <p>Use global p5 functions such as <code>stroke</code>, <code>fill</code>, <code>circle</code>, <code>line</code>, <code>translate</code>, and <code>noise</code>. <code>__.element</code> is the host object; <code>__.params</code> contains declared parameters.</p>
    </section>
    <DraweratorApiGuide />
    <EditorKeys />
  </div>
);

const MediaStreamsInfoGuide = () => (
  <div className="info-svg-guide">
    <section>
      <h3>Semantic streams</h3>
      <p>Holistic observations stay transient. The processor object persists its source, transform, overlay settings, and versioned actor bindings; it does not create one scene object per landmark.</p>
      <pre><code>{`const body = __.streams.get("Holistic");
const finger = body.feature("left_hand.index_finger_tip", {
  space: "scene",
});
const unsubscribe = body.subscribe(frame => {
  console.log(frame.feature("right_hand.pinch"));
});`}</code></pre>
      <p>Canonical names use lower snake case: <code>pose.left_index</code>, <code>left_hand.index_finger_tip</code>, and <code>right_hand.thumb_tip</code>. Face vertices remain numeric, such as <code>face.468</code>. Named groups include <code>face.face_oval</code>, <code>face.left_eye</code>, <code>face.left_iris</code>, and <code>face.lips</code>.</p>
    </section>
    <section>
      <h3>Unified inputs and Brush channels</h3>
      <p>The <strong>Media</strong> panel owns camera, URL/file, and canvas image sources. The separate <strong>Inputs</strong> panel owns pointer, keyboard, clocks, MediaPipe, IanniX, MIDI, serial, WebSocket/OSC JSON, and persistent descriptors for trusted virtual streams. Device handles, pixels, socket state, and current samples are local and transient; scene exchange keeps only named mappings and graph processors.</p>
      <pre><code>{`// Create a runtime-only stream in a trusted livecode runtime
const hand = __.streams.create({
  id: "my-hand", name: "My hand", kind: "space"
});
hand.write({ kind: "space", x: 0.4, y: 0.6, space: "normalized" });

// A Brush channel can then map it to a selected frame or viewport.`}</code></pre>
      <p><strong>Brush → Channels</strong> keeps each stroke session separate. A channel may choose a spatial stream, optional gate and pressure streams, range/inversion/scale/offset, then draw in scene space, a viewport frozen at start, or a rotated rectangle/frame. A streamed stroke captures the active Brush stack at gate-open and previews its generated tracks live; gate-close commits that visible result as one native undoable freedraw.</p>
      <p><strong>Inputs → Processors</strong> turns sources into typed geometry, value, motion, filter, gate, and edge streams. A Gate is held state for Brush; its separate <code>edges</code> output is a transition event for triggers, resets, and future automation. The Pinch brush recipe creates a right-hand position source, pinch gate, and editable channel.</p>
      <pre><code>{`const gate = __.streams.get("Right pinch gate");
const edges = __.streams.get("Right pinch gate edges");

if (gate.snapshot()?.value) {
  // held while the pinch is active
}
edges.subscribe(event => console.log(event.transition));`}</code></pre>
    </section>
    <section>
      <h3>Coordinates and availability</h3>
      <ul>
        <li><strong>normalized</strong> is MediaPipe output in the processed source frame. Crop and mirror have already been applied upstream.</li>
        <li><strong>local</strong> is measured inside the Holistic processor rectangle.</li>
        <li><strong>scene</strong> includes the processor’s translation, scale, and rotation. Z remains data and does not change the default 2D projection.</li>
        <li>Snapshots report <code>available</code>, <code>ageMs</code>, optional confidence, and geometry or scalar values. Missing landmarks never become scene geometry.</li>
      </ul>
    </section>
    <section>
      <h3>Media actors</h3>
      <ul>
        <li>The Mapping panel’s arm switch is local to this browser and independent of transport.</li>
        <li><strong>Drive position</strong> maps a point or region centroid to a real target object with per-binding smoothing, confidence gating, and missing-signal grace.</li>
        <li><strong>Freedraw actor</strong> previews a gesture while active and commits one native undoable freedraw object when the gate closes.</li>
        <li>Disarming immediately releases gates and closes active strokes. Raw stream reads remain available to scripts while actors are disarmed.</li>
      </ul>
    </section>
    <DraweratorApiGuide />
  </div>
);

const PlayCoreInfoGuide = () => (
  <div className="info-svg-guide">
    <section>
      <h3>Play Core frame</h3>
      <pre><code>{`// @param threshold = 0.55 (0..1, step: 0.01)
export const settings = { fps: 30, cols: 0, rows: 0 };

export function main({ x, y }, context) {
  return Math.sin(x + context.time / 400) > __.params.threshold
    ? "·" : " ";
}`}</code></pre>
      <p>Play Core programs draw one ASCII cell at a time. Attach the program to a selected rectangle or frame, or press Play with no selection to create a new frame. Selecting one Play Core host loads that host’s exact source into the Script panel.</p>
    </section>
    <section>
      <h3>Programs and frames</h3>
      <ul>
        <li>The program selector is a local working-file catalog. <strong>Save</strong> creates or updates a file; <strong>Duplicate</strong>, <strong>New</strong>, <strong>Import</strong>, and <strong>Delete</strong> mirror the p5 workflow.</li>
        <li>The separate <strong>Original play.core examples</strong> group loads a local, editable upstream starter as a saved Drawerator program. It never needs a network request after this app loads.</li>
        <li>A saved file can be attached to several frames. Saving it recompiles every linked frame; each host retains its own size, interaction setting, and <code>@param</code> values.</li>
        <li>Choose another saved program while one host is selected to attach it immediately. Press <strong>F2</strong> or Shift-double-click the selector to rename the selected saved program.</li>
      </ul>
    </section>
    <section>
      <h3>Lifecycle</h3>
      <ul>
        <li><code>settings</code> controls <code>fps</code>, <code>cols</code>, <code>rows</code>, foreground <code>color</code>, and <code>backgroundColor</code>. Zero columns or rows adapt to the frame size.</li>
        <li><code>boot()</code> runs once; <code>pre</code> and <code>post</code> surround each cell pass. The bridge is always available as <code>__</code>.</li>
        <li><code>main(coord, context, cursor, buffer)</code> returns a character or a cell object.</li>
        <li><code>pointerMove</code>, <code>pointerDown</code>, and <code>pointerUp</code> receive the current context, cursor, buffer, and Drawerator bridge.</li>
      </ul>
    </section>
    <section>
      <h3>Cells and input</h3>
      <ul>
        <li><code>main(&#123; x, y, index &#125;, context, cursor, buffer)</code> runs for every cell. Return a character, or an object such as <code>&#123; char: &quot;·&quot; &#125;</code>.</li>
        <li><code>context</code> includes <code>frame</code>, <code>time</code>, <code>cols</code>, <code>rows</code>, <code>width</code>, <code>height</code>, resolved <code>settings</code>, and <code>metrics</code> (<code>cellWidth</code>, <code>cellHeight</code>, <code>aspect</code>).</li>
        <li><code>cursor</code> is measured in ASCII-cell coordinates and includes <code>x</code>, <code>y</code>, <code>pressed</code>, and the previous state in <code>cursor.p</code>.</li>
        <li>Use <code>pre</code> and <code>post</code> to prepare or inspect the shared <code>buffer</code>; pointer callbacks receive the same <code>context</code>, <code>cursor</code>, <code>buffer</code>, and bridge.</li>
      </ul>
    </section>
    <section>
      <h3>Bundled modules</h3>
      <p>Use normal static ES imports. Drawerator carries these helpers in every scene and single-file build, so imports never fetch from the network:</p>
      <pre><code>{`import { map, clamp, mix } from '/src/modules/num.js'
import { vec2, rot, add, mulN, length } from '/src/modules/vec2.js'
import { sort } from '/src/modules/sort.js'`}</code></pre>
      <p>Available paths are <code>num.js</code>, <code>sort.js</code>, <code>vec2.js</code>, <code>vec3.js</code>, <code>sdf.js</code>, <code>string.js</code>, <code>buffer.js</code>, <code>drawbox.js</code>, and <code>color.js</code> under <code>/src/modules/</code>. Named, default, and namespace imports are supported. Dynamic imports and non-bundled paths are rejected with a diagnostic.</p>
    </section>
    <DraweratorApiGuide />
    <section><p>Programs run locally as trusted code. Valid source updates a selected Play Core frame immediately; invalid drafts remain editable without replacing the last working program.</p></section>
    <EditorKeys />
  </div>
);

const IannixInfoGuide = ({ activeCommand = null }) => (
  <div className="info-svg-guide">
    {activeCommand && (
      <section className="info-iannix-active-command">
        <h3>Current command · {activeCommand.category}</h3>
        <pre><code>{activeCommand.syntax}</code></pre>
        <p><strong>{activeCommand.command}</strong> — {activeCommand.description}</p>
        <p><code>run(&quot;{activeCommand.example}&quot;)</code></p>
      </section>
    )}
    <section>
      <h3>How an IanniX score works</h3>
      <p>An IanniX score is a set of named objects: <strong>curves</strong> define geometry, <strong>cursors</strong> travel a curve in score time, and <strong>triggers</strong> send messages at positions on a curve. JavaScript creates and configures those objects through textual <code>run()</code> commands.</p>
      <pre><code>{`function askUserForParameters() {
  ask("Motion", "Speed", "speed", 80);
}

function makeWithScript() {
  run("clear");
  run("add curve orbit");
  run("setPointsEllipse current 120 60");
  run("setColor current 23 105 224 255");
  run("add cursor traveler");
  run("setCurve current orbit");
  run("setSpeed current absolute " + speed);
}`}</code></pre>
      <p><code>askUserForParameters()</code> declares editable values. <code>makeWithScript()</code> builds the score. <code>madeThroughGUI()</code> is an optional alternative lifecycle function for GUI-authored score commands.</p>
    </section>

    <section>
      <h3>Targets, coordinates, and time</h3>
      <ul>
        <li>Every <code>add</code> command selects the new object as <code>current</code>. Use a named id when configuring another object; <code>lastCurve</code> means the most recently created curve.</li>
        <li>Coordinates are IanniX model units, with <code>x y [z]</code> values. Use <code>setPos</code> to place an object, then keep its local curve points or ellipse radii near that position.</li>
        <li><code>setSpeed current 80</code> uses absolute speed. <code>auto</code> and <code>autolock</code> use the supplied value as a traversal duration.</li>
        <li><code>setMessage</code> attaches the output sent by a cursor or trigger. <code>setPattern</code> defines cursor passes; a negative pass returns along its support curve.</li>
      </ul>
    </section>

    <section>
      <h3>Supported command reference</h3>
      <p>Completion shows the same syntax, purpose, and runnable example for every supported command. Commands are case-insensitive; examples retain their conventional IanniX casing.</p>
      {getIannixCommandCategories().map(category => (
        <details className="info-iannix-command-group" key={category.name} open={category.name === "Score objects"}>
          <summary>{category.name} <span>{category.commands.length}</span></summary>
          <dl className="info-svg-command-list">
            {category.commands.map(command => (
              <div key={command.command}>
                <dt><code>{command.command}</code></dt>
                <dd>
                  <strong><code>{command.syntax}</code></strong>
                  <span>{command.description}</span>
                  <code>run(&quot;{command.example}&quot;)</code>
                </dd>
              </div>
            ))}
          </dl>
        </details>
      ))}
    </section>

    <section>
      <h3>JavaScript helpers</h3>
      <p>Use deterministic score helpers such as <code>sessionTime</code>, <code>random</code>, <code>range</code>, <code>rangeMid</code>, <code>norm</code>, <code>map</code>, <code>linexp</code>, <code>constrain</code>, <code>sin</code>, <code>cos</code>, <code>PI</code>, and <code>TWO_PI</code>. Keep creation inside lifecycle functions; do not use browser, network, storage, or wall-clock APIs.</p>
    </section>
    <EditorKeys />
  </div>
);

const BrushInfoGuide = () => (
  <div className="info-svg-guide">
    <section>
      <h3>Brush modifier</h3>
      <pre><code>{`(points, globals) => {
  // transform or replace the input tracks
  return [points];
}`}</code></pre>
      <p><code>points</code> is the source path. <code>globals</code> exposes brush parameters; use <code>// @param amount = 1 (0..10, step: 0.1)</code> to make a value editable in the UI.</p>
    </section>
    <EditorKeys />
  </div>
);

const scriptGuide = (mode, iannixCommand) => {
  if (mode === "svg") return <SvgInfoGuide />;
  if (mode === "p5") return <P5InfoGuide />;
  if (mode === "play") return <PlayCoreInfoGuide />;
  if (mode === "iannix") return <IannixInfoGuide activeCommand={iannixCommand} />;
  if (mode === "brush") return <BrushInfoGuide />;
  if (mode === "media") return <MediaStreamsInfoGuide />;
  return null;
};

const guideTitle = mode => ({
  svg: "SVG quick reference",
  p5: "p5 quick reference",
  play: "Play Core quick reference",
  iannix: "IanniX quick reference",
  brush: "Brush quick reference",
  media: "Media streams and actors",
}[mode] || null);

export default function InfoPanel({ info = DEFAULT_INFO_VIEW, mode = "default", iannixCommand = null }) {
  const guide = scriptGuide(mode, iannixCommand);
  return (
    <div className="info-panel" aria-live="polite">
      <div className="info-panel-title">{guideTitle(mode) || info.title || DEFAULT_INFO_VIEW.title}</div>
      <div className="info-panel-body">
        {guide || info.body || DEFAULT_INFO_VIEW.body}
      </div>
    </div>
  );
}
