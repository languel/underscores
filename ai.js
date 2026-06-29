// --- LOCAL AI DRIVING ENGINE & PARSER ---

const aiSettings = {
  provider: 'ollama',
  url: 'http://localhost:11434',
  key: '',
  model: '',
  sound: true
};

const SoundEffects = {
  ctx: null,
  init: function() {
    if (!this.ctx) {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    }
  },
  playBoop: function() {
    if (!aiSettings.sound) return;
    try {
      this.init();
      if (this.ctx.state === 'suspended') this.ctx.resume();
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      
      osc.frequency.setValueAtTime(523.25, this.ctx.currentTime); // C5
      osc.frequency.exponentialRampToValueAtTime(880, this.ctx.currentTime + 0.08);
      
      gain.gain.setValueAtTime(0.05, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, this.ctx.currentTime + 0.1);
      
      osc.start();
      osc.stop(this.ctx.currentTime + 0.1);
    } catch(e) {}
  },
  playChime: function() {
    if (!aiSettings.sound) return;
    try {
      this.init();
      if (this.ctx.state === 'suspended') this.ctx.resume();
      const now = this.ctx.currentTime;
      
      const playNote = (freq, delay, dur) => {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.frequency.setValueAtTime(freq, now + delay);
        gain.gain.setValueAtTime(0.04, now + delay);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + delay + dur);
        osc.start(now + delay);
        osc.stop(now + delay + dur);
      };
      
      playNote(523.25, 0, 0.15); // C5
      playNote(659.25, 0.08, 0.15); // E5
      playNote(783.99, 0.16, 0.25); // G5
    } catch(e) {}
  }
};

// --- INITIALIZATION ---
document.addEventListener("DOMContentLoaded", () => {
  loadAISettings();
  setupAIEvents();
  testAIConnection();
});

function loadAISettings() {
  aiSettings.provider = localStorage.getItem("drawerator_ai_provider") || 'ollama';
  aiSettings.url = localStorage.getItem("drawerator_ai_url") || 'http://localhost:11434';
  aiSettings.key = localStorage.getItem("drawerator_ai_key") || '';
  aiSettings.model = localStorage.getItem("drawerator_ai_model") || '';
  aiSettings.sound = localStorage.getItem("drawerator_ai_sound") !== 'false';

  // Sync inputs
  document.getElementById("settings-provider").value = aiSettings.provider;
  document.getElementById("settings-url").value = aiSettings.url;
  document.getElementById("settings-key").value = aiSettings.key;
  document.getElementById("settings-model-manual").value = aiSettings.model;
  document.getElementById("settings-sound").checked = aiSettings.sound;
}

function saveAISettings() {
  aiSettings.provider = document.getElementById("settings-provider").value;
  aiSettings.url = document.getElementById("settings-url").value.trim();
  aiSettings.key = document.getElementById("settings-key").value.trim();
  
  let selectedModel = document.getElementById("settings-model-select").value;
  const manualModel = document.getElementById("settings-model-manual").value.trim();
  if (manualModel) selectedModel = manualModel;
  aiSettings.model = selectedModel;
  
  aiSettings.sound = document.getElementById("settings-sound").checked;

  localStorage.setItem("drawerator_ai_provider", aiSettings.provider);
  localStorage.setItem("drawerator_ai_url", aiSettings.url);
  localStorage.setItem("drawerator_ai_key", aiSettings.key);
  localStorage.setItem("drawerator_ai_model", aiSettings.model);
  localStorage.setItem("drawerator_ai_sound", aiSettings.sound);

  updateAISidebarHeader();
  testAIConnection();
}

function updateAISidebarHeader() {
  const modelTag = document.getElementById("ai-model-tag");
  if (aiSettings.model) {
    modelTag.innerText = aiSettings.model;
    modelTag.title = aiSettings.model;
  } else {
    modelTag.innerText = "Disconnect";
  }
}

// --- CONNECTION TESTING & MODEL LISTING ---
async function testAIConnection() {
  const dot = document.getElementById("settings-status-dot");
  const text = document.getElementById("settings-status-text");
  const sDot = document.getElementById("ai-status-indicator");
  const corsWarning = document.getElementById("settings-cors-warning");

  dot.className = "status-dot warn";
  text.innerText = "Connecting...";
  sDot.className = "status-dot warn";
  corsWarning.classList.add("hidden");

  const provider = document.getElementById("settings-provider").value;
  const url = document.getElementById("settings-url").value.trim().replace(/\/$/, "");
  const key = document.getElementById("settings-key").value.trim();

  const headers = {};
  if (key) headers["Authorization"] = `Bearer ${key}`;

  let testUrl = `${url}/api/tags`; // default Ollama
  if (provider === 'lmstudio' || provider === 'openai') {
    testUrl = `${url}/v1/models`;
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2500);

    const res = await fetch(testUrl, {
      method: 'GET',
      headers,
      signal: controller.signal
    });
    clearTimeout(timeout);

    if (res.ok) {
      const json = await res.json();
      dot.className = "status-dot ok";
      text.innerText = "Connected";
      sDot.className = "status-dot ok";
      
      // Populate Models Select List
      populateModelsDropdown(json, provider);
      updateAISidebarHeader();
    } else {
      dot.className = "status-dot error";
      text.innerText = `HTTP Warning ${res.status}`;
      sDot.className = "status-dot error";
    }
  } catch (e) {
    dot.className = "status-dot error";
    text.innerText = "Unreachable";
    sDot.className = "status-dot error";
    if (provider === 'ollama') {
      corsWarning.classList.remove("hidden");
    }
  }
}

function populateModelsDropdown(data, provider) {
  const select = document.getElementById("settings-model-select");
  select.innerHTML = '<option value="">Select a model...</option>';

  let models = [];
  if (provider === 'ollama' && data.models) {
    models = data.models.map(m => m.name);
  } else if ((provider === 'lmstudio' || provider === 'openai') && data.data) {
    models = data.data.map(m => m.id);
  }

  models.forEach(m => {
    const opt = document.createElement("option");
    opt.value = m;
    opt.innerText = m;
    if (m === aiSettings.model) opt.selected = true;
    select.appendChild(opt);
  });
}

// --- AI CHAT PANEL LOGIC & XML TOOL PARSING ---
const SYSTEM_PROMPT = `You are a creative drawing assistant driving a canvas board.
The canvas coordinates are arbitrary 2D floats. The center viewport of the user is around 0, 0.
You can communicate with the user via normal text response, AND you can draw shapes, lines, or control the board by outputting XML tool tags in your responses. 

You MUST use ONLY the following XML tags to draw:
- Line: <line x1="10" y1="20" x2="100" y2="150" color="#f8fafc" width="3" brush="rough" />
  (brush options: "rough" (sketchy), "pencil" (clean), "felt" (thick chisel marker))
- Rectangle: <rect x="50" y="-100" w="150" h="80" color="#ef4444" width="4" brush="rough" />
- Circle: <circle x="0" y="0" r="50" color="#10b981" width="3" brush="rough" />
- Freehand Path: <path points="10,20 15,25 20,30 25,32" color="#f8fafc" width="3" brush="rough" />
- Clear board: <clear />
- Erase path by its ID: <erase id="path_123" />
- Move path: <move id="path_123" dx="50" dy="-20" />
- Pan viewport: <pan x="100" y="50" />
- Zoom: <zoom level="1.5" />
- Read paths to "see" current drawing JSON list: <read_canvas />

Guidelines:
1. Always output both standard text descriptions explaining what you're doing, followed or preceded by the relevant XML tags.
2. If the user asks to draw complex shapes, combine multiple tags! For example, a house is a <rect> base and lines forming a triangular roof.
3. Coordinates: Keep shapes centered relative to coordinates 0,0 unless the user specifies otherwise, or based on the context of other shapes.
4. You will automatically receive context metadata appended to user prompts showing the details of the active selected path (points list) and a summary of all other paths on the canvas. Use this selection details to clone, offset, scale, rotate, or modify drawings as requested!`;

let chatHistory = [
  { role: 'system', content: SYSTEM_PROMPT }
];

async function sendChatMessage() {
  const input = document.getElementById("chat-message-input");
  const text = input.value.trim();
  if (!text) return;

  SoundEffects.playBoop();

  // 1. Add User Message to UI
  appendMessage('user', text);
  input.value = "";

  chatHistory.push({ role: 'user', content: text });

  // 2. Prepare Assistant Bubble
  const assistantBubble = appendMessage('assistant', "Thinking...");

  // 3. Request Completion Stream
  if (!aiSettings.model) {
    assistantBubble.innerText = "Error: No local AI model selected in settings. Please click the gear icon to connect and select a model.";
    return;
  }

  // Inject canvas paths selection and summaries into payload message context
  const selectedPath = paths.find(p => p.id === state.selectedPathId);
  const selectionInfo = selectedPath ? {
    id: selectedPath.id,
    brush: selectedPath.properties.brush,
    color: selectedPath.properties.color,
    width: selectedPath.properties.width,
    points: selectedPath.points.map(pt => ({
      x: Math.round(pt.x * 10) / 10,
      y: Math.round(pt.y * 10) / 10
    }))
  } : null;

  const canvasSummary = paths.map(p => ({
    id: p.id,
    brush: p.properties.brush,
    color: p.properties.color,
    width: p.properties.width,
    points_count: p.points.length,
    bounds: getPathBounds(p)
  }));

  // Create clone of chatHistory to append context metadata to user prompt without displaying it
  const payloadMessages = JSON.parse(JSON.stringify(chatHistory));
  if (payloadMessages.length > 0) {
    const lastUserMsg = payloadMessages[payloadMessages.length - 1];
    if (lastUserMsg.role === 'user') {
      lastUserMsg.content += `\n\n[Canvas Context]
Active Selection: ${selectionInfo ? JSON.stringify(selectionInfo) : "None"}
All Paths Summary: ${JSON.stringify(canvasSummary)}`;
    }
  }

  const endpoint = aiSettings.url.replace(/\/$/, "");
  let fetchUrl = "";
  let payload = {};

  if (aiSettings.provider === 'ollama') {
    fetchUrl = `${endpoint}/api/chat`;
    payload = {
      model: aiSettings.model,
      messages: payloadMessages,
      stream: true
    };
  } else {
    // LM Studio / OpenAI compatible API
    fetchUrl = `${endpoint}/v1/chat/completions`;
    payload = {
      model: aiSettings.model,
      messages: payloadMessages,
      stream: true
    };
  }

  const headers = { "Content-Type": "application/json" };
  if (aiSettings.key) headers["Authorization"] = `Bearer ${aiSettings.key}`;

  try {
    const res = await fetch(fetchUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      assistantBubble.innerText = `API Connection Error (HTTP ${res.status}). Verify your local engine is running.`;
      return;
    }

    assistantBubble.innerHTML = ""; // Clear loader
    let fullResponse = "";
    
    const reader = res.body.getReader();
    const decoder = new TextDecoder("utf-8");

    if (aiSettings.provider === 'ollama') {
      // Ollama stream processing (JSON lines format)
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunks = decoder.decode(value, { stream: true }).split('\n');
        chunks.forEach(chunk => {
          if (!chunk.trim()) return;
          try {
            const parsed = JSON.parse(chunk);
            if (parsed.message && parsed.message.content) {
              const delta = parsed.message.content;
              fullResponse += delta;
              assistantBubble.innerText = fullResponse;
              scrollToBottom("chat-messages");
            }
          } catch(e) {}
        });
      }
    } else {
      // OpenAI/LM Studio Event Stream SSE processing
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const raw = decoder.decode(value, { stream: true });
        const lines = raw.split('\n');
        
        lines.forEach(line => {
          if (line.startsWith("data: ")) {
            const dataStr = line.slice(6).trim();
            if (dataStr === "[DONE]") return;
            try {
              const parsed = JSON.parse(dataStr);
              if (parsed.choices && parsed.choices[0].delta && parsed.choices[0].delta.content) {
                const delta = parsed.choices[0].delta.content;
                fullResponse += delta;
                assistantBubble.innerText = fullResponse;
                scrollToBottom("chat-messages");
              }
            } catch(e) {}
          }
        });
      }
    }

    // Completion Finished! Process Tool XML Tags
    chatHistory.push({ role: 'assistant', content: fullResponse });
    addCopyButtonToBubble(assistantBubble, fullResponse);
    await executeAIToolCalls(fullResponse);

  } catch (err) {
    console.error("Chat streaming failed", err);
    assistantBubble.innerText = "Error: Unreachable AI Endpoint. Please verify your local LLM URL and CORS settings.";
  }
}

// XML tag parser and API router
async function executeAIToolCalls(text) {
  const lineRegex = /<line\s+([^>]+)\s*\/?>/gi;
  const rectRegex = /<rect\s+([^>]+)\s*\/?>/gi;
  const circleRegex = /<circle\s+([^>]+)\s*\/?>/gi;
  const clearRegex = /<clear\s*\/?>/gi;
  const eraseRegex = /<erase\s+([^>]+)\s*\/?>/gi;
  const moveRegex = /<move\s+([^>]+)\s*\/?>/gi;
  const panRegex = /<pan\s+([^>]+)\s*\/?>/gi;
  const zoomRegex = /<zoom\s+([^>]+)\s*\/?>/gi;
  const readRegex = /<read_canvas\s*\/?>/gi;

  let match;
  let didAction = false;

  const parseAttrs = (str) => {
    const attrs = {};
    const attrRegex = /(\w+)="([^"]*)"/g;
    let m;
    while ((m = attrRegex.exec(str)) !== null) {
      attrs[m[1]] = m[2];
    }
    return attrs;
  };

  // 1. Clear Canvas
  if (clearRegex.test(text)) {
    DraweratorAPI.clearCanvas();
    didAction = true;
  }

  // 2. Lines
  while ((match = lineRegex.exec(text)) !== null) {
    const a = parseAttrs(match[1]);
    if (a.x1 && a.y1 && a.x2 && a.y2) {
      DraweratorAPI.drawLine(
        parseFloat(a.x1), parseFloat(a.y1),
        parseFloat(a.x2), parseFloat(a.y2),
        { color: a.color, width: parseFloat(a.width), brush: a.brush }
      );
      didAction = true;
    }
  }

  // 3. Rectangles
  while ((match = rectRegex.exec(text)) !== null) {
    const a = parseAttrs(match[1]);
    if (a.x && a.y && a.w && a.h) {
      DraweratorAPI.drawRectangle(
        parseFloat(a.x), parseFloat(a.y),
        parseFloat(a.w), parseFloat(a.h),
        { color: a.color, width: parseFloat(a.width), brush: a.brush }
      );
      didAction = true;
    }
  }

  // 4. Circles
  while ((match = circleRegex.exec(text)) !== null) {
    const a = parseAttrs(match[1]);
    if (a.x && a.y && a.r) {
      DraweratorAPI.drawCircle(
        parseFloat(a.x), parseFloat(a.y), parseFloat(a.r),
        { color: a.color, width: parseFloat(a.width), brush: a.brush }
      );
      didAction = true;
    }
  }

  // 4b. Freehand Paths
  const pathRegex = /<path\s+([^>]+)\s*\/?>/gi;
  while ((match = pathRegex.exec(text)) !== null) {
    const a = parseAttrs(match[1]);
    if (a.points) {
      DraweratorAPI.drawFreehandPath(
        a.points,
        { color: a.color, width: parseFloat(a.width), brush: a.brush }
      );
      didAction = true;
    }
  }

  // 5. Erases
  while ((match = eraseRegex.exec(text)) !== null) {
    const a = parseAttrs(match[1]);
    if (a.id) {
      DraweratorAPI.erasePath(a.id);
      didAction = true;
    }
  }

  // 6. Moves
  while ((match = moveRegex.exec(text)) !== null) {
    const a = parseAttrs(match[1]);
    if (a.id && a.dx && a.dy) {
      DraweratorAPI.movePath(a.id, parseFloat(a.dx), parseFloat(a.dy));
      didAction = true;
    }
  }

  // 7. Pan Viewport
  while ((match = panRegex.exec(text)) !== null) {
    const a = parseAttrs(match[1]);
    if (a.x && a.y) {
      DraweratorAPI.panTo(parseFloat(a.x), parseFloat(a.y));
      didAction = true;
    }
  }

  // 8. Zoom
  while ((match = zoomRegex.exec(text)) !== null) {
    const a = parseAttrs(match[1]);
    if (a.level) {
      DraweratorAPI.zoomTo(parseFloat(a.level));
      didAction = true;
    }
  }

  // 9. Read Canvas (Expose active list paths back to chat model memory context)
  if (readRegex.test(text)) {
    const pathsJSON = DraweratorAPI.getCanvasPaths();
    appendMessage('assistant', `Reading canvas state... Here are the current drawn path elements:\n\`\`\`json\n${pathsJSON}\n\`\`\``);
    chatHistory.push({
      role: 'user',
      content: `Here is the current canvas state JSON:\n${pathsJSON}\nYou can now reference these elements by id to edit or erase them.`
    });
    // Call chat again to let the AI react to the canvas state!
    sendChatMessage();
    return;
  }

  if (didAction) {
    SoundEffects.playChime();
  }
}

// --- CHAT INTERFACE HELPERS ---
function addCopyButtonToBubble(bubble, text) {
  const existing = bubble.querySelector(".copy-bubble-btn");
  if (existing) existing.remove();

  if (text && text !== "Thinking...") {
    const copyBtn = document.createElement("button");
    copyBtn.className = "copy-bubble-btn";
    copyBtn.innerText = "Copy";
    copyBtn.title = "Copy message text";
    copyBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      navigator.clipboard.writeText(text).then(() => {
        copyBtn.innerText = "Copied!";
        setTimeout(() => copyBtn.innerText = "Copy", 1500);
      });
    });
    bubble.appendChild(copyBtn);
  }
}

function appendMessage(role, text) {
  const container = document.getElementById("chat-messages");
  const bubble = document.createElement("div");
  bubble.className = `chat-message ${role}`;
  bubble.innerText = text;
  
  if (text !== "Thinking...") {
    addCopyButtonToBubble(bubble, text);
  }

  container.appendChild(bubble);
  scrollToBottom("chat-messages");
  return bubble;
}

function scrollToBottom(id) {
  const el = document.getElementById(id);
  el.scrollTop = el.scrollHeight;
}

function setupAIEvents() {
  // Send chat trigger
  document.getElementById("chat-send-btn").addEventListener("click", sendChatMessage);
  document.getElementById("chat-message-input").addEventListener("keydown", (e) => {
    if (e.key === "Enter" && e.ctrlKey) {
      e.preventDefault();
      sendChatMessage();
    }
  });

  // Settings Save trigger
  document.getElementById("settings-save-btn").addEventListener("click", () => {
    saveAISettings();
    document.getElementById("settings-overlay").classList.add("hidden");
  });

  // Settings Refresh trigger
  document.getElementById("settings-refresh-models-btn").addEventListener("click", testAIConnection);
  
  // Sync model dropdown selection to manual input field
  document.getElementById("settings-model-select").addEventListener("change", (e) => {
    document.getElementById("settings-model-manual").value = e.target.value;
  });

  document.getElementById("settings-provider").addEventListener("change", (e) => {
    const provider = e.target.value;
    const urlInput = document.getElementById("settings-url");
    
    // Clear old model entries to prevent stale values from overriding new ones
    document.getElementById("settings-model-manual").value = "";
    document.getElementById("settings-model-select").value = "";

    if (provider === 'ollama') {
      urlInput.value = "http://localhost:11434";
    } else if (provider === 'lmstudio') {
      urlInput.value = "http://localhost:1234";
    } else if (provider === 'openai') {
      urlInput.value = "https://api.openai.com";
    }
    testAIConnection();
  });

  // Start a fresh conversation
  document.getElementById("btn-new-chat").addEventListener("click", () => {
    if (confirm("Reset conversation history?")) {
      chatHistory = [{ role: 'system', content: SYSTEM_PROMPT }];
      const chatContainer = document.getElementById("chat-messages");
      chatContainer.innerHTML = "";
      
      // Add initial greeting
      appendMessage('assistant', "Hello! I am your drawing assistant powered by local AI. You can write prompts like \"draw a flow chart\", \"sketch a house\", or \"clean the canvas\" and I will execute the drawing tools programmatically!");
      logToolAction("new_chat_session()", 'ok');
    }
  });

  // Copy whole conversation transcript
  document.getElementById("btn-copy-transcript").addEventListener("click", () => {
    const transcript = chatHistory
      .filter(msg => msg.role !== 'system')
      .map(msg => `[${msg.role === 'user' ? 'User' : 'AI Assistant'}]:\n${msg.content}`)
      .join("\n\n");
      
    if (!transcript.trim()) {
      alert("No conversation history to copy!");
      return;
    }

    navigator.clipboard.writeText(transcript).then(() => {
      const copyBtn = document.getElementById("btn-copy-transcript");
      copyBtn.innerText = "Copied!";
      setTimeout(() => copyBtn.innerText = "Copy All", 1500);
    });
  });
}
