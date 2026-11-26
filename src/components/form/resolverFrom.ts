import type { FieldErrors, FieldValues, Resolver } from 'react-hook-form';

/**
 * Feature 031 — adapts a pure validator `(values) => { field?: message }` to a
 * react-hook-form resolver, so a domain module's own rules (e.g.
 * `validateSpeaker` in src/lib/speakers.ts) drive the form with no second copy
 * of the rules and no schema library (zod isn't installed; research R2).
 */
export function resolverFrom<TValues extends FieldValues>(
  validate: (values: TValues) => Partial<Record<string, string | undefined>>
): Resolver<TValues> {
  return async (values) => {
    const messages = validate(values);
    const errors: Record<string, { type: string; message: string }> = {};
    for (const [field, message] of Object.entries(messages)) {
      if (message) errors[field] = { type: 'validate', message };
    }
    return Object.keys(errors).length
      ? { values: {}, errors: errors as FieldErrors<TValues> }
      : { values, errors: {} };
  };
}
