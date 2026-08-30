# WebMCP Challenge: Registration, Learning, Build, and Submission Guide

**Prepared:** August 27, 2026
**Timezone used below:** America/New_York / Eastern Daylight Time
**Official deadline:** September 3, 2026 at 1:00 p.m. Pacific / 4:00 p.m. Eastern
**Recommended personal deadline:** September 2, with September 3 reserved for verification

This is an operational guide for building and submitting Ixtos, a focused WebMCP challenge
profile and proof of concept for Underscores. The [official Devpost rules](https://webmcp.devpost.com/rules)
govern if this guide, the challenge landing page, a plugin, or another summary disagrees with them.
Recheck the rules and Devpost updates before submitting because the rules permit amendments.

## 1. Do these registration steps now

### Register on Devpost

1. Open the [WebMCP Challenge on Devpost](https://webmcp.devpost.com/).
2. Select **Join Hackathon**.
3. Sign in to an existing Devpost account or create a free account.
4. Enter as an individual unless a team or organization is intentionally entering.
5. If entering as a team or organization, designate one eligible person as its official
   Representative. That person submits and receives any prize on the team's behalf.
6. Confirm that the entrant meets the age, residence, supported-country, and conflict-of-interest
   requirements in the [eligibility section of the rules](https://webmcp.devpost.com/rules).
7. Open **My projects** and create a draft submission for **Ixtos** immediately. Do not wait for
   the app, repository, or video to be finished.
8. Add placeholder text for the project description, live URL, repository, video, and testing
   instructions so missing submission assets remain visible.
9. Subscribe to Devpost updates and check the challenge **Updates** and **Discussions** tabs daily.

Registration and submissions are open now and close together on September 3 at 1:00 p.m. Pacific
/ 4:00 p.m. Eastern. Drafts can be edited before the deadline. The rules allow multiple entries
only when they are unique and substantially different; this plan assumes one Ixtos submission.

### Join support channels

- Join the [OpenAI Discord WebMCP channel](https://discord.com/channels/974519864045756446/1517482456964534312).
- Bookmark the [Devpost discussion board](https://webmcp.devpost.com/forum_topics).
- Put **August 31 at 2:00 p.m. Eastern** on the calendar for official office hours
  (11:00 a.m. Pacific). Use the Discord link from the
  [OpenAI challenge page](https://openai.com/webmcp-challenge/).
- The Devpost Hackathons plugin is optional and is not a source of truth. The website and official
  rules control.

### Prepare the testing environment

Use both supported paths when possible:

1. **ChatGPT desktop app:** Its in-app browser supports site tools/WebMCP when the account and
   selected model have access. No separate site connection is required. See
   [Using site tools in ChatGPT](https://help.openai.com/en/articles/20001423-using-site-tools-in-the-chatgpt-desktop-app).
2. **Google Chrome 149 or later:** Open `chrome://flags/#enable-webmcp-testing`, enable the flag,
   and relaunch Chrome. See the [Chrome WebMCP overview](https://developer.chrome.com/docs/ai/webmcp).
3. In Chrome DevTools, open **Application → WebMCP**. Confirm that registered tools appear and can
   be invoked manually. See [Debug WebMCP tools](https://developer.chrome.com/docs/devtools/application/webmcp).

The public app must work through HTTPS on a stable origin. WebMCP requires origin isolation; do
not deploy with `document.domain` enabled or `Origin-Agent-Cluster: ?0`. Chrome's origin trial is
optional for broader unflagged Chrome access; the challenge specifically permits the ChatGPT
in-app browser or Chrome with WebMCP testing enabled.

## 2. Know exactly what must be submitted

The submission is not complete until all of these exist:

- A working live URL accessible in ChatGPT's in-app browser or Chrome with WebMCP enabled.
- A public GitHub, GitLab, or Bitbucket repository.
- All source, assets, setup instructions, and testing instructions needed to understand and run
  the project.
- An open-source `LICENSE` file that the repository host detects and displays visibly.
- A real imperative WebMCP implementation using `document.modelContext.registerTool(...)`.
- An English description explaining:
  - why the use case is a strong fit for WebMCP;
  - how it improves the user experience;
  - what humans and agents can do together that was previously difficult or impossible;
  - how WebMCP was implemented.
- A public YouTube video under three minutes, with audio, clearly showing the working project and
  how WebMCP is used.
- Rights-safe video, code, images, fonts, music, scores, logos, and other assets.
- Free, unrestricted judge access through the end of judging on September 21 at 8:00 p.m. Eastern.
  If authentication is used, include working judge credentials and precise testing instructions.
- English submission materials or complete English translations.

Judges are not required to build the repository or test the live app. The description, video,
screenshots, README opening, and live first-run state must therefore communicate the same story
without depending on judge persistence.

## 3. Existing-project evidence required for Ixtos

Existing projects are eligible, but only meaningful WebMCP extensions created after the official
submission period began are evaluated. Ixtos must make the Underscores lineage unusually clear.

Before feature work:

- Preserve the Underscores Git history.
- Preserve and push the annotated pre-period baseline tag named in the Ixtos genesis document.
- Create `PREEXISTING_WORK.md` describing inherited Underscores capabilities.
- Create `CHALLENGE_WORK.md` listing challenge-period additions by commit.
- Keep `git diff challenge-baseline-2026-08-25...HEAD` readable.
- Use small commits that identify actual WebMCP, profile, provenance, collaboration, and demo work.
- Do not describe Excalidraw, the existing assistant, multiplayer foundation, IanniX compatibility,
  SVG system, synths, or other inherited capabilities as challenge-period inventions.

Before the repository becomes public, audit source and asset licensing. The challenge requires an
open-source license, but the license must be chosen after determining what inherited or copied
source the repository contains. Do not let an agent select a license by assumption.

## 4. Understand the judging stages

### Stage One: pass/fail viability

The project must reasonably fit the human-agent open-web theme and genuinely use the required
WebMCP API. Protect this gate by ensuring:

- the deployed page registers detectable tools;
- at least one read and several meaningful write tools actually work;
- agent actions visibly affect the same page the human is using;
- the live app matches the video and written description;
- the repository contains the actual WebMCP implementation.

### Stage Two: four equally weighted criteria

1. **WebMCP Leverage:** Demonstrate non-trivial semantic tools and a workflow that would be brittle
   or difficult through coordinate clicking alone.
2. **Execution:** Deliver a coherent, working product experience rather than an API demonstration.
3. **Potential Impact:** Name a real audience and problem—collaborative graphic-score creation,
   interpretation, teaching, and performance—and show the solution addressing it.
4. **Creativity and Ambition:** Show a distinctive living-score collaboration between people and
   agents without expanding into an unfinishable feature catalog.

For Ixtos, one polished human-agent-human score session can serve all four criteria better than a
large tool list.

### Prizes and verification

The top ten eligible submissions are listed to receive $3,000 from OpenAI, one year of ChatGPT Pro,
a Codex Micro, OpenAI swag, and additional sponsor prizes including cash, service credits, gear,
and subscriptions. Prize details, team-member limits, substitutions, taxes, and verification are
governed by the official rules. A potential winner must verify identity, eligibility, and their
role in creating the submission before an award becomes final.

## 5. Fast WebMCP learning track

Complete this in order. It should take roughly two to three focused hours, excluding experiments.

### 1. Mental model: 25 minutes

Read:

- [WebMCP specification and explainer](https://github.com/webmachinelearning/webmcp)
- [Chrome WebMCP overview](https://developer.chrome.com/docs/ai/webmcp)
- [WebMCP versus backend MCP](https://developer.chrome.com/docs/ai/webmcp/compare-mcp)

Retain this model:

```text
Backend MCP/API
    Agent talks to a remote service, often away from the visible page.

WebMCP
    The current browser page registers structured tools.
    The browser agent discovers and calls them.
    Existing client-side application logic updates the visible shared page.
```

WebMCP complements the current Underscores API/MCP work; it does not replace backend MCP. It is
designed primarily for visible, human-in-the-loop browser collaboration rather than autonomous
headless operation.

### 2. Imperative API: 35 minutes

Read the [WebMCP Imperative API guide](https://developer.chrome.com/docs/ai/webmcp/imperative-api).
Focus on:

- `document.modelContext`, not deprecated `navigator.modelContext`;
- `registerTool({ name, description, inputSchema, execute, annotations })`;
- JSON Schema types, required fields, enums, and bounds;
- tool registration and unregistration through an `AbortController`;
- the `AbortSignal` passed to `execute` for cancelled work;
- feature detection so ordinary browsers still work;
- returning concise structured outcomes rather than full application state.

For Ixtos, use the direct imperative API first. A React hook exists experimentally, but a small
adapter around the browser API avoids adding an unnecessary dependency and maps naturally to the
existing Underscores command registry.

### 3. Tool design: 25 minutes

Read [WebMCP best practices](https://developer.chrome.com/docs/ai/webmcp/best-practices).

Apply these rules:

- Give each tool one clear function.
- Avoid overlapping tools that make selection ambiguous.
- Register a small static catalog first; add dynamic registration only when page state requires it.
- Use action-oriented names and say what the tool does and when it applies.
- Give the tool typed inputs; do not force the model to calculate or translate unnecessarily.
- Prefer semantic score actions over raw UI operations.

Good: `patch_score_elements`, `set_realization_mapping`, `control_transport`.

Poor: `click_canvas_at`, `run_arbitrary_code`, `do_score_thing`.

### 4. Security: 25 minutes

Read [WebMCP tool security](https://developer.chrome.com/docs/ai/webmcp/secure-tools).

For Ixtos:

- mark read-only tools with `readOnlyHint`;
- mark results containing imported notes, source text, or user content with
  `untrustedContentHint`;
- never expose room secrets, credentials, local paths, provider settings, clipboard contents,
  device streams, unrestricted URLs, or trusted script execution;
- validate again at execution time rather than trusting model-produced arguments;
- require visible confirmation or preview for high-impact actions;
- keep descriptions and results compact: roughly 30 characters for names/parameters, 150 for
  parameter descriptions, 500 for tool descriptions, and 1,500 for individual outputs;
- expose tools cross-origin only to explicitly trusted secure origins.

### 5. Debugging and evals: 35 minutes

Read:

- [Chrome DevTools WebMCP panel](https://developer.chrome.com/docs/devtools/application/webmcp)
- [WebMCP evals](https://developer.chrome.com/docs/ai/webmcp/evals)

Use three testing layers:

1. **Deterministic command tests:** validation, mutation, undo, provenance, cancellation, and error
   behavior without an agent.
2. **Manual WebMCP execution:** invoke each tool from DevTools with valid, invalid, boundary, and
   stale-revision arguments.
3. **Agent eval prompts:** verify that realistic and ambiguous prompts select the intended tool,
   supply the right parameters, and follow the intended sequence.

### 6. Inspiration without imitation: 15 minutes

Browse:

- [OpenAI WebMCP showcase](https://developers.openai.com/showcase?view=webmcp-apps)
- [Official Devpost resource collection](https://webmcp.devpost.com/resources)
- [Chrome WebMCP demos](https://github.com/GoogleChromeLabs/webmcp-tools/tree/main/demos)

Look for interaction patterns, tool lifecycle, and demo clarity—not a feature list to copy.

## 6. How to guide Codex through implementation

Give Codex one evidence-bounded stage at a time. Require it to inspect existing Underscores seams
before changing them and to finish each vertical slice before broadening scope.

### Orientation prompt

```text
Read PROJECT_BRIEF.md completely. Do not edit source yet. Inspect the current branch, dirty state,
baseline tag, command registry, window.__ API, assistant capability allowlist, scene exchange,
history/undo, and multiplayer publication path. Report the smallest module boundary for adding
WebMCP without introducing a second mutation system. Identify what is inherited and what will be
new challenge-period work. End with one vertical-slice plan and explicit verification evidence.
```

### First implementation prompt

```text
Implement the smallest feature-detected WebMCP adapter using document.modelContext directly.
Register only get_score_context first. Route it through existing Underscores state/commands,
return a bounded semantic result, mark it read-only, support lifecycle cleanup, and add tests.
Verify registration and manual execution in Chrome DevTools Application > WebMCP. Do not add a
React WebMCP dependency or expose raw scene snapshots unless current evidence requires it.
```

### First write-tool prompt

```text
Add one meaningful semantic write tool over the existing command registry. Make it one atomic undo
transaction, validate bounded JSON Schema inputs, record source:webmcp provenance, return IDs and
revisions, and publish through the normal collaboration path. Prove the visible UI result, undo,
and second-browser synchronization. Do not create a parallel Ixtos mutation path.
```

### Tool-quality prompt

```text
Audit the current WebMCP catalog for overlapping purpose, vague names, oversized descriptions,
unbounded schemas/results, missing annotations, prompt-injection exposure, stale-revision writes,
missing AbortSignal handling, and inaccessible or hidden side effects. Produce direct-execution
fixtures plus agent prompts with expected tool calls. Fix only evidenced issues and rerun the
browser checks.
```

### Deployment-readiness prompt

```text
Test the exact deployed origin and commit in both ChatGPT's in-app browser and Chrome 149+ with
WebMCP enabled. Verify tool discovery, a complete human-agent workflow, visible mutations, undo,
multiplayer propagation, fresh-session audio unlock, reset, unsupported-browser behavior, and
absence of secrets/private assets. Record exact evidence in TESTING.md. Do not infer deployment
behavior from localhost.
```

For every Codex stage, ask for these outputs:

- files changed and why;
- inherited versus challenge-period work;
- exact tool contracts;
- deterministic tests run;
- observed browser behavior;
- remaining risks;
- the smallest next step.

## 7. Daily plan

### Thursday, August 27: register, preserve lineage, establish the seam

- Complete Devpost registration and create the draft submission.
- Join Discord and calendar office hours.
- Create the history-preserving Ixtos repository and baseline tag.
- Add `PROJECT_BRIEF.md`, `PREEXISTING_WORK.md`, and `CHALLENGE_WORK.md`.
- Decide individual versus team entry and record the representative if applicable.
- Start the license and third-party asset audit.
- Complete the first four learning-track sections.
- Have Codex produce its read-only orientation report.
- End the day with the Ixtos profile boundary and one WebMCP adapter location decided.

### Friday, August 28: make WebMCP real early

- Add feature detection and register `get_score_context` on the real page.
- Verify it in Chrome DevTools and ChatGPT's in-app browser.
- Add one atomic write tool and prove UI mutation plus undo.
- Deploy a minimal HTTPS build immediately; do not wait for polish.
- Add `TESTING.md` with tested browser versions, origin, commit, and known failures.
- Create Ixtos/Underscores/Excalidraw import fixtures before changing scene exchange.
- End the day with a deployed read → write → visible result loop.

### Saturday, August 29: complete the semantic vertical slice

- Implement only the tools required by the demo story.
- Add bounded schemas, concise results, provenance, cancellation, and stale-revision behavior.
- Make assistant, `window.__`, UI, and WebMCP share the same command implementation.
- Test WebMCP mutations through the existing multiplayer publication path.
- Keep a single-user path fully functional if a second WebRTC peer cannot connect.
- Draft the README opening and the four required description answers while behavior is fresh.
- End the day with a complete human → agent → human correction → performance loop.

### Sunday, August 30: harden the product story

- Test two fresh browser sessions on the deployed origin.
- Run direct tool tests and agent-prompt evals.
- Remove overlapping or demo-irrelevant WebMCP tools.
- Add a compact visible activity/provenance view.
- Finalize one rights-safe seeded score and audio realization.
- Write the first three-minute video script and make a rough screen recording.
- Prepare specific unresolved questions for office hours.

### Monday, August 31: office hours and feature freeze

- Attend office hours at **2:00 p.m. Eastern**.
- Ask only questions that the current rules/docs do not answer, particularly eligibility,
  pre-existing-work evidence, WebMCP testing behavior, and licensing ambiguity.
- Record answers with date, speaker/context, and any authoritative follow-up link.
- Freeze feature scope after applying only essential clarifications.
- Complete security, prompt-injection, license, asset, and public-bundle audits.
- Fill the Devpost draft with real text, screenshots, repository placeholder, and live URL.
- Decide the open-source license after the audit; do not postpone this past September 1.

### Tuesday, September 1: public-release candidate

- Make the repository public with a detected license and complete source/instructions.
- Deploy a release candidate and test it from a signed-out/fresh session.
- Verify the seeded experience needs no paid API, local server, MIDI, OSC, or private credential.
- Complete `README.md`, `PREEXISTING_WORK.md`, `CHALLENGE_WORK.md`, `TESTING.md`, license, and notices.
- Verify Devpost fields, English copy, and testing instructions.
- Optional: registered participants may request Netlify credits by **3:00 p.m. Eastern** through
  the form linked in the [official rules](https://webmcp.devpost.com/rules), while supplies last.
- Record another rough video and cut anything that cannot be shown clearly in under three minutes.

### Wednesday, September 2: record and submit

- Freeze the demonstrated feature set.
- Run the exact demo from a fresh browser against the production URL.
- Record a concise video with audio and no unlicensed score, music, logo, font, or visual asset.
- Keep the video under 2:45 to leave margin below the three-minute rule.
- Upload it publicly to YouTube and verify playback while signed out.
- Add the final video, live URL, public repository, description, screenshots, and testing steps to
  Devpost.
- Submit on September 2 rather than waiting for deadline day.
- Save screenshots or a PDF of the completed Devpost entry and record the submitted commit hash.

### Thursday, September 3: verification buffer

- Before **2:00 p.m. Eastern**, run a read-only smoke test of every submitted URL.
- Verify the repository is public and the license is detected at the top of its page.
- Verify the YouTube video is public, has audio, and remains under three minutes.
- Verify the live app exposes tools in both supported environments.
- Verify judge instructions require no undocumented knowledge.
- Make only essential corrections, then confirm the Devpost submission well before the official
  **4:00 p.m. Eastern** deadline.
- At the deadline, freeze the submission, repository, deployment, video, and submitted URLs. The
  Devpost resource FAQ warns that post-deadline changes during judging may risk eligibility.

### September 4–21: judging availability

- Keep the app, repository, video, and credentials online, free, and stable.
- Monitor only for outages or direct organizer requests.
- Avoid feature releases or substantive changes to submitted materials.
- Keep evidence of uptime and any necessary incident-only correction.

### On or around September 23

- Watch Devpost, email, and official channels for results or verification requests.
- If selected as a potential winner, respond promptly to identity, eligibility, tax, and role
  verification paperwork. The rules allow ten business days to return required forms.

## 8. Submission-description skeleton

### Why WebMCP

Ixtos exposes the semantic structure of a living graphic score directly to a browser agent. The
agent can understand curves, triggers, sources, mappings, performer roles, and revisions rather
than guessing coordinates in a complex canvas.

### Better experience

Humans remain in the visible score and review every change. Agent operations use the same
undoable, collaborative command path as manual edits and scripts, making assistance faster,
clearer, and more reliable than simulated clicks.

### Newly possible collaboration

A person can ask an agent to inspect and interpret a score passage, propose or create semantic
elements and realizations, correct the agent directly, invite another performer, and perform the
revised shared score without exporting the work to a separate AI interface.

### Implementation

The page registers a focused set of imperative tools with
`document.modelContext.registerTool(...)`. Each tool validates bounded inputs, calls the existing
Underscores command/history layer, records WebMCP provenance, updates the visible Excalidraw-based
score, and publishes authored changes through the existing collaboration path.

## 9. Final submission checklist

### Registration and eligibility

- [ ] Joined the challenge on Devpost
- [ ] Entrant type and Representative are correct
- [ ] Eligibility and supported-country requirements checked
- [ ] Draft submission exists

### Working product

- [ ] Production HTTPS URL works in a fresh session
- [ ] WebMCP tools are discoverable in ChatGPT's in-app browser
- [ ] WebMCP tools are discoverable in Chrome 149+ with the testing flag
- [ ] At least one read and three meaningful write actions work
- [ ] Actions visibly update the page, are attributed, and can be undone
- [ ] Multiplayer propagation is demonstrated or accurately scoped
- [ ] The app works normally when WebMCP is unavailable
- [ ] Demo reset path works

### Repository and lineage

- [ ] Repository is public
- [ ] License is detected and visible
- [ ] All necessary source, assets, and instructions are present
- [ ] Baseline tag and dated history are pushed
- [ ] `PREEXISTING_WORK.md` is accurate
- [ ] `CHALLENGE_WORK.md` identifies meaningful post-start WebMCP work
- [ ] No secrets, private paths, private examples, or unlicensed assets remain

### Submission assets

- [ ] Required English description answers all four prompts
- [ ] Public YouTube video is under three minutes and includes audio
- [ ] Video shows the functioning app and actual WebMCP use
- [ ] Video and screenshots contain only cleared material
- [ ] Live URL, repository URL, and video URL are correct
- [ ] Testing instructions name supported browsers and exact first steps
- [ ] Submitted commit hash and deployment are recorded
- [ ] Final entry saved before September 3 at 4:00 p.m. Eastern

## 10. Authoritative and useful links

### Challenge administration

- [OpenAI WebMCP Challenge](https://openai.com/webmcp-challenge/)
- [Devpost registration and submission](https://webmcp.devpost.com/)
- [Official rules](https://webmcp.devpost.com/rules)
- [Official resources and FAQ](https://webmcp.devpost.com/resources)
- [Devpost discussion board](https://webmcp.devpost.com/forum_topics)
- [OpenAI Discord WebMCP channel](https://discord.com/channels/974519864045756446/1517482456964534312)

### Learn and implement

- [WebMCP specification and explainer](https://github.com/webmachinelearning/webmcp)
- [Chrome WebMCP overview](https://developer.chrome.com/docs/ai/webmcp)
- [Imperative API](https://developer.chrome.com/docs/ai/webmcp/imperative-api)
- [Best practices](https://developer.chrome.com/docs/ai/webmcp/best-practices)
- [Tool security](https://developer.chrome.com/docs/ai/webmcp/secure-tools)
- [WebMCP and backend MCP](https://developer.chrome.com/docs/ai/webmcp/compare-mcp)
- [Debug tools in Chrome DevTools](https://developer.chrome.com/docs/devtools/application/webmcp)
- [WebMCP evals](https://developer.chrome.com/docs/ai/webmcp/evals)
- [Chrome WebMCP demos](https://github.com/GoogleChromeLabs/webmcp-tools/tree/main/demos)
- [OpenAI WebMCP showcase](https://developers.openai.com/showcase?view=webmcp-apps)
- [Using site tools in ChatGPT](https://help.openai.com/en/articles/20001423-using-site-tools-in-the-chatgpt-desktop-app)
