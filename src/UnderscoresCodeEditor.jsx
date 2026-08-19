import React, { useEffect, useLayoutEffect, useRef } from "react";
import {
  acceptCompletion,
  autocompletion,
  closeCompletion,
  closeBrackets,
  closeBracketsKeymap,
  completionKeymap,
  completionStatus,
  moveCompletionSelection,
} from "@codemirror/autocomplete";
import {
  defaultKeymap,
  deleteCharBackward,
  deleteCharForward,
  history,
  historyKeymap,
  indentWithTab,
  insertNewlineAndIndent,
} from "@codemirror/commands";
import { html } from "@codemirror/lang-html";
import { javascript } from "@codemirror/lang-javascript";
import { markdown } from "@codemirror/lang-markdown";
import { python } from "@codemirror/lang-python";
import {
  bracketMatching,
  foldGutter,
  foldKeymap,
  indentOnInput,
  syntaxHighlighting,
} from "@codemirror/language";
import { forceLinting, lintGutter, lintKeymap, linter } from "@codemirror/lint";
import { highlightSelectionMatches, searchKeymap } from "@codemirror/search";
import { Annotation, Compartment, EditorState, StateEffect, StateField } from "@codemirror/state";
import {
  Decoration,
  EditorView,
  crosshairCursor,
  drawSelection,
  dropCursor,
  highlightActiveLine,
  highlightActiveLineGutter,
  highlightSpecialChars,
  hoverTooltip,
  keymap,
  lineNumbers,
  placeholder as placeholderExtension,
  rectangularSelection,
  runScopeHandlers,
} from "@codemirror/view";
import { classHighlighter } from "@lezer/highlight";
import {
  flash,
  highlightExtension,
  highlightMiniLocations,
  sliderPlugin,
  updateMiniLocations,
  updateSliderWidgets,
  updateWidgets,
  widgetPlugin,
} from "./strudelCodeMirror.js";
import { sourceDiagnostic } from "./scriptEditorDiagnostics.js";
import {
  getScriptEditorCompletionResult,
  getScriptEditorHover,
  getScriptEditorProfile,
} from "./scriptEditorProfiles.js";
import { getStrudelRuntimeManager } from "./strudelRuntime.js";

const externalDocumentUpdate = Annotation.define();
const setExternalHighlight = StateEffect.define();
const externalHighlightField = StateField.define({
  create: () => Decoration.none,
  update: (decorations, transaction) => {
    let next = decorations.map(transaction.changes);
    for (const effect of transaction.effects) {
      if (!effect.is(setExternalHighlight)) continue;
      const range = effect.value;
      next = range && range.to > range.from
        ? Decoration.set([
          Decoration.mark({ class: "cm-underscores-source-highlight" }).range(range.from, range.to),
        ])
        : Decoration.none;
    }
    return next;
  },
  provide: field => EditorView.decorations.from(field),
});

const glyphBackdropMark = Decoration.mark({ class: "cm-underscores-glyph-backdrop" });
const glyphBackdropDecorations = doc => {
  const ranges = [];
  for (let lineNumber = 1; lineNumber <= doc.lines; lineNumber += 1) {
    const line = doc.line(lineNumber);
    for (const match of line.text.matchAll(/\S+/g)) {
      const from = line.from + match.index;
      ranges.push(glyphBackdropMark.range(from, from + match[0].length));
    }
  }
  return Decoration.set(ranges, true);
};

const glyphBackdropField = StateField.define({
  create: state => glyphBackdropDecorations(state.doc),
  update: (decorations, transaction) => (
    transaction.docChanged ? glyphBackdropDecorations(transaction.state.doc) : decorations
  ),
  provide: field => EditorView.decorations.from(field),
});

const markdownCodeLanguage = info => {
  const language = String(info || "").trim().toLowerCase().split(/[\s,{]/, 1)[0];
  if (["js", "jsx", "javascript", "mjs", "cjs", "ts", "tsx", "typescript"].includes(language)) {
    return javascript({ jsx: ["jsx", "tsx"].includes(language), typescript: ["ts", "tsx", "typescript"].includes(language) });
  }
  if (["py", "python", "python3"].includes(language)) return python();
  if (["html", "htm", "xml", "svg"].includes(language)) return html({ autoCloseTags: true, matchClosingTags: true });
  return null;
};

const languageExtension = profile => (
  profile.id === "markdown"
    ? markdown({ codeLanguages: markdownCodeLanguage })
    : profile.language === "html"
      ? html({ autoCloseTags: true, matchClosingTags: true })
      : profile.language === "javascript"
        ? javascript({ jsx: false, typescript: false })
        : []
);

const strudelExtensions = (profile, includeWidgets) => (
  profile.id === "strudel"
    ? [highlightExtension, sliderPlugin, includeWidgets ? widgetPlugin : []]
    : []
);

const completionToken = context => {
  const token = context.matchBefore(/(?:<\/?[\w:.-]*|[\w$][\w$.:/-]*)/);
  if (!token?.text?.startsWith("<")) return token;
  const markupPrefixLength = token.text.startsWith("</") ? 2 : 1;
  return {
    ...token,
    from: Math.min(token.to, token.from + markupPrefixLength),
  };
};

const normalizeDiagnostics = (diagnostics, docLength) => (
  (Array.isArray(diagnostics) ? diagnostics : []).flatMap(diagnostic => {
    const message = typeof diagnostic === "string" ? diagnostic : diagnostic?.message;
    if (!message) return [];
    const from = Math.max(0, Math.min(docLength, Number(diagnostic?.from) || 0));
    const requestedTo = Number(diagnostic?.to);
    const to = Math.max(from, Math.min(
      docLength,
      Number.isFinite(requestedTo) ? requestedTo : Math.min(docLength, from + 1),
    ));
    return [{
      from,
      to,
      severity: ["info", "warning", "error"].includes(diagnostic?.severity)
        ? diagnostic.severity
        : "error",
      message: String(message),
      source: diagnostic?.source ? String(diagnostic.source) : "Underscores",
    }];
  })
);

export default function UnderscoresCodeEditor({
  value,
  onChange,
  onBlur,
  onRun,
  onUpdate,
  onStop,
  onSelectionChange,
  highlightRange = null,
  scriptType = "brush",
  placeholder = "",
  ariaLabel,
  getDiagnostics,
  readOnly = false,
  showLineNumbers = true,
  showFoldGutter = true,
  onToggleLineNumbers,
  onCycleView,
  onAdjustFontSize,
  onDoubleClick,
  onClick,
  focusRequest = 0,
  glyphOnlyOverlay = false,
  strudelNodeId = "",
  strudelWidgets = false,
  visualOnly = false,
  p5Mode = "auto",
  showDocumentationOverlay = true,
  documentationTipMode = "hover",
  autocompleteEnabled = true,
  onDocumentationHover,
  className = "",
  style,
}) {
  const hostRef = useRef(null);
  const viewRef = useRef(null);
  const onChangeRef = useRef(onChange);
  const onBlurRef = useRef(onBlur);
  const onRunRef = useRef(onRun);
  const onUpdateRef = useRef(onUpdate);
  const onStopRef = useRef(onStop);
  const onSelectionChangeRef = useRef(onSelectionChange);
  const scriptTypeRef = useRef(scriptType);
  const p5ModeRef = useRef(p5Mode);
  const showDocumentationOverlayRef = useRef(showDocumentationOverlay);
  const documentationTipModeRef = useRef(documentationTipMode);
  const autocompleteEnabledRef = useRef(autocompleteEnabled);
  const onDocumentationHoverRef = useRef(onDocumentationHover);
  const diagnosticsRef = useRef(getDiagnostics);
  const onToggleLineNumbersRef = useRef(onToggleLineNumbers);
  const onCycleViewRef = useRef(onCycleView);
  const onAdjustFontSizeRef = useRef(onAdjustFontSize);
  const strudelWidgetsRef = useRef(strudelWidgets);
  const lineNumberToggleChordRef = useRef(false);
  const lineNumberToggleTimerRef = useRef(null);
  const configurationRef = useRef(new Compartment());

  onChangeRef.current = onChange;
  onBlurRef.current = onBlur;
  onRunRef.current = onRun;
  onUpdateRef.current = onUpdate;
  onStopRef.current = onStop;
  onSelectionChangeRef.current = onSelectionChange;
  scriptTypeRef.current = scriptType;
  p5ModeRef.current = p5Mode;
  showDocumentationOverlayRef.current = showDocumentationOverlay;
  documentationTipModeRef.current = documentationTipMode;
  autocompleteEnabledRef.current = autocompleteEnabled;
  onDocumentationHoverRef.current = onDocumentationHover;
  diagnosticsRef.current = getDiagnostics;
  onToggleLineNumbersRef.current = onToggleLineNumbers;
  onCycleViewRef.current = onCycleView;
  onAdjustFontSizeRef.current = onAdjustFontSize;
  strudelWidgetsRef.current = strudelWidgets;

  useLayoutEffect(() => {
    if (!hostRef.current) return undefined;

    const profile = getScriptEditorProfile(scriptTypeRef.current);
    const completionSource = context => {
      if (!autocompleteEnabledRef.current) return null;
      const token = completionToken(context);
      if (!context.explicit && (!token || token.from === token.to)) return null;
      const result = getScriptEditorCompletionResult(scriptTypeRef.current, context, {
        p5Mode: p5ModeRef.current,
        mode: p5ModeRef.current,
      });
      return {
        from: Number.isFinite(result?.from) ? result.from : (token?.from ?? context.pos),
        options: Array.isArray(result?.options) ? result.options : [],
      };
    };
    const hoverSource = (view, position) => {
      if (documentationTipModeRef.current !== "hover") return null;
      const item = getScriptEditorHover(scriptTypeRef.current, view.state.doc.toString(), position);
      if (!item) {
        onDocumentationHoverRef.current?.(null);
        return null;
      }
      onDocumentationHoverRef.current?.(item);
      // Completion owns the popup while its suggestion list is open. Keep the
      // Info panel synchronized with the symbol, but don't stack a second
      // floating card on top of the completion menu. CodeMirror will ask for
      // the tooltip again after the pointer moves or the menu is dismissed.
      if (completionStatus(view.state) === "active") return null;
      if (!showDocumentationOverlayRef.current) return null;
      return {
        pos: item.from,
        end: item.to,
        above: true,
        create: () => {
          const dom = document.createElement("div");
          dom.className = "cm-underscores-hover-info";
          const signature = document.createElement("code");
          signature.textContent = item.signature;
          const description = document.createElement("div");
          description.textContent = item.description;
          const example = document.createElement("div");
          example.className = "cm-underscores-hover-example";
          example.textContent = `Example: ${item.example}`;
          const source = document.createElement("div");
          source.className = "cm-underscores-hover-source";
          source.textContent = item.referenceSource || "Local language reference";
          if (item.referenceUrl) {
            const link = document.createElement("a");
            link.href = item.referenceUrl;
            link.target = "_blank";
            link.rel = "noreferrer";
            link.textContent = "Open docs ↗";
            source.append(" · ", link);
          }
          dom.append(signature, description, example, source);
          return { dom };
        },
      };
    };
    const runCommand = () => {
      if (typeof onRunRef.current !== "function") return false;
      onRunRef.current();
      return true;
    };
    const stopCommand = () => {
      if (typeof onStopRef.current !== "function") return false;
      onStopRef.current();
      return true;
    };
    const updateCommand = () => {
      if (typeof onUpdateRef.current !== "function") return false;
      onUpdateRef.current();
      return true;
    };
    const adjustFontSize = delta => {
      if (typeof onAdjustFontSizeRef.current !== "function") return false;
      onAdjustFontSizeRef.current(delta);
      return true;
    };
    const acceptActiveCompletion = editor => (
      completionStatus(editor.state) === "active" && acceptCompletion(editor)
    );
    const lintSource = view => {
      if (typeof diagnosticsRef.current !== "function") return [];
      const source = view.state.doc.toString();
      try {
        return normalizeDiagnostics(
          diagnosticsRef.current(source, scriptTypeRef.current),
          source.length,
        );
      } catch (error) {
        return normalizeDiagnostics([
          sourceDiagnostic(source, error?.message || "Could not validate source"),
        ], source.length);
      }
    };

    const view = new EditorView({
      parent: hostRef.current,
      state: EditorState.create({
        doc: String(value || ""),
        extensions: [
          highlightActiveLineGutter(),
          highlightSpecialChars(),
          history(),
          drawSelection(),
          dropCursor(),
          EditorState.allowMultipleSelections.of(true),
          indentOnInput(),
          syntaxHighlighting(classHighlighter),
          bracketMatching(),
          closeBrackets(),
          autocompletion({
            activateOnTyping: true,
            override: [completionSource],
          }),
          hoverTooltip(hoverSource, { hoverTime: 220 }),
          rectangularSelection(),
          crosshairCursor(),
          highlightActiveLine(),
          highlightSelectionMatches(),
          linter(lintSource, { delay: 300 }),
          externalHighlightField,
          EditorView.lineWrapping,
          keymap.of([
            { key: "Mod-Shift-Enter", run: () => {
              if (typeof onCycleViewRef.current !== "function") return false;
              onCycleViewRef.current();
              return true;
            }, preventDefault: true },
            // CodeMirror reports shifted punctuation as either the base key
            // (= / -) or the produced character (+ / _) depending on the
            // platform and keyboard layout. Keep both spellings so the
            // persisted Livecode font size is consistently adjustable.
            { key: "Mod-Shift-=", run: () => adjustFontSize(1), preventDefault: true },
            { key: "Mod-Shift-+", run: () => adjustFontSize(1), preventDefault: true },
            { key: "Mod-Shift--", run: () => adjustFontSize(-1), preventDefault: true },
            { key: "Mod-Shift-_", run: () => adjustFontSize(-1), preventDefault: true },
            { key: "Ctrl-Shift-=", run: () => adjustFontSize(1), preventDefault: true },
            { key: "Ctrl-Shift-+", run: () => adjustFontSize(1), preventDefault: true },
            { key: "Ctrl-Shift--", run: () => adjustFontSize(-1), preventDefault: true },
            { key: "Ctrl-Shift-_", run: () => adjustFontSize(-1), preventDefault: true },
            {
              key: "Meta-Enter",
              run: runCommand,
              preventDefault: true,
            },
            {
              key: "Ctrl-Enter",
              run: () => scriptTypeRef.current === "strudel" ? updateCommand() : runCommand(),
              preventDefault: true,
            },
            { key: "Ctrl-.", run: stopCommand, preventDefault: true },
            { key: "Alt-.", run: stopCommand, preventDefault: true },
            // CodeMirror's notebook convention: Ctrl-M, then L.
            { key: "Ctrl-m", run: () => {
              lineNumberToggleChordRef.current = true;
              if (lineNumberToggleTimerRef.current) clearTimeout(lineNumberToggleTimerRef.current);
              lineNumberToggleTimerRef.current = window.setTimeout(() => {
                lineNumberToggleChordRef.current = false;
                lineNumberToggleTimerRef.current = null;
              }, 900);
              return true;
            }, preventDefault: true },
            // Put completion acceptance ahead of the normal Tab indentation
            // and newline bindings. This keeps snippets and regular options
            // predictable even when the canvas has its own global shortcuts.
            { key: "Tab", run: acceptActiveCompletion },
            { key: "Enter", run: acceptActiveCompletion },
            ...closeBracketsKeymap,
            ...defaultKeymap,
            ...searchKeymap,
            ...historyKeymap,
            ...foldKeymap,
            ...completionKeymap,
            ...lintKeymap,
            indentWithTab,
          ]),
          EditorView.updateListener.of(update => {
            const isExternalUpdate = update.transactions.some(transaction => (
              transaction.annotation(externalDocumentUpdate)
            ));
            if (isExternalUpdate) return;
            const source = update.state.doc.toString();
            if (update.docChanged) onChangeRef.current?.(source, update);
            if (update.selectionSet || update.docChanged) {
              const selection = update.state.selection.main;
              onSelectionChangeRef.current?.({
                anchor: selection.anchor,
                head: selection.head,
                from: selection.from,
                to: selection.to,
                source,
              }, update);
              if (documentationTipModeRef.current === "select") {
                const item = selection.from < selection.to
                  ? getScriptEditorHover(scriptTypeRef.current, source, selection.from, selection.to)
                  : null;
                onDocumentationHoverRef.current?.(item);
              }
            }
          }),
          EditorView.domEventHandlers({
            blur: () => {
              onBlurRef.current?.();
              const selection = viewRef.current?.state.selection.main;
              const selectionOwnsDocumentation = documentationTipModeRef.current === "select"
                && selection
                && selection.from < selection.to;
              if (!selectionOwnsDocumentation) onDocumentationHoverRef.current?.(null);
              return false;
            },
            mouseleave: event => {
              // CodeMirror places hover cards outside the editor DOM. Keep the
              // Info panel alive while the pointer travels from the token to
              // its card; in Select mode a selected word owns the Info panel
              // until the selection itself is cleared.
              const relatedTarget = event.relatedTarget;
              const isHoverCard = relatedTarget?.closest?.(".cm-tooltip-hover")
                || relatedTarget?.closest?.(".cm-underscores-hover-info");
              const selection = viewRef.current?.state.selection.main;
              const selectionOwnsDocumentation = documentationTipModeRef.current === "select"
                && selection
                && selection.from < selection.to;
              if (!isHoverCard && !selectionOwnsDocumentation) onDocumentationHoverRef.current?.(null);
              return false;
            },
            // A focused source editor owns the keyboard session. Let
            // CodeMirror and the browser process the keystroke normally, but
            // do not let Excalidraw's document-level single-key tool
            // shortcuts (S, R, V, and so on) see it.
            keydown: event => {
              event.stopPropagation();
              return false;
            },
            keyup: event => {
              event.stopPropagation();
              return false;
            },
            // Excalidraw installs page-level clipboard handlers so canvas
            // objects can be copied between boards. Clipboard events from a
            // focused CodeMirror editor must not bubble into that canvas
            // route, or Excalidraw replaces selected source text with its
            // `excalidraw/clipboard` payload.
            copy: event => {
              event.stopPropagation();
              return false;
            },
            cut: event => {
              event.stopPropagation();
              return false;
            },
            paste: event => {
              event.stopPropagation();
              return false;
            },
          }),
          configurationRef.current.of([
            languageExtension(profile),
            showLineNumbers ? lineNumbers() : [],
            showFoldGutter ? foldGutter({ openText: "⌄", closedText: "›" }) : [],
            showLineNumbers || showFoldGutter ? lintGutter() : [],
            glyphOnlyOverlay ? glyphBackdropField : [],
            strudelExtensions(profile, strudelWidgetsRef.current),
            placeholder ? placeholderExtension(placeholder) : [],
            EditorState.readOnly.of(Boolean(readOnly)),
            EditorView.editable.of(!readOnly),
            EditorView.contentAttributes.of({
              "aria-label": ariaLabel || `${profile.label} source`,
              "aria-multiline": "true",
              autocapitalize: "off",
              autocorrect: "off",
              spellcheck: "false",
            }),
          ]),
        ],
      }),
    });

    viewRef.current = view;
    return () => {
      view.destroy();
      viewRef.current = null;
    };
  }, []);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    if (!autocompleteEnabled) closeCompletion(view);
  }, [autocompleteEnabled]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    if (documentationTipMode !== "select") {
      onDocumentationHoverRef.current?.(null);
      return;
    }
    const selection = view.state.selection.main;
    const source = view.state.doc.toString();
    const item = selection.from < selection.to
      ? getScriptEditorHover(scriptTypeRef.current, source, selection.from, selection.to)
      : null;
    onDocumentationHoverRef.current?.(item);
  }, [documentationTipMode]);

  useEffect(() => {
    const ownEditorNavigationKey = event => {
      const view = viewRef.current;
      if (
        !view
        || !view.hasFocus
        || event.isComposing
      ) return;

      const normalizedKey = event.key.toLowerCase();
      if (lineNumberToggleChordRef.current) {
        if (normalizedKey === "l" && !event.metaKey && !event.ctrlKey && !event.altKey) {
          lineNumberToggleChordRef.current = false;
          if (lineNumberToggleTimerRef.current) clearTimeout(lineNumberToggleTimerRef.current);
          lineNumberToggleTimerRef.current = null;
          event.preventDefault();
          event.stopImmediatePropagation();
          onToggleLineNumbersRef.current?.();
          return;
        }
        if (!["control", "shift", "alt", "meta"].includes(normalizedKey)) {
          lineNumberToggleChordRef.current = false;
          if (lineNumberToggleTimerRef.current) clearTimeout(lineNumberToggleTimerRef.current);
          lineNumberToggleTimerRef.current = null;
        }
      }
      const isClipboardShortcut = (event.metaKey || event.ctrlKey)
        && ["c", "x", "v"].includes(normalizedKey);
      // Leave the explicit canvas-livecode gesture for App's global handler.
      // Plain Escape remains owned by CodeMirror for completion/search
      // dismissal, and panel editors never take this path.
      const isCanvasLivecodeShiftEscape = normalizedKey === "escape"
        && event.shiftKey
        && view.dom.closest?.(".underscores-livecode-node");
      if (isCanvasLivecodeShiftEscape) return;
      const isPlainEscape = normalizedKey === "escape"
        && !event.shiftKey
        && !event.metaKey
        && !event.ctrlKey
        && !event.altKey;
      const isCodeMirrorCommand = (
        (event.metaKey || event.ctrlKey)
        && ["a", "z", "y", "f", "g", "h", "enter"].includes(normalizedKey)
      ) || (event.ctrlKey && normalizedKey === "m")
        || ((event.ctrlKey || event.altKey) && normalizedKey === ".")
        || isPlainEscape
        || normalizedKey === "tab";

      // Underscores and Excalidraw both install capture-phase shortcuts. Give
      // CodeMirror's own keymap the first and only chance at its editor
      // commands, otherwise Cmd+A can select the canvas and Cmd+Z can undo a
      // scene operation. Clipboard commands intentionally keep their native
      // default; their copy/cut/paste events are stopped at the editor below.
      if (isCodeMirrorCommand && !isClipboardShortcut) {
        event.preventDefault();
        event.stopImmediatePropagation();
        runScopeHandlers(view, event, "editor");
        return;
      }

      const completionOpen = completionStatus(view.state) === "active";
      if (completionOpen && ["ArrowUp", "ArrowDown", "PageUp", "PageDown"].includes(event.key)) {
        event.preventDefault();
        event.stopImmediatePropagation();
        const forward = event.key === "ArrowDown" || event.key === "PageDown";
        moveCompletionSelection(forward, event.key.startsWith("Page") ? "page" : "option")(view);
        return;
      }

      if (
        completionOpen
        && (event.key === "Tab" || event.key === "Enter")
        && !event.metaKey
        && !event.ctrlKey
        && !event.altKey
      ) {
        event.preventDefault();
        event.stopImmediatePropagation();
        acceptCompletion(view);
        return;
      }

      // Excalidraw handles arrow keys at page scope to move selected canvas
      // objects. Capture navigation before that handler while leaving the
      // browser's default caret/selection movement intact for CodeMirror.
      if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.key)) {
        event.stopImmediatePropagation();
        return;
      }

      if (
        event.key === "Enter"
        && !event.metaKey
        && !event.ctrlKey
        && !event.altKey
      ) {
        // Excalidraw treats Return as a canvas text gesture. Use CodeMirror's
        // own command so source editing still gets indentation and the canvas
        // never receives that shortcut.
        event.preventDefault();
        event.stopImmediatePropagation();
        insertNewlineAndIndent(view);
        return;
      }

      if (
        event.metaKey
        || event.ctrlKey
        || event.altKey
        || (event.key !== "Backspace" && event.key !== "Delete")
      ) return;
      // Excalidraw owns a page-level Delete shortcut. Capture the unmodified
      // deletion keys before they reach that handler, then execute the
      // equivalent CodeMirror command directly so the selected canvas host is
      // never deleted while source editing.
      event.preventDefault();
      event.stopImmediatePropagation();
      if (event.key === "Backspace") deleteCharBackward(view);
      else deleteCharForward(view);
    };
    window.addEventListener("keydown", ownEditorNavigationKey, { capture: true });
    return () => window.removeEventListener("keydown", ownEditorNavigationKey, { capture: true });
  }, []);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const nextValue = String(value || "");
    const currentValue = view.state.doc.toString();
    if (nextValue === currentValue) return;
    const selectionHead = Math.min(view.state.selection.main.head, nextValue.length);
    view.dispatch({
      changes: { from: 0, to: currentValue.length, insert: nextValue },
      selection: { anchor: selectionHead },
      annotations: externalDocumentUpdate.of(true),
    });
    forceLinting(view);
  }, [value]);

  useEffect(() => {
    if (!focusRequest || readOnly) return undefined;
    const frame = window.requestAnimationFrame(() => viewRef.current?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [focusRequest, readOnly]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const docLength = view.state.doc.length;
    const from = Math.max(0, Math.min(docLength, Number(highlightRange?.from) || 0));
    const to = Math.max(from, Math.min(docLength, Number(highlightRange?.to) || 0));
    const range = highlightRange && to > from ? { from, to } : null;
    const effects = [setExternalHighlight.of(range)];
    if (range && highlightRange?.scroll !== false) {
      effects.push(EditorView.scrollIntoView(range.from, { y: "center" }));
    }
    view.dispatch({ effects });
  }, [highlightRange]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view || scriptType !== "strudel") return undefined;
    const clearVisuals = () => {
      updateMiniLocations(view, []);
      updateSliderWidgets(view, []);
      if (strudelWidgets) updateWidgets(view, []);
      highlightMiniLocations(view, 0, []);
    };
    if (!strudelNodeId) {
      clearVisuals();
      return undefined;
    }
    let lastEvaluation = 0;
    const unsubscribe = getStrudelRuntimeManager().subscribeVisuals(strudelNodeId, visuals => {
      if (visuals.evaluation && visuals.evaluation !== lastEvaluation) {
        lastEvaluation = visuals.evaluation;
        const widgets = Array.isArray(visuals.widgets) ? visuals.widgets : [];
        updateMiniLocations(view, visuals.miniLocations || []);
        updateSliderWidgets(view, widgets.filter(widget => widget.type === "slider"));
        if (strudelWidgets) updateWidgets(view, widgets.filter(widget => widget.type !== "slider"));
        // The visual-only Output surface intentionally hides static source
        // glyphs. Strudel's document-wide flash would otherwise reveal the
        // entire code briefly on every evaluation; active range decorations
        // and widgets remain visible and animated below.
        if (!visualOnly) flash(view, 140);
      }
      highlightMiniLocations(view, Number(visuals.time) || 0, visuals.haps || []);
    });
    return () => {
      unsubscribe();
      clearVisuals();
    };
  }, [scriptType, strudelNodeId, strudelWidgets, visualOnly]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const profile = getScriptEditorProfile(scriptType);
    view.dispatch({
      effects: configurationRef.current.reconfigure([
        languageExtension(profile),
        showLineNumbers ? lineNumbers() : [],
        showFoldGutter ? foldGutter({ openText: "⌄", closedText: "›" }) : [],
        showLineNumbers || showFoldGutter ? lintGutter() : [],
        glyphOnlyOverlay ? glyphBackdropField : [],
        strudelExtensions(profile, strudelWidgets),
        placeholder ? placeholderExtension(placeholder) : [],
        EditorState.readOnly.of(Boolean(readOnly)),
        EditorView.editable.of(!readOnly),
        EditorView.contentAttributes.of({
          "aria-label": ariaLabel || `${profile.label} source`,
          "aria-multiline": "true",
          autocapitalize: "off",
          autocorrect: "off",
          spellcheck: "false",
        }),
      ]),
    });
    forceLinting(view);
  }, [ariaLabel, glyphOnlyOverlay, placeholder, readOnly, scriptType, showFoldGutter, showLineNumbers, strudelWidgets]);

  return (
    <div
      ref={hostRef}
      className={`underscores-code-editor ${visualOnly ? "strudel-visual-only" : ""} ${className}`.trim()}
      data-script-type={scriptType}
      data-visual-only={visualOnly ? "true" : undefined}
      style={style}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
    />
  );
}
