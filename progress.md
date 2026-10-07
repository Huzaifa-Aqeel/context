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
7. Implemented the FR-14 capability pipeline: optional explicit voice onboarding, Qloo resolution and confirmation, separate signed taste evidence, stable detected-reference presentation, and familiar/discover exploration controls. The subsequent acceptance audit found remaining gaps; FR-14 is partial rather than fully compliant. Latest checks pass 43 tests.

## Outstanding issues / handoff warnings

- Read `FR-audit.md` before further implementation. The 2026-10-08 source/diagnostic audit counts 9 numbered requirements with main implementation present and 5 partial (FR-07/09/10/12/14); no numbered feature is wholly absent. Device verification remains separate from this count.
- Four confirmed audit gaps: unsupported personalized prose passes with empty citations; taste pairs can remain stale after an in-loop entity change; culturally relevant detections beyond eight are dropped without notice; whole profiles reach reasoning without per-question selection. Fix these with regression coverage, then update the audit statuses.
- Other acceptance gaps: standalone error/match feedback lacks app TTS/replay, initial spoken scene summaries do not use taste, prioritization is heuristic and its question/necessary-info arguments are not wired at the scene call, and camera/picker/locality operations lack session-generation guards. Accessibility and native lifecycle behavior need device testing.
- Personal Taste is implemented in session memory. Interests must be confirmed after Qloo resolution; profiles and derived evidence are independently authenticated. Persisted profiles are not implemented, and no persistence occurs by default.
- Familiar explanations cite validated Qloo reference/interest pairs, with explicit prompts against invented analogies. Pair validation checks the cited evidence, not every semantic claim in free-form model prose; review real spoken explanations during device testing.
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

1. Read FR.md, FR-audit.md, and the latest checkpoints before continuing. The FR-14 pipeline exists, but its acceptance gaps still need work; avoid repeating completed onboarding/provider work. Check the local Qloo kit before searching Qloo documentation. Do not guess unsupported sports/director/category mappings or API parameters.
2. Address the audit's reproduced grounding and in-loop taste-freshness defects first. Add regression cases, then complete spoken notices, reference preservation/prioritization, initial personalized spoken presentation, data minimization, and lifecycle guards. Existing 43 passing tests do not cover all these defects.
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
