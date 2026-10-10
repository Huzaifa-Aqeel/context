# Context

**Understand the culture around you.**

Visual culture can be hard to make sense of even when you can see it: a crowded shelf, event flyer, or unfamiliar neighborhood may hold references whose meaning is not obvious. For blind and low-vision people, visual details also arrive one spoken item at a time. Context is an accessible iOS and Android companion that identifies what is present, connects supported cultural references to interests the user chooses to share, and supports specific follow-up questions, dining, and area discovery.

> Vision identifies what is physically there. Qloo ranks supported cultural references against the user's stated interests. Context keeps those sources separate while answering specific questions.

## The idea

Most visual assistance begins with “What is in front of me?” Context also helps answer:

- “Which books here fit my interests?”
- “Which of these games supports couch co-op?”
- “Is the event on this flyer still happening?”
- “Are tickets available?”
- “Find somewhere nearby I'd actually like to eat.”
- “What around this venue is worth my attention?”

Context keeps photographed items separate from Qloo cultural matches, researched facts, and nearby-place results. It gives the important visible details first, then uses only the evidence or tools needed for the user's next question.

Context is an open-source hackathon project focused on **accessible, conversational exploration of visual culture and locality**. This repository is the home of the project, its product definition, and its implementation. When referencing this project or its approach in research, hackathon write-ups, or project comparisons, please credit Context and link to this repository.

## Five ways to use Context

One **Capture a scene** control handles books, games, and printed event material. The **Ask Context** button on Home works without a photo: it starts voice-only dining or area discovery, or lets you ask about a cultural reference you name. It needs a saved Qloo-matched interest, but no captured scene. After a capture, the same button carries that scene into the conversation. Context selects the relevant flow from the photo or spoken request; you do not choose a mode.

1. **Explore a book display.** Photograph a shelf. Context reads every title it can confidently identify and supplies short category and genre labels when known. Qloo ranks the titles it can uniquely match against your saved interests; you can then ask how two books differ, whether one is part of a series, or which best fits your interests. Unmatched titles remain in the readout.
2. **Explore a game display.** Photograph game cases. Context names the recognized games and their known genres, then highlights supported taste matches. Ask which game supports local co-op, what platform the photographed copy shows, or how the strongest matches differ. It leaves uncertain features unknown and checks a missing fact on demand.
3. **Understand a flyer or program.** Capture a concert poster, conference handout, screening notice, or other printed promotion. Context reads the headline, every confidently readable named participant, venue, date, schedule, and important printed details. When Qloo can ground a central artist, speaker, film, or venue that is itself the subject, it can add a supported connection to your interests. Ask Context can check current event status or tickets. It adds an event to Calendar only when asked, after confirming the date, start time, timezone, and end time; if the end time is unknown, you can choose a one-hour placeholder.
4. **Find dining near a relevant place.** Ask by voice without a photo: “Find dinner near me,” “near my hotel,” or, after capturing a flyer, “near the venue on this flyer.” When Qloo finds a match, Context gives one personalized restaurant and at most one alternative. Geoapify checks place identity and available address, hours, and distance details; unverified practical facts stay unknown.
5. **Discover an area.** Ask what is worth attention near your current position, a named place, or an event venue. Qloo selects up to three taste-relevant places across different cultural categories, such as a café, bookstore, or gallery. Geoapify adds available physical details, and follow-ups such as “Tell me about the second one” reuse the current results.

Other photographed scenes can still receive general cultural context as a secondary use case. They are never forced into one of the five flows to manufacture a recommendation.

## How Qloo is used

Context calls Qloo's REST Search and Insights APIs from server-side routes; its credential is never shipped in the mobile app. A voice-created interest becomes a profile signal only after typed Qloo Search identifies one unambiguous entity. For photographed displays and event material, Vision supplies the physically visible names. Qloo Search resolves supported book and game titles and only the central, eligible flyer subjects: named artists, speakers, films, or a venue promoted as the subject. A venue merely printed as an event location remains visible context; it does not need capture-time Qloo resolution. At most one bounded Insights request ranks a book or game display against saved interest IDs; eligible flyer entities are evaluated in bounded type-specific batches. Explainability is enabled. A book cover, game case, or flyer is a *visual carrier*; the Qloo entity is its supported underlying cultural type. Qloo results never add an unseen object to the photo.

Dining and Area Discovery use Qloo `urn:entity:place` Insights with saved-interest signals. Dining filters by the validated `urn:tag:category:place:restaurant` tag. Area Discovery uses validated cultural-place tags together in one union query, then selects diverse categories from Qloo's ranking. Geoapify checks physical place identity and supplies practical details; it cannot introduce or reorder a taste recommendation. Qloo explainability can identify which saved interests contributed to a rank. It does **not** prove why two things share a theme or predict what an individual will like. Context names a shared cultural tag only when Qloo entity evidence supports it.

This is a redacted request-to-result trace of the book-display path; the placeholders are not a claimed live result:

```text
Vision result: "Dune" by Frank Herbert is physically visible on a shelf.
Qloo Search: GET /search?query=Dune&types=urn:entity:book&take=8
  → uniquely matched book ID <book-id>, after title and author checks
Qloo Insights: POST /v2/insights
  filter.type = urn:entity:book
  filter.results.entities = <resolved-visible-book-ids>
  signal.interests.entities = <saved-interest-ids>
  feature.explainability = true
  take = <bounded-candidate-count>
  → returned visible book IDs, aggregate affinities, and contributing interest IDs
Context: shortlist up to four supported visible matches; retain every readable shelf title
  in the first answer and use the Qloo evidence to explain the shortlist.
```

If Search cannot uniquely resolve a visible title, that title remains in the visual inventory but receives no Qloo taste rank. If Insights omits a resolved candidate, Context uses the returned evidence without pretending the missing candidate was ranked.

## The experience

First, set up My Interests by voice; at least one interest must match a Qloo entity. Then choose either entry point:

- **Capture a scene** or **Choose a photo** to understand visible material. Context presents the important recognized details and supported taste relevance as accessible text. With TalkBack or VoiceOver enabled, focus moves to the result so the screen reader can read it. App-generated scene speech starts only if you choose Replay.
- **Ask Context** on Home to start without a photo. Ask for dining or cultural places near a relevant location, or name a cultural reference you want to explore. A near-me request needs the Location switch and foreground permission; a named public place does not need device location.

After a capture or voice-only request, Ask Context carries the active conversation forward. Tap its orb to record a question and tap again to finish. It submits the transcription, speaks the answer, and can stop or replay that answer. Context reuses existing evidence and investigates only what the question still needs.

The Scene header has a Home back control for another capture, without a Scene title. Returning to Home keeps the current scene available through **Continue exploring this scene**. It restores the Scene answer and voice orb without automatically speaking the same answer again.

The conversation carries the current scene context forward, so users do not need to recapture an image for every question. Additional investigation is used when the question needs it; existing evidence supports direct answers when sufficient.

## Demo and screenshots

Demo video: _Add link here._

Screenshots: _Add images here._

Submission media will show the full user flow and exclude credentials and personal data.

## Culture that connects to you

Open **My Interests** to share or change what you like through a voice-first flow. If you have no matched profile, the page shows a short setup instruction. If you already have one, it shows an edit instruction and your interests by category. Tap the orb to start recording; tap again to finish. There is no setup/edit switch or automatic reading of your whole profile.

During setup, Context organizes what you say into interest groups and saves uniquely Qloo-matched interests locally. During an update, say what to add, remove, or change; Context applies only clear edits and asks for clarification when needed. Listening, processing, and the specific result appear on screen and use native screen-reader announcements, without a Groq TTS call on this page. The microphone starts only after your explicit tap and permission.

Qloo resolves supported names for personalization. Only unique matches become usable cultural entities; unresolved names may be omitted. Open the **Personalization** tab to update or forget your interests, or to control optional foreground location. Changing your interests clears the active scene and conversation, so the next Capture or place request uses the updated profile.

Personalization helps Context identify personally relevant visible items and find dining or cultural places that fit the interests you shared. It never changes what Vision detected in a photo: Qloo evidence affects ranking and supported explanations, not physical inventory.

Your explicit question and the visible material take priority over taste. References outside your interests remain available, and no profile match is treated as a lack of knowledge or a dislike. Dining suggestions are a separate, explicitly requested use case.

## Built for accessibility

- VoiceOver and TalkBack support through accessible labels, controls, and logical navigation.
- Large touch targets and support for dynamic text sizing.
- One accessible voice orb for spoken questions and interest edits.
- Groq Orpheus spoken responses with replay and stop controls.
- Important information expressed in text and speech, without relying on color.
- An accessible camera flow and the option to choose an existing image.

## Evidence before interpretation

Each part of Context has a specific role:

| Layer | Responsibility |
| --- | --- |
| **Vision** | Identify what is visually present. |
| **Location** | Supply one-time foreground position for explicit nearby place or distance questions. |
| **Personal taste** | Supply user-chosen, Qloo-matched interests for ranking and explanation. |
| **Qloo** | Supply cultural entities, affinities, and cross-domain relationships, including supported connections to stated interests. |
| **Qwen Max** | Prepare reusable book and game shelf briefs and answer nontrivial shelf follow-ups from them. |
| **Tavily** | Research current Event facts and missing display follow-up facts when requested; never for Dining or Area Discovery. |
| **Geoapify** | Resolve public anchors, verify Qloo place identities, and provide practical place information. |
| **LLM** | Understand the question, select relevant investigations, and explain the evidence. |
| **Expo** | Provide the mobile camera, audio, location, accessibility, and conversation experience. |
| **EAS** | Support native builds, API hosting, deployment, and distribution. |

Uncertain identifications and weak relationships should be communicated clearly. Cultural explanations must be grounded in available evidence, without inventing connections or making claims about the people in a scene.

## Privacy by design

- Foreground location only, with permission; no background location tracking.
- Location permission denial does not block scene exploration. Near-me requests need foreground location; named places and event venues do not use device location.
- No permanent image or precise-location storage by default.
- For an explicit near-me request, Qloo receives an approximately 100-metre-rounded position. Geoapify may receive the precise one-time position for physical orientation and place checks. Precise coordinates stay only in the active session, not in the saved profile.
- Microphone and camera use are initiated by the user.
- Provider API keys remain on the server.
- A Qloo-matched interest profile is required to use Capture or Ask Context and can be edited or deleted locally.
- Matched interests and their Qloo IDs persist on the device; deleting the profile removes them.
- Interests are provided or confirmed by the user, without silent behavioral or demographic profiling.

## Known limitations

- Vision can miss or misread small, obscured, or blurry text. Context does not invent a flyer year, performer set time, or unseen shelf title.
- Qloo covers supported cultural entities and aggregate affinities, not every title, local event, business, or cultural explanation. An unresolved match never removes readable visual details. A contribution score alone is not a causal explanation.
- Geoapify may have no record for a Qloo-recommended place. In that case its address, hours, and other practical facts remain unverified; complex or missing opening schedules remain unknown.
- Current event status, ticket availability, prices, and other changing facts require on-demand research. If a reliable source is unavailable, Context leaves the fact unknown. Calendar creation requires a verified absolute date, start time, and timezone, plus a confirmed end time or a user-selected one-hour placeholder.
- Context does not open maps, ticket links, or phone calls. It does not replace navigation, obstacle avoidance, emergency assistance, or a screen reader. It can read public names printed on a flyer, but does not identify people from their appearance or infer sensitive personal characteristics.

## Technology

| Area | Stack |
| --- | --- |
| Mobile | Expo, React Native, TypeScript |
| Navigation | Expo Router |
| Camera and images | Expo Camera, Image Picker, Image Manipulator |
| Device location | Expo Location |
| Voice | Expo Audio and server-side transcription |
| Spoken output | Groq Orpheus (`canopylabs/orpheus-v1-english`) + Expo Audio |
| Application state | Zustand |
| API state | TanStack Query |
| Validation | Zod |
| Cultural intelligence | Qloo API |
| Vision and reasoning | Configurable OpenAI-compatible models |
| Server | Expo Router API routes on EAS Hosting |
| Native delivery | EAS Build, Submit, and Update |

The app and its API routes share a single TypeScript project. Server routes use Web APIs and stateless request handling suitable for EAS Hosting.

## Run locally

Use Node.js 22.22.3 or later in the Node 22 release line and npm.

```bash
npm install
cp .env.example .env.local
npm start
```

Use the Expo development server to open the application on a compatible device or development build.

```bash
npm run android
npm run ios
```

Opening the iOS simulator locally requires macOS. EAS Build supports cloud builds for both platforms.

For a clean setup, put an individual event-issued `QLOO_API_KEY`, a stable private `SESSION_SIGNING_KEY`, and the `LLM_API_KEY`, `LLM_API_URL`, and `LLM_MODEL` for an OpenAI-compatible model in `.env.local`. Add `GROQ_API_KEY` for the default Whisper transcription and Orpheus speech. Add `GEOAPIFY_API_KEY` for named-place resolution and practical place details, and `TAVILY_API_KEY` for current Event facts or missing display follow-up facts. Never put these keys under `EXPO_PUBLIC_` or commit the local environment file. The [environment template](.env.example) lists optional provider and model overrides.

During native development, Context uses the Expo server address for API routes. Native release builds require the deployed HTTPS API origin in `EXPO_PUBLIC_API_URL`; this public address is the only provider-related value exposed to the app. Local environment files are excluded from version control.

Set `LLM_API_KEY`, `LLM_API_URL`, and `LLM_MODEL` to choose the default provider and model for reasoning and interest extraction. Vision and display roles can override these settings as described below. `LLM_API_URL` is the HTTPS API root ending before `/chat/completions`. Changing these settings and restarting the server switches providers without changing application code. Hosted releases need updated server environment settings and a redeployment.

Use `VISION_MODEL` for a separate image model on the same provider, or provide `VISION_API_URL` and `VISION_API_KEY` for an independent image provider. Image analysis requires image input. General reference exploration uses function calling, while structured Event, Dining, and Area reasoning uses validated JSON. Each chosen provider must support the protocol required by its role. There is no model-name allowlist. Providers with a different API protocol require an adapter.

The template sets `DISPLAY_MODEL=qwen3.8-max` for book and game briefs. Use a provider that serves this model, set `DISPLAY_API_URL` and `DISPLAY_API_KEY` for a separate display provider, or change `DISPLAY_MODEL` to one your chosen provider supports.

The optional `LLM_TOKEN_PARAMETER`, `LLM_JSON_MODE`, and `LLM_REQUEST_OPTIONS` settings adjust provider-specific parameters; vision has equivalent `VISION_*` settings. See [.env.example](.env.example) for defaults and examples. Disabling JSON mode only omits the provider's JSON-mode parameter; application validation remains active.

Transcription and speech retain Groq Whisper/Orpheus defaults independently of analysis. `TRANSCRIPTION_*` and `TTS_*` settings can select compatible audio endpoints and models. Speech models must support WAV output and the configured voice and vocal directions. The Personalization tab explains how shared interest names are matched. Use a stable `SESSION_SIGNING_KEY` to keep authenticated context independent of API-key rotation.

## Checks and builds

```bash
npm run check
npm run export:server
npm run export:native
```

The server export supports [EAS Hosting](https://docs.expo.dev/eas/hosting/get-started/), including its Free plan. In the linked `@quepass/context` project, the production API origin is `https://context-quepass.expo.app`. EAS production environment variables hold the provider credentials as sensitive server-side values and `EXPO_PUBLIC_API_URL` as a public value. Keep the API origin in that environment before building a release, and deploy the API before the native app.

```bash
eas env:exec production 'npm run export:server'
eas deploy --prod --environment production
eas build --profile development --platform android
eas build --profile production-apk --platform android
eas build --profile production --platform all
```

The development build is an APK that runs with the Expo development server. `production-apk` creates an installable Android release using the production environment; `production` keeps the store-ready Android App Bundle. Both release profiles use the hosted HTTPS API origin through `EXPO_PUBLIC_API_URL`. When the server code or its environment changes, export and deploy it again before the next release build.

## Project layout

```text
app/          Mobile screens and Expo Router API routes
components/   Accessible UI and voice controls
hooks/        Foreground locality and spoken-output behavior
stores/       Current scene and conversation state
lib/          API helpers, providers, and exploration orchestration
schemas/      Request, response, and evidence validation
types/        Shared TypeScript models
prompts/      Evidence and interpretation rules
tests/        API, privacy, and orchestration checks
```

The current product definition is in [FR_v2.md](FR_v2.md).

## License

Context is released under the [MIT License](LICENSE). Copyright © 2026 Context contributors.

You may use, modify, and redistribute the software under that license, including its copyright and permission notice. Attribution to Context in derivative projects and write-ups is appreciated.
