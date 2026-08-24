'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import { useConfirm } from '@/contexts/ConfirmContext';
import { SectionHeader } from '@/components/portal/SectionHeader';
import { FormModal } from '@/components/portal/FormModal';
import toast from 'react-hot-toast';

type EmergencyContact = {
  id: string;
  name: string;
  phone: string;
  type: string;
  description: string | null;
  location: string | null;
  image_url: string | null;
  display_order: number;
};

type EmergencyImage = {
  id: string;
  image_url: string;
  caption: string | null;
  display_order: number;
};

type ContactForm = { name: string; phone: string; type: string; description: string; location: string; image_url: string; display_order: string };
type ImageForm = { image_url: string; caption: string; display_order: string };

const EMPTY_CONTACT: ContactForm = { name: '', phone: '', type: 'general', description: '', location: '', image_url: '', display_order: '0' };
const EMPTY_IMAGE: ImageForm = { image_url: '', caption: '', display_order: '0' };

const CONTACT_TYPES = ['general', 'police', 'ambulance', 'fire', 'medical', 'security', 'venue'];
const TYPE_COLOR: Record<string, string> = {
  general: 'bg-surface-container-low text-on-surface-variant',
  police: 'bg-blue-100 text-blue-700',
  ambulance: 'bg-red-100 text-red-700',
  fire: 'bg-orange-100 text-orange-700',
  medical: 'bg-green-100 text-green-700',
  security: 'bg-yellow-100 text-yellow-700',
  venue: 'bg-purple-100 text-purple-700',
};

export default function EmergencyPage() {
  const { eventId } = useParams<{ eventId: string }>();
  const confirm = useConfirm();
  const [contacts, setContacts] = useState<EmergencyContact[]>([]);
  const [images, setImages] = useState<EmergencyImage[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingContact, setEditingContact] = useState<EmergencyContact | null>(null);
  const [showContactForm, setShowContactForm] = useState(false);
  const [showImageForm, setShowImageForm] = useState(false);
  const [contactForm, setContactForm] = useState<ContactForm>(EMPTY_CONTACT);
  const [imageForm, setImageForm] = useState<ImageForm>(EMPTY_IMAGE);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<'contacts' | 'images'>('contacts');

  const fetchData = async () => {
    const [cRes, iRes] = await Promise.all([
      supabase.from('emergency_contacts').select('id,name,phone,type,description,location,image_url,display_order').eq('event_id', eventId).order('display_order'),
      supabase.from('emergency_images').select('id,image_url,caption,display_order').eq('event_id', eventId).order('display_order'),
    ]);
    if (cRes.error) toast.error('Failed to load contacts');
    else setContacts(cRes.data ?? []);
    setImages(iRes.data ?? []);
    setLoading(false);
  };

  useEffect(() => { if (eventId) fetchData(); }, [eventId]);

  const setC = (f: keyof ContactForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setContactForm(prev => ({ ...prev, [f]: e.target.value }));
  const setI = (f: keyof ImageForm) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setImageForm(prev => ({ ...prev, [f]: e.target.value }));

  const openEditContact = (c: EmergencyContact) => {
    setEditingContact(c);
    setContactForm({ name: c.name, phone: c.phone, type: c.type, description: c.description ?? '', location: c.location ?? '', image_url: c.image_url ?? '', display_order: c.display_order.toString() });
    setShowContactForm(true);
  };

  const handleSaveContact = async () => {
    if (!contactForm.name.trim() || !contactForm.phone.trim()) { toast.error('Name and phone are required'); return; }
    setSaving(true);
    const payload = { name: contactForm.name.trim(), phone: contactForm.phone.trim(), type: contactForm.type, description: contactForm.description || null, location: contactForm.location || null, image_url: contactForm.image_url || null, display_order: parseInt(contactForm.display_order) || 0 };
    if (editingContact) {
      const { error } = await supabase.from('emergency_contacts').update(payload).eq('id', editingContact.id);
      if (error) toast.error(error.message); else { toast.success('Updated'); setShowContactForm(false); fetchData(); }
    } else {
      const { error } = await supabase.from('emergency_contacts').insert({ ...payload, event_id: eventId });
      if (error) toast.error(error.message); else { toast.success('Contact added'); setShowContactForm(false); setContactForm(EMPTY_CONTACT); fetchData(); }
    }
    setSaving(false);
  };

  const handleDeleteContact = async (id: string, name: string) => {
    if (!(await confirm({ message: `Delete "${name}"?`, confirmLabel: 'Delete', destructive: true }))) return;
    const { error } = await supabase.from('emergency_contacts').delete().eq('id', id);
    if (error) toast.error(error.message); else { toast.success('Deleted'); fetchData(); }
  };

  const handleSaveImage = async () => {
    if (!imageForm.image_url.trim()) { toast.error('Image URL is required'); return; }
    setSaving(true);
    const { error } = await supabase.from('emergency_images').insert({ event_id: eventId, image_url: imageForm.image_url.trim(), caption: imageForm.caption || null, display_order: parseInt(imageForm.display_order) || images.length });
    if (error) toast.error(error.message); else { toast.success('Image added'); setShowImageForm(false); setImageForm(EMPTY_IMAGE); fetchData(); }
    setSaving(false);
  };

  const handleDeleteImage = async (id: string) => {
    if (!(await confirm({ message: 'Delete this image?', confirmLabel: 'Delete', destructive: true }))) return;
    const { error } = await supabase.from('emergency_images').delete().eq('id', id);
    if (error) toast.error(error.message); else { toast.success('Deleted'); fetchData(); }
  };

  return (
    <div>
      <div className="mb-6">
        <SectionHeader sectionKey="emergency" desc="Emergency contacts and safety information" />
      </div>

      {/* Tabs */}
      <div className="flex bg-surface-container-low p-1 rounded-xl mb-6 w-fit">
        {(['contacts', 'images'] as const).map(tab => (
          <button key={tab} onClick={() => setActiveTab(tab)} className={`px-4 py-1.5 rounded-lg text-label-sm font-label-sm transition capitalize ${activeTab === tab ? 'bg-white text-primary panel-shadow' : 'text-on-surface-variant hover:text-on-surface'}`}>
            {tab === 'contacts' ? `Contacts (${contacts.length})` : `Safety Images (${images.length})`}
          </button>
        ))}
      </div>

      {/* CONTACTS TAB */}
      {activeTab === 'contacts' && (
        <>
          <div className="flex justify-end mb-4">
            <button onClick={() => { setEditingContact(null); setContactForm({ ...EMPTY_CONTACT, display_order: contacts.length.toString() }); setShowContactForm(true); }} className="btn-primary">
              <span className="material-symbols-outlined text-[18px]">add</span> Add Contact
            </button>
          </div>

          <FormModal open={showContactForm} onClose={() => setShowContactForm(false)} title={editingContact ? 'Edit Contact' : 'New Emergency Contact'}>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="label">Name *</label>
                  <input className="input" value={contactForm.name} onChange={setC('name')} placeholder="City Police" />
                </div>
                <div>
                  <label className="label">Phone *</label>
                  <input className="input" value={contactForm.phone} onChange={setC('phone')} placeholder="10111" />
                </div>
                <div>
                  <label className="label">Type</label>
                  <select className="input" value={contactForm.type} onChange={setC('type')}>
                    {CONTACT_TYPES.map(t => <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
                  </select>
                </div>
                <div>
                  <label className="label">Location</label>
                  <input className="input" value={contactForm.location} onChange={setC('location')} placeholder="Gate A" />
                </div>
                <div className="sm:col-span-2">
                  <label className="label">Description</label>
                  <textarea className="input h-16 resize-none" value={contactForm.description} onChange={setC('description')} placeholder="Additional details..." data-gramm="false" data-gramm_editor="false" data-enable-grammarly="false" />
                </div>
                <div className="sm:col-span-2">
                  <label className="label">Image URL</label>
                  <input className="input" value={contactForm.image_url} onChange={setC('image_url')} placeholder="https://..." />
                </div>
              </div>
              <div className="flex gap-3 mt-4 pt-4 border-t border-outline-variant">
                <button onClick={handleSaveContact} disabled={saving} className="btn-primary">{saving ? 'Saving...' : editingContact ? 'Update' : 'Add Contact'}</button>
                <button onClick={() => setShowContactForm(false)} className="btn-secondary">Cancel</button>
              </div>
          </FormModal>

          {loading ? <div className="animate-pulse space-y-3">{[1,2].map(i=><div key={i} className="h-16 bg-surface-container-low rounded-[20px]"/>)}</div>
          : contacts.length === 0 ? (
            <div className="text-center py-16 bg-white border border-[#E4EAF0] rounded-[20px] panel-shadow"><p className="material-symbols-outlined text-5xl text-on-surface-variant/30 mb-3">emergency</p><p className="text-on-surface-variant">No emergency contacts yet.</p></div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              {contacts.map(c => (
                <div key={c.id} className="flex items-center gap-4 bg-white border border-[#E4EAF0] rounded-[20px] panel-shadow p-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5 min-w-0">
                      <span className={`flex-shrink-0 text-xs px-2 py-0.5 rounded-full font-medium capitalize ${TYPE_COLOR[c.type] ?? 'bg-surface-container-low text-on-surface-variant'}`}>{c.type}</span>
                      <p className="font-semibold text-on-surface truncate">{c.name}</p>
                    </div>
                    <p className="text-sm font-mono text-on-surface-variant truncate">{c.phone}</p>
                    {c.location && (
                      <p className="text-xs text-on-surface-variant/70 flex items-center gap-1 truncate">
                        <span className="material-symbols-outlined text-[14px] flex-shrink-0">location_on</span> <span className="truncate">{c.location}</span>
                      </p>
                    )}
                  </div>
                  <div className="flex gap-1 sm:gap-2 flex-shrink-0">
                    <button onClick={() => openEditContact(c)} title="Edit" className="text-sm text-primary hover:opacity-80 font-medium px-2 py-1 rounded-lg hover:bg-primary/5">
                      <span className="hidden sm:inline">Edit</span>
                      <span className="material-symbols-outlined text-[16px] sm:hidden">edit</span>
                    </button>
                    <button onClick={() => handleDeleteContact(c.id, c.name)} title="Delete" className="text-sm text-error hover:opacity-80 font-medium px-2 py-1 rounded-lg hover:bg-error/5">
                      <span className="hidden sm:inline">Delete</span>
                      <span className="material-symbols-outlined text-[16px] sm:hidden">delete</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* IMAGES TAB */}
      {activeTab === 'images' && (
        <>
          <div className="flex justify-end mb-4">
            <button onClick={() => setShowImageForm(true)} className="btn-primary">
              <span className="material-symbols-outlined text-[18px]">add</span> Add Image
            </button>
          </div>

          <FormModal open={showImageForm} onClose={() => setShowImageForm(false)} title="Add Safety Image" maxWidthClassName="max-w-2xl">
              <div className="space-y-4">
                <div>
                  <label className="label">Image URL *</label>
                  <input className="input" value={imageForm.image_url} onChange={setI('image_url')} placeholder="https://..." />
                  {imageForm.image_url && <img src={imageForm.image_url} alt="" className="mt-2 h-32 rounded-xl object-cover border border-outline-variant" onError={e=>{(e.target as HTMLImageElement).style.display='none';}} />}
                </div>
                <div>
                  <label className="label">Caption</label>
                  <input className="input" value={imageForm.caption} onChange={setI('caption')} placeholder="Emergency evacuation map" />
                </div>
              </div>
              <div className="flex gap-3 mt-4 pt-4 border-t border-outline-variant">
                <button onClick={handleSaveImage} disabled={saving} className="btn-primary">{saving ? 'Saving...' : 'Add Image'}</button>
                <button onClick={() => setShowImageForm(false)} className="btn-secondary">Cancel</button>
              </div>
          </FormModal>

          {images.length === 0 ? (
            <div className="text-center py-16 bg-white border border-[#E4EAF0] rounded-[20px] panel-shadow"><p className="material-symbols-outlined text-5xl text-on-surface-variant/30 mb-3">image</p><p className="text-on-surface-variant">No safety images yet.</p></div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
              {images.map(img => (
                <div key={img.id} className="bg-white border border-[#E4EAF0] rounded-[20px] panel-shadow overflow-hidden">
                  <img src={img.image_url} alt={img.caption ?? ''} className="w-full h-40 object-cover" onError={e=>{(e.target as HTMLImageElement).alt='Image failed to load';}} />
                  <div className="p-3 flex items-center justify-between">
                    <p className="text-sm text-on-surface truncate">{img.caption ?? 'No caption'}</p>
                    <button onClick={() => handleDeleteImage(img.id)} className="text-xs text-error hover:opacity-80 font-medium px-2 py-1 rounded-lg hover:bg-error/5 flex-shrink-0">Delete</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
