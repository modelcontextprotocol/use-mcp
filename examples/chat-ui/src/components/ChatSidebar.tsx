import React from "react";
import {
  Edit,
  Trash2,
  PanelLeftClose,
  PanelLeftOpen,
  SquarePen,
} from "lucide-react";
import ModelSelector from "./ModelSelector";
import { McpServers } from "./McpServers";
import { type Model } from "../types/models";
import { type Message } from "../types";

interface Conversation {
  id?: number;
  title: string;
  messages: Message[];
}

interface ChatSidebarProps {
  sidebarVisible: boolean;
  setSidebarVisible: React.Dispatch<React.SetStateAction<boolean>>;
  conversations: Conversation[];
  conversationId: number | undefined;
  setConversationId: React.Dispatch<React.SetStateAction<number | undefined>>;
  deleteConversation: (id: number) => void;
  editConversationTitle: (id: number, newTitle: string) => void;
  startNewConversation: () => void;
  selectedModel: Model;
  onModelChange: (model: Model) => void;
  apiKeyUpdateTrigger: number;
}

const ChatSidebar: React.FC<ChatSidebarProps> = ({
  sidebarVisible,
  setSidebarVisible,
  conversations,
  conversationId,
  setConversationId,
  deleteConversation,
  editConversationTitle,
  startNewConversation,
  selectedModel,
  onModelChange,
  apiKeyUpdateTrigger,
}) => {
  const handleConversationClick = (id: number | undefined) => {
    setConversationId(id);
    if (window.matchMedia("(max-width: 768px)").matches) {
      setSidebarVisible(false);
    }
  };

  return (
    <>
      {/* Mobile overlay */}
      {sidebarVisible && (
        <div
          className="md:hidden fixed inset-0 bg-black/30 z-20"
          onClick={() => setSidebarVisible(false)}
        />
      )}
      <div
        className={`
          fixed md:relative
          z-30 md:z-auto
          h-full
          bg-zinc-50
          transition-all duration-300
          
          ${
            sidebarVisible
              ? "w-64 lg:w-[32rem] translate-x-0"
              : "w-0 -translate-x-full md:translate-x-0"
          }
        `}
      >
        <div
          className={`m-2 flex items-center justify-between 
          ${sidebarVisible ? "sticky" : "hidden"}
          `}
        >
          <button
            onClick={() => setSidebarVisible(!sidebarVisible)}
            className="
              rounded-lg p-[0.4em]
              hover:bg-zinc-100 hover:cursor-pointer
              transition-colors text-zinc-600 hover:text-zinc-800"
          >
            {sidebarVisible ? (
              <PanelLeftClose size={20} />
            ) : (
              <PanelLeftOpen size={20} />
            )}
          </button>
          <button
            className="rounded-lg p-[0.4em]
              hover:bg-zinc-100 hover:cursor-pointer
              transition-colors text-zinc-600 hover:text-zinc-800"
            onClick={startNewConversation}
          >
            <SquarePen size={20} />
          </button>
        </div>
        <div
          className=" h-[calc(100%-3rem)]
        overflow-y-scroll scrollbar-thin 
        flex flex-col justify-between border-r border-zinc-200 transition-all duration-300"
        >
          <div className="flex flex-col">
            <ul className="p-2 space-y-1">
              {conversations.map((conversation) => (
                <li
                  key={conversation.id}
                  className={`cursor-pointer p-2 transition-colors rounded-lg ${
                    conversation.id === conversationId ||
                    (!conversationId && !conversation.id)
                      ? "bg-zinc-200 text-zinc-900"
                      : "hover:bg-zinc-200 text-zinc-600"
                  }`}
                  onClick={() => handleConversationClick(conversation.id)}
                >
                  <div className="flex items-center justify-between">
                    <span className="truncate flex-grow text-sm">
                      {conversation.title}
                    </span>
                    <div className="flex space-x-2 ml-2">
                      <button
                        className="opacity-60 hover:opacity-100 transition-opacity"
                        onClick={(e) => {
                          e.stopPropagation();
                          const newTitle = prompt(
                            "Enter new title:",
                            conversation.title
                          );
                          if (newTitle)
                            editConversationTitle(conversation.id!, newTitle);
                        }}
                      >
                        <Edit size={14} />
                      </button>
                      <button
                        className="opacity-60 hover:opacity-100 transition-opacity"
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteConversation(conversation.id!);
                          setConversationId(undefined);
                        }}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </div>
          
          {/* Model Selector and MCP Servers at bottom */}
          <div className="p-2 border-t border-zinc-200 space-y-3">
            <ModelSelector
              selectedModel={selectedModel}
              onModelChange={onModelChange}
              apiKeyUpdateTrigger={apiKeyUpdateTrigger}
            />
            <McpServers />
          </div>
        </div>
      </div>
    </>
  );
};

export default ChatSidebar;
