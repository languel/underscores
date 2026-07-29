// Native Strudel runtime for Livecode Nodes.
//
// A board owns one scheduler and stacks the active node patterns before they
// reach Web Audio.  This is intentionally not @strudel/web's singleton REPL:
// each node keeps an independently compiled pattern, while a single manager
// owns audio unlock, transport linking, and output scheduling.
import * as core from "@strudel/core";
import * as mini from "@strudel/mini";
import * as tonal from "@strudel/tonal";
import { transpiler } from "@strudel/transpiler";
import {
  getAudioContext,
  initAudio,
  registerSynthSounds,
  webaudioOutput,
} from "@strudel/webaudio";

const DEFAULT_CPS = 0.5;
const bpmToCps = bpm => Math.max(0.01, Math.min(16, (Number(bpm) || 120) / 240));

const restoreGlobal = (key, value) => {
  if (value === undefined) delete globalThis[key];
  else globalThis[key] = value;
};

export class StrudelRuntimeManager {
  constructor() {
    this.entries = new Map();
    this.scheduler = null;
    this.scopeReady = null;
    this.audioReady = false;
    this.compileQueue = Promise.resolve();
    this.transport = { playing: false, bpm: 120, time: 0 };
    this.cps = DEFAULT_CPS;
  }

  async ensureScope() {
    if (!this.scopeReady) {
      this.scopeReady = (async () => {
        mini.miniAllStrings?.();
        await core.evalScope(core.evalScope, core, mini, tonal, { webaudioOutput });
        await registerSynthSounds();
      })();
    }
    await this.scopeReady;
  }

  async ensureScheduler() {
    await this.ensureScope();
    if (this.scheduler) return this.scheduler;
    const repl = core.repl({
      defaultOutput: webaudioOutput,
      getTime: () => getAudioContext().currentTime,
      beforeStart: () => this.unlock(),
      onEvalError: error => console.warn("Strudel evaluation error", error),
    });
    this.scheduler = repl.scheduler;
    this.scheduler.setCps(this.cps);
    return this.scheduler;
  }

  async unlock() {
    await this.ensureScope();
    if (!this.audioReady) {
      // This is called directly from a node Play action or global transport
      // action. Browsers therefore keep the normal user-gesture requirement.
      await initAudio();
      this.audioReady = true;
    }
    return getAudioContext();
  }

  _nodeScope(nodeId, bridge) {
    return {
      hush: () => {
        this.remove(nodeId);
        return core.silence;
      },
      setcps: value => {
        this.setNodeCps(nodeId, value);
        return core.silence;
      },
      setCps: value => {
        this.setNodeCps(nodeId, value);
        return core.silence;
      },
      setcpm: value => {
        this.setNodeCps(nodeId, Number(value) / 60);
        return core.silence;
      },
      setCpm: value => {
        this.setNodeCps(nodeId, Number(value) / 60);
        return core.silence;
      },
      drawerator: bridge,
    };
  }

  async _compile(nodeId, source, bridge) {
    await this.ensureScope();
    const scope = this._nodeScope(nodeId, bridge);
    const previous = Object.fromEntries(Object.keys(scope).map(key => [key, globalThis[key]]));
    Object.assign(globalThis, scope);
    try {
      const { pattern } = await core.evaluate(source, transpiler, { id: nodeId });
      if (!core.isPattern(pattern)) throw new Error("Strudel source must evaluate to a pattern.");
      return pattern;
    } finally {
      Object.entries(previous).forEach(([key, value]) => restoreGlobal(key, value));
    }
  }

  async upsert({ nodeId, source, transportMode = "linked", bridge }) {
    const run = async () => {
      const pattern = await this._compile(nodeId, source, bridge);
      const previous = this.entries.get(nodeId);
      this.entries.set(nodeId, {
        pattern,
        transportMode: transportMode === "free" ? "free" : "linked",
        cps: previous?.cps || null,
      });
      await this.refresh();
      return pattern;
    };
    // Strudel's evaluator uses a temporary global scope. Serializing compile
    // work prevents two node edits from ever seeing one another's bridge.
    const pending = this.compileQueue.then(run, run);
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

  async remove(nodeId) {
    if (!this.entries.delete(nodeId)) return;
    await this.refresh();
  }

  async setTransport(next = {}) {
    this.transport = { ...this.transport, ...next };
    this.cps = bpmToCps(this.transport.bpm);
    if (this.scheduler) this.scheduler.setCps(this.cps);
    await this.refresh();
  }

  _combinedPattern() {
    const patterns = Array.from(this.entries.values()).map(entry => {
      if (!entry.cps || entry.cps === this.cps) return entry.pattern;
      return entry.pattern._fast(entry.cps / this.cps);
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
    if (this._shouldPlay()) {
      await this.unlock();
      if (!scheduler.started) await scheduler.start();
    } else if (scheduler.started) {
      scheduler.pause();
    }
  }

  async panic() {
    this.entries.clear();
    if (this.scheduler) this.scheduler.stop();
  }

  dispose() {
    this.entries.clear();
    this.scheduler?.stop();
    this.scheduler = null;
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
