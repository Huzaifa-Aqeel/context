# Context — implementation handoff

Last updated: 2026-10-08. Update this file after each substantial implementation and verification; never include credentials or precise user location.

## Product and constraints

- Follow `FR.md` and `tech_stack.md`: one Expo iOS/Android app with Expo Router API routes on EAS Hosting.
- Five modes: scene, reference, connection, guided, location. Location context and multi-step exploration are required MVP features.
- FR-14 adds a required MVP Personal Taste layer across the existing five modes. Users may skip onboarding or disable personalization; no sixth mode or recommendation feed is required.
- Foreground location permission is optional for the user. Derive locality, drop precise coordinates, and support an area-name fallback.
- Images, locality, and scene conversation are ephemeral. No background tracking or permanent image storage by default.
- Qloo provides cultural evidence. Groq provides vision, reasoning/tool calling, transcription, and Orpheus spoken output. Never fabricate cultural affinities or personal characteristics.
- README describes the intended finished product, without a development-status section. Project license is MIT.
- User requested `progress.md` checkpoints after each substantial implementation for future sessions.
- Before any Qloo web search, inspect the local `qloo-hackathon-kit-main/` first; only browse if the required detail is missing there (user instruction).

## Existing scaffold (complete)

- Expo SDK 57, React Native, Expo Router, Zustand, TanStack Query, Zod.
- Home, camera, scene, conversation, location, settings, not-found screens.
- Camera and photo selection, image resizing/cache cleanup, foreground reverse geocoding, microphone input, text-to-speech/replay.
- API routes: scene analyze/ask, reference explore, location context, audio transcribe, health.
- Shared evidence/request/response schemas and bounded exploration orchestration.
- Typecheck and lint passed; 9 scaffold tests passed. iOS, Android, and server bundle exports passed. Native device behavior has not yet been verified.
- `npm test` uses Node's runner with `--import tsx --experimental-test-isolation=none`; this avoids sandbox IPC restrictions and ensures individual tests execute.
- `dist/` is the server export; `dist-native/` is the native bundle export. Both are ignored.

## Environment checked (2026-10-07)

- `.env.local` exists and is gitignored. Qloo and Groq keys are configured; values were not printed.
- Configuration names present: `QLOO_BASE_URL`, `QLOO_API_KEY`, `GROQ_API_KEY`, `GROQ_API_URL`, `GROQ_TRANSCRIPTION_MODEL`, `vision_model`.
- Configured vision model: `qwen/qwen3.8-27b`. Transcription: `whisper-large-v3-turbo`.
- No reasoning model configured in `.env.local`; implementation defaults to the configured vision model and allows `GROQ_LLM_MODEL` override.
- Keep backward compatibility for lowercase `vision_model`; document preferred `GROQ_VISION_MODEL`.
- Provider credentials belong only in server modules. Never print upstream bodies or environment values containing keys.

## Implemented in this session

1. Inspected the user-provided Qloo hackathon kit and verified actual API shapes.
2. Implemented shared server transport/configuration and Groq vision, native tool calling, transcription, and Orpheus speech.
3. Implemented Qloo resolution, evidence-backed cross-domain affinities, reference and locality lookups.
4. Connected providers to API routes, retained exploration context, authenticated evidence, and added honest failure handling.
5. Connected accessible mobile interactions, permission fallbacks, voice/style selection, spoken output, and cancellation.
6. Passed 29 tests, live provider checks, an integrated route smoke check, and native/server bundle exports. Device testing remains outstanding.

## Outstanding issues / handoff warnings

- Personal Taste requirements were approved after the implementation checks below. Taste onboarding, profile state/control, Qloo taste affinities, and personalized reasoning are not implemented yet; historical 29-test/export results do not verify FR-14.
- Real Groq/Qloo adapters and health configuration checks are implemented. API routes use standard fetch suitable for EAS Workers; the kit's subprocess CLI/MCP architecture is unsuitable for this hosting target, so direct REST adapters follow verified API shapes.
- Native permission dialogs, camera, microphone, VoiceOver/TalkBack, and audio playback still need device validation. Bundle exports do not constitute a native binary/device test.
- EAS project registration, production secret configuration, API hosting, and native release builds have not been performed. Production native builds require an HTTPS API origin.
- Client context is in memory only; signed evidence becomes invalid after a signing/provider-key rotation. Server responses do not log submitted content or credentials.
- A prior npm audit reported upstream dependency advisories. Avoid forced downgrades of Expo/React Native.

## Verification log

- Baseline: scaffold typecheck, lint, 9 tests, server export, iOS/Android bundle export passed.
- Live credentials: authenticated Groq `/models` and Qloo `/search` both returned HTTP 200. Configured Qwen vision and Whisper transcription models are available. The Groq model listing did not include Llama 3.3, so do not default to it despite older docs mentioning it.

## Checkpoint 1 — server transport and Groq adapters

- Added server-only environment/config validation, reusable Web API HTTP transport, safe error mapping, provider response validation, and request timeouts.
- Added Groq JSON-mode vision extraction, native function-call reasoning, and multipart Whisper transcription.
- Reasoning uses `finishResponse` for structured spoken answers and available investigation functions; parallel tool calls are disabled and all arguments are validated.
- Preferred environment variables documented in `.env.example`; existing `vision_model` remains supported. Existing `.env.local` was not changed.
- Qloo/Groq keys were verified through small authenticated HTTP checks. Temporary credential-bearing curl configuration files were deleted after those checks.
- Local sandbox Node networking could not resolve provider domains; standalone approved curl requests worked. Production adapters still use standard `fetch` for EAS Workers compatibility. No Node subprocess dependency belongs in application server code.
- Groq adapter unit and live inference verification: pending. Qloo adapter and provider wiring are next.

## Checkpoint 2 — Qloo evidence adapter and real provider wiring

- Implemented typed Qloo `/search`, `/entities`, and `/v2/insights` calls with bounded small result sets and request-scoped deduplication.
- Entity resolution requires an exact normalized name/alias and compatible category; ambiguous candidates remain unconfirmed.
- Added Qloo facts/genre tags, explicit shared-tag relationships, measured pair affinity queries, reference recommendations, and locality place records. Demographic/service/payment tags are filtered out of cultural themes.
- Locality requests use an area name and never transmit precise coordinates. Unknown locality results return low-confidence context and a clarification warning.
- `lib/providers.ts` now constructs real Groq/Qloo adapters; transcription is connected to Groq. Health reports configuration presence without revealing keys.
- Three small live Qloo checks passed: entity/tag insights, a filtered author→book affinity, and locality place lookup, all HTTP 200. Verified response variants (`tags.id` vs `tags.tag_id`, lookup arrays vs insight objects, subtype/type fields, and `query.affinity`). Temporary credential-bearing configurations were removed.
- Shared schemas now include provider facts, ambiguity candidates, provenance of detected/related entities, locality evidence, and warnings.
- Next: preserve evidence across tool calls, support entity clarification, retain location-only conversation context, handle service failures, and add adapter/route tests. Existing scaffold missing-provider assertions need adjustment.

## Checkpoint 3 — conversational investigation and authenticated context

- Follow-ups merge Qloo facts, relationships, themes, and related references without losing visual provenance. Single-reference scenes now receive Qloo metadata even without a relationship pair.
- Added user-named entity clarification, conservative visual confidence gating, selected-mode initial questions, direct low-confidence responses when no cultural evidence is available, and a four-investigation limit.
- Location mode obtains locality evidence before answering and returns it independently of a captured scene. A changed locality invalidates cached locality evidence; pair affinities remain area-independent and locality is combined during explanation.
- Prioritized cross-domain affinity pairs while capping four pair queries. Related recommendations remain explicitly separate from visible entities.
- API routes authenticate client-carried evidence with stateless Web Crypto HMAC signatures. Fabricated/tampered cultural facts are rejected before reasoning; optional `SESSION_SIGNING_KEY` supports a stable independent key. No server-side scene storage was added.
- Client timeout expanded for bounded multi-step exploration. Adapter/flow tests and live Groq inference verification remain pending.

## Checkpoint 4 — mobile context retention and lifecycle

- Location-only responses are saved in ephemeral conversation state, including signed locality evidence, for follow-ups without a camera capture.
- Client scene/locality responses retain warnings, and scene cards exclude Qloo recommendations from the visible-reference list.
- Session generation checks prevent delayed API responses from restoring a scene/conversation after the user clears or changes the session.
- Camera preview now unmounts on app backgrounding as well as navigation changes. Reverse-geocoding results are discarded if the app is no longer foregrounded.
- Added iOS accessibility announcements for notices; Android retains polite live-region announcements. Privacy screen names the actual provider/data flows.
- Next: adapter and bounded-agent tests, real Groq inference checks, lifecycle polish, and final exports. Native permission/speech behavior still requires device verification.

## Checkpoint 5 — Groq Orpheus spoken responses

- User changed TTS to `canopylabs/orpheus-v1-english` using the existing Groq key. Read `.env.local` variable names without exposing credentials; added compatibility for their `GROQ_TXT_SPEECH` model setting, preferred `GROQ_TTS_MODEL`, and optional `GROQ_TTS_VOICE` (default `troy`).
- Added `/api/audio/speak` and a server-side Groq WAV adapter with response validation and no-store headers. No provider key enters the mobile bundle.
- Official Groq Orpheus docs specify WAV and a 200-character input cap. Responses are split at sentence/word boundaries and played sequentially through Expo Audio.
- Playback is cancellable, stops before voice recording or on navigation/backgrounding, and temporarily reuses generated chunks for replay. Cache files/object URLs are disposed on response changes, unmount, backgrounding, or session clear.
- Updated README/tech stack and privacy text to describe Groq TTS. README remains a finished-product description with no dev-status section.
- Live Groq JSON vision and native tool calling both returned HTTP 200: the synthetic poster yielded its exact author/book names, and reasoning requested a valid confirmed-reference investigation.
- TTS tests/live synthesis and final adapter verification are next. Native playback is not yet device-verified.

## Checkpoint 6 — voice preferences and live speech

- User enabled Orpheus in the Groq project. Initial retries returned `model_permission_blocked_project`; the latest retry succeeded with HTTP 200 and WAV audio, including `[warm]` vocal direction. Added a sanitized actionable model-disabled error for future configuration problems.
- Added six officially documented English voices: Autumn, Diana, Hannah, Austin, Daniel, Troy. Tara is not listed by this Groq endpoint and is not offered.
- Added natural, warm, cheerful, whisper, dramatic, and slow-paced delivery preferences, plus a voice preview. Directions are applied to audio requests without appearing in written answers; chunk lengths reserve room for the direction prefix.
- Replay cache keys now include voice/style; changing preferences clears temporary audio. Settings stay in ephemeral state like the session.
- Removed unused `expo-speech`; actual spoken output uses Groq and Expo Audio only. Added portable client cancellation/timeouts because React Native's AbortSignal lacks static timeout/any methods.
- Live transcription also returned HTTP 200 for the public Whisper speech fixture. Temporary credential-bearing curl files were deleted.
- The live WAV uses streaming length placeholders. Normalize RIFF/data sizes before returning audio so native players see the actual duration; verification is pending.

## Checkpoint 7 — provider, privacy, and speech verification

- Typecheck, lint, and 25 tests passed after connecting real adapters and speech preferences. Added meaningful coverage for API validation, sanitized provider errors, exact/ambiguous Qloo resolution, real response variants, measured affinity, demographic-tag exclusion, coordinate removal, evidence signatures, Groq native tools/transcription, TTS direction budgets, replay reuse, and cancelled/background speech.
- Fixed streaming WAV length placeholders after a live sample reported 0xffffffff in RIFF/data headers. Parse WAV chunks (including metadata before `data`) and replace lengths with actual byte counts; live sample is 6.96 seconds of mono 24 kHz audio.
- Added further exploration tests for provenance retention, locality-only follow-ups, named-reference clarification, changed localities, and scenes without distinctive references. Final execution and native/server export are next.
- Test cases for missing configuration now isolate environment keys explicitly; no live account/key is required for `npm test`.

## Checkpoint 8 — integrated scene, speech, and final exports

- Final `npm run check` passed: TypeScript, ESLint, and 29 tests.
- Final server export passed with all seven API routes; final iOS and Android Hermes bundle exports passed after microphone lifecycle changes.
- Exercised the actual scene-analyze route, provider adapters, bounded tool orchestration, and evidence signing against captured live responses. All needed Qloo search/entity/affinity/recommendation and Groq reasoning requests returned HTTP 200. A synthetic author/book poster produced two visual matches, six retained facts/entities after reference exploration, five relationships, and an evidence-backed signed explanation. Related Qloo recommendations retained separate provenance.
- Because sandbox Node networking cannot reach provider hosts, the smoke runner recorded each real adapter request, standalone approved curl fetched the live response, and the runner replayed those exact responses until the full route completed. This is an adapter/route integration check, not a deployed-server or device test. Existing responses were reused to avoid unnecessary API calls.
- Exercised the speech route using the successful live Orpheus WAV: HTTP 200, `audio/wav`, no-store, normalized duration 6.96 seconds. Live JSON vision, native tool calling, public-audio Whisper transcription, and `[warm]` Orpheus synthesis all passed.
- Tightened microphone lifecycle: cancelled/background/unmounted recording work and late transcription responses cannot populate a changed/cleared session; failed recording setup restores playback audio mode.
- Scanned exported client/native artifacts for the configured key values: zero matches. `.env.local` is gitignored. No key values were printed, changed, or committed. Temporary credential-bearing curl configs were deleted.

## Next session

1. Implement FR-14: accessible skippable interest onboarding and review/edit/delete; explicit personalization control; Qloo resolution with ambiguity handling; session-only profile state; authenticated taste evidence in API requests; bounded affinity investigation; taste-aware prioritization, familiar explanations, and familiar-or-new guided exploration. Inspect the local Qloo kit first. Do not guess unsupported sports/director/category mappings or API parameters.
2. Add meaningful checks for disabled/skipped/deleted profiles, profile changes invalidating derived evidence, no supported overlap, weak/ambiguous matches, explicit-question/cultural-significance priority, and distinguishing profile interests from visible references. Re-run checks/exports after implementation; keep documenting substantial changes here.
3. Run `npm start` and validate the native experience on iOS/Android: permission denial, photo/camera capture, locality-name fallback, microphone recording, selected voice/directions, stop/replay, session clear, foreground lifecycle, dynamic text sizing, taste controls, and VoiceOver/TalkBack.
4. Native device behavior remains unverified; bundle exports are not APK/IPA builds. No cloud deployment, EAS project setup, release build, commit, or GitHub push was performed.
5. When preparing a release, configure server-side Qloo/Groq keys on EAS Hosting and set `EXPO_PUBLIC_API_URL` to the HTTPS API origin before native builds. Optionally set a stable `SESSION_SIGNING_KEY`; key rotation invalidates existing signed context.
6. Keep README as a finished-product description and use this file for actual development status. Continue checking the local Qloo kit before any Qloo web search.

- Final repository/client credential scan checked 127 files and found zero configured-key matches; `git diff --check` passed.
- An additional Expo Doctor attempt could not complete in this sandbox: npm registry DNS was unavailable, and the cached doctor's child `npx expo config --json --full` returned no parseable output. Do not report a new doctor pass for this session. The earlier scaffold doctor result was 21/21; current TypeScript, lint, 29 tests, and all bundle exports passed independently.

## Checkpoint 9 — Personal Taste approved as required MVP scope

- Read FR.md before editing. Added FR-14 — Personal Taste Profile as a required capability with optional user participation, short skippable onboarding, Qloo resolution, review/edit/delete, and an explicit personalization control.
- Updated all five modes, FR-07/08/09/12/13, Qloo/LLM roles, accessibility, privacy, failure cases, both primary flows, MVP scope, and the product principle. Removed preference profiles from the optional future-feature list.
- Required uses: taste-aware attention, supported familiar explanations, cultural-overlap orientation, and guided exploration offering familiar interests or discovery. No new mode or recommendation feed is required.
- Explicit guardrails: necessary available environmental information and the question outrank taste; uncertain detections stay uncertain; no match does not prove dislike or unfamiliarity; no sensitive/behavioral inference; no silent profiling. Default retention remains session memory, with explicit opt-in required for cross-session storage.
- README and tech_stack.md reflect the product scope. README still describes the intended finished product, without development status.
- This checkpoint changes requirements/documentation only. Application implementation of FR-14 is pending and is now the first next-session task; prior implementation checks do not cover it.
- Documentation validation passed: FR-01–FR-14 numbering, exactly five modes, required taste scope, balanced code fences, and `git diff --check`. No application tests were needed for this documentation-only change.

## Checkpoint 10 — taste resolution and evidence pipeline

- Applied explicit microphone-start, matched/clarify/no-match, leave-unmatched-out, optional profile, stable detections, exploration-choice, and Qloo-only familiar-link rules from the user's latest instructions.
- Added bounded Groq interest extraction that accepts only names actually stated in the onboarding text. Qloo resolves those candidates; a signed draft separates candidates from user-confirmed profile entities.
- Added taste resolve/confirm/context API routes and stateless signatures for drafts, profiles, and taste evidence. Confirmation rejects unresolved or fabricated selections.
- Qloo taste checks use separately named interest signals and filtered existing references, capped at six insight queries per request. Exact Qloo entity matches require no extra affinity request. Partial coverage is communicated rather than interpreted as unfamiliarity.
- Taste evidence is separate from scene evidence. Agentic exploration can retrieve taste connections; prompts require supplied Qloo evidence and prohibit invented familiar analogies or personal-trait inference.
- Next: connect optional spoken onboarding/review, stable scene highlighting/order, personalization and exploration controls, and tests. This checkpoint has not yet passed final checks.

## Checkpoint 11 — optional spoken onboarding and visible personalization

- Added an optional cultural-interests screen with spoken guidance, explicit Start speaking, transcription→candidate extraction→Qloo resolution, review cards showing Matched / Needs clarification / No match, and explicit profile confirmation.
- Users can leave any item out and continue; unresolved items never block saving confirmed interests. Profiles can be edited/replaced, deleted, skipped, or disabled. No microphone starts automatically.
- Added personalization and familiar/discover exploration controls to scene, conversation, locality, and settings. Profile/settings changes invalidate derived taste context and conversation history while preserving the scene object and detections.
- Separate taste-evidence requests drive visible scene labels and ordering. The client sorts a copied view; necessary information, explicit questions, confidence and cultural-significance buckets take priority over taste. Uncertain matches cannot be promoted by taste.
- Taste evidence queries are memory-only with immediate cache cleanup and session-generation guards. Requests send profiles only while personalization is enabled. Generic scene summaries remain available independently of personal follow-up explanations.
- Next: run and fix checks, add meaningful taste/agent/store tests, verify real bounded affinity/extraction shapes, update requirements with final interaction rules, and export bundles. Native-device verification remains outstanding.

## Checkpoint 12 — evidence checks and unchanged detections

- Added taste-specific tests for extraction provenance, three resolution states, excluding unresolved items, authenticated confirmation, stable detections, ordering priority, weak-match highlighting, profile binding, bounded Qloo queries, exact matches, fallback behavior, cached follow-ups, and locality provenance.
- Refined toggles to preserve visible conversation history as well as detections. Prior personalized messages carry a profile signature and are excluded from subsequent requests when personalization is disabled or the profile changes; deleting a profile removes its derived messages.
- Familiar/discover controls directly start exploration in the conversation screen, while also remaining selectable strategies elsewhere.
- Structured familiar explanations now carry the Qloo reference/interest pairs used. The server rejects invented pairs or citations while personalization is disabled, and the prompt prohibits unsupported structural analogies.
- Baseline checks passed before these refinements. Final expanded checks/live taste checks and bundle exports are pending.
