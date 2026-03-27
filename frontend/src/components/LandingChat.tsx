import { useEffect, useRef, useState } from 'react';
import { MessageCircle, Send, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

type Message = { role: 'user' | 'assistant'; text: string };

const GREETING = "Hi! I'm Bert. Ask me anything about what I do — or just try the demo to see for yourself.";

const FAQS: { keywords: string[]; answer: string }[] = [
  {
    keywords: ['what', 'do', 'does', 'bert', 'is'],
    answer: "Bert is an AI-powered invoice management platform. Vendors email invoices to your dedicated Bert inbox, and Bert automatically extracts all the data — vendor, amount, date, line items — and adds it to your dashboard. No manual entry needed.",
  },
  {
    keywords: ['how', 'work', 'works', 'process'],
    answer: "Simple three-step flow: (1) A vendor emails an invoice to your Bert inbox. (2) Bert's AI pipeline reads the invoice and extracts every field. (3) The structured data appears instantly in your dashboard, assigned to the right project and category.",
  },
  {
    keywords: ['email', 'inbox', 'forward', 'send'],
    answer: "Every Bert user gets a dedicated email address (e.g. yourcompany@meetbert.uk). Ask vendors to send invoices there directly, or CC it on email threads. Bert handles the rest.",
  },
  {
    keywords: ['project', 'budget', 'production', 'track'],
    answer: "You can create projects (e.g. a film production or campaign) with total budgets and per-category limits. Bert automatically assigns incoming invoices to the right project based on vendor history, so your budget tracking stays up to date without any manual work.",
  },
  {
    keywords: ['overdue', 'payment', 'alert', 'cashflow', 'unpaid'],
    answer: "Bert tracks due dates on every invoice and flags anything overdue or due soon. Your dashboard shows outstanding amounts at a glance so you can stay on top of cashflow.",
  },
  {
    keywords: ['chat', 'ask', 'question', 'query', 'search'],
    answer: "There's a built-in chat interface where you can ask Bert questions about your spend in plain English — things like 'What did we spend with Atlantic Camera Hire last month?' or 'Which projects are over budget?'",
  },
  {
    keywords: ['ai', 'model', 'claude', 'anthropic', 'llm'],
    answer: "Bert uses Claude (by Anthropic) to read and understand invoices, and LangChain to orchestrate the multi-agent pipeline. The system is designed to handle messy real-world invoices — different formats, currencies, and layouts.",
  },
  {
    keywords: ['currency', 'currencies', 'multi', 'international', 'foreign'],
    answer: "Bert handles multi-currency invoices. You can set a base currency and Bert converts everything for reporting, so your budget totals are always comparable.",
  },
  {
    keywords: ['demo', 'try', 'test', 'example'],
    answer: "Click 'Try demo' at the top of the page to explore a pre-loaded dashboard with real projects and invoices — no sign-up needed. You can browse, filter, and even send a test invoice to watch the pipeline run live.",
  },
  {
    keywords: ['price', 'pricing', 'cost', 'free', 'plan'],
    answer: "Bert is currently in demo. Reach out to the team at meetbert.uk to discuss access.",
  },
  {
    keywords: ['sign', 'signup', 'register', 'account', 'start'],
    answer: "You can get started by clicking 'Log in' in the top right corner to create an account, or try the demo first to see how Bert works without signing up.",
  },
];

function getAnswer(input: string): string {
  const lower = input.toLowerCase();
  const words = lower.split(/\W+/);

  let bestMatch = { score: 0, answer: '' };
  for (const faq of FAQS) {
    const score = faq.keywords.filter((kw) => words.includes(kw) || lower.includes(kw)).length;
    if (score > bestMatch.score) {
      bestMatch = { score, answer: faq.answer };
    }
  }

  if (bestMatch.score > 0) return bestMatch.answer;
  return "I'm not sure about that — try the demo to explore Bert yourself, or email us at hello@meetbert.uk with any questions.";
}

export const LandingChat = () => {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([{ role: 'assistant', text: GREETING }]);
  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const send = () => {
    const text = input.trim();
    if (!text) return;
    setInput('');
    const answer = getAnswer(text);
    setMessages((prev) => [
      ...prev,
      { role: 'user', text },
      { role: 'assistant', text: answer },
    ]);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    send();
  };

  return (
    <>
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="fixed bottom-6 right-6 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition-transform hover:scale-105 active:scale-95"
          aria-label="Ask about Bert"
        >
          <MessageCircle className="h-6 w-6" />
        </button>
      )}

      <div
        className={`fixed inset-y-0 right-0 z-40 flex w-full sm:w-[400px] flex-col border-l bg-background shadow-xl transition-transform duration-300 ease-in-out ${
          open ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        <div className="flex items-center justify-between border-b px-6 py-4">
          <h2 className="text-base font-semibold">Ask about Bert</h2>
          <button onClick={() => setOpen(false)} className="rounded-sm p-1 opacity-70 hover:opacity-100">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {messages.map((m, i) => (
            <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div
                className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm whitespace-pre-wrap ${
                  m.role === 'user'
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-secondary text-secondary-foreground'
                }`}
              >
                {m.text}
              </div>
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>

        <div className="border-t px-4 py-3">
          <form onSubmit={handleSubmit} className="flex gap-2">
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask me anything..."
              className="flex-1"
            />
            <Button type="submit" size="icon" disabled={!input.trim()}>
              <Send className="h-4 w-4" />
            </Button>
          </form>
        </div>
      </div>
    </>
  );
};
