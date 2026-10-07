# Context — Functional Requirements

## 1. Product Overview

**Context** is an AI accessibility companion for blind and low-vision users.

It is an accessible Expo mobile application for iOS and Android.

It helps users understand the **cultural context of visual environments and local areas**, not just the physical objects present.

Existing vision systems can answer:

> “What is in front of me?”

Context should additionally answer:

> “What is culturally significant here?”  
> “What kind of place is this?”  
> “Which visual references matter?”  
> “How are these references connected?”  
> “Explain this reference to me.”

Context combines:

- Computer vision for visual recognition
- Qloo for cultural entities, affinities, and cross-domain relationships
- Foreground location, when permitted, for locality context
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

---

# 4. Primary User Experience

The main interaction should be:

```text
User captures a scene or asks about the local area
        ↓
App requests foreground location when relevant
        ↓
If permitted, derive locality context; if denied, continue without location
        ↓
Vision system identifies objects and references when an image is available
        ↓
System selects culturally meaningful entities
        ↓
Qloo resolves and analyzes relevant entities and relationships
        ↓
System combines visual, Qloo, and available locality evidence when relevant
        ↓
Context generates a concise explanation
        ↓
Explanation is spoken to the user
        ↓
User may ask follow-up questions
        ↓
Agent performs additional entity, relationship, reference, or locality investigation when needed
```

The experience should be conversational.

---

# 5. Main User Modes

## 5.1 Scene Context

Purpose:

Help the user understand the overall cultural context of an environment.

Example user questions:

- “What kind of place is this?”
- “What cultural context am I missing?”
- “What is important here?”
- “Give me the vibe of this place.”

Expected behavior:

1. Capture or upload an image.
2. Identify visible entities.
3. Remove irrelevant objects.
4. Resolve culturally relevant entities through Qloo.
5. Analyze relationships between those entities.
6. Generate a short cultural-context explanation.
7. Read the response aloud.

Example:

> “This space contains several references connected to independent film, electronic music, and contemporary streetwear.”

---

## 5.2 Reference Explorer

Purpose:

Allow the user to understand one specific visual reference.

Example questions:

- “What is that poster?”
- “Why is that brand important?”
- “Explain the music reference.”
- “Tell me more about the thing on the wall.”

Expected behavior:

1. Identify the requested entity.
2. Resolve the entity through Qloo.
3. Retrieve relevant cultural context.
4. Explain it in simple language.
5. Allow follow-up questions.

---

## 5.3 Connection Explorer

Purpose:

Explain how multiple detected references relate culturally.

Example questions:

- “How do these things connect?”
- “Does the poster relate to the music?”
- “Why do these references appear together?”

Expected behavior:

1. Identify the relevant entities.
2. Query Qloo for affinities and relationships.
3. Find meaningful cross-domain connections.
4. Explain only relationships supported by available evidence.

Example:

> “The connection is not that these objects belong to the same company. Their audiences and cultural associations overlap across independent film, electronic music, and streetwear.”

---

## 5.4 Guided Exploration

Purpose:

Let the system guide the user through the most meaningful cultural references in a scene.

Example command:

> “Guide me through what is culturally important here.”

Expected behavior:

1. Analyze the scene.
2. Rank culturally meaningful references.
3. Ignore ordinary objects unless relevant.
4. Explain the strongest theme first.
5. Identify important individual references.
6. Allow the user to choose what to explore next.

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

## 5.5 Location Context

Purpose:

Help the user understand the cultural context of their local area and how visible references relate to it.

Example questions:

- “What kind of area am I in?”
- “What is culturally significant about this neighborhood?”
- “How does what I'm seeing relate to this area?”

Expected behavior:

1. Request foreground location permission when locality information is needed.
2. If permitted, obtain the current location and derive locality context, such as the neighborhood or surrounding area.
3. Investigate relevant cultural entities and relationships through Qloo where applicable.
4. Combine locality context with visual and Qloo evidence when relevant to the question.
5. Explain supported cultural significance and communicate uncertainty.
6. If location permission is denied or location is unavailable, continue using available scene context and allow the user to provide an area name.
7. Read the response aloud and support follow-up exploration.

---

# 6. Functional Requirements

## FR-01 — Image Capture

The system must allow the user to:

- Capture an image using the device camera
- Upload an existing image

The captured image must be sent for visual analysis.

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

The system must attempt to match detected cultural references with Qloo entities.

For each entity, the system should retain:

- Detected name
- Qloo entity ID
- Qloo entity type/category
- Match confidence where possible

Low-confidence matches must not be treated as confirmed.

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

The system must retain the current scene and available locality context during the conversation.

The user should be able to ask questions such as:

- “Tell me more.”
- “What about the poster?”
- “Why is that important?”
- “How does it connect to the music?”
- “Which reference matters most?”

The user should not have to recapture the image for every follow-up.

---

## FR-08 — Agentic Exploration

The system must support multi-step exploration when a user's question requires additional entity, relationship, reference, or locality investigation.

The system must determine which actions are needed to answer the question and carry relevant context across those steps.

Possible actions include:

- Inspect the scene
- Resolve an entity
- Analyze multiple entities
- Explore one reference
- Compare detected references
- Investigate locality context and its relationship to detected references
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

Example:

> “I can identify several objects, but I don't have enough reliable cultural references to give you meaningful cultural context.”

The system must not invent a cultural interpretation simply to provide an answer.

---

## FR-13 — Location-Aware Cultural Context

The system must support location-aware cultural context as part of the MVP.

The app must be able to request foreground location permission and, when granted, obtain the user's current location to derive locality context, such as the neighborhood or surrounding area.

When relevant to the user's question, the system must combine locality context with available visual and Qloo evidence to explain the area's cultural significance or how detected references relate to it.

The system must continue working if location permission is denied or location is unavailable. It must explain the limitation, use available scene and Qloo evidence, and allow the user to provide an area name for locality exploration.

Location access must follow the privacy requirements in Section 12. The system must communicate uncertainty and avoid unsupported cultural claims about an area or the people there.

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
- Responses must support automatic speech playback.
- Voice interaction should be supported.
- Important functionality must not depend on color.
- Focus states must be clear.
- Screen-reader navigation must follow a logical order.
- Users must be able to replay the most recent response.

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

Incorrect:

> “This person is wealthy and politically progressive.”

Acceptable:

> “The visible references include several brands associated with contemporary luxury fashion.”

---

# 12. Privacy Requirements

Images should not be stored permanently by default.

Location access must be foreground only and require the user's permission. The app must not perform background location tracking.

Precise location must not be stored permanently by default. Location permission denial must not prevent use of the app's other features.

The product should clearly communicate when:

- A camera is active
- An image is being analyzed
- Location is requested or used to derive locality context
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

The system must continue with available scene and Qloo evidence, explain that automatic locality context is unavailable, and allow the user to provide an area name.

Example:

> “I don't have your location, but I can still explore the scene. You can tell me the neighborhood or area if you'd like local context.”

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
- Voice input
- Text-to-speech output
- Accessible Expo mobile application for iOS and Android

### Optional

- Continuous live camera
- Video analysis
- Media audio-description mode
- Scene history
- User preference profiles

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
Capture image or choose Location Context
      ↓
Ask a scene or locality question
      ↓
Request foreground location when relevant
      ↓
If permitted, derive locality context; if denied, continue without location
      ↓
Vision identifies entities when an image is available
      ↓
Relevant entities selected
      ↓
Qloo resolves entities
      ↓
Qloo analyzes relationships
      ↓
Combine visual, Qloo, and available locality evidence when relevant
      ↓
Context generates explanation
      ↓
Response is spoken
      ↓
User asks follow-up
      ↓
Agent performs multi-step entity, relationship, reference, or locality exploration when needed
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

---

# 18. Product Principle

Context should not attempt to describe everything.

Its purpose is to identify and explain **meaningful cultural information about visual environments and local areas that a blind or low-vision user may otherwise miss**.

The core distinction is:

> **Vision identifies what is there. Qloo helps establish how those things relate culturally. Context explains why those relationships may matter.**
