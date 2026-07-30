import React, { useEffect, useLayoutEffect, useRef } from "react";
import {
  acceptCompletion,
  autocompletion,
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
  keymap,
  lineNumbers,
  placeholder as placeholderExtension,
  rectangularSelection,
  runScopeHandlers,
} from "@codemirror/view";
import { classHighlighter } from "@lezer/highlight";
import { sourceDiagnostic } from "./scriptEditorDiagnostics.js";
import { getScriptEditorCompletions, getScriptEditorProfile } from "./scriptEditorProfiles.js";

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
          Decoration.mark({ class: "cm-drawerator-source-highlight" }).range(range.from, range.to),
        ])
        : Decoration.none;
    }
    return next;
  },
  provide: field => EditorView.decorations.from(field),
});

const glyphBackdropMark = Decoration.mark({ class: "cm-drawerator-glyph-backdrop" });
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

const languageExtension = profile => (
  profile.language === "html"
    ? html({ autoCloseTags: true, matchClosingTags: true })
    : profile.language === "javascript"
      ? javascript({ jsx: false, typescript: false })
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
      source: diagnostic?.source ? String(diagnostic.source) : "Drawerator",
    }];
  })
);

export default function DraweratorCodeEditor({
  value,
  onChange,
  onBlur,
  onRun,
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
  onDoubleClick,
  onClick,
  focusRequest = 0,
  glyphOnlyOverlay = false,
  className = "",
  style,
}) {
  const hostRef = useRef(null);
  const viewRef = useRef(null);
  const onChangeRef = useRef(onChange);
  const onBlurRef = useRef(onBlur);
  const onRunRef = useRef(onRun);
  const onSelectionChangeRef = useRef(onSelectionChange);
  const scriptTypeRef = useRef(scriptType);
  const diagnosticsRef = useRef(getDiagnostics);
  const onToggleLineNumbersRef = useRef(onToggleLineNumbers);
  const onCycleViewRef = useRef(onCycleView);
  const lineNumberToggleChordRef = useRef(false);
  const lineNumberToggleTimerRef = useRef(null);
  const configurationRef = useRef(new Compartment());

  onChangeRef.current = onChange;
  onBlurRef.current = onBlur;
  onRunRef.current = onRun;
  onSelectionChangeRef.current = onSelectionChange;
  scriptTypeRef.current = scriptType;
  diagnosticsRef.current = getDiagnostics;
  onToggleLineNumbersRef.current = onToggleLineNumbers;
  onCycleViewRef.current = onCycleView;

  useLayoutEffect(() => {
    if (!hostRef.current) return undefined;

    const profile = getScriptEditorProfile(scriptTypeRef.current);
    const completionSource = context => {
      const token = completionToken(context);
      if (!context.explicit && (!token || token.from === token.to)) return null;
      return {
        from: token?.from ?? context.pos,
        options: getScriptEditorCompletions(scriptTypeRef.current),
      };
    };
    const runCommand = () => {
      if (typeof onRunRef.current !== "function") return false;
      onRunRef.current();
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
            { key: "Mod-Enter", run: runCommand, preventDefault: true },
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
            }
          }),
          EditorView.domEventHandlers({
            blur: () => {
              onBlurRef.current?.();
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
      const isCodeMirrorCommand = (
        (event.metaKey || event.ctrlKey)
        && ["a", "z", "y", "f", "g", "h", "enter"].includes(normalizedKey)
      ) || (event.ctrlKey && normalizedKey === "m")
        || ["escape", "tab"].includes(normalizedKey);

      // Drawerator and Excalidraw both install capture-phase shortcuts. Give
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
    if (!view) return;
    const profile = getScriptEditorProfile(scriptType);
    view.dispatch({
      effects: configurationRef.current.reconfigure([
        languageExtension(profile),
        showLineNumbers ? lineNumbers() : [],
        showFoldGutter ? foldGutter({ openText: "⌄", closedText: "›" }) : [],
        showLineNumbers || showFoldGutter ? lintGutter() : [],
        glyphOnlyOverlay ? glyphBackdropField : [],
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
  }, [ariaLabel, glyphOnlyOverlay, placeholder, readOnly, scriptType, showFoldGutter, showLineNumbers]);

  return (
    <div
      ref={hostRef}
      className={`drawerator-code-editor ${className}`.trim()}
      data-script-type={scriptType}
      style={style}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
    />
  );
}
