import React from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import { type Message } from "../types";
import ToolCallMessage from "./ToolCallMessage";
import ToolResultMessage from "./ToolResultMessage";
import ReasoningBlock from "./ReasoningBlock";

interface ChatMessageProps {
  message: Message;
}

const ChatMessage: React.FC<ChatMessageProps> = ({
  message,
}) => {
  // Handle tool calls and results differently
  if (message.role === "tool-call") {
    return <ToolCallMessage message={message} />
  }

  if (message.role === "tool-result") {
    return <ToolResultMessage message={message} />
  }

  // Handle regular messages (user, assistant, system)
  return (
    <div
      className={`flex ${
        message.role === "user" ? "justify-end" : "justify-start"
      }`}
    >
      <div
        className={` 
        ${
          message.role === "user"
            ? "max-w-[80%] rounded-2xl px-3 py-2 border border-zinc-200/10 bg-zinc-100 text-black"
            : " text-zinc-900 w-full"
        }`}
      >
        {/* Show reasoning block for assistant messages with reasoning */}
        {message.role === "assistant" && "reasoning" in message && message.reasoning && (
          <ReasoningBlock reasoning={message.reasoning} />
        )}
        
        <div className="prose prose-zinc">
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            rehypePlugins={[rehypeHighlight]}
            components={{
              table: ({ children }) => (
                <div className="overflow-x-scroll text-sm">{children}</div>
              ),
            }}
          >
            {message.content}
          </ReactMarkdown>
        </div>
      </div>
    </div>
  );
};

export default ChatMessage;
