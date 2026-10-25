# Implementation Plan: AI-assisted Spreadsheet Column Mapping

**Branch**: `codex/ai-spreadsheet-mapping` | **Date**: 2026-10-25 | **Spec**: `spec.md`

## Summary

Extend Feature 020's shared mapping step with an optional, authenticated server adapter for Ollama. The browser derives value-free type summaries, the server requests schema-constrained mappings, and the client merges valid suggestions without replacing exact deterministic matches. Every failure falls back to the existing manual workflow.

## Technical Context

- Next.js 14 App Router, React 18, TypeScript, Tailwind CSS.
- Existing `CsvImportModal`, `spreadsheetImport.ts`, and `ColumnSpec[]` remain the integration points.
- Native `fetch` targets Ollama's `/api/chat` endpoint; Zod validates request and model response shapes.
- Server-only configuration: `OLLAMA_BASE_URL`, `OLLAMA_MODEL`, optional `OLLAMA_API_KEY`.
- Public rollout flag: `NEXT_PUBLIC_AI_SPREADSHEET_MAPPING_ENABLED=true`.

## Constitution Check

- Brownfield preservation: extends the existing importer; no parallel flow.
- Security: authenticated endpoint, server-only credentials, strict allowlists, no row values.
- Reliability: deterministic fallback on disabled service, timeout, HTTP failure, or malformed model output.
- UI consistency: compact status text and confidence labels inside the existing mapping screen.
- Scope discipline: mapping suggestions only; no AI data transformation or database changes.

## Design

1. Add client-safe column profiling and AI/deterministic merge helpers.
2. Add a server-only Ollama adapter with JSON Schema output and a bounded timeout.
3. Add an authenticated route that validates both request and response.
4. Trigger AI only for non-exact spreadsheets when the rollout flag is enabled.
5. Show confidence and fallback state without blocking manual mapping.
6. Add focused tests and deployment documentation.
