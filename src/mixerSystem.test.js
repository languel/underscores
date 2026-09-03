import test from "node:test";
import assert from "node:assert/strict";
import {
  addMixerTrack,
  createDefaultMixer,
  externalMixerDestination,
  getMixerTracksForChannel,
  MIXER_DESTINATION_INTERNAL,
  MIXER_INSTRUMENT_EXPRESSIVE,
  MIXER_INSTRUMENT_GM,
  normalizeMixer,
  removeMixerTrack,
  updateMixerTrack,
} from "./mixerSystem.js";

test("legacy score output migrates to sixteen MIDI-addressed mixer tracks", () => {
  const mixer = createDefaultMixer({ legacyOutputId: "__internal_gm_synth__", gmPrograms: { 1: 40, 10: null } });
  assert.equal(mixer.tracks.length, 16);
  assert.equal(mixer.tracks[0].midiChannel, 1);
  assert.equal(mixer.tracks[0].destination, MIXER_DESTINATION_INTERNAL);
  assert.equal(mixer.tracks[0].instrument, MIXER_INSTRUMENT_GM);
  assert.equal(mixer.tracks[0].program, 40);
  assert.equal(mixer.tracks[15].midiChannel, 16);
});

test("a fresh mixer is ready for internal audio and MIDI routing", () => {
  const mixer = createDefaultMixer();
  assert.equal(mixer.tracks[0].destination, MIXER_DESTINATION_INTERNAL);
  assert.equal(mixer.tracks[0].instrument, MIXER_INSTRUMENT_GM);
  assert.equal(mixer.tracks[0].enabled, true);
});

test("mixer routing observes MIDI channels, mute, and solo", () => {
  let mixer = normalizeMixer({ tracks: [
    { id: "a", midiChannel: 1, destination: MIXER_DESTINATION_INTERNAL, instrument: MIXER_INSTRUMENT_GM },
    { id: "b", midiChannel: 1, destination: MIXER_DESTINATION_INTERNAL, instrument: MIXER_INSTRUMENT_EXPRESSIVE, solo: true },
    { id: "c", midiChannel: 2, destination: externalMixerDestination("device"), muted: false },
  ] });
  assert.deepEqual(getMixerTracksForChannel(mixer, 1).map(track => track.id), ["b"]);
  mixer = updateMixerTrack(mixer, "b", { solo: false, muted: true });
  assert.deepEqual(getMixerTracksForChannel(mixer, 1).map(track => track.id), ["a"]);
});

test("mixer supports adding, removing, and scene-program references on expressive tracks", () => {
  let mixer = normalizeMixer({ tracks: [{ id: "voice", instrument: MIXER_INSTRUMENT_EXPRESSIVE, program: "user-glass" }] });
  assert.equal(mixer.tracks[0].program, "user-glass");
  mixer = addMixerTrack(mixer);
  assert.equal(mixer.tracks.length, 2);
  mixer = removeMixerTrack(mixer, "voice");
  assert.equal(mixer.tracks.length, 1);
  mixer = removeMixerTrack(mixer, mixer.tracks[0].id);
  assert.equal(mixer.tracks.length, 1);
});
