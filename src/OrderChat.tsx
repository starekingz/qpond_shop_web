import { useState, useEffect, useRef, useCallback } from "react";
import { useAuth } from "./auth/AuthContext";
import { fetchMessages, sendMessage, type ChatMessage } from "./messages";

interface OrderChatProps {
  orderId: number;
  onClose?: () => void;
}

export default function OrderChat({ orderId, onClose }: OrderChatProps) {
  const { user } = useAuth();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const loadMessages = useCallback(() => {
    let cancelled = false;
    fetchMessages(orderId)
      .then((data) => {
        if (!cancelled) {
          setMessages(data);
          setError(null);
        }
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      });
    return () => { cancelled = true; };
  }, [orderId]);

  // Poll every 2 seconds
  useEffect(() => {
    loadMessages();
    const interval = setInterval(loadMessages, 2000);
    return () => clearInterval(interval);
  }, [loadMessages]);

  // Auto-scroll to bottom
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim() || sending) return;
    setSending(true);
    try {
      const msg = await sendMessage(orderId, input.trim());
      setMessages((prev) => [...prev, msg]);
      setInput("");
      setError(null);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "發送失敗");
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="chat-container">
      <div className="chat-header">
        <h4>訂單 #{orderId} 聊天室</h4>
        {onClose && <button className="chat-close-btn" onClick={onClose}>&times;</button>}
      </div>

      <div className="chat-messages" ref={containerRef}>
        {messages.length === 0 && (
          <div className="chat-empty">尚無訊息，發送第一則訊息開始對話吧！</div>
        )}
        {messages.map((msg) => {
          const isMe = user && msg.senderId === user.discordId;
          return (
            <div key={msg.id} className={`chat-bubble-wrap ${isMe ? "chat-mine" : "chat-other"}`}>
              <div className="chat-bubble">
                <div className="chat-sender">{isMe ? "我" : msg.senderName}</div>
                <div className="chat-content">{msg.content}</div>
                <div className="chat-time">
                  {new Date(msg.createdAt).toLocaleTimeString("zh-TW", { hour: "2-digit", minute: "2-digit" })}
                </div>
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      {error && <div className="chat-error">{error}</div>}

      <div className="chat-input-area">
        <textarea
          className="chat-input"
          placeholder="輸入訊息..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          rows={2}
          disabled={sending}
        />
        <button
          className="chat-send-btn"
          onClick={handleSend}
          disabled={sending || !input.trim()}
        >
          {sending ? "..." : "發送"}
        </button>
      </div>
    </div>
  );
}
