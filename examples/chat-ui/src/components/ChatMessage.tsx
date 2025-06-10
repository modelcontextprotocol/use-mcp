import React from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import { type Message } from "../types";

interface ChatMessageProps {
  message: Message;
}

const ChatMessage: React.FC<ChatMessageProps> = ({
  message,
}) => {
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
