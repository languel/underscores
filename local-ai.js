/**
 * draw-with-local-ai Bootstrap Script
 * Intercepts Next.js drawing API requests and resolves them using Ollama, LM Studio, window.ai, Claude, OpenAI, or OpenRouter
 */

(function () {
  // --- 1. LOCAL STORAGE SETTINGS MANAGEMENT ---
  const DEFAULT_SETTINGS = {
    provider: "ollama", // "ollama" | "lmstudio" | "windowai" | "claude" | "openai" | "openrouter"
    ollamaUrl: "http://localhost:11434",
    ollamaModel: "llama3",
    lmStudioUrl: "http://localhost:1234",
    lmStudioModel: "default",
    claudeUrl: "https://api.anthropic.com",
    claudeModel: "claude-3-5-sonnet-20241022",
    openaiUrl: "https://api.openai.com/v1",
    openaiModel: "gpt-4o",
    openrouterUrl: "https://openrouter.ai/api/v1",
    openrouterModel: "anthropic/claude-3.5-sonnet",
    ollamaApiKey: "",
    lmStudioApiKey: "",
    claudeApiKey: "",
    openaiApiKey: "",
    openrouterApiKey: "",
    useVision: false,
    soundEffects: false, // Default off
    textFallbackMode: true,
  };

  function loadSettings() {
    try {
      const saved = localStorage.getItem("draw_local_ai_settings");
      return saved ? { ...DEFAULT_SETTINGS, ...JSON.parse(saved) } : { ...DEFAULT_SETTINGS };
    } catch (e) {
      return { ...DEFAULT_SETTINGS };
    }
  }

  function saveSettings(settings) {
    try {
      localStorage.setItem("draw_local_ai_settings", JSON.stringify(settings));
    } catch (e) {
      console.error("Failed to save settings to localStorage", e);
    }
  }

  let settings = loadSettings();

  // --- 2. SUBTLE UI AUDIO SYNTHESIZER (Web Audio API) ---
  const AudioSynth = {
    ctx: null,
    enabled: settings.soundEffects,

    init() {
      if (!this.ctx) {
        this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      }
    },

    playClick() {
      if (!this.enabled) return;
      try {
        this.init();
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        
        osc.type = "sine";
        osc.frequency.setValueAtTime(800, this.ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(100, this.ctx.currentTime + 0.05);
        
        gain.gain.setValueAtTime(0.05, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.05);
        
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start();
        osc.stop(this.ctx.currentTime + 0.05);
      } catch(e) {}
    },

    playBoop() {
      if (!this.enabled) return;
      try {
        this.init();
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        
        osc.type = "triangle";
        osc.frequency.setValueAtTime(300, this.ctx.currentTime);
        osc.frequency.setValueAtTime(400, this.ctx.currentTime + 0.08);
        
        gain.gain.setValueAtTime(0.06, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.2);
        
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start();
        osc.stop(this.ctx.currentTime + 0.2);
      } catch(e) {}
    },

    playChime() {
      if (!this.enabled) return;
      try {
        this.init();
        const now = this.ctx.currentTime;
        
        const playNote = (freq, time, duration) => {
          const osc = this.ctx.createOscillator();
          const gain = this.ctx.createGain();
          osc.type = "sine";
          osc.frequency.setValueAtTime(freq, time);
          gain.gain.setValueAtTime(0.05, time);
          gain.gain.exponentialRampToValueAtTime(0.001, time + duration);
          osc.connect(gain);
          gain.connect(this.ctx.destination);
          osc.start(time);
          osc.stop(time + duration);
        };

        playNote(523.25, now, 0.15); // C5
        playNote(659.25, now + 0.1, 0.25); // E5
      } catch(e) {}
    },

    playDrawing() {
      if (!this.enabled) return;
      try {
        this.init();
        const bufferSize = this.ctx.sampleRate * 0.1; // 100ms
        const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
        const data = buffer.getChannelData(0);
        
        for (let i = 0; i < bufferSize; i++) {
          data[i] = Math.random() * 2 - 1;
        }
        
        const noise = this.ctx.createBufferSource();
        noise.buffer = buffer;
        
        const filter = this.ctx.createBiquadFilter();
        filter.type = "bandpass";
        filter.frequency.value = 1000;
        filter.Q.value = 3.0;
        
        const gain = this.ctx.createGain();
        gain.gain.setValueAtTime(0.02, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.1);
        
        noise.connect(filter);
        filter.connect(gain);
        gain.connect(this.ctx.destination);
        
        noise.start();
      } catch(e) {}
    }
  };

  // --- 3. CANVAS ELEMENTS SERIALIZER (For text-only LLMs) ---
  function serializeElements(elements) {
    if (!elements || elements.length === 0) {
      return "The canvas is currently completely empty.";
    }

    let desc = "Here are the current drawing elements on the canvas:\n";
    elements.forEach((el) => {
      const colorStr = el.color || "#000000";
      if (el.type === "shape") {
        const s = el.data;
        if (!s) return;
        if (s.type === "path" && s.d) {
          desc += `- SVG Path: d="${s.d}", color="${s.color || colorStr}", strokeWidth=${s.strokeWidth || 2}\n`;
        } else if (s.type === "circle" && s.cx !== undefined) {
          desc += `- SVG Circle: cx=${s.cx}, cy=${s.cy}, r=${s.r}, color="${s.color || colorStr}", fill="${s.fill || "none"}"\n`;
        } else if (s.type === "ellipse" && s.cx !== undefined) {
          desc += `- SVG Ellipse: cx=${s.cx}, cy=${s.cy}, rx=${s.rx}, ry=${s.ry}, color="${s.color || colorStr}", fill="${s.fill || "none"}"\n`;
        } else if (s.type === "rect" && s.x !== undefined) {
          desc += `- SVG Rect: x=${s.x}, y=${s.y}, width=${s.width}, height=${s.height}, color="${s.color || colorStr}", fill="${s.fill || "none"}"\n`;
        }
      } else if (el.type === "block") {
        desc += `- ASCII Art Block at (x=${el.x}, y=${el.y}), color="${el.color || colorStr}":\n\`\`\`\n${el.block}\n\`\`\`\n`;
      }
    });
    return desc;
  }

  function formatHistory(history, comments) {
    let context = "";
    if (history && history.length > 0) {
      context += "Drawing History / Turn Context:\n";
      history.forEach((turn, idx) => {
        const role = turn.who === "human" ? "Human" : "Claude (AI)";
        context += `Turn ${idx + 1} (${role}):\n`;
        if (turn.description) {
          context += `  - Turn Description: ${turn.description}\n`;
        }
        if (turn.shapes && turn.shapes.length > 0) {
          context += `  - Drew shapes: ${turn.shapes.map(s => s.type).join(", ")}\n`;
        }
        if (turn.blocks && turn.blocks.length > 0) {
          context += `  - Drew ASCII text blocks\n`;
        }
      });
      context += "\n";
    }

    if (comments && comments.length > 0) {
      context += "Canvas Comments / Suggestions:\n";
      comments.forEach(c => {
        context += `  - ${c.from}: "${c.text}" at (${c.x}, ${c.y})\n`;
        if (c.replies && c.replies.length > 0) {
          c.replies.forEach(r => {
            context += `    reply from ${r.from}: "${r.text}"\n`;
          });
        }
      });
      context += "\n";
    }
    return context;
  }

  // --- 4. INCREMENTAL XML STREAM PARSER ---
  class StreamParser {
    constructor(onEvent) {
      this.onEvent = onEvent;
      this.buffer = "";
      
      this.lastThoughtLength = 0;
      this.lastSayLength = 0;
      this.emittedTags = new Set();
    }

    feed(chunk) {
      this.buffer += chunk;
      this.parse();
    }

    parse() {
      // 1. Parse thinking/thoughts
      let thoughtStart = this.buffer.indexOf("<thought>");
      if (thoughtStart !== -1) {
        let contentStart = thoughtStart + "<thought>".length;
        let thoughtEnd = this.buffer.indexOf("</thought>", contentStart);
        let content = "";
        if (thoughtEnd !== -1) {
          content = this.buffer.substring(contentStart, thoughtEnd);
        } else {
          content = this.buffer.substring(contentStart);
        }
        if (content.length > this.lastThoughtLength) {
          this.onEvent({ type: "thinking", data: content });
          this.lastThoughtLength = content.length;
        }
      }

      // 2. Parse say/comments
      let sayMatch = /<say\s+x="([^"]+)"\s+y="([^"]+)"(?:\s+reply_to="([^"]+)")?\s*>/g.exec(this.buffer);
      if (sayMatch) {
        let tagStart = sayMatch.index;
        let contentStart = tagStart + sayMatch[0].length;
        let sayEnd = this.buffer.indexOf("</say>", contentStart);
        let content = "";
        let isDone = false;
        if (sayEnd !== -1) {
          content = this.buffer.substring(contentStart, sayEnd);
          isDone = true;
        } else {
          content = this.buffer.substring(contentStart);
        }

        let x = parseFloat(sayMatch[1]);
        let y = parseFloat(sayMatch[2]);
        let replyTo = sayMatch[3] ? parseInt(sayMatch[3]) : undefined;
        let tagKey = `say-${tagStart}`;

        if (!this.emittedTags.has(tagKey)) {
          this.emittedTags.add(tagKey);
          this.onEvent({ type: "replyStart", data: { replyTo, threadId: tagKey } });
        }

        if (content.length > this.lastSayLength) {
          let delta = content.substring(this.lastSayLength);
          this.onEvent({ type: "sayChunk", data: { text: delta, threadId: tagKey } });
          this.lastSayLength = content.length;
        }

        if (isDone && !this.emittedTags.has(tagKey + "-done")) {
          this.emittedTags.add(tagKey + "-done");
          this.onEvent({ type: "say", data: { text: content, sayX: x, sayY: y, replyTo, threadId: tagKey } });
        }
      }

      // 3. SVG Shapes
      let shapeRegex = /<(svg_path|svg_circle|svg_ellipse|svg_rect)\s+([^>]+?)\s*\/?>/g;
      let match;
      while ((match = shapeRegex.exec(this.buffer)) !== null) {
        let tagType = match[1];
        let attrStr = match[2];
        let tagKey = `shape-${match.index}`;

        if (!this.emittedTags.has(tagKey)) {
          this.emittedTags.add(tagKey);
          AudioSynth.playDrawing(); // Play drawing noise

          let attrs = this.parseAttributes(attrStr);
          let shape = { type: tagType.replace("svg_", "") };

          if (attrs.d) shape.d = attrs.d;
          if (attrs.cx) shape.cx = parseFloat(attrs.cx);
          if (attrs.cy) shape.cy = parseFloat(attrs.cy);
          if (attrs.r) shape.r = parseFloat(attrs.r);
          if (attrs.rx) shape.rx = parseFloat(attrs.rx);
          if (attrs.ry) shape.ry = parseFloat(attrs.ry);
          if (attrs.x) shape.x = parseFloat(attrs.x);
          if (attrs.y) shape.y = parseFloat(attrs.y);
          if (attrs.width) shape.width = parseFloat(attrs.width);
          if (attrs.height) shape.height = parseFloat(attrs.height);
          if (attrs.color) shape.color = attrs.color;
          if (attrs.fill) shape.fill = attrs.fill;
          if (attrs.stroke_width || attrs["stroke-width"]) {
            shape.strokeWidth = parseFloat(attrs.stroke_width || attrs["stroke-width"]);
          }
          if (attrs.opacity) shape.opacity = parseFloat(attrs.opacity);
          if (attrs.transform) shape.transform = attrs.transform;

          this.onEvent({ type: "shape", data: shape });
        }
      }

      // 4. ASCII blocks
      let blockRegex = /<ascii_block\s+([^>]+?)\s*>([\s\S]*?)<\/ascii_block>/g;
      while ((match = blockRegex.exec(this.buffer)) !== null) {
        let tagKey = `block-${match.index}`;
        if (!this.emittedTags.has(tagKey)) {
          this.emittedTags.add(tagKey);
          AudioSynth.playDrawing(); // Play drawing noise

          let attrStr = match[1];
          let content = match[2];
          let attrs = this.parseAttributes(attrStr);

          let block = {
            block: content.trim(),
            x: parseFloat(attrs.x || "0"),
            y: parseFloat(attrs.y || "0"),
            color: attrs.color || "#000000"
          };

          this.onEvent({ type: "block", data: block });
        }
      }

      // 5. Wish
      let wishRegex = /<wish\s*>([\s\S]*?)<\/wish>/g;
      while ((match = wishRegex.exec(this.buffer)) !== null) {
        let tagKey = `wish-${match.index}`;
        if (!this.emittedTags.has(tagKey)) {
          this.emittedTags.add(tagKey);
          this.onEvent({ type: "wish", data: match[1].trim() });
        }
      }

      // 6. Set Palette
      let paletteRegex = /<set_palette\s+index="([^"]+)"\s*\/?>/g;
      while ((match = paletteRegex.exec(this.buffer)) !== null) {
        let tagKey = `palette-${match.index}`;
        if (!this.emittedTags.has(tagKey)) {
          this.emittedTags.add(tagKey);
          this.onEvent({ type: "setPalette", data: parseInt(match[1]) });
        }
      }
    }

    parseAttributes(attrStr) {
      let attrs = {};
      let attrRegex = /([\w-]+)="([^"]*)"/g;
      let match;
      while ((match = attrRegex.exec(attrStr)) !== null) {
        attrs[match[1]] = match[2];
      }
      return attrs;
    }
  }

  // --- 5. STREAM GENERATOR (LOCAL RESPONSE EMULATOR) ---
  async function generateLocalAIStream(controller, requestData) {
    const encoder = new TextEncoder();
    const emit = (event) => {
      const dataStr = `data: ${JSON.stringify(event)}\n\n`;
      controller.enqueue(encoder.encode(dataStr));
    };

    try {
      AudioSynth.playBoop(); // Play start chime
      emit({ type: "thinking", data: "Initializing local AI engine..." });

      // Gather input data
      const canvasWidth = requestData.canvasWidth || 800;
      const canvasHeight = requestData.canvasHeight || 600;
      const historyStr = formatHistory(requestData.history, requestData.comments);
      const canvasElementsStr = serializeElements(requestData.elements);
      const userPrompt = requestData.prompt || "Draw something beautiful on the canvas.";

      // Build System Prompt
      const systemPrompt = `You are a creative AI assistant drawing on a vector canvas together with a human.
The canvas size is ${canvasWidth}x${canvasHeight} pixels. Grid lines/dots on the canvas are just background guides - ignore them.
You and the human can also use comments.

IMPORTANT: You MUST respond ONLY using the following XML tags. Do NOT write conversational text outside these tags.
Available XML tags:
- <thought>Your thoughts, goals, design ideas, and planned steps. Keep this short and clear.</thought>
- <svg_path d="M... C..." color="#hex" stroke-width="2" fill="none/color" opacity="1" />
- <svg_circle cx="X" cy="Y" r="radius" color="#hex" fill="none/color" />
- <svg_rect x="X" y="Y" width="W" height="H" color="#hex" fill="none/color" />
- <svg_ellipse cx="X" cy="Y" rx="RX" ry="RY" color="#hex" fill="none/color" />
- <ascii_block x="X" y="Y" color="#hex">
multi-line ASCII art text
</ascii_block>
- <say x="X" y="Y">Message to the human on the canvas (1-2 sentences)</say>
- <wish>A collaborative suggestion or idea</wish>
- <set_palette index="0-4" /> (Choose a color palette index 0 to 4)

Make drawings artistic, elegant, and relevant to the user request. Ensure all coordinates fit within the ${canvasWidth}x${canvasHeight} boundaries.`;

      // Build prompt content
      let promptContent = "";
      if (historyStr) {
        promptContent += `${historyStr}\n`;
      }
      if (canvasElementsStr) {
        promptContent += `${canvasElementsStr}\n`;
      }
      promptContent += `Human User Request: "${userPrompt}"\n\nYour Turn: Generate your drawing command tags now.`;

      console.log("[Local AI Prompt]", promptContent);

      const tagParser = new StreamParser((evt) => emit(evt));

      // Execute based on selected provider
      if (settings.provider === "windowai") {
        if (!window.ai || !window.ai.languageModel) {
          throw new Error("Chrome window.ai (Gemini Nano) not available. Enable it in chrome://flags");
        }
        emit({ type: "thinking", data: "Creating window.ai local model session..." });
        const session = await window.ai.languageModel.create({
          systemPrompt: systemPrompt
        });
        emit({ type: "thinking", data: "Generating drawing..." });

        const stream = session.promptStreaming(promptContent);
        let lastLength = 0;
        for await (const chunk of stream) {
          const delta = chunk.substring(lastLength);
          tagParser.feed(delta);
          lastLength = chunk.length;
        }
      } else if (settings.provider === "claude") {
        const apiKey = settings.claudeApiKey || settings.apiKey || "";
        if (!apiKey) throw new Error("API Key is required for Claude");

        emit({ type: "thinking", data: "Connecting to Anthropic Claude..." });

        const messages = [];
        if (settings.useVision && requestData.image) {
          const base64Data = requestData.image.split(",")[1];
          const mediaType = requestData.image.split(";")[0].split(":")[1] || "image/jpeg";
          messages.push({
            role: "user",
            content: [
              {
                type: "image",
                source: {
                  type: "base64",
                  media_type: mediaType,
                  data: base64Data
                }
              },
              { type: "text", text: promptContent }
            ]
          });
        } else {
          messages.push({ role: "user", content: promptContent });
        }

        const response = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": apiKey,
            "anthropic-version": "2023-06-01",
            "anthropic-dangerous-direct-browser-access": "true"
          },
          body: JSON.stringify({
            model: settings.claudeModel || "claude-3-5-sonnet-20241022",
            max_tokens: 4096,
            system: systemPrompt,
            messages: messages,
            stream: true
          })
        });

        if (!response.ok) {
          const text = await response.text();
          throw new Error(`Anthropic Claude API error (${response.status}): ${text || response.statusText}`);
        }

        emit({ type: "thinking", data: "Claude is drawing, reading stream..." });

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let streamBuffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          streamBuffer += decoder.decode(value, { stream: true });
          const lines = streamBuffer.split("\n");
          streamBuffer = lines.pop();

          for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed.startsWith("data: ")) {
              try {
                const json = JSON.parse(trimmed.slice(6));
                if (json.type === "content_block_delta" && json.delta && json.delta.text) {
                  tagParser.feed(json.delta.text);
                }
              } catch (err) { }
            }
          }
        }
      } else if (settings.provider === "openai" || settings.provider === "openrouter") {
        const isOR = settings.provider === "openrouter";
        const apiKey = isOR ? (settings.openrouterApiKey || settings.apiKey) : (settings.openaiApiKey || settings.apiKey);
        const endpoint = isOR ? (settings.openrouterUrl || "https://openrouter.ai/api/v1") : (settings.openaiUrl || "https://api.openai.com/v1");
        const model = isOR ? (settings.openrouterModel || "anthropic/claude-3.5-sonnet") : (settings.openaiModel || "gpt-4o");
        
        let cleanEndpoint = endpoint.replace(/\/$/, "");
        if (cleanEndpoint === "https://api.openai.com") {
          cleanEndpoint = "https://api.openai.com/v1";
        }
        const fullUrl = `${cleanEndpoint}/chat/completions`;

        if (!apiKey) throw new Error(`API Key is required for ${isOR ? "OpenRouter" : "OpenAI"}`);

        emit({ type: "thinking", data: `Connecting to ${isOR ? "OpenRouter" : "OpenAI"}...` });

        const headers = {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${apiKey}`
        };
        if (isOR) {
          headers["HTTP-Referer"] = "https://lelezhang.design";
          headers["X-Title"] = "DrawWith AI Local";
        }

        const messages = [
          { role: "system", content: systemPrompt }
        ];

        if (settings.useVision && requestData.image) {
          messages.push({
            role: "user",
            content: [
              { type: "text", text: promptContent },
              { type: "image_url", image_url: { url: requestData.image } }
            ]
          });
        } else {
          messages.push({ role: "user", content: promptContent });
        }

        const response = await fetch(fullUrl, {
          method: "POST",
          headers: headers,
          body: JSON.stringify({
            model: model,
            messages: messages,
            stream: true
          })
        });

        if (!response.ok) {
          const text = await response.text();
          throw new Error(`${isOR ? "OpenRouter" : "OpenAI"} API error (${response.status}): ${text || response.statusText}`);
        }

        emit({ type: "thinking", data: "Model running, reading stream..." });

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let streamBuffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          streamBuffer += decoder.decode(value, { stream: true });
          const lines = streamBuffer.split("\n");
          streamBuffer = lines.pop();

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || trimmed === "data: [DONE]") continue;

            if (trimmed.startsWith("data: ")) {
              try {
                const json = JSON.parse(trimmed.slice(6));
                const content = json.choices?.[0]?.delta?.content;
                if (content) {
                  tagParser.feed(content);
                }
              } catch (err) { }
            }
          }
        }
      } else {
        // Ollama or LM Studio (both support OpenAI compatible chat/completions)
        const endpoint = settings.provider === "ollama" ? settings.ollamaUrl : settings.lmStudioUrl;
        const model = settings.provider === "ollama" ? settings.ollamaModel : settings.lmStudioModel;
        const fullUrl = `${endpoint.replace(/\/$/, "")}/v1/chat/completions`;

        emit({ type: "thinking", data: `Connecting to ${settings.provider.toUpperCase()} at ${endpoint}...` });

        // Prepare messages
        const messages = [
          { role: "system", content: systemPrompt }
        ];

        // Vision model check
        if (settings.useVision && requestData.image) {
          messages.push({
            role: "user",
            content: [
              { type: "text", text: promptContent },
              { type: "image_url", image_url: { url: requestData.image } }
            ]
          });
        } else {
          messages.push({ role: "user", content: promptContent });
        }

        const headers = {
          "Content-Type": "application/json"
        };
        const apiKey = settings.provider === "ollama" ? settings.ollamaApiKey : settings.lmStudioApiKey;
        if (apiKey) {
          headers["Authorization"] = `Bearer ${apiKey}`;
        }

        const response = await fetch(fullUrl, {
          method: "POST",
          headers: headers,
          body: JSON.stringify({
            model: model,
            messages: messages,
            stream: true
          })
        });

        if (!response.ok) {
          const text = await response.text();
          throw new Error(`Local AI API error (${response.status}): ${text || response.statusText}`);
        }

        emit({ type: "thinking", data: "Local model running, reading stream..." });

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let streamBuffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          streamBuffer += decoder.decode(value, { stream: true });
          const lines = streamBuffer.split("\n");
          streamBuffer = lines.pop(); // Keep partial line in buffer

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || trimmed === "data: [DONE]") continue;

            if (trimmed.startsWith("data: ")) {
              try {
                const json = JSON.parse(trimmed.slice(6));
                const content = json.choices?.[0]?.delta?.content;
                if (content) {
                  tagParser.feed(content);
                }
              } catch (err) {
                // Ignore parsing errors for partial tokens
              }
            }
          }
        }
      }

      // Close the parsing
      tagParser.feed(""); // Flush remaining tokens
      emit({ type: "done" });
      AudioSynth.playChime(); // Play double chime on completion
    } catch (e) {
      console.error("[Local AI Stream Error]", e);
      emit({ type: "error", message: e.message || "An error occurred with local AI." });
    } finally {
      controller.close();
    }
  }

  // --- 6. MONKEY PATCH FETCH INJECTOR ---
  const originalFetch = window.fetch;
  window.fetch = async function (resource, options) {
    const url = typeof resource === 'string' ? resource : resource.url;

    if (url === "/api/draw") {
      let requestData = {};
      if (options && options.body) {
        try {
          requestData = JSON.parse(options.body);
        } catch (e) {
          console.error("Failed to parse request body to /api/draw", e);
        }
      }

      const stream = new ReadableStream({
        start(controller) {
          generateLocalAIStream(controller, requestData);
        }
      });

      return new Response(stream, {
        status: 200,
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          "Connection": "keep-alive"
        }
      });
    }

    if (url === "/api/draw/guest-budget") {
      return new Response(JSON.stringify({ remaining: 999.00, exhausted: false }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    }

    if (url === "/api/draw/loading-messages") {
      return new Response(JSON.stringify({
        saw: ["your strokes", "composition outlines"],
        drawing: ["rendering locally...", "thinking up vectors...", "animating math..."]
      }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    }

    if (url === "/api/draw/cursor-hover") {
      return new Response(JSON.stringify({
        message: "Your local AI is thinking..."
      }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    }

    return originalFetch.apply(this, arguments);
  };

  // --- 7. FLOATING UI PANEL & SETTINGS DRAWER ---
  function initUI() {
    const style = document.createElement("style");
    style.innerHTML = `
      .draw-guest-banner, div[class*="z-[90]"], header:not(.draw-header), iframe[id="soundcloud-iframe"], .music-player-iframe, div[class*="z-[80]"], div[class*="z-[70]"] {
        display: none !important;
      }
      #local-ai-btn {
        position: fixed;
        bottom: 24px;
        right: 24px;
        width: 52px;
        height: 52px;
        border-radius: 50%;
        background: rgba(26, 32, 44, 0.75);
        backdrop-filter: blur(16px);
        -webkit-backdrop-filter: blur(16px);
        border: 1px solid rgba(255, 255, 255, 0.08);
        box-shadow: 0 8px 32px 0 rgba(138, 43, 226, 0.2), 0 0 0 1px rgba(255, 255, 255, 0.04);
        cursor: pointer;
        display: none !important;
        align-items: center;
        justify-content: center;
        z-index: 9998;
        transition: transform 0.2s cubic-bezier(0.16, 1, 0.3, 1), box-shadow 0.2s;
        animation: local-ai-pulse 3s infinite;
      }
      #local-ai-btn:hover {
        transform: scale(1.08);
        box-shadow: 0 8px 32px 0 rgba(138, 43, 226, 0.4), 0 0 0 1px rgba(255, 255, 255, 0.15);
      }
      #local-ai-btn svg {
        width: 26px;
        height: 26px;
        color: #e2e8f0;
      }
      @keyframes local-ai-pulse {
        0% { box-shadow: 0 0 0 0 rgba(138, 43, 226, 0.4); }
        70% { box-shadow: 0 0 0 10px rgba(138, 43, 226, 0); }
        100% { box-shadow: 0 0 0 0 rgba(138, 43, 226, 0); }
      }
      
      #local-ai-drawer {
        position: fixed;
        top: 0;
        right: 0;
        width: 380px;
        height: 100vh;
        background: rgba(15, 23, 42, 0.85);
        backdrop-filter: blur(20px);
        -webkit-backdrop-filter: blur(20px);
        border-left: 1px solid rgba(255, 255, 255, 0.08);
        box-shadow: -10px 0 40px rgba(0, 0, 0, 0.5);
        z-index: 9999;
        transform: translateX(100%);
        transition: transform 0.4s cubic-bezier(0.16, 1, 0.3, 1);
        display: flex;
        flex-direction: column;
        color: #f8fafc;
        font-family: 'Instrument Sans', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      }
      #local-ai-drawer.open {
        transform: translateX(0);
      }
      
      .drawer-header {
        padding: 24px;
        border-bottom: 1px solid rgba(255, 255, 255, 0.08);
        display: flex;
        align-items: center;
        justify-content: space-between;
      }
      .drawer-header h2 {
        margin: 0;
        font-size: 20px;
        font-weight: 600;
        background: linear-gradient(135deg, #a78bfa, #38bdf8);
        -webkit-background-clip: text;
        -webkit-text-fill-color: transparent;
      }
      .drawer-close-btn {
        background: none;
        border: none;
        color: #94a3b8;
        cursor: pointer;
        padding: 4px;
        display: flex;
      }
      .drawer-close-btn:hover {
        color: #f1f5f9;
      }
      
      .drawer-content {
        flex: 1;
        overflow-y: auto;
        padding: 24px;
        display: flex;
        flex-direction: column;
        gap: 20px;
      }
      .form-group {
        display: flex;
        flex-direction: column;
        gap: 8px;
      }
      .form-group label {
        font-size: 13px;
        font-weight: 500;
        color: #94a3b8;
      }
      .segmented-control {
        display: flex;
        background: rgba(255, 255, 255, 0.04);
        padding: 3px;
        border-radius: 8px;
        border: 1px solid rgba(255, 255, 255, 0.06);
      }
      .segment-btn {
        flex: 1;
        background: none;
        border: none;
        color: #94a3b8;
        padding: 8px 4px;
        font-size: 13px;
        font-weight: 500;
        border-radius: 6px;
        cursor: pointer;
        transition: background-color 0.2s, color 0.2s;
      }
      .segment-btn.active {
        background: rgba(255, 255, 255, 0.08);
        color: #ffffff;
        box-shadow: 0 2px 4px rgba(0,0,0,0.1);
      }
      
      .input-wrapper {
        display: flex;
        gap: 8px;
      }
      .text-input {
        flex: 1;
        background: rgba(255, 255, 255, 0.04);
        border: 1px solid rgba(255, 255, 255, 0.08);
        border-radius: 8px;
        color: #ffffff;
        padding: 10px 14px;
        font-size: 13px;
        outline: none;
        transition: border-color 0.2s;
      }
      .text-input:focus {
        border-color: #8b5cf6;
      }
      
      .select-input {
        background: rgba(255, 255, 255, 0.04);
        border: 1px solid rgba(255, 255, 255, 0.08);
        border-radius: 8px;
        color: #ffffff;
        padding: 10px 14px;
        font-size: 13px;
        outline: none;
        cursor: pointer;
        width: 100%;
      }
      .select-input option {
        background: #0f172a;
        color: #ffffff;
      }
      
      .btn-icon {
        background: rgba(255, 255, 255, 0.05);
        border: 1px solid rgba(255, 255, 255, 0.08);
        border-radius: 8px;
        color: #f8fafc;
        width: 38px;
        height: 38px;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        transition: background-color 0.2s;
      }
      .btn-icon:hover {
        background: rgba(255, 255, 255, 0.1);
      }
      
      .status-pill {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 4px 8px;
        border-radius: 100px;
        font-size: 12px;
        font-weight: 500;
        background: rgba(255, 255, 255, 0.04);
        border: 1px solid rgba(255, 255, 255, 0.06);
        align-self: flex-start;
      }
      .status-dot {
        width: 8px;
        height: 8px;
        border-radius: 50%;
        background: #94a3b8;
      }
      .status-dot.ok { background: #10b981; }
      .status-dot.error { background: #ef4444; }
      .status-dot.warn { background: #f59e0b; }
      
      .switch-label {
        display: flex;
        align-items: center;
        justify-content: space-between;
        cursor: pointer;
      }
      .switch-label span {
        font-size: 13px;
        font-weight: 500;
        color: #94a3b8;
      }
      .switch-input {
        display: none;
      }
      .switch-slider {
        position: relative;
        width: 36px;
        height: 20px;
        background-color: rgba(255, 255, 255, 0.1);
        border-radius: 20px;
        transition: background-color 0.2s;
      }
      .switch-slider::before {
        position: absolute;
        content: "";
        height: 14px;
        width: 14px;
        left: 3px;
        bottom: 3px;
        background-color: white;
        border-radius: 50%;
        transition: transform 0.2s;
      }
      .switch-input:checked + .switch-slider {
        background-color: #8b5cf6;
      }
      .switch-input:checked + .switch-slider::before {
        transform: translateX(16px);
      }
      
      .cors-help {
        background: rgba(239, 68, 68, 0.05);
        border: 1px solid rgba(239, 68, 68, 0.15);
        border-radius: 8px;
        padding: 12px;
        display: flex;
        flex-direction: column;
        gap: 6px;
      }
      .cors-help-title {
        font-size: 12px;
        font-weight: 600;
        color: #fca5a5;
        display: flex;
        align-items: center;
        gap: 6px;
      }
      .cors-help-desc {
        font-size: 11px;
        color: #f8fafc;
        line-height: 1.4;
      }
      
      .save-btn {
        background: linear-gradient(135deg, #8b5cf6, #6366f1);
        border: none;
        border-radius: 8px;
        color: #ffffff;
        padding: 12px;
        font-size: 14px;
        font-weight: 600;
        cursor: pointer;
        text-align: center;
        transition: transform 0.1s, opacity 0.2s;
        box-shadow: 0 4px 12px rgba(139, 92, 246, 0.3);
      }
      .save-btn:hover {
        opacity: 0.95;
      }
      .save-btn:active {
        transform: scale(0.98);
      }
      
      .select-input-styled, .text-input-styled {
        width: 100%;
        background: rgba(255, 255, 255, 0.04);
        border: 1px solid rgba(255, 255, 255, 0.08);
        border-radius: 8px;
        color: #ffffff;
        padding: 10px 14px;
        font-size: 13px;
        font-family: inherit;
        outline: none;
        box-sizing: border-box;
        transition: border-color 0.15s ease;
      }
      .select-input-styled option {
        background: #0f172a;
        color: #ffffff;
      }
      .select-input-styled:focus, .text-input-styled:focus {
        border-color: #8b5cf6;
      }
      .refresh-btn-styled {
        background: rgba(255, 255, 255, 0.05);
        border: 1px solid rgba(255, 255, 255, 0.08);
        border-radius: 8px;
        color: #f8fafc;
        width: 38px;
        height: 38px;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        transition: background-color 0.15s;
        flex-shrink: 0;
      }
      .refresh-btn-styled:hover {
        background: rgba(255, 255, 255, 0.1);
      }
      .status-pill-styled {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 6px 12px;
        border-radius: 100px;
        font-size: 12px;
        font-weight: 500;
        background: rgba(255, 255, 255, 0.04);
        border: 1px solid rgba(255, 255, 255, 0.06);
        align-self: flex-start;
      }
      .switch-styled {
        position: relative;
        display: inline-block;
        width: 36px;
        height: 20px;
      }
      .switch-styled input {
        opacity: 0;
        width: 0;
        height: 0;
      }
      .slider-styled {
        position: absolute;
        cursor: pointer;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background-color: rgba(255, 255, 255, 0.1);
        transition: .2s;
        border-radius: 20px;
      }
      .slider-styled:before {
        position: absolute;
        content: "";
        height: 14px;
        width: 14px;
        left: 3px;
        bottom: 3px;
        background-color: white;
        transition: .2s;
        border-radius: 50%;
      }
      input:checked + .slider-styled {
        background-color: #8b5cf6;
      }
      input:checked + .slider-styled:before {
        transform: translateX(16px);
      }
      .save-btn-styled {
        background: linear-gradient(135deg, #8b5cf6, #6366f1);
        border: none;
        border-radius: 8px;
        color: #ffffff;
        padding: 12px;
        font-size: 14px;
        font-weight: 600;
        cursor: pointer;
        transition: transform 0.1s, opacity 0.2s;
        font-family: inherit;
        text-align: center;
        box-shadow: 0 4px 12px rgba(139, 92, 246, 0.3);
      }
      .save-btn-styled:hover {
        opacity: 0.95;
      }
      .save-btn-styled:active {
        transform: scale(0.98);
      }
      .cors-help-styled {
        background: rgba(239, 68, 68, 0.05);
        border: 1px solid rgba(239, 68, 68, 0.15);
        border-radius: 8px;
        padding: 12px;
        display: flex;
        flex-direction: column;
        gap: 6px;
      }
    `;
    document.head.appendChild(style);

    const container = document.createElement("div");
    container.innerHTML = `
      <button id="local-ai-btn" title="Configure Local AI">
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" d="M9.813 15.904L9 21L14.907 18M18 10.5C18 14.642 14.642 18 10.5 18C6.358 18 3 14.642 3 10.5C3 6.358 6.358 3 10.5 3C14.642 3 18 6.358 18 10.5ZM16.5 10.5C16.5 13.8137 13.8137 16.5 10.5 16.5C7.18629 16.5 4.5 13.8137 4.5 10.5C4.5 7.18629 7.18629 4.5 10.5 4.5C13.8137 4.5 16.5 7.18629 16.5 10.5Z" />
        </svg>
      </button>
      
      <div id="local-ai-drawer">
        <div class="drawer-header">
          <h2>Local AI settings</h2>
          <button class="drawer-close-btn" id="local-ai-close-btn">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        
        <div class="drawer-content">
          <div class="form-group">
            <label>Provider</label>
            <select id="provider-select" class="select-input">
              <option value="ollama">Ollama</option>
              <option value="lmstudio">LM Studio</option>
              <option value="windowai">window.ai (In-Browser Gemma)</option>
              <option value="claude">Anthropic Claude (Direct API)</option>
              <option value="openai">OpenAI / Compatible API</option>
              <option value="openrouter">OpenRouter API</option>
            </select>
          </div>
          
          <div id="connection-status-pill" class="status-pill">
            <div id="connection-status-dot" class="status-dot"></div>
            <span id="connection-status-text">Checking status...</span>
          </div>

          <div id="endpoint-settings" style="display: flex; flex-direction: column; gap: 20px;">
            <div class="form-group" id="url-group">
              <label>API Endpoint URL</label>
              <input type="text" id="api-url" class="text-input" value="" />
            </div>

            <div class="form-group" id="key-group" style="display: none;">
              <label>API Key</label>
              <input type="password" id="api-key" class="text-input" placeholder="Enter API Key..." />
            </div>
            
            <div class="form-group" id="model-group">
              <label>Model selection (Ollama / LM Studio / Cloud)</label>
              <div class="input-wrapper">
                <select id="model-select" class="select-input">
                  <!-- dynamically loaded -->
                </select>
                <button id="refresh-models-btn" class="btn-icon" title="Fetch models">
                  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 1121.21 7.89M9 11l3 3m0 0l3-3m-3 3V3" />
                  </svg>
                </button>
              </div>
              <input type="text" id="model-manual-input" class="text-input" placeholder="Or enter manually..." style="margin-top: 4px;" />
            </div>
          </div>

          <div id="windowai-settings" style="display: none; flex-direction: column; gap: 12px;">
            <div class="cors-help" style="background: rgba(16, 185, 129, 0.05); border: 1px solid rgba(16, 185, 129, 0.15);">
              <div class="cors-help-title" style="color: #6ee7b7;">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                Chrome Built-in AI Info
              </div>
              <div class="cors-help-desc" style="color: #e2e8f0;">
                Runs Gemma Nano directly in your browser. Needs Chrome Canary/Dev (version 127+) with the Experimental Prompt API flags enabled.
              </div>
            </div>
          </div>

          <div class="form-group">
            <label class="switch-label">
              <span>Send canvas image (Vision)</span>
              <input type="checkbox" id="use-vision-cb" class="switch-input" />
              <div class="switch-slider"></div>
            </label>
            <div style="font-size: 11px; color: #94a3b8; line-height: 1.4;">
              Ollama/LM Studio or cloud models must support vision (e.g. LLaVA, GPT-4o, Claude) to use this feature.
            </div>
          </div>

          <div class="form-group">
            <label class="switch-label">
              <span>Sound effects</span>
              <input type="checkbox" id="sound-effects-cb" class="switch-input" />
              <div class="switch-slider"></div>
            </label>
            <div style="font-size: 11px; color: #94a3b8; line-height: 1.4;">
              Subtle drawing sound effects and double chimes (pure-synthesized Web Audio API, default off).
            </div>
          </div>

          <div class="cors-help" id="cors-troubleshooter" style="display: none;">
            <div class="cors-help-title">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              Troubleshoot Connection Issues
            </div>
            <div class="cors-help-desc">
              If connection fails, make sure your local engine is running. For Ollama, launch it with CORS allowed:
              <code style="display: block; background: rgba(0,0,0,0.3); padding: 4px 6px; margin: 4px 0; border-radius: 4px; font-family: monospace;">OLLAMA_ORIGINS=* ollama serve</code>
            </div>
          </div>

          <button id="local-ai-save-btn" class="save-btn">Save & Apply</button>
        </div>
      </div>
    `;
    document.body.appendChild(container);

    const btn = document.getElementById("local-ai-btn");
    const drawer = document.getElementById("local-ai-drawer");
    const closeBtn = document.getElementById("local-ai-close-btn");
    const saveBtn = document.getElementById("local-ai-save-btn");
    const refreshBtn = document.getElementById("refresh-models-btn");
    const provSelect = document.getElementById("provider-select");
    const soundCb = document.getElementById("sound-effects-cb");

    const openDrawer = () => {
      drawer.classList.add("open");
      updateStatusIndicator();
      // Auto-fetch models on open based on the current settings/inputs
      const selectedProv = provSelect.value;
      const apiVal = document.getElementById("api-url").value.trim();
      const apiKeyVal = document.getElementById("api-key").value.trim();
      fetchAvailableModels(selectedProv, apiVal, apiKeyVal);
    };

    btn.addEventListener("click", openDrawer);

    // Also bind the settings button in the send bar
    const sendBarSettingsBtn = document.querySelector(".draw-send-bar-btn--settings");
    if (sendBarSettingsBtn) {
      sendBarSettingsBtn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        const headerSettingsBtn = document.getElementById("5__anchor") || document.querySelector(".draw-header-settings-btn button");
        if (headerSettingsBtn) {
          headerSettingsBtn.click();
        }
      });
    }
    
    closeBtn.addEventListener("click", () => {
      drawer.classList.remove("open");
    });

    saveBtn.addEventListener("click", () => {
      AudioSynth.playClick();
      const selectedProv = provSelect.value;
      const apiVal = document.getElementById("api-url").value.trim();
      const apiKeyVal = document.getElementById("api-key").value.trim();
      const visionVal = document.getElementById("use-vision-cb").checked;
      const soundVal = soundCb.checked;
      
      let modelVal = document.getElementById("model-select").value;
      const manualModel = document.getElementById("model-manual-input").value.trim();
      if (manualModel) {
        modelVal = manualModel;
      }

      settings.provider = selectedProv;
      settings.useVision = visionVal;
      settings.soundEffects = soundVal;
      AudioSynth.enabled = soundVal;

      if (selectedProv === "ollama") {
        settings.ollamaUrl = apiVal;
        settings.ollamaModel = modelVal;
        settings.ollamaApiKey = apiKeyVal;
      } else if (selectedProv === "lmstudio") {
        settings.lmStudioUrl = apiVal;
        settings.lmStudioModel = modelVal;
        settings.lmStudioApiKey = apiKeyVal;
      } else if (selectedProv === "claude") {
        settings.claudeUrl = apiVal;
        settings.claudeModel = modelVal;
        settings.claudeApiKey = apiKeyVal;
      } else if (selectedProv === "openai") {
        settings.openaiUrl = apiVal;
        settings.openaiModel = modelVal;
        settings.openaiApiKey = apiKeyVal;
      } else if (selectedProv === "openrouter") {
        settings.openrouterUrl = apiVal;
        settings.openrouterModel = modelVal;
        settings.openrouterApiKey = apiKeyVal;
      }
      
      settings.apiKey = apiKeyVal; // Sync to general fallback

      saveSettings(settings);
      drawer.classList.remove("open");
      console.log("[Local AI Settings Applied]", settings);
    });

    refreshBtn.addEventListener("click", async () => {
      AudioSynth.playClick();
      const selectedProv = provSelect.value;
      const apiVal = document.getElementById("api-url").value.trim();
      const apiKeyVal = document.getElementById("api-key").value.trim();
      await fetchAvailableModels(selectedProv, apiVal, apiKeyVal);
    });

    // Sync dropdown model selection to the manual input field
    const modelSelect = document.getElementById("model-select");
    modelSelect.addEventListener("change", (e) => {
      document.getElementById("model-manual-input").value = e.target.value;
    });

    // Provider select change handler
    provSelect.addEventListener("change", () => {
      AudioSynth.playClick();
      updateUIForProvider(provSelect.value);
    });

    // Setup MutationObserver to customize UI texts
    const textObserver = new MutationObserver(() => {
      const sendLabels = document.querySelectorAll(".draw-send-bar-label");
      sendLabels.forEach(el => {
        if (el.textContent.includes("Send to Claude")) {
          el.textContent = el.textContent.replace("Send to Claude", "Send to Local AI");
        }
      });

      const srOnlyLabels = document.querySelectorAll(".sr-only, [aria-label*='Claude']");
      srOnlyLabels.forEach(el => {
        if (el.getAttribute("aria-label") && el.getAttribute("aria-label").includes("Claude's turn")) {
          el.setAttribute("aria-label", el.getAttribute("aria-label").replace("Claude's turn", "Local AI's turn"));
        }
      });
    });
    textObserver.observe(document.body, { childList: true, subtree: true });

    // Populate inputs from settings
    provSelect.value = settings.provider;
    soundCb.checked = settings.soundEffects;
    AudioSynth.enabled = settings.soundEffects;
    updateUIForProvider(settings.provider);
    document.getElementById("use-vision-cb").checked = settings.useVision;
  }

  function updateUIForProvider(provider) {
    const endpointSettings = document.getElementById("endpoint-settings");
    const windowaiSettings = document.getElementById("windowai-settings");
    const apiInput = document.getElementById("api-url");
    const apiKeyInput = document.getElementById("api-key");
    const modelManualInput = document.getElementById("model-manual-input");
    const keyGroup = document.getElementById("key-group");
    const urlGroup = document.getElementById("url-group");

    if (provider === "windowai") {
      endpointSettings.style.display = "none";
      windowaiSettings.style.display = "flex";
      modelManualInput.value = "";
    } else {
      endpointSettings.style.display = "flex";
      windowaiSettings.style.display = "none";

      let urlVal = "";
      let keyVal = "";
      let modelVal = "";
      let showKey = (provider !== "windowai");
      let showUrl = true;

      if (provider === "ollama") {
        urlVal = settings.ollamaUrl;
        modelVal = settings.ollamaModel;
        keyVal = settings.ollamaApiKey;
      } else if (provider === "lmstudio") {
        urlVal = settings.lmStudioUrl;
        modelVal = settings.lmStudioModel;
        keyVal = settings.lmStudioApiKey;
      } else if (provider === "claude") {
        urlVal = settings.claudeUrl;
        modelVal = settings.claudeModel;
        keyVal = settings.claudeApiKey || settings.apiKey;
      } else if (provider === "openai") {
        urlVal = settings.openaiUrl;
        modelVal = settings.openaiModel;
        keyVal = settings.openaiApiKey || settings.apiKey;
      } else if (provider === "openrouter") {
        urlVal = settings.openrouterUrl;
        modelVal = settings.openrouterModel;
        keyVal = settings.openrouterApiKey || settings.apiKey;
      }

      apiInput.value = urlVal;
      apiKeyInput.value = keyVal;
      modelManualInput.value = modelVal;

      keyGroup.style.display = showKey ? "flex" : "none";
      urlGroup.style.display = showUrl ? "flex" : "none";
      
      // Auto-load models dropdown
      fetchAvailableModels(provider, urlVal, keyVal);
    }

    updateStatusIndicator();
  }

  async function fetchAvailableModels(provider, url, apiKey) {
    const select = document.getElementById("model-select");
    select.innerHTML = '<option value="">Loading models...</option>';
    
    try {
      const cleanUrl = url ? url.replace(/\/$/, "") : "";
      const headers = {};
      if (apiKey) {
        headers["Authorization"] = `Bearer ${apiKey}`;
      }

      if (provider === "ollama") {
        const res = await originalFetch(`${cleanUrl}/api/tags`, { headers });
        if (res.ok) {
          const json = await res.json();
          select.innerHTML = "";
          if (json.models && json.models.length > 0) {
            json.models.forEach(m => {
              const opt = document.createElement("option");
              opt.value = m.name;
              opt.innerText = m.name;
              if (m.name === settings.ollamaModel) opt.selected = true;
              select.appendChild(opt);
            });
            return;
          }
        }
      } else if (provider === "lmstudio") {
        const res = await originalFetch(`${cleanUrl}/v1/models`, { headers });
        if (res.ok) {
          const json = await res.json();
          select.innerHTML = "";
          if (json.data && json.data.length > 0) {
            json.data.forEach(m => {
              const opt = document.createElement("option");
              opt.value = m.id;
              opt.innerText = m.id;
              if (m.id === settings.lmStudioModel) opt.selected = true;
              select.appendChild(opt);
            });
            return;
          }
        }
      } else if (provider === "openrouter") {
        const res = await originalFetch(`${cleanUrl}/models`, { headers });
        if (res.ok) {
          const json = await res.json();
          select.innerHTML = "";
          if (json.data && json.data.length > 0) {
            json.data.forEach(m => {
              const opt = document.createElement("option");
              opt.value = m.id;
              opt.innerText = m.name || m.id;
              if (m.id === settings.openrouterModel) opt.selected = true;
              select.appendChild(opt);
            });
            return;
          }
        }
      } else if (provider === "claude") {
        // Prepopulate standard Anthropic models
        select.innerHTML = "";
        const models = [
          "claude-3-5-sonnet-20241022",
          "claude-3-opus-20240229",
          "claude-3-5-haiku-20241022",
          "claude-3-sonnet-20240229",
          "claude-3-haiku-20240307"
        ];
        models.forEach(m => {
          const opt = document.createElement("option");
          opt.value = m;
          opt.innerText = m;
          if (m === settings.claudeModel) opt.selected = true;
          select.appendChild(opt);
        });
        return;
      } else if (provider === "openai") {
        if (cleanUrl.includes("api.openai.com")) {
          // Prepopulate standard OpenAI models
          select.innerHTML = "";
          const models = [
            "gpt-4o",
            "gpt-4o-mini",
            "gpt-4-turbo",
            "gpt-4",
            "gpt-3.5-turbo"
          ];
          models.forEach(m => {
            const opt = document.createElement("option");
            opt.value = m;
            opt.innerText = m;
            if (m === settings.openaiModel) opt.selected = true;
            select.appendChild(opt);
          });
          return;
        } else {
          // Fetch models from custom OpenAI-compatible endpoint!
          let res = await originalFetch(`${cleanUrl}/models`, { headers });
          if (!res.ok) {
            res = await originalFetch(`${cleanUrl}/v1/models`, { headers });
          }
          if (res.ok) {
            const json = await res.json();
            select.innerHTML = "";
            const modelsData = json.data || json.models || json;
            if (Array.isArray(modelsData) && modelsData.length > 0) {
              modelsData.forEach(m => {
                const modelId = m.id || m.name || m;
                if (typeof modelId === "string") {
                  const opt = document.createElement("option");
                  opt.value = modelId;
                  opt.innerText = modelId;
                  if (modelId === settings.openaiModel) opt.selected = true;
                  select.appendChild(opt);
                }
              });
              return;
            }
          }
        }
      }
    } catch (e) {
      console.warn("Failed to retrieve models dynamically", e);
    }
    
    select.innerHTML = '<option value="">Failed to auto-fetch models</option>';
  }

  async function updateStatusIndicator() {
    const dot = document.getElementById("connection-status-dot");
    const text = document.getElementById("connection-status-text");
    const troubleshooter = document.getElementById("cors-troubleshooter");
    const selectedProv = provSelect ? provSelect.value : settings.provider;

    if (!dot || !text) return;

    troubleshooter.style.display = "none";
    dot.className = "status-dot";
    text.innerText = "Checking status...";

    if (selectedProv === "windowai") {
      const hasWindowAi = !!(window.ai && window.ai.languageModel);
      if (hasWindowAi) {
        dot.classList.add("ok");
        text.innerText = "window.ai Available";
      } else {
        dot.classList.add("error");
        text.innerText = "window.ai Not Found";
      }
    } else {
      const url = document.getElementById("api-url").value.trim();
      const cleanUrl = url.replace(/\/$/, "");
      const apiKey = document.getElementById("api-key").value.trim();
      
      const testHeaders = {};
      if (apiKey) {
        testHeaders["Authorization"] = `Bearer ${apiKey}`;
      }

      try {
        if (selectedProv === "claude") {
          if (apiKey) {
            dot.classList.add("ok");
            text.innerText = "Ready (API Key set)";
          } else {
            dot.classList.add("warn");
            text.innerText = "API Key required";
          }
          return;
        }

        if (selectedProv === "openai" && cleanUrl.includes("api.openai.com")) {
          if (apiKey) {
            dot.classList.add("ok");
            text.innerText = "Ready (API Key set)";
          } else {
            dot.classList.add("warn");
            text.innerText = "API Key required";
          }
          return;
        }

        let testUrl = `${cleanUrl}/v1/models`;
        if (selectedProv === "ollama") {
          testUrl = `${cleanUrl}/api/tags`;
        } else if (selectedProv === "openrouter") {
          testUrl = `${cleanUrl}/models`;
        }

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 2000);
        
        let res;
        try {
          res = await originalFetch(testUrl, { 
            method: "GET", 
            headers: testHeaders,
            signal: controller.signal 
          });
        } catch (fetchErr) {
          if (selectedProv === "openai" && !cleanUrl.includes("api.openai.com")) {
            testUrl = `${cleanUrl}/models`;
            res = await originalFetch(testUrl, { 
              method: "GET", 
              headers: testHeaders,
              signal: controller.signal 
            });
          } else {
            throw fetchErr;
          }
        }
        clearTimeout(timeout);

        if (res && res.ok) {
          dot.classList.add("ok");
          text.innerText = "Engine Connected";
        } else {
          dot.classList.add("warn");
          text.innerText = `HTTP Warning ${res ? res.status : 'Unknown'}`;
          troubleshooter.style.display = "block";
        }
      } catch (e) {
        dot.classList.add("error");
        text.innerText = "Unreachable / CORS Blocked";
        troubleshooter.style.display = "block";
      }
    }
  }

  // --- 8. NATIVE SETTINGS MODAL HIJACKING & LOCAL AI INTEGRATION ---
  function injectLocalAISettings(modal) {
    const body = modal.querySelector(".settings-screen-body");
    if (!body) return;

    // Avoid double injection
    if (body.querySelector(".local-ai-injected")) return;

    // Find the original rows
    const rows = body.children;
    if (rows.length < 5) return;

    // Find and hide the original API key upload row
    let nativeKeyRow = null;
    for (const row of rows) {
      const label = row.querySelector(".settings-screen-label");
      if (label && (label.textContent.includes("API Key") || label.textContent.includes("Upload API key"))) {
        nativeKeyRow = row;
        break;
      }
    }
    if (nativeKeyRow) {
      nativeKeyRow.style.display = "none";
    } else {
      rows[4].style.display = "none";
    }

    // Create container for local-ai settings
    const container = document.createElement("div");
    container.className = "local-ai-injected";
    container.style.display = "flex";
    container.style.flexDirection = "column";
    container.style.gap = "14px";
    container.style.marginTop = "14px";
    container.style.borderTop = "1px solid rgba(255, 255, 255, 0.08)";
    container.style.paddingTop = "14px";

    container.innerHTML = `
      <div class="settings-screen-row settings-screen-row--col" style="display: flex; flex-direction: column; gap: 8px;">
        <span class="settings-screen-label" style="font-size: 13px; font-weight: 500; color: #94a3b8;">AI Provider</span>
        <select id="modal-provider-select" class="select-input-styled">
          <option value="ollama">Ollama (Local)</option>
          <option value="lmstudio">LM Studio (Local)</option>
          <option value="windowai">window.ai (In-Browser Gemma)</option>
          <option value="claude">Anthropic Claude (Direct API)</option>
          <option value="openai">OpenAI / Compatible API</option>
          <option value="openrouter">OpenRouter API</option>
        </select>
      </div>

      <div id="modal-connection-status-pill" class="status-pill-styled">
        <div id="modal-connection-status-dot" class="status-dot"></div>
        <span id="modal-connection-status-text">Checking status...</span>
      </div>

      <div id="modal-endpoint-settings" style="display: flex; flex-direction: column; gap: 14px; width: 100%;">
        <div class="settings-screen-row settings-screen-row--col" id="modal-url-group" style="display: flex; flex-direction: column; gap: 8px;">
          <span class="settings-screen-label" style="font-size: 13px; font-weight: 500; color: #94a3b8;">API Endpoint URL</span>
          <input type="text" id="modal-api-url" class="text-input-styled" value="" />
        </div>

        <div class="settings-screen-row settings-screen-row--col" id="modal-key-group" style="display: flex; flex-direction: column; gap: 8px;">
          <span class="settings-screen-label" style="font-size: 13px; font-weight: 500; color: #94a3b8;">API Key</span>
          <input type="password" id="modal-api-key" class="text-input-styled" placeholder="Enter API Key..." />
        </div>
        
        <div class="settings-screen-row settings-screen-row--col" id="modal-model-group" style="display: flex; flex-direction: column; gap: 8px;">
          <span class="settings-screen-label" style="font-size: 13px; font-weight: 500; color: #94a3b8;">Model Selection</span>
          <div style="display: flex; gap: 8px; width: 100%; align-items: center;">
            <select id="modal-model-select" class="select-input-styled" style="flex: 1;">
              <!-- dynamically loaded -->
            </select>
            <button id="modal-refresh-models-btn" class="refresh-btn-styled" type="button" title="Fetch models">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 1121.21 7.89M9 11l3 3m0 0l3-3m-3 3V3" />
              </svg>
            </button>
          </div>
          <input type="text" id="modal-model-manual-input" class="text-input-styled" placeholder="Or enter manually..." style="margin-top: 6px;" />
        </div>
      </div>

      <div id="modal-windowai-settings" style="display: none; background: rgba(255, 255, 255, 0.04); border: 1px solid rgba(255, 255, 255, 0.08); border-radius: 8px; padding: 10px; font-size: 11px; color: #94a3b8; line-height: 1.4;">
        Runs Gemma Nano in Chrome Canary/Dev (version 127+) with Prompt API flags enabled.
      </div>

      <div class="settings-screen-row" style="justify-content: space-between; align-items: center; display: flex;">
        <span class="settings-screen-label" style="font-size: 13px; font-weight: 500; color: #94a3b8;">Send canvas image (Vision)</span>
        <label class="switch-styled">
          <input type="checkbox" id="modal-use-vision-cb" />
          <span class="slider-styled"></span>
        </label>
      </div>

      <div class="settings-screen-row" style="justify-content: space-between; align-items: center; display: flex;">
        <span class="settings-screen-label" style="font-size: 13px; font-weight: 500; color: #94a3b8;">Sound effects</span>
        <label class="switch-styled">
          <input type="checkbox" id="modal-sound-effects-cb" />
          <span class="slider-styled"></span>
        </label>
      </div>

      <div class="cors-help-styled" id="modal-cors-troubleshooter" style="display: none; background: rgba(239, 68, 68, 0.05); border: 1px solid rgba(239, 68, 68, 0.15); border-radius: 8px; padding: 10px; font-size: 11px; color: #fca5a5; line-height: 1.4;">
        Verify local serve with CORS: <code style="display: block; background: rgba(0,0,0,0.3); padding: 4px 6px; margin: 4px 0; border-radius: 4px; font-family: monospace;">OLLAMA_ORIGINS=* ollama serve</code>
      </div>

      <div style="display: flex; gap: 12px; margin-top: 8px; width: 100%;">
        <button id="modal-save-btn" class="save-btn-styled" type="button" style="width: 100%;">Save & Apply Settings</button>
      </div>
    `;

    // Insert after the 4th row (Session usage)
    body.insertBefore(container, rows[4]);

    // Bindings
    const provSelect = modal.querySelector("#modal-provider-select");
    const soundCb = modal.querySelector("#modal-sound-effects-cb");
    const visionCb = modal.querySelector("#modal-use-vision-cb");
    const apiInput = modal.querySelector("#modal-api-url");
    const apiKeyInput = modal.querySelector("#modal-api-key");
    const modelManualInput = modal.querySelector("#modal-model-manual-input");
    const modelSelect = modal.querySelector("#modal-model-select");

    // Populate
    provSelect.value = settings.provider;
    soundCb.checked = settings.soundEffects;
    visionCb.checked = settings.useVision;

    const fetchModalModels = async (provider, url, apiKey) => {
      modelSelect.innerHTML = '<option value="">Loading models...</option>';
      try {
        const cleanUrl = url ? url.replace(/\/$/, "") : "";
        const headers = {};
        if (apiKey) {
          headers["Authorization"] = `Bearer ${apiKey}`;
        }

        if (provider === "ollama") {
          const res = await originalFetch(`${cleanUrl}/api/tags`, { headers });
          if (res.ok) {
            const json = await res.json();
            modelSelect.innerHTML = "";
            if (json.models && json.models.length > 0) {
              json.models.forEach(m => {
                const opt = document.createElement("option");
                opt.value = m.name;
                opt.innerText = m.name;
                if (m.name === settings.ollamaModel) opt.selected = true;
                modelSelect.appendChild(opt);
              });
              return;
            }
          }
        } else if (provider === "lmstudio") {
          const res = await originalFetch(`${cleanUrl}/v1/models`, { headers });
          if (res.ok) {
            const json = await res.json();
            modelSelect.innerHTML = "";
            if (json.data && json.data.length > 0) {
              json.data.forEach(m => {
                const opt = document.createElement("option");
                opt.value = m.id;
                opt.innerText = m.id;
                if (m.id === settings.lmStudioModel) opt.selected = true;
                modelSelect.appendChild(opt);
              });
              return;
            }
          }
        } else if (provider === "openrouter") {
          const res = await originalFetch(`${cleanUrl}/models`, { headers });
          if (res.ok) {
            const json = await res.json();
            modelSelect.innerHTML = "";
            if (json.data && json.data.length > 0) {
              json.data.forEach(m => {
                const opt = document.createElement("option");
                opt.value = m.id;
                opt.innerText = m.name || m.id;
                if (m.id === settings.openrouterModel) opt.selected = true;
                modelSelect.appendChild(opt);
              });
              return;
            }
          }
        } else if (provider === "claude") {
          modelSelect.innerHTML = "";
          const models = [
            "claude-3-5-sonnet-20241022",
            "claude-3-opus-20240229",
            "claude-3-5-haiku-20241022",
            "claude-3-sonnet-20240229",
            "claude-3-haiku-20240307"
          ];
          models.forEach(m => {
            const opt = document.createElement("option");
            opt.value = m;
            opt.innerText = m;
            if (m === settings.claudeModel) opt.selected = true;
            modelSelect.appendChild(opt);
          });
          return;
        } else if (provider === "openai") {
          if (cleanUrl.includes("api.openai.com")) {
            modelSelect.innerHTML = "";
            const models = [
              "gpt-4o",
              "gpt-4o-mini",
              "gpt-4-turbo",
              "gpt-4",
              "gpt-3.5-turbo"
            ];
            models.forEach(m => {
              const opt = document.createElement("option");
              opt.value = m;
              opt.innerText = m;
              if (m === settings.openaiModel) opt.selected = true;
              modelSelect.appendChild(opt);
            });
            return;
          } else {
            let res = await originalFetch(`${cleanUrl}/models`, { headers });
            if (!res.ok) {
              res = await originalFetch(`${cleanUrl}/v1/models`, { headers });
            }
            if (res.ok) {
              const json = await res.json();
              modelSelect.innerHTML = "";
              const modelsData = json.data || json.models || json;
              if (Array.isArray(modelsData) && modelsData.length > 0) {
                modelsData.forEach(m => {
                  const modelId = m.id || m.name || m;
                  if (typeof modelId === "string") {
                    const opt = document.createElement("option");
                    opt.value = modelId;
                    opt.innerText = modelId;
                    if (modelId === settings.openaiModel) opt.selected = true;
                    modelSelect.appendChild(opt);
                  }
                });
                return;
              }
            }
          }
        }
      } catch (e) {
        console.warn("Failed to fetch models", e);
      }
      modelSelect.innerHTML = '<option value="">Failed to auto-fetch models</option>';
    };

    const updateModalStatus = async () => {
      const dot = modal.querySelector("#modal-connection-status-dot");
      const text = modal.querySelector("#modal-connection-status-text");
      const troubleshooter = modal.querySelector("#modal-cors-troubleshooter");
      const provider = provSelect.value;

      if (!dot || !text) return;
      troubleshooter.style.display = "none";
      dot.className = "status-dot";
      text.innerText = "Checking status...";

      if (provider === "windowai") {
        const hasWindowAi = !!(window.ai && window.ai.languageModel);
        if (hasWindowAi) {
          dot.classList.add("ok");
          text.innerText = "window.ai Available";
        } else {
          dot.classList.add("error");
          text.innerText = "window.ai Not Found";
        }
      } else {
        const url = apiInput.value.trim();
        const cleanUrl = url.replace(/\/$/, "");
        const apiKey = apiKeyInput.value.trim();
        const testHeaders = {};
        if (apiKey) {
          testHeaders["Authorization"] = `Bearer ${apiKey}`;
        }

        try {
          if (provider === "claude") {
            if (apiKey) {
              dot.classList.add("ok");
              text.innerText = "Ready (API Key set)";
            } else {
              dot.classList.add("warn");
              text.innerText = "API Key required";
            }
            return;
          }

          if (provider === "openai" && cleanUrl.includes("api.openai.com")) {
            if (apiKey) {
              dot.classList.add("ok");
              text.innerText = "Ready (API Key set)";
            } else {
              dot.classList.add("warn");
              text.innerText = "API Key required";
            }
            return;
          }

          let testUrl = `${cleanUrl}/v1/models`;
          if (provider === "ollama") {
            testUrl = `${cleanUrl}/api/tags`;
          } else if (provider === "openrouter") {
            testUrl = `${cleanUrl}/models`;
          }

          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), 2000);
          
          let res;
          try {
            res = await originalFetch(testUrl, { 
              method: "GET", 
              headers: testHeaders,
              signal: controller.signal 
            });
          } catch (fetchErr) {
            if (provider === "openai" && !cleanUrl.includes("api.openai.com")) {
              testUrl = `${cleanUrl}/models`;
              res = await originalFetch(testUrl, { 
                method: "GET", 
                headers: testHeaders,
                signal: controller.signal 
              });
            } else {
              throw fetchErr;
            }
          }
          clearTimeout(timeout);

          if (res && res.ok) {
            dot.classList.add("ok");
            text.innerText = "Engine Connected";
          } else {
            dot.classList.add("warn");
            text.innerText = `HTTP Warning ${res ? res.status : 'Unknown'}`;
            troubleshooter.style.display = "block";
          }
        } catch (e) {
          dot.classList.add("error");
          text.innerText = "Unreachable / CORS Blocked";
          troubleshooter.style.display = "block";
        }
      }
    };

    const updateModalUI = () => {
      const provider = provSelect.value;
      const keyGroup = modal.querySelector("#modal-key-group");
      const urlGroup = modal.querySelector("#modal-url-group");
      const windowaiSettings = modal.querySelector("#modal-windowai-settings");
      const endpointSettings = modal.querySelector("#modal-endpoint-settings");

      if (provider === "windowai") {
        endpointSettings.style.display = "none";
        windowaiSettings.style.display = "block";
        modelManualInput.value = "";
      } else {
        endpointSettings.style.display = "flex";
        windowaiSettings.style.display = "none";

        let urlVal = "";
        let keyVal = "";
        let modelVal = "";
        let showKey = (provider !== "windowai");

        if (provider === "ollama") {
          urlVal = settings.ollamaUrl;
          modelVal = settings.ollamaModel;
          keyVal = settings.ollamaApiKey;
        } else if (provider === "lmstudio") {
          urlVal = settings.lmStudioUrl;
          modelVal = settings.lmStudioModel;
          keyVal = settings.lmStudioApiKey;
        } else if (provider === "claude") {
          urlVal = settings.claudeUrl;
          modelVal = settings.claudeModel;
          keyVal = settings.claudeApiKey || settings.apiKey;
        } else if (provider === "openai") {
          urlVal = settings.openaiUrl;
          modelVal = settings.openaiModel;
          keyVal = settings.openaiApiKey || settings.apiKey;
        } else if (provider === "openrouter") {
          urlVal = settings.openrouterUrl;
          modelVal = settings.openrouterModel;
          keyVal = settings.openrouterApiKey || settings.apiKey;
        }

        apiInput.value = urlVal;
        apiKeyInput.value = keyVal;
        modelManualInput.value = modelVal;

        keyGroup.style.display = showKey ? "flex" : "none";
        
        fetchModalModels(provider, urlVal, keyVal);
      }
      updateModalStatus();
    };

    // Live sync inputs to settings to avoid React re-render wiping state
    provSelect.addEventListener("change", () => {
      settings.provider = provSelect.value;
      updateModalUI();
    });

    apiInput.addEventListener("input", (e) => {
      const provider = provSelect.value;
      const val = e.target.value.trim();
      if (provider === "ollama") settings.ollamaUrl = val;
      else if (provider === "lmstudio") settings.lmStudioUrl = val;
      else if (provider === "claude") settings.claudeUrl = val;
      else if (provider === "openai") settings.openaiUrl = val;
      else if (provider === "openrouter") settings.openrouterUrl = val;
      updateModalStatus();
    });

    apiKeyInput.addEventListener("input", (e) => {
      const provider = provSelect.value;
      const val = e.target.value.trim();
      if (provider === "ollama") settings.ollamaApiKey = val;
      else if (provider === "lmstudio") settings.lmStudioApiKey = val;
      else if (provider === "claude") settings.claudeApiKey = val;
      else if (provider === "openai") settings.openaiApiKey = val;
      else if (provider === "openrouter") settings.openrouterApiKey = val;
      settings.apiKey = val;
      updateModalStatus();
    });

    modelManualInput.addEventListener("input", (e) => {
      const provider = provSelect.value;
      const val = e.target.value.trim();
      if (provider === "ollama") settings.ollamaModel = val;
      else if (provider === "lmstudio") settings.lmStudioModel = val;
      else if (provider === "claude") settings.claudeModel = val;
      else if (provider === "openai") settings.openaiModel = val;
      else if (provider === "openrouter") settings.openrouterModel = val;
    });

    modelSelect.addEventListener("change", (e) => {
      const provider = provSelect.value;
      const val = e.target.value;
      modelManualInput.value = val;
      if (provider === "ollama") settings.ollamaModel = val;
      else if (provider === "lmstudio") settings.lmStudioModel = val;
      else if (provider === "claude") settings.claudeModel = val;
      else if (provider === "openai") settings.openaiModel = val;
      else if (provider === "openrouter") settings.openrouterModel = val;
    });

    visionCb.addEventListener("change", (e) => {
      settings.useVision = e.target.checked;
    });

    soundCb.addEventListener("change", (e) => {
      settings.soundEffects = e.target.checked;
      AudioSynth.enabled = e.target.checked;
    });

    modal.querySelector("#modal-refresh-models-btn").addEventListener("click", () => {
      fetchModalModels(provSelect.value, apiInput.value.trim(), apiKeyInput.value.trim());
    });

    modal.querySelector("#modal-save-btn").addEventListener("click", () => {
      AudioSynth.playBoop();
      
      const selectedProv = provSelect.value;
      const apiVal = apiInput.value.trim();
      const apiKeyVal = apiKeyInput.value.trim();
      const visionVal = visionCb.checked;
      const soundVal = soundCb.checked;
      
      let modelVal = modelSelect.value;
      const manualModel = modelManualInput.value.trim();
      if (manualModel) {
        modelVal = manualModel;
      }

      settings.provider = selectedProv;
      settings.useVision = visionVal;
      settings.soundEffects = soundVal;
      AudioSynth.enabled = soundVal;

      if (selectedProv === "ollama") {
        settings.ollamaUrl = apiVal;
        settings.ollamaModel = modelVal;
        settings.ollamaApiKey = apiKeyVal;
      } else if (selectedProv === "lmstudio") {
        settings.lmStudioUrl = apiVal;
        settings.lmStudioModel = modelVal;
        settings.lmStudioApiKey = apiKeyVal;
      } else if (selectedProv === "claude") {
        settings.claudeUrl = apiVal;
        settings.claudeModel = modelVal;
        settings.claudeApiKey = apiKeyVal;
      } else if (selectedProv === "openai") {
        settings.openaiUrl = apiVal;
        settings.openaiModel = modelVal;
        settings.openaiApiKey = apiKeyVal;
      } else if (selectedProv === "openrouter") {
        settings.openrouterUrl = apiVal;
        settings.openrouterModel = modelVal;
        settings.openrouterApiKey = apiKeyVal;
      }
      
      settings.apiKey = apiKeyVal;
      saveSettings(settings);

      // Now close the modal by clicking the native close button
      const closeBtn = modal.querySelector(".save-screen-close");
      if (closeBtn) closeBtn.click();
    });

    updateModalUI();
  }

  // Setup DOM MutationObserver to detect settings modal
  const modalObserver = new MutationObserver((mutations) => {
    const body = document.querySelector(".settings-screen-body");
    if (body && body.children.length >= 5 && !body.querySelector(".local-ai-injected")) {
      const settingsScreen = document.querySelector(".settings-screen");
      if (settingsScreen) {
        injectLocalAISettings(settingsScreen);
      }
    }
  });
  modalObserver.observe(document.body, { childList: true, subtree: true });

  // Hook layout insertion
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initUI);
  } else {
    initUI();
  }

})();
