import { useEffect, useRef, useState } from "react";
import { apiFetch } from "../api";

const SUGGESTED_PROMPTS = [
  "Which subscription costs the most?",
  "How much do I spend each month?",
  "Do I have any duplicate subscriptions?",
  "Which subscriptions renew in the next 30 days?"
];

function AgentChat({ auth, setAuth, onAuthExpired }) {
  const [isOpen, setIsOpen] = useState(false);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState([
    {
      id: "welcome",
      role: "assistant",
      text: "Hi, I’m your SubLens assistant. Ask me about your subscriptions."
    }
  ]);
  const [sending, setSending] = useState(false);
  const [conversationId] = useState(() => crypto.randomUUID());
  const inputRef = useRef(null);
  const messagesRef = useRef(null);

  useEffect(() => {
    if (isOpen) inputRef.current?.focus();
  }, [isOpen]);

  useEffect(() => {
    messagesRef.current?.scrollTo({
      top: messagesRef.current.scrollHeight,
      behavior: "smooth"
    });
  }, [messages, sending]);

  useEffect(() => {
    function closeOnEscape(event) {
      if (event.key === "Escape") setIsOpen(false);
    }

    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, []);
  async function sendMessage(event) {
    event.preventDefault();
    const content = input.trim();
    if (!content || sending) return;

    const userMessage = {
      id: crypto.randomUUID(),
      role: "user",
      text: content
    };

    setMessages(current => [...current, userMessage]);
    setInput("");
    setSending(true);

    try {
      const res = await apiFetch(
        "/agent/message",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message: content,
            conversationId: conversationId
          })
        },
        auth,
        setAuth,
        onAuthExpired
      );

      const data = await res.json();
      if (data.reply) {
        setMessages(current => [
          ...current,
          { id: crypto.randomUUID(), role: "assistant", text: data.reply }
        ]);
      }
      else {
        throw new Error('the reply format is not correct');
      }

    } catch (error) {
      console.error(error);
    } finally {
      setSending(false);
    }
  }

  return (
    <div className={isOpen ? "agent-chat is-open" : "agent-chat"}>
      {isOpen ? (
        <section className="agent-panel" aria-label="SubLens agent chat">
          <header className="agent-panel-header">
            <div>
              <p className="agent-eyebrow">AI assistant</p>
              <h2 className="agent-title">Ask SubLens</h2>
            </div>
            <button
              type="button"
              className="agent-close"
              aria-label="Close agent chat"
              onClick={() => setIsOpen(false)}
            >
              ×
            </button>
          </header>

          <div className="agent-messages" ref={messagesRef} aria-live="polite">
            {messages.map(message => (
              <div key={message.id} className={`agent-message agent-message-${message.role}`}>
                {message.text}
              </div>
            ))}
            {sending ? (
              <div className="agent-message agent-message-assistant agent-thinking">
                Thinking…
              </div>
            ) : null}
          </div>

          {messages.length === 1 ? (
            <div className="agent-suggestions" aria-label="Suggested questions">
              {SUGGESTED_PROMPTS.map(prompt => (
                <button key={prompt} type="button" onClick={() => setInput(prompt)}>
                  {prompt}
                </button>
              ))}
            </div>
          ) : null}

          <form className="agent-composer" onSubmit={sendMessage}>
            <input
              ref={inputRef}
              value={input}
              onChange={event => setInput(event.target.value)}
              placeholder="Ask about subscriptions or tasks…"
              aria-label="Message SubLens agent"
              autoComplete="off"
            />
            <button type="submit" disabled={!input.trim() || sending} aria-label="Send message">
              ↑
            </button>
          </form>
        </section>
      ) : null}

      <button
        type="button"
        className="agent-launcher"
        aria-label={isOpen ? "Close SubLens agent" : "Open SubLens agent"}
        aria-expanded={isOpen}
        onClick={() => setIsOpen(current => !current)}
      >
        <span className="agent-launcher-icon" aria-hidden="true">✦</span>
        <span>{isOpen ? "Close" : "Ask SubLens"}</span>
      </button>
    </div>
  );
}

export default AgentChat;
