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
        <li><strong>Enter path editing:</strong> double-click a rendered path, Command-click it, or select its path/subpath in Properties or Outliner.</li>
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
  </div>
);

export default function InfoPanel({ info = DEFAULT_INFO_VIEW, mode = "default" }) {
  return (
    <div className="info-panel" aria-live="polite">
      <div className="info-panel-title">{mode === "svg" ? "SVG quick reference" : info.title || DEFAULT_INFO_VIEW.title}</div>
      <div className="info-panel-body">
        {mode === "svg" ? <SvgInfoGuide /> : info.body || DEFAULT_INFO_VIEW.body}
      </div>
    </div>
  );
}
