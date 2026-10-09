# Workspace instructions

Before acting on a user request, read it in the context of the current product decisions, existing UI, and relevant files. Identify the specific change the user wants and preserve existing behavior that the request does not clearly replace. Do not treat a constraint on new work as permission to remove existing controls or features.

If a brief or ambiguous request has more than one plausible interpretation that would materially change the product, ask the user a concise clarification question and wait for the answer before making the dependent change. When the intent is clear from the request and context, proceed without unnecessary confirmation.

Use `FR_v2.md` for current product requirements and `progress.md` for the active implementation handoff. Older FR, audit, plan, and tech-stack documents are historical context only where they do not conflict with FR_v2.

most of the arch is already build for FR_v2, so do not duplicated it, try to ise the existing one where possible, but if you found any error or bug in already implemented arch, solve it.

when new product decision is made check the FR for relevent section and update that decison.