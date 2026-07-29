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
    <h3>Completion keys</h3>
    <ul>
      <li><strong>Tab</strong> or <strong>Enter</strong> accepts the highlighted suggestion.</li>
      <li><strong>↑ / ↓</strong> choose suggestions; <strong>Page Up / Page Down</strong> move by a page.</li>
      <li><strong>Escape</strong> closes the menu. <strong>⌘ Enter</strong> runs the active script.</li>
    </ul>
  </section>
);

const P5InfoGuide = () => (
  <div className="info-svg-guide">
    <section>
      <h3>p5 sketch</h3>
      <pre><code>{`function setup() {
  createCanvas(drawerator.element.width, drawerator.element.height);
}

function draw() {
  background(18);
  stroke("#1769e0");
  circle(width / 2, height / 2, 80);
}`}</code></pre>
      <p>Use global p5 functions such as <code>stroke</code>, <code>fill</code>, <code>circle</code>, <code>line</code>, <code>translate</code>, and <code>noise</code>. <code>drawerator.element</code> is the host object; <code>drawerator.params</code> contains declared parameters.</p>
    </section>
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
  if (mode === "iannix") return <IannixInfoGuide activeCommand={iannixCommand} />;
  if (mode === "brush") return <BrushInfoGuide />;
  return null;
};

const guideTitle = mode => ({
  svg: "SVG quick reference",
  p5: "p5 quick reference",
  iannix: "IanniX quick reference",
  brush: "Brush quick reference",
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
