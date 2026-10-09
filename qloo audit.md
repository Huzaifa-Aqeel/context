# Qloo usefulness audit — 8 October 2026

> Historical evaluation of the earlier general-scene product. [FR_v2.md](FR_v2.md) defines the current four priority use cases and shelf-ranking contract.

## Scope and method

This is an audit of the **current implementation**, not a proposal for what Context could eventually do. I assumed the reference named below had been read correctly from a realistic photo. I did **not** call vision, Groq transcription, or Groq speech. The scene path used the app's `analyzeScene`, Qloo entity resolver, Qloo facts/affinity adapter, `explore`, and grounded answer renderer. The 40 capture-condition comparisons used a fixed evidence selector so the results show what the app can actually render from the same evidence without model choice varying between runs. The Ask Context probes used the configured live reasoning model and real Qloo adapter. These direct server-function runs do not validate microphone, playback, screen-reader focus, HTTP signing, or a device session.

The volunteered taste profile was **Radiohead** (artist), **Interstellar** (film), and **Nike** (brand), all uniquely Qloo-resolved. Location was **Williamsburg, Brooklyn, New York**. Qloo returned a five-place sample: Domino Park, Music Hall of Williamsburg, Baby's All Right, Wythe Hotel, and Isola Brooklyn. This is a sample of place records, not an assessment of the whole neighborhood. The same current-device locality was used for every image. A chosen photo may have been taken elsewhere; the app currently applies device locality to captures and chosen photos alike. In the tables, **N** means no taste/no location, **T** taste only, **L** location only, and **TL** both. The user's action for every row is to capture or choose the described photo and hear its scene answer. A “taste” answer is the client-side `scenePresentation` appended to the server answer after taste evidence loads. A quoted excerpt marked `…` omits repeated text, not a different conclusion.

One important distinction: for an unresolved reference with no local evidence, `analyzeScene` returns the initial capture sentence “I could not confidently identify the cultural references in this image. Tell me the name of something you noticed, or try a closer image.” The controlled `explore` pass for the same default question instead says “I do not have enough confirmed cultural evidence…”. The matrices below use the **initial capture sentence** for N/T because that is what a user first hears. Live Ask Context outputs are quoted separately below. For TL on unresolved scenes, the app can calculate taste affinity against nearby places even though it has **no confirmed visual reference**; `scenePresentation` then appends its generic no-visible-match sentence. This TL behavior follows the current client code and the measured place affinities; it is not a claim that a live model uttered that exact combination in this run.

## Capture tests: ten scene types × four contexts

### 1. Poster — Ferrari Formula 1 poster on a café wall

Assumed detection: `Ferrari`, category `brand`, confidence 0.96. Qloo search returned several Ferrari-related brand records; the app did **not** confirm one. No Ferrari fact or scene relationship was available. This is a miss despite a legible, culturally recognizable poster.

| Test | What the app/Qloo does; evidence | Answer returned | Useful to a blind user? What changed? |
| --- | --- | --- | --- |
| N | Resolves the detected brand; keeps it uncertain. | “I could not confidently identify the cultural references in this image… try a closer image.” | **No.** The user is told to recapture a correctly read poster. |
| T | Same unresolved detection; no visible target for taste analysis. | Same initial answer. | **No change.** Taste cannot rescue the failed entity match. |
| L | Also queries five Williamsburg place records. | “The area supplied is Williamsburg. Local cultural context comes from a small sample of Qloo place records.” | **Weak.** The area is named, but the Ferrari poster is not explained. |
| TL | Taste analysis can use the local places, not Ferrari; no confirmed visible reference is highlighted. | Area sentence, then “No strong supported interest connection was returned… all references remain available.” | **Confusing.** Qloo actually returned strong affinities for some local places; the answer still says nothing about Ferrari. |

### 2. Clothing — Nike jacket with visible name

Assumed detection: `Nike`, category `brand`. Qloo uniquely matched Nike and returned a useful description of athletic footwear/apparel plus fashion/sport tags. The profile contains the exact same Nike entity. Qloo also reported high aggregate affinities to Radiohead and Interstellar, but the exact match is the most meaningful personal evidence.

| Test | What the app/Qloo does; evidence | Answer returned | Useful? What changed? |
| --- | --- | --- | --- |
| N | Confirms Nike; reads its Qloo fact. | “Qloo describes Nike: Nike is a global brand specializing in athletic footwear, apparel, equipment, and accessories…” | **Somewhat.** Identifies the brand, but not that it is a jacket or where it is. |
| T | Adds exact profile match. | Base answer + “Nike is the same Qloo reference as Nike, an interest you shared. 1 reference connects to your interests…” | **Minor value, clumsy wording.** “Nike…same…Nike” is redundant; the visible item still lacks clothing detail. |
| L | Fetches Williamsburg records, but the default answer selects the Nike fact. | Same as N. | **No meaningful location change; extra Qloo work.** |
| TL | Fetches locality and taste evidence; visible exact match remains the focus. | Same as T. | **No meaningful location change.** |

### 3. Brand — IKEA sign in a shopping center

Assumed detection: `IKEA`, category `brand`. The category filter found the unique IKEA brand despite an unfiltered search being dominated by store-place results. Qloo described home furnishings and flat-pack/design tags. It also returned aggregate affinity to all three profile interests, highest to Radiohead in this test.

| Test | What the app/Qloo does; evidence | Answer returned | Useful? What changed? |
| --- | --- | --- | --- |
| N | Confirms and describes IKEA. | “IKEA is a global home furnishing brand known for affordable, stylish furniture, home decor, and smart storage solutions.” | **Useful basic identity.** No interpretation of the particular sign or store. |
| T | Adds the highest-scoring taste affinity. | Base + “Qloo returned a cultural affinity between IKEA and your interest in Radiohead. This suggests cultural overlap, not a specific similarity…” | **Weak or distracting.** It cannot say *why* IKEA relates to Radiohead. |
| L | Fetches Williamsburg; default answer remains IKEA description. | Same as N. | **No useful location change.** |
| TL | Fetches both; visible-brand affinity remains focus. | Same as T. | **No useful combined effect.** |

### 4. Book — *Dune* on a book spine

Assumed detection: `Dune`, category `book`. Qloo's exact/alias matching uniquely resolved **Dune (Dune, #1)** and provided a plot description and science-fiction tags. Qloo measured strong affinity (about 0.81) to the profile's *Interstellar* film.

| Test | What the app/Qloo does; evidence | Answer returned | Useful? What changed? |
| --- | --- | --- | --- |
| N | Confirms the book and selects its fact. | “Paul Atreides… becomes a leader on the desert planet Arrakis…” | **Partly.** Gives plot, but fails to lead with “This is the novel *Dune*” and why the book matters in culture. |
| T | Adds the *Interstellar* affinity. | Base + “Qloo returned a cultural affinity between Dune (Dune, #1) and your interest in Interstellar… not a specific similarity…” | **Potentially valuable anchor, weak execution.** A blind user hears that there is a connection but not its substance. |
| L | Fetches local places; answers from book fact. | Same as N. | **No meaningful change.** |
| TL | Both evidence sources available; spoken view stays book + taste affinity. | Same as T. | **Location adds nothing to this question.** |

### 5. Artwork — reproduction of *The Starry Night*

Assumed detection: `The Starry Night`, category `artwork`. Qloo search returned unrelated similarly named places/books/TV records, and the app has no artwork type mapping. It kept the reference unconfirmed. No artwork fact was used.

| Test | What the app/Qloo does; evidence | Answer returned | Useful? What changed? |
| --- | --- | --- | --- |
| N | Fails to resolve the named painting. | “I could not confidently identify the cultural references in this image…” | **No.** A correctly recognized painting becomes a generic failure. |
| T | No confirmed artwork target. | Same as N. | **No taste value.** |
| L | Returns a Williamsburg sample instead of artwork context. | “The area supplied is Williamsburg…” | **Irrelevant to the painting.** |
| TL | Can compare profile to local places, not the painting. | Area sentence + generic “No strong supported interest connection…” | **Irrelevant and potentially misleading.** |

### 6. Product — iPhone on a shop display

Assumed detection: `iPhone`, category `product`. Qloo search was dominated by repair-shop place records; no exact product entity was confirmed. The app did not fall back to the related **Apple** brand because that brand was not itself detected and named. That conservative choice avoids inventing a Qloo match but leaves this use case unanswered.

| Test | What the app/Qloo does; evidence | Answer returned | Useful? What changed? |
| --- | --- | --- | --- |
| N | Keeps iPhone unresolved. | “I could not confidently identify the cultural references…” | **No.** It neither identifies the product nor offers a supported brand-level explanation. |
| T | No confirmed visible target. | Same as N. | **No change.** |
| L | Samples Williamsburg venues. | “The area supplied is Williamsburg…” | **Irrelevant to the product.** |
| TL | Taste can relate the profile to venues, not the iPhone. | Area sentence + generic no-visible-match sentence. | **No product value.** |

### 7. Logo — A24 sticker on a laptop

Assumed detection: `A24`, category `brand`. Qloo uniquely matched A24 and returned a useful independent-film description and tags such as Auteur Cinema and Independent Film. Qloo returned aggregate affinities to the three profile interests, highest to Radiohead in this run.

| Test | What the app/Qloo does; evidence | Answer returned | Useful? What changed? |
| --- | --- | --- | --- |
| N | Confirms A24 and reads its Qloo fact. | “A24 is an American independent entertainment company specializing in film and television production and distribution…” | **Yes for identification.** It gives the cultural domain behind an otherwise opaque logo. |
| T | Adds Radiohead affinity. | Base + “Qloo returned a cultural affinity between A24 and your interest in Radiohead… not a specific similarity…” | **Low added value.** The profile's *Interstellar* film interest is a more intelligible anchor even though its returned score was slightly lower; the ranking chooses score, not explanatory fit. |
| L | Fetches Williamsburg but answers A24. | Same as N. | **No useful location change.** |
| TL | Both available; A24 plus Radiohead affinity. | Same as T. | **No combined benefit here.** |

### 8. Venue — Blue Note Jazz Club entrance sign

Assumed detection: `Blue Note Jazz Club`, category `venue`. Qloo returned two exact place records with the same name. Without a disambiguating city/address, the app correctly refused to choose one, but it did not use the supplied Williamsburg locality to disambiguate. There is no venue fact in the resulting scene.

| Test | What the app/Qloo does; evidence | Answer returned | Useful? What changed? |
| --- | --- | --- | --- |
| N | Leaves duplicate exact place records unresolved. | “I could not confidently identify the cultural references…” | **No.** A blind user hears failure despite a readable venue name. |
| T | No confirmed venue target. | Same as N. | **No change.** |
| L | Looks up Williamsburg places independently. | “The area supplied is Williamsburg…” | **Weak.** It does not connect or disambiguate this specific Blue Note sign. |
| TL | Can compare taste to the five sample places, not Blue Note. | Area sentence + generic no-visible-match sentence. | **Misplaced personalization.** |

### 9. Album cover — Radiohead's *OK Computer* in a record shop

Assumed detection: `OK Computer`, category `album`. Qloo search had multiple album editions and another exact-name TV record. The app has no album type mapping and did not confirm one entity. Even with Radiohead in the profile, the album is not linked to that artist because no confirmed album entity enters the scene evidence.

| Test | What the app/Qloo does; evidence | Answer returned | Useful? What changed? |
| --- | --- | --- | --- |
| N | Leaves cover unresolved. | “I could not confidently identify the cultural references…” | **No.** An especially promising cultural reference fails at resolution. |
| T | Radiohead profile cannot rescue unresolved album. | Same as N. | **No personal value despite an obvious possible link; the app rightly does not invent it.** |
| L | Samples local venues. | “The area supplied is Williamsburg…” | **Irrelevant to the cover.** |
| TL | Local-place taste affinities may be computed, album still unresolved. | Area sentence + generic no-visible-match sentence. | **Irrelevant.** |

### 10. Film reference — *Interstellar* poster

Assumed detection: `Interstellar`, category `film`. Type filtering uniquely matched the 2014 film despite albums/books sharing the name. Qloo returned a long film synopsis and tags; the profile contains the exact film entity.

| Test | What the app/Qloo does; evidence | Answer returned | Useful? What changed? |
| --- | --- | --- | --- |
| N | Confirms film; reads a 350-character truncation of its Qloo description. | “Interstellar (2014), directed by Christopher Nolan… As Earth's environment collapses… wormhole….” | **Mostly.** Identifies film, but the abrupt `…` is poor spoken copy. |
| T | Adds exact profile match and generic exploration invitation. | Base + “Interstellar is the same Qloo reference as Interstellar, an interest you shared…” | **Minor.** Recognition matters; repeated title and template text add little. |
| L | Fetches Williamsburg; default answer remains film synopsis. | Same as N. | **No meaningful location change.** |
| TL | Both available; film plus exact taste match. | Same as T. | **No combined effect.** |

Across these 40 comparisons, location changed the initial answer meaningfully only when there was **no confirmed visual reference**, and then it usually displaced the user's visible subject with a generic locality sentence. Taste changed five confirmed-reference cases, but the biggest gain was an exact interest match; most non-exact affinities added a vague sentence. The five unresolved cases stayed unresolved with taste. The Qloo data is valuable for recognized books, films, brands and logos; the current resolution and answer-selection layers often fail to turn it into a useful blind-first answer.

## Ask Context: supported question types and evidence paths

Ask Context records after an explicit orb tap, transcribes the question, sends the saved signed scene/locality/profile and up to 20 visible conversation messages to `/api/scene/ask`, then speaks the latest answer. It **does not resend the image**. A saved scene provides visual entities/observations; Qloo facts and relationships remain attached to it. The agent has at most four investigation turns and can choose `resolveEntity`, `exploreReference`, `analyzeConnections`, `getLocationContext`, and `analyzeTaste`; a strong, explicitly requested familiar comparison may also call the Qloo single-interest fact lookup. The final model selects at most five evidence items, and the server renders the spoken answer. It does not replay the whole scene automatically, but renderer preambles and broad selections can make the answer feel like a context dump.

| User question type currently supported | Available evidence/tools | Boundary or likely weak behavior |
| --- | --- | --- |
| “What am I seeing?” / “What cultural context is here?” | Saved visual observations, confirmed Qloo facts, relationships; optional locality and taste | Without confirmed matches, loses even correctly detected subject names in the spoken cultural answer; no fresh image analysis. |
| “What is this poster/book/logo?” / “Tell me more about A24.” | Existing fact; `exploreReference` for confirmed entity, adding related Qloo records | Can append tangential related entities and repeat a description already in scene evidence. |
| “What is [named thing]?” before/after capture | `resolveEntity` for a name in the utterance; then Qloo facts/connections | Exact-name ambiguity can fail; user-named references must not be described as visible. |
| “How do these connect?” / “How does A connect to B?” | Existing shared tags/affinities; `analyzeConnections`, sometimes `exploreReference` | With only one visible reference, “these” can mean Qloo recommendations the user never saw. |
| “Guide me through this scene.” / familiar versus new | Shared tags across confirmed **visible** records, selected facts, strong taste pairs | Opens with a qualified theme but may insert unrelated locality taste pairs when there is no visible match. |
| “What kind of area am I in?” / “What is significant here?” | Foreground-derived locality; `getLocationContext`; five Qloo place facts | Lists sampled places rather than explaining the neighborhood's character/history; no claim beyond sampled records is justified. |
| “How does what I'm seeing relate to this area?” | Current scene facts + sampled local-place tags; optional Qloo locality lookup | Can only name shared record tags. No overlap produces “no supported evidence,” not a useful local interpretation. |
| “What here connects to my interests?” | `analyzeTaste` for confirmed visible and local-place references; exact/aggregate affinity | Can answer about nearby places instead of the photo. High aggregate scores are often too generic to explain *why*. |
| “Explain A through something I know.” | Strong taste pair plus one Qloo anchor fact lookup; shared tags if present | Qualifies unsupported analogies, but may repeat A's description and select a less intelligible interest by score. |
| “Is there an exit/chair/sign?” | Prior vision environmental observations, including confidence/position if saved | Can use only observations already returned with the original image; no navigation or obstacle guidance. |

It does not currently support an image-aware question about a **new object outside the saved detections** unless the user names it, multiple photos of the same retained scene, direct OCR as a separate fallback, visual pointing/camera positioning, or a verified answer about an artwork/product missing from Qloo. Disabling taste removes profile evidence from later requests; disabling location removes locality from later requests, while the scene remains.

## Live Ask Context probes: actual answers and calls

These used the configured live reasoning model, real Qloo adapter, assumed visual entities, and an already obtained Williamsburg locality when specified. The calls listed are **app-level Qloo methods**, not a count of HTTP requests inside each method. Quoted answers below preserve their meaningful wording; long Qloo descriptions are shortened with `…` for this report.

| User does / question | Qloo calls and evidence | Actual answer behavior | Usefulness and specificity |
| --- | --- | --- | --- |
| From A24 logo: “What is A24?” | `exploreReference`; A24 fact + four related entities | Defines A24, then adds affinity to MUBI and an Independent Film tag. | **Mostly useful**, but extra MUBI relation was not needed to answer “what is it?” |
| Same A24 scene: “Explain A24 through something I know.” | `analyzeTaste`, `getEntityFact`; A24 + Radiohead/*Interstellar* affinities | Describes A24 **twice**, separately describes Radiohead, says affinity “does not establish a specific similarity,” then cites *Interstellar* affinity. | **Weak.** It avoids inventing a link but does not provide the requested familiar explanation; repetition makes speech longer. |
| Same one-logo scene: “How do these connect?” | `analyzeConnections`, `exploreReference`, `analyzeTaste` in one run | Explains affinities between A24 and MUBI/Vice. | **Misleading referent.** Only A24 was visible. It should first say that there are not two confirmed scene references. |
| From *Interstellar* poster: “Tell me more about Interstellar.” | `exploreReference`, `analyzeTaste`; film fact + recommendations | Long synopsis, then affinities to *The Martian*, Radiohead and *Mad Max: Fury Road*, plus a tag. | **Partly useful, too broad.** The user asked for more on one film, not several adjacent references. |
| Same film: “What kind of area am I in?” | `getLocationContext`; Williamsburg five-place sample | “The area supplied is Williamsburg…” then Domino Park and Music Hall descriptions. | **Partial.** Identifies two places, but does not directly characterize the area; Qloo sample is too narrow for a neighborhood claim. |
| Same film: “Is this relevant to my interests?” | `analyzeTaste`; exact profile match | “Interstellar matches the same Qloo reference as Interstellar, an interest you shared,” then long film synopsis/tag. | **Yes, but verbose.** The direct answer is one sentence; extra film recap is unnecessary. |
| Unresolved Ferrari poster: “How does this relate to this area?” | `resolveEntities`, `analyzeTaste`; no confirmed Ferrari; area place facts | Says no supported scene/area link, then Williamsburg and Domino Park, then a Wythe Hotel–Nike taste affinity. | **Poor.** Correctly refuses a Ferrari claim but pivots to unrelated area/profile material. |
| Same Ferrari scene: “Guide me through this scene.” | `resolveEntities`, `analyzeTaste`; no scene facts | Says no dominant theme, then Williamsburg and affinities for Baby's All Right/Domino Park to Radiohead, then asks to name a reference/retake. | **Poor.** The apparent “guide” is mostly nearby place affinities, not the scene. |
| Same Ferrari scene: “What here connects to my interests?” | `analyzeTaste`, `getEntityFact`; local places + profile, no Ferrari fact | Gives Baby's All Right–Radiohead, Wythe Hotel–Nike and Domino Park–Radiohead affinities/descriptions. | **Wrong target.** “Here” is interpreted as sampled nearby places rather than the image; none is confirmed visible. |
| Unresolved Ferrari scene: “What is Ferrari?” | `resolveEntities`, `analyzeTaste`, `getLocationContext` | Returned **“An analysis service returned an unreadable response. Please try again.”** | **Failure.** The model/provider path failed after extra investigations; no fallback direct response reached the user in this run. |

The locality and taste used for these probes were available together. The strongest general pattern is that the server usually answers with **selected evidence**, not the full saved scene verbatim. The problem is **selection relevance**: up to five items plus automatic guided/location preambles can answer adjacent questions or repeat facts. A selection of `fact` and `taste` for the same entity repeats its description. Qloo affinity metadata can be correct while the spoken answer is still unhelpful.

### Sequential follow-ups and evidence reuse

I carried the updated A24 scene and prior messages through four live `explore` calls, as the app does. This was a new Qloo client in the audit process but shared within the four calls; actual HTTP requests each construct a fresh provider client, so repeated app-level methods can be even more expensive in production.

| Turn | Qloo methods invoked | Actual response and assessment |
| --- | --- | --- |
| “What is A24?” | `exploreReference` | A24 description + MUBI affinity + Independent Film. Relevant core, one unnecessary tangent. The scene grew from one to five entities/facts. |
| “Tell me more about A24.” | **`exploreReference` again** | Repeated A24 description/MUBI affinity, then two extra tags. The prior exploration evidence was reused in the scene but did **not** prevent the same method being called again. |
| “How do these connect?” | **`exploreReference` again**, `analyzeConnections` | A24–MUBI and A24–hitRECord links. This still treats recommended records as if they answer “these” in the viewed scene. |
| “How does A24 connect to Interstellar?” | `resolveEntities`, **`analyzeConnections` twice**, **`exploreReference` twice** | It eventually gave an aggregate A24–*Interstellar* affinity and both descriptions. The connection is qualified, but the five Qloo methods and long answer are excessive for one explicit pair. |

The app **retains facts and relationships** across follow-ups, but its completed-action list resets per request. `exploreReference` remains available for an already explored entity, and the live model chose it again. The client also retains up to 20 conversation messages, yet prior wording does not reliably constrain another Qloo investigation. Per-request Qloo caching only avoids duplicate identical HTTP calls **inside one request**.

## Where Qloo adds value, where it does not

Qloo was genuinely useful for **typed, uniquely resolved entities**: A24's film-company identity, Nike's brand identity, IKEA's brand context, the *Dune* book, and the *Interstellar* film. Its exact entity IDs make personal recognition safe: Nike and *Interstellar* were exact profile matches. Shared tags can support a narrow explanation of a pair. Related-entity retrieval is potentially useful **after the user asks to explore**, provided those results are clearly marked as not visible.

Qloo added little in default answers when the question was already answerable from the entity fact. A location toggle caused a five-place lookup for every captured image with locality, even when the selected answer was exclusively about a book/brand/film. The captured-scene answer never meaningfully combined taste and location in these ten cases. Taste affinity often produced a grammatically safe but practically empty “cultural overlap” line; A24–Radiohead, IKEA–Radiohead, and local venue–Nike examples are difficult for a blind listener to use without a concrete supported explanation. The five-place Williamsburg sample cannot establish neighborhood-wide significance. Unresolved artwork/product/album/venue/poster cases showed that Qloo's search coverage and this app's conservative exact matching are the main access bottleneck.

### Prioritized findings

1. **Answer the named/visible subject before any extra context.** When a reference is unresolved, say its detected name and uncertainty (“I can read ‘Ferrari,’ but Qloo returned several matches”), rather than pretending the cultural reference was not identified. Do not let nearby place taste affinities replace a question about the photo.
2. **Disambiguate with available evidence.** Use detected type and locality for duplicate venues; add explicit mappings for album/artwork/product where Qloo supports them. Do not silently choose a record; ask a short clarification when duplicates remain. A fallback could still state the visually read title without asserting an unsupported Qloo identity.
3. **Constrain reference scope in follow-ups.** “These” should mean confirmed visible/user-named scene references unless the user explicitly asks for related Qloo suggestions. With one confirmed reference, say there is only one to compare. Treat recommendations as optional next steps, never as objects seen in the photo.
4. **Stop repeating investigations.** Persist or infer that an entity already has its exploration facts/related records, and make `exploreReference` unavailable unless a new question genuinely requires uncached detail. Explicit A24–*Interstellar* comparison should be scoped to that pair rather than exploring multiple unrelated recommendations.
5. **Make taste explanatory, not merely scored.** Exact matches deserve a short “This is one of your interests.” For aggregate affinity, prefer a concrete shared Qloo tag or record-level fact that answers *why*. If none exists, a short honest limitation is better than a high-score but opaque personal link. Rank a semantically intelligible anchor over a marginally higher score when the user asks for an explanation.
6. **Use location when the question warrants it.** Keep the toggle available, but avoid a place lookup on every capture if it does not affect the answer. A chosen photo may depict another place, so do not treat current device locality as the photo's location without checking with the user. For area questions, lead with the area and a carefully bounded pattern from sampled records; for scene–area questions, connect the actual visible reference or say that no supported connection is available without listing unrelated venues.
7. **Tighten spoken answers.** One direct answer first, then at most one useful follow-up offer. Avoid duplicated descriptions, opaque “aggregate affinity” boilerplate, repeated title-as-profile matches, abrupt 350-character truncation, and reciting every selected tag or related entity.

Overall, Qloo is a credible evidence source for cultural identity and some connections, but **the current product does not consistently turn that evidence into useful, question-specific access for a blind user**. The most consequential gaps are entity resolution for common cultural media, scoping of “this/these/here,” locality/taste displacement of the photographed subject, and repeated Qloo work on follow-ups. Those are implementation and answer-prioritization problems, not evidence that Qloo itself has no value.

## Post-change evaluation — semantic carrier/entity harness

This section records the **rerun after the orchestration changes**. The ten visual cases were represented as detected-reference fixtures and run under the same four conditions: no taste/no locality (N), taste only (T), locality only (L), and both (TL). The taste fixture contained a Qloo-confirmed Radiohead artist; the locality fixture was New York City. These fixtures exercise the real `analyzeScene`, Qloo adapter, answer renderer, and client presentation code with an in-memory Qloo response. They do not claim to validate a live vision model, microphone, speech output, or TalkBack session. No vision API, Groq STT, or Groq TTS call was made. The 40 exact outputs and endpoint paths were written by `tests/semantic-harness.test.ts` to `/tmp/context-semantic-results.json` during the run.

| Visual case and photographed subject | N answer (excerpt) | T / L / TL difference | Qloo work and usefulness |
| --- | --- | --- | --- |
| Poster: *Interstellar* | “I can see an Interstellar poster. It's a science-fiction film.” | No change in this profile or locality. | One typed movie search; film identity helps, location adds nothing. |
| Clothing: Nike jacket | “I can see a black Nike jacket.” | No change. | One brand search confirms Nike internally; the basic physical answer needs no extra cultural sentence. |
| Brand: A24 sticker | “I can see an A24 sticker. It's an independent film company.” | No change. | One brand search; useful identity without unrelated recommendations. |
| Book: *Dune* by Frank Herbert | “I can see a Dune book by Frank Herbert.” | No change. | One book search; the opening no longer dumps a plot synopsis. |
| Artwork: *The Starry Night* | “I can see The Starry Night painting by Vincent van Gogh. Vincent van Gogh is a Dutch painter.” | No change. | One **artist** search; Qloo grounds Van Gogh, while the painting title remains a visual claim. |
| Product: iPhone | “I can see an iPhone.” | No change. | One **Apple brand** search; the product itself is not asserted to be a Qloo entity. |
| Logo: A24 | “I can see an A24 logo. It's an independent film company.” | No change. | Same brand flow as the sticker, not a separate logo-domain lookup. |
| Venue: Blue Note Jazz Club sign | “I can see a Blue Note Jazz Club sign. I could not match that reference uniquely…” | L and TL disambiguate the fixture's New York and Poznan records and add “It's a jazz venue.” Taste alone does not. | One place search. This is the one condition where locality materially improves resolution; there is no nearby-place query. |
| Album: *OK Computer* by Radiohead | “I can see an OK Computer album cover by Radiohead. Radiohead is an English rock band.” | T and TL add “Radiohead is one of your interests.” L adds nothing. | One **artist** search; Qloo does not verify the album title. The exact personal match is understandable. |
| Film reference: *Interstellar* | “I can see an Interstellar reference. It's a science-fiction film.” | No change. | One movie search; carrier differs from the poster, grounding flow is the same. |

Every case made **one `/search` call and zero `/v2/insights` calls** for its initial scene answer. None fetched nearby places merely because locality was supplied. The original audit's local-place displacement and opaque capture-time affinity output therefore did not recur in these fixtures. The initial answer starts with the photographed item in all 40 conditions. The detected title is retained when only a related artist/brand can be grounded, and a venue remains named even when a duplicate Qloo match cannot be selected. The fixture suite also checks that related entities are not substituted for the photographed title in the stored scene.

Representative Ask Context regressions used retained, mocked evidence: “What is A24?” answered from its existing fact without another Qloo or LLM call; “Is A24 relevant to my interests?” returned a one-sentence exact-match answer; “How do these connect?” with one visible reference reported that there is only one to compare; “What is OK Computer?” began with the visible album cover and then identified Radiohead; and an explicit A24–*Interstellar* question investigated only that named pair. Already investigated entity facts and pair keys persist in scene evidence, so repeated follow-ups can avoid another Qloo investigation. These are deterministic orchestration checks, not a live-model transcript. A live follow-up rerun and native speech/TalkBack evaluation remain necessary to measure model choices and listening quality.

I attempted a four-reference live Qloo spot check after the deterministic run. The service was unreachable from this environment, so **no new live Qloo result is claimed here**. The script `scripts/qloo-after-audit.ts` can repeat that spot check when network access is available. The previous live audit above remains historical evidence; its old outputs must not be read as current behavior.

Compared with the original audit, Qloo's clearest value is now typed identity for supported subjects, an explainable exact-interest match, and locality-based venue disambiguation. It still cannot independently validate a specific album, artwork, or product through the supported Insights entity types. Cultural significance and nuanced scene-area interpretations require suitable facts or relationships; the app should say less when that evidence is absent.

### Later live Qloo spot check

After DNS briefly became available, `node --env-file=.env.local --import tsx scripts/qloo-after-audit.ts` ran successfully from the project directory. Live Qloo uniquely grounded **Interstellar** (movie), **Radiohead** (artist), and **Apple Inc** (brand), each with one `/search` request and no Insights request. **Blue Note Jazz Club** remained unresolved: live search returned two exact-name place candidates, and the supplied New York locality did not uniquely select one. This qualifies the fixture result above: location disambiguation works when the returned place metadata contains a unique locality match, but this real venue is still ambiguous. Subsequent attempts to inspect the raw place metadata hit intermittent DNS failure, so no further geographic claim is made. The initial visible sign must remain named while Qloo identity stays unresolved.
