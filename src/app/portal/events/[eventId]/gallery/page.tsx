'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import { eventMemberContacts } from '@/lib/profileContacts';
import { Avatar } from '@/components/portal/Avatar';
import { useConfirm } from '@/contexts/ConfirmContext';
import { SectionHeader } from '@/components/portal/SectionHeader';
import toast from 'react-hot-toast';
import { useLatestRequest } from '@/lib/useLatestRequest';

type Post = {
  id: string;
  user_id: string;
  image_url: string;
  caption: string | null;
  is_hidden: boolean;
  created_at: string;
  profiles: { full_name: string | null; email: string | null; avatar_url: string | null } | null;
  post_likes: { count: number }[];
};

export default function GalleryPage() {
  const { eventId } = useParams<{ eventId: string }>();
  const confirm = useConfirm();
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);

  // Feature 016 (main-tab performance pass): cancel this load when the user leaves the
  // tab (or reloads it); an aborted load never toasts or writes state.
  const startRequest = useLatestRequest();

  const fetchData = async () => {
    const signal = startRequest();
    // Feature 028: posts come from a service-role route, so the viewer's own blocks in the app
    // never hide photos here. Feature 027 (C1): author emails come from get_event_member_contacts.
    const [res, contacts] = await Promise.all([
      fetch(`/api/events/${eventId}/gallery`, { signal }).catch(() => null), // aborted, or offline
      eventMemberContacts(supabase, eventId),
    ]);
    const body = res ? await res.json().catch(() => ({})) : {};
    const error = !res || !res.ok ? { message: body.message ?? 'Failed to load gallery' } : null;
    const data = res?.ok ? (body.posts as unknown[]) : null;
    if (signal.aborted) return;
    if (error) {
      console.error(error);
      toast.error('Failed to load gallery');
      setPosts([]);
    } else {
      setPosts(
        ((data as unknown as Post[]) ?? []).map((p) => ({
          ...p,
          profiles: p.profiles ? { ...p.profiles, email: contacts.get(p.user_id)?.email ?? null } : null,
        }))
      );
    }
    setLoading(false);
  };

  useEffect(() => { if (eventId) fetchData(); }, [eventId]);

  // Feature 028: writes go through the gallery route (same permissions as before; see galleryServer.ts).
  const postRequest = async (id: string, init: RequestInit, fallback: string): Promise<boolean> => {
    try {
      const res = await fetch(`/api/events/${eventId}/gallery/${id}`, init);
      if (res.ok) return true;
      const body = await res.json().catch(() => ({}));
      toast.error(body.message ?? fallback);
    } catch {
      toast.error(fallback);
    }
    return false;
  };

  const toggleHidden = async (post: Post) => {
    const ok = await postRequest(
      post.id,
      { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ isHidden: !post.is_hidden }) },
      'This photo couldn’t be updated — try again.'
    );
    if (ok) fetchData();
  };

  const handleDelete = async (id: string) => {
    if (!(await confirm({ message: 'Delete this post? This also removes its likes and comments.', confirmLabel: 'Delete', destructive: true }))) return;
    if (await postRequest(id, { method: 'DELETE' }, 'This photo couldn’t be deleted — try again.')) {
      toast.success('Deleted');
      fetchData();
    }
  };

  const visible = posts.filter(p => !p.is_hidden);
  const hidden = posts.filter(p => p.is_hidden);

  return (
    <div>
      <div className="mb-4">
        <SectionHeader
          sectionKey="gallery"
          desc={`${posts.length} photo${posts.length !== 1 ? 's' : ''} posted by attendees · ${hidden.length} hidden`}
        />
      </div>

      {loading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 animate-pulse">{[1,2,3,4,5,6].map(i => <div key={i} className="h-48 bg-surface-container-low rounded-[20px]" />)}</div>
      ) : posts.length === 0 ? (
        <div className="text-center py-10 bg-white border border-[#E4EAF0] rounded-[20px] panel-shadow">
          <p className="material-symbols-outlined text-5xl text-on-surface-variant/30 mb-3">photo_library</p>
          <p className="text-on-surface-variant">No photos posted by attendees yet.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {visible.length > 0 && (
            <div>
              <h3 className="text-xs font-semibold text-on-surface-variant uppercase tracking-wide mb-3">Visible ({visible.length})</h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
                {visible.map(p => <PostCard key={p.id} post={p} onToggle={toggleHidden} onDelete={handleDelete} />)}
              </div>
            </div>
          )}
          {hidden.length > 0 && (
            <div>
              <h3 className="text-xs font-semibold text-on-surface-variant uppercase tracking-wide mb-3">Hidden ({hidden.length})</h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
                {hidden.map(p => <PostCard key={p.id} post={p} onToggle={toggleHidden} onDelete={handleDelete} />)}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function PostCard({ post, onToggle, onDelete }: { post: Post; onToggle: (p: Post) => void; onDelete: (id: string) => void }) {
  const author = post.profiles;
  const likeCount = post.post_likes[0]?.count ?? 0;

  return (
    <div className={`group relative bg-white border border-[#E4EAF0] rounded-[20px] panel-shadow overflow-hidden ${post.is_hidden ? 'opacity-60' : ''}`}>
      <img src={post.image_url} alt={post.caption ?? ''} className="w-full h-40 object-cover" onError={e => { (e.target as HTMLImageElement).alt = 'Failed to load'; }} />
      {post.is_hidden && (
        <div className="absolute top-2 left-2 bg-surface-container-high text-on-surface-variant text-xs font-semibold px-2 py-0.5 rounded-full">Hidden</div>
      )}
      <div className="absolute inset-0 bg-black/0 sm:group-hover:bg-black/40 transition-all flex items-end justify-between opacity-100 sm:opacity-0 sm:group-hover:opacity-100 p-2">
        <button onClick={() => onToggle(post)} className="text-xs bg-white text-on-surface px-2 py-1 rounded-lg font-medium hover:bg-surface-container-low transition">
          {post.is_hidden ? 'Unhide' : 'Hide'}
        </button>
        <button onClick={() => onDelete(post.id)} className="text-xs bg-error text-white px-2 py-1 rounded-lg font-medium hover:opacity-90 transition">Delete</button>
      </div>
      <div className="px-3 py-2">
        <div className="flex items-center gap-2 min-w-0">
          <Avatar name={author?.full_name} email={author?.email} avatarUrl={author?.avatar_url} size={20} />
          <p className="text-xs font-medium text-on-surface truncate">{author?.full_name ?? author?.email ?? 'Unknown'}</p>
          <span className="text-xs text-on-surface-variant ml-auto flex-shrink-0 flex items-center gap-0.5">
            <span className="material-symbols-outlined text-[14px]">favorite</span>{likeCount}
          </span>
        </div>
        {post.caption && <p className="text-xs text-on-surface-variant mt-1 truncate">{post.caption}</p>}
      </div>
    </div>
  );
}
