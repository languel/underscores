import assert from "node:assert/strict";
import test from "node:test";
import {
  buildChatAutocompleteSuggestions,
  filterChatAutocompleteSuggestions,
  getChatAutocompleteToken,
} from "./chatAutocomplete.js";

test("chat autocomplete recognizes mention and slash command tokens", () => {
  assert.deepEqual(getChatAutocompleteToken("ask @sele", 9), {
    trigger: "@",
    query: "sele",
    start: 4,
    end: 9,
  });
  assert.deepEqual(getChatAutocompleteToken("/physics ne", 11), {
    trigger: "/",
    query: "physics ne",
    start: 0,
    end: 11,
  });
  assert.equal(getChatAutocompleteToken("email@example.com", 18), null);
});

test("chat autocomplete shares context tags and registered slash aliases", () => {
  const suggestions = buildChatAutocompleteSuggestions([
    { id: "physics.system.create", name: "Physics: Create System", aliases: ["/physics new"] },
    { id: "demo", title: "Demo", aliases: [] },
    { id: "physics.system.create", name: "Duplicate", aliases: ["/physics new"] },
  ]);
  const mentions = filterChatAutocompleteSuggestions(getChatAutocompleteToken("@canvas", 7), suggestions);
  const commands = filterChatAutocompleteSuggestions(getChatAutocompleteToken("/physics", 8), suggestions);
  assert.equal(mentions[0].name, "@canvas");
  assert.deepEqual(commands.map(item => item.name), ["/physics new"]);
  assert.equal(suggestions.some(item => item.name === "/demo"), true);
});
