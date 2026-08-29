import React, { useEffect, useRef, useState } from "react";
import { renderChatMessage } from "./chatPresentation.js";
import { buildChatAutocompleteSuggestions, filterChatAutocompleteSuggestions, getChatAutocompleteToken, resizeChatInput } from "./chatAutocomplete.js";
import NumericInput from "./NumericInput.jsx";

const CHAT_FONT_SIZE_KEY = "underscores_multiplayer_chat_font_size";
const CHAT_ATTACHMENT_MAX_CHARS = 1_000_000;
const CHAT_ATTACHMENT_DND_TYPE = "application/x-underscores-chat-attachment";
const ELEMENTS_DND_TYPE = "application/x-underscores-elements";
const readChatFontSize = () => {
  try {
    const saved = Number(globalThis.localStorage?.getItem(CHAT_FONT_SIZE_KEY));
    if (Number.isFinite(saved)) return Math.max(10, Math.min(24, Math.round(saved)));
  } catch { /* use the panel default */ }
  return 14;
};

const normalizeChatAttachment = attachment => {
  const dataUrl = String(attachment?.dataUrl || "");
  if (!/^data:image\/png;base64,/i.test(dataUrl) || dataUrl.length > CHAT_ATTACHMENT_MAX_CHARS) return null;
  return {
    dataUrl,
    label: String(attachment?.label || "Context preview").trim().slice(0, 80) || "Context preview",
    ...(attachment?.tag ? { tag: String(attachment.tag) } : {}),
  };
};

const statusLabel = status => ({
  connecting: "Connecting",
  connected: "Connected",
  degraded: "Connection limited",
  error: "Connection error",
  disconnected: "Not sharing",
}[status] || status || "Not sharing");

const LinkIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M10 13a5 5 0 0 0 7.1.1l2-2a5 5 0 0 0-7.1-7.1l-1.1 1.1M14 11a5 5 0 0 0-7.1-.1l-2 2A5 5 0 0 0 12 20l1.1-1.1" />
  </svg>
);

const LeaveIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M10 17l5-5-5-5M15 12H3M15 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4" />
  </svg>
);

const ClearChatIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M5 6h14M9 6V4h6v2M7 6v14h10V6M10 10v7M14 10v7" />
  </svg>
);

const CopyIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M9 8h9a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2v-9a2 2 0 0 1 2-2Z" />
    <path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h2" />
  </svg>
);

const SendIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M14 5l7 7m0 0l-7 7m7-7H3" />
  </svg>
);

const AddContextIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M12 5v14M5 12h14" />
  </svg>
);

const ContextBackIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="m15 5-7 7 7 7M8 12h11" />
  </svg>
);

const FramesOnlyIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M8 4H5a1 1 0 0 0-1 1v3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3" />
  </svg>
);

export default function CollaborationPanel({ controller, state, getContextValue, commands = [] }) {
  const [copied, setCopied] = useState(false);
  const [transcriptCopied, setTranscriptCopied] = useState(false);
  const [error, setError] = useState("");
  const [editingName, setEditingName] = useState(false);
  const [editingValue, setEditingValue] = useState("");
  const [peopleExpanded, setPeopleExpanded] = useState(true);
  const [peopleFitContent, setPeopleFitContent] = useState(false);
  const [chatFramesOnly, setChatFramesOnly] = useState(false);
  const [chatDraft, setChatDraft] = useState("");
  const [chatAutocompleteToken, setChatAutocompleteToken] = useState(null);
  const [chatAutocompleteIndex, setChatAutocompleteIndex] = useState(0);
  const [showContextDropdown, setShowContextDropdown] = useState(false);
  const [contextMenuTab, setContextMenuTab] = useState("main");
  const [chatAttachments, setChatAttachments] = useState([]);
  const [chatFontSize, setChatFontSize] = useState(readChatFontSize);
  const editingRef = useRef(null);
  const messagesEndRef = useRef(null);
  const chatInputRef = useRef(null);
  const active = Boolean(state?.active);
  const identity = state?.identity || controller?.getIdentity?.() || { name: "Guest", color: "#1971c2" };
  const peers = state?.peers || [];
  const messages = state?.messages || [];
  const chatAutocompleteSuggestions = buildChatAutocompleteSuggestions(commands);
  const filteredChatAutocompleteSuggestions = filterChatAutocompleteSuggestions(chatAutocompleteToken, chatAutocompleteSuggestions);
  const visibleChatAutocompleteSuggestions = filteredChatAutocompleteSuggestions.slice(0, 12);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ block: "end" });
  }, [messages.length]);

  useEffect(() => {
    if (!active) {
      setChatDraft("");
      setChatAutocompleteToken(null);
      setChatAutocompleteIndex(0);
      setChatAttachments([]);
      setShowContextDropdown(false);
      setContextMenuTab("main");
    }
  }, [active]);

  useEffect(() => {
    resizeChatInput(chatInputRef.current);
  }, [chatDraft]);

  const run = async action => {
    setError("");
    try {
      return await action();
    } catch (reason) {
      setError(reason?.message || String(reason));
      return null;
    }
  };

  const copy = () => run(async () => {
    await controller.copyLink();
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  });

  const copyTextToClipboard = async text => {
    const value = String(text || "");
    if (!value.trim()) return false;
    try {
      if (globalThis.navigator?.clipboard?.writeText) {
        await globalThis.navigator.clipboard.writeText(value);
        return true;
      }
    } catch {
      // Fall through to the synchronous embedded-browser fallback.
    }
    if (typeof document === "undefined" || typeof document.execCommand !== "function") {
      throw new Error("Clipboard access is unavailable in this browser.");
    }
    const previousFocus = document.activeElement;
    const textarea = document.createElement("textarea");
    textarea.value = value;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "fixed";
    textarea.style.left = "-9999px";
    textarea.style.top = "0";
    textarea.style.opacity = "0";
    textarea.style.pointerEvents = "none";
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    textarea.setSelectionRange(0, value.length);
    let copiedValue = false;
    try {
      copiedValue = document.execCommand("copy") === true;
    } finally {
      textarea.remove();
      previousFocus?.focus?.();
    }
    if (!copiedValue) throw new Error("Clipboard access is unavailable in this browser.");
    return true;
  };

  const copyTranscript = () => run(async () => {
    const transcript = messages.map(message => {
      const attachmentText = (message.attachments || [])
        .map(attachment => `[Attachment: ${attachment.label || "Context preview"}]`)
        .join("\n");
      return `${message.username || "Guest"}:\n${message.text}${attachmentText ? `\n${attachmentText}` : ""}`;
    }).join("\n\n");
    if (!transcript.trim()) return;
    await copyTextToClipboard(transcript);
    setTranscriptCopied(true);
    window.setTimeout(() => setTranscriptCopied(false), 1600);
  });

  const beginNameEdit = () => {
    setEditingValue(identity.name);
    setEditingName(true);
    requestAnimationFrame(() => {
      editingRef.current?.focus();
      editingRef.current?.select();
    });
  };

  const finishNameEdit = (commit = true) => {
    const name = editingValue.trim();
    setEditingName(false);
    if (commit && name && name !== identity.name) void run(() => controller.setIdentity({ name }));
  };

  const sendChat = async () => {
    const text = chatDraft.trim();
    if (!text) return;

    const attachments = [...chatAttachments];
    const typedPngContext = [
      ["@selection-as-png", "selection-as-png", "Selection (PNG)"],
      ["@canvas-as-png", "canvas-as-png", "Canvas (PNG)"],
    ];
    if (getContextValue) {
      for (const [tag, type, label] of typedPngContext) {
        if (!text.includes(tag) || attachments.length >= 2 || attachments.some(attachment => attachment.tag === tag)) continue;
        const value = await run(() => getContextValue(type));
        if (value?.error) {
          setError(value.error);
          return;
        }
        if (!value?.dataUrl) {
          setError(`Unable to attach ${label.toLowerCase()}.`);
          return;
        }
        const attachment = normalizeChatAttachment({ dataUrl: value.dataUrl, label, tag });
        if (!attachment) {
          setError(`${label} is too large to attach.`);
          return;
        }
        attachments.push(attachment);
      }
    }

    setChatDraft("");
    setChatAutocompleteToken(null);
    setChatAutocompleteIndex(0);
    setChatAttachments([]);
    await run(() => controller.sendChat(text, { attachments }));
  };

  const handleChatDraftChange = event => {
    const value = event.target.value;
    setChatDraft(value);
    resizeChatInput(event.currentTarget);
    const token = getChatAutocompleteToken(value, event.target.selectionStart);
    setChatAutocompleteToken(token);
    setChatAutocompleteIndex(0);
  };

  const selectChatAutocomplete = suggestion => {
    const textarea = chatInputRef.current;
    const token = chatAutocompleteToken || getChatAutocompleteToken(chatDraft, textarea?.selectionStart);
    if (!textarea || !token || !suggestion?.name) return;
    const insertion = `${suggestion.name} `;
    const nextValue = `${chatDraft.slice(0, token.start)}${insertion}${chatDraft.slice(token.end)}`;
    const nextCursor = token.start + insertion.length;
    setChatDraft(nextValue);
    setChatAutocompleteToken(null);
    setChatAutocompleteIndex(0);
    requestAnimationFrame(() => {
      textarea.focus();
      textarea.selectionStart = nextCursor;
      textarea.selectionEnd = nextCursor;
      resizeChatInput(textarea);
    });
  };

  const insertContextTag = tag => {
    setChatDraft(previous => `${previous}${previous && !/\s$/.test(previous) ? " " : ""}${tag} `);
    setChatAutocompleteToken(null);
    setChatAutocompleteIndex(0);
    setShowContextDropdown(false);
    setContextMenuTab("main");
  };

  const chooseContext = async (type, tag, label) => {
    if (!getContextValue || !type || !type.endsWith("-as-png")) {
      insertContextTag(tag);
      return;
    }
    const value = await run(() => getContextValue(type));
    if (value?.error) {
      setError(value.error);
      return;
    }
    if (value?.dataUrl) {
      if (!addChatAttachment({ dataUrl: value.dataUrl, label, tag })) {
        setError(`${label} is too large to attach.`);
        return;
      }
      insertContextTag(tag);
    }
  };

  const addChatAttachment = attachment => {
    const normalized = normalizeChatAttachment(attachment);
    if (!normalized) return false;
    setChatAttachments(previous => [...previous, normalized].slice(-2));
    return true;
  };

  const handleComposerDragOver = event => {
    const types = Array.from(event.dataTransfer?.types || []);
    if (!types.includes(CHAT_ATTACHMENT_DND_TYPE) && !types.includes(ELEMENTS_DND_TYPE) && !types.includes("Files")) return;
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = "copy";
  };

  const handleComposerDrop = event => {
    const encoded = event.dataTransfer?.getData(CHAT_ATTACHMENT_DND_TYPE);
    if (encoded) {
      try {
        const attachment = JSON.parse(encoded);
        if (addChatAttachment(attachment)) {
          event.preventDefault();
          event.stopPropagation();
          return;
        }
      } catch { /* let a regular file drop try next */ }
    }
    const encodedElements = event.dataTransfer?.getData(ELEMENTS_DND_TYPE);
    if (encodedElements && getContextValue) {
      try {
        const elementIds = JSON.parse(encodedElements);
        if (Array.isArray(elementIds) && elementIds.length) {
          event.preventDefault();
          event.stopPropagation();
          void run(async () => {
            const value = await getContextValue("selection-as-png", elementIds);
            if (value?.error) {
              setError(value.error);
              return;
            }
            if (value?.dataUrl) {
              if (addChatAttachment({ dataUrl: value.dataUrl, label: "Selection (PNG)", tag: "@selection-as-png" })) {
                insertContextTag("@selection-as-png");
              } else {
                setError("Selection (PNG) is too large to attach.");
              }
            }
          });
          return;
        }
      } catch { /* let a regular file drop try next */ }
    }
    const file = [...(event.dataTransfer?.files || [])].find(candidate => candidate.type === "image/png");
    if (!file) return;
    event.preventDefault();
    event.stopPropagation();
    const reader = new FileReader();
    reader.onload = () => addChatAttachment({ dataUrl: reader.result, label: file.name || "PNG attachment" });
    reader.readAsDataURL(file);
  };

  const contextMenuItems = {
    media: [
      ["Canvas (PNG)", "canvas-as-png", "@canvas-as-png", "Entire canvas"],
      ["Selection (PNG)", "selection-as-png", "@selection-as-png", "Selected elements"],
    ],
    mentions: [
      ["Selection", null, "@selection", "Selected elements and code fields"],
      ["Canvas", null, "@canvas", "Entire canvas"],
      ["Selection (SVG)", null, "@selection-as-svg", "Selected elements as SVG"],
      ["Canvas (SVG)", null, "@canvas-as-svg", "Entire canvas as SVG"],
      ["Livecode", null, "@livecode", "Livecode source and runtime state"],
      ["Score", null, "@score", "Current score and transport state"],
    ],
    actions: [
      ["Mermaid", null, "@mermaid", "Create Mermaid diagrams"],
      ["Manim", null, "@manim", "Math animation script"],
      ["Image generation", null, "@imagegen", "Generate images and illustrations"],
    ],
  };

  const updateChatFontSize = value => {
    if (!Number.isFinite(Number(value))) return;
    const next = Math.max(10, Math.min(24, Math.round(Number(value))));
    setChatFontSize(next);
    try { globalThis.localStorage?.setItem(CHAT_FONT_SIZE_KEY, String(next)); } catch { /* keep the setting for this session */ }
  };

  const handleChatBlockAction = event => {
    const actionButton = event.target?.closest?.("[data-chat-action][data-chat-block-source]");
    if (!actionButton || actionButton.getAttribute("data-chat-action") !== "copy") return;
    event.preventDefault();
    event.stopPropagation();
    let source = actionButton.getAttribute("data-chat-block-source") || "";
    try { source = decodeURIComponent(source); } catch { /* keep the encoded source as a fallback */ }
    if (!source) return;
    void navigator.clipboard?.writeText?.(source);
  };

  const togglePeople = event => {
    if (event.shiftKey) {
      setPeopleExpanded(true);
      setPeopleFitContent(fitContent => !fitContent);
      return;
    }
    setPeopleFitContent(false);
    setPeopleExpanded(expanded => !expanded);
  };

  return (
    <div
      id="underscores-panel-multiplayer"
      className="underscores-collaboration-panel"
      style={{ "--underscores-chat-font-size": `${chatFontSize}px` }}
    >
      <div className="underscores-collaboration-panel-toolbar">
        <div className="underscores-collaboration-toolbar-status">
          {active && <button className="underscores-collaboration-icon-button" type="button" onClick={copy} title={copied ? "Link copied" : "Copy room link"} aria-label={copied ? "Room link copied" : "Copy room link"}><LinkIcon /></button>}
          <span className={`underscores-collaboration-status is-${state?.status || "disconnected"}`}>
            {statusLabel(state?.status)}
          </span>
          {active && <span className="underscores-collaboration-count">{peers.length + 1} here</span>}
        </div>
        {active && (
          <div className="underscores-collaboration-toolbar-actions">
            <label className="underscores-collaboration-font-size-control" title="Chat font size">
              <span aria-hidden="true">Aa</span>
              <NumericInput min="10" max="24" step="1" value={chatFontSize} defaultValue={14} onCommit={updateChatFontSize} aria-label="Chat font size" />
            </label>
            <button className="underscores-collaboration-icon-button" type="button" onClick={copyTranscript} title={transcriptCopied ? "Transcript copied" : "Copy transcript"} aria-label={transcriptCopied ? "Transcript copied" : "Copy transcript"}><CopyIcon /></button>
            <button className="underscores-collaboration-icon-button" type="button" onClick={() => run(() => controller.leaveRoom())} title="Leave room" aria-label="Leave room"><LeaveIcon /></button>
            <button className="underscores-collaboration-icon-button" type="button" onClick={() => run(() => controller.clearChat?.())} title="Clear chat" aria-label="Clear chat"><ClearChatIcon /></button>
          </div>
        )}
      </div>

      {!active ? (
        <div className="underscores-collaboration-empty">
          <button className="underscores-collaboration-primary" type="button" onClick={() => run(() => controller.createRoom())}>
            Create room
          </button>
        </div>
      ) : (
        <>
          <section className={`underscores-collaboration-section underscores-collaboration-people${peopleExpanded ? "" : " is-collapsed"}${peopleFitContent ? " is-fit-content" : ""}`} aria-labelledby="multiplayer-people-heading">
            <h3 className="underscores-collaboration-people-heading">
              <button
                id="multiplayer-people-heading"
                className="underscores-collaboration-section-toggle"
                type="button"
                aria-expanded={peopleExpanded}
                aria-controls="multiplayer-people-list"
                onClick={togglePeople}
                title="Click to expand or collapse. Shift-click to fit the roster."
              >
                <span className="underscores-collaboration-disclosure" aria-hidden="true">{peopleExpanded ? "⌄" : "›"}</span>
                People
              </button>
              <button
                className={`underscores-collaboration-frames-toggle${chatFramesOnly ? " is-active" : ""}`}
                type="button"
                aria-pressed={chatFramesOnly}
                aria-label={chatFramesOnly ? "Show chat participant names" : "Show chat frames only"}
                title={chatFramesOnly ? "Show participant names" : "Show chat frames only"}
                onClick={() => setChatFramesOnly(framesOnly => !framesOnly)}
              >
                <FramesOnlyIcon />
              </button>
            </h3>
            {peopleExpanded && <div id="multiplayer-people-list" className="underscores-collaboration-peers" aria-label="People in room">
              <div className="underscores-collaboration-peer is-local">
                <label className="underscores-collaboration-peer-color" style={{ background: identity.color }} title="Your pointer color">
                  <input
                    type="color"
                    value={identity.color}
                    aria-label="Your pointer color"
                    onChange={event => run(() => controller.setIdentity({ color: event.target.value }))}
                  />
                </label>
                {editingName ? (
                  <input
                    ref={editingRef}
                    className="underscores-collaboration-peer-name-input"
                    type="text"
                    value={editingValue}
                    maxLength={40}
                    aria-label="Rename yourself"
                    onChange={event => setEditingValue(event.target.value)}
                    onBlur={() => finishNameEdit()}
                    onKeyDown={event => {
                      if (event.key === "Enter") { event.preventDefault(); finishNameEdit(); }
                      if (event.key === "Escape") { event.preventDefault(); finishNameEdit(false); }
                    }}
                  />
                ) : (
                  <span className="underscores-collaboration-peer-name is-editable" onDoubleClick={beginNameEdit} title="Double-click to rename">
                    {identity.name}
                  </span>
                )}
                <small>You</small>
              </div>
              {peers.map(peer => (
                <div className="underscores-collaboration-peer" key={peer.peerId}>
                  <span style={{ background: peer.color }} />
                  <span className="underscores-collaboration-peer-name">{peer.username || "Guest"}</span>
                  <small>{peer.idleState === "away" ? "Away" : "Here"}</small>
                </div>
              ))}
            </div>}
          </section>

          {state?.capacityWarning && <div className="underscores-collaboration-warning">Room is above the 16-person target.</div>}
          <div className={`underscores-collaboration-chat${chatFramesOnly ? " is-frames-only" : ""}`} style={{ "--underscores-chat-font-size": `${chatFontSize}px` }}>
            <div className="underscores-collaboration-chat-messages" onClick={handleChatBlockAction} aria-live="polite" aria-label="Room messages">
              {messages.length === 0 && <div className="underscores-collaboration-chat-empty">No messages yet.</div>}
              {messages.map(message => {
                const local = message.actorId === controller.actorId;
                return (
                  <div
                    key={message.id}
                    className={`underscores-collaboration-chat-message${local ? " is-local" : ""}${message.participantKind === "assistant" ? " is-assistant" : ""}`}
                    style={{ "--participant-color": message.color }}
                  >
                    <span className="underscores-collaboration-chat-author">{message.username}</span>
                    <div
                      className="ai-chat-message-content"
                      dangerouslySetInnerHTML={{ __html: renderChatMessage({ source: message.text, role: message.participantKind === "assistant" ? "assistant" : "user" }) }}
                    />
                    {message.attachments?.map((attachment, attachmentIndex) => (
                      <img
                        key={`${message.id}:attachment:${attachmentIndex}`}
                        className="underscores-collaboration-chat-attachment"
                        src={attachment.dataUrl}
                        alt={attachment.label || "Context preview"}
                        title="Drag to canvas"
                        draggable="true"
                        onDragStart={event => {
                          event.dataTransfer.effectAllowed = "copy";
                          event.dataTransfer.setData(CHAT_ATTACHMENT_DND_TYPE, JSON.stringify({ dataUrl: attachment.dataUrl, label: attachment.label || "Context preview" }));
                          event.dataTransfer.setData("text/plain", attachment.label || "Context preview");
                        }}
                      />
                    ))}
                  </div>
                );
              })}
              <div ref={messagesEndRef} />
            </div>
            <div className="underscores-collaboration-chat-composer" onDragOver={handleComposerDragOver} onDrop={handleComposerDrop}>
              {chatAttachments.length > 0 && (
                <div className="underscores-collaboration-chat-attachments" aria-label="Pending context attachments">
                  {chatAttachments.map((attachment, attachmentIndex) => (
                    <div className="underscores-collaboration-chat-attachment-preview" key={`${attachment.dataUrl}:${attachmentIndex}`}>
                      <img src={attachment.dataUrl} alt={attachment.label || "Context preview"} />
                      <button
                        type="button"
                        onClick={() => setChatAttachments(previous => previous.filter((_, index) => index !== attachmentIndex))}
                        aria-label={`Remove ${attachment.label || "context attachment"}`}
                        title="Remove attachment"
                      >×</button>
                    </div>
                  ))}
                </div>
              )}
              <div className="underscores-collaboration-chat-composer-row">
                <div className="underscores-collaboration-chat-context-picker">
                  <button
                    className="underscores-collaboration-chat-context-button"
                    type="button"
                    aria-label="Add context"
                    aria-expanded={showContextDropdown}
                    title="Add context"
                    onClick={() => {
                      setShowContextDropdown(open => !open);
                      setContextMenuTab("main");
                    }}
                  >
                    <AddContextIcon />
                  </button>
                  {showContextDropdown && (
                    <div className="underscores-collaboration-chat-context-menu" role="menu" aria-label="Add context">
                      {contextMenuTab === "main" ? (
                        <>
                          <button type="button" role="menuitem" onClick={() => setContextMenuTab("media")}><strong>▧</strong><span><b>Media (PNG)</b><small>Attach a canvas preview</small></span><span className="is-chevron">›</span></button>
                          <button type="button" role="menuitem" onClick={() => setContextMenuTab("mentions")}><strong>@</strong><span><b>Mentions</b><small>Reference canvas context</small></span><span className="is-chevron">›</span></button>
                          <button type="button" role="menuitem" onClick={() => setContextMenuTab("actions")}><strong>↗</strong><span><b>Actions &amp; Skills</b><small>Use assistant-compatible tags</small></span><span className="is-chevron">›</span></button>
                        </>
                      ) : (
                        <>
                          <button className="is-context-back" type="button" role="menuitem" onClick={() => setContextMenuTab("main")}><ContextBackIcon /><span>Back</span></button>
                          {contextMenuItems[contextMenuTab].map(([label, type, tag, description]) => (
                            <button key={tag} type="button" role="menuitem" onClick={() => void chooseContext(type, tag, label)}>
                              <span><b>{tag}</b><small>{description}</small></span>
                            </button>
                          ))}
                        </>
                      )}
                    </div>
                  )}
                </div>
              <textarea
                ref={chatInputRef}
                value={chatDraft}
                rows={1}
                maxLength={2000}
                placeholder="..."
                aria-label="Message room"
                title="Message room"
                onChange={handleChatDraftChange}
                onKeyDown={event => {
                  if (visibleChatAutocompleteSuggestions.length > 0) {
                    if (event.key === "ArrowDown") {
                      event.preventDefault();
                      setChatAutocompleteIndex(previous => (previous + 1) % visibleChatAutocompleteSuggestions.length);
                      return;
                    }
                    if (event.key === "ArrowUp") {
                      event.preventDefault();
                      setChatAutocompleteIndex(previous => (previous - 1 + visibleChatAutocompleteSuggestions.length) % visibleChatAutocompleteSuggestions.length);
                      return;
                    }
                    if (event.key === "Enter" || event.key === "Tab") {
                      event.preventDefault();
                      selectChatAutocomplete(visibleChatAutocompleteSuggestions[chatAutocompleteIndex]);
                      return;
                    }
                    if (event.key === "Escape") {
                      event.preventDefault();
                      setChatAutocompleteToken(null);
                      return;
                    }
                  }
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    void sendChat();
                  }
                }}
              />
              <button className="underscores-collaboration-chat-send" type="button" onClick={() => void sendChat()} disabled={!chatDraft.trim()} title="Send message" aria-label="Send message"><SendIcon /></button>
              </div>
              {visibleChatAutocompleteSuggestions.length > 0 && (
                <div className="underscores-collaboration-chat-autocomplete" role="listbox" aria-label="Chat suggestions">
                  {visibleChatAutocompleteSuggestions.map((suggestion, index) => (
                    <button
                      key={`${suggestion.trigger}:${suggestion.name}`}
                      type="button"
                      role="option"
                      aria-selected={index === chatAutocompleteIndex}
                      className={index === chatAutocompleteIndex ? "is-active" : ""}
                      onMouseDown={event => event.preventDefault()}
                      onClick={() => selectChatAutocomplete(suggestion)}
                    >
                      <span>{suggestion.name}</span>
                      <small>{suggestion.description}</small>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </>
      )}
      {(error || state?.error) && <div className="underscores-collaboration-error" role="status">{error || state.error}</div>}
    </div>
  );
}
