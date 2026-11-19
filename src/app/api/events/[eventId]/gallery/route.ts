import { NextRequest, NextResponse } from 'next/server';
import { resolveGalleryCaller } from '@/lib/galleryServer';

/** Feature 028 (US3) — the event's photo posts, read with the service role (see galleryServer.ts). */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  const caller = await resolveGalleryCaller(eventId);
  if (caller instanceof NextResponse) return caller;

  let query = caller.admin
    .from('posts')
    .select('id,user_id,image_url,caption,is_hidden,created_at,profiles!posts_user_id_fkey(full_name,avatar_url),post_likes(count)')
    .eq('event_id', eventId)
    .order('created_at', { ascending: false });
  // As the `posts_select_visible` RLS: only Stawi admins see other people's hidden posts.
  if (!caller.isPlatformAdmin) query = query.or(`is_hidden.eq.false,is_hidden.is.null,user_id.eq.${caller.userId}`);

  const { data, error } = await query;
  if (error) {
    console.error('gallery: posts read failed', error);
    return NextResponse.json({ error: 'backend_error', message: 'Failed to load gallery' }, { status: 500 });
  }
  return NextResponse.json({ posts: data ?? [], canModerate: caller.isPlatformAdmin });
}
