import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { z } from 'zod';
import { requestOllamaColumnMappings } from '@/lib/ollamaSpreadsheetMapper';

export const runtime = 'nodejs';
export const maxDuration = 30;

const requestSchema = z.object({
  headers: z.array(z.string().min(1).max(120)).min(1).max(100),
  profiles: z
    .array(
      z.object({
        sourceHeader: z.string().min(1).max(120),
        inferredType: z.enum([
          'empty',
          'boolean',
          'number',
          'date',
          'email',
          'url',
          'text',
          'mixed',
        ]),
        nonEmptyCount: z.number().int().min(0).max(50),
      })
    )
    .min(1)
    .max(100),
  columns: z
    .array(
      z.object({
        key: z.string().min(1).max(120),
        label: z.string().min(1).max(120),
        required: z.boolean().optional(),
        aliases: z.array(z.string().min(1).max(120)).max(20).optional(),
      })
    )
    .min(1)
    .max(100),
});

export async function POST(request: NextRequest) {
  if (
    process.env.NEXT_PUBLIC_AI_SPREADSHEET_MAPPING_ENABLED !== 'true' ||
    !process.env.OLLAMA_BASE_URL ||
    !process.env.OLLAMA_MODEL
  ) {
    return NextResponse.json(
      { error: 'ai_unavailable', message: 'AI suggestions are not enabled.' },
      { status: 503 }
    );
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseAnonKey) {
    return NextResponse.json(
      { error: 'backend_error', message: 'AI suggestions are not available right now.' },
      { status: 503 }
    );
  }

  const cookieStore = await cookies();
  const authClient = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll().map(({ name, value }) => ({ name, value }));
      },
      setAll() {
        // No session refresh is needed for this read-only helper.
      },
    },
  });
  const {
    data: { user },
  } = await authClient.auth.getUser();
  if (!user) return NextResponse.json({ error: 'not_authenticated' }, { status: 401 });

  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'invalid_request', message: 'The spreadsheet headings could not be checked.' },
      { status: 400 }
    );
  }

  const headerSet = new Set(parsed.data.headers);
  const targetSet = new Set(parsed.data.columns.map((column) => column.key));
  if (
    parsed.data.profiles.length !== parsed.data.headers.length ||
    parsed.data.profiles.some((profile) => !headerSet.has(profile.sourceHeader))
  ) {
    return NextResponse.json(
      { error: 'invalid_request', message: 'The spreadsheet headings could not be checked.' },
      { status: 400 }
    );
  }

  try {
    const proposed = await requestOllamaColumnMappings(parsed.data);
    const usedSources = new Set<string>();
    const usedTargets = new Set<string>();
    const mappings = [...proposed]
      .sort((a, b) => b.confidence - a.confidence)
      .filter((mapping) => {
        if (
          !headerSet.has(mapping.sourceHeader) ||
          !targetSet.has(mapping.targetKey) ||
          usedSources.has(mapping.sourceHeader) ||
          usedTargets.has(mapping.targetKey)
        ) {
          return false;
        }
        usedSources.add(mapping.sourceHeader);
        usedTargets.add(mapping.targetKey);
        return true;
      });
    return NextResponse.json({ mappings });
  } catch (error) {
    console.error('AI spreadsheet mapping failed', error instanceof Error ? error.message : error);
    return NextResponse.json(
      {
        error: 'ai_unavailable',
        message: 'AI suggestions are unavailable. Standard matching is still ready to use.',
      },
      { status: 503 }
    );
  }
}
