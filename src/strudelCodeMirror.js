// Local wrapper so the student build can replace Strudel's CodeMirror package
// without changing the editor's normal dependency graph.
export {
  flash,
  highlightExtension,
  highlightMiniLocations,
  sliderPlugin,
  updateMiniLocations,
  updateSliderWidgets,
  updateWidgets,
  widgetPlugin,
} from "@strudel/codemirror";
