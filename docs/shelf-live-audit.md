# Live book and game shelf audit

Date: 2026-10-09. This audits the current implementation; it is not a product acceptance pass. No app code was changed. Neither image was manually previewed or inspected. The raw structured Vision results, Qloo matches and ranking, bounded research, Scene Briefs, exact answers, and provider-call logs are in the [image 1 artifact](audits/shelf-image1.json) and [image 2 artifact](audits/shelf-image2.json).

## Fixed user and method

Before opening or sending either image, I chose and printed one profile, resolved it through real Qloo Search, and sealed it using the production profile path. It stayed fixed throughout:

| Interest | Type | Saved Qloo ID |
| --- | --- | --- |
| Dune | Book | `9BA85467-2189-46DC-BB98-4B25EE182A9D` |
| The Hobbit | Book | `5AED339A-8815-402E-B524-C218D45E5BB9` |
| Hades | Game | `BA00D00A-E4CD-48C0-A22E-CFC52039D618` |
| Stardew Valley | Game | `875DB771-9C4C-4DD0-9249-D2ABD95711F1` |
| Radiohead | Artist | `70CAE5BF-2F4C-445C-A3E5-4EDACFC3591C` |
| Interstellar | Movie | `057DA9D9-399B-437E-8BCA-A80E499125EF` |

The first profile-resolution attempt hit `QLOO_RATE_LIMIT`; a paced retry resolved all six. **Profile identity defect:** the saved “The Hobbit” Qloo ID represents a 1989 Chuck Dixon book, not J.R.R. Tolkien's novel apparently intended by the test user. I did not repair the profile after image access. Any exact-match claim for Hobbit would therefore be unreliable.

Each original PNG was submitted independently to the existing `/api/scene/analyze` route with the same signed profile. The route, prompts, parsers, and providers were real; there were no mocks. Current configuration uses `qwen3.8-flash` for both Vision and reasoning, **not Qwen Max**. Sending the PNG data URI straight to the route bypassed Expo's on-device image preparation. No STT or TTS call was made.

After production did not complete either shelf pipeline, I used two **diagnostic-only** adjustments to isolate causes: one Vision request used a 180-second deadline, and downstream runs paced Qloo HTTP requests three seconds apart using the *actual captured Qwen Vision output*. The downstream runs still called production `analyzeScene` and real Qloo, Tavily, and reasoning providers. The harness did not invent or edit visible titles. These tests do not establish that the unchanged app succeeds in production.

## End-to-end outcome

| Image | Production route | Extended/paced diagnostic | Exact initial answer |
| --- | --- | --- | --- |
| `tests/image1.png` | Qwen returned 18 games. Seven of 18 typed Qloo Searches returned HTTP 429. Route returned HTTP 200 without a shortlist, Tavily research, or fact extraction. | The same 18 detected titles resolved through 18 paced Qloo Searches; one Insights request ranked all 18. Four shortlisted titles received four Tavily searches and one Qwen extraction call. | Production: “I can identify 18 games on this shelf. I cannot rank the full visible shelf reliably right now.” Diagnostic: “I can identify 18 games on this shelf. The Witcher 3: Wild Hunt and Minecraft stand out most for your interests.” |
| `tests/image2.png` | Qwen Vision exceeded its 30-second deadline twice. Route returned HTTP 503 `AI_UNREACHABLE`; no scene answer. | With a test-only 180-second Vision deadline, Qwen returned 39 books. Paced Qloo Search matched 11 uniquely, left 28 ambiguous; one Insights POST returned nine of ten non-exact resolved IDs. No shortlist or factual research followed. | Production: no scene answer. Diagnostic: “I can identify 39 books on this shelf. Dune is already in your interests. I cannot rank the full visible shelf reliably right now.” |

The book Vision timeout is an observed production failure, not proof that the photo is unreadable. Both raw Qwen outputs assign confidence `1` to every detected title. This audit can confirm that later stages considered only those Vision-declared visible titles; it cannot independently confirm the physical inventory without manually inspecting the photos, which the test forbade.

### Image 1: game display

Vision classified it as `game_shelf`, with 18 named games and visible platform `PS4` for each. The paced run made 18 successful type-specific Qloo Search GETs and one Insights POST. Insights ranked exactly the 18 uniquely resolved, Vision-declared visible games. Its top four were:

| Rank | Visible title | Qloo affinity | Accepted researched fields |
| --- | --- | ---: | --- |
| 1 | The Witcher 3: Wild Hunt | 0.714 | Title, genre, release year, gameplay style |
| 2 | Minecraft | 0.672 | None |
| 3 | Days Gone | 0.645 | Title, genre, release year, premise, gameplay style |
| 4 | Horizon Zero Dawn | 0.633 | None |

Qloo explainability identified contributing saved interests including Hades, Stardew Valley, Radiohead, and Interstellar. This supports a taste ranking, **not** a specific shared cultural explanation. The concise initial answer named two detected games without inventing a relationship. It omitted the PS4 packaging visible in Vision output, which might help a blind shopper orient, but Qloo should not be asked to supply a fact already visible on the cases.

Tavily made one bounded search per shortlisted game. Several results were irrelevant: Minecraft included unrelated government pages, while Horizon and Days Gone queries included different games or sequels. The source checker accepted only excerpt-supported fields and kept the rest unknown. Two of four games consequently had no accepted factual fields. Some accepted fields used Wikipedia rather than preferred official sources. The Scene Brief kept Vision presence, Qloo ranking, and Tavily facts separate; it did not treat Qloo suggestions or unrelated web results as photographed games. Research was limited to the shortlist, but its source quality was too weak for several shopping decisions.

Production called Vision once, Qloo Search 18 times, and Insights once; seven Search calls were rate-limited, stopping research. The paced diagnostic called Qloo Search 18 times, Insights once, Tavily four times, and Qwen fact extraction once. There was no duplicate game resolution in that initial run. This pattern suggests the current three-concurrent-search burst contributes to 429s. Pacing worked in the diagnostic run but was not applied to the app.

### Image 2: book display

The extended Vision call classified it as `book_shelf` and returned 39 titles. The paced run issued 39 typed Qloo Searches and one Insights request. Eleven titles matched uniquely; 28 remained visible but ambiguous. This prevents wrong-entity substitution but severely limits taste ranking. Many Qloo records include series subtitles or share a title with another book. The matcher did not effectively use the author supplied by Vision: it expects an author-category marker that the Vision result did not include. In particular, visible *The Hobbit* by J.R.R. Tolkien was not uniquely matched against Qloo's Tolkien and Chuck Dixon records, while the fixed profile had saved Chuck Dixon's record.

The 11 uniquely resolved titles were Dune (an exact saved ID), Project Hail Mary, The Martian, Artemis, Oathbringer, Babylon's Ashes, Ready Player One, Recursion, Dark Matter, The Martian Chronicles, and Hyperion. The one Insights response ranked nine of the ten non-exact candidates; Ready Player One was omitted. The app correctly marked the ranking incomplete and did not invent a full-shelf 3–4-item shortlist. It still identified Dune as a saved interest. Because the current contract requires a complete ranking, there was **no** book Tavily search or Qwen fact extraction. The book Scene Brief has inventory but no researched shortlist or personalized picks.

This is honest but does not yet help much with a blind bookstore decision. One missing Insights result stops all shortlist research even when other candidates have affinity evidence. Production was worse: both attempts timed out at Vision and surfaced a generic service-unreachable error. The 39-title result is diagnostic only.

## Ask Context follow-ups

These were real `/api/scene/ask` calls using the signed diagnostic scene and fixed profile. Questions were supplied as text; orb control, microphone, Whisper, Orpheus, and screen readers were outside this audit. Call counts below refer to providers invoked on the follow-up, not the initial shelf run.

| Scene and question | Observed answer or behavior | Provider calls | Assessment |
| --- | --- | --- | --- |
| Game: “Why does The Witcher 3: Wild Hunt fit my interests?” | “Qloo ranked The Witcher 3: Wild Hunt for your interests, including Hades and Interstellar. I cannot verify a more specific cultural link from that score alone.” | One Qwen planner; no Qloo/Tavily | Specific, qualified, and reuses ranking. |
| Game: “Does Minecraft support local co-op?” | Generic Qloo Minecraft description; no co-op answer. | Two Qwen calls, Qloo entity lookup and Insights | **Failure:** `asksAboutArea` matches “local,” sending a co-op question into general/locality orchestration. Unnecessary calls and wrong answer. |
| Same Minecraft question again | Same generic description. | Two more Qwen calls; no Qloo | Some evidence reused, but routing and answer still wrong. |
| Game: “What genre is The Witcher 3: Wild Hunt?” | “The Witcher 3: Wild Hunt: genre — Action role-playing.” | One Qwen planner; no Qloo/Tavily | Answered from cached researched fact. |
| Game: “Does The Witcher 3: Wild Hunt have couch co-op?” | “I could not verify local co-op for The Witcher 3: Wild Hunt.” | One Qwen planner, one targeted Tavily, one Qwen extraction | Correctly avoids an unsupported yes/no; retrieved sources did not prove this field. |
| Same Witcher co-op question again | Same answer. | One Qwen planner; no Tavily | Failed research remembered; no repeat web search. |
| Book: “Is Dune one of my interests?” | “I could not tell which shelf question you meant. Please name a title and ask again.” | One Qwen planner; no Qloo/Tavily | **Failure:** Dune was explicit and its saved Qloo ID already present. Planner returned invalid field `interests`. |
| Book: “Is The Hobbit one of my interests?” | Same generic clarification. | One Qwen planner; no Qloo/Tavily | **Failure:** planner returned invalid field `interest`; saved Hobbit ID is also the wrong book, so a name-only yes would be unsafe. |

Successful follow-ups did not replay the entire shelf. Minecraft was a wrong-route failure rather than a summary dump. The book answers asked for titles already named. Cached answers still spent one Qwen planning call, though they avoided repeat Qloo/Tavily work.

## Findings and acceptance status

1. **Neither priority shelf flow reliably completes in current production.** Game ranking was blocked by Qloo 429s; book analysis by Vision's 30-second deadline. The paced game success is diagnostic, not production acceptance.
2. **Book identity resolution needs repair.** Visible authors, canonical titles, and series subtitles should distinguish more books without choosing a wrong same-title entity. The wrong saved Hobbit record shows that taste onboarding needs the same check.
3. **Insights may omit requested IDs.** The app correctly withheld an unsupported full ranking when one book ID was absent, but has no useful partial-shortlist behavior under the current contract.
4. **Qloo adds genuine value when it responds.** For games it ranked only 18 detected titles against the fixed profile and yielded four visible picks. Affinity alone did not establish an explainable shared theme; Ask qualified that limit.
5. **Tavily factual recall is uneven.** Two shortlisted games had zero accepted facts. Conservative source validation prevented fabricated claims but left practical buying questions unanswered.
6. **Ask Context has two concrete semantic bugs.** “Local co-op” is treated as an area request. Interest-membership questions fail on invalid planner fields despite explicit titles and saved IDs. Cached genre and attempted-research reuse worked in the tested Witcher turns.
7. **Vision confidence was not discriminating in these outputs.** Every title had confidence `1`; physical accuracy cannot be established under the no-preview constraint. Device image preparation, accessibility, STT, and TTS were not tested.

The observation audit is complete. It does not certify the shelf flows for release. No FR_v2 decision or app implementation was changed. These exact images, fixed profile, follow-up questions, and provider-call counts provide a regression baseline for a later implementation pass.
