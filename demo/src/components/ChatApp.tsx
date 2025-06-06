import React, { useState, useEffect } from "react";
import ChatSidebar from "./ChatSidebar.tsx";
import ChatNavbar from "./ChatNavbar.tsx";
import ConversationThread from "./ConversationThread.tsx";
import { storeName } from "../consts.ts";
import { type Conversation } from "../types";
import { useIndexedDB } from "../hooks/useIndexedDB";
import { type Model } from "../types/models";
import { getSelectedModel, setSelectedModel as saveSelectedModel } from "../utils/modelPreferences";
import { type IDBPDatabase } from "idb";

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
interface ChatAppProps {}

const ChatApp: React.FC<ChatAppProps> = () => {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [conversationId, setConversationId] = useState<number | undefined>(
    undefined
  );
  const [sidebarVisible, setSidebarVisible] = useState<boolean>(true);
  const [selectedModel, setSelectedModel] = useState<Model>(getSelectedModel());
  const [apiKeyUpdateTrigger, setApiKeyUpdateTrigger] = useState<number>(0);
  const db = useIndexedDB();

  const handleApiKeyUpdate = () => {
    setApiKeyUpdateTrigger(prev => prev + 1);
  };

  const handleModelChange = (model: Model) => {
    setSelectedModel(model);
    saveSelectedModel(model);
  };

  // set up conversations on app load
  useEffect(() => {
    getConversations();
    deleteUnusedConversations();
    startNewConversation();
  }, [db]);

  // Initialize sidebar visibility based on screen size
  useEffect(() => {
    const isMobile = window.matchMedia("(max-width: 768px)").matches;
    setSidebarVisible(!isMobile);
  }, []);

  const getConversations = async () => {
    if (!db) return;

    const conversations = (await db.getAll(storeName)) as Conversation[];
    const inverseConversations = conversations.reverse();
    setConversations(inverseConversations);
  };

  const deleteConversation = async (id: number, showPromptToUser = true) => {
    try {
      if (
        showPromptToUser &&
        !window.confirm("Are you sure you want to delete this conversation?")
      ) {
        return;
      }

      await db?.delete(storeName, id);
      setConversations((prev) => prev.filter((conv) => conv.id !== id));
      setConversationId(conversations[0]?.id);
    } catch (error) {
      console.error("Failed to delete conversation:", error);
    }
  };

  const editConversationTitle = async (id: number, newTitle: string) => {
    const conversation = (await db!.get(storeName, id)) as Conversation;
    conversation.title = newTitle;
    await db!.put(storeName, conversation);
    setConversations((prev) =>
      prev.map((conv) => (conv.id === id ? { ...conv, title: newTitle } : conv))
    );
  };

  const startNewConversation = async () => {
    //create unique id for new conversation
    setConversationId(Date.now() + Math.floor(Math.random() * 1000));
    if (window.matchMedia("(max-width: 768px)").matches) {
      setSidebarVisible(false);
    }
  };

  // delete conversations with no messages
  const deleteUnusedConversations = async () => {
    if (!db) return;
    const conversations = (await db.getAll(storeName)) as Conversation[];
    const unusedConversations = conversations.filter(
      (conversation) => conversation.messages.length === 0
    );

    for (const conversation of unusedConversations) {
      deleteConversation(conversation.id as number, false);
    }
  };

  return (
    <div className="flex h-dvh w-screen overflow-clip bg-white">
      <div className="flex flex-row flex-grow flex-1 overflow-hidden relative">
        <ChatSidebar
          sidebarVisible={sidebarVisible}
          setSidebarVisible={setSidebarVisible}
          conversations={conversations}
          conversationId={conversationId}
          setConversationId={setConversationId}
          deleteConversation={deleteConversation}
          editConversationTitle={editConversationTitle}
          startNewConversation={startNewConversation}
          selectedModel={selectedModel}
          onModelChange={handleModelChange}
          apiKeyUpdateTrigger={apiKeyUpdateTrigger}
        />
        <div className="flex flex-col flex-grow h-full w-[calc(100%-16rem)]">
          <ChatNavbar
            sidebarVisible={sidebarVisible}
            setSidebarVisible={setSidebarVisible}
          />
          <ConversationThread
            conversations={conversations}
            conversationId={conversationId}
            setConversationId={setConversationId}
            setConversations={setConversations}
            db={db as IDBPDatabase}
            selectedModel={selectedModel}
            onApiKeyUpdate={handleApiKeyUpdate}
          />
        </div>
      </div>
    </div>
  );
};

export default ChatApp;
