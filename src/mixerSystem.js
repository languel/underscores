export const MIXER_SCHEMA_VERSION = 1;
export const MIXER_STORAGE_KEY = "underscores_mixer_v1";
export const MIXER_DESTINATION_NONE = "none";
export const MIXER_DESTINATION_INTERNAL = "internal";
export const MIXER_EXTERNAL_PREFIX = "external:";
export const MIXER_INSTRUMENT_GM = "gm";
export const MIXER_INSTRUMENT_EXPRESSIVE = "expressive";
export const MIXER_INSTRUMENT_MIDI = "midi";
export const DEFAULT_MIXER_TRACK_COUNT = 16;

const clampInteger = (value, min, max, fallback) => {
  const number = Math.round(Number(value));
  return Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : fallback;
};

export const externalMixerDestination = outputId => `${MIXER_EXTERNAL_PREFIX}${String(outputId || "")}`;
export const getExternalMixerOutputId = destination => String(destination || "").startsWith(MIXER_EXTERNAL_PREFIX)
  ? String(destination).slice(MIXER_EXTERNAL_PREFIX.length)
  : null;

export const createMixerTrack = (index = 0, overrides = {}) => {
  const ordinal = Math.max(0, Math.round(Number(index) || 0));
  const destination = String(overrides.destination || MIXER_DESTINATION_INTERNAL);
  const external = getExternalMixerOutputId(destination) !== null;
  const instrument = external
    ? MIXER_INSTRUMENT_MIDI
    : overrides.instrument === MIXER_INSTRUMENT_EXPRESSIVE
      ? MIXER_INSTRUMENT_EXPRESSIVE
      : MIXER_INSTRUMENT_GM;
  const gmProgram = clampInteger(overrides.program, 0, 127, ordinal === 9 ? 0 : 0);
  const expressiveProgram = typeof overrides.program === "string" && overrides.program.trim()
    ? overrides.program.trim().slice(0, 96)
    : "bowed";
  return {
    id: String(overrides.id || `track-${ordinal + 1}`),
    name: String(overrides.name || `Track ${ordinal + 1}`).trim().slice(0, 80) || `Track ${ordinal + 1}`,
    enabled: overrides.enabled !== false,
    muted: overrides.muted === true,
    solo: overrides.solo === true,
    midiChannel: clampInteger(overrides.midiChannel, 1, 16, ordinal % 16 + 1),
    destination: [MIXER_DESTINATION_NONE, MIXER_DESTINATION_INTERNAL].includes(destination) || external
      ? destination
      : MIXER_DESTINATION_NONE,
    instrument,
    program: instrument === MIXER_INSTRUMENT_EXPRESSIVE ? expressiveProgram : gmProgram,
  };
};

const destinationFromLegacyOutput = legacyOutputId => {
  if (legacyOutputId === "__internal_gm_synth__") return { destination: MIXER_DESTINATION_INTERNAL, instrument: MIXER_INSTRUMENT_GM };
  if (legacyOutputId === "__underscores_expressive_synth__") return { destination: MIXER_DESTINATION_INTERNAL, instrument: MIXER_INSTRUMENT_EXPRESSIVE };
  if (legacyOutputId && legacyOutputId !== "__all__") return { destination: externalMixerDestination(legacyOutputId), instrument: MIXER_INSTRUMENT_MIDI };
  return { destination: MIXER_DESTINATION_NONE, instrument: MIXER_INSTRUMENT_GM };
};

export const createDefaultMixer = ({ legacyOutputId = "", gmPrograms = null } = {}) => {
  // Internal General MIDI is the useful zero-configuration destination. The
  // browser still waits for its first user gesture before audio can run, but
  // the Mixer is ready to make sound instead of silently routing to nowhere.
  const legacy = legacyOutputId ? destinationFromLegacyOutput(legacyOutputId) : {
    destination: MIXER_DESTINATION_INTERNAL,
    instrument: MIXER_INSTRUMENT_GM,
  };
  return {
    version: MIXER_SCHEMA_VERSION,
    tracks: Array.from({ length: DEFAULT_MIXER_TRACK_COUNT }, (_, index) => createMixerTrack(index, {
      ...legacy,
      program: legacy.instrument === MIXER_INSTRUMENT_EXPRESSIVE
        ? "bowed"
        : gmPrograms?.[index + 1] ?? 0,
    })),
  };
};

export const normalizeMixer = (value, migration = {}) => {
  const source = value && typeof value === "object" && !Array.isArray(value) ? value : null;
  if (!source || !Array.isArray(source.tracks) || source.tracks.length === 0) return createDefaultMixer(migration);
  const seen = new Set();
  const tracks = source.tracks.slice(0, 128).map((track, index) => {
    const normalized = createMixerTrack(index, track);
    let id = normalized.id;
    let suffix = 2;
    while (seen.has(id)) id = `${normalized.id}-${suffix++}`;
    seen.add(id);
    return { ...normalized, id };
  });
  return { version: MIXER_SCHEMA_VERSION, tracks };
};

export const updateMixerTrack = (mixer, trackId, patch) => normalizeMixer({
  ...normalizeMixer(mixer),
  tracks: normalizeMixer(mixer).tracks.map(track => track.id === trackId ? { ...track, ...(patch || {}) } : track),
});

export const addMixerTrack = mixer => {
  const normalized = normalizeMixer(mixer);
  const nextIndex = normalized.tracks.length;
  let ordinal = nextIndex + 1;
  let id = `track-${ordinal}`;
  const ids = new Set(normalized.tracks.map(track => track.id));
  while (ids.has(id)) id = `track-${++ordinal}`;
  return normalizeMixer({ ...normalized, tracks: [...normalized.tracks, createMixerTrack(nextIndex, { id, name: `Track ${ordinal}` })] });
};

export const removeMixerTrack = (mixer, trackId) => {
  const normalized = normalizeMixer(mixer);
  if (normalized.tracks.length <= 1) return normalized;
  return normalizeMixer({ ...normalized, tracks: normalized.tracks.filter(track => track.id !== trackId) });
};

export const getAudibleMixerTracks = mixer => {
  const tracks = normalizeMixer(mixer).tracks.filter(track => track.enabled && !track.muted && track.destination !== MIXER_DESTINATION_NONE);
  const hasSolo = tracks.some(track => track.solo);
  return hasSolo ? tracks.filter(track => track.solo) : tracks;
};

export const getMixerTracksForChannel = (mixer, midiChannel) => {
  const channel = clampInteger(midiChannel, 1, 16, 1);
  return getAudibleMixerTracks(mixer).filter(track => track.midiChannel === channel);
};

export const getMixerTracksForInstrument = (mixer, instrument) =>
  getAudibleMixerTracks(mixer).filter(track => track.instrument === instrument);

export const mixerProgramsByChannel = mixer => Object.fromEntries(
  normalizeMixer(mixer).tracks
    .filter(track => track.destination === MIXER_DESTINATION_INTERNAL && track.instrument === MIXER_INSTRUMENT_GM)
    .map(track => [track.midiChannel, track.program]),
);
