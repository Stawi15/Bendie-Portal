# Implementation Plan: UX Foundations and Smart Spreadsheet Import

**Branch**: `codex/ux-foundations-smart-import` | **Date**: 2026-10-24 | **Spec**: `spec.md`

## Summary

Extend the existing shared `CsvImportModal` rather than creating a parallel importer. Add client-side `.xlsx` parsing, deterministic header mapping, corrected/error CSV downloads, and focused copy improvements. Add a persistent expanded desktop sidebar and small vocabulary/product-purpose corrections while preserving the current route, product, authorization, readiness, and module architecture.

## Technical Context

- Next.js 14 App Router, React 18, TypeScript, Tailwind CSS.
- Existing Papa Parse CSV pipeline and generic `CsvImportModal<T>` remain the integration point.
- Add `exceljs` for client-side modern Excel parsing and `vitest` for focused pure-logic tests.
- No storage or schema changes. Spreadsheet bytes remain in the browser.

## Constitution Check

- Brownfield preservation: pass; extends the existing importer and existing shell components.
- Architecture boundaries: pass; no Server Actions, services, APIs, or Supabase changes.
- Security: pass; no secrets and no spreadsheet upload to an AI/service endpoint.
- UI consistency: pass; use existing modal, inputs, buttons, tokens, and Material Symbols.
- Scope discipline: pass; large IA proposals remain follow-up documentation.
- Verification: type-check, lint, tests, format check, build, `/imprint`, `/review`, convergence.

## Design

1. Add pure header-normalization/mapping helpers with exact/label/alias/token-overlap suggestions.
2. Add spreadsheet parsing helpers that produce the existing `{headers, rows}` shape for every selected sheet.
3. Extend the modal flow to `pick → sheet (when needed) → map (when needed) → preview → result`.
4. Canonicalize mapped rows before calling the unchanged module `parseRow` functions.
5. Add client-side corrected CSV and error-report downloads.
6. Make the desktop sidebar expanded by default with a local preference and explicit toggle.
7. Adjust search/module language and add a compact product-purpose block to the organization home.
8. Update canonical project docs and record the reusable mapping UI pattern.

## AI Follow-up Contract

If an AI mapper is later approved, it may only propose target keys for unresolved headers, return schema-validated JSON, receive headers plus non-sensitive type summaries by default, and fall back to this deterministic mapper on every failure. It may not generate row values or bypass manual confirmation.
