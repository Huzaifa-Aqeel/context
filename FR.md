# Context — Functional Requirements

> Historical requirements. [FR_v2.md](FR_v2.md) is the current product specification and supersedes conflicting decisions below.

## 1. Product Overview

**Context** is an AI accessibility companion for blind and low-vision users.

It is an accessible Expo mobile application for iOS and Android.

It helps users understand the **cultural context of visual environments and local areas**, not just the physical objects present.

It also connects that world to **culture the user already knows or is interested in**, using a small, voluntarily provided taste profile.

Existing vision systems can answer:

> “What is in front of me?”

Context should additionally answer:

> “What is culturally significant here?”  
> “What kind of place is this?”  
> “Which visual references matter?”  
> “How are these references connected?”  
> “Explain this reference to me.”\
> “What here connects to things I know?”\
> “What here would stand out to me?”

Context combines:

- Computer vision for visual recognition
- Qloo for cultural entities, affinities, and cross-domain relationships
- Foreground location, when permitted, for locality context
- Voluntary cultural interests, resolved through Qloo, for personal taste context
- An LLM for interpretation and conversation
- Text-to-speech for accessible output

---

# 2. Target Users

Primary users:

- Blind users
- Low-vision users

The product is intended for general everyday use and is not limited to students or a specific age group.

Potential environments include:

- Cafés
- Restaurants
- Events
- Workplaces
- Museums
- Shops
- Streets and neighborhoods
- Hotels
- Airports
- Social gatherings
- Entertainment venues
- Homes
- Video and media content

---

# 3. Core Problem

Blind users can use vision systems to identify objects such as:

- Posters
- Clothing
- Brands
- books
- Artwork
- Products
- Logos
- Venues
- Album covers
- Film references

However, recognizing an object does not necessarily explain its **cultural significance or relationship to the surrounding environment**.

For example:

A vision system may identify:

- Boiler Room poster
- A24 poster
- Carhartt WIP clothing
- Vinyl records

Context should help explain that these references may collectively indicate connections to:

- Electronic music
- Independent film
- Streetwear
- Contemporary creative culture

The system must not claim that such interpretations are absolute facts.

There is also an attention problem: a sighted person can scan many references in parallel, while spoken descriptions are heard one at a time. Listing every reference can overwhelm the user. Context must prioritize meaningful information, including references connected to stated interests when personalization is enabled.

Personal taste must help users notice relevant references and understand unfamiliar culture through familiar examples, while preserving access to references beyond their interests.

---

# 4. Primary User Experience

The main interaction should be:

```text
User optionally shares a few cultural interests, or skips taste onboarding
        ↓
Qloo resolves supported interests; user controls whether personalization is enabled
        ↓
User captures a scene or asks about the local area
        ↓
App makes permitted locality available for place resolution and area questions
        ↓
Derive area evidence only when the scene or question needs it; if denied, continue without location
        ↓
Vision system identifies objects and references when an image is available
        ↓
System selects culturally meaningful entities
        ↓
Qloo resolves and analyzes relevant entities and relationships
        ↓
System combines visual, Qloo, available locality, and enabled taste evidence when relevant
        ↓
System prioritizes references and selects supported familiar explanations
        ↓
Context generates a concise explanation
        ↓
Explanation is spoken to the user
        ↓
User may ask follow-up questions
        ↓
Agent performs additional entity, relationship, reference, locality, or taste-affinity investigation when needed
```

The experience must be one conversation. Scene understanding is the default; reference, connection, guided, and area exploration are capabilities within it, not modes the user must select before capture.

---

# 5. One Assistant, Conversational Exploration

Context must present one assistant: **show it a scene, receive cultural understanding, then explore through conversation**. The capabilities below must not appear as five top-level modes before capture.

The home screen must make **Capture a scene** and **Choose a photo** primary actions, with **Ask Context** available as an explicitly started voice conversation. Capturing or choosing a photo starts analysis; communicate this before the action. The microphone must never start automatically.

Show taste profile setup, an accessible personalization control, and an interest count in the Personalization tab. Changing personalization must preserve the same detections while allowing different ordering, highlighting, and supported explanations.

Show **Location context** as an optional evidence preference, not a separate exploration mode. Enabling device location explicitly requests foreground permission. When enabled and already permitted, derive available locality for scene analysis and conversational questions without repeatedly requesting permission.

After recognition, show a concise answer, one contextual speech control that stops active playback or replays a completed answer, and a simple list of confirmed notable references only when any exist. Do not show a separate confidence label, an empty reference section, preset exploration buttons, or a mode menu. The orb is the Ask Context control: tap once to record, tap again to stop, transcribe with Whisper, submit the question automatically, and speak the answer. On the conversation screen, the orb also stops current speech and exposes an accessible Replay answer action without another visible button; the native header provides a back arrow to the prior screen. There must be no separate Start speaking, Stop recording, or Ask Context submit button. Questions about references, connections, guided exploration, and the surrounding area continue the same scene conversation. Keep a clearly labelled Home back control in the Scene header for another capture, but omit the Scene title and duplicate capture button. On native devices, coordinate result focus with the scene speech preference; announce listening, processing, speaking, loading, and errors accessibly.

The **Speak scene results automatically** preference in Personalization controls only automatic app-generated speech for a newly analyzed scene. Scene analysis must always produce and render a concise accessible text result. When this preference is off, do not request automatic TTS; move native screen-reader focus to the result and have its accessible label begin “Scene analysis complete.” A screen reader remains free to read the interface. When the preference is on, speak the scene result through the existing TTS path, but do not also live-announce or automatically focus the full result while that speech starts. Replay remains an explicit action in either state. This preference does not change Ask Context recording, transcription, or answer playback.

When a user returns to Home with a current photo scene, the continuation action must return to that Scene result and its Ask Context orb. It must not automatically read the same scene answer again. If there is conversation history but no photo scene, continuation opens the standalone Ask Context conversation.

Personal Taste is a shared context layer across these capabilities. It must not introduce a separate experience or recommendation section. Every capability must remain usable without a taste profile or with personalization disabled.

## 5.1 Scene Understanding — Default Behavior

Purpose:

Help the user understand the overall cultural context of an environment.

Example user questions:

- “What kind of place is this?”
- “What cultural context am I missing?”
- “What is important here?”
- “Give me the vibe of this place.”
- “What here would stand out to me?”

Expected behavior:

1. Capture or upload an image.
2. Identify visible entities.
3. Remove irrelevant objects.
4. Resolve culturally relevant entities through Qloo.
5. Analyze relationships between those entities.
6. When personalization is enabled, use supported taste affinities to help prioritize references without omitting culturally significant information.
7. Generate a short cultural-context explanation.
8. Read the response aloud.

Example:

> “This space contains several references connected to independent film, electronic music, and contemporary streetwear.”

---

## 5.2 Explain a Reference — Follow-up Action

Purpose:

Allow the user to understand one specific visual reference.

Example questions:

- “What is that poster?”
- “Why is that brand important?”
- “Explain the music reference.”
- “Tell me more about the thing on the wall.”
- “Explain this through something I already know.”

Expected behavior:

1. Identify the requested entity.
2. Resolve the entity through Qloo.
3. Retrieve relevant cultural context.
4. Explain it in simple language, using a comparison to a stated interest when Qloo evidence supports that comparison.
5. Allow follow-up questions.

---

## 5.3 Connect References — Follow-up Question

Purpose:

Explain how multiple detected references relate culturally.

Example questions:

- “How do these things connect?”
- “Does the poster relate to the music?”
- “Why do these references appear together?”
- “What here connects to my interests?”

Expected behavior:

1. Identify the relevant entities.
2. Query Qloo for affinities and relationships.
3. Find meaningful cross-domain connections.
4. Explain only relationships supported by available evidence.
5. Distinguish relationships among visible references from relationships between those references and the profile.

Example:

> “The connection is not that these objects belong to the same company. Their audiences and cultural associations overlap across independent film, electronic music, and streetwear.”

---

## 5.4 Guided Exploration — Conversational Behavior

Purpose:

Let the system guide the user through the most meaningful cultural references in a scene.

Example command:

> “Guide me through what is culturally important here.”

Expected behavior:

1. Analyze the scene.
2. Rank culturally meaningful references.
3. Ignore ordinary objects unless relevant.
4. Offer a choice to start with familiar interests or discover something new when supported taste evidence is available; otherwise explain the strongest theme first.
5. Identify important individual references.
6. Allow the user to choose what to explore next.
7. Respect the chosen exploration strategy without hiding references outside the user's interests.

Personalized opening, when supported by Qloo evidence:

> “I found six references. Two connect to interests you've shared. Would you like to start with those or explore something new?”

Example conversation:

**Context**

> “I found three cultural references worth exploring. The strongest theme connects electronic music and independent film.”

**User**

> “Start with the music.”

**Context**

> Explains the relevant music reference.

**User**

> “Does anything else here connect to it?”

**Context**

> Uses Qloo to investigate relationships with other detected entities.

---

## 5.5 Location Context — Evidence Layer

Purpose:

Help the user understand the cultural context of their local area and how visible references relate to it.

Example questions:

- “What kind of area am I in?”
- “What is culturally significant about this neighborhood?”
- “How does what I'm seeing relate to this area?”
- “What in this area connects to things I know?”
- “Does this environment overlap with the interests I've shared?”

Expected behavior:

1. Request foreground permission only when the user explicitly enables device location; automatic use checks existing permission without prompting.
2. If permitted, obtain the current location and derive locality context, such as the neighborhood or surrounding area.
3. Investigate relevant cultural entities and relationships through Qloo where applicable.
4. Combine locality context with visual and Qloo evidence when relevant to the question.
5. Explain supported cultural significance and communicate uncertainty.
6. If location permission is denied or location is unavailable, continue using available scene context.
7. Read the response aloud and support follow-up exploration.
8. When personalization is enabled, explain supported overlap between locality or scene evidence and stated interests. A lack of overlap must not be presented as proof that the user is unfamiliar with an area.

---

# 6. Functional Requirements

## FR-01 — Image Capture

The system must allow the user to:

- Capture an image using the device camera
- Upload an existing image

The captured or selected image must be sent for visual analysis without reducing its pixel dimensions in the app. If the full-resolution image exceeds the supported request size, explain the limit and let the user choose or capture another image; do not silently downscale it.

---

## FR-02 — Visual Entity Detection

The system must identify potentially meaningful visual entities such as:

- Brands
- Logos
- Artists
- Films
- TV shows
- Music
- Fashion
- Products
- Restaurants
- Venues
- Artwork
- Books
- Games
- Cultural landmarks

Each detection should include a confidence level where available.

Vision must keep the **visual carrier** (such as a poster, shirt, logo, sign, cover, or product) separate from its candidate cultural subject. Its output should retain the visible or confidently recognized name, prominent readable text, approximate position when clear, a literal physical description, candidate entity type, and uncertainty. Vision establishes what appears in the image; it must not infer Qloo relationships, neighborhood significance, or the user's taste.

A title and its visible author or artist on one cover are one physical reference with a related entity, not two objects. The app must preserve the visual title even when only the related artist, author, or brand can be grounded in Qloo.

---

## FR-03 — Cultural Relevance Filtering

The system must not send every detected object to Qloo.

It should distinguish between:

### Potentially meaningful

- Recognizable poster
- Brand
- Artist
- Film
- Fashion label
- Venue
- Album
- Cultural product

### Usually irrelevant

- Generic chair
- Plain wall
- Water bottle
- Exit sign
- Ordinary table

The system may retain ordinary objects when they are relevant to the user's question.

---

## FR-04 — Qloo Entity Resolution

The system must attempt to match detected cultural subjects with supported Qloo entities. Posters, clothing, logos, and covers are visual carriers; they do not each require a separate Qloo flow. The core grounding flows are movie/TV, music artist, book, brand, and place/venue, with other supported Qloo types used when appropriate.

Artwork, albums, and generic products must remain identifiable visual references even when they are not supported as first-class Qloo Insights types. When vision reliably identifies a related artist, author, or manufacturer, the app may ground that related entity through Qloo while retaining the artwork title, album title, or product as the photographed subject. It must not claim that Qloo verified the unsupported item. If no supported Qloo subject can be identified, the app must skip Qloo resolution for that detection and still tell the user what was visually identified.

For each entity, the system should retain:

- Detected name
- Qloo entity ID
- Qloo entity type/category
- Match confidence where possible
- Whether Qloo grounded the visible subject directly or a related entity

Low-confidence matches must not be treated as confirmed.
Nearby places or Qloo recommendations must never be described as visible in the image. Use locality to disambiguate duplicate place matches when available; do not fetch nearby-place context merely because location is enabled, and do not assume a chosen photo was taken at the device's current location.

---

## FR-05 — Multi-Entity Cultural Analysis

When multiple Qloo entities are identified, the system must be able to analyze:

- Affinity between entities
- Shared cultural signals
- Cross-domain relationships
- Recurring categories
- Strong and weak relationships

The system should use these relationships as evidence for the final explanation.

---

## FR-06 — Single Reference Exploration

The system must allow deeper exploration of one detected cultural entity.

The explanation may include:

- What the reference is
- Its cultural category
- Related cultural entities
- Relevant cross-domain relationships
- Why it may be significant in the current scene

---

## FR-07 — Conversational Follow-Up

The system must retain the current scene, available locality context, and enabled taste context during the conversation. Changes to the profile or personalization setting must take effect on subsequent answers; disabled or removed interests must not continue to influence them through cached taste evidence.

The user should be able to ask questions such as:

- “Tell me more.”
- “What about the poster?”
- “Why is that important?”
- “How does it connect to the music?”
- “Which reference matters most?”
- “What here connects to something I know?”
- “Start with something familiar.”
- “Help me discover something new.”

The user should not have to recapture the image for every follow-up.

---

## FR-08 — Agentic Exploration

The system must support multi-step exploration when a user's question requires additional entity, relationship, reference, locality, or taste-affinity investigation.

The system must determine which actions are needed to answer the question and carry relevant context across those steps.

Possible actions include:

- Inspect the scene
- Resolve an entity
- Analyze multiple entities
- Explore one reference
- Compare detected references
- Investigate locality context and its relationship to detected references
- Investigate Qloo affinities between scene or locality references and voluntarily provided interests
- Find an evidence-supported familiar reference to explain an unfamiliar one
- Request additional visual information

The agent must only perform additional investigation when it improves the user's answer.

Agentic behavior must not be added solely for complexity.

---

## FR-09 — Prioritization

When many references are detected, the system must prioritize the most culturally informative ones.

Priority may consider:

- Detection confidence
- Qloo entity match confidence
- Strength of relationships
- Relevance to the user's question
- Distinctiveness within the scene
- Relevance to voluntarily provided cultural interests, when personalization is enabled

Personalized prioritization must follow this order:

1. Necessary environmental information already available to the system, including relevant safety information.
2. The user's explicit question.
3. Cultural significance and evidence quality.
4. Personal taste relevance.

Taste affinity must not turn an uncertain visual detection or ambiguous Qloo match into a confirmed identification. References outside the profile must remain available for exploration. This ordering does not make Context a navigation, obstacle-avoidance, or emergency-assistance system.

The system should avoid overwhelming the user with unnecessary details.

---

## FR-10 — Spoken Output

All primary responses must support text-to-speech.

The user should be able to hear:

- Scene summary
- Reference explanation
- Relationship explanation
- Error or uncertainty messages

Visual text output may also be displayed.

---

## FR-11 — Voice Input

The system should support spoken questions.

The user should be able to interact without relying on visual controls.

Example:

> “What am I missing here?”

---

## FR-12 — Uncertainty Handling

The system must communicate uncertainty when:

- An object cannot be confidently identified
- A Qloo match is uncertain
- Cultural relationships are weak
- Too few meaningful references exist
- Location or locality context is unavailable or uncertain
- A taste interest cannot be resolved uniquely or is unsupported by Qloo
- A comparison to stated interests has weak or missing Qloo evidence

No profile match means only that the available evidence does not show overlap with the interests the user shared. It must not imply that the user dislikes, does not know, or cannot understand a reference or area.

Example:

> “I can identify several objects, but I don't have enough reliable cultural references to give you meaningful cultural context.”

The system must not invent a cultural interpretation simply to provide an answer.

---

## FR-13 — Location-Aware Cultural Context

The system must support location-aware cultural context as part of the MVP.

The app must be able to request foreground location permission and, when granted, obtain the user's current location to derive locality context, such as the neighborhood or surrounding area.

When relevant to the user's question, the system must combine locality context with available visual and Qloo evidence to explain the area's cultural significance or how detected references relate to it.

Location must be integrated as an evidence layer in the unified assistant, without requiring a Location Context mode. Automatic refresh must not open permission dialogs; explicit opt-in requests foreground permission.

The system must continue working if location permission is denied, location is unavailable, or locality cultural evidence cannot be retrieved. It must explain the limitation and use available scene and Qloo evidence.

Location access must follow the privacy requirements in Section 12. The system must communicate uncertainty and avoid unsupported cultural claims about an area or the people there.

When personalization is enabled, locality and scene evidence may also be compared with resolved taste interests to support cultural orientation. Claims of overlap must be grounded in Qloo evidence.

---

## FR-14 — Personal Taste Profile

The system must support a small voluntary personal taste profile as part of the MVP. Building the capability is required; providing interests and enabling personalization are optional for the user.

### Onboarding and control

Cultural Interests is accessed through one **My Interests** entry in Personalization. Its voice screen keeps the app's visual style and shows only a **My taste profile** switch, the voice orb, and brief interaction feedback. With the switch on, the orb reads the saved interests and accepts additions or removals. With it off, the orb starts the normal taste onboarding flow; a completed response replaces the prior grouped interests. This switch chooses the voice workflow; the separate **Personalize cultural context** setting in Personalization controls whether saved interests affect exploration. Do not show separate Start conversation, End conversation, forms, text inputs, chips, category cards, step indicators, or a manual match-review flow.

- The orb remains visible in idle, speaking, listening, and processing states. Tap once to hear the prompt and then record; tap again while listening to finish or while speaking to end the conversation. Its accessible label changes with the state, including **Set up my interests** or **Update my interests**, **Stop recording**, **Processing**, and **End conversation**. State must be available to VoiceOver/TalkBack without relying on motion or color; respect reduced motion.
- The first tap explicitly authorizes the voice session. Request microphone permission only after that action. With no profile, speak one prompt inviting anything the user likes across movies/TV, music, books/podcasts, food/dining, places/travel, brands, video games, and other interests. Tell them they can mention as many or as few as they want, with a brief example.
- With an existing profile, speak its current interests and prompt one edit response with a clear format such as “Delete from movies and TV Interstellar. Add to movies and TV Black Panther.” Allow clear category-wide removal. Do not insert a separate yes/no turn.
- Wait for the entire prompt to finish before recording one response. Never record before the explicit orb tap or capture the assistant's own prompt. A natural pause or second orb tap finishes the response.
- Reuse existing Expo audio, Groq Whisper transcription, configurable reasoning/extraction, Orpheus speech, API routes, and local Zustand session storage. Do not introduce a different speech provider or a separate onboarding architecture.
- Organize the stated interests into arrays under `movies_tv`, `music_artists`, `books_podcasts`, `dining_food`, `places_travel`, `brands`, `video_games`, and `other`, allowing multiple entries in every category. Leave unused categories empty. Preserve only explicitly provided interests; do not infer new interests or sensitive traits. Support more than the previous ten-interest cap, within the response-size and recording safeguards.
- Save the complete grouped interests locally and give a short completion message. The grouped interests are voluntarily stated context, not verified cultural entities.
- Qloo must still resolve interests before they become personalization entities. Automatically use only unique confirmed matches. Ambiguous/unmatched items remain in the locally saved groups but do not become verified entities; do not force users to repair them. A Qloo outage must not prevent saving the grouped response.
- Empty/failed/cancelled responses must not overwrite an existing profile. Navigation, backgrounding, session clearing, or cancellation must stop recording and discard late results and temporary audio.
- Editing must extract explicit add, remove, or clear-category operations instead of regenerating the whole profile. Preserve untouched interests and existing Qloo matches; resolve newly added interests through Qloo before using them as personalization entities. If an instruction is ambiguous, ask one clarification and make no changes. Users may skip this screen, edit interests through another orb interaction, disable personalization, and forget the profile in the **Personalization** tab. Keep the accessible **Personalize cultural context** control and interest count in that tab only. The tab must place the explanation before the switch in screen-reader order.
- The **Personalization** tab contains the optional taste profile and location controls. Each explanation must precede its left-aligned switch in visual and TalkBack reading order. These controls must not be repeated on Home, Scene, Conversation, or area-entry screens. Home and Personalization are compact, adjacent horizontal bottom tabs on Android and remain visible throughout capture, exploration, and the voice subpages.
- Location context is controlled only by the foreground-location toggle in Personalization. The app does not offer manual area-name entry.
- All exploration capabilities remain available when interests are skipped, unsupported, or personalization is disabled. Keep Cultural Interests free of provider and implementation language; explain the relevant interest matching in the Personalization tab.

### Required uses when relevant

When personalization is enabled and evidence supports it, the system must be able to use the profile to:

- Prioritize meaningful scene references connected to stated interests, supporting selective attention without listing everything.
- Identify connections between visible references and the user's resolved interests.
- Explain unfamiliar references through familiar cultural anchors, with connections established by Qloo evidence. The LLM must not invent an analogy to a profile interest.
- Personalize guided exploration by offering a choice between starting with familiar interests and discovering something new.
- Explain supported cultural overlap between scene/locality evidence and the profile to help the user orient themselves in an environment.

Example questions include:

- “What here would stand out to me?”
- “What here connects to things I know?”
- “Explain this through something I already know.”
- “Does this place connect to my interests?”

### Evidence and boundaries

- Taste must prioritize and contextualize information, never hide important environmental information or override the explicit question and cultural significance.
- Toggling personalization must keep detected references unchanged. Only presentation ordering, highlighting, and explanation strategy may change.
- Vision determines what is present; a profile affinity is not proof that an object is visible. Clearly distinguish visible references, profile interests, and related Qloo entities.
- Treat interests as user-stated context, not a complete record of their knowledge or preferences. Ask or qualify comparisons when familiarity is uncertain.
- Do not infer sensitive characteristics, personality, income, identity, or preferences the user did not provide.
- Do not automatically recommend products, media, or places. Recommendations require a separately defined future feature.
- Follow the privacy requirements in Section 12. Scene exploration must continue normally if taste resolution or affinity investigation is unavailable, with the limitation communicated.

---

# 7. Qloo's Role

Qloo should provide the cultural intelligence layer.

Qloo is responsible for helping the system understand:

```text
Entity A
   ↓
cultural affinity

Entity B
   ↓
cross-domain relationship

Entity C
   ↓
shared cultural context
```

Qloo should be used for:

- Entity resolution
- Affinity analysis
- Cross-domain relationships
- Related cultural entities
- Cultural clustering
- Contextual relationships between multiple detected entities
- Resolution of voluntarily provided taste interests
- Evidence-supported affinities between scene/locality references and profile interests
- Familiar cultural anchors for explaining unfamiliar references

Qloo should not be used for:

- Object detection
- OCR
- Obstacle detection
- Navigation
- Facial recognition
- Accessibility routing

---

# 8. LLM Role

The LLM is responsible for:

- Understanding user questions
- Selecting relevant detected entities
- Determining when Qloo queries are required
- Combining Qloo evidence
- Combining available locality context with visual and Qloo evidence when relevant
- Using enabled taste evidence to prioritize attention and select supported familiar explanations
- Respecting the choice to start with familiar interests or explore something new
- Producing concise explanations
- Managing follow-up conversation
- Expressing uncertainty

The LLM must not replace Qloo by inventing unsupported cultural relationships.

---

# 9. Vision Model Role

The vision system is responsible for determining what is visually present.

It may identify:

- Objects
- Text
- Logos
- Brands
- Posters
- Clothing
- Artwork
- Media references
- Environmental details

The vision model must not be treated as the cultural intelligence source.

---

# 10. Accessibility Requirements

The product must be designed for screen-reader and voice-first use.

Requirements:

- All controls must have accessible labels.
- Primary actions must be keyboard accessible.
- The camera action must be easy to locate.
- Scene responses must support optional automatic speech playback, controlled independently of screen-reader speech.
- Voice interaction should be supported.
- Important functionality must not depend on color.
- Focus states must be clear.
- Screen-reader navigation must follow a logical order.
- Users must be able to replay the most recent response.
- Taste onboarding, interest review/editing, and the personalization control must support screen readers and voice input without requiring visual interaction.

---

# 11. Safety and Interpretation Rules

The system must not infer sensitive personal characteristics from appearance.

It must not infer:

- Race
- Ethnicity
- Religion
- Political beliefs
- Sexual orientation
- Health conditions
- Income
- Personality
- Social class

The system should describe **cultural relationships between recognized entities**, not make claims about the people present.

Voluntarily provided tastes must not be used to infer sensitive traits, personality, or a person's likely behavior. Personalization must not suppress necessary environmental information already available to the system. Context remains a cultural companion, not a safety or navigation tool.

Incorrect:

> “This person is wealthy and politically progressive.”

Acceptable:

> “The visible references include several brands associated with contemporary luxury fashion.”

---

# 12. Privacy Requirements

Images should not be stored permanently by default.

Location access must be foreground only and require the user's permission. The app must not perform background location tracking.

Precise location must not be stored permanently by default. Location permission denial must not prevent use of the app's other features.

Taste personalization must be optional and transparent. Only interests deliberately provided or confirmed by the user may enter the profile; the app must not silently build a behavioral or demographic profile from images, location, or conversation history.

The app must explain that interest names are sent to Qloo for resolution and affinity analysis, and that relevant taste context may be sent to the explanation provider when personalization is enabled. Send only the interests needed for the requested explanation.

Taste data must remain in session memory by default. Any storage across sessions requires explicit user opt-in, separate from scene/image retention. Users must be able to remove interests, delete the profile, and disable personalization; subsequent analysis must stop using disabled or deleted taste context.

The product should clearly communicate when:

- A camera is active
- An image is being analyzed
- Location is requested or used to derive locality context
- Taste interests are collected, sent to providers, or used to personalize an explanation
- Data is sent to external APIs

The MVP should avoid:

- Facial identification
- Background recording
- Continuous camera recording
- Background location tracking

---

# 13. Failure Cases

## No cultural references found

Response:

> “I can describe the physical scene, but I don't see enough distinctive cultural references to provide cultural context.”

---

## Low-confidence entity

Response:

> “I may be seeing an A24 poster, but I'm not confident enough to use that identification yet.”

---

## Weak Qloo relationships

Response:

> “I identified several references, but I don't see a strong enough cultural relationship between them to describe them as one theme.”

---

## Vision failure

The system should ask the user to:

- Move closer
- Adjust the camera
- Capture another image

---

## Location denied or unavailable

The system must continue with available scene and Qloo evidence and explain that locality context is unavailable.

Example:

> “I don't have your location, but I can still explore the scene. You can enable location context if you'd like local context.”

---

## Taste profile skipped, disabled, or unresolved

The system must continue with ordinary scene and locality exploration. If an interest cannot be resolved, request clarification without inventing a match.

If no supported overlap is found, explain the evidence limit and leave all culturally meaningful references available.

Example:

> “I don't have enough Qloo evidence to connect these references to the interests you've shared, but I can still explain the scene or explore a specific reference.”

---

# 14. MVP Scope

The hackathon MVP should include:

### Required

- Camera capture
- Image upload
- Vision analysis
- Cultural entity extraction
- Qloo entity resolution
- Qloo multi-entity analysis
- Scene-context explanation
- Reference exploration
- Conversational follow-ups
- Multi-step agentic exploration when needed to answer the user's question
- Location-aware cultural context
- Small voluntary personal taste profile with Qloo resolution and an enable/disable control
- Taste-aware attention and evidence-supported explanations through familiar cultural references
- Personalized guided exploration with a familiar-or-new choice
- Evidence-supported comparison of scene/locality context with stated interests
- Voice input
- Text-to-speech output
- Accessible Expo mobile application for iOS and Android

### Optional

- Continuous live camera
- Video analysis
- Media audio-description mode
- Scene history

---

# 15. Out of Scope for MVP

Context is not intended to replace:

- Blind navigation systems
- GPS navigation
- Object avoidance tools
- Screen readers
- OCR applications
- Accessibility databases
- Emergency assistance tools
- Facial recognition systems

---

# 16. Primary MVP Flow

```text
Open Context
      ↓
Optionally provide cultural interests or skip taste onboarding
      ↓
Resolve supported interests through Qloo and choose whether to personalize
      ↓
Capture a scene or choose a photo to start analysis, or Ask Context directly
      ↓
Include locality when location context is enabled and permitted
      ↓
If location is denied or unavailable, continue with other evidence
      ↓
Vision identifies entities when an image is available
      ↓
Relevant entities selected
      ↓
Qloo resolves entities
      ↓
Qloo analyzes relationships
      ↓
Combine visual, Qloo, available locality, and enabled taste evidence when relevant
      ↓
Prioritize culturally significant references and supported familiar explanations
      ↓
Context generates explanation
      ↓
Response is spoken
      ↓
User asks follow-up
      ↓
Agent performs multi-step entity, relationship, reference, locality, or taste-affinity exploration when needed
```

---

# 17. Example MVP Interaction

**User**

> “What am I missing here?”

**Context**

> “I found several cultural references. The strongest connection is between independent film, electronic music, and contemporary streetwear.”

**User**

> “What are the important references?”

**Context**

> “The two strongest references are an A24 poster and a Boiler Room poster.”

**User**

> “Explain Boiler Room.”

**Context**

> Gives a concise explanation grounded in retrieved cultural information.

**User**

> “How does it relate to the rest of the room?”

**Context**

> Uses Qloo relationships between the detected entities and explains the strongest supported connections.

Personalized variation, when the user has supplied interests and Qloo supports the relationship:

**User**

> “What here would stand out to me?”

**Context**

> Highlights a confirmed reference connected to a stated interest, briefly mentions other significant references, and offers to explore familiar interests or discover something new.

**User**

> “Explain the unfamiliar one through something I know.”

**Context**

> Investigates a supported Qloo relationship to a profile interest and uses it as an explanatory anchor. If no comparison is supported, explains the reference directly and states the limitation.

---

# 18. Product Principle

Context should not attempt to describe everything.

Its purpose is to identify and explain **meaningful cultural information about visual environments and local areas that a blind or low-vision user may otherwise miss**.

Context must also help connect that world to the culture the user already knows. Personal taste provides attention and explanatory context across the product, while preserving access to unfamiliar and culturally significant references.

> **Don't just describe unfamiliar culture. Anchor it in culture the user already knows, when the evidence supports it.**

The core distinction is:

> **Vision identifies what is there. Location supplies locality. Qloo establishes cultural relationships, including connections to voluntary taste interests. Context explains what matters and helps the user explore it.**
