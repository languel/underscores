import React, { useState, useEffect, useRef } from "react";
import { Excalidraw, Sidebar, MainMenu, WelcomeScreen, exportToSvg, exportToCanvas } from "@excalidraw/excalidraw";
import "./App.css";

// System Prompt guiding the local LLM on drawing tools
const SYSTEM_PROMPT = `You are "Drawerator", an autonomous, high-performance drawing assistant.
You drive a collaborative sketchboard (Excalidraw) programmatically by issuing precise XML tool tags inside your markdown responses.

CRITICAL: You MUST write your text explanation FIRST, then output any tool XML tags.

Available Drawing XML tags:
1. Draw Rectangle:
   <rect x="[coord]" y="[coord]" w="[width]" h="[height]" color="[hex_color]" fill="[hex_color/transparent]"/>
2. Draw Circle/Ellipse:
   <circle x="[center_x]" y="[center_y]" r="[radius]" color="[hex_color]" fill="[hex_color/transparent]"/>
3. Draw Straight Line:
   <line x1="[start_x]" y1="[start_y]" x2="[end_x]" y2="[end_y]" color="[hex_color]"/>
4. Draw Freehand Path:
   <path points="x1,y1 x2,y2 x3,y3 ..." color="[hex_color]"/>
5. Erase Element by ID:
   <erase id="[element_id]"/>
6. Clear Entire Canvas:
   <clear/>

Guidelines:
- All shapes should be sized logically (typical screen coords range from 0 to 1000).
- If the user selected a shape or path, you will receive its coordinates in the context. Use this context to duplicate, resize, move, or offset the shape.
- To move a shape, you can erase the old id using <erase id="[id]"/> and redraw it at the new coordinates!
- Keep your conversational text responses extremely concise and to the point.
`;

const INITIAL_GREETING = "Hello! I am your drawing assistant powered by local AI. You can write prompts like \"draw a flow chart\", \"sketch a house\", or \"clear the canvas\" and I will execute the drawing tools programmatically!";

function createBaseElement(type, x, y, width, height, strokeColor = "#f8fafc") {
  return {
    id: `${type}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    type,
    x,
    y,
    width,
    height,
    angle: 0,
    strokeColor,
    backgroundColor: "transparent",
    fillStyle: "hachure",
    strokeWidth: 2,
    strokeStyle: "solid",
    roughness: 1,
    opacity: 100,
    groupIds: [],
    frameId: null,
    roundness: null,
    seed: Math.floor(Math.random() * 1000000),
    version: 1,
    versionNonce: Math.floor(Math.random() * 1000000),
    isDeleted: false,
    boundElements: null,
    updated: Date.now(),
    link: null,
    locked: false
  };
}

const isColorTransparent = (color) => {
  if (!color) return false;
  const c = color.trim().toLowerCase();
  if (c === "transparent") return true;
  if (c.startsWith("#") && c.length === 9 && c.endsWith("00")) return true;
  if (c.startsWith("#") && c.length === 5 && c.endsWith("0")) return true;
  if (c.startsWith("rgba")) {
    const parts = c.split(",");
    if (parts.length === 4) {
      const alpha = parseFloat(parts[3].replace(")", ""));
      return alpha === 0;
    }
  }
  return false;
};

const makeColorTransparent = (color) => {
  if (!color) return "transparent";
  const c = color.trim();
  const cLower = c.toLowerCase();
  if (cLower.startsWith("#")) {
    if (c.length === 7) return c + "00";
    if (c.length === 4) {
      const r = c[1], g = c[2], b = c[3];
      return `#${r}${r}${g}${g}${b}${b}00`;
    }
  } else if (cLower.startsWith("rgb(")) {
    return cLower.replace("rgb(", "rgba(").replace(")", ", 0)");
  }
  return "transparent";
};

const makeColorOpaque = (color, fallback) => {
  if (!color) return fallback;
  const c = color.trim();
  const cLower = c.toLowerCase();
  if (cLower === "transparent") return fallback;
  if (cLower.startsWith("#")) {
    if (c.length === 9 && cLower.endsWith("00")) {
      return c.slice(0, 7);
    }
    if (c.length === 5 && cLower.endsWith("0")) {
      return c.slice(0, 4);
    }
  } else if (cLower.startsWith("rgba(")) {
    const parts = c.split(",");
    if (parts.length === 4) {
      return parts.slice(0, 3).join(",").replace(/rgba\(/i, "rgb(") + ")";
    }
  }
  return fallback;
};

const cleanApiUrl = (url, provider) => {
  if (!url) return "";
  let clean = url.trim().replace(/\/+$/, "");
  if (provider === "lmstudio" || provider === "openai") {
    if (clean.endsWith("/v1")) {
      clean = clean.slice(0, -3);
    }
  }
  return clean;
};

function App() {
  // App States
  const [excalidrawAPI, setExcalidrawAPI] = useState(null);
  const [theme, setTheme] = useState(() => localStorage.getItem("drawerator_theme") || "dark");
  const [sidebarDocked, setSidebarDocked] = useState(true);
  const [showSettings, setShowSettings] = useState(false);
  const [showCommandPalette, setShowCommandPalette] = useState(false);
  const [commandSearch, setCommandSearch] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [satoriMode, setSatoriMode] = useState(true);
  const [showToolbarHints, setShowToolbarHints] = useState(() => {
    const saved = localStorage.getItem("drawerator_show_toolbar_hints");
    return saved === "true";
  });
  const [showBottomNotifications, setShowBottomNotifications] = useState(() => {
    const saved = localStorage.getItem("drawerator_show_bottom_notifications");
    return saved === "true";
  });
  const [forceDesktopLayout, setForceDesktopLayout] = useState(() => {
    const saved = localStorage.getItem("drawerator_force_desktop_layout");
    return saved !== "false";
  });
  const [activeSettingsTab, setActiveSettingsTab] = useState("ai");
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [showContextDropdown, setShowContextDropdown] = useState(false);
  const [contextMenuTab, setContextMenuTab] = useState("main");
  const [showAutocomplete, setShowAutocomplete] = useState(false);
  const [autocompleteSearch, setAutocompleteSearch] = useState("");
  const [autocompleteIndex, setAutocompleteIndex] = useState(0);
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    const saved = localStorage.getItem("drawerator_sidebar_width");
    return saved ? parseInt(saved, 10) : 380;
  });

  const handleSidebarResizeMouseDown = (e) => {
    e.preventDefault();
    const handleMouseMove = (moveEvent) => {
      const newWidth = Math.max(280, Math.min(800, window.innerWidth - moveEvent.clientX));
      setSidebarWidth(newWidth);
      localStorage.setItem("drawerator_sidebar_width", newWidth);
    };
    const handleMouseUp = () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
  };
  
  // Chat States
  const [chatHistory, setChatHistory] = useState([
    { role: "system", content: SYSTEM_PROMPT },
    { role: "assistant", content: INITIAL_GREETING }
  ]);
  const [userInput, setUserInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  
  // Settings States
  const [aiSettings, setAiSettings] = useState(() => {
    const saved = localStorage.getItem("drawerator_ai_settings");
    if (saved) {
      try { return JSON.parse(saved); } catch (e) {}
    }
    return {
      provider: "ollama",
      url: "http://localhost:11434",
      model: ""
    };
  });
  const [modelsList, setModelsList] = useState([]);
  const [connectionStatus, setConnectionStatus] = useState("pending");
  const [toolLogs, setToolLogs] = useState([]);
  
  const messagesEndRef = useRef(null);

  // Sync theme to body class
  useEffect(() => {
    if (theme === "light") {
      document.body.classList.add("light-mode");
    } else {
      document.body.classList.remove("light-mode");
    }
    localStorage.setItem("drawerator_theme", theme);
  }, [theme]);

  // Scroll chat messages to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatHistory]);

  // Test AI Connection & Fetch Models
  const testAIConnection = async (settings = aiSettings) => {
    setConnectionStatus("pending");
    const { provider } = settings;
    const url = cleanApiUrl(settings.url, provider);
    
    try {
      if (provider === "ollama") {
        const res = await fetch(`${url}/api/tags`);
        if (res.ok) {
          const data = await res.json();
          const list = data.models ? data.models.map(m => m.name) : [];
          setModelsList(list);
          setConnectionStatus("ok");
          if (list.length > 0 && !settings.model) {
            setAiSettings(prev => ({ ...prev, model: list[0] }));
          }
        } else {
          setConnectionStatus("error");
        }
      } else if (provider === "lmstudio") {
        const res = await fetch(`${url}/v1/models`);
        if (res.ok) {
          const data = await res.json();
          const list = data.data ? data.data.map(m => m.id) : [];
          setModelsList(list);
          setConnectionStatus("ok");
          if (list.length > 0 && !settings.model) {
            setAiSettings(prev => ({ ...prev, model: list[0] }));
          }
        } else {
          setConnectionStatus("error");
        }
      } else {
        setConnectionStatus("ok");
      }
    } catch (e) {
      setConnectionStatus("error");
    }
  };

  const ALL_TAGS = [
    { name: "@selection", description: "Selected elements (JSON)" },
    { name: "@selection-as-svg", description: "Selected elements (SVG)" },
    { name: "@selection-as-png", description: "Selected elements (PNG)" },
    { name: "@canvas", description: "Entire canvas (JSON)" },
    { name: "@canvas-as-svg", description: "Entire canvas (SVG)" },
    { name: "@canvas-as-png", description: "Entire canvas (PNG)" },
    { name: "@mermaid", description: "Create Mermaid diagrams" },
    { name: "@manim", description: "Math animation script" },
    { name: "@imagegen", description: "Generate images/illustrations" }
  ];

  const getFilteredTags = () => {
    if (!autocompleteSearch) return ALL_TAGS;
    return ALL_TAGS.filter(tag => tag.name.toLowerCase().includes(autocompleteSearch.toLowerCase()));
  };

  const getContextValue = async (type) => {
    if (!excalidrawAPI) return null;
    const allElements = excalidrawAPI.getSceneElements();
    const activeState = excalidrawAPI.getAppState();
    const files = excalidrawAPI.getFiles();

    const selectedElements = allElements.filter(el => activeState.selectedElementIds?.[el.id]);

    if (type.startsWith("selection") && selectedElements.length === 0) {
      return { error: "No elements are currently selected on the canvas." };
    }

    const targetElements = type.startsWith("selection") ? selectedElements : allElements.filter(el => !el.isDeleted);

    if (type === "selection" || type === "canvas") {
      const cleanElements = targetElements.map(el => ({
        type: el.type,
        id: el.id,
        x: Math.round(el.x),
        y: Math.round(el.y),
        w: Math.round(el.width),
        h: Math.round(el.height),
        points: el.points ? el.points.map(p => [Math.round(p[0]), Math.round(p[1])]) : undefined
      }));
      return { text: JSON.stringify(cleanElements, null, 2), type: "json" };
    }

    if (type === "selection-as-svg" || type === "canvas-as-svg") {
      try {
        const svgElement = await exportToSvg({
          elements: targetElements,
          appState: { ...activeState, exportBackground: true },
          files
        });
        return { text: svgElement.outerHTML, type: "svg" };
      } catch (err) {
        console.error(err);
        return { error: "Failed to export context as SVG." };
      }
    }

    if (type === "selection-as-png" || type === "canvas-as-png") {
      try {
        const canvas = await exportToCanvas({
          elements: targetElements,
          appState: { ...activeState, exportBackground: true },
          files
        });
        const dataUrl = canvas.toDataURL("image/png");
        return { dataUrl, type: "png" };
      } catch (err) {
        console.error(err);
        return { error: "Failed to export context as PNG." };
      }
    }

    return null;
  };

  const insertTextAtCursor = (text) => {
    const textarea = document.getElementById("chat-message-input");
    if (!textarea) {
      setUserInput(prev => prev + text);
      return;
    }
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const currentVal = textarea.value;
    const newVal = currentVal.substring(0, start) + text + currentVal.substring(end);
    setUserInput(newVal);
    
    setTimeout(() => {
      textarea.focus();
      textarea.selectionStart = textarea.selectionEnd = start + text.length;
    }, 50);
  };

  const handleAutocompleteSelect = (tagName) => {
    const textarea = document.getElementById("chat-message-input");
    if (!textarea) return;
    const cursorPosition = textarea.selectionStart;
    const textBeforeCursor = userInput.substring(0, cursorPosition);
    const lastAtIdx = textBeforeCursor.lastIndexOf("@");
    
    if (lastAtIdx !== -1) {
      const newVal = userInput.substring(0, lastAtIdx) + tagName + " " + userInput.substring(cursorPosition);
      setUserInput(newVal);
      setShowAutocomplete(false);
      setTimeout(() => {
        textarea.focus();
        const newCursorPos = lastAtIdx + tagName.length + 1;
        textarea.selectionStart = textarea.selectionEnd = newCursorPos;
      }, 50);
    }
  };

  const handleTextareaChange = (e) => {
    const val = e.target.value;
    setUserInput(val);

    const cursorPosition = e.target.selectionStart;
    const textBeforeCursor = val.substring(0, cursorPosition);
    const lastWordMatch = textBeforeCursor.match(/@(\w*-?\w*)$/);

    if (lastWordMatch) {
      setShowAutocomplete(true);
      setAutocompleteSearch(lastWordMatch[1]);
      setAutocompleteIndex(0);
    } else {
      setShowAutocomplete(false);
    }
  };

  useEffect(() => {
    testAIConnection();
  }, [aiSettings.provider, aiSettings.url]);

  const saveSettings = () => {
    localStorage.setItem("drawerator_ai_settings", JSON.stringify(aiSettings));
    setShowSettings(false);
  };

  const logToolAction = (msg, status = "ok") => {
    setToolLogs(prev => [...prev, { msg, status, id: Date.now() + Math.random() }]);
  };

  // XML Parser that executes AI Tool tags in Excalidraw
  const executeAIToolCalls = (text, api) => {
    if (!api) return;
    
    if (/<clear\s*\/>/i.test(text)) {
      api.updateScene({ elements: [] });
      logToolAction("clear_canvas()", "ok");
    }

    const elements = [...api.getSceneElements()];
    let didChange = false;

    const parseAttrs = (str) => {
      const attrs = {};
      const regex = /(\w+)="([^"]*)"/g;
      let m;
      while ((m = regex.exec(str)) !== null) {
        attrs[m[1]] = m[2];
      }
      return attrs;
    };

    // 1. Draw Rectangles
    const rectRegex = /<rect\s+([^>]+)\/>/gi;
    let match;
    while ((match = rectRegex.exec(text)) !== null) {
      const attrs = parseAttrs(match[1]);
      const x = parseFloat(attrs.x || 0);
      const y = parseFloat(attrs.y || 0);
      const w = parseFloat(attrs.w || 100);
      const h = parseFloat(attrs.h || 100);
      const color = attrs.color || (theme === "light" ? "#0f172a" : "#f8fafc");
      
      const rect = {
        ...createBaseElement("rectangle", x, y, w, h, color),
        backgroundColor: attrs.fill || "transparent"
      };
      elements.push(rect);
      didChange = true;
      logToolAction(`rect(x:${x}, y:${y}, w:${w}, h:${h})`, "ok");
    }

    // 2. Draw Circles / Ellipses
    const circleRegex = /<circle\s+([^>]+)\/>/gi;
    while ((match = circleRegex.exec(text)) !== null) {
      const attrs = parseAttrs(match[1]);
      const cx = parseFloat(attrs.x || 0);
      const cy = parseFloat(attrs.y || 0);
      const r = parseFloat(attrs.r || 50);
      const color = attrs.color || (theme === "light" ? "#0f172a" : "#f8fafc");
      
      const ellipse = {
        ...createBaseElement("ellipse", cx - r, cy - r, r * 2, r * 2, color),
        backgroundColor: attrs.fill || "transparent"
      };
      elements.push(ellipse);
      didChange = true;
      logToolAction(`circle(x:${cx}, y:${cy}, r:${r})`, "ok");
    }

    // 3. Draw Lines
    const lineRegex = /<line\s+([^>]+)\/>/gi;
    while ((match = lineRegex.exec(text)) !== null) {
      const attrs = parseAttrs(match[1]);
      const x1 = parseFloat(attrs.x1 || 0);
      const y1 = parseFloat(attrs.y1 || 0);
      const x2 = parseFloat(attrs.x2 || 100);
      const y2 = parseFloat(attrs.y2 || 100);
      const color = attrs.color || (theme === "light" ? "#0f172a" : "#f8fafc");
      
      const dx = x2 - x1;
      const dy = y2 - y1;
      const width = Math.abs(dx);
      const height = Math.abs(dy);
      
      const line = {
        ...createBaseElement("line", x1, y1, width || 1, height || 1, color),
        points: [[0, 0], [dx, dy]]
      };
      elements.push(line);
      didChange = true;
      logToolAction(`line(x1:${x1}, x2:${x2})`, "ok");
    }

    // 4. Draw Freehand Paths
    const pathRegex = /<path\s+([^>]+)\/>/gi;
    while ((match = pathRegex.exec(text)) !== null) {
      const attrs = parseAttrs(match[1]);
      const pointsStr = attrs.points || "";
      const color = attrs.color || (theme === "light" ? "#0f172a" : "#f8fafc");
      
      const parts = pointsStr.trim().split(/\s+/);
      const pts = [];
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      
      parts.forEach(p => {
        const coords = p.split(",");
        if (coords.length >= 2) {
          const px = parseFloat(coords[0]);
          const py = parseFloat(coords[1]);
          pts.push({ x: px, y: py });
          minX = Math.min(minX, px);
          minY = Math.min(minY, py);
          maxX = Math.max(maxX, px);
          maxY = Math.max(maxY, py);
        }
      });
      
      if (pts.length > 1) {
        const relativePoints = pts.map(pt => [pt.x - minX, pt.y - minY]);
        const freedraw = {
          ...createBaseElement("freedraw", minX, minY, maxX - minX, maxY - minY, color),
          points: relativePoints,
          pressures: new Array(pts.length).fill(0.5)
        };
        elements.push(freedraw);
        didChange = true;
        logToolAction(`path(points:${pts.length})`, "ok");
      }
    }

    // 5. Erase Elements
    const eraseRegex = /<erase\s+id="([^"]+)"\s*\/>/gi;
    while ((match = eraseRegex.exec(text)) !== null) {
      const targetId = match[1];
      const idx = elements.findIndex(el => el.id === targetId);
      if (idx !== -1) {
        elements[idx] = { ...elements[idx], isDeleted: true };
        didChange = true;
        logToolAction(`erase(id:${targetId})`, "ok");
      }
    }

    if (didChange) {
      api.updateScene({ elements });
    }
  };

  // Submit chat text to Local LLM
  const sendChatMessage = async (msgOverride = null) => {
    const textToSend = msgOverride !== null ? msgOverride : userInput;
    if (!textToSend.trim() || isStreaming) return;
    
    const userMessage = textToSend.trim();
    if (msgOverride === null) setUserInput("");
    setIsStreaming(true);

    const allElements = excalidrawAPI ? excalidrawAPI.getSceneElements().filter(el => !el.isDeleted) : [];
    const appState = excalidrawAPI ? excalidrawAPI.getAppState() : {};
    const selectedIds = appState.selectedElementIds ? Object.keys(appState.selectedElementIds).filter(id => appState.selectedElementIds[id]) : [];
    const selectedElements = allElements.filter(el => selectedIds.includes(el.id));
    
    const canvasSummary = allElements.map(el => {
      if (el.type === "rectangle" || el.type === "ellipse") {
        return { id: el.id, type: el.type, x: Math.round(el.x), y: Math.round(el.y), w: Math.round(el.width), h: Math.round(el.height), color: el.strokeColor };
      } else if (el.type === "line") {
        return { id: el.id, type: el.type, x: Math.round(el.x), y: Math.round(el.y), points: el.points.map(p => [Math.round(p[0]), Math.round(p[1])]), color: el.strokeColor };
      } else if (el.type === "freedraw") {
        return { id: el.id, type: el.type, x: Math.round(el.x), y: Math.round(el.y), pointsCount: el.points.length, color: el.strokeColor };
      }
      return { id: el.id, type: el.type };
    });

    let processedMessage = userMessage;
    const imagesToAttach = [];

    // Check tags:
    if (userMessage.includes("@selection-as-png")) {
      const val = await getContextValue("selection-as-png");
      if (val?.error) {
        alert(val.error);
        return;
      }
      if (val?.dataUrl) imagesToAttach.push(val.dataUrl);
    }
    if (userMessage.includes("@canvas-as-png")) {
      const val = await getContextValue("canvas-as-png");
      if (val?.error) {
        alert(val.error);
        return;
      }
      if (val?.dataUrl) imagesToAttach.push(val.dataUrl);
    }

    if (userMessage.includes("@selection-as-svg")) {
      const val = await getContextValue("selection-as-svg");
      if (val?.error) {
        alert(val.error);
        return;
      }
      processedMessage += `\n\n[Context: @selection-as-svg]:\n\`\`\`xml\n${val.text}\n\`\`\``;
    }
    if (userMessage.includes("@canvas-as-svg")) {
      const val = await getContextValue("canvas-as-svg");
      if (val?.error) {
        alert(val.error);
        return;
      }
      processedMessage += `\n\n[Context: @canvas-as-svg]:\n\`\`\`xml\n${val.text}\n\`\`\``;
    }

    if (userMessage.includes("@selection") && !userMessage.includes("@selection-as-")) {
      const val = await getContextValue("selection");
      if (val?.error) {
        alert(val.error);
        return;
      }
      processedMessage += `\n\n[Context: @selection JSON]:\n${val.text}`;
    }
    if (userMessage.includes("@canvas") && !userMessage.includes("@canvas-as-")) {
      const val = await getContextValue("canvas");
      if (val?.error) {
        alert(val.error);
        return;
      }
      processedMessage += `\n\n[Context: @canvas JSON]:\n${val.text}`;
    }

    // Default fallback context if no explicit tags are used
    const hasExplicitTags = ["@selection", "@selection-as-svg", "@selection-as-png", "@canvas", "@canvas-as-svg", "@canvas-as-png"].some(tag => userMessage.includes(tag));
    if (!hasExplicitTags) {
      if (selectedElements.length > 0) {
        processedMessage += `\n\n[Active Selection Element Details]:\n${JSON.stringify(selectedElements.map(el => ({
          id: el.id,
          type: el.type,
          x: Math.round(el.x),
          y: Math.round(el.y),
          w: Math.round(el.width),
          h: Math.round(el.height),
          points: el.points ? el.points.map(p => [Math.round(p[0]), Math.round(p[1])]) : undefined
        })), null, 2)}`;
      }
      processedMessage += `\n\n[Full Excalidraw Scene JSON]:\n${JSON.stringify(canvasSummary)}`;
    }

    const newUserPayload = {
      role: "user",
      content: processedMessage,
      displayContent: userMessage,
      images: imagesToAttach.length > 0 ? imagesToAttach : undefined
    };

    const newHistory = [...chatHistory, newUserPayload];
    setChatHistory(newHistory);

    setChatHistory(prev => [...prev, { role: "assistant", content: "Thinking..." }]);

    const provider = aiSettings.provider;
    const url = cleanApiUrl(aiSettings.url, provider);
    const model = aiSettings.model || "default";

    const messagesPayload = newHistory.map(h => {
      if (h.role === "user") {
        if (h.images && h.images.length > 0) {
          if (provider === "ollama") {
            const cleanImages = h.images.map(img => img.split(",")[1]);
            return {
              role: "user",
              content: h.content,
              images: cleanImages
            };
          } else {
            const contentArray = [{ type: "text", text: h.content }];
            h.images.forEach(img => {
              contentArray.push({
                type: "image_url",
                image_url: { url: img }
              });
            });
            return {
              role: "user",
              content: contentArray
            };
          }
        }
      }
      return {
        role: h.role,
        content: h.content
      };
    });

    try {
      let response;
      if (provider === "ollama") {
        response = await fetch(`${url}/api/chat`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ model, messages: messagesPayload, stream: true })
        });
      } else {
        response = await fetch(`${url}/v1/chat/completions`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ model, messages: messagesPayload, stream: true })
        });
      }

      if (!response.ok) {
        throw new Error("API call failed");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder("utf-8");
      let fullResponse = "";

      if (provider === "ollama") {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunks = decoder.decode(value, { stream: true }).split("\n");
          chunks.forEach(chunk => {
            if (!chunk.trim()) return;
            try {
              const parsed = JSON.parse(chunk);
              if (parsed.message?.content) {
                fullResponse += parsed.message.content;
                setChatHistory(prev => {
                  const updated = [...prev];
                  updated[updated.length - 1] = { role: "assistant", content: fullResponse };
                  return updated;
                });
              }
            } catch (e) {}
          });
        }
      } else {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const raw = decoder.decode(value, { stream: true });
          const lines = raw.split("\n");
          lines.forEach(line => {
            if (line.startsWith("data: ")) {
              const dataStr = line.slice(6).trim();
              if (dataStr === "[DONE]") return;
              try {
                const parsed = JSON.parse(dataStr);
                if (parsed.choices?.[0].delta?.content) {
                  fullResponse += parsed.choices[0].delta.content;
                  setChatHistory(prev => {
                    const updated = [...prev];
                    updated[updated.length - 1] = { role: "assistant", content: fullResponse };
                    return updated;
                  });
                }
              } catch (e) {}
            }
          });
        }
      }

      executeAIToolCalls(fullResponse, excalidrawAPI);

    } catch (e) {
      console.error(e);
      setChatHistory(prev => {
        const updated = [...prev];
        updated[updated.length - 1] = { role: "assistant", content: "Error: Unreachable local LLM endpoint. Please verify your connection settings." };
        return updated;
      });
    } finally {
      setIsStreaming(false);
    }
  };

  const clearChat = () => {
    if (window.confirm("Reset conversation history?")) {
      setChatHistory([
        { role: "system", content: SYSTEM_PROMPT },
        { role: "assistant", content: INITIAL_GREETING }
      ]);
    }
  };

  const copyTranscript = () => {
    const transcript = chatHistory
      .filter(h => h.role !== "system")
      .map(h => `[${h.role === "user" ? "User" : "AI Assistant"}]:\n${h.displayContent || h.content}`)
      .join("\n\n");
      
    if (!transcript.trim()) return;

    navigator.clipboard.writeText(transcript).then(() => {
      alert("Transcript copied to clipboard!");
    });
  };

  const toggleBackgroundTransparency = (api) => {
    if (!api) return;
    const appState = api.getAppState();
    const isTransparent = isColorTransparent(appState.viewBackgroundColor);
    
    let nextColor;
    if (isTransparent) {
      nextColor = makeColorOpaque(appState.viewBackgroundColor, lastNonTransparentColorRef.current);
      if (theme === "dark" && (nextColor.toLowerCase() === "#ffffff" || nextColor.toLowerCase() === "#fff")) {
        nextColor = "#121212";
      } else if (theme === "light" && nextColor.toLowerCase() === "#121212") {
        nextColor = "#ffffff";
      }
    } else {
      nextColor = makeColorTransparent(appState.viewBackgroundColor || (theme === "dark" ? "#121212" : "#ffffff"));
    }
    
    api.updateScene({
      appState: {
        viewBackgroundColor: nextColor
      }
    });
  };

  // --- COMMAND PALETTE LOGIC ---
  const COMMANDS = [
    { id: "toggle-satori", name: "Toggle Satori Mode (Zen) /satori", category: "View", action: () => setSatoriMode(prev => !prev) },
    { id: "toggle-theme", name: "Toggle Dark/Light Theme", category: "View", action: (api) => { const next = theme === "dark" ? "light" : "dark"; setTheme(next); api?.updateScene({ appState: { theme: next } }); } },
    { id: "toggle-chat", name: "Toggle AI Assistant Chat", category: "AI Chat", action: (api) => api.toggleSidebar({ name: "ai-sidebar" }) },
    { id: "new-chat", name: "Reset Conversation (New Chat)", category: "AI Chat", action: () => clearChat() },
    { id: "copy-transcript", name: "Copy Conversation Transcript", category: "AI Chat", action: () => copyTranscript() },
    { id: "settings", name: "Open Local AI Settings", category: "AI Chat", action: () => setShowSettings(true) },
    { id: "clear-canvas", name: "Clear Sketchboard Canvas", category: "Canvas", action: (api) => api.updateScene({ elements: [] }) },
    { id: "toggle-transparency", name: "Toggle Canvas Background Transparency", category: "Canvas", action: (api) => toggleBackgroundTransparency(api) },
    { id: "reset-view", name: "Reset Zoom & Pan View", category: "Canvas", action: (api) => api.updateScene({ appState: { zoom: { value: 1 }, scrollX: 0, scrollY: 0 } }) },
    { id: "tool-select", name: "Select Pointer/Selection Tool", category: "Tools", action: (api) => api.updateScene({ appState: { activeTool: { type: "selection" } } }) },
    { id: "tool-rect", name: "Select Rectangle Tool", category: "Tools", action: (api) => api.updateScene({ appState: { activeTool: { type: "rectangle" } } }) },
    { id: "tool-ellipse", name: "Select Ellipse/Circle Tool", category: "Tools", action: (api) => api.updateScene({ appState: { activeTool: { type: "ellipse" } } }) },
    { id: "tool-line", name: "Select Straight Line Tool", category: "Tools", action: (api) => api.updateScene({ appState: { activeTool: { type: "line" } } }) },
    { id: "tool-freedraw", name: "Select Pencil/Freedraw Tool", category: "Tools", action: (api) => api.updateScene({ appState: { activeTool: { type: "freedraw" } } }) },
    { id: "tool-eraser", name: "Select Eraser Tool", category: "Tools", action: (api) => api.updateScene({ appState: { activeTool: { type: "eraser" } } }) },
    { id: "tool-hand", name: "Select Hand/Pan Tool", category: "Tools", action: (api) => api.updateScene({ appState: { activeTool: { type: "hand" } } }) }
  ];

  const paletteInputRef = useRef(null);
  const lastNonTransparentColorRef = useRef(theme === "dark" ? "#121212" : "#ffffff");

  // Toggle Command Palette on Cmd + / and Satori Mode on Opt + Shift + Z
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Cmd + / or Ctrl + /
      if ((e.metaKey || e.ctrlKey) && e.key === "/") {
        e.preventDefault();
        e.stopPropagation();
        setShowCommandPalette(prev => !prev);
      }
      // Cmd + Ctrl + Z
      if (e.metaKey && e.ctrlKey && e.code === "KeyZ") {
        e.preventDefault();
        e.stopPropagation();
        setSatoriMode(prev => !prev);
      }
      // Opt + Shift + D (Theme toggle)
      if (e.altKey && e.shiftKey && e.code === "KeyD") {
        e.preventDefault();
        e.stopPropagation();
        const nextTheme = theme === "dark" ? "light" : "dark";
        setTheme(nextTheme);
        excalidrawAPI?.updateScene({ appState: { theme: nextTheme } });
      }
      // Cmd + Shift + 0 or Ctrl + Shift + 0 (Toggle background transparency)
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.code === "Digit0") {
        e.preventDefault();
        e.stopPropagation();
        toggleBackgroundTransparency(excalidrawAPI);
      }
      // Cmd + Shift + , or Cmd + , (Toggle Settings Panel)
      if ((e.metaKey || e.ctrlKey) && (e.key === "," || e.code === "Comma")) {
        e.preventDefault();
        e.stopPropagation();
        setShowSettings(prev => !prev);
      }
      // Ctrl + Option + A (Toggle AI Chat Panel)
      if (e.ctrlKey && e.altKey && e.code === "KeyA") {
        e.preventDefault();
        e.stopPropagation();
        excalidrawAPI?.toggleSidebar({ name: "ai-sidebar" });
      }
      // [ and ] shortcuts to increase/decrease stroke width for pen and line
      if ((e.key === "[" || e.key === "]") && excalidrawAPI) {
        const activeEl = document.activeElement;
        if (
          !activeEl ||
          (activeEl.tagName !== "INPUT" &&
            activeEl.tagName !== "TEXTAREA" &&
            activeEl.contentEditable !== "true")
        ) {
          const appState = excalidrawAPI.getAppState();
          const activeTool = appState.activeTool?.type;
          
          const selectedElements = excalidrawAPI.getSceneElements().filter(
            (el) => !el.isDeleted && appState.selectedElementIds?.[el.id]
          );
          const hasSelectedPenOrLine = selectedElements.some(
            (el) => el.type === "freedraw" || el.type === "line"
          );
          
          const isPenOrLine =
            activeTool === "freedraw" ||
            activeTool === "line" ||
            hasSelectedPenOrLine;

          if (isPenOrLine) {
            e.preventDefault();
            e.stopPropagation();
            const currentWidth = appState.currentItemStrokeWidth || 1;
            let newWidth = currentWidth;
            if (e.key === "[") {
              newWidth = Math.max(1, currentWidth - 1);
            } else {
              newWidth = Math.min(20, currentWidth + 1);
            }

            if (newWidth !== currentWidth) {
              const updatedElements = excalidrawAPI.getSceneElements().map((el) => {
                if (
                  appState.selectedElementIds?.[el.id] &&
                  (el.type === "freedraw" || el.type === "line")
                ) {
                  return { ...el, strokeWidth: newWidth };
                }
                return el;
              });

              excalidrawAPI.updateScene({
                elements: updatedElements,
                appState: {
                  currentItemStrokeWidth: newWidth
                }
              });
            }
          }
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [theme, excalidrawAPI]);

  // Autofocus input when Command Palette opens
  useEffect(() => {
    if (showCommandPalette) {
      setTimeout(() => paletteInputRef.current?.focus(), 50);
      setCommandSearch("");
      setSelectedIndex(0);
    }
  }, [showCommandPalette]);

  // Start with active pen tool when entering Satori Mode
  useEffect(() => {
    if (excalidrawAPI && satoriMode) {
      excalidrawAPI.updateScene({
        appState: {
          activeTool: { type: "freedraw" },
          currentItemRoughness: 0
        }
      });
    }
  }, [excalidrawAPI, satoriMode]);

  const getFilteredCommands = () => {
    const query = commandSearch.toLowerCase().trim();
    const matches = COMMANDS.filter(cmd => 
      cmd.name.toLowerCase().includes(query) || 
      cmd.category.toLowerCase().includes(query)
    );
    
    if (commandSearch.trim() !== "") {
      matches.unshift({
        id: "ask-ai",
        name: `Ask AI: "${commandSearch}"`,
        category: "AI Query"
      });
    }
    
    return matches;
  };

  const openAISidebar = () => {
    if (!excalidrawAPI) return;
    const appState = excalidrawAPI.getAppState();
    if (appState.activeSidebar !== "ai-sidebar") {
      excalidrawAPI.toggleSidebar({ name: "ai-sidebar" });
    }
  };

  const executeCommand = (cmd) => {
    setShowCommandPalette(false);
    if (cmd.id === "ask-ai") {
      openAISidebar();
      sendChatMessage(commandSearch);
    } else {
      cmd.action(excalidrawAPI);
    }
  };

  return (
    <div 
      id="root" 
      className={`${satoriMode ? "satori-mode" : ""} ${showToolbarHints ? "" : "hide-toolbar-hints"} ${showBottomNotifications ? "" : "hide-bottom-notifications"} ${isSidebarOpen ? "sidebar-open" : ""}`}
      style={{ "--sidebar-width": `${sidebarWidth}px` }}
    >
      {/* Excalidraw Canvas Area */}
      <div id="canvas-container" style={{ width: "100%", height: "100%", position: "relative" }}>
        <Excalidraw 
          theme={theme} 
          excalidrawAPI={(api) => setExcalidrawAPI(api)} 
          getFormFactor={(width, height) => {
            if (forceDesktopLayout) {
              return "desktop";
            }
            return width < 768 ? "phone" : "desktop";
          }}
          initialData={{
            appState: {
              currentItemRoughness: 0
            }
          }}
          onChange={(elements, appState) => {
            if (appState.theme && appState.theme !== theme) {
              setTheme(appState.theme);
            }
             if (
              appState.viewBackgroundColor &&
              !isColorTransparent(appState.viewBackgroundColor)
            ) {
              lastNonTransparentColorRef.current = appState.viewBackgroundColor;
            }
            // Track if AI sidebar is open
            setIsSidebarOpen(appState.activeSidebar === "ai-sidebar");
          }}
          renderTopRightUI={() => (
            <div className="drawerator-top-right-wrapper">
              {/* Theme toggle (left of library) */}
              <button 
                id="btn-theme-header" 
                onClick={() => {
                  const nextTheme = theme === "dark" ? "light" : "dark";
                  setTheme(nextTheme);
                  excalidrawAPI?.updateScene({ appState: { theme: nextTheme } });
                }}
                title="Toggle theme mode"
              >
                {theme === "dark" ? (
                  <svg width="15" height="15" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364-6.364l-.707.707M6.343 17.657l-.707.707m0-12.728l.707.707m11.314 11.314l.707-.707M12 7a5 5 0 100 10 5 5 0 000-10z" />
                  </svg>
                ) : (
                  <svg width="15" height="15" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
                  </svg>
                )}
              </button>

              {/* Chat Toggle (right of library) */}
              <button 
                id="btn-chat-header" 
                onClick={() => excalidrawAPI?.toggleSidebar({ name: "ai-sidebar" })}
                title="Toggle AI panel"
              >
                <svg width="15" height="15" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                </svg>
              </button>
            </div>
          )}
        >
          {/* Main Hamburguer Menu */}
          <MainMenu>
            <MainMenu.DefaultItems.ClearCanvas />
            <MainMenu.DefaultItems.LoadScene />
            <MainMenu.DefaultItems.SaveAsImage />
            <MainMenu.DefaultItems.Export />
            <MainMenu.Separator />
            <MainMenu.DefaultItems.ToggleTheme />
            <MainMenu.DefaultItems.ChangeCanvasBackground />
            <MainMenu.Item onSelect={() => {
              setActiveSettingsTab("preferences");
              setShowSettings(true);
            }}>
              Preferences
            </MainMenu.Item>
            <MainMenu.Separator />
            <MainMenu.ItemCustom>
              <label
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  width: "100%",
                  padding: "10px 16px",
                  cursor: "pointer",
                  color: "var(--popup-text-color)",
                  fontSize: "14px",
                  fontFamily: "var(--font-sans)",
                  transition: "background-color 0.2s"
                }}
                className="dropdown-menu-item-custom"
                onClick={(e) => {
                  e.stopPropagation();
                }}
              >
                <span>Force Desktop Layout</span>
                <input 
                  type="checkbox" 
                  checked={forceDesktopLayout} 
                  onChange={(e) => {
                    setForceDesktopLayout(e.target.checked);
                    localStorage.setItem("drawerator_force_desktop_layout", e.target.checked);
                  }}
                  style={{
                    cursor: "pointer",
                    accentColor: "var(--color-primary)"
                  }}
                />
              </label>
            </MainMenu.ItemCustom>
            <MainMenu.ItemCustom>
              <label
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  width: "100%",
                  padding: "10px 16px",
                  cursor: "pointer",
                  color: "var(--popup-text-color)",
                  fontSize: "14px",
                  fontFamily: "var(--font-sans)",
                  transition: "background-color 0.2s"
                }}
                className="dropdown-menu-item-custom"
                onClick={(e) => {
                  e.stopPropagation();
                }}
              >
                <span>Show Toolbar Hints</span>
                <input 
                  type="checkbox" 
                  checked={showToolbarHints} 
                  onChange={(e) => {
                    setShowToolbarHints(e.target.checked);
                    localStorage.setItem("drawerator_show_toolbar_hints", e.target.checked);
                  }}
                  style={{
                    cursor: "pointer",
                    accentColor: "var(--color-primary)"
                  }}
                />
              </label>
            </MainMenu.ItemCustom>
            <MainMenu.ItemCustom>
              <label
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  width: "100%",
                  padding: "10px 16px",
                  cursor: "pointer",
                  color: "var(--popup-text-color)",
                  fontSize: "14px",
                  fontFamily: "var(--font-sans)",
                  transition: "background-color 0.2s"
                }}
                className="dropdown-menu-item-custom"
                onClick={(e) => {
                  e.stopPropagation();
                }}
              >
                <span>Show Bottom Alerts</span>
                <input 
                  type="checkbox" 
                  checked={showBottomNotifications} 
                  onChange={(e) => {
                    setShowBottomNotifications(e.target.checked);
                    localStorage.setItem("drawerator_show_bottom_notifications", e.target.checked);
                  }}
                  style={{
                    cursor: "pointer",
                    accentColor: "var(--color-primary)"
                  }}
                />
              </label>
            </MainMenu.ItemCustom>
            <MainMenu.Separator />
            <MainMenu.Item onSelect={() => excalidrawAPI?.toggleSidebar({ name: "ai-sidebar" })}>
              Toggle AI Assistant
            </MainMenu.Item>
          </MainMenu>

          {/* Welcome Screen brand styling & quick start triggers */}
          <WelcomeScreen>
            <WelcomeScreen.Center>
              <WelcomeScreen.Center.Logo />
              <WelcomeScreen.Center.Heading>Drawerator AI Board</WelcomeScreen.Center.Heading>
              <WelcomeScreen.Center.Menu>
                <WelcomeScreen.Center.MenuItemLoadScene />
                <WelcomeScreen.Center.MenuItemHelp />
                <button 
                  className="header-btn" 
                  onClick={() => excalidrawAPI?.toggleSidebar({ name: "ai-sidebar" })}
                  style={{ width: "100%", padding: "10px", marginTop: "10px", fontSize: "13px", fontWeight: "600", borderRadius: "8px", background: "var(--color-accent)", color: "var(--color-btn-text)", border: "none", cursor: "pointer" }}
                >
                  Open AI Drawing Assistant
                </button>
              </WelcomeScreen.Center.Menu>
            </WelcomeScreen.Center>
          </WelcomeScreen>

          {/* Custom Native Sidebar */}
          <Sidebar name="ai-sidebar" docked={sidebarDocked} onDock={setSidebarDocked}>
            <div 
              className="sidebar-resize-handle"
              onMouseDown={handleSidebarResizeMouseDown}
            />
            <Sidebar.Header>
              <div style={{ display: "flex", width: "100%", justifyContent: "space-between", alignItems: "center", paddingRight: "10px", gap: "10px" }}>
                {/* Model Selector Pill */}
                <div style={{ 
                  display: "flex", 
                  alignItems: "center", 
                  gap: "4px",
                  background: "var(--button-hover-bg, rgba(0, 0, 0, 0.05))",
                  padding: "4px 8px 4px 6px",
                  borderRadius: "12px",
                  cursor: "pointer",
                  position: "relative",
                  overflow: "hidden"
                }}>
                  <svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" style={{ color: "var(--color-secondary)", flexShrink: 0 }}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                  <select 
                    value={aiSettings.model} 
                    onChange={(e) => {
                      const updated = { ...aiSettings, model: e.target.value };
                      setAiSettings(updated);
                      localStorage.setItem("drawerator_ai_settings", JSON.stringify(updated));
                    }}
                    style={{
                      background: "transparent",
                      border: "none",
                      fontSize: "11px",
                      fontWeight: "600",
                      color: "var(--color-secondary)",
                      cursor: "pointer",
                      outline: "none",
                      padding: "0 10px 0 0",
                      margin: 0,
                      width: "auto",
                      maxWidth: "150px",
                      appearance: "none",
                      WebkitAppearance: "none",
                      MozAppearance: "none"
                    }}
                  >
                    {modelsList.length > 0 ? (
                      modelsList.map((m, idx) => (
                        <option key={idx} value={m} style={{ background: "var(--island-bg-color)", color: "var(--color-primary)" }}>{m}</option>
                      ))
                    ) : (
                      <option value="" style={{ background: "var(--island-bg-color)", color: "var(--color-primary)" }}>{aiSettings.model || "Select Model"}</option>
                    )}
                  </select>
                  {/* Custom tiny down arrow */}
                  <span style={{ 
                    position: "absolute", 
                    right: "6px", 
                    top: "50%", 
                    transform: "translateY(-50%)", 
                    fontSize: "7px", 
                    color: "var(--color-secondary)",
                    pointerEvents: "none"
                  }}>▼</span>
                </div>
                <div style={{ display: "flex", gap: "6px" }}>
                  <button className="header-btn" onClick={clearChat} title="Reset chat history">
                    <svg width="15" height="15" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                    </svg>
                  </button>
                  <button className="header-btn" onClick={copyTranscript} title="Copy transcript">
                    <svg width="15" height="15" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                    </svg>
                  </button>
                  <button className="header-btn" onClick={() => setShowSettings(true)} title="AI settings">
                    <svg width="15" height="15" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                  </button>
                </div>
              </div>
            </Sidebar.Header>
            
            <div style={{ display: "flex", flexDirection: "column", height: "calc(100% - 50px)", overflow: "hidden", background: "var(--bg-sidebar)" }}>
              {/* Messages Stream */}
              <div id="chat-messages" style={{ flex: 1, overflowY: "auto", padding: "12px", display: "flex", flexDirection: "column", gap: "10px" }}>
                {chatHistory
                  .filter(msg => msg.role !== "system")
                  .map((msg, idx) => (
                    <div key={idx} className={`chat-message ${msg.role}`}>
                      {msg.displayContent || msg.content}
                      {msg.images && msg.images.map((img, imgIdx) => (
                        <img 
                          key={imgIdx} 
                          src={img} 
                          alt="Context preview" 
                          style={{ 
                            maxWidth: "100%", 
                            maxHeight: "150px", 
                            borderRadius: "6px", 
                            marginTop: "8px", 
                            display: "block",
                            border: "1px solid var(--border-color)"
                          }} 
                        />
                      ))}
                      {msg.content !== "Thinking..." && (
                        <button 
                          className="copy-bubble-btn" 
                          onClick={(e) => {
                            e.stopPropagation();
                            navigator.clipboard.writeText(msg.displayContent || msg.content);
                          }}
                        >
                          Copy
                        </button>
                      )}
                    </div>
                  ))}
                <div ref={messagesEndRef} />
              </div>

              {/* Chat Input Container */}
              <div className="chat-input-container" style={{
                padding: "10px",
                borderTop: "1px solid var(--border-color)",
                display: "flex",
                flexDirection: "column",
                gap: "8px",
                background: "var(--color-surface-primary)",
                position: "relative"
              }}>
                {/* Autocomplete Suggestions Popover */}
                {showAutocomplete && getFilteredTags().length > 0 && (
                  <div 
                    style={{
                      position: "absolute",
                      bottom: "100%",
                      left: "10px",
                      right: "10px",
                      background: "var(--island-bg-color, #1e1e24)",
                      border: "1px solid var(--border-color, #2d2d34)",
                      borderRadius: "8px",
                      boxShadow: "0 -10px 25px -5px rgba(0, 0, 0, 0.3), 0 -8px 10px -6px rgba(0, 0, 0, 0.3)",
                      maxHeight: "180px",
                      overflowY: "auto",
                      zIndex: 2100,
                      backdropFilter: "blur(8px)",
                      marginBottom: "4px"
                    }}
                  >
                    {getFilteredTags().map((tag, idx) => (
                      <div
                        key={tag.name}
                        onClick={() => handleAutocompleteSelect(tag.name)}
                        className={`autocomplete-item ${idx === autocompleteIndex ? "active" : ""}`}
                        style={{
                          padding: "6px 12px",
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          fontSize: "12px",
                          color: "var(--color-primary)",
                          cursor: "pointer",
                          background: idx === autocompleteIndex ? "var(--button-hover-bg, rgba(255, 255, 255, 0.08))" : "transparent"
                        }}
                      >
                        <span style={{ fontWeight: "600", color: "var(--color-accent)" }}>{tag.name}</span>
                        <span style={{ fontSize: "11px", color: "var(--color-secondary)", opacity: 0.8 }}>{tag.description}</span>
                      </div>
                    ))}
                  </div>
                )}

                <textarea
                  id="chat-message-input"
                  value={userInput}
                  onChange={handleTextareaChange}
                  onKeyDown={(e) => {
                    const filteredTags = getFilteredTags();
                    if (showAutocomplete && filteredTags.length > 0) {
                      if (e.key === "ArrowDown") {
                        e.preventDefault();
                        setAutocompleteIndex(prev => (prev + 1) % filteredTags.length);
                      } else if (e.key === "ArrowUp") {
                        e.preventDefault();
                        setAutocompleteIndex(prev => (prev - 1 + filteredTags.length) % filteredTags.length);
                      } else if (e.key === "Enter" || e.key === "Tab") {
                        e.preventDefault();
                        handleAutocompleteSelect(filteredTags[autocompleteIndex].name);
                      } else if (e.key === "Escape") {
                        e.preventDefault();
                        setShowAutocomplete(false);
                      }
                    } else if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      sendChatMessage();
                    }
                  }}
                  placeholder="Type prompt (Enter to send, Shift+Enter for new line)..."
                  style={{
                    width: "100%",
                    minHeight: "60px",
                    maxHeight: "150px",
                    resize: "none",
                    fontSize: "13px",
                    background: "transparent",
                    border: "none",
                    outline: "none",
                    color: "var(--color-primary)",
                    padding: 0
                  }}
                />
                
                <div style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center"
                }}>
                  {/* Plus / Add Context Button */}
                  <div style={{ position: "relative" }}>
                    <button
                      onClick={() => {
                        setShowContextDropdown(!showContextDropdown);
                        setContextMenuTab("main");
                      }}
                      style={{
                        background: "transparent",
                        border: "none",
                        color: "var(--color-secondary)",
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        width: "28px",
                        height: "28px",
                        borderRadius: "50%",
                        transition: "background var(--transition-fast)",
                        padding: 0
                      }}
                      title="Add context (@)"
                    >
                      <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                      </svg>
                    </button>

                    {/* Context Drop-up Menu */}
                    {showContextDropdown && (
                      <div 
                        style={{
                          position: "absolute",
                          bottom: "34px",
                          left: "0",
                          background: "var(--island-bg-color, #1e1e24)",
                          border: "1px solid var(--border-color, #2d2d34)",
                          borderRadius: "12px",
                          boxShadow: "0 10px 25px -5px rgba(0, 0, 0, 0.3), 0 8px 10px -6px rgba(0, 0, 0, 0.3)",
                          padding: "6px 0",
                          minWidth: "160px",
                          zIndex: 2000,
                          backdropFilter: "blur(8px)"
                        }}
                      >
                        <div style={{ 
                          padding: "6px 12px", 
                          fontSize: "11px", 
                          fontWeight: "700", 
                          color: "var(--color-secondary)", 
                          textTransform: "uppercase", 
                          letterSpacing: "0.5px",
                          opacity: 0.7,
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center"
                        }}>
                          <span>Add Context</span>
                          {contextMenuTab !== "main" && (
                            <span 
                              onClick={(e) => { e.stopPropagation(); setContextMenuTab("main"); }}
                              style={{ color: "var(--color-accent)", cursor: "pointer", textTransform: "none", fontSize: "10px" }}
                            >
                              ← Back
                            </span>
                          )}
                        </div>
                        
                        {contextMenuTab === "main" && (
                          <>
                            <div 
                              className="context-menu-item"
                              onClick={() => setContextMenuTab("media")}
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: "10px",
                                padding: "8px 12px",
                                fontSize: "13px",
                                color: "var(--color-primary)",
                                cursor: "pointer",
                                transition: "background var(--transition-fast)"
                              }}
                            >
                              <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                              </svg>
                              <span>Media (PNG)</span>
                            </div>
                            <div 
                              className="context-menu-item"
                              onClick={() => setContextMenuTab("mentions")}
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: "10px",
                                padding: "8px 12px",
                                fontSize: "13px",
                                color: "var(--color-primary)",
                                cursor: "pointer",
                                transition: "background var(--transition-fast)"
                              }}
                            >
                              <span style={{ fontSize: "14px", fontWeight: "bold", width: "16px", textAlign: "center" }}>@</span>
                              <span>Mentions</span>
                            </div>
                            <div 
                              className="context-menu-item"
                              onClick={() => setContextMenuTab("actions")}
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: "10px",
                                padding: "8px 12px",
                                fontSize: "13px",
                                color: "var(--color-primary)",
                                cursor: "pointer",
                                transition: "background var(--transition-fast)"
                              }}
                            >
                              <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                              </svg>
                              <span>Actions & Skills</span>
                            </div>
                          </>
                        )}

                        {contextMenuTab === "media" && (
                          <>
                            <div 
                              className="context-menu-item"
                              onClick={() => { insertTextAtCursor("@canvas-as-png"); setShowContextDropdown(false); }}
                              style={{ padding: "8px 12px", fontSize: "12px", color: "var(--color-primary)", cursor: "pointer" }}
                            >
                              <span style={{ fontWeight: "600", color: "var(--color-accent)" }}>@canvas-as-png</span>
                            </div>
                            <div 
                              className="context-menu-item"
                              onClick={() => { insertTextAtCursor("@selection-as-png"); setShowContextDropdown(false); }}
                              style={{ padding: "8px 12px", fontSize: "12px", color: "var(--color-primary)", cursor: "pointer" }}
                            >
                              <span style={{ fontWeight: "600", color: "var(--color-accent)" }}>@selection-as-png</span>
                            </div>
                          </>
                        )}

                        {contextMenuTab === "mentions" && (
                          <>
                            <div 
                              className="context-menu-item"
                              onClick={() => { insertTextAtCursor("@selection"); setShowContextDropdown(false); }}
                              style={{ padding: "8px 12px", fontSize: "12px", color: "var(--color-primary)", cursor: "pointer" }}
                            >
                              <span style={{ fontWeight: "600", color: "var(--color-accent)" }}>@selection</span>
                            </div>
                            <div 
                              className="context-menu-item"
                              onClick={() => { insertTextAtCursor("@canvas"); setShowContextDropdown(false); }}
                              style={{ padding: "8px 12px", fontSize: "12px", color: "var(--color-primary)", cursor: "pointer" }}
                            >
                              <span style={{ fontWeight: "600", color: "var(--color-accent)" }}>@canvas</span>
                            </div>
                            <div 
                              className="context-menu-item"
                              onClick={() => { insertTextAtCursor("@selection-as-svg"); setShowContextDropdown(false); }}
                              style={{ padding: "8px 12px", fontSize: "12px", color: "var(--color-primary)", cursor: "pointer" }}
                            >
                              <span style={{ fontWeight: "600", color: "var(--color-accent)" }}>@selection-as-svg</span>
                            </div>
                            <div 
                              className="context-menu-item"
                              onClick={() => { insertTextAtCursor("@canvas-as-svg"); setShowContextDropdown(false); }}
                              style={{ padding: "8px 12px", fontSize: "12px", color: "var(--color-primary)", cursor: "pointer" }}
                            >
                              <span style={{ fontWeight: "600", color: "var(--color-accent)" }}>@canvas-as-svg</span>
                            </div>
                          </>
                        )}

                        {contextMenuTab === "actions" && (
                          <>
                            <div 
                              className="context-menu-item"
                              onClick={() => { insertTextAtCursor("@mermaid"); setShowContextDropdown(false); }}
                              style={{ padding: "8px 12px", fontSize: "12px", color: "var(--color-primary)", cursor: "pointer" }}
                            >
                              <span style={{ fontWeight: "600", color: "var(--color-accent)" }}>@mermaid</span>
                            </div>
                            <div 
                              className="context-menu-item"
                              onClick={() => { insertTextAtCursor("@manim"); setShowContextDropdown(false); }}
                              style={{ padding: "8px 12px", fontSize: "12px", color: "var(--color-primary)", cursor: "pointer" }}
                            >
                              <span style={{ fontWeight: "600", color: "var(--color-accent)" }}>@manim</span>
                            </div>
                            <div 
                              className="context-menu-item"
                              onClick={() => { insertTextAtCursor("@imagegen"); setShowContextDropdown(false); }}
                              style={{ padding: "8px 12px", fontSize: "12px", color: "var(--color-primary)", cursor: "pointer" }}
                            >
                              <span style={{ fontWeight: "600", color: "var(--color-accent)" }}>@imagegen</span>
                            </div>
                          </>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Send Button */}
                  <button 
                    id="chat-send-btn" 
                    onClick={() => sendChatMessage()} 
                    disabled={isStreaming} 
                    style={{ 
                      width: "28px", 
                      height: "28px", 
                      borderRadius: "50%", 
                      background: "var(--color-accent)", 
                      color: "var(--color-btn-text)", 
                      border: "none", 
                      display: "flex", 
                      alignItems: "center", 
                      justifyContent: "center",
                      cursor: "pointer"
                    }}
                  >
                    <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M14 5l7 7m0 0l-7 7m7-7H3" />
                    </svg>
                  </button>
                </div>
              </div>
            </div>
          </Sidebar>
        </Excalidraw>
      </div>

      {/* Settings Modal Dialog Overlay */}
      {showSettings && (
        <div className={`excalidraw theme--${theme}`}>
          <div id="settings-overlay" onClick={() => setShowSettings(false)}>
            <div className="settings-card" onClick={(e) => e.stopPropagation()}>
              <div className="settings-title-row">
                <h3>Settings</h3>
                <button 
                  onClick={() => setShowSettings(false)}
                  style={{ background: "transparent", border: "none", color: "var(--color-secondary)", fontSize: "20px", cursor: "pointer" }}
                >
                  &times;
                </button>
              </div>

              {/* Settings Tabs */}
              <div style={{ display: "flex", gap: "10px", borderBottom: "1px solid var(--border-color)", paddingBottom: "10px", marginBottom: "15px" }}>
                <button
                  onClick={() => setActiveSettingsTab("ai")}
                  style={{
                    background: activeSettingsTab === "ai" ? "var(--color-accent)" : "transparent",
                    color: activeSettingsTab === "ai" ? "var(--color-btn-text)" : "var(--color-primary)",
                    border: "1px solid var(--border-color)",
                    borderRadius: "6px",
                    padding: "6px 12px",
                    fontSize: "13px",
                    fontWeight: "600",
                    cursor: "pointer"
                  }}
                >
                  AI Configuration
                </button>
                <button
                  onClick={() => setActiveSettingsTab("preferences")}
                  style={{
                    background: activeSettingsTab === "preferences" ? "var(--color-accent)" : "transparent",
                    color: activeSettingsTab === "preferences" ? "var(--color-btn-text)" : "var(--color-primary)",
                    border: "1px solid var(--border-color)",
                    borderRadius: "6px",
                    padding: "6px 12px",
                    fontSize: "13px",
                    fontWeight: "600",
                    cursor: "pointer"
                  }}
                >
                  Board Preferences
                </button>
              </div>
              
              {activeSettingsTab === "ai" ? (
                <>
                  <div className="settings-row">
                    <label>API Provider</label>
                    <select 
                      value={aiSettings.provider}
                      onChange={(e) => {
                        const val = e.target.value;
                        let defaultUrl = "http://localhost:11434";
                        if (val === "lmstudio") defaultUrl = "http://localhost:1234";
                        else if (val === "openai") defaultUrl = "https://api.openai.com";
                        
                        const updated = { ...aiSettings, provider: val, url: defaultUrl, model: "" };
                        setAiSettings(updated);
                        testAIConnection(updated);
                      }}
                    >
                      <option value="ollama">Ollama</option>
                      <option value="lmstudio">LM Studio</option>
                      <option value="openai">OpenAI Compatible</option>
                    </select>
                  </div>

                  <div className="settings-row">
                    <label>API Endpoint URL</label>
                    <input 
                      type="text" 
                      value={aiSettings.url} 
                      onChange={(e) => {
                        const updated = { ...aiSettings, url: e.target.value };
                        setAiSettings(updated);
                      }}
                    />
                  </div>

                  <div className="settings-row">
                    <label>Active Model Name</label>
                    {aiSettings.provider !== "openai" && modelsList.length > 0 ? (
                      <select 
                        value={aiSettings.model} 
                        onChange={(e) => setAiSettings({ ...aiSettings, model: e.target.value })}
                      >
                        {modelsList.map((m, idx) => (
                          <option key={idx} value={m}>{m}</option>
                        ))}
                      </select>
                    ) : (
                      <input 
                        type="text" 
                        value={aiSettings.model} 
                        onChange={(e) => setAiSettings({ ...aiSettings, model: e.target.value })}
                        placeholder="e.g. gpt-4o or llama3"
                      />
                    )}
                  </div>

                  {connectionStatus === "error" && (
                    <div style={{
                      marginTop: "15px",
                      padding: "10px",
                      background: "rgba(255, 0, 0, 0.08)",
                      border: "1px solid rgba(255, 0, 0, 0.15)",
                      borderRadius: "6px",
                      fontSize: "12px",
                      lineHeight: "1.4",
                      color: "var(--color-primary)",
                      fontFamily: "var(--font-sans)"
                    }}>
                      <strong style={{ color: "#e06c75", display: "block", marginBottom: "4px" }}>CORS / Connection Troubleshooting:</strong>
                      If you are running the app via <code>file://</code> or a hosted domain, your browser will block local backend connections unless CORS is enabled:
                      <ul style={{ margin: "6px 0 0 16px", padding: 0 }}>
                        <li style={{ marginBottom: "4px" }}><strong>Ollama:</strong> Run Ollama with the environment variable <code>OLLAMA_ORIGINS="*"</code>. On macOS, run <code>launchctl setenv OLLAMA_ORIGINS "*"</code> in terminal, restart the Ollama app, and refresh this page.</li>
                        <li><strong>LM Studio:</strong> Turn on the <strong>Enable CORS</strong> setting in the LM Studio local server tab.</li>
                      </ul>
                    </div>
                  )}

                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "24px" }}>
                    <div className="status-indicator">
                      <span className={`status-dot ${connectionStatus}`}></span>
                      <span>
                        {connectionStatus === "ok" ? "Backend Reachable" : 
                         connectionStatus === "error" ? "Connection Failed" : "Checking..."}
                      </span>
                    </div>
                    <button 
                      className="header-btn" 
                      onClick={saveSettings}
                      style={{ background: "var(--color-accent)", color: "var(--color-btn-text)", border: "none", fontWeight: "600", padding: "8px 16px" }}
                    >
                      Save
                    </button>
                  </div>
                </>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                  <div className="settings-row" style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <label style={{ margin: 0, cursor: "pointer" }}>Force Desktop Layout</label>
                    <input 
                      type="checkbox" 
                      checked={forceDesktopLayout} 
                      onChange={(e) => {
                        setForceDesktopLayout(e.target.checked);
                        localStorage.setItem("drawerator_force_desktop_layout", e.target.checked);
                      }}
                      style={{ cursor: "pointer", accentColor: "var(--color-primary)" }}
                    />
                  </div>

                  <div className="settings-row" style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <label style={{ margin: 0, cursor: "pointer" }}>Show Toolbar Hints</label>
                    <input 
                      type="checkbox" 
                      checked={showToolbarHints} 
                      onChange={(e) => {
                        setShowToolbarHints(e.target.checked);
                        localStorage.setItem("drawerator_show_toolbar_hints", e.target.checked);
                      }}
                      style={{ cursor: "pointer", accentColor: "var(--color-primary)" }}
                    />
                  </div>

                  <div className="settings-row" style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <label style={{ margin: 0, cursor: "pointer" }}>Show Bottom Alerts</label>
                    <input 
                      type="checkbox" 
                      checked={showBottomNotifications} 
                      onChange={(e) => {
                        setShowBottomNotifications(e.target.checked);
                        localStorage.setItem("drawerator_show_bottom_notifications", e.target.checked);
                      }}
                      style={{ cursor: "pointer", accentColor: "var(--color-primary)" }}
                    />
                  </div>

                  <hr style={{ border: "none", borderTop: "1px solid var(--border-color)", margin: "8px 0" }} />

                  {excalidrawAPI && (() => {
                    const appState = excalidrawAPI.getAppState() || {};
                    return (
                      <>
                        <div className="settings-row" style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                          <label style={{ margin: 0, cursor: "pointer" }}>Grid Mode</label>
                          <input 
                            type="checkbox" 
                            checked={appState.gridModeEnabled || false} 
                            onChange={(e) => {
                              excalidrawAPI.updateScene({ appState: { gridModeEnabled: e.target.checked } });
                            }}
                            style={{ cursor: "pointer", accentColor: "var(--color-primary)" }}
                          />
                        </div>

                        <div className="settings-row" style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                          <label style={{ margin: 0, cursor: "pointer" }}>Zen Mode</label>
                          <input 
                            type="checkbox" 
                            checked={appState.zenModeEnabled || false} 
                            onChange={(e) => {
                              excalidrawAPI.updateScene({ appState: { zenModeEnabled: e.target.checked } });
                            }}
                            style={{ cursor: "pointer", accentColor: "var(--color-primary)" }}
                          />
                        </div>

                        <div className="settings-row" style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                          <label style={{ margin: 0, cursor: "pointer" }}>View Mode</label>
                          <input 
                            type="checkbox" 
                            checked={appState.viewModeEnabled || false} 
                            onChange={(e) => {
                              excalidrawAPI.updateScene({ appState: { viewModeEnabled: e.target.checked } });
                            }}
                            style={{ cursor: "pointer", accentColor: "var(--color-primary)" }}
                          />
                        </div>

                        <div className="settings-row" style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                          <label style={{ margin: 0, cursor: "pointer" }}>Snap to Objects</label>
                          <input 
                            type="checkbox" 
                            checked={appState.objectsSnapModeEnabled || false} 
                            onChange={(e) => {
                              excalidrawAPI.updateScene({ appState: { objectsSnapModeEnabled: e.target.checked } });
                            }}
                            style={{ cursor: "pointer", accentColor: "var(--color-primary)" }}
                          />
                        </div>
                      </>
                    );
                  })()}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Command Palette Overlay */}
      {showCommandPalette && (
        <div className={`excalidraw theme--${theme}`}>
          <div id="command-palette-overlay" onClick={() => setShowCommandPalette(false)}>
            <div className="command-palette-card" onClick={(e) => e.stopPropagation()}>
              <div className="command-palette-header">
                <input
                  ref={paletteInputRef}
                  id="command-palette-input"
                  type="text"
                  value={commandSearch}
                  onChange={(e) => {
                    setCommandSearch(e.target.value);
                    setSelectedIndex(0);
                  }}
                  placeholder="Type a command or ask AI (e.g. 'draw a flow chart')..."
                  onKeyDown={(e) => {
                    const filtered = getFilteredCommands();
                    if (e.key === "ArrowDown") {
                      e.preventDefault();
                      setSelectedIndex(prev => (prev + 1) % filtered.length);
                    } else if (e.key === "ArrowUp") {
                      e.preventDefault();
                      setSelectedIndex(prev => (prev - 1 + filtered.length) % filtered.length);
                    } else if (e.key === "Enter") {
                      e.preventDefault();
                      if (filtered[selectedIndex]) {
                        executeCommand(filtered[selectedIndex]);
                      }
                    } else if (e.key === "Escape") {
                      e.preventDefault();
                      setShowCommandPalette(false);
                    }
                  }}
                />
              </div>
              <div className="command-palette-results">
                {getFilteredCommands().map((cmd, idx) => (
                  <div
                    key={cmd.id}
                    className={`command-palette-item ${idx === selectedIndex ? "active" : ""}`}
                    onClick={() => executeCommand(cmd)}
                    onMouseEnter={() => setSelectedIndex(idx)}
                  >
                    <div style={{ display: "flex", flexDirection: "column" }}>
                      <span className="command-name">{cmd.name}</span>
                      <span className="command-category">{cmd.category}</span>
                    </div>
                    {cmd.id === "ask-ai" && (
                      <span className="command-badge">AI Query</span>
                    )}
                  </div>
                ))}
                {getFilteredCommands().length === 0 && (
                  <div className="command-palette-empty">No matching commands found</div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {satoriMode && (
        <button 
          id="btn-exit-satori" 
          onClick={() => setSatoriMode(false)} 
          title="Exit Satori Mode"
        >
          .
        </button>
      )}
    </div>
  );
}

export default App;
