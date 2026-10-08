# Context

**Understand the culture around you.**

Context is an accessible iOS and Android companion for blind and low-vision users. It connects what a camera sees with cultural knowledge, local context, and voluntarily shared interests, helping users explore references, understand relationships, and connect unfamiliar culture to things they already know.

Recognizing a poster, brand, or landmark is only the beginning. Context helps answer what that reference means, how it connects to its surroundings, and why it might matter.

> Vision identifies what is there. Qloo helps establish how those things relate culturally. Context explains why those relationships may matter.

## The idea

Most visual assistance begins with “What is in front of me?” Context also asks:

- “What cultural context am I missing?”
- “Why is that reference important?”
- “How do these things connect?”
- “What is culturally significant about this neighborhood?”
- “How does what I'm seeing relate to this area?”
- “What here connects to things I know?”
- “What here would stand out to me?”

A music poster, an independent film reference, a fashion label, and a neighborhood can each contribute evidence. Context brings those signals together into an explanation the user can explore at their own pace.

Context is an open-source hackathon project focused on **accessible, conversational exploration of visual culture and locality**. This repository is the home of the project, its product definition, and its implementation. When referencing this project or its approach in research, hackathon write-ups, or project comparisons, please credit Context and link to this repository.

## One assistant, many questions

Show Context a scene, hear its cultural context, then talk naturally about what interests you. There is no exploration-mode menu before capture. Reference, connection, and guided actions become available after recognition; location and optional taste support the same conversation.

| Conversational capability | Purpose | Example question |
| --- | --- | --- |
| **Scene Context** | Understand the cultural context of an environment. | “What cultural context am I missing?” |
| **Reference Explorer** | Explore one poster, brand, artwork, or other reference. | “Why is that reference important?” |
| **Connection Explorer** | Understand relationships between multiple references. | “How do these things connect?” |
| **Guided Exploration** | Explore the most meaningful references one at a time. | “Guide me through what is culturally important here.” |
| **Location Context** | Explore the cultural significance of an area and its relationship to a scene. | “What is culturally significant about this neighborhood?” |

## The experience

1. Capture a scene or choose a photo to start analysis, or open **Ask Context** directly.
2. Enable optional foreground location to include available area context automatically.
3. Identify meaningful visual references and resolve them through Qloo.
4. Combine relevant visual, cultural, and locality evidence.
5. Receive a concise explanation as text and spoken output.
6. Tap the Ask Context orb to ask about a notable reference, connections, the surrounding area, or what to explore next. Tap it again to finish; the question is transcribed, submitted, and answered aloud. The same orb stops speech and offers a screen-reader Replay answer action; the back arrow returns to the previous screen.

The conversation carries the current scene context forward, so users do not need to recapture an image for every question. Additional investigation is used when the question needs it; existing evidence supports direct answers when sufficient.

## Culture that connects to you

The compact Home and Personalization tabs remain available while you capture, explore, and set up your profile or area context.

Open **My Interests** to share or change what you like through one voice interaction. Turn **My taste profile** off for a fresh setup, or on to add or remove saved interests. Tap the orb, hear a brief prompt, then speak. The orb reflects idle, speaking, listening, and processing states.

Pause when you finish or tap the orb again. During setup, Context organizes your response into interest groups and saves them locally for the session. During an update, it reads your current interests and asks for specific additions or removals in one turn. It applies only clear edit operations, asks for clarification when needed, and speaks a short completion message. The microphone starts only after your explicit orb tap and the spoken prompt finishes.

Qloo resolves supported names for personalization. Only unique matches become cultural entities; unresolved interests never block completion. Open the **Personalization** tab to update or forget your taste profile, or to turn **Personalize cultural context** on or off.

Taste works throughout the conversation. The **Personalization** tab contains the interest count and toggle. It helps Context surface meaningful references, explain unfamiliar ones through supported connections to your interests, and offer guided exploration that starts with something familiar or discovers something new. Scene and locality evidence can also show where an environment overlaps with the interests you shared.

Turning personalization on or off keeps the detected references unchanged. Only their ordering, highlighting, and explanation strategy change, and familiar-interest connections require Qloo evidence.

Your explicit question and cultural significance take priority over taste. References outside your interests remain available, and no profile match is treated as a lack of knowledge or a dislike. This supports attention and understanding without turning Context into a shopping or place-recommendation feed.

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
| **Location** | Derive useful locality information. |
| **Personal taste** | Provide voluntary interests for attention and familiar explanations. |
| **Qloo** | Supply cultural entities, affinities, and cross-domain relationships, including supported connections to stated interests. |
| **LLM** | Understand the question, select relevant investigations, and explain the evidence. |
| **Expo** | Provide the mobile camera, audio, location, accessibility, and conversation experience. |
| **EAS** | Support native builds, API hosting, deployment, and distribution. |

Uncertain identifications and weak relationships should be communicated clearly. Cultural explanations must be grounded in available evidence, without inventing connections or making claims about the people in a scene.

## Privacy by design

- Foreground location only, with permission; no background location tracking.
- Location permission denial does not block scene exploration.
- No permanent image or precise-location storage by default.
- Locality information is used in conversation without retaining precise coordinates.
- Microphone and camera use are initiated by the user.
- Provider API keys remain on the server.
- Taste personalization is optional, transparent, and can be disabled; interests can be edited or deleted.
- Taste profiles stay in session memory by default; retaining them across sessions requires explicit opt-in.
- Interests are provided or confirmed by the user, without silent behavioral or demographic profiling.

Context is for cultural understanding. It does not replace navigation, obstacle avoidance, emergency assistance, or screen readers, and it does not identify people or infer sensitive personal characteristics.

## Technology

| Area | Stack |
| --- | --- |
| Mobile | Expo, React Native, TypeScript |
| Navigation | Expo Router |
| Camera and images | Expo Camera, Image Picker, Image Manipulator |
| Location | Expo Location and reverse geocoding |
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

Configure provider credentials server-side. During native development, Context uses the Expo server address for API routes. Native release builds require the deployed HTTPS API origin in `EXPO_PUBLIC_API_URL`. Only that public address belongs under the `EXPO_PUBLIC_` prefix; provider secrets must never use it. Local environment files are excluded from version control.

Set `LLM_API_KEY`, `LLM_API_URL`, and `LLM_MODEL` to choose the provider and model for reasoning, interest extraction, and image analysis. `LLM_API_URL` is the HTTPS API root ending before `/chat/completions`. Changing these settings and restarting the server switches providers without changing application code. Hosted releases need updated server environment settings and a redeployment.

Use `VISION_MODEL` for a separate image model on the same provider, or provide `VISION_API_URL` and `VISION_API_KEY` for an independent image provider. Image analysis requires image input; conversational exploration requires function calling. Both must produce the validated JSON responses. There is no model-name allowlist. Providers with a different API protocol require an adapter.

The optional `LLM_TOKEN_PARAMETER`, `LLM_JSON_MODE`, and `LLM_REQUEST_OPTIONS` settings adjust provider-specific parameters; vision has equivalent `VISION_*` settings. See [.env.example](.env.example) for defaults and examples. Disabling JSON mode only omits the provider's JSON-mode parameter; application validation remains active.

Transcription and speech retain Groq Whisper/Orpheus defaults independently of analysis. `TRANSCRIPTION_*` and `TTS_*` settings can select compatible audio endpoints and models. Speech models must support WAV output and the configured voice and vocal directions. The Personalization tab explains how shared interest names are matched. Use a stable `SESSION_SIGNING_KEY` to keep authenticated context independent of API-key rotation.

## Checks and builds

```bash
npm run check
npm run export:server
npm run export:native
```

The server export supports EAS Hosting. After configuring an EAS project, deploy the server and use its HTTPS origin for native release builds.

```bash
eas deploy
eas build --profile development --platform android
eas build --profile production --platform all
```

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

The detailed product definition is in [FR.md](FR.md). Architecture and technical decisions are documented in [tech_stack.md](tech_stack.md).

## License

Context is released under the [MIT License](LICENSE). Copyright © 2026 Context contributors.

You may use, modify, and redistribute the software under that license, including its copyright and permission notice. Attribution to Context in derivative projects and write-ups is appreciated.
