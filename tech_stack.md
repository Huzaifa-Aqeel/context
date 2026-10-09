# Context — Tech Stack

> Historical architecture notes for the earlier product scope. [FR_v2.md](FR_v2.md) is the current specification and supersedes conflicting decisions below.

## 1. Architecture

Context will be an **Expo React Native mobile application** with its server APIs hosted through **EAS Hosting**.

```text
Expo Mobile App
      │
      ├── Camera
      ├── Voice
      └── Location
      │
      ▼
Expo Router API Routes
EAS Hosting
      │
      ├── Vision Model
      ├── Qloo API
      ├── LLM
      └── Speech Transcription
      │
      ▼
Structured Cultural Context
      │
      ▼
Expo Mobile App
      │
      ▼
Text + Spoken Response
```

The project should remain primarily within the Expo and TypeScript ecosystem. The mobile experience presents one assistant: scene understanding by default, with reference, connection, guided, and area follow-ups in the same conversation. Location and optional personal taste are evidence layers, not top-level modes.

---

# 2. Core Stack

| Layer | Technology |
|---|---|
| Mobile | Expo + React Native |
| Language | TypeScript |
| Routing | Expo Router |
| Camera | expo-camera |
| Image Selection | expo-image-picker |
| Location | expo-location |
| Audio Recording | Expo Audio |
| Text-to-Speech | Groq Orpheus + Expo Audio |
| State | Zustand |
| Server State | TanStack Query |
| Backend API | Expo Router API Routes |
| Backend Hosting | EAS Hosting |
| Cultural Intelligence | Qloo API |
| Vision | Multimodal vision model |
| Conversation / Reasoning | LLM |
| Validation | Zod |
| Build | EAS Build |
| Distribution | EAS Submit |
| App Updates | EAS Update |
| Deployment Automation | EAS Workflows |

---

# 3. Mobile Application

Use:

```text
Expo
React Native
TypeScript
Expo Router
```

The mobile app handles:

- Camera capture
- Image upload
- Device location
- Voice input
- Spoken responses
- Accessible UI
- Active scene conversation
- Voluntary cultural-interest onboarding and personalization controls
- User permissions

The same Expo project will contain server API routes where practical.

---

# 4. Navigation

Use:

```text
expo-router
```

Suggested routes:

```text
app/
├── (tabs)/
│   ├── (home)/
│   │   ├── index.tsx
│   │   ├── camera.tsx
│   │   ├── scene.tsx
│   │   └── conversation.tsx
│   └── personalization/
│       ├── index.tsx
│       ├── taste.tsx
│       └── location.tsx
│
├── api/
│   ├── scene/
│   ├── reference/
│   ├── location/
│   └── audio/
```

Primary flow:

```text
Home
  ↓
Capture Scene
  ↓
Automatic Cultural Understanding
  ↓
Notable References + One Conversation
```

---

# 5. Camera

Use:

```text
expo-camera
expo-image-picker
```

Support:

- Capture image
- Select existing image
- Camera permissions
- Image preview
- Retake

MVP should analyze individual images rather than continuously uploading video frames.

---

# 6. Location

Use:

```text
expo-location
```

Location-aware cultural context is part of the product.

Location can help answer:

- “What kind of area am I in?”
- “What is culturally significant about this neighborhood?”
- “Does what I'm seeing connect with this area?”
- “What cultural context should I know about where I am?”

Location flow:

```text
Device GPS
    ↓
Latitude / Longitude
    ↓
Reverse Geocoding
    ↓
Locality
    ↓
Qloo Locality Context
    ↓
Scene + Location Analysis
```

Location-aware cultural context is required for the MVP. Granting foreground location permission remains optional for the user.

Device location is explicitly enabled through an accessible preference. Automatic requests check existing foreground permission without prompting, derive coarse locality, and discard precise coordinates. Locality-provider failures return warnings while retaining scene evidence.

The core camera experience must work when the user denies location permission.

---

# 7. Reverse Geocoding

Use:

```typescript
Location.reverseGeocodeAsync()
```

Derive useful locality information such as:

```text
Neighborhood
City
Region
Country
```

Exact street addresses should not be required unless specifically needed.

---

# 8. Voice Input

The user should be able to interact primarily through speech.

Flow:

```text
Press microphone
      ↓
Record speech
      ↓
Send audio to API route
      ↓
Speech-to-text
      ↓
Question
      ↓
Context processing
```

Use Expo's supported audio recording APIs.

Speech transcription should happen through a server-side provider so provider API keys remain private.

---

# 9. Text-to-Speech

Use:

```text
Groq Orpheus (`canopylabs/orpheus-v1-english`) through a server API, with Expo Audio playback
```

Primary responses should support automatic spoken output.

Controls:

```text
Speak
Stop
Replay
```

All spoken responses must also be available as text.

---

# 10. Accessibility

The application must be designed primarily for blind and low-vision users.

Support:

```text
VoiceOver
TalkBack
Dynamic font sizes
Screen readers
System contrast settings
Reduced motion
Accessible focus order
```

Use React Native accessibility properties such as:

```tsx
accessibilityLabel
accessibilityHint
accessibilityRole
accessibilityState
```

Requirements:

- Large touch targets
- Every icon has an accessible label
- Primary actions are easy to locate
- No important information depends only on color
- Screen-reader navigation follows logical order
- User can replay the latest response
- Camera capture must be accessible without visual precision

---

# 11. Application State

Use:

```text
Zustand
```

Example:

```typescript
type AppState = {
  currentScene: Scene | null;
  messages: ConversationMessage[];
  locationEnabled: boolean;
  voiceEnabled: boolean;
};
```

Use:

```text
TanStack Query
```

for API state and requests.

---

# 12. Backend

Backend functionality will use:

```text
Expo Router API Routes
TypeScript
EAS Hosting
```

Do not create a separate Fastify, Express, Railway, Render, or Cloud Run service for the MVP.

Expo Router API routes use files such as:

```text
+api.ts
```

Example:

```text
app/
└── api/
    ├── scene/
    │   ├── analyze+api.ts
    │   └── ask+api.ts
    │
    ├── reference/
    │   └── explore+api.ts
    │
    ├── location/
    │   └── context+api.ts
    │
    └── audio/
        └── transcribe+api.ts
```

These server functions will be deployed through EAS Hosting.

---

# 13. Runtime Consideration

EAS Hosting runs server functions using a **Cloudflare Workers/V8 environment**, not a traditional long-running Node.js server.

Therefore:

- Prefer Web APIs such as `fetch`
- Avoid Node-specific dependencies when unnecessary
- Avoid libraries requiring native binaries
- Avoid persistent in-memory server state
- Keep APIs stateless where possible
- Use external storage when persistent state is required

---

# 14. API Routes

Required endpoints:

```text
POST /api/scene/analyze
POST /api/scene/ask
POST /api/reference/explore
POST /api/location/context
POST /api/audio/transcribe
```

---

# 15. Scene Analysis

Endpoint:

```text
POST /api/scene/analyze
```

Input:

```typescript
type AnalyzeSceneRequest = {
  image: string;

  location?: {
    latitude: number;
    longitude: number;
  };
};
```

Output:

```typescript
type AnalyzeSceneResponse = {
  sceneId: string;
  summary: string;
  entities: ResolvedEntity[];
  themes: CulturalTheme[];

  locationContext?: LocationContext;

  confidence: "low" | "medium" | "high";
};
```

---

# 16. Scene Processing

```text
Image
   ↓
Vision Model
   ↓
Detected Entities
   ↓
Cultural Relevance Filter
   ↓
Qloo Entity Resolution
   ↓
Qloo Affinity Analysis
   │
   ├── Scene relationships
   └── Location context
   ↓
LLM
   ↓
Accessible explanation
```

---

# 17. Vision Model

Use a multimodal model capable of image understanding.

Its responsibility is:

> **What is visually present?**

Return structured data.

Example:

```typescript
type VisionEntity = {
  label: string;
  category: string;
  confidence: number;
};
```

Possible entities:

```text
Brand
Logo
Film
Artist
Album
Book
Restaurant
Venue
Fashion label
Artwork
Game
Poster
Product
Landmark
```

The vision model should not be treated as the primary cultural intelligence system.

---

# 18. Cultural Relevance Filtering

Not every object should be sent to Qloo.

Example scene:

```text
A24 poster
Boiler Room flyer
Chair
Coffee machine
Carhartt WIP logo
Exit sign
Table
```

Potential Qloo entities:

```text
A24
Boiler Room
Carhartt WIP
```

Usually ignore:

```text
Chair
Table
Exit sign
Generic coffee machine
```

unless relevant to the user's question.

---

# 19. Qloo Integration

Create a dedicated service:

```text
lib/qloo/
```

Responsibilities:

- Entity search
- Entity resolution
- Affinity analysis
- Cross-domain relationships
- Reference exploration
- Multi-entity context
- Location-aware cultural context

Example:

```typescript
interface QlooService {
  resolveEntity(
    name: string
  ): Promise<QlooEntity | null>;

  resolveEntities(
    names: string[]
  ): Promise<QlooEntity[]>;

  analyzeAffinities(
    entityIds: string[]
  ): Promise<QlooAffinityResult>;

  exploreEntity(
    entityId: string
  ): Promise<QlooEntityContext>;

  getLocalityContext(
    latitude: number,
    longitude: number
  ): Promise<QlooLocalityContext>;
}
```

Exact implementation should follow Qloo's available API endpoints.

---

# 20. Entity Resolution

Flow:

```text
Vision:
"A24 poster"
      ↓
Qloo search
      ↓
Possible matches
      ↓
Name + type + context comparison
      ↓
Match accepted/rejected
```

Store:

```typescript
type ResolvedEntity = {
  detectedName: string;
  detectedCategory: string;

  qlooId?: string;
  qlooName?: string;
  qlooType?: string;

  visionConfidence: number;
  matchConfidence?: number;
};
```

Uncertain matches must not support strong conclusions.

---

# 21. Cultural Evidence Layer

Qloo responses should first be transformed into structured application evidence.

```typescript
type CulturalEvidence = {
  entities: ResolvedEntity[];
  relationships: CulturalRelationship[];
  themes: string[];
  confidence: number;
};
```

Possible analysis:

```text
Strong relationships
Weak relationships
Cross-domain connections
Repeated affinity patterns
Dominant clusters
Isolated entities
```

The LLM should explain this evidence rather than invent relationships independently.

The implementation uses an evidence-selection plan for final responses. The reasoning model chooses current facts, shared tags, measured relationships, locality records, or supported taste pairs; the server validates those selections and renders source-backed spoken sentences. Free-form model prose is not emitted as cultural fact. Weak affinities are qualified and cannot become authorship, collaboration, or stylistic analogy. Taste evidence is revalidated after every investigation step, and only relevant supported anchors reach the reasoning provider.

---

# 22. Location-Aware Cultural Context

Location should become another evidence source.

Example:

```text
Scene

Independent bookstore
Music poster
Coffee shop
Street art

        +

Location

Neighborhood / locality

        ↓

Qloo
        ↓

Local cultural relationships

        ↓

Context explanation
```

Location can help answer:

> “How does what I'm seeing relate to this area?”

It must not override visual evidence.

---

# 23. Location Context

```typescript
type LocationContext = {
  latitude: number;
  longitude: number;

  neighborhood?: string;
  city?: string;
  region?: string;
  country?: string;

  culturalThemes?: string[];
  relatedEntities?: string[];

  confidence?: number;
};
```

Precise coordinates should not be unnecessarily exposed to the LLM after useful locality information has been derived.

---

# 24. LLM

The LLM handles:

- Understanding the user's question
- Deciding which cultural information is relevant
- Tool selection
- Follow-up conversation
- Combining cultural evidence
- Explaining relationships
- Managing uncertainty

Inputs may include:

```text
User question
Detected entities
Qloo entities
Qloo affinities
Location context
Current scene state
Conversation history
```

---

# 25. Agentic Orchestration

Use:

```text
LLM native tool calling
+
TypeScript orchestration
```

Do not introduce a large agent framework unless necessary.

Conceptual tools:

```typescript
inspectScene()

resolveEntity()

resolveEntities()

analyzeConnections()

exploreReference()

getLocationContext()
```

The system should decide which tools are required for each question.

---

# 26. Example Agent Flow

User:

> “What cultural context am I missing?”

```text
inspectScene
      ↓
resolveEntities
      ↓
analyzeConnections
      ↓
getLocationContext
      ↓
generate explanation
```

User:

> “Tell me about that poster.”

```text
Find poster in existing scene
      ↓
exploreReference
      ↓
respond
```

User:

> “How does that connect to this neighborhood?”

```text
Poster entity
      +
Location context
      ↓
Qloo relationship analysis
      ↓
respond
```

---

# 27. Scene Conversation

The application should preserve context for the current scene.

Store:

```text
Scene ID
Vision entities
Qloo entities
Cultural evidence
Location context
Conversation messages
Enabled taste profile and supported taste-affinity evidence
```

The user should not have to recapture the scene for every question.

## Personal Taste context

FR-14 makes a small voluntary taste profile a required MVP capability across all five modes. Onboarding suggests 5–10 interests, accepts fewer, supports up to 10, and can be skipped. Resolve supported interests through Qloo and retain confirmed IDs, names, and types; clarify ambiguous or unsupported names.

The client must provide accessible interest review/edit/delete and a **Personalize cultural context** control. Keep the profile and active setting in Zustand session state by default; persistent accounts or a database are not required. Any retention across sessions requires explicit opt-in.

Server requests must receive only the relevant enabled interests. Authenticate resolved taste evidence alongside other client-carried provider evidence, and distinguish profile interests from visible scene entities and related Qloo references. Profile changes, deletion, or disabling personalization must invalidate derived taste evidence for subsequent answers.

Use verified Qloo affinities for taste-aware reference prioritization, familiar explanatory anchors, familiar-or-new guided exploration, and scene/locality overlap. Do not assume that an absent match proves unfamiliarity, and do not infer personal traits or silently recommend products or places. Retain the ordering in FR-09: necessary available environmental information, explicit question, cultural significance/evidence quality, then personal taste relevance.

---

# 28. Session Storage

Avoid relying on memory inside an EAS server function.

For the simplest MVP, the client can retain the structured scene state and send the relevant context with follow-up requests.

If server-side temporary sessions are required, use:

```text
Upstash Redis
```

This is external persistence; application compute remains hosted on EAS.

---

# 29. Persistent Database

A database is optional for the MVP.

If persistent accounts or history are later required:

```text
Supabase PostgreSQL
```

Potential tables:

```text
users
scenes
scene_entities
conversations
messages
```

Do not store user images permanently by default.

---

# 30. Image Handling

Preferred flow:

```text
Capture image
      ↓
Send for analysis
      ↓
Vision model processes image
      ↓
Structured entities returned
      ↓
Discard image
```

Images should not be permanently stored unless the user explicitly enables such functionality.

---

# 31. Validation

Use:

```text
Zod
```

Validate:

- Mobile requests
- Vision responses
- LLM structured responses
- Qloo responses
- Tool arguments
- Location data
- API responses

---

# 32. Privacy

Do not implement:

```text
Facial identification
Background camera recording
Permanent location tracking
Automatic recognition of people
Continuous location history
```

Camera and location usage must always be clear to the user.

---

# 33. Secrets

All sensitive API keys remain server-side.

Examples:

```text
QLOO_API_KEY
LLM_API_KEY
VISION_API_KEY
TRANSCRIPTION_API_KEY
```

Never include secrets with:

```text
EXPO_PUBLIC_
```

Only non-sensitive client configuration may use public Expo environment variables.

---

# 34. EAS Hosting

Use:

```text
EAS Hosting
```

for Expo Router:

- API routes
- Server functions
- Server-side secrets
- LLM requests
- Qloo requests
- Vision requests
- Speech-transcription requests

EAS Hosting supports Expo Router API routes and server functions when using compatible server output.

Deployment:

```bash
npx expo export --platform web
eas deploy
```

---

# 35. EAS Build

Use:

```text
EAS Build
```

for native builds.

```bash
eas build --platform all
```

This produces Android and iOS application binaries through Expo's hosted build infrastructure.

Use build profiles such as:

```text
development
preview
production
```

---

# 36. EAS Submit

Use:

```text
EAS Submit
```

for:

```text
Apple App Store / TestFlight
Google Play
```

Production flow:

```text
Source
  ↓
EAS Build
  ↓
Android / iOS binaries
  ↓
EAS Submit
  ↓
App Store / Google Play
```

---

# 37. EAS Update

Use:

```text
EAS Update
```

for compatible over-the-air JavaScript and asset updates.

This allows eligible app changes to be shipped without producing a new native binary.

Native dependency changes still require a new EAS Build.

---

# 38. EAS Workflows

Use:

```text
EAS Workflows
```

for automated:

```text
Build
Deploy
Submit
```

Suggested workflow:

```text
Push to main
      ↓
Tests / type check
      ↓
Deploy server through EAS
      ↓
Build production mobile app when required
```

EAS Hosting integrates with EAS Workflows for deployments.

---

# 39. Repository Structure

A single Expo repository is preferred.

```text
context/
│
├── app/
│   ├── (tabs)/
│   │   ├── (home)/
│   │   │   ├── index.tsx
│   │   │   ├── camera.tsx
│   │   │   ├── scene.tsx
│   │   │   └── conversation.tsx
│   │   └── personalization/
│   │       ├── index.tsx
│   │       ├── taste.tsx
│   │       └── location.tsx
│   │
│   └── api/
│       ├── scene/
│       │   ├── analyze+api.ts
│       │   └── ask+api.ts
│       │
│       ├── reference/
│       │   └── explore+api.ts
│       │
│       ├── location/
│       │   └── context+api.ts
│       │
│       └── audio/
│           └── transcribe+api.ts
│
├── components/
├── hooks/
├── stores/
├── lib/
│   ├── qloo/
│   ├── vision/
│   ├── llm/
│   ├── location/
│   └── orchestration/
│
├── schemas/
├── types/
├── prompts/
│
├── app.json
├── eas.json
├── package.json
└── tsconfig.json
```

Avoid a separate backend repository unless the architecture later requires one.

---

# 40. Core Models

```typescript
type Scene = {
  id: string;

  entities: ResolvedEntity[];

  culturalEvidence: CulturalEvidence;

  locationContext?: LocationContext;

  createdAt: string;
};

type CulturalRelationship = {
  source: string;
  target: string;

  strength?: number;

  description: string;
};

type ConversationMessage = {
  role: "user" | "assistant";
  content: string;
};
```

---

# 41. Deployment Architecture

```text
                         EXPO / EAS

                    ┌─────────────────┐
                    │   EAS Build     │
                    └────────┬────────┘
                             │
                    iOS / Android App
                             │
                             ▼
                    ┌─────────────────┐
                    │ Context Mobile  │
                    │      App        │
                    └────────┬────────┘
                             │
                             ▼
                    ┌─────────────────┐
                    │  EAS Hosting    │
                    │ Expo API Routes │
                    └────────┬────────┘
                             │
           ┌─────────────────┼──────────────────┐
           ▼                 ▼                  ▼
       Vision API          Qloo API           LLM API
                             │
                             ▼
                     Cultural Context
```

Optional external state services:

```text
Upstash Redis
Supabase
```

These store data only when required. Application server compute remains on EAS Hosting.

---

# 42. MVP Scope

Build:

```text
Expo mobile app
Camera capture
Image upload
Voice input
Location permission
Location-aware cultural context
Vision entity detection
Cultural relevance filtering
Qloo entity resolution
Qloo affinity analysis
Qloo locality analysis
Voluntary personal taste profile and Qloo interest resolution
Taste-aware attention and familiar cultural explanations
Personalized guided exploration and scene/locality overlap
Personalization enable/disable and profile editing/deletion
Conversational follow-up
Reference exploration
Connection exploration
Text output
Text-to-speech
Accessible interface
Expo Router API routes
EAS Hosting
EAS Build
```

Do not initially build:

```text
Continuous video analysis
Background camera usage
Permanent location tracking
Facial recognition
Navigation
Obstacle detection
Long-term behavioral profiling
Complex social functionality
```

---

# 43. Responsibility Separation

```text
Vision
→ What is visually present?

Location
→ Where is the user?

Qloo
→ How do the recognized entities and locality
  relate culturally, including supported
  connections to voluntarily shared interests?

LLM
→ What does the user want to understand,
  which evidence matters, and how should it
  be explained?

Expo
→ Camera, voice, location, accessibility,
  conversation and mobile experience.

EAS
→ Build, API hosting, deployment,
  updates and app distribution.
```

The LLM must not invent cultural relationships when Qloo does not provide sufficient supporting evidence.

## Configurable provider implementation

Vision, reasoning and interest extraction share a provider-neutral OpenAI-compatible Chat Completions adapter in `lib/ai/`. `LLM_API_KEY`, `LLM_API_URL` and `LLM_MODEL` select the shared provider/model; `VISION_*` may override the image model or the full image provider connection. Explicit generic configuration takes precedence over legacy Groq analysis defaults. Model names are not allowlisted; vision must accept images and reasoning must support validated function calls.

Provider dialect settings are optional: `*_TOKEN_PARAMETER`, `*_JSON_MODE`, `*_REQUEST_OPTIONS` and `*_PROVIDER_NAME` for LLM/vision. Alibaba's non-thinking default and token-parameter normalization do not change the evidence schemas or agent workflow. Completed investigations are removed from subsequent tool menus; other confirmed references remain available. Completed actions are also represented as native assistant tool calls and tool-result messages backed by current evidence, rather than relying only on a textual completed-action list. Server-side duplicate and step-limit guards remain authoritative.

`TRANSCRIPTION_*` and `TTS_*` independently configure compatible audio API roots, keys and models, retaining current Groq Whisper/Orpheus defaults. Speech continues to use WAV output and the app's selected voices/directions. Endpoints with incompatible audio or chat protocols require another adapter; an environment change cannot make a text-only model process images. New endpoints must have explicitly supplied credentials rather than silently inheriting another provider's key.

Health returns readiness and safe provider names for privacy disclosures, never keys or endpoint URLs. All settings remain server-side; local changes require a server restart, and hosted changes require updated environment settings/redeployment. `SESSION_SIGNING_KEY` can keep evidence authentication independent of API-key rotation.


## Voice-first cultural interests

The Cultural Interests route presents one explicit Start conversation → spoken prompt → single recorded response → transcription → grouped-interest extraction → local save/completion flow. The orb is mounted only during the active conversation and responds to idle, speaking, listening and processing, with live accessible status text and reduced-motion support. End hides it immediately; during recording, End submits the captured response. Native metering supports a six-second end-of-response pause; explicit End remains available where metering is unavailable.

Reuse Expo Audio, the existing Groq Whisper/Orpheus-compatible audio routes and shared SpeechSequence; configured reasoning models extract the eight requested interest arrays through the existing taste resolve route's categorized format. Preserve all stated groups in Zustand session memory. Resolve names through Qloo in batches of at most eight, auto-confirm only unique matches, and retain unresolved names only as stated local interests. Support up to 100 extracted names for a bounded single response, with a two-minute recording safeguard. No disk persistence or new storage provider is introduced; clear/forget removes grouped interests and verified profile.
