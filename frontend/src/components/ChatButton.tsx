import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { MessageCircle, Send, X, Paperclip, FileText, Loader2, Trash2, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { useDemoData } from '@/contexts/DemoDataContext';

const BACKEND = import.meta.env.VITE_BACKEND_URL ?? 'http://localhost:8000';
const ACCEPTED = '.pdf,.jpg,.jpeg,.png,.webp';

type Message = { role: 'user' | 'assistant'; text: string };

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

// ── Demo chat ──────────────────────────────────────────────────────────────────

const DEMO_QUERIES = [
  'Which invoices are overdue?',
  'How much have I spent on equipment this month?',
  'Show me the Atlantic Documentary budget',
  'Who are my top vendors?',
  'What is my total spend this month?',
  'How many active projects do I have?',
];

const DEMO_RESPONSES: Record<string, string> = {
  'Which invoices are overdue?':
    'You have 1 overdue invoice:\n\n• Lisbon Catering Co — €2,100\n  Atlantic Documentary · 14 days overdue\n\nIn your live account I can automatically send follow-up emails to chase overdue payments for you.',

  'How much have I spent on equipment this month?':
    'Across your active projects, you\'ve spent €42,000 on camera and aerial equipment:\n\n• Atlantic Camera Hire — €25,000 (Camera)\n• Northern Drone Services — €3,800 (Aerial, Atlantic)\n• Drone Cinematics Ltd — €13,200 (Aerial, Desert)\n\nIn your live account I can break this down by project, date range, or any category.',

  'Show me the Atlantic Documentary budget':
    'Atlantic Documentary\n\nBudget: €120,000\nSpent: €20,600 (17.2%)\nRemaining: €99,400\n\nBy category:\n• Camera — €8,500\n• Lighting — €6,200\n• Catering — €2,100 ⚠️ overdue\n• Aerial — €3,800\n\nOne invoice needs attention. In your live account I can chase the overdue payment automatically.',

  'Who are my top vendors?':
    'Your top vendors by total spend:\n\n1. Atlantic Camera Hire — €25,000\n2. Drone Cinematics Ltd — €13,200\n3. Northern Drone Services — €3,800\n4. Lisbon Catering Co — €2,100 ⚠️ payment overdue\n\nIn your live account I can show full vendor history, flag late payers, and track spend trends over time.',

  'What is my total spend this month?':
    'Total invoiced spend across all projects this month: €44,100\n\n• Atlantic Documentary — €20,600 (17.2% of budget)\n• Desert Expedition — €23,500 (17.4% of budget)\n\nIn your live account I can break this down by week, category, or payment status.',

  'How many active projects do I have?':
    'You have 2 active projects:\n\n• Atlantic Documentary — €120,000 budget, 17.2% spent\n• Desert Expedition — €135,000 budget, 17.4% spent\n\nCombined budget: €255,000 | Combined spend: €44,100\n\nIn your live account I can track budget burn rates and flag anything heading over budget.',
};

const DEMO_FALLBACK = 'In your live Bert account I can answer questions about your invoices, budgets, vendors, and projects in real time. Try one of the suggested questions to see what I can do.';

function getDemoResponse(text: string): string {
  return DEMO_RESPONSES[text] ?? DEMO_FALLBACK;
}

// ── Component ──────────────────────────────────────────────────────────────────


export const ChatButton = () => {
  const navigate = useNavigate();
  const { session, user } = useAuth();
  const { isDemoMode } = useDemoData();
  const [open, setOpen] = useState(false);

  // Demo chat state
  const [demoMessages, setDemoMessages] = useState<Message[]>([
    { role: 'assistant', text: 'Hi! I\'m Bert — your AI finance assistant. Ask me anything about your projects and invoices, or tap one of the examples below.' },
  ]);
  const [demoLoading, setDemoLoading] = useState(false);
  const [demoInput, setDemoInput] = useState('');
  const demoEndRef = useRef<HTMLDivElement>(null);

  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Load chat history from Supabase on first open
  useEffect(() => {
    if (!open || historyLoaded || !session) return;

    const loadHistory = async () => {
      const { data } = await supabase
        .from('chat_messages')
        .select('role, content')
        .eq('user_id', session.user.id)
        .order('created_at', { ascending: true })
        .limit(50);

      if (data && data.length > 0) {
        setMessages(data.map((m: any) => ({ role: m.role, text: m.content })));
      } else {
        setMessages([
          { role: 'assistant', text: "Hey, I'm Bert. Ask me about your spend, invoices, or projects — or upload a document to get started." },
        ]);
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
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    demoEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [demoMessages, demoLoading]);

  if (!user && !isDemoMode) return null;

  // ── Demo mode: interactive mock chat ──────────────────────────────────────
  if (isDemoMode) {
    const sendDemoMessage = async (text: string) => {
      if (!text.trim() || demoLoading) return;
      setDemoMessages(prev => [...prev, { role: 'user', text }]);
      setDemoInput('');
      setDemoLoading(true);
      await new Promise(r => setTimeout(r, 1500));
      setDemoMessages(prev => [...prev, { role: 'assistant', text: getDemoResponse(text) }]);
      setDemoLoading(false);
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
          <div className="flex items-center justify-between border-b px-6 py-4">
            <h2 className="text-base font-semibold">Talk to Bert!</h2>
            <button onClick={() => setOpen(false)} className="rounded-sm p-1 opacity-70 hover:opacity-100">
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
            {demoMessages.map((m, i) => (
              <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm whitespace-pre-wrap ${
                  m.role === 'user'
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-secondary text-secondary-foreground'
                }`}>
                  {m.text}
                </div>
              </div>
            ))}
            {/* Suggestion chips — always visible */}
            <div className="space-y-2">
              {DEMO_QUERIES.map((q) => (
                <button
                  key={q}
                  onClick={() => sendDemoMessage(q)}
                  disabled={demoLoading}
                  className="flex w-full items-start gap-2 rounded-lg border bg-secondary/40 px-3 py-2 text-left text-xs text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                >
                  <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary/60" />
                  {q}
                </button>
              ))}
            </div>
            {demoLoading && (
              <div className="flex justify-start">
                <div className="flex items-center gap-2 rounded-2xl bg-secondary px-4 py-2.5 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" /> Thinking...
                </div>
              </div>
            )}
            <div ref={demoEndRef} />
          </div>

          {/* Input */}
          <div className="border-t px-4 py-3">
            <form
              onSubmit={(e) => { e.preventDefault(); sendDemoMessage(demoInput); }}
              className="flex gap-2"
            >
              <Input
                value={demoInput}
                onChange={(e) => setDemoInput(e.target.value)}
                placeholder="Ask a question..."
                className="flex-1"
                disabled={demoLoading}
              />
              <Button type="submit" size="icon" disabled={demoLoading || !demoInput.trim()}>
                <Send className="h-4 w-4" />
              </Button>
            </form>
          </div>
        </div>
      </>
    );
  }

  const clearChat = async () => {
    const userId = session?.user?.id;
    if (userId) {
      await supabase.from('chat_messages').delete().eq('user_id', userId);
    }
    setMessages([
      { role: 'assistant', text: "Hey, I'm Bert. Ask me about your spend, invoices, or projects — or upload a document to get started." },
    ]);
  };

  const sendMessage = async () => {
    const text = input.trim();
    if ((!text && !file) || !session?.access_token) return;

    // Build user-facing text
    const userText = file
      ? file.name + (text ? ` — "${text}"` : '')
      : text;
    setMessages((prev) => [...prev, { role: 'user', text: userText }]);
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
          <h2 className="text-base font-semibold">Talk to Bert!</h2>
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
            <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm whitespace-pre-wrap ${
                m.role === 'user'
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-secondary text-secondary-foreground'
              }`}>
                {renderText(m.text, navigate)}
              </div>
            </div>
          ))}
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
            <div className="mb-2">
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
