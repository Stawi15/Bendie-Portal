'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import { useConfirm } from '@/contexts/ConfirmContext';
import { SectionHeader } from '@/components/portal/SectionHeader';
import { FormModal } from '@/components/portal/FormModal';
import toast from 'react-hot-toast';

type Game = {
  id: string;
  title: string;
  description: string | null;
  type: string;
  image_url: string | null;
  background_color: string | null;
  is_active: boolean;
};

type Question = {
  id: string;
  game_id: string;
  category: string | null;
  question: string;
  correct_answer: string | null;
  answer_options: Record<string, string> | null;
  points: number;
  display_order: number;
};

type GameForm = { title: string; description: string; type: string; image_url: string; background_color: string; is_active: boolean };
type QuestionForm = { question: string; category: string; correct_answer: string; answer_options: string; points: string };

const GAME_TYPES = ['jeopardy', 'kmky'] as const;
const GAME_TYPE_LABELS: Record<string, string> = { jeopardy: 'Jeopardy', kmky: 'KMKY' };

const EMPTY_GAME: GameForm = { title: '', description: '', type: 'jeopardy', image_url: '', background_color: '', is_active: true };
const EMPTY_Q: QuestionForm = { question: '', category: '', correct_answer: '', answer_options: '', points: '10' };

export default function GamesPage() {
  const { eventId } = useParams<{ eventId: string }>();
  const confirm = useConfirm();
  const [games, setGames] = useState<Game[]>([]);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedGame, setSelectedGame] = useState<Game | null>(null);
  const [editingGame, setEditingGame] = useState<Game | null>(null);
  const [editingQuestion, setEditingQuestion] = useState<Question | null>(null);
  const [showGameForm, setShowGameForm] = useState(false);
  const [showQForm, setShowQForm] = useState(false);
  const [gameForm, setGameForm] = useState<GameForm>(EMPTY_GAME);
  const [qForm, setQForm] = useState<QuestionForm>(EMPTY_Q);
  const [saving, setSaving] = useState(false);

  const fetchGames = async () => {
    const { data, error } = await supabase.from('games').select('id,title,description,type,image_url,background_color,is_active').eq('event_id', eventId).order('created_at');
    if (error) toast.error('Failed to load games');
    else setGames(data ?? []);
    setLoading(false);
  };

  const fetchQuestions = async (gameId: string) => {
    const { data, error } = await supabase.from('game_questions').select('id,game_id,category,question,correct_answer,answer_options,points,display_order').eq('game_id', gameId).order('display_order');
    if (error) toast.error('Failed to load questions');
    else setQuestions(data ?? []);
  };

  useEffect(() => { if (eventId) fetchGames(); }, [eventId]);
  useEffect(() => { if (selectedGame) fetchQuestions(selectedGame.id); else setQuestions([]); }, [selectedGame]);

  const setG = (f: keyof GameForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setGameForm(prev => ({ ...prev, [f]: e.target.value }));
  const setQ = (f: keyof QuestionForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setQForm(prev => ({ ...prev, [f]: e.target.value }));

  const handleSaveGame = async () => {
    if (!gameForm.title.trim()) { toast.error('Title is required'); return; }
    setSaving(true);
    const payload = { title: gameForm.title, description: gameForm.description || null, type: gameForm.type, image_url: gameForm.image_url || null, background_color: gameForm.background_color || null, is_active: gameForm.is_active };
    if (editingGame) {
      const { error } = await supabase.from('games').update(payload).eq('id', editingGame.id);
      if (error) toast.error(error.message);
      else { toast.success('Game updated'); setShowGameForm(false); setEditingGame(null); fetchGames(); }
    } else {
      const { data, error } = await supabase.from('games').insert({ ...payload, event_id: eventId }).select().single();
      if (error) toast.error(error.message);
      else { toast.success('Game created'); setShowGameForm(false); setGameForm(EMPTY_GAME); fetchGames(); if (data) setSelectedGame(data); }
    }
    setSaving(false);
  };

  const handleDeleteGame = async (id: string, title: string) => {
    if (!(await confirm({ message: `Delete game "${title}" and all its questions?`, confirmLabel: 'Delete', destructive: true }))) return;
    const { error } = await supabase.from('games').delete().eq('id', id);
    if (error) toast.error(error.message);
    else { toast.success('Deleted'); if (selectedGame?.id === id) setSelectedGame(null); fetchGames(); }
  };

  const handleSaveQuestion = async () => {
    if (!qForm.question.trim()) { toast.error('Question text is required'); return; }
    if (!selectedGame) return;
    setSaving(true);
    let parsedOptions = null;
    if (qForm.answer_options.trim()) {
      try { parsedOptions = JSON.parse(qForm.answer_options); } catch { toast.error('Answer options must be valid JSON, e.g. {"a":"Option A","b":"Option B"}'); setSaving(false); return; }
    }
    const payload = { question: qForm.question, category: qForm.category || null, correct_answer: qForm.correct_answer || null, answer_options: parsedOptions, points: parseInt(qForm.points) || 10 };
    if (editingQuestion) {
      const { error } = await supabase.from('game_questions').update(payload).eq('id', editingQuestion.id);
      if (error) toast.error(error.message); else { toast.success('Question updated'); setShowQForm(false); setEditingQuestion(null); fetchQuestions(selectedGame.id); }
    } else {
      const { error } = await supabase.from('game_questions').insert({ ...payload, game_id: selectedGame.id, display_order: questions.length });
      if (error) toast.error(error.message); else { toast.success('Question added'); setShowQForm(false); setQForm(EMPTY_Q); fetchQuestions(selectedGame.id); }
    }
    setSaving(false);
  };

  const handleDeleteQuestion = async (id: string) => {
    if (!(await confirm({ message: 'Delete this question?', confirmLabel: 'Delete', destructive: true }))) return;
    const { error } = await supabase.from('game_questions').delete().eq('id', id);
    if (error) toast.error(error.message); else { toast.success('Deleted'); if (selectedGame) fetchQuestions(selectedGame.id); }
  };

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <SectionHeader sectionKey="games" desc={`${games.length} game${games.length !== 1 ? 's' : ''}`} />
        <button onClick={() => { setEditingGame(null); setGameForm(EMPTY_GAME); setShowGameForm(true); }} className="btn-primary flex-shrink-0">
          <span className="material-symbols-outlined text-[18px]">add</span> New Game
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Games list */}
        <div className="lg:col-span-1">
          <h3 className="text-xs font-semibold text-on-surface-variant uppercase tracking-wide mb-3">Games</h3>
          {loading ? <div className="animate-pulse space-y-2">{[1,2].map(i=><div key={i} className="h-14 bg-surface-container-low rounded-xl"/>)}</div>
          : games.length === 0 ? <p className="text-sm text-on-surface-variant/70 italic">No games yet.</p>
          : (
            <div className="space-y-2">
              {games.map(g => (
                <div key={g.id} onClick={() => setSelectedGame(g)} className={`cursor-pointer rounded-[20px] p-3 border transition ${selectedGame?.id === g.id ? 'border-primary bg-primary/5' : 'border-[#E4EAF0] bg-white panel-shadow hover:border-primary/30'}`}>
                  <div className="flex items-center justify-between">
                    <p className="font-medium text-sm text-on-surface truncate">{g.title}</p>
                    <span className={`text-xs px-1.5 py-0.5 rounded-full ${g.is_active ? 'bg-green-100 text-green-700' : 'bg-surface-container-low text-on-surface-variant'}`}>{g.is_active ? 'Active' : 'Off'}</span>
                  </div>
                  <p className="text-xs text-on-surface-variant/70 mt-0.5">{GAME_TYPE_LABELS[g.type] ?? g.type}</p>
                  <div className="flex gap-2 mt-2">
                    <button onClick={e => { e.stopPropagation(); setEditingGame(g); setGameForm({ title: g.title, description: g.description ?? '', type: g.type, image_url: g.image_url ?? '', background_color: g.background_color ?? '', is_active: g.is_active }); setShowGameForm(true); }} className="text-xs text-primary hover:opacity-80">Edit</button>
                    <button onClick={e => { e.stopPropagation(); handleDeleteGame(g.id, g.title); }} className="text-xs text-error hover:opacity-80">Delete</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Questions panel */}
        <div className="lg:col-span-2">
          {!selectedGame ? (
            <div className="flex items-center justify-center h-64 bg-white border border-[#E4EAF0] rounded-[20px] panel-shadow text-on-surface-variant text-sm">Select a game to manage its questions</div>
          ) : (
            <>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-xs font-semibold text-on-surface-variant uppercase tracking-wide">
                  {selectedGame.title} — {questions.length} question{questions.length !== 1 ? 's' : ''}
                </h3>
                <button onClick={() => { setEditingQuestion(null); setQForm(EMPTY_Q); setShowQForm(true); }} className="btn-primary text-xs py-1.5">
                  <span className="material-symbols-outlined text-[16px]">add</span> Add Question
                </button>
              </div>

              <FormModal open={showQForm} onClose={() => { setShowQForm(false); setEditingQuestion(null); }} title={editingQuestion ? 'Edit Question' : 'New Question'} maxWidthClassName="max-w-xl">
                  <div className="space-y-3">
                    <div>
                      <label className="label">Question *</label>
                      <textarea className="input h-16 resize-none text-sm" value={qForm.question} onChange={setQ('question')} placeholder="What year did...?" data-gramm="false" data-gramm_editor="false" data-enable-grammarly="false" />
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="label">Category</label>
                        <input className="input text-sm" value={qForm.category} onChange={setQ('category')} placeholder="History" />
                      </div>
                      <div>
                        <label className="label">Points</label>
                        <input type="number" className="input text-sm" value={qForm.points} onChange={setQ('points')} min={0} />
                      </div>
                    </div>
                    <div>
                      <label className="label">Correct Answer</label>
                      <input className="input text-sm" value={qForm.correct_answer} onChange={setQ('correct_answer')} placeholder="The correct answer" />
                    </div>
                    <div>
                      <label className="label">Answer Options (JSON)</label>
                      <textarea className="input h-16 resize-none text-sm font-mono" value={qForm.answer_options} onChange={setQ('answer_options')} placeholder='{"a":"Option A","b":"Option B","c":"Option C","d":"Option D"}' data-gramm="false" data-gramm_editor="false" data-enable-grammarly="false" />
                      <p className="hint">Optional — for multiple-choice questions</p>
                    </div>
                  </div>
                  <div className="flex gap-3 mt-3 pt-3 border-t border-outline-variant">
                    <button onClick={handleSaveQuestion} disabled={saving} className="btn-primary text-xs py-1.5">{saving ? 'Saving...' : editingQuestion ? 'Update' : 'Add'}</button>
                    <button onClick={() => { setShowQForm(false); setEditingQuestion(null); }} className="btn-secondary text-xs py-1.5">Cancel</button>
                  </div>
              </FormModal>

              <div className="space-y-2">
                {questions.map((q, i) => (
                  <div key={q.id} className="bg-white border border-[#E4EAF0] rounded-[20px] panel-shadow p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-xs text-on-surface-variant/70 font-mono">#{i + 1}</span>
                          {q.category && <span className="text-xs px-1.5 py-0.5 rounded bg-surface-container-low text-on-surface-variant">{q.category}</span>}
                          <span className="text-xs text-primary font-medium">{q.points}pts</span>
                        </div>
                        <p className="text-sm font-medium text-on-surface">{q.question}</p>
                        {q.correct_answer && <p className="text-xs text-green-700 mt-1">✓ {q.correct_answer}</p>}
                        {q.answer_options && <p className="text-xs text-on-surface-variant/70 mt-1 font-mono">{JSON.stringify(q.answer_options)}</p>}
                      </div>
                      <div className="flex gap-2 flex-shrink-0">
                        <button onClick={() => { setEditingQuestion(q); setQForm({ question: q.question, category: q.category ?? '', correct_answer: q.correct_answer ?? '', answer_options: q.answer_options ? JSON.stringify(q.answer_options) : '', points: q.points.toString() }); setShowQForm(true); }} className="text-xs text-primary hover:opacity-80 font-medium px-2 py-1 rounded-lg hover:bg-primary/5">Edit</button>
                        <button onClick={() => handleDeleteQuestion(q.id)} className="text-xs text-error hover:opacity-80 font-medium px-2 py-1 rounded-lg hover:bg-error/5">Delete</button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Game form modal */}
      <FormModal open={showGameForm} onClose={() => { setShowGameForm(false); setEditingGame(null); }} title={editingGame ? 'Edit Game' : 'New Game'} maxWidthClassName="max-w-md">
            <div className="space-y-4">
              <div>
                <label className="label">Title *</label>
                <input className="input" value={gameForm.title} onChange={setG('title')} placeholder="Company Trivia" />
              </div>
              <div>
                <label className="label">Type</label>
                <select className="input" value={gameForm.type} onChange={setG('type')}>
                  {GAME_TYPES.map(t => <option key={t} value={t}>{GAME_TYPE_LABELS[t]}</option>)}
                </select>
                <p className="hint">Drives which game screen opens in-app — only these two are supported</p>
              </div>
              <div>
                <label className="label">Description</label>
                <textarea className="input h-16 resize-none" value={gameForm.description} onChange={setG('description')} data-gramm="false" data-gramm_editor="false" data-enable-grammarly="false" />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="label">Image URL</label>
                  <input className="input" value={gameForm.image_url} onChange={setG('image_url')} placeholder="https://..." />
                </div>
                <div>
                  <label className="label">Background Color</label>
                  <input className="input" value={gameForm.background_color} onChange={setG('background_color')} placeholder="#1D4ED8" />
                </div>
              </div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={gameForm.is_active} onChange={e => setGameForm(p => ({ ...p, is_active: e.target.checked }))} className="w-4 h-4 accent-primary rounded" />
                <span className="text-sm font-medium text-on-surface">Active (visible to attendees)</span>
              </label>
            </div>
            <div className="flex gap-3 mt-5 pt-4 border-t border-outline-variant">
              <button onClick={handleSaveGame} disabled={saving} className="btn-primary">{saving ? 'Saving...' : editingGame ? 'Update' : 'Create Game'}</button>
              <button onClick={() => { setShowGameForm(false); setEditingGame(null); }} className="btn-secondary">Cancel</button>
            </div>
      </FormModal>
    </div>
  );
}
