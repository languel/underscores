// Native Strudel runtime for Livecode Nodes.
//
// A board owns one scheduler and stacks the active node patterns before they
// reach Web Audio.  This is intentionally not @strudel/web's singleton REPL:
// each node keeps an independently compiled pattern, while a single manager
// owns audio unlock, transport linking, and output scheduling.
import * as core from "@strudel/core";
import * as mini from "@strudel/mini";
import * as mondo from "@strudel/mondo";
import * as tonal from "@strudel/tonal";
import * as xen from "@strudel/xen";
import { slider } from "@strudel/codemirror";
import { __pianoroll, Drawer, getDrawOptions } from "@strudel/draw";
import { transpiler } from "@strudel/transpiler";
import * as webaudio from "@strudel/webaudio";

const DEFAULT_CPS = 0.5;
const BEATS_PER_CYCLE = 4;
const SCHEDULER_SWAP_SAFETY_SECONDS = 0.16;
const DRAW_TIME = [-2, 2];
const DEFAULT_SAMPLE_BASE = "https://raw.githubusercontent.com/felixroos/dough-samples/main";
const DEFAULT_SAMPLE_MAPS = Object.freeze([
  "tidal-drum-machines.json",
  // The drum-machine map is bank-prefixed. EmuSP12 supplies Strudel's
  // documented unbanked defaults (`bd`, `sd`, `hh`, `oh`, `misc`, ...).
  "EmuSP12.json",
  "piano.json",
  "Dirt-Samples.json",
  "vcsl.json",
  "mridangam.json",
]);
const DEFAULT_BANK_ALIASES = "https://raw.githubusercontent.com/todepond/samples/main/tidal-drum-machines-alias.json";
const nodeVisualTag = nodeId => `drawerator:${nodeId}`;
const bpmToCps = bpm => Math.max(0.01, Math.min(16, (Number(bpm) || 120) / 240));
const ownsNodeHap = (nodeId, hap) => hap.context?.tags?.includes(nodeVisualTag(nodeId));

export const strudelNextBeatCycle = (
  cycle,
  cps = DEFAULT_CPS,
  lookaheadSeconds = SCHEDULER_SWAP_SAFETY_SECONDS,
) => {
  const safeCycle = Math.max(0, Number(cycle) || 0)
    + Math.max(0, Number(lookaheadSeconds) || 0) * Math.max(0.01, Number(cps) || DEFAULT_CPS);
  const beat = Math.ceil((safeCycle * BEATS_PER_CYCLE) - 1e-9) / BEATS_PER_CYCLE;
  return beat === 0 ? 0 : beat;
};

export const strudelSwitchAtCycle = (before, after, cycle) => {
  const boundary = core.Fraction(cycle);
  return new core.Pattern(state => {
    const haps = [];
    if (state.span.begin.lt(boundary)) {
      const end = state.span.end.min(boundary);
      if (end.gt(state.span.begin)) {
        haps.push(...before.query(state.setSpan(new core.TimeSpan(state.span.begin, end))));
      }
    }
    if (state.span.end.gt(boundary)) {
      const begin = state.span.begin.max(boundary);
      if (state.span.end.gt(begin)) {
        haps.push(...after.query(state.setSpan(new core.TimeSpan(begin, state.span.end))));
      }
    }
    return haps;
  });
};

// @strudel/codemirror registers markcss as a normal patternable control. Once
// miniAllStrings is enabled, however, normal control registration interprets
// the raw CSS string as mini notation. The reference REPL promises raw
// single-quoted CSS here, so preserve that contract explicitly.
export const strudelMarkCss = (value, pattern) => {
  const control = core.pure({ markcss: String(value ?? "") });
  return core.isPattern(pattern) ? pattern.set(control) : control;
};
core.Pattern.prototype.markcss = function markcss(value) {
  return strudelMarkCss(value, this);
};

export const strudelInput = value => (
  core.isPattern(value) ? value : mini.mini(value)
);

export const installStrudelEvalScope = (...additionalScopes) => {
  mini.miniAllStrings?.();
  return core.evalScope(
    core.evalScope,
    core,
    mini,
    mondo,
    tonal,
    xen,
    webaudio,
    ...additionalScopes,
    {
      // The transpiler has already converted string arguments into Mini
      // patterns by the time i() runs. Preserve those patterns, while keeping
      // direct/untranspiled calls useful too.
      i: strudelInput,
      markcss: strudelMarkCss,
      slider,
    },
  );
};

const restoreGlobal = (key, value) => {
  if (value === undefined) delete globalThis[key];
  else globalThis[key] = value;
};

// `$: pattern` is Strudel's REPL syntax for an anonymous live pattern. The
// transpiler turns it into `pattern.p("$")`; core.repl normally installs that
// temporary method. Livecode Nodes deliberately share one scheduler instead
// of one REPL, so each compile captures those labelled patterns locally before
// stacking them into the node's single scheduler entry.
const captureLabelledPatterns = nodeId => {
  const prototype = core.Pattern.prototype;
  const previous = Object.getOwnPropertyDescriptor(prototype, "p");
  const patterns = new Map();
  let anonymousIndex = 0;

  Object.defineProperty(prototype, "p", {
    configurable: true,
    writable: true,
    value(patternId) {
      let id = patternId;
      if (typeof id === "string" && (id.startsWith("_") || id.endsWith("_"))) {
        return core.silence;
      }
      if (id === "$") {
        id = `$${anonymousIndex}`;
        anonymousIndex += 1;
      }
      patterns.set(id, this);
      return this;
    },
  });

  return {
    patterns,
    restore() {
      if (previous) Object.defineProperty(prototype, "p", previous);
      else delete prototype.p;
    },
    stack() {
      const labelled = Array.from(patterns, ([patternId, pattern]) => (
        pattern.withState(state => state.setControls({ id: `${nodeId}:${patternId}` }))
      ));
      return labelled.length ? core.stack(...labelled) : null;
    },
  };
};

// Strudel's page REPL gives public visualizers a page-sized canvas. Livecode
// Nodes instead supply a canvas scoped to their own frame. Capture painter
// registration while the node is evaluated so the shared Drawer can route
// every frame without starting another requestAnimationFrame loop.
const captureFrameVisualizers = (runtime, nodeId) => {
  const prototype = core.Pattern.prototype;
  const previousOnPaint = Object.getOwnPropertyDescriptor(prototype, "onPaint");
  const previousPianoroll = Object.getOwnPropertyDescriptor(prototype, "pianoroll");
  let count = 0;

  if (typeof previousOnPaint?.value === "function") {
    Object.defineProperty(prototype, "onPaint", {
      configurable: true,
      writable: true,
      value(painter) {
        if (typeof painter !== "function") return previousOnPaint.value.call(this, painter);
        count += 1;
        return previousOnPaint.value.call(this, (_ctx, time, haps, drawTime) => {
          const target = runtime.frameCanvases.get(nodeId);
          if (!target?.active || !target.ctx) return;
          painter(
            target.ctx,
            time,
            haps.filter(hap => ownsNodeHap(nodeId, hap)),
            drawTime,
          );
        });
      },
    });
  }

  if (typeof previousPianoroll?.value === "function") {
    Object.defineProperty(prototype, "pianoroll", {
      configurable: true,
      writable: true,
      value(options = {}) {
        // Underscore widgets supply their own inline CodeMirror canvas and
        // should retain Strudel's native widget behavior.
        if (options?.ctx) return previousPianoroll.value.call(this, options);
        return this.onPaint((ctx, time, haps, drawTime) => {
          __pianoroll({
            ctx,
            time,
            haps,
            ...getDrawOptions(drawTime, options),
          });
        });
      },
    });
  }

  return {
    count: () => count,
    restore() {
      if (previousOnPaint) Object.defineProperty(prototype, "onPaint", previousOnPaint);
      else delete prototype.onPaint;
      if (previousPianoroll) Object.defineProperty(prototype, "pianoroll", previousPianoroll);
      else delete prototype.pianoroll;
    },
  };
};

export class StrudelRuntimeManager {
  constructor() {
    this.entries = new Map();
    this.scheduler = null;
    this.drawer = null;
    this.drawerRunning = false;
    this.scopeReady = null;
    this.audioReady = false;
    this.compileQueue = Promise.resolve();
    this.activationTimers = new Map();
    this.visualStates = new Map();
    this.visualListeners = new Map();
    this.frameCanvases = new Map();
    this.transport = { playing: false, bpm: 120, time: 0 };
    this.cps = DEFAULT_CPS;
    this.linkedPhaseOffset = 0;
  }

  _visualState(nodeId) {
    return this.visualStates.get(nodeId) || {
      miniLocations: [],
      widgets: [],
      frameVisualizers: 0,
      haps: [],
      time: 0,
      evaluation: 0,
      status: "Ready",
      error: "",
    };
  }

  _notifyVisual(nodeId, patch = {}) {
    const next = { ...this._visualState(nodeId), ...patch };
    this.visualStates.set(nodeId, next);
    this.visualListeners.get(nodeId)?.forEach(listener => listener(next));
  }

  subscribeVisuals(nodeId, listener) {
    if (typeof listener !== "function") return () => {};
    const listeners = this.visualListeners.get(nodeId) || new Set();
    listeners.add(listener);
    this.visualListeners.set(nodeId, listeners);
    listener(this._visualState(nodeId));
    return () => {
      listeners.delete(listener);
      if (!listeners.size) this.visualListeners.delete(nodeId);
    };
  }

  _drawFrame(haps, time, painters) {
    painters?.forEach(painter => painter(null, time, haps, DRAW_TIME));
    for (const nodeId of this.visualListeners.keys()) {
      const tag = nodeVisualTag(nodeId);
      const active = haps.filter(hap => (
        hap.context?.tags?.includes(tag) && hap.isActive(time)
      ));
      this._notifyVisual(nodeId, { haps: active, time });
    }
  }

  registerFrameCanvas(nodeId, canvas, active = true) {
    if (!canvas) {
      this.frameCanvases.delete(nodeId);
      return () => {};
    }
    const target = {
      canvas,
      ctx: canvas.getContext("2d", { alpha: true }),
      active: Boolean(active),
    };
    this.frameCanvases.set(nodeId, target);
    return () => {
      if (this.frameCanvases.get(nodeId)?.canvas === canvas) {
        this.frameCanvases.delete(nodeId);
      }
    };
  }

  setFrameCanvasActive(nodeId, active) {
    const target = this.frameCanvases.get(nodeId);
    if (target) target.active = Boolean(active);
  }

  clearFrameCanvas(nodeId) {
    const target = this.frameCanvases.get(nodeId);
    target?.ctx?.clearRect(0, 0, target.canvas.width, target.canvas.height);
  }

  async ensureScope() {
    if (!this.scopeReady) {
      this.scopeReady = (async () => {
        // Keep soundfont implementation details out of the initial module
        // graph. Vite selects its browser build, while Node-based scheduler
        // tests need not instantiate the Web Audio dependencies.
        const soundfonts = await import("@strudel/soundfonts");
        const loadScope = installStrudelEvalScope(soundfonts);
        await Promise.all([
          loadScope,
          webaudio.registerSynthSounds(),
          webaudio.registerZZFXSounds(),
          soundfonts.registerSoundfonts(),
          ...DEFAULT_SAMPLE_MAPS.map(file => webaudio.samples(`${DEFAULT_SAMPLE_BASE}/${file}`)),
        ]);
        await webaudio.aliasBank(DEFAULT_BANK_ALIASES);
      })();
    }
    await this.scopeReady;
  }

  async ensureScheduler() {
    await this.ensureScope();
    if (this.scheduler) return this.scheduler;
    const repl = core.repl({
      defaultOutput: webaudio.webaudioOutput,
      getTime: () => webaudio.getAudioContext().currentTime,
      beforeStart: () => this.unlock(),
      onEvalError: error => console.warn("Strudel evaluation error", error),
    });
    this.scheduler = repl.scheduler;
    this.scheduler.setCps(this.cps);
    this.drawer = new Drawer(
      (haps, time, _drawer, painters) => this._drawFrame(haps, time, painters),
      DRAW_TIME,
    );
    return this.scheduler;
  }

  async unlock() {
    await this.ensureScope();
    if (!this.audioReady) {
      // This is called directly from a node Play action or global transport
      // action. Browsers therefore keep the normal user-gesture requirement.
      await webaudio.initAudio();
      this.audioReady = true;
    }
    return webaudio.getAudioContext();
  }

  _nodeScope(nodeId, bridge, transportMode = "linked", tempoState = { cps: null }) {
    const linked = transportMode !== "free";
    const setCps = value => {
      const cps = Math.max(0.01, Math.min(16, Number(value) || this.cps));
      if (linked) {
        bridge?.strudel?.setTempo?.(cps * 240);
      } else {
        // Evaluation happens before upsert creates the node entry. Keep the
        // declared Free-mode rate with this compile result instead of trying
        // to mutate an entry which does not exist yet.
        tempoState.cps = cps;
      }
      return core.silence;
    };
    const setTempo = bpm => {
      const normalized = Math.max(20, Math.min(400, Number(bpm) || this.transport.bpm));
      return setCps(bpmToCps(normalized));
    };
    const setCpm = value => setCps(Number(value) / 60);
    return {
      hush: () => {
        this.remove(nodeId);
        bridge?.strudel?.setPlaying?.(false);
        return core.silence;
      },
      setcps: setCps,
      setCps,
      setcpm: setCpm,
      setCpm: setCpm,
      setbpm: setTempo,
      setBpm: setTempo,
      start: () => {
        bridge?.strudel?.setPlaying?.(true);
        return core.silence;
      },
      stop: () => {
        bridge?.strudel?.setPlaying?.(false);
        return core.silence;
      },
      drawerator: bridge,
      __: bridge,
    };
  }

  async _compile(nodeId, source, bridge, transportMode = "linked") {
    await this.ensureScope();
    const tempoState = { cps: null };
    const scope = this._nodeScope(nodeId, bridge, transportMode, tempoState);
    const previous = Object.fromEntries(Object.keys(scope).map(key => [key, globalThis[key]]));
    const labelled = captureLabelledPatterns(nodeId);
    const frameVisualizers = captureFrameVisualizers(this, nodeId);
    Object.assign(globalThis, scope);
    try {
      const { pattern, meta } = await core.evaluate(source, transpiler, { id: nodeId });
      const captured = labelled.stack();
      const result = captured || pattern;
      if (!core.isPattern(result)) throw new Error("Strudel source must evaluate to a pattern.");
      return {
        pattern: result.tag(nodeVisualTag(nodeId)),
        cps: tempoState.cps,
        meta: {
          miniLocations: meta?.miniLocations || [],
          widgets: meta?.widgets || [],
          frameVisualizers: frameVisualizers.count(),
        },
      };
    } finally {
      frameVisualizers.restore();
      labelled.restore();
      Object.entries(previous).forEach(([key, value]) => restoreGlobal(key, value));
    }
  }

  async upsert({ nodeId, source, transportMode = "linked", bridge }) {
    const run = async () => {
      this._notifyVisual(nodeId, { status: "Evaluating…", error: "" });
      // The reference REPL establishes core's shared time source before it
      // evaluates user code. Inline visualizers read that clock while their
      // widget patterns are created, so mirror that ordering here as well.
      const scheduler = await this.ensureScheduler();
      const normalizedMode = transportMode === "free" ? "free" : "linked";
      const { pattern, meta, cps } = await this._compile(nodeId, source, bridge, normalizedMode);
      const schedulerCycle = typeof scheduler.now === "function" ? scheduler.now() : 0;
      const previous = this._promoteDueEntry(nodeId, schedulerCycle);
      if (scheduler.started) {
        const phaseOffset = normalizedMode === "linked" ? this.linkedPhaseOffset : 0;
        const activateAt = strudelNextBeatCycle(
          schedulerCycle + phaseOffset,
          this.cps,
          SCHEDULER_SWAP_SAFETY_SECONDS,
        ) - phaseOffset;
        this.entries.set(nodeId, {
          pattern: previous?.pattern || core.silence,
          transportMode: normalizedMode,
          cps,
          pending: { pattern, meta, activateAt },
        });
        this._notifyVisual(nodeId, {
          status: "Update queued for next beat",
          error: "",
        });
        this._schedulePendingActivation(nodeId, activateAt);
      } else {
        this.entries.set(nodeId, {
          pattern,
          transportMode: normalizedMode,
          cps,
          pending: null,
        });
        this._publishEvaluation(nodeId, meta, normalizedMode);
      }
      await this.refresh();
      return pattern;
    };
    // Strudel's evaluator uses a temporary global scope. Serializing compile
    // work prevents two node edits from ever seeing one another's bridge.
    const pending = this.compileQueue.then(run, run).catch(error => {
      this._notifyVisual(nodeId, {
        haps: [],
        status: "Evaluation error",
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    });
    this.compileQueue = pending.catch(() => undefined);
    return pending;
  }

  setNodeCps(nodeId, value) {
    const entry = this.entries.get(nodeId);
    if (!entry) return;
    const cps = Math.max(0.01, Math.min(16, Number(value) || this.cps));
    this.entries.set(nodeId, { ...entry, cps });
    void this.refresh();
  }

  setNodeTransportMode(nodeId, value) {
    const entry = this.entries.get(nodeId);
    if (!entry) return;
    this.entries.set(nodeId, {
      ...entry,
      transportMode: value === "free" ? "free" : "linked",
    });
    void this.refresh();
  }

  _publishEvaluation(nodeId, meta, transportMode) {
    if (!meta?.frameVisualizers) this.clearFrameCanvas(nodeId);
    this._notifyVisual(nodeId, {
      miniLocations: meta?.miniLocations || [],
      widgets: meta?.widgets || [],
      frameVisualizers: Math.max(0, Number(meta?.frameVisualizers) || 0),
      haps: [],
      evaluation: this._visualState(nodeId).evaluation + 1,
      status: transportMode === "free" ? "Free-run" : "Transport linked",
      error: "",
    });
  }

  _promoteDueEntry(nodeId, cycle = 0) {
    const entry = this.entries.get(nodeId);
    if (!entry?.pending || cycle + 1e-6 < entry.pending.activateAt) return entry;
    const next = {
      ...entry,
      pattern: entry.pending.pattern,
      pending: null,
    };
    this.entries.set(nodeId, next);
    this._publishEvaluation(nodeId, entry.pending.meta, next.transportMode);
    const timer = this.activationTimers.get(nodeId);
    if (timer) clearTimeout(timer);
    this.activationTimers.delete(nodeId);
    return next;
  }

  _schedulePendingActivation(nodeId, activateAt) {
    const previousTimer = this.activationTimers.get(nodeId);
    if (previousTimer) clearTimeout(previousTimer);
    const currentCycle = this.scheduler?.now?.() || 0;
    const delayMs = Math.max(0, ((activateAt - currentCycle) / this.cps) * 1000);
    const timer = setTimeout(() => {
      this.activationTimers.delete(nodeId);
      const entry = this.entries.get(nodeId);
      if (!entry?.pending || entry.pending.activateAt !== activateAt) return;
      this._promoteDueEntry(nodeId, activateAt);
      void this.refresh();
    }, delayMs);
    this.activationTimers.set(nodeId, timer);
  }

  async remove(nodeId) {
    const timer = this.activationTimers.get(nodeId);
    if (timer) clearTimeout(timer);
    this.activationTimers.delete(nodeId);
    if (!this.entries.delete(nodeId)) return;
    this.clearFrameCanvas(nodeId);
    this._notifyVisual(nodeId, { haps: [], status: "Stopped" });
    await this.refresh();
  }

  async setTransport(next = {}) {
    const previous = this.transport;
    const hasTime = Number.isFinite(Number(next.time));
    const transport = {
      ...previous,
      ...next,
      ...(hasTime ? { time: Math.max(0, Number(next.time)) } : {}),
    };
    const playingChanged = Boolean(transport.playing) !== Boolean(previous.playing);
    const bpmChanged = Number(transport.bpm) !== Number(previous.bpm);
    const loopedOrRewound = hasTime && transport.time + 0.02 < previous.time;
    const stoppedPositionChanged = hasTime && !transport.playing && transport.time !== previous.time;
    const shouldAnchorPhase = playingChanged || bpmChanged || loopedOrRewound || stoppedPositionChanged;
    this.transport = transport;
    this.cps = bpmToCps(this.transport.bpm);
    let schedulerCycle = 0;
    if (this.scheduler) {
      schedulerCycle = this.scheduler.now?.() || 0;
      if (shouldAnchorPhase) {
        // Cyclist's clock is monotonic and independent from Drawerator's
        // seekable/looping score time. Shift only Linked patterns so their
        // cycle phase equals the score's BBU phase at every transport anchor.
        this.linkedPhaseOffset = (this.transport.time * this.cps) - schedulerCycle;
      }
      this.scheduler.setCps(this.cps);
    } else if (shouldAnchorPhase) {
      this.linkedPhaseOffset = this.transport.time * this.cps;
    }
    const onlyContinuousTimeAdvanced = hasTime
      && !playingChanged
      && !bpmChanged
      && !loopedOrRewound
      && !stoppedPositionChanged;
    if (onlyContinuousTimeAdvanced) return;
    for (const [nodeId, entry] of this.entries) {
      if (!entry.pending) continue;
      const phaseOffset = entry.transportMode === "linked" ? this.linkedPhaseOffset : 0;
      const activateAt = shouldAnchorPhase
        ? strudelNextBeatCycle(
          schedulerCycle + phaseOffset,
          this.cps,
          SCHEDULER_SWAP_SAFETY_SECONDS,
        ) - phaseOffset
        : entry.pending.activateAt;
      if (activateAt !== entry.pending.activateAt) {
        this.entries.set(nodeId, {
          ...entry,
          pending: { ...entry.pending, activateAt },
        });
      }
      this._schedulePendingActivation(nodeId, activateAt);
    }
    await this.refresh();
  }

  _combinedPattern() {
    const patterns = Array.from(this.entries.values())
      .filter(entry => entry.transportMode === "free" || this.transport.playing)
      .map(entry => {
        const transform = pattern => {
          if (entry.transportMode === "linked") {
            return this.linkedPhaseOffset ? pattern._early(this.linkedPhaseOffset) : pattern;
          }
          return !entry.cps || entry.cps === this.cps
            ? pattern
            : pattern._fast(entry.cps / this.cps);
        };
        const current = transform(entry.pattern);
        return entry.pending
          ? strudelSwitchAtCycle(current, transform(entry.pending.pattern), entry.pending.activateAt)
          : current;
      });
    return patterns.length ? core.stack(...patterns) : core.silence;
  }

  _shouldPlay() {
    return Array.from(this.entries.values()).some(entry => (
      entry.transportMode === "free" || this.transport.playing
    ));
  }

  async refresh() {
    if (!this.scheduler && !this.entries.size) return;
    const scheduler = await this.ensureScheduler();
    scheduler.setCps(this.cps);
    await scheduler.setPattern(this._combinedPattern(), false);
    this.drawer?.invalidate(scheduler);
    if (this._shouldPlay()) {
      await this.unlock();
      if (!scheduler.started) await scheduler.start();
      for (const [nodeId, entry] of this.entries) {
        if (
          entry.transportMode === "linked"
          && this.transport.playing
          && this._visualState(nodeId).status === "Stopped"
        ) {
          this._notifyVisual(nodeId, { status: "Transport linked", error: "" });
        }
      }
      if (!this.drawerRunning) {
        this.drawer?.start(scheduler);
        this.drawerRunning = true;
      }
    } else {
      // Linked transport stop is a phase reset, not a pause. Cyclist.pause()
      // preserves its private cycle counter, which made the next Drawerator
      // downbeat resume at an arbitrary Strudel step.
      if (scheduler.started) scheduler.stop();
      if (this.drawerRunning) this.drawer?.stop();
      this.drawerRunning = false;
      for (const nodeId of this.visualListeners.keys()) {
        this._notifyVisual(nodeId, { haps: [], status: "Stopped" });
      }
    }
  }

  async panic() {
    this.activationTimers.forEach(timer => clearTimeout(timer));
    this.activationTimers.clear();
    this.entries.clear();
    this.frameCanvases.forEach((_target, nodeId) => this.clearFrameCanvas(nodeId));
    if (this.scheduler) this.scheduler.stop();
    this.drawer?.stop();
    this.drawerRunning = false;
    for (const nodeId of this.visualListeners.keys()) {
      this._notifyVisual(nodeId, { haps: [], status: "Stopped" });
    }
  }

  dispose() {
    this.activationTimers.forEach(timer => clearTimeout(timer));
    this.activationTimers.clear();
    this.entries.clear();
    this.frameCanvases.clear();
    this.drawer?.stop();
    this.drawer = null;
    this.drawerRunning = false;
    this.scheduler?.stop();
    this.scheduler = null;
    this.visualStates.clear();
    this.visualListeners.clear();
  }
}

let boardRuntime = null;

export const getStrudelRuntimeManager = () => {
  if (!boardRuntime) boardRuntime = new StrudelRuntimeManager();
  return boardRuntime;
};

export const resetStrudelRuntimeForTests = () => {
  boardRuntime?.dispose();
  boardRuntime = null;
};

export const strudelBpmToCps = bpmToCps;
