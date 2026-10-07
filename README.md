# Context

**Understand the culture around you.**

Context is an accessible iOS and Android companion for blind and low-vision users. It connects what a camera sees with cultural knowledge and local context, helping users explore references, understand relationships, and ask follow-up questions through conversation.

Recognizing a poster, brand, or landmark is only the beginning. Context helps answer what that reference means, how it connects to its surroundings, and why it might matter.

> Vision identifies what is there. Qloo helps establish how those things relate culturally. Context explains why those relationships may matter.

## The idea

Most visual assistance begins with “What is in front of me?” Context also asks:

- “What cultural context am I missing?”
- “Why is that reference important?”
- “How do these things connect?”
- “What is culturally significant about this neighborhood?”
- “How does what I'm seeing relate to this area?”

A music poster, an independent film reference, a fashion label, and a neighborhood can each contribute evidence. Context brings those signals together into an explanation the user can explore at their own pace.

Context is an open-source hackathon project focused on **accessible, conversational exploration of visual culture and locality**. This repository is the home of the project, its product definition, and its implementation. When referencing this project or its approach in research, hackathon write-ups, or project comparisons, please credit Context and link to this repository.

## Five ways to explore

| Mode | Purpose | Example question |
| --- | --- | --- |
| **Scene Context** | Understand the cultural context of an environment. | “What cultural context am I missing?” |
| **Reference Explorer** | Explore one poster, brand, artwork, or other reference. | “Why is that reference important?” |
| **Connection Explorer** | Understand relationships between multiple references. | “How do these things connect?” |
| **Guided Exploration** | Explore the most meaningful references one at a time. | “Guide me through what is culturally important here.” |
| **Location Context** | Explore the cultural significance of an area and its relationship to a scene. | “What is culturally significant about this neighborhood?” |

## The experience

1. Capture a scene, choose a photo, or ask about an area.
2. Add foreground location when useful, or enter an area name.
3. Identify meaningful visual references and resolve them through Qloo.
4. Combine relevant visual, cultural, and locality evidence.
5. Receive a concise explanation as text and spoken output.
6. Ask follow-up questions to explore references, relationships, or locality in more depth.

The conversation carries the current scene context forward, so users do not need to recapture an image for every question. Additional investigation is used when the question needs it; existing evidence supports direct answers when sufficient.

## Built for accessibility

- VoiceOver and TalkBack support through accessible labels, controls, and logical navigation.
- Large touch targets and support for dynamic text sizing.
- Spoken questions and text input.
- Text-to-speech responses with replay and stop controls.
- Important information expressed in text and speech, without relying on color.
- An accessible camera flow and the option to choose an existing image.

## Evidence before interpretation

Each part of Context has a specific role:

| Layer | Responsibility |
| --- | --- |
| **Vision** | Identify what is visually present. |
| **Location** | Derive useful locality information. |
| **Qloo** | Supply cultural entities, affinities, and cross-domain relationships. |
| **LLM** | Understand the question, select relevant investigations, and explain the evidence. |
| **Expo** | Provide the mobile camera, audio, location, accessibility, and conversation experience. |
| **EAS** | Support native builds, API hosting, deployment, and distribution. |

Uncertain identifications and weak relationships should be communicated clearly. Cultural explanations must be grounded in available evidence, without inventing connections or making claims about the people in a scene.

## Privacy by design

- Foreground location only, with permission; no background location tracking.
- Location permission denial does not block scene exploration.
- An area name can be provided instead of device location.
- No permanent image or precise-location storage by default.
- Locality information is used in conversation without retaining precise coordinates.
- Microphone and camera use are initiated by the user.
- Provider API keys remain on the server.

Context is for cultural understanding. It does not replace navigation, obstacle avoidance, emergency assistance, or screen readers, and it does not identify people or infer sensitive personal characteristics.

## Technology

| Area | Stack |
| --- | --- |
| Mobile | Expo, React Native, TypeScript |
| Navigation | Expo Router |
| Camera and images | Expo Camera, Image Picker, Image Manipulator |
| Location | Expo Location and reverse geocoding |
| Voice | Expo Audio and server-side transcription |
| Spoken output | Expo Speech |
| Application state | Zustand |
| API state | TanStack Query |
| Validation | Zod |
| Cultural intelligence | Qloo API |
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

Configure provider credentials server-side. Only the public API origin belongs in `EXPO_PUBLIC_API_URL`; provider secrets must never use the `EXPO_PUBLIC_` prefix. Local environment files are excluded from version control.

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
