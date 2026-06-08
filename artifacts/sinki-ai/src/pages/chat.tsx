import { useState, useRef, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { 
  useListConversations, 
  getListConversationsQueryKey,
  useCreateConversation, 
  useGetConversation, 
  getGetConversationQueryKey,
  useDeleteConversation
} from "@workspace/api-client-react";
import { format, isToday, isYesterday } from "date-fns";
import { id } from "date-fns/locale";
import { 
  Menu, SquarePen, Search, Image as ImageIcon, 
  Mic, Send, ChevronDown, Check, Clock, Settings,
  ThumbsUp, ThumbsDown, RotateCw, Copy, MoreHorizontal, Volume2, Star
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Drawer, DrawerContent, DrawerTrigger, DrawerClose } from "@/components/ui/drawer";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Sheet, SheetContent, SheetTrigger, SheetTitle } from "@/components/ui/sheet";

type Message = {
  id: number;
  role: "user" | "assistant";
  content: string;
};

export default function ChatPage() {
  const queryClient = useQueryClient();
  const [currentConversationId, setCurrentConversationId] = useState<number | null>(null);
  const [model, setModel] = useState<"gpt" | "wormgpt">("gpt");
  const [input, setInput] = useState("");
  const [streamingContent, setStreamingContent] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  const { data: conversations = [] } = useListConversations();
  const { data: currentConversation } = useGetConversation(currentConversationId as number, { 
    query: { 
      enabled: !!currentConversationId, 
      queryKey: getGetConversationQueryKey(currentConversationId as number) 
    } 
  });
  
  const createConversation = useCreateConversation();
  const deleteConversation = useDeleteConversation();

  const messages = currentConversation?.messages || [];
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, streamingContent]);

  const handleSendMessage = async () => {
    if (!input.trim() || isStreaming) return;

    let convId = currentConversationId;
    const userMessage = input;
    setInput("");

    if (!convId) {
      try {
        const newConv = await createConversation.mutateAsync({
          data: {
            title: userMessage.slice(0, 30) + (userMessage.length > 30 ? "..." : ""),
            model
          }
        });
        convId = newConv.id;
        setCurrentConversationId(convId);
        queryClient.invalidateQueries({ queryKey: getListConversationsQueryKey() });
      } catch (err) {
        console.error("Failed to create conversation", err);
        return;
      }
    }

    setIsStreaming(true);
    setStreamingContent("");

    try {
      // Optimistically add user message to cache
      queryClient.setQueryData(getGetConversationQueryKey(convId!), (old: any) => {
        if (!old) return old;
        return {
          ...old,
          messages: [...old.messages, { id: Date.now(), role: "user", content: userMessage }]
        };
      });

      const response = await fetch(`/api/conversations/${convId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: userMessage, model }),
      });

      if (!response.body) throw new Error("No response body");

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let assistantContent = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value);
        const lines = chunk.split("\n");
        for (const line of lines) {
          if (line.startsWith("data: ")) {
            const data = JSON.parse(line.slice(6));
            if (data.content) {
              assistantContent += data.content;
              setStreamingContent(assistantContent);
            }
            if (data.done) break;
          }
        }
      }

      // Fetch the updated conversation to get the finalized message from the DB
      queryClient.invalidateQueries({ queryKey: getGetConversationQueryKey(convId!) });
    } catch (err) {
      console.error("Streaming error", err);
    } finally {
      setIsStreaming(false);
      setStreamingContent("");
    }
  };

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    if (isToday(d)) return "Hari ini";
    if (isYesterday(d)) return "Kemarin";
    return format(d, "dd MMM", { locale: id });
  };

  const filteredConversations = conversations.filter(c => 
    c.title.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="flex h-[100dvh] w-full bg-black text-white overflow-hidden font-sans">
      {/* Search Overlay */}
      {searchOpen && (
        <div className="fixed inset-0 z-50 bg-black flex flex-col">
          <div className="flex items-center px-4 py-3 gap-3 border-b border-white/10">
            <Search className="w-5 h-5 text-gray-400" />
            <input
              autoFocus
              className="flex-1 bg-transparent outline-none text-white placeholder-gray-500"
              placeholder="Telusuri aktivitas"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
            />
            <button onClick={() => setSearchOpen(false)} className="p-2 -mr-2">
              <span className="text-gray-400">Batal</span>
            </button>
          </div>
          <ScrollArea className="flex-1">
            <div className="p-4">
              <h3 className="text-xs font-semibold text-gray-500 mb-3 px-2 uppercase tracking-wider">TERBARU</h3>
              {filteredConversations.map(conv => (
                <button
                  key={conv.id}
                  className="w-full flex items-center justify-between p-3 rounded-xl hover:bg-white/5 text-left"
                  onClick={() => {
                    setCurrentConversationId(conv.id);
                    setSearchOpen(false);
                    if (isSidebarOpen) setIsSidebarOpen(false);
                  }}
                >
                  <span className="truncate pr-4 text-sm">{conv.title}</span>
                </button>
              ))}
            </div>
          </ScrollArea>
        </div>
      )}

      {/* Main Content */}
      <div className="flex flex-col flex-1 relative">
        {/* Header */}
        <header className="h-14 flex items-center justify-between px-2 shrink-0">
          <Sheet open={isSidebarOpen} onOpenChange={setIsSidebarOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="text-white hover:bg-white/10 rounded-full h-10 w-10">
                <Menu className="w-6 h-6" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-[300px] p-0 bg-[#141414] border-r-0 flex flex-col">
              <SheetTitle className="sr-only">Sidebar</SheetTitle>
              <div className="p-4 pt-6 pb-2">
                <span className="text-lg font-medium px-2">SINKI AI</span>
              </div>
              <ScrollArea className="flex-1 px-3">
                <div className="space-y-1 mt-4">
                  <button 
                    onClick={() => {
                      setCurrentConversationId(null);
                      setIsSidebarOpen(false);
                    }}
                    className="w-full flex items-center gap-3 px-3 py-3.5 hover:bg-white/5 rounded-2xl transition-colors"
                  >
                    <SquarePen className="w-5 h-5 text-gray-300" />
                    <span className="text-[15px]">Percakapan baru</span>
                  </button>
                  <button 
                    onClick={() => {
                      setSearchOpen(true);
                      setIsSidebarOpen(false);
                    }}
                    className="w-full flex items-center gap-3 px-3 py-3.5 hover:bg-white/5 rounded-2xl transition-colors"
                  >
                    <Search className="w-5 h-5 text-gray-300" />
                    <span className="text-[15px]">Telusuri percakapan</span>
                  </button>
                  <button className="w-full flex items-center gap-3 px-3 py-3.5 hover:bg-white/5 rounded-2xl transition-colors">
                    <Star className="w-5 h-5 text-gray-300" />
                    <span className="text-[15px]">Koleksi</span>
                  </button>
                </div>
                
                <div className="mt-6">
                  <div className="px-3 py-2 text-xs font-medium text-gray-500">Terbaru</div>
                  <div className="space-y-1">
                    {conversations.slice(0, 10).map(conv => (
                      <button
                        key={conv.id}
                        className="w-full flex items-center justify-between px-3 py-2.5 hover:bg-white/5 rounded-xl text-left"
                        onClick={() => {
                          setCurrentConversationId(conv.id);
                          setIsSidebarOpen(false);
                        }}
                      >
                        <span className="truncate pr-2 text-[15px]">{conv.title}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </ScrollArea>
              
              <div className="p-3 mb-2">
                <button className="w-full flex items-center gap-3 px-3 py-3 hover:bg-white/5 rounded-2xl transition-colors">
                  <Avatar className="w-8 h-8">
                    <AvatarFallback className="bg-blue-600 text-white">R</AvatarFallback>
                  </Avatar>
                  <span className="text-[15px] font-medium flex-1 text-left">rafa Rama</span>
                  <Settings className="w-5 h-5 text-gray-400" />
                </button>
              </div>
            </SheetContent>
          </Sheet>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="text-white hover:bg-white/10 rounded-xl gap-1 px-3 h-10 font-normal text-[17px]">
                SINKI AI <ChevronDown className="w-4 h-4 ml-1 opacity-70" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="center" className="w-[280px] bg-[#1c1c1c] border-white/10 rounded-2xl p-2">
              <DropdownMenuItem 
                className="flex items-start justify-between p-3 rounded-xl focus:bg-white/10 cursor-pointer"
                onClick={() => setModel("gpt")}
              >
                <div className="flex flex-col gap-1">
                  <span className="text-base font-medium">GPT</span>
                  <span className="text-xs text-gray-400">Kecerdasan umum</span>
                </div>
                {model === "gpt" && <Check className="w-5 h-5 text-blue-400" />}
              </DropdownMenuItem>
              <DropdownMenuItem 
                className="flex items-start justify-between p-3 rounded-xl focus:bg-white/10 cursor-pointer mt-1"
                onClick={() => setModel("wormgpt")}
              >
                <div className="flex flex-col gap-1">
                  <span className="text-base font-medium text-[#e34234]">WormGPT</span>
                  <span className="text-xs text-gray-400">Mode gelap tanpa batas</span>
                </div>
                {model === "wormgpt" && <Check className="w-5 h-5 text-[#e34234]" />}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <Button 
            variant="ghost" 
            size="icon" 
            className="text-white hover:bg-white/10 rounded-full h-10 w-10"
            onClick={() => setCurrentConversationId(null)}
          >
            <SquarePen className="w-5 h-5" />
          </Button>
        </header>

        {/* Chat Area */}
        <div className="flex-1 overflow-y-auto px-4" ref={scrollRef}>
          {!currentConversationId && messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center -mt-10">
              <div className="w-16 h-16 rounded-full flex items-center justify-center mb-6" 
                   style={{ background: 'radial-gradient(circle at center, rgba(66, 133, 244, 0.2) 0%, rgba(234, 67, 53, 0.1) 50%, rgba(251, 188, 5, 0.05) 100%)' }}>
                <Star className="w-10 h-10 text-transparent fill-current" 
                      style={{ 
                        stroke: 'url(#gemini-gradient)',
                        fill: 'url(#gemini-gradient)'
                      }} />
                <svg width="0" height="0">
                  <defs>
                    <linearGradient id="gemini-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
                      <stop offset="0%" stopColor="#4285F4" />
                      <stop offset="33%" stopColor="#9b72cb" />
                      <stop offset="66%" stopColor="#d96570" />
                      <stop offset="100%" stopColor="#F4B400" />
                    </linearGradient>
                  </defs>
                </svg>
              </div>
              <h1 className="text-2xl font-medium tracking-tight text-white/90">Giliran Anda, Bimbim!</h1>
            </div>
          ) : (
            <div className="py-4 pb-24 max-w-3xl mx-auto space-y-8">
              {messages.map((msg, i) => (
                <div key={i} className={`flex flex-col ${msg.role === "user" ? "items-end" : "items-start"}`}>
                  {msg.role === "user" ? (
                    <div className="bg-[#2a2a2a] px-4 py-3 rounded-3xl rounded-tr-sm max-w-[85%]">
                      <p className="text-[16px] leading-relaxed whitespace-pre-wrap">{msg.content}</p>
                    </div>
                  ) : (
                    <div className="w-full flex gap-4">
                      <div className="w-8 h-8 rounded-full shrink-0 flex items-center justify-center mt-1">
                        <Star className="w-6 h-6 text-transparent fill-current" 
                              style={{ fill: 'url(#gemini-gradient)' }} />
                      </div>
                      <div className="flex-1">
                        <div className="text-[16px] leading-relaxed whitespace-pre-wrap prose prose-invert max-w-none">
                          {msg.content}
                        </div>
                        <div className="flex items-center gap-2 mt-4 text-gray-400">
                          <Button variant="ghost" size="icon" className="w-8 h-8 rounded-full hover:bg-white/10 hover:text-white">
                            <Volume2 className="w-4 h-4" />
                          </Button>
                          <Button variant="ghost" size="icon" className="w-8 h-8 rounded-full hover:bg-white/10 hover:text-white">
                            <ThumbsUp className="w-4 h-4" />
                          </Button>
                          <Button variant="ghost" size="icon" className="w-8 h-8 rounded-full hover:bg-white/10 hover:text-white">
                            <ThumbsDown className="w-4 h-4" />
                          </Button>
                          <Button variant="ghost" size="icon" className="w-8 h-8 rounded-full hover:bg-white/10 hover:text-white">
                            <RotateCw className="w-4 h-4" />
                          </Button>
                          <Button variant="ghost" size="icon" className="w-8 h-8 rounded-full hover:bg-white/10 hover:text-white">
                            <Copy className="w-4 h-4" />
                          </Button>
                          <Button variant="ghost" size="icon" className="w-8 h-8 rounded-full hover:bg-white/10 hover:text-white">
                            <MoreHorizontal className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ))}
              {streamingContent && (
                <div className="flex flex-col items-start">
                  <div className="w-full flex gap-4">
                    <div className="w-8 h-8 rounded-full shrink-0 flex items-center justify-center mt-1">
                      <Star className="w-6 h-6 text-transparent fill-current animate-pulse" 
                            style={{ fill: 'url(#gemini-gradient)' }} />
                    </div>
                    <div className="flex-1">
                      <div className="text-[16px] leading-relaxed whitespace-pre-wrap prose prose-invert max-w-none">
                        {streamingContent}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Input Area */}
        <div className="p-3 bg-gradient-to-t from-black via-black to-transparent absolute bottom-0 left-0 right-0 max-w-3xl mx-auto w-full">
          <div className="relative flex items-end gap-2 bg-[#1c1c1c] p-2 pr-3 rounded-[32px] border border-white/10 shadow-lg">
            <Button variant="ghost" size="icon" className="text-white hover:bg-white/10 rounded-full h-11 w-11 shrink-0">
              <div className="w-6 h-6 border-[2.5px] border-current rounded-full flex items-center justify-center">
                <div className="w-3 h-[2px] bg-current"></div>
                <div className="w-[2px] h-3 bg-current absolute"></div>
              </div>
            </Button>
            
            <textarea
              className="flex-1 max-h-32 min-h-[44px] bg-transparent resize-none outline-none py-3 text-white placeholder-gray-400 text-[16px]"
              placeholder="Tanya SINKI AI"
              rows={1}
              value={input}
              onChange={e => {
                setInput(e.target.value);
                e.target.style.height = "auto";
                e.target.style.height = e.target.scrollHeight + "px";
              }}
              onKeyDown={e => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSendMessage();
                }
              }}
            />

            <div className="flex items-center gap-1 shrink-0 mb-1">
              {!input.trim() ? (
                <Button variant="ghost" size="icon" className="text-white hover:bg-white/10 rounded-full h-10 w-10">
                  <Mic className="w-5 h-5" />
                </Button>
              ) : (
                <Button 
                  size="icon" 
                  className="bg-[#2b5c92] hover:bg-[#346bb3] text-white rounded-full h-10 w-10 shadow-sm"
                  onClick={handleSendMessage}
                  disabled={isStreaming}
                >
                  <Send className="w-4 h-4 ml-0.5" />
                </Button>
              )}
            </div>
          </div>
          <div className="text-center mt-2">
            <p className="text-[10px] text-gray-500">SINKI AI dapat membuat kesalahan. Harap periksa info penting.</p>
          </div>
        </div>
      </div>
    </div>
  );
}