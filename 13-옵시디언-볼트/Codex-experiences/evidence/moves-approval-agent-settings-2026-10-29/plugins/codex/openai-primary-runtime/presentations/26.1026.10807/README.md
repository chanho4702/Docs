# Presentations

Presentations is the file-type wrapper plugin for presentation slide deck workflows.

This plugin is bundled into the Codex primary runtime.

## Included Skills

- `Presentations`: create, edit, and verify Spaces presentations, PowerPoint files, and Google Slides decks. Inspect and render connected presentations in their session; export files when requested.

## Skill Resources

Paths below are relative to `skills/presentations/`.

- `routing/`: native Google Slides routing and cross-plugin handoff.
- `references/template_following.md`: exact source-deck/template-following workflow.
- `references/artifact_sessions.md`: connected presentation authoring, inspection, and delivery.
- `template_following_scripts/`: local PPTX source inspection, frame-map validation, starter-deck, and fidelity helpers.
- `references/template-elicitation.md`: template selection and discovery.
- `style_guidelines.md`: required narrative, copy, layout, and typography guidance.
- `artifact_tool_docs/`: object APIs for session and local authoring.
- `container_tools/`: local file rendering and validation tools, plus reusable data/configuration helpers. Live validation uses the session workflow.

## Discoverability

Use this plugin for presentation-oriented terms from the file-type naming model: slides, deck, PowerPoint, Google Slides, presentation, presentations, PPT, and `.pptx`.

## Source And Copy Flow

This plugin package is generated at `lib/artifacts/artifacts_skills/generated/plugins/presentations`. The Codex runtime bundle consumes it directly, as recorded in `lib/artifacts/artifacts_skills/mapping.json`.
