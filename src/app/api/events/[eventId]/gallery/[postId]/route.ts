import { NextRequest, NextResponse } from 'next/server';
import { resolveGalleryCaller, type GalleryCaller } from '@/lib/galleryServer';

/**
 * Feature 028 (US3) — hide/unhide (PATCH `{ isHidden }`) or delete a Gallery post.
 * Allowed for Stawi admins and the post's author, as the `posts` RLS allows. The write
 * runs as the caller first, so the audit trigger records who acted; only when that
 * matches nothing (e.g. the caller blocked the author in the app) is it repeated with
 * the service role. Likes and comments are removed by the foreign keys' ON DELETE CASCADE.
 */
const forbidden = () => NextResponse.json({ error: 'forbidden', message: 'Only Stawi admins can hide or delete attendees’ photos.' }, { status: 403 });

async function authorise(caller: GalleryCaller, eventId: string, postId: string): Promise<NextResponse | null> {
  const { data: post, error } = await caller.admin.from('posts').select('user_id').eq('id', postId).eq('event_id', eventId).maybeSingle();
  if (error) {
    console.error('gallery: post lookup failed', error);
    return NextResponse.json({ error: 'backend_error', message: 'Something went wrong. Try again.' }, { status: 500 });
  }
  if (!post) return NextResponse.json({ error: 'not_found', message: 'This photo no longer exists.' }, { status: 404 });
  if (!caller.isPlatformAdmin && post.user_id !== caller.userId) return forbidden();
  return null;
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ eventId: string; postId: string }> }) {
  const { eventId, postId } = await params;
  const caller = await resolveGalleryCaller(eventId);
  if (caller instanceof NextResponse) return caller;
  const body = await request.json().catch(() => null);
  if (typeof body?.isHidden !== 'boolean') return NextResponse.json({ error: 'invalid_request', message: 'isHidden must be true or false.' }, { status: 400 });
  const denied = await authorise(caller, eventId, postId);
  if (denied) return denied;

  const patch = { is_hidden: body.isHidden };
  const own = await caller.authClient.from('posts').update(patch).eq('id', postId).eq('event_id', eventId).select('id');
  if (own.error || !own.data?.length) {
    const { error } = await caller.admin.from('posts').update(patch).eq('id', postId).eq('event_id', eventId);
    if (error) {
      console.error('gallery: hide failed', error);
      return NextResponse.json({ error: 'backend_error', message: 'This photo couldn’t be updated — try again.' }, { status: 500 });
    }
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ eventId: string; postId: string }> }) {
  const { eventId, postId } = await params;
  const caller = await resolveGalleryCaller(eventId);
  if (caller instanceof NextResponse) return caller;
  const denied = await authorise(caller, eventId, postId);
  if (denied) return denied;

  const own = await caller.authClient.from('posts').delete().eq('id', postId).eq('event_id', eventId).select('id');
  if (own.error || !own.data?.length) {
    const { error } = await caller.admin.from('posts').delete().eq('id', postId).eq('event_id', eventId);
    if (error) {
      console.error('gallery: delete failed', error);
      return NextResponse.json({ error: 'backend_error', message: 'This photo couldn’t be deleted — try again.' }, { status: 500 });
    }
  }
  return NextResponse.json({ ok: true });
}
