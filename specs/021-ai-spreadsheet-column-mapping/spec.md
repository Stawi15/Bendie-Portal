# Feature 021: AI-assisted Spreadsheet Column Mapping

**Feature Branch**: `codex/ai-spreadsheet-mapping`  
**Created**: 2026-10-25  
**Status**: Approved for implementation  
**Input**: Add an optional self-hosted AI mapper that proposes spreadsheet column matches before the existing confirmation step.

## User Scenarios & Testing

### User Story 1 — Receive useful mapping suggestions (P1)

An authenticated event manager uploads an ordinary CSV or Excel workbook whose headings do not match the current module template. Bendie first applies its deterministic mapper, then optionally asks a configured self-hosted model to improve unresolved suggestions. The manager sees the proposed source column, confidence, and a short explanation before approving or changing anything.

**Independent Test**: Upload a speakers workbook containing headings such as `Presenter`, `Position`, and `Company / Org`; verify the mapping screen remains editable and marks model-proposed fields with confidence.

### User Story 2 — Continue safely without AI (P1)

If AI is disabled, unavailable, slow, or returns invalid output, the deterministic mapper remains usable and the user can complete the import manually.

**Independent Test**: Point the adapter at an unavailable endpoint and verify the mapping screen still shows deterministic suggestions and allows confirmation.

### User Story 3 — Keep spreadsheet data private (P1)

Only source headings, inferred data types, and template metadata are sent to the mapping endpoint. Row values never leave the browser for AI mapping.

**Independent Test**: Inspect the mapping request and confirm it contains no spreadsheet cell values.

## Requirements

- **FR-001**: Preserve Feature 020's parsing, canonical row conversion, validation, authorization, write paths, and manual confirmation.
- **FR-002**: Make AI mapping opt-in through deployment configuration and keep deterministic mapping as the default/fallback.
- **FR-003**: Send only source headings, value-free type summaries, and allowed template field metadata to the server.
- **FR-004**: Authenticate every mapping request before calling the configured model service.
- **FR-005**: Use a server-only Ollama-compatible endpoint, model name, and optional bearer token; expose none of them to the browser.
- **FR-006**: Require schema-constrained JSON and validate all model output again server-side.
- **FR-007**: Reject target/source names outside the submitted allowlists and prevent duplicate source or target assignments.
- **FR-008**: Never overwrite an exact deterministic match with an AI suggestion.
- **FR-009**: Show confidence for AI suggestions and continue to require human confirmation for every non-exact mapping.
- **FR-010**: Use a short timeout and friendly fallback copy without exposing model, network, parser, or stack details.

## Scope Boundaries

- No spreadsheet rows or sample values are sent to the model.
- No AI-generated row values, transformations, corrections, or imports.
- No database or RLS changes.
- No requirement that Ollama run inside Vercel; it remains a separately hosted private service.
- No automatic import without the existing preview and explicit user action.

## Success Criteria

- Existing exact-template imports behave exactly as before and do not call AI.
- Non-template imports remain usable with the AI service offline.
- A valid AI response can improve unresolved mappings without creating duplicate assignments.
- Unit tests, TypeScript, lint, focused formatting, and production compilation pass within the repository's existing environment limitations.
