'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import { Avatar } from '@/components/portal/Avatar';
import { useConfirm } from '@/contexts/ConfirmContext';
import { SectionHeader } from '@/components/portal/SectionHeader';
import toast from 'react-hot-toast';

type Post = {
  id: string;
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

  const fetchData = async () => {
    const { data, error } = await supabase
      .from('posts')
      .select('id,image_url,caption,is_hidden,created_at,profiles!posts_user_id_fkey(full_name,email,avatar_url),post_likes(count)')
      .eq('event_id', eventId)
      .order('created_at', { ascending: false });
    if (error) {
      console.error(error);
      toast.error('Failed to load gallery');
      setPosts([]);
    } else {
      setPosts((data as unknown as Post[]) ?? []);
    }
    setLoading(false);
  };

  useEffect(() => { if (eventId) fetchData(); }, [eventId]);

  const toggleHidden = async (post: Post) => {
    const { error } = await supabase.from('posts').update({ is_hidden: !post.is_hidden }).eq('id', post.id);
    if (error) toast.error(error.message); else fetchData();
  };

  const handleDelete = async (id: string) => {
    if (!(await confirm({ message: 'Delete this post? This also removes its likes and comments.', confirmLabel: 'Delete', destructive: true }))) return;
    const [{ error: likesError }, { error: commentsError }] = await Promise.all([
      supabase.from('post_likes').delete().eq('post_id', id),
      supabase.from('post_comments').delete().eq('post_id', id),
    ]);
    if (likesError || commentsError) { toast.error((likesError ?? commentsError)?.message ?? 'Failed to delete'); return; }
    const { error } = await supabase.from('posts').delete().eq('id', id);
    if (error) toast.error(error.message); else { toast.success('Deleted'); fetchData(); }
  };

  const visible = posts.filter(p => !p.is_hidden);
  const hidden = posts.filter(p => p.is_hidden);

  return (
    <div>
      <div className="mb-6">
        <SectionHeader
          sectionKey="gallery"
          desc={`${posts.length} photo${posts.length !== 1 ? 's' : ''} posted by attendees · ${hidden.length} hidden`}
        />
      </div>

      {loading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 animate-pulse">{[1,2,3,4,5,6].map(i => <div key={i} className="h-48 bg-surface-container-low rounded-[20px]" />)}</div>
      ) : posts.length === 0 ? (
        <div className="text-center py-16 bg-white border border-[#E4EAF0] rounded-[20px] panel-shadow">
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
