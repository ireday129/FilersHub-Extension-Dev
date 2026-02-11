
import React, { useState, useRef, useEffect } from 'react';
import { Send, Sparkles, User, Bot, Loader2, Info } from 'lucide-react';
import { getTaxAdvice } from '../services/geminiService';

interface ChatMessage {
  role: 'user' | 'ai';
  content: string;
}

const AIChat: React.FC = () => {
  const [messages, setMessages] = useState<ChatMessage[]>([
    { role: 'ai', content: "Hello! I'm your TaxStream AI assistant. How can I help you with your taxes or documents today?" }
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isLoading]);

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;

    const userMessage = input;
    setInput('');
    setMessages(prev => [...prev, { role: 'user', content: userMessage }]);
    setIsLoading(true);

    const aiResponse = await getTaxAdvice(userMessage);
    setMessages(prev => [...prev, { role: 'ai', content: aiResponse || "I couldn't process that. Please try again." }]);
    setIsLoading(false);
  };

  return (
    <div className="flex flex-col h-[calc(100vh-250px)] bg-white rounded-2xl border border-slate-200 shadow-xl overflow-hidden max-w-4xl mx-auto">
      <div className="bg-indigo-600 p-4 text-white flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-white/20 rounded-lg">
            <Sparkles size={20} />
          </div>
          <div>
            <h3 className="font-bold">TaxStream AI Expert</h3>
            <p className="text-[10px] text-indigo-100 uppercase tracking-widest font-bold">24/7 Intelligent Support</p>
          </div>
        </div>
        <div className="flex items-center gap-2 text-[10px] bg-black/10 px-3 py-1 rounded-full text-indigo-100">
            <div className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse"></div>
            Online
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-6" ref={scrollRef}>
        {messages.map((msg, i) => (
          <div key={i} className={`flex gap-4 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
            <div className={`w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center ${
              msg.role === 'ai' ? 'bg-indigo-100 text-indigo-600' : 'bg-slate-100 text-slate-600'
            }`}>
              {msg.role === 'ai' ? <Bot size={18} /> : <User size={18} />}
            </div>
            <div className={`max-w-[80%] rounded-2xl p-4 text-sm leading-relaxed ${
              msg.role === 'ai' 
                ? 'bg-slate-50 text-slate-700' 
                : 'bg-indigo-600 text-white rounded-tr-none'
            }`}>
              {msg.content}
            </div>
          </div>
        ))}
        {isLoading && (
          <div className="flex gap-4">
            <div className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-600 flex-shrink-0 flex items-center justify-center">
              <Bot size={18} />
            </div>
            <div className="bg-slate-50 rounded-2xl p-4 flex items-center gap-2">
              <Loader2 size={16} className="animate-spin text-indigo-600" />
              <span className="text-xs text-slate-500 font-medium italic">Consulting tax rules...</span>
            </div>
          </div>
        )}
      </div>

      <div className="p-4 border-t border-slate-100">
        <div className="flex items-center gap-3 mb-3 px-2 py-1.5 bg-amber-50 rounded-lg text-amber-700 text-[10px] font-medium border border-amber-100">
            <Info size={12} />
            AI advice is for informational purposes. Always confirm with your tax pro.
        </div>
        <div className="relative">
          <input 
            type="text" 
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
            placeholder="Ask a tax question (e.g., 'What expenses can I deduct for my home office?')..." 
            className="w-full bg-slate-50 border border-slate-200 rounded-xl py-3 pl-4 pr-12 text-sm focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
          />
          <button 
            onClick={handleSend}
            disabled={!input.trim() || isLoading}
            className="absolute right-2 top-1/2 -translate-y-1/2 p-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors"
          >
            <Send size={18} />
          </button>
        </div>
      </div>
    </div>
  );
};

export default AIChat;
