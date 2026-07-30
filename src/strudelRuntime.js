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
import { slider } from "@strudel/codemirror";
import { Drawer } from "@strudel/draw";
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
    this.transport = { playing: false, bpm: 120, time: 0 };
    this.cps = DEFAULT_CPS;
  }

  _visualState(nodeId) {
    return this.visualStates.get(nodeId) || {
      miniLocations: [],
      widgets: [],
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

  async ensureScope() {
    if (!this.scopeReady) {
      this.scopeReady = (async () => {
        mini.miniAllStrings?.();
        const loadScope = core.evalScope(core.evalScope, core, mini, mondo, tonal, webaudio, {
          markcss: strudelMarkCss,
          slider,
        });
        await Promise.all([
          loadScope,
          webaudio.registerSynthSounds(),
          webaudio.registerZZFXSounds(),
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

  _nodeScope(nodeId, bridge) {
    const setTempo = bpm => {
      const normalized = Math.max(20, Math.min(400, Number(bpm) || this.transport.bpm));
      bridge?.strudel?.setTempo?.(normalized);
      this.setNodeCps(nodeId, bpmToCps(normalized));
      return core.silence;
    };
    const setCpm = value => setTempo(Number(value) * 4);
    return {
      hush: () => {
        this.remove(nodeId);
        bridge?.strudel?.setPlaying?.(false);
        return core.silence;
      },
      setcps: value => {
        this.setNodeCps(nodeId, value);
        bridge?.strudel?.setTempo?.(Number(value) * 240);
        return core.silence;
      },
      setCps: value => {
        this.setNodeCps(nodeId, value);
        bridge?.strudel?.setTempo?.(Number(value) * 240);
        return core.silence;
      },
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
    };
  }

  async _compile(nodeId, source, bridge) {
    await this.ensureScope();
    const scope = this._nodeScope(nodeId, bridge);
    const previous = Object.fromEntries(Object.keys(scope).map(key => [key, globalThis[key]]));
    const labelled = captureLabelledPatterns(nodeId);
    Object.assign(globalThis, scope);
    try {
      const { pattern, meta } = await core.evaluate(source, transpiler, { id: nodeId });
      const captured = labelled.stack();
      const result = captured || pattern;
      if (!core.isPattern(result)) throw new Error("Strudel source must evaluate to a pattern.");
      return {
        pattern: result.tag(nodeVisualTag(nodeId)),
        meta: {
          miniLocations: meta?.miniLocations || [],
          widgets: meta?.widgets || [],
        },
      };
    } finally {
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
      const { pattern, meta } = await this._compile(nodeId, source, bridge);
      const normalizedMode = transportMode === "free" ? "free" : "linked";
      const schedulerCycle = typeof scheduler.now === "function" ? scheduler.now() : 0;
      const previous = this._promoteDueEntry(nodeId, schedulerCycle);
      if (scheduler.started) {
        const activateAt = strudelNextBeatCycle(
          schedulerCycle,
          this.cps,
          SCHEDULER_SWAP_SAFETY_SECONDS,
        );
        this.entries.set(nodeId, {
          pattern: previous?.pattern || core.silence,
          transportMode: normalizedMode,
          cps: previous?.cps || null,
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
          cps: previous?.cps || null,
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
    this._notifyVisual(nodeId, {
      miniLocations: meta?.miniLocations || [],
      widgets: meta?.widgets || [],
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
    this._notifyVisual(nodeId, { haps: [], status: "Stopped" });
    await this.refresh();
  }

  async setTransport(next = {}) {
    this.transport = { ...this.transport, ...next };
    this.cps = bpmToCps(this.transport.bpm);
    if (this.scheduler) this.scheduler.setCps(this.cps);
    for (const [nodeId, entry] of this.entries) {
      if (entry.pending) this._schedulePendingActivation(nodeId, entry.pending.activateAt);
    }
    await this.refresh();
  }

  _combinedPattern() {
    const patterns = Array.from(this.entries.values()).map(entry => {
      const pattern = entry.pending
        ? strudelSwitchAtCycle(entry.pattern, entry.pending.pattern, entry.pending.activateAt)
        : entry.pattern;
      if (!entry.cps || entry.cps === this.cps) return pattern;
      return pattern._fast(entry.cps / this.cps);
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
      if (!this.drawerRunning) {
        this.drawer?.start(scheduler);
        this.drawerRunning = true;
      }
    } else {
      if (scheduler.started) scheduler.pause();
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
