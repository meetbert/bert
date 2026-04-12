import { useEffect, useRef, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { MessageCircle, Send, X, Paperclip, FileText, Loader2, Trash2, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';

const BACKEND = import.meta.env.VITE_BACKEND_URL ?? 'http://localhost:8000';
const ACCEPTED = '.pdf,.jpg,.jpeg,.png,.webp';

type Message = { role: 'user' | 'assistant'; text: string; attachment?: string };

const PANEL_WIDTH = 'sm:w-[400px]';

const LINK_RE = /\[([^\]]+)\]\((\/[^)]+)\)/g;

function renderText(text: string, navigate: (path: string) => void): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  let last = 0;
  let match: RegExpExecArray | null;
  LINK_RE.lastIndex = 0;
  while ((match = LINK_RE.exec(text)) !== null) {
    if (match.index > last) parts.push(text.slice(last, match.index));
    const [, label, href] = match;
    parts.push(
      <button
        key={match.index}
        onClick={() => navigate(href)}
        className="underline text-primary hover:opacity-80"
      >
        {label}
      </button>
    );
    last = match.index + match[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

const GREETING = "Hey, I'm Bert. Ask me about your spend, invoices, or projects — or upload a document to get started.";

// ── Component ──────────────────────────────────────────────────────────────────

export const ChatButton = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { session, user } = useAuth();
  const [open, setOpen] = useState(false);

  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Load chat history + build personalised suggestions on first open
  useEffect(() => {
    if (!open || historyLoaded || !session) return;

    const loadHistory = async () => {
      const userId = session.user.id;

      const db = supabase as any;
      const historyRes = await supabase.from('chat_messages').select('role, content, attachment_path').eq('user_id', userId).order('created_at', { ascending: true }).limit(50);
      const projectRes = await db.from('projects').select('name').eq('user_id', userId).eq('status', 'Active').order('created_at', { ascending: false }).limit(1);
      const project = projectRes.data?.[0]?.name as string | undefined;

      setSuggestions([
        'Which invoices are overdue?',
        'How much have I spent this month?',
        project ? `Show me the ${project} budget` : 'Show me my project budgets',
        'Who are my top vendors?',
        'What invoices are due this week?',
      ]);

      if (historyRes.data && historyRes.data.length > 0) {
        setMessages(historyRes.data.map((m: any) => {
          if (!m.attachment_path) return { role: m.role, text: m.content };
          const rawName = m.attachment_path.split('/').pop()!;
          // Strip 12-char hash prefix added by store_attachment (e.g. "5e89cea9af29_")
          const filename = rawName.replace(/^[0-9a-f]{12}_/, '');
          const oldMatch = m.content?.match(/^.+ — "(.+)"$/s);
          const text = oldMatch ? oldMatch[1] : (m.content === rawName || m.content === filename ? '' : (m.content ?? ''));
          return { role: m.role, text, attachment: filename };
        }));
      } else {
        setMessages([{ role: 'assistant', text: GREETING }]);
      }
      setHistoryLoaded(true);
    };

    loadHistory();
  }, [open, historyLoaded, session]);

  useEffect(() => {
    const wrapper = document.getElementById('app-content');
    wrapper?.classList.toggle('chat-open', open);
    return () => wrapper?.classList.remove('chat-open');
  }, [open]);

  useEffect(() => {
    if (location.pathname === '/' || location.pathname === '/login') setOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  if (!user) return null;
  if (location.pathname === '/') return null;

  const clearChat = async () => {
    const userId = session?.user?.id;
    if (userId) {
      await supabase.from('chat_messages').delete().eq('user_id', userId);
    }
    setMessages([{ role: 'assistant', text: GREETING }]);
  };

  const sendText = async (text: string) => {
    if (!text || !session?.access_token) return;
    setMessages((prev) => [...prev, { role: 'user', text }]);
    setLoading(true);
    try {
      const formData = new FormData();
      formData.append('message', text);
      const resp = await fetch(`${BACKEND}/api/chat`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.access_token}` },
        body: formData,
      });
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({ detail: 'Request failed' }));
        const detail = err.detail;
        const errMsg = typeof detail === 'string' ? detail : Array.isArray(detail) ? detail.map((d: any) => d.msg).join(', ') : 'Something went wrong.';
        setMessages((prev) => [...prev, { role: 'assistant', text: `Error: ${errMsg}` }]);
        return;
      }
      const data = await resp.json();
      setMessages((prev) => [...prev, { role: 'assistant', text: data.response }]);
    } catch {
      setMessages((prev) => [...prev, { role: 'assistant', text: 'Could not reach the server. Is the backend running?' }]);
    } finally {
      setLoading(false);
    }
  };

  const sendMessage = async () => {
    const text = input.trim();
    if ((!text && !file) || !session?.access_token) return;

    const userText = text;
    setMessages((prev) => [...prev, { role: 'user', text: userText, attachment: file?.name }]);
    setLoading(true);
    setInput('');
    const uploadedFile = file;
    setFile(null);

    try {
      const formData = new FormData();
      formData.append('message', text || '');
      if (uploadedFile) {
        formData.append('file', uploadedFile);
      }

      const resp = await fetch(`${BACKEND}/api/chat`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.access_token}` },
        body: formData,
      });

      if (!resp.ok) {
        const err = await resp.json().catch(() => ({ detail: 'Request failed' }));
        const detail = err.detail;
        const errMsg = typeof detail === 'string' ? detail : Array.isArray(detail) ? detail.map((d: any) => d.msg).join(', ') : 'Something went wrong.';
        setMessages((prev) => [...prev, { role: 'assistant', text: `Error: ${errMsg}` }]);
        return;
      }

      const data = await resp.json();
      setMessages((prev) => [...prev, { role: 'assistant', text: data.response }]);
    } catch {
      setMessages((prev) => [...prev, { role: 'assistant', text: 'Could not reach the server. Is the backend running?' }]);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;
    sendMessage();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (selected) setFile(selected);
    e.target.value = '';
  };

  return (
    <>
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="fixed bottom-6 right-6 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition-transform hover:scale-105 active:scale-95"
          aria-label="Open chat"
        >
          <MessageCircle className="h-6 w-6" />
        </button>
      )}

      <div
        className={`fixed inset-y-0 right-0 z-40 flex w-full ${PANEL_WIDTH} flex-col border-l bg-background shadow-xl transition-transform duration-300 ease-in-out ${
          open ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b px-6 py-4">
          <span className="text-lg font-extrabold">Talk to <span className="text-primary">Bert.</span></span>
          <div className="flex items-center gap-1">
            <button onClick={clearChat} className="rounded-sm p-1 opacity-70 hover:opacity-100" title="Clear chat">
              <Trash2 className="h-4 w-4" />
            </button>
            <button onClick={() => setOpen(false)} className="rounded-sm p-1 opacity-70 hover:opacity-100">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {messages.map((m, i) => (
            <div key={i} className={`flex flex-col gap-1 ${m.role === 'user' ? 'items-end' : 'items-start'}`}>
              {m.attachment && (
                <div className="inline-flex items-center gap-2 rounded-lg border bg-secondary/50 px-3 py-1.5 text-xs text-foreground">
                  <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  <span className="max-w-[200px] truncate">{m.attachment}</span>
                </div>
              )}
              {m.text && (
                <div className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm whitespace-pre-wrap ${
                  m.role === 'user'
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-secondary text-secondary-foreground'
                }`}>
                  {renderText(m.text, navigate)}
                </div>
              )}
            </div>
          ))}
          {/* Suggestion chips — only when no user messages yet */}
          {suggestions.length > 0 && !messages.some(m => m.role === 'user') && (
            <div className="space-y-2">
              {suggestions.map((q) => (
                <button
                  key={q}
                  onClick={() => sendText(q)}
                  disabled={loading}
                  className="flex w-full items-start gap-2 rounded-lg border bg-secondary/40 px-3 py-2 text-left text-xs text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                >
                  <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary/60" />
                  {q}
                </button>
              ))}
            </div>
          )}
          {loading && (
            <div className="flex justify-start">
              <div className="flex items-center gap-2 rounded-2xl bg-secondary px-4 py-2.5 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Processing...
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <div className="border-t px-4 py-3">
          {/* File preview chip */}
          {file && (
            <div className="mb-3">
              <div className="inline-flex items-center gap-2 rounded-lg border bg-secondary/50 px-3 py-1.5 text-xs">
                <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="max-w-[200px] truncate">{file.name}</span>
                <button onClick={() => setFile(null)} className="text-muted-foreground hover:text-foreground">
                  <X className="h-3 w-3" />
                </button>
              </div>
            </div>
          )}
          <form onSubmit={handleSubmit} className="flex gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept={ACCEPTED}
              className="hidden"
              onChange={handleFileChange}
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => fileInputRef.current?.click()}
              disabled={loading}
              className="shrink-0"
            >
              <Paperclip className="h-4 w-4" />
            </Button>
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={file ? 'Add a note (optional)...' : 'Ask a question...'}
              className="flex-1"
              disabled={loading}
            />
            <Button type="submit" size="icon" disabled={loading || (!input.trim() && !file)}>
              <Send className="h-4 w-4" />
            </Button>
          </form>
        </div>
      </div>
    </>
  );
};
