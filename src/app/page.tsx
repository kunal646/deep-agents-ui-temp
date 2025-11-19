"use client";

import React, { useState, useCallback, useEffect, Suspense } from "react";
import { useQueryState } from "nuqs";
import { ChatInterface } from "./components/ChatInterface/ChatInterface";
import { TasksFilesSidebar } from "./components/TasksFilesSidebar/TasksFilesSidebar";
import { SubAgentPanel } from "./components/SubAgentPanel/SubAgentPanel";
import { EditorWorkspace } from "./components/EditorWorkspace/EditorWorkspace";
import { createClient } from "@/lib/client";
import { useAuthContext } from "@/providers/Auth";
import type { SubAgent, FileItem, TodoItem } from "./types/types";
import styles from "./page.module.scss";

function HomePageContent() {
  const { session } = useAuthContext();
  const [threadId, setThreadId] = useQueryState("threadId");
  const [selectedSubAgent, setSelectedSubAgent] = useState<SubAgent | null>(
    null
  );
  const [openFiles, setOpenFiles] = useState<FileItem[]>([]);
  const [todos, setTodos] = useState<TodoItem[]>([]);
  const [files, setFiles] = useState<Record<string, any>>({});
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [isLoadingThreadState, setIsLoadingThreadState] = useState(false);
  const [showChat, setShowChat] = useState(true);

  const toggleSidebar = useCallback(() => {
    setSidebarCollapsed((prev) => !prev);
  }, []);

  // When the threadId changes, grab the thread state from the graph server
  useEffect(() => {
    const fetchThreadState = async () => {
      if (!threadId || !session?.accessToken) {
        setTodos([]);
        setFiles({});
        setIsLoadingThreadState(false);
        return;
      }
      setIsLoadingThreadState(true);
      try {
        const client = createClient(session.accessToken);
        const state = await client.threads.getState(threadId);

        if (state.values) {
          const currentState = state.values as {
            todos?: TodoItem[];
            files?: Record<string, any>;
          };
          setTodos(currentState.todos || []);
          setFiles(currentState.files || {});
        }
      } catch (error) {
        console.error("Failed to fetch thread state:", error);
        setTodos([]);
        setFiles({});
      } finally {
        setIsLoadingThreadState(false);
      }
    };
    fetchThreadState();
  }, [threadId, session?.accessToken]);

  const handleNewThread = useCallback(() => {
    setThreadId(null);
    setSelectedSubAgent(null);
    setTodos([]);
    setFiles({});
  }, [setThreadId]);

  const handleFileClick = useCallback((file: FileItem) => {
    // Check if file is already open
    const isOpen = openFiles.some(f => f.path === file.path);
    if (!isOpen) {
      // Add new file - it will become active automatically via useEffect
      setOpenFiles(prev => [...prev, file]);
    } else {
      // File is already open, switch focus to it by moving it to the end
      // This triggers the useEffect in EditorWorkspace to make it active
      setOpenFiles(prev => {
        const filtered = prev.filter(f => f.path !== file.path);
        return [...filtered, file];
      });
    }
  }, [openFiles]);

  const handleFileClose = useCallback((fileId: string) => {
    setOpenFiles(prev => prev.filter(f => f.path !== fileId));
  }, []);

  const handleFileSelect = useCallback((fileId: string) => {
    // File selection is handled by EditorWorkspace
  }, []);

  const handleFileSave = useCallback((fileId: string, content: string) => {
    setOpenFiles(prev => prev.map(f => 
      f.path === fileId ? { ...f, content } : f
    ));
  }, []);

  const toggleChat = useCallback(() => {
    setShowChat(prev => !prev);
  }, []);

  return (
    <div className={styles.container}>
      <TasksFilesSidebar
        todos={todos}
        files={files}
        onFileClick={handleFileClick}
        collapsed={sidebarCollapsed}
        onToggleCollapse={toggleSidebar}
      />
      <div className={styles.mainContent}>
        <EditorWorkspace
          openFiles={openFiles}
          onFileClose={handleFileClose}
          onFileSelect={handleFileSelect}
          onFileSave={handleFileSave}
          chatPanel={
            <ChatInterface
              threadId={threadId}
              selectedSubAgent={selectedSubAgent}
              setThreadId={setThreadId}
              onSelectSubAgent={setSelectedSubAgent}
              onTodosUpdate={setTodos}
              onFilesUpdate={setFiles}
              onNewThread={handleNewThread}
              isLoadingThreadState={isLoadingThreadState}
            />
          }
          showChat={showChat}
          onToggleChat={toggleChat}
        />
        {selectedSubAgent && (
          <SubAgentPanel
            subAgent={selectedSubAgent}
            onClose={() => setSelectedSubAgent(null)}
          />
        )}
      </div>
    </div>
  );
}

export default function HomePage() {
  return (
    <Suspense fallback={<div className={styles.container}>Loading...</div>}>
      <HomePageContent />
    </Suspense>
  );
}
