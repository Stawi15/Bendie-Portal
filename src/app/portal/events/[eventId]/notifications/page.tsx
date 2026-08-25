'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import { useAuth } from '@/contexts/AuthContext';
import { useConfirm } from '@/contexts/ConfirmContext';
import { SectionHeader } from '@/components/portal/SectionHeader';
import { FormModal } from '@/components/portal/FormModal';
import toast from 'react-hot-toast';

type PushNotification = {
  id: string;
  title: string;
  body: string;
  status: 'scheduled' | 'sending' | 'sent' | 'failed' | 'canceled';
  scheduled_at: string;
  sent_at: string | null;
  target_count: number | null;
  sent_count: number | null;
  failed_count: number | null;
  error: string | null;
  created_at: string;
};

type NotificationForm = {
  title: string;
  body: string;
  sendMode: 'now' | 'later';
  scheduledAt: string; // datetime-local string, only used when sendMode === 'later'
};

const EMPTY_FORM: NotificationForm = { title: '', body: '', sendMode: 'now', scheduledAt: '' };

const STATUS_LABELS: Record<PushNotification['status'], string> = {
  scheduled: 'Scheduled', sending: 'Sending…', sent: 'Sent', failed: 'Failed', canceled: 'Canceled',
};
const STATUS_CLASSES: Record<PushNotification['status'], string> = {
  scheduled: 'bg-blue-100 text-blue-700',
  sending: 'bg-amber-100 text-amber-700',
  sent: 'bg-green-100 text-green-700',
  failed: 'bg-red-100 text-red-700',
  canceled: 'bg-surface-container-low text-on-surface-variant',
};

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString('en-ZA', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export default function EventNotificationsPage() {
  const { eventId } = useParams<{ eventId: string }>();
  const { user } = useAuth();
  const confirm = useConfirm();

  const [items, setItems] = useState<PushNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<NotificationForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const fetchData = async () => {
    const { data, error } = await supabase
      .from('event_push_notifications')
      .select('id,title,body,status,scheduled_at,sent_at,target_count,sent_count,failed_count,error,created_at')
      .eq('event_id', eventId)
      .order('created_at', { ascending: false });
    if (error) toast.error('Failed to load notifications');
    else setItems((data ?? []) as PushNotification[]);
    setLoading(false);
  };

  useEffect(() => { if (eventId) fetchData(); }, [eventId]);

  const openAdd = () => {
    setForm(EMPTY_FORM);
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!form.title.trim()) { toast.error('Title is required'); return; }
    if (!form.body.trim()) { toast.error('Message body is required'); return; }
    if (form.sendMode === 'later' && !form.scheduledAt) { toast.error('Pick a date and time to schedule for'); return; }

    const scheduledAt = form.sendMode === 'now' ? new Date().toISOString() : new Date(form.scheduledAt).toISOString();
    if (form.sendMode === 'later' && new Date(scheduledAt).getTime() <= Date.now()) {
      toast.error('Scheduled time must be in the future'); return;
    }

    setSaving(true);
    const { error } = await supabase.from('event_push_notifications').insert({
      event_id: eventId,
      title: form.title.trim(),
      body: form.body.trim(),
      scheduled_at: scheduledAt,
      created_by: user?.id ?? null,
    });
    setSaving(false);

    if (error) { toast.error(error.message); return; }
    toast.success(form.sendMode === 'now' ? 'Sending now…' : 'Notification scheduled');
    setShowForm(false);
    fetchData();
  };

  const handleCancel = async (item: PushNotification) => {
    if (!(await confirm({ message: `Cancel "${item.title}"? It will not be sent.`, confirmLabel: 'Cancel Send', destructive: true }))) return;
    const { error } = await supabase.from('event_push_notifications').update({ status: 'canceled' }).eq('id', item.id);
    if (error) toast.error(error.message);
    else { toast.success('Canceled'); fetchData(); }
  };

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <SectionHeader sectionKey="notifications" desc={`${items.length} notification${items.length !== 1 ? 's' : ''} for this event`} />
        <div className="flex gap-2 flex-shrink-0">
          <button onClick={fetchData} className="btn-secondary">
            <span className="material-symbols-outlined text-[18px]">refresh</span> Refresh
          </button>
          <button onClick={openAdd} className="btn-primary">
            <span className="material-symbols-outlined text-[18px]">add</span> New Notification
          </button>
        </div>
      </div>

      <FormModal open={showForm} onClose={() => setShowForm(false)} title="New Notification" maxWidthClassName="max-w-lg">
        <div className="space-y-4">
          <div>
            <label className="label">Title *</label>
            <input className="input" value={form.title} onChange={e => setForm(p => ({ ...p, title: e.target.value }))} placeholder="Day 2 starts soon" maxLength={100} />
          </div>
          <div>
            <label className="label">Message *</label>
            <textarea className="input h-24 resize-none" value={form.body} onChange={e => setForm(p => ({ ...p, body: e.target.value }))} placeholder="Doors open in 30 minutes — see you in the Main Hall!" maxLength={240} />
          </div>
          <div>
            <label className="label">When</label>
            <div className="flex gap-2 mb-2">
              <button type="button" onClick={() => setForm(p => ({ ...p, sendMode: 'now' }))}
                className={`flex-1 py-2 rounded-xl text-sm font-medium border transition ${form.sendMode === 'now' ? 'bg-primary/10 border-primary text-primary' : 'border-outline-variant text-on-surface-variant'}`}>
                Send Now
              </button>
              <button type="button" onClick={() => setForm(p => ({ ...p, sendMode: 'later' }))}
                className={`flex-1 py-2 rounded-xl text-sm font-medium border transition ${form.sendMode === 'later' ? 'bg-primary/10 border-primary text-primary' : 'border-outline-variant text-on-surface-variant'}`}>
                Schedule
              </button>
            </div>
            {form.sendMode === 'later' && (
              <input type="datetime-local" className="input" value={form.scheduledAt} onChange={e => setForm(p => ({ ...p, scheduledAt: e.target.value }))} />
            )}
          </div>
          <p className="hint">Sent to every current member of this event who has notifications enabled.</p>
        </div>
        <div className="flex gap-3 mt-4 pt-4 border-t border-outline-variant">
          <button onClick={handleSave} disabled={saving} className="btn-primary">{saving ? 'Saving...' : form.sendMode === 'now' ? 'Send Now' : 'Schedule'}</button>
          <button onClick={() => setShowForm(false)} className="btn-secondary">Cancel</button>
        </div>
      </FormModal>

      {loading ? (
        <div className="space-y-2 animate-pulse">{[1, 2, 3].map(i => <div key={i} className="h-24 bg-surface-container-low rounded-[20px]" />)}</div>
      ) : items.length === 0 ? (
        <div className="text-center py-16 bg-white border border-[#E4EAF0] rounded-[20px] panel-shadow">
          <p className="material-symbols-outlined text-5xl text-on-surface-variant/30 mb-3">notifications</p>
          <p className="text-on-surface-variant">No notifications yet. Send or schedule the first one for this event.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {items.map(item => (
            <div key={item.id} className="bg-white border border-[#E4EAF0] rounded-[20px] panel-shadow p-5">
              <div className="flex items-start justify-between gap-3 mb-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${STATUS_CLASSES[item.status]}`}>
                      {STATUS_LABELS[item.status]}
                    </span>
                  </div>
                  <p className="font-bold text-on-surface">{item.title}</p>
                  <p className="text-sm text-on-surface-variant mt-0.5">{item.body}</p>
                </div>
                {item.status === 'scheduled' && (
                  <button onClick={() => handleCancel(item)} className="text-xs text-error font-medium flex-shrink-0 hover:opacity-80">
                    Cancel
                  </button>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-on-surface-variant mt-3 pt-3 border-t border-outline-variant/50">
                <span>
                  {item.status === 'scheduled' ? 'Scheduled for' : item.status === 'canceled' ? 'Was scheduled for' : 'Sent'}{' '}
                  {formatDateTime(item.sent_at ?? item.scheduled_at)}
                </span>
                {item.target_count !== null && (
                  <span>{item.sent_count ?? 0} / {item.target_count} delivered{item.failed_count ? `, ${item.failed_count} failed` : ''}</span>
                )}
                {item.error && <span className="text-error truncate" title={item.error}>{item.error}</span>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
