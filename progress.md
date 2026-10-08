# Context — implementation handoff

Last updated: 2026-10-08. Update this file after each substantial implementation and verification; never include credentials or precise user location.

## Product and constraints

- Follow `FR.md` and `tech_stack.md`: one Expo iOS/Android app with Expo Router API routes on EAS Hosting.
- One assistant: capture/choose → scene understanding → reference, connection, guided and area follow-ups in one conversation. No pre-capture mode menu. Location context and multi-step exploration remain required MVP capabilities.
- FR-14 adds a required MVP Personal Taste layer across the conversation. Users may skip onboarding or disable personalization; no separate personalized experience or recommendation feed is required.
- Foreground location permission is optional for the user. Derive locality, drop precise coordinates, and support an area-name fallback.
- Images, locality, and scene conversation are ephemeral. No background tracking or permanent image storage by default.
- Qloo provides cultural evidence. Server-configurable OpenAI-compatible models provide vision, reasoning/tool calling and interest extraction. Current analysis configuration selects Alibaba Qwen3.8-Flash; transcription and Orpheus speech retain Groq defaults with independent optional audio overrides. Never fabricate cultural affinities or personal characteristics.
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
- Generic analysis settings are now configured as `LLM_API_KEY`, `LLM_API_URL`, and `LLM_MODEL=qwen3.8-flash`. Both reasoning and vision use these settings unless `VISION_*` overrides them. Legacy `vision_model` and `GROQ_LLM_MODEL` remain fallback-only when generic analysis settings are empty.
- Keep backward compatibility for lowercase `vision_model`; document preferred `GROQ_VISION_MODEL`.
- Provider credentials belong only in server modules. Never print upstream bodies or environment values containing keys.

## Implemented in this session

1. Inspected the user-provided Qloo hackathon kit and verified actual API shapes.
2. Implemented shared server transport/configuration and Groq vision, native tool calling, transcription, and Orpheus speech.
3. Implemented Qloo resolution, evidence-backed cross-domain affinities, reference and locality lookups.
4. Connected providers to API routes, retained exploration context, authenticated evidence, and added honest failure handling.
5. Connected accessible mobile interactions, permission fallbacks, voice/style selection, spoken output, and cancellation.
6. Passed 29 tests, live provider checks, an integrated route smoke check, and native/server bundle exports. Device testing remains outstanding.
7. Implemented the FR-14 capability pipeline: optional explicit voice onboarding, Qloo resolution and confirmation, separate signed taste evidence, stable detected-reference presentation, and familiar/discover exploration controls. The earlier audit defects were addressed in checkpoints 15–20. All 14 numbered requirements have their main code paths present; full acceptance remains incomplete as described in checkpoint 25 and the current acceptance gaps in FR-audit.md. Model/provider flexibility is implemented in checkpoints 22–24. Latest regression suite: 63 tests.

## Outstanding issues / handoff warnings

- Read the current acceptance gaps in `FR-audit.md` and checkpoint 25 before further implementation. The four earlier reproduced audit defects have regression coverage: raw model prose is not emitted, taste evidence refreshes inside the investigation loop, all returned cultural detections survive the bounded shortlist, and reasoning receives pertinent supported taste anchors. Remaining work includes optional locality-failure degradation, a mode-specific guided opening, richer supported familiarity bridging, and scene/area explanation depth; device/release verification remains separate.
- Spoken notices/review, derived initial personalized speech, active-question ranking, necessary environmental observations, candidate clarification, and camera/picker/locality cancellation are implemented. Native accessibility and lifecycle behavior still require device testing; bundle exports alone cannot verify them.
- Personal Taste is implemented in session memory. Interests must be confirmed after Qloo resolution; profiles and derived evidence are independently authenticated. Persisted profiles are not implemented, and no persistence occurs by default.
- Familiar explanations use selected, validated current Qloo evidence and server-rendered qualified sentences. Unrestricted model prose cannot supply an analogy. Provider descriptions and visual identifications can still be wrong; review actual spoken output during device testing. Earlier Groq finish-plan retries hit token rate limits; current Alibaba validation results are recorded in checkpoint 24. Groq fallback live verification remains distinct from current-provider verification.
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

1. Read FR.md, the current acceptance gaps in FR-audit.md, and checkpoints 27–30 before continuing. Cultural Interests now uses one voice-first conversation; do not restore the former manual setup form or review cards. Unified assistant architecture, locality degradation, guided opening/next choices and scoped scene-area shared tags are implemented; do not rebuild those. Full FR acceptance remains incomplete: prioritize richer supported familiarity comparisons and native interaction validation. Check the local Qloo kit before searching Qloo documentation. Do not guess unsupported sports/director/category mappings or API parameters.
2. Review checkpoint 24 for current-provider live results. When selecting another provider/model, verify JSON extraction, image input, validated function calls, and the bounded multi-step workflow. Use existing captured Qloo responses where applicable to avoid unnecessary calls. Groq analysis fallback had token-rate-limit failures and remains separately unverified live under the latest format.
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
- Added personalization and familiar/discover exploration controls to scene, conversation, locality, and settings. Profile/settings changes invalidate derived taste context while preserving the scene object and detections. Checkpoint 12 refines how earlier personalized messages are retained and filtered.
- Separate taste-evidence requests drive visible scene labels and ordering. The client sorts a copied view; necessary information, explicit questions, confidence and cultural-significance buckets take priority over taste. Uncertain matches cannot be promoted by taste.
- Taste evidence queries are memory-only with immediate cache cleanup and session-generation guards. Requests send profiles only while personalization is enabled. Generic scene summaries remain available independently of personal follow-up explanations.
- Next: run and fix checks, add meaningful taste/agent/store tests, verify real bounded affinity/extraction shapes, update requirements with final interaction rules, and export bundles. Native-device verification remains outstanding.

## Checkpoint 12 — evidence checks and unchanged detections

- Added taste-specific tests for extraction provenance, three resolution states, excluding unresolved items, authenticated confirmation, stable detections, ordering priority, weak-match highlighting, profile binding, bounded Qloo queries, exact matches, fallback behavior, cached follow-ups, and locality provenance.
- Refined toggles to preserve visible conversation history as well as detections. Prior personalized messages carry a profile signature and are excluded from subsequent requests when personalization is disabled or the profile changes; deleting a profile removes its derived messages.
- Familiar/discover controls directly start exploration in the conversation screen, while also remaining selectable strategies elsewhere.
- Structured familiar explanations now carry the Qloo reference/interest pairs used. The server rejects invented pairs or citations while personalization is disabled, and the prompt prohibits unsupported structural analogies.
- Baseline checks passed before these refinements. Final expanded checks/live taste checks and bundle exports are pending.

## Checkpoint 13 — taste verification and locality freshness

- TypeScript, ESLint, and all 43 tests passed. Added a regression case ensuring that changing area excludes previous locality taste targets while keeping detected scene references intact. Scene highlighting also requires a confirmed identification.
- Server export passed with ten API routes, including taste resolve/confirm/context. iOS and Android Hermes bundle exports passed with the taste screen and controls. These are bundle checks; native recording, accessibility, and playback still need device testing.
- Exercised the real taste resolution, confirmation, context, and personalized ask routes using live Groq requests and previously captured genuine Qloo responses. A stated author resolved to one signed profile entity; separate signed taste context returned an exact match and a limited 0.4915 author/book affinity. The limited affinity is not highlighted as a strong interest connection.
- The first live personalized answer cited valid pairs but overstated the affinity as a direct relationship. Tightened grounding instructions: affinity alone cannot establish authorship, collaboration, influence, or stylistic analogy; weak evidence must be identified as limited, and exact matches take precedence among otherwise equal familiar references. The retry returned HTTP 429 (`rate_limit_exceeded`, tokens), so the revised wording still requires a live recheck when quota permits. Do not claim semantic grounding is guaranteed by pair validation.
- No new Qloo lookup was required for this smoke check; cached public Qloo responses matched the adapter's exact requests. Standalone curl captured Groq HTTP-200 responses and the actual route runner replayed them, because sandbox Node networking is unavailable. This is not a deployed or device end-to-end test.
- Updated README with explicit Start speaking, three review states, leave-unresolved-out, and unchanged detections on toggles; it remains a finished-product description without development status. Updated the handoff's next steps to reflect completed FR-14 implementation.
- Credential scan checked 141 repository/client/native files with zero configured-key matches. `.env.local` remains ignored and unchanged. Temporary credential-bearing curl configs are removed after use.
- Final checks after the grounding refinement passed: TypeScript, lint, 43 tests, and the server export. Native bundles passed immediately before this server-only prompt change; no client code changed afterward. `git diff --check` passed. All credential-bearing configs for this check were deleted; the rate-limit response was removed from the replay cache.
- Next: validate optional voice onboarding, review/skip states, personalization ordering/highlights, familiar/discover controls, cancellation, and VoiceOver/TalkBack on a device. Recheck real explanation wording under the revised prompt when Groq token quota permits, then perform deployment/release work only when requested.

## Checkpoint 14 — independent FR acceptance audit

- User requested a diligent verification of implemented FR scope. Read the full requirements and inspected screens, controls, provider/evidence code, schemas, state, lifecycle, configuration, and tests. Created `FR-audit.md` with all FR-01–FR-14 statuses, detailed FR-14 criteria, five modes, accessibility/safety/privacy/failure coverage, and prioritized completion work.
- Result: main implementation present for 9 numbered requirements; partial for FR-07, FR-09, FR-10, FR-12, FR-14. None is wholly absent. This is an implementation coverage count, not a production-readiness or effort percentage.
- Ran `npm run check` again: typecheck, lint, and all 43 tests passed. Ran four additional isolated probes using synthetic providers: empty-citation unsupported prose was accepted; entity replacement left an obsolete taste pair usable; 10 meaningful detections became 8 without a warning; all 10 enabled interests were sent to reasoning for a single-reference question. These probes reproduced gaps rather than verifying compliance. Runner: `/tmp/context-fr-audit-probes.ts`, not part of the persistent suite.
- Reviewed existing successful server/native bundle exports and prior live-route evidence. No new account/provider requests or web search were made. No runtime code, README, credentials, FR wording, deployment, native binary, or git history was changed during this audit.
- Updated the handoff to qualify prior implementation claims. Native permissions, recording/playback, accessibility, large text, and deployed end-to-end flows remain unverified. Production API-origin configuration is still absent from `.env.local` (presence checked without exposing values).

## Checkpoint 15 — context freshness and grounded explanations

- Saved the sequential authorized work plan in `implementation-plan.md`. Implementation has no external blocker; native/device validation and live provider quota remain separate verification limits.
- Taste target IDs/profile binding are rechecked before every agent turn. Entity/locality changes invalidate obsolete taste context and permit a fresh bounded lookup; old pairs cannot pass final validation.
- The agent now selects validated Qloo facts, relationship types, tags, locality, and taste pairs. The server renders the spoken explanation from provider evidence and qualified templates. Untrusted model prose is never emitted, including when citations are empty. Weak affinities remain explicitly limited and cannot become authorship, collaboration, or stylistic analogy.
- Reasoning receives at most three supported taste anchors relevant to explicitly requested references; unconnected profile entities and signatures are not sent to Groq. Full optional profiles stay available server-side for bounded Qloo investigation.
- Added regressions for the empty-citation bypass, weak-bridge wording, unknown evidence selections, in-loop replacement, and pertinent-anchor selection. TypeScript, lint and 47 tests passed before starting the reference-preservation changes.
- Tradeoff: cultural explanations use source-backed sentences instead of unrestricted model-generated analogy. Qloo descriptions and detection correctness still depend on provider evidence; native/live behavior remains to be checked.

## Checkpoint 16 — retained references and question-aware prioritization

- Initial vision accepts up to 30 public cultural detections with optional visible position. All returned culturally relevant detections remain in the scene, including uncertain ones; only up to eight identifiable references enter initial Qloo resolution. Coverage warnings explain that other references can be investigated on demand.
- The user's scene question now reaches initial analysis and selects the bounded resolution shortlist before confidence. Scene rows use the active question and show explicit pending/uncertain states, positions when supplied, and Explore actions that seed a reference follow-up.
- Ranking uses explicit question and necessary-information inputs, confirmation/confidence bands, measured relationship strength, category distinctiveness, then taste. It sorts a copy; taste cannot confirm a detection or hide other rows. No navigation or new safety-detection capability was added.
- Added regression checks for retaining 12 detections, querying only eight, question-based shortlist selection, coverage notices, uncertainty, and cultural evidence outranking taste. TypeScript, lint and 49 tests passed before beginning spoken-notice work.

## Checkpoint 17 — spoken feedback and accessible controls

- Errors, uncertainty notices, provider/coverage warnings and no-overlap feedback now provide Hear message, replay and stop controls. Failed TTS is shown as a terminal text/screen-reader notice without recursively requesting speech for its own failure.
- Interest resolution review has a spoken summary/replay for matched, clarification and no-match states. Microphone status notices never trigger app speech while recording; a shared ownership lock prevents speech from switching audio mode during another microphone interaction.
- Shared text inputs display explicit focus styling. Existing labels, roles, live regions, touch targets, non-color status text, scalable text and primary response auto-speech remain in place. Actual hardware keyboard and VoiceOver/TalkBack behavior still need device validation.
- TypeScript, lint and 49 tests passed with the spoken controls and initial presentation integration before adding the expanded profile/lifecycle regression tests.

## Checkpoint 18 — initial spoken personalization and clarification

- Added a separate derived spoken scene presentation using confirmed references and returned Qloo taste connections. It includes a familiar/discover choice and honest no-overlap limits. Turning personalization off restores the unchanged generic summary; detection IDs and signed scene summary are never rewritten by a toggle.
- Initial personalized speech waits for taste context, then speaks the derived view; a taste-request failure restores ordinary summary speech. Scene/locality familiar/discover controls now initiate actual exploration through a shared mutation and continue into conversation.
- Ambiguous onboarding interests provide explicit Qloo candidate buttons. Profile confirmation authenticates the draft and accepts only a selected candidate ID under the matching original label; fabricated selections remain rejected and unresolved interests may still be omitted.
- Expanded onboarding explains Qloo resolution/affinity use, relevant Groq explanation use, session retention and disable/delete choices. Explanation requests send only supported pertinent anchors rather than the full enabled profile.
- Added tests for selected candidate confirmation, tampered candidates and derived spoken view/toggle invariance. Combined with lifecycle tests below, typecheck, lint and 53 tests passed before final lifecycle refinements.

## Checkpoint 19 — foreground lifecycle and locality follow-ups

- Added cancellable foreground task tickets bound to session generation, screen focus and active state. Camera/picker/preparation, reverse geocoding, scene/locality answer requests and shared exploration discard late results after navigation, backgrounding or session changes.
- Native photo selection may legitimately suspend the home screen in system UI; applying its result still requires the current foreground session. Permission-dialog inactivity is distinguished from actual backgrounding for location/microphone operations.
- Microphone work stops on blur as well as unmount/background/session change. Ownership-aware, serialized audio-mode restoration cannot release another screen's microphone lock. Recording remains explicitly started.
- Added Speak an area name and request reuse of signed locality evidence/conversation for repeated location questions; changed localities invalidate cached evidence. The active/last question is retained for later scene prioritization.
- Added pure regressions for cancelled/replaced/background/cleared task results and microphone ownership. Current total: 53 passing tests before final cleanup; full checks and bundle verification are next. Native permission/picker/recording behavior remains unverified on a device.

## Checkpoint 20 — completion review and final verification

- Completed the sequential plan in `implementation-plan.md` and updated the current review in `FR-audit.md`. All 14 numbered requirements have their main code paths present. This is code implementation coverage, not device-verified compliance or release readiness; the historical audit remains preserved.
- Retained up to five basic non-cultural environmental observations separately from cultural references. Necessary, sufficiently confident observations precede cultural/taste explanations, and an agent can select only observations actually returned by vision. Generic observations are never sent to Qloo; no navigation or hazard-assessment subsystem was introduced.
- Related Qloo retrieval cannot evict the retained visible references, even with a full 30-reference scene. Added regressions for this and for necessary-observation priority, unsupported observations, and uncertain identification. Default explanations cap selected evidence and shorten long provider descriptions; explicit requests for more detail permit fuller evidence.
- Scoped spoken notices to the focused screen and cancel owned playback on blur/unmount/text replacement. Playback installs a foreground listener on first use, including notice-only screens. Final interest-review speech reflects selected clarification candidates and omitted items, matching the visible review. Late cancelled operation cleanup cannot reset a newer operation's pending state.
- Final `npm run check` passed: TypeScript, ESLint, and all 55 tests. Final server export passed with ten API routes; final iOS and Android Hermes bundle exports passed. `git diff --check` passed.
- Credential scan checked 180 repository/server/client/native-export files with zero configured-key matches. `.env.local` is ignored, untracked, and unchanged; generated exports are ignored. No temporary provider credential configurations remain. README remains a finished-product description; no deployment, native binary build, commit, or push was performed.
- A live inference retry of the new evidence-selection finish tool returned HTTP 429 (`rate_limit_exceeded`, tokens). The final tool uses a simple object schema with server-side per-kind validation; live compatibility must still be checked when quota permits. Cached genuine Qloo responses were reused, with no new Qloo requests or web search. Device permissions, capture/picker, recording/playback, keyboard/large text, VoiceOver/TalkBack, and production HTTPS API-origin configuration remain outstanding validation/release work.

## Checkpoint 21 — Alibaba environment verification

- User added `LLM_API_KEY`, `LLM_API_URL`, and `LLM_MODEL=qwen3.8-flash` to `.env.local`. Verified configured values without displaying credentials; the endpoint is HTTPS and targets the Alibaba Singapore workspace. `.env.local` remains ignored and unchanged by the agent.
- One small live chat-completions check returned HTTP 200 and a valid forced `finishResponse` tool call with low confidence and an empty evidence-selection list. Alibaba reported 356 prompt tokens and 33 completion tokens (389 total). Temporary credential-bearing curl configuration and request/response files were removed.
- This validates authentication, model access, and the basic tool-call format; it is not image analysis or a full application/agent integration test. Current application configuration still reads Groq variables and does not consume the new `LLM_*` settings. Provider wiring, Alibaba request-parameter normalization, tests, and provider disclosures must be updated to route vision/reasoning/interest extraction to Alibaba while retaining Groq Whisper/Orpheus.

## Checkpoint 22 — configurable model/provider selection

- User requested future provider/model swaps through environment settings. Added a shared OpenAI-compatible Chat Completions adapter and provider-neutral vision/reasoning/interest extraction. `LLM_API_KEY`, `LLM_API_URL`, and `LLM_MODEL` now take precedence; `VISION_*` supports model-only or independent provider overrides. No model allowlist; image input and native tool calling remain required capabilities.
- Separate endpoints require their own explicitly configured credentials. Incomplete generic settings fail honestly instead of silently borrowing legacy Groq keys. Optional token-parameter, JSON-mode, provider-label and request-options settings accommodate dialect differences without allowing options to replace messages/tools/evidence validation. Alibaba defaults to non-thinking requests; no Qwen model name is hardcoded in the generic path.
- Actual analysis and taste-resolution routes now consume generic settings. Legacy Groq imports/configuration remain compatible; Qloo grounding and the bounded agent workflow are unchanged. Signing supports LLM-only configuration, while a stable independent `SESSION_SIGNING_KEY` avoids expiry during API-key changes. Health reports configuration readiness and safe provider labels, never endpoints or keys.
- Added regression coverage for arbitrary future models, provider swaps, independent vision credentials, parameter normalization, actual factory routing, interest provenance, tool validation, and signing/health without Groq. TypeScript, lint and 61 tests passed before adding the audio/disclosure refinements. Live adapter checks and final bundles are pending.
- Added independent `TRANSCRIPTION_*`/`TTS_*` endpoint/key/model overrides while preserving current Groq audio defaults. Shared audio adapters retain validated transcription and WAV normalization; other speech models must support the selected voices/directions. Onboarding/settings obtain safe provider labels from health instead of naming Groq for every task. These refinements and documentation have not yet completed final validation.

## Checkpoint 23 — adapter validation and investigation availability

- The shared adapters and independent audio/disclosure refinements passed TypeScript, lint and 62 tests. Server and both native bundle exports passed. Live Alibaba vision identified the fixture's book title and author; extraction retained the two explicitly stated interests. No new Qloo requests were made.
- The first real follow-up requested the same `exploreReference` twice despite supplied completed-actions instructions. Server duplicate protection correctly rejected it. Made tool availability depend on completed actions: completed reference IDs are excluded from the tool's ID enum, one-shot completed investigations are removed, and locality tools require available locality. Other references and entity clarification remain available; server validation and step limits stay authoritative. No model-specific workflow branches were added.
- Added a regression for tool-menu freshness. Final TypeScript, lint and 63 tests passed. Live follow-up recheck and final exports/credential scan are pending checkpoint 24; do not mistake the initial repeated-call failure for a successful integrated answer.

## Checkpoint 24 — flexible providers verified

- Current `.env.local` now drives actual vision/reasoning/interest extraction through Alibaba Qwen3.8-Flash; Groq Whisper and Orpheus remain the independent audio defaults. The local environment file was never edited. Future compatible models/providers are selected through API root, key and model settings; `.env.example` and README document shared and per-role overrides, dialect options, required capabilities and restart/redeploy behavior.
- Tool-menu exclusion alone did not stop the live model repeating the completed author lookup. Added native assistant tool-call/tool-result messages for completed investigations, backed by current validated evidence. Taste tool-result context uses the same pertinent-anchor selection as the main reasoning input. Regression coverage verifies matching tool-call IDs and completed result context; server duplicate/step-limit checks remain active.
- Live checks of the real configurable adapters passed: image fixture yielded Agatha Christie and Murder on the Orient Express; interest extraction yielded only the stated Radiohead and Interstellar; the follow-up requested one `exploreReference`, then produced a valid `finishResponse` plan and a 362-character server-grounded explanation. Captured genuine Qloo evidence was reused with zero new Qloo requests. Sandbox Node DNS required standalone curl followed by exact-response replay; this is an adapter/orchestration check, not a deployed/device test.
- Seven Alibaba requests reported 19,316 total tokens, including the two repeated-investigation attempts and retry. The successful final path accounts for 8,901 of those tokens. No fresh audio provider call was needed; audio adapters/default behavior retain existing verification and regression coverage. Groq fallback analysis live validation remains separately pending its quota availability.
- Final TypeScript, lint and all 63 tests passed. Final server export passed with ten API routes. iOS and Android Hermes bundle exports passed with the final client/disclosure changes; only server reasoning/tool-history code changed afterward. `git diff --check` passed. Native device permissions, VoiceOver/TalkBack, recording/playback and production deployment remain outstanding.
- Scanned 187 repository/server/client/native-export files with zero configured-key matches, including the new Alibaba key. Temporary credential configurations and captured request files were deleted; public fixture response caches remain available for future no-credit regression work. `.env.local` and generated exports remain ignored. No deployment, native binary build, commit or push was performed. README still describes the finished product without development-status text.

## Checkpoint 25 — full acceptance re-review

- User asked whether the app meets the FR and what is missing. Re-read the full FR, current mode flows, orchestration, grounded renderer, taste evidence/selection, provider setup and prior verification. Updated `FR-audit.md` with a prominent current acceptance-gap section, qualifying the earlier main-code-path coverage statement rather than treating it as full compliance. FR wording and runtime implementation were not changed.
- Confirmed remaining implementation/acceptance work: optional locality-provider failure can abort otherwise viable scene analysis; guided mode does not enforce the strongest-supported-theme opening/next-reference invitation; familiarity bridging supplies facts and exact/qualified affinities but lacks richer comparisons backed by retrieved anchor metadata. Scene/area scoped shared-theme interpretation is basic and needs demonstration. Preserve grounding while improving these behaviors; do not reintroduce unrestricted analogy generation.
- Ran three synthetic diagnostic probes in `/tmp/context-current-fr-probes.ts`. All reproduced the documented limits without provider calls or credits: locality error rejected analysis despite available scene evidence; guided output with an available theme was only a fact sentence; strong taste-affinity output provided no comparative anchor explanation. These are diagnostic confirmations, not acceptance tests that establish compliance.
- Fresh `npm run check` passed: TypeScript, ESLint and all 63 existing tests. The suite does not yet cover the newly identified gaps. Existing server/native exports and live Alibaba checks remain valid previous evidence; no new exports, live calls or device tests were performed during this review.
- Outstanding native validation: VoiceOver/TalkBack, keyboard/focus, large text, permission denial, camera/picker, recording/playback and cancellation. Production API-origin/secrets, native builds and deployed end-to-end testing are still outstanding. Optional continuous camera/video/media description/scene history and opt-in profile persistence are not missing mandatory MVP requirements. Updated next-session priorities; README remains the finished-product description.

## Checkpoint 26 — web preview startup attempt

- User requested seeing the UI through a web app server. The project supports an Expo web preview through `npm run web`, with server API routes configured. Attempted localhost port 8081 startup, but this execution sandbox prohibits socket creation/binding; the localhost request could not connect. Stopped the incomplete startup process.
- Attempted the previously approved npm web command outside the sandbox. The execution policy rejected escalated permissions because sandbox approval is disabled. No preview server is running from this attempt; do not report localhost as verified/reachable.
- User-terminal command: `npm run web -- --host localhost --port 8081` from the project directory, then open `http://localhost:8081`. Browser UI inspection does not replace native camera/audio/accessibility acceptance testing. No application code, credentials, deployments or provider calls changed during this attempt.


## Checkpoint 27 — unified assistant interaction architecture

- Applied the user's revised product model while keeping the cream background, dark type and large controls. Home now leads with capture/photo selection, compact Personalized context and Location context preferences, Ask Context, and settings; removed the five pre-capture mode choices and mode state. Capturing/choosing explicitly disclosed analysis now starts it automatically on the scene screen. Voice input remains an explicit Start speaking action.
- Results show summary/replay, notable references with direct Explore actions, and connection/guided/area prompts. These and familiar/discover choices use the same conversation and retained evidence. Ask Context also accepts named-reference questions before capture, retaining resolved references as user-named evidence rather than visual detections. Area entry is a supporting utility, not a separate exploration experience.
- Added explicit foreground-location opt-in and permission-free automatic refresh of already permitted location before requests. Only coarse locality reaches state/server. Denial, revocation, unavailable device location and locality-provider failures degrade to scene exploration with warnings. Changed/disabled areas retain visible conversation and detections but exclude stale area answers/evidence from subsequent requests, including nested signed scene locality and taste targets.
- Guided questions now open with the strongest shared tag supported by confirmed-reference records (or qualify insufficient evidence) and offer a next reference. Scene-area questions can explain shared tags between scene records and sampled local-place records, explicitly limiting claims to those records. Richer familiar-anchor comparisons remain separate acceptance work.
- Updated FR.md, README and tech_stack.md to express capabilities within one assistant. README remains a finished-product description. Initial TypeScript, lint and all 72 tests pass, including nine new regressions for permission behavior, cancellation, location-layer changes/failure, standalone provenance, guided opening and scoped scene-area evidence. Final UI/source review and exports are pending; no live provider calls or web search were needed.


## Checkpoint 28 — unified assistant verified and handed off

- Final source review distinguishes image-origin scenes from conversation-origin reference context. User-named references remain available for later turns even when an area preference is enabled; that preference does not force irrelevant Qloo locality investigation. Legacy API intent hints remain for compatibility, with no corresponding top-level UI modes or user mode state.
- Guided responses offer familiar/new exploration when strong, current profile evidence supports it, and named next-reference choices otherwise. Cited profile pairs remain bounded and validated. The default question-recording button now explicitly says Start speaking, matching onboarding and the home disclosure; no automatic microphone start was added.
- Final npm run check passed: TypeScript, ESLint and all 74 tests. Final Expo web/server export passed with nine static pages and ten API routes. Final iOS/Android Hermes exports passed. These are bundle exports, not native binary builds or device acceptance.
- Reviewed rendered export HTML: capture/photo actions lead home, personalization/location controls and Ask Context follow in order, the pre-capture mode menu is absent, conversation has explicit Start speaking with no capture/area prerequisite barrier, and the area utility has no self-link. This checks rendered structure, not interactive browser or screen-reader behavior. The sandbox preview-server restriction from checkpoint 26 remains; no local server was started in this change.
- FR.md, tech_stack.md, README.md and the current FR-audit.md section now agree on one assistant and conversational capabilities. Updated the next-session task list so completed locality/guided/shared-tag work is not repeated. README remains a finished-product description without development status.
- Credential scan of 194 source/export files found zero configured-key matches. Environment settings were not edited; no Qloo, Alibaba, Groq or web-search calls were made for this change. No deployment, native binary build, commit or push was performed. git diff --check passed.
- Remaining acceptance work: richer evidence-backed explanations through familiar anchors (retrieve useful anchor metadata rather than inventing analogies), diverse real-scene evaluation, VoiceOver/TalkBack/large text/keyboard/permission/camera/audio/lifecycle testing, and release API-origin/secrets/build/deployment setup. Validate the new automatic analysis and unified conversation flow on devices before claiming complete FR acceptance.


## Checkpoint 29 — single voice-first cultural-interest flow implemented

- User replaced manual interest review with one voice-first Cultural Interests page and clarified that the orb appears on Start conversation and disappears on End/completion. Removed forms, text inputs, chips, review cards, matching/developer explanations, step indicators and extra actions. Kept the existing cream/dark styling, two explicit buttons, live accessible status and a central native animated orb; reduced-motion settings disable continuous motion and meter-driven animation.
- Added a cancellable single-response conversation workflow using existing Expo Audio, speech playback/Orpheus and Groq Whisper routes. The entire prompt finishes before the microphone starts. End during the prompt cancels without recording; End during listening hides the orb immediately and submits one response. Natural native silence transitions through processing/completion, then removes the orb. Recording ownership, background/navigation/session cancellation, temporary audio disposal, parent request cancellation and guarded save prevent late results reviving a cancelled profile.
- Existing taste resolve API accepts categorized extraction through the configured reasoning provider, with all eight requested arrays and multiple interests per category. Stated-name validation and duplicate removal remain; names inferred by the model are excluded. Expanded the old ten-interest boundary to 100 names for a bounded response, preserving Qloo's batches of eight and existing six-query affinity budget. Unique Qloo matches are automatically confirmed through the existing signed confirmation route; ambiguous/unmatched items never become verified entities. Qloo failure preserves grouped local interests without forcing review.
- Save grouped interests and the optional verified profile atomically in the existing Zustand session store. There is no new disk storage or cross-session retention; clear/forget removes both. Updates replace the voluntary profile. Added Forget my cultural interests in settings and relocated provider/privacy explanation there, keeping the Cultural Interests page clean.
- SpeechSequence now reports completion so recording cannot overlap the spoken prompt. Response-control cleanup stops only its own utterance, avoiding an inactive scene interrupting interest-completion speech. Initial typecheck passed; first expanded check found test-typing errors and animated-ref lint errors, which were corrected. Final regressions/exports and device acceptance are pending. No live provider calls, Qloo web search or new speech service were introduced.


## Checkpoint 30 — voice-first interests verified

- Final npm run check passed: TypeScript, ESLint and all 86 tests. Twelve new regressions cover explicit-start gating, full multi-chunk prompt completion before recording, interrupted/failed speech, immediate End/orb dismissal with one submission, natural pause/completion, background and late-result cancellation, short/empty responses, all eight groups and more than ten interests, bounded Qloo resolution/outage handling, signed unique matches, local-only raw groups and clearing. The categorized resolve→signed confirmation API path was exercised with mocked providers, not live accounts.
- Final web/server export passed with nine static pages and ten existing API routes; no new API endpoint was needed. Final iOS/Android Hermes exports passed. Rendered Cultural Interests HTML has exactly Start conversation and End conversation controls and no forms, progress bars, manual-review controls or developer/provider wording. Orb lifecycle is covered by controller tests; actual animation/audio interaction remains device/browser acceptance.
- The orb is absent initially, appears on explicit Start, and disappears immediately on End. End while listening stops and submits the response; End before recording or during active processing cancels. Natural pause completion keeps the orb through processing/short speech, then removes it. No microphone activation occurs on screen mount or before the complete prompt finishes. Two-minute recording and response-size safeguards remain; users are no longer limited to ten interests.
- Native waveform/meter behavior, silence thresholds, microphone permission timing, prompt/completion playback, stop/background cleanup, VoiceOver/TalkBack, reduced motion and large-text/short-screen layout need interactive validation. Web metering may be unavailable; explicit End works as the response-ending action. The initial layout avoids a large empty orb placeholder so Start is easy to reach; the active orb adapts to viewport size.
- Grouped interests use existing local Zustand session memory, not new disk persistence. Unsupported/ambiguous interests are saved as stated groups but never become verified Qloo personalization entities. Privacy/provider detail and Forget my cultural interests are in settings; the taste page has only user-facing conversation copy. Empty/cancelled/failed responses leave the previous profile unchanged before save.
- Updated FR.md, README.md, tech_stack.md, FR-audit.md and this handoff for the user's replacement flow. README remains a finished-product description. Final credential scan covered 198 source/export files with zero configured-key matches; .env.local was not edited. git diff --check passed. No live provider calls, Qloo web search, new speech/storage dependency, deployment, native binary build, commit or push occurred.

## Checkpoint 31 — Personalization tab and single control location

- Replaced the former Settings & privacy stack screen with a real Expo Router bottom tab layout: Home and Personalization. On Android these are two horizontal items in the bottom tab bar. Deleted `app/settings.tsx`, the old taste-control card component, and the provider-label hook used only by Settings. Home, Scene, Conversation, and area-name entry no longer render location or personalization controls; the supporting area-name screen remains reachable only from Personalization. The Cultural Interests voice screen remains a focused subpage reached from that tab.
- Personalization now contains only the optional taste profile section and Location section. Taste has an external heading and explanation, a setup/update card with interest count, an external enable switch when Qloo-confirmed entities exist, and Forget my taste profile. Location has no card: a heading, the requested explanatory sentence, a left-aligned foreground-location switch, current area/lookup status, and the optional manual-area fallback link. Turning location on still requests foreground permission explicitly; no provider or evidence flow was changed.
- Text precedes its switch in both the React tree and vertical visual layout so TalkBack's next swipe should move from explanation to toggle. React Native 0.86's `experimental_accessibilityOrder` exists in generated declarations but its Android feature flag defaults off, so the UI does not rely on it. The switches remain native accessible switches with labels and state. Actual TalkBack reading order and large-font layout require Android device validation; `adb devices` showed no connected device during this checkpoint.
- Updated FR.md, README.md and tech_stack.md to remove the old settings/duplicated-controls directions and to describe the bottom tabs. Kept the README as a finished-product description. `npm run check` passed TypeScript, lint and all 86 tests after the route relocation. Web/server export passed with nine static pages and ten API routes; rendered HTML confirmed only the Personalization page contains the taste and location controls, and the bottom navigation is a two-item horizontal tab list. iOS and Android Hermes exports passed before the final explanation-above-switch layout adjustment; rerun exports after any further layout changes. No live provider calls, deployment, device test, commit or push occurred.

## Checkpoint 32 — compact persistent tabs and voice area entry

- User clarified that the Home and Personalization labels must sit close together and the tab bar must remain visible after navigating. The first tab implementation used full-width default tab items and nested both tabs under a root stack, so the tabs were too far apart and disappeared on Scene/Conversation/voice screens. Corrected this with two compact, width-bounded adjacent tab items centered in the bottom bar and with a stack nested inside each tab. Home's nested stack owns Home, Camera, Scene and Conversation; Personalization's nested stack owns its root, Taste Profile and Area Name. The tab bar now remains visible across all seven screens. The two actual controls still appear only on Personalization root.
- Restored the always-visible **Use an area name instead** action under Location. The location toggle is sufficient when permission is granted and reverse geocoding succeeds; voice area entry remains the alternative when permission is denied or area detection is unavailable. The area screen now uses the same explicit-start orb and End conversation interaction as Taste Profile, with the requested explanation and no text form. It asks for one area name, records after the spoken prompt, transcribes with Groq Whisper, saves the stated locality in session memory, and speaks a short completion.
- Consolidated the voice controller, recording/transcription hook, orb/status screen layout, and cancellation behavior for taste and area. Only the prompt and post-transcription save differ. The existing taste behavior remains: no microphone before Start or before the prompt ends; End hides the orb immediately; natural completion cleans it up after speech; interrupted work cannot save. No new speech provider or API route was added.
- Final `npm run check` passed TypeScript, lint and all 86 tests. Final web/server export passed with nine static pages and ten API routes. Static output for Home, Camera, Scene, Conversation, Personalization, Taste Profile and Area Name each contains the two-tab bar; only Personalization root contains taste/location controls; Area Name renders its single voice Start/End flow. Final Android and iOS Hermes exports passed. There was no connected Android device (`adb devices` empty), so actual TalkBack swipe order, native tab spacing, microphone, permission and speech behavior remain device acceptance work. No live provider calls, deployment, commit or push occurred.

## Checkpoint 33 — stable compact tab rendering

- The width-calculated tab items from Checkpoint 32 were still flawed: static rendering initially supplied zero viewport width, which could produce invisible tab items before hydration. Replaced them with a centered horizontal row of two natural-width 56px-minimum pressable tabs with an 8px gap, bottom safe-area padding, selected styling, and tab accessibility labels/state. This no longer depends on viewport measurements, so Home and Personalization remain next to each other even in the initial web render; the nested stacks from Checkpoint 32 keep them visible across all app screens.
- Verified final `npm run check` (TypeScript, lint, 86 tests) and final Android/iOS Hermes exports after the replacement. A web static export of the new bar confirmed both labels and nonzero-width controls on all seven pages; the last `aria-selected` addition was covered by the final typecheck/native export but was not followed by a second web export. Device TalkBack and visual spacing remain unverified without a connected Android device. No provider calls, deployment, commit or push occurred.

## Checkpoint 34 — voice prompt pipeline diagnosis and native API origin fix

- User reported that both Taste Profile and Area Name fail at “I could not play the prompt.” The two screens share the spoken prompt controller. Diagnosed the shared path and confirmed that `.env.local` has configured Groq speech/transcription but no `EXPO_PUBLIC_API_URL`; native `apiUrl()` therefore returned relative `/api/...` paths, which native fetch cannot resolve. Added automatic resolution of the Expo development host (including Expo Go debugger host) for native development. Web continues to use relative API routes, and native release builds now raise a clear missing-origin error until a deployed HTTPS API origin is configured. Added an origin regression test.
- Removed the masking of prompt errors: the voice controller now surfaces the underlying speech/network error returned by `SpeechSequence` instead of always showing the generic prompt failure. Recording still never starts until the prompt has fully played, and cancellation behavior is unchanged.
- Live in-process provider checks with current server credentials succeeded: Groq Orpheus returned WAV for the area prompt and all three taste prompt chunks; Groq Whisper transcribed a generated area-name recording; taste extraction produced the expected grouped film/music interests and Qloo candidate statuses; a live Karachi locality question returned a grounded answer from five Qloo place records. These checks confirm the server/provider chain, not actual Android audio playback or on-device networking. `npm run check` passed TypeScript, lint and 87 tests. A connected Android device and deployed release API are still needed for device/release acceptance. No credentials were printed or changed.
- Final API error handling also reports when the app reaches a static page or unavailable API server instead of returning a JSON syntax error. After that change, `npm run check` again passed all 87 tests. Final iOS/Android and web/server exports passed; a scan of 58 generated native/client files found zero configured API-key matches. `.env.local` and API credentials were not modified. The Expo development host fallback must be exercised on an actual connected device to close native acceptance; there was no device or AVD available in this session.

## Checkpoint 35 — location toggle is the only locality control

- Removed **Use an area name instead**, its voice screen and hook, and the manual-locality state path. The Personalization location section now has the explanation, accessible foreground-location toggle, current-area/status text, and any lookup notice. Disabling the toggle clears locality and cached location context; future requests omit locality. A denied or unavailable location still allows scene exploration.
- Updated FR.md, README.md, and tech_stack.md to match the toggle-only behavior. Removed fallback copy that suggested entering an area name. Taste-profile voice onboarding and its shared audio utilities remain unchanged.
- `npm run check` passed TypeScript, lint, and all 87 tests; `git diff --check` passed. Native TalkBack and foreground-location behavior still need device acceptance because no connected Android device was available in the prior checkpoint.

## Checkpoint 36 — answer-first Scene screen

- Simplified Scene to a plain **Scene** heading, grounded answer, one contextual **Stop speaking**/**Replay response** control, confirmed notable-reference names only when present, an explicit tap-to-record voice orb, **Ask Context** for typed conversation, and **Capture another scene**. Removed the separate confidence label, empty Notable references message, reference Explore buttons, **Explore this scene** heading, and preset connection/guided/location/familiarity buttons. Removed those preset buttons from Conversation too; the same questions remain available through natural text or voice. Taste evidence still changes presentation only and no longer starts an empty-reference taste query.
- Reused the existing microphone/transcription path for the Scene orb. A tap is required before recording; tapping again stops and transcribes, then submits the question to the existing exploration endpoint and opens Conversation. The orb is decorative to accessibility services; its enclosing button has an explicit state/label. The new result moves native screen-reader focus to its answer, loading text has a polite live region, and errors remain accessibility alerts. Scene and Conversation hide their redundant stack header while persistent Home/Personalization tabs remain visible.
- Updated FR.md and README.md to match the answer → listen → ask flow. `npm run check` passed TypeScript and all 87 tests; its first lint run had two duplicate-import warnings that were fixed, and a follow-up lint passed without warnings. Android/iOS Hermes export passed. Actual TalkBack/VoiceOver focus, speech overlap, orb recording, and navigation still require device acceptance; no connected device was available in the prior checkpoint.
- Cleaned the no-reference fallback so it no longer suggests the removed manual area-name entry, and replaced an implementation-detail shortlist warning with user-facing wording. The final `npm run check` was rerun after these copy changes.

## Checkpoint 37 — recording upload acceptance

- User reported every recording failing with “Provide a supported audio recording.” That exact error came from `/api/audio/transcribe` before Groq Whisper was called. The route required `audio instanceof File` and an exact MIME match. A web MediaRecorder upload can carry a parameter such as `audio/webm;codecs=opus`; multipart parsers can also supply a Blob or `application/octet-stream` for native `.m4a` uploads. The app's clients already send a recording in FormData, so the strict server check was the likely rejection point. No device was connected for direct reproduction.
- The route now accepts nonempty Blob-like multipart recordings up to 10 MB, recognizes supported audio by MIME (ignoring parameters), extension, or common audio file signatures, and normalizes them to a File with a usable MIME and filename before the configured Whisper provider call. Missing/empty/unsupported uploads still receive distinct user-facing errors. Added API-boundary regression cases for parameterized WebM, generic native M4A, generic WAV, empty audio, and unrelated text.
- Final `npm run check` passed TypeScript, lint and all 87 tests, including the targeted audio-route regression cases. Web/server export passed and bundled `/api/audio/transcribe`. On-device/web microphone and transcription still need a real interaction check; no provider keys were changed.

## Checkpoint 38 — one-orb conversation and taste editing

- Replaced the separate Ask Context submit path with the shared voice orb on Scene and Conversation. One tap starts recording, a second finishes, Whisper transcribes, and the existing scene question API runs automatically. Conversation now speaks the latest answer automatically when enabled. Its orb stops active speech and exposes a TalkBack/VoiceOver **Replay answer** action (and a long press) using the existing speech cache. Removed the Conversation **View notable references/Capture a scene** button, replay/stop button, duplicated scene card, and extra taste section. The native Conversation stack header now supplies a back arrow to Scene or Home; the two compact bottom tabs remain visible.
- Added one-turn taste editing without rewriting the stored profile: the configured LLM extracts explicit add/remove/clear-category operations, the edit API preserves untouched interests and existing signed Qloo matches, and Qloo resolves only new additions. Ambiguous edits return a clarification and apply nothing. Updated the voice prompt to read current interests and request commands such as “Delete from movies and TV Interstellar. Add to movies and TV Black Panther.” Initial setup still records only after the explicit orb tap and completed prompt, and still saves grouped interests in session memory with Qloo-confirmed entities only.
- Taste Profile now shows a single **My taste profile** switch, the orb, and brief status. Switch on uses the edit flow; switch off uses fresh onboarding and replaces prior interests only after successful completion. The switch controls this voice workflow, separately from the Personalization tab's **Personalize cultural context** preference. The orb can end the voice session while the prompt or result is speaking. Removed extra page actions and implementation/provider language; labels and hints describe only the user's actions. Updated FR.md and README.md accordingly.
- `npm run check` passed TypeScript, lint, and all 91 tests, including edit/API cases. Web/server export passed with eight static routes and eleven API routes; rendered Taste and Conversation pages have the orb and no old conversation buttons. iOS/Android bundle export passed before the final replay-action and copy adjustment and was rerun afterward. `git diff --check` passed. No Android device was attached, so the native header arrow, TalkBack swipe/action order, and audio interaction still require a device check. No provider calls, deployment, commit, or push occurred in this checkpoint.

## Checkpoint 39 — Personalization tab returns to its root

- The location explanation and toggle were still present in `app/(tabs)/personalization/index.tsx`, but tapping the Personalization tab after opening its nested Taste Profile screen could leave that nested page visible. The Taste Profile page intentionally contains only its own switch and orb, so this looked like the location section had been removed. Updated the compact tab bar so pressing either tab targets that tab's `index` screen. The Personalization root retains its My Interests card, separate cultural-context switch and forget action when a profile exists, and the foreground Location section; the Taste Profile subpage keeps the requested single switch and orb.
- `npm run check` passed TypeScript, lint and all 91 tests. Web/server export passed; rendered Personalization root contains the taste card, location explanation and location switch, while the Taste Profile route contains the orb and no location controls. Android was not connected, so tab tapping and TalkBack behavior need a device check. No provider calls, deployment, commit or push occurred.

## Checkpoint 40 — voice labels precede their orbs

- Moved the visible voice action text above the orb on Taste Profile (`Set up my interests`/`Update my interests` and active states) and Ask Context (`Ask Context` and active states). Each orb remains the same single accessible button with its stateful screen-reader label; the visual text is hidden from accessibility traversal to avoid a duplicate stop before the button. Recording, speech, replay, and navigation behavior were not changed.
- TypeScript, lint, and `git diff --check` passed. This was a presentational change, so the existing 91-test suite was not repeated. No device was connected for a TalkBack visual/focus check.

## Checkpoint 41 — taste mode after first setup

- Confirmed the **My taste profile** switch is intentionally disabled before any interests have been saved; the orb starts normal onboarding in that state. The two orb paths are implemented: onboarding resolves/saves stated interests, while edit mode reads the saved groups and applies explicit add/remove operations through the taste edit API and Qloo resolution for additions.
- Found and fixed a mode inconsistency after initial onboarding: the grouped interests were saved but the switch remained off until the user left and reopened Taste Profile. A successful nonempty setup now selects edit mode immediately after the store update, so the switch becomes on once a saved profile exists; users can still turn it off to run fresh onboarding again. Failed, empty, or cancelled setup leaves it off and does not create interests.
- `npm run check` and `git diff --check` were run after the change. Actual tap/recording behavior still needs an Android device check; no connected device was available in this session.

## Checkpoint 42 — TalkBack describes taste switch modes directly

- The Taste Profile switch previously placed the meaning of on/off only in `accessibilityHint`, which Android TalkBack may omit depending on verbosity settings. Its `accessibilityLabel` now states the action for the current mode: on means review/add/remove saved interests with the orb; off means start a new setup that replaces saved interests only after completion. Before any interests are saved, the disabled switch label points to setup with the orb. The switch also exposes its checked and disabled state explicitly. The visual layout and voice behavior did not change.
- TypeScript, lint, and `git diff --check` were run after the change. Native TalkBack speech order still needs device verification.

## Checkpoint 43 — preserve image dimensions for scene analysis

- Removed the client-side 1600-pixel resize from `prepareImage`. Camera captures and photo selection now request highest image quality, and the image manipulator renders at the source pixel dimensions before high-quality JPEG encoding. The same base64 data URI is still sent to the configured vision model; no OCR pipeline or provider routing changed.
- Raised the scene-only data URI allowance to 18 MB and its JSON request allowance to 18.2 MB, within the documented 20 MB image-request envelope for the currently used providers. Other JSON routes retain the previous 8.1 MB body limit. If a full-resolution image still exceeds the cap, the app gives a specific message and does not silently resize it. Added a regression case proving a scene request above the former 8 MB limit is accepted while the default route limit still rejects it.
- Updated FR-01 to require preserving the client's pixel dimensions. `npm run check` passed TypeScript, lint and all 92 tests; Android and iOS Hermes bundle exports passed; `git diff --check` passed. A configured vision provider may still perform its own internal resize according to model-specific settings; this change removes the app-side resize only. No credentials or model settings were changed.
