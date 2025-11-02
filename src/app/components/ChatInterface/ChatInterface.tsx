"use client";

import React, {
  useState,
  useRef,
  useCallback,
  useMemo,
  useEffect,
  FormEvent,
} from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Send,
  Bot,
  LoaderCircle,
  SquarePen,
  History,
  X,
  Image as ImageIcon,
  Paperclip,
} from "lucide-react";
import { ChatMessage } from "../ChatMessage/ChatMessage";
import { ThreadHistorySidebar } from "../ThreadHistorySidebar/ThreadHistorySidebar";
import type {
  SubAgent,
  TodoItem,
  ToolCall,
  UploadedImage,
} from "../../types/types";
import { useChat } from "../../hooks/useChat";
import styles from "./ChatInterface.module.scss";
import { Message } from "@langchain/langgraph-sdk";
import {
  extractStringFromMessageContent,
  uploadImageToSupabase,
} from "../../utils/utils";

interface ChatInterfaceProps {
  threadId: string | null;
  selectedSubAgent: SubAgent | null;
  setThreadId: (
    value: string | ((old: string | null) => string | null) | null
  ) => void;
  onSelectSubAgent: (subAgent: SubAgent) => void;
  onTodosUpdate: (todos: TodoItem[]) => void;
  onFilesUpdate: (files: Record<string, any>) => void;
  onNewThread: () => void;
  isLoadingThreadState: boolean;
}

export const ChatInterface = React.memo<ChatInterfaceProps>(
  ({
    threadId,
    selectedSubAgent,
    setThreadId,
    onSelectSubAgent,
    onTodosUpdate,
    onFilesUpdate,
    onNewThread,
    isLoadingThreadState,
  }) => {
    const [input, setInput] = useState("");
    const [isThreadHistoryOpen, setIsThreadHistoryOpen] = useState(false);
    const [uploadedImages, setUploadedImages] = useState<UploadedImage[]>([]);
    const [isUploadingImages, setIsUploadingImages] = useState(false);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const { messages, isLoading, sendMessage, stopStream } = useChat(
      threadId,
      setThreadId,
      onTodosUpdate,
      onFilesUpdate
    );

    useEffect(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages]);

    const handleFileSelect = useCallback(
      (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = e.target.files;
        if (!files || files.length === 0) return;

        console.log("[ChatInterface] Files selected:", {
          count: files.length,
          fileNames: Array.from(files).map((f) => f.name),
        });

        const newImages: UploadedImage[] = Array.from(files).map((file) => ({
          file,
          previewUrl: URL.createObjectURL(file),
        }));

        setUploadedImages((prev) => [...prev, ...newImages]);

        // Reset file input
        if (fileInputRef.current) {
          fileInputRef.current.value = "";
        }
      },
      []
    );

    const handleRemoveImage = useCallback((index: number) => {
      setUploadedImages((prev) => {
        const newImages = [...prev];
        // Revoke object URL to free memory
        URL.revokeObjectURL(newImages[index].previewUrl);
        newImages.splice(index, 1);
        return newImages;
      });
    }, []);

    const handleSubmit = useCallback(
      async (e: FormEvent) => {
        e.preventDefault();
        const messageText = input.trim();

        console.log("[ChatInterface] Form submitted:", {
          timestamp: new Date().toISOString(),
          messageText,
          messageLength: messageText.length,
          imageCount: uploadedImages.length,
          isLoading,
          threadId,
        });

        // Check if we have either text or images
        if ((!messageText && uploadedImages.length === 0) || isLoading) {
          console.log("[ChatInterface] Submit blocked:", {
            timestamp: new Date().toISOString(),
            reason:
              !messageText && uploadedImages.length === 0
                ? "no message or images"
                : "currently loading",
          });
          return;
        }

        try {
          // Upload images to Supabase if any
          let imageUrls: string[] = [];
          if (uploadedImages.length > 0) {
            setIsUploadingImages(true);
            console.log("[ChatInterface] Uploading images to Supabase:", {
              count: uploadedImages.length,
            });

            imageUrls = await Promise.all(
              uploadedImages.map((img) => uploadImageToSupabase(img.file))
            );

            console.log("[ChatInterface] Images uploaded successfully:", {
              urls: imageUrls,
            });
          }

          // console.log("[ChatInterface] Calling sendMessage:", {
          //   timestamp: new Date().toISOString(),
          //   messageText,
          //   imageUrls,
          // });

          sendMessage(
            messageText,
            imageUrls.length > 0 ? imageUrls : undefined
          );
          setInput("");
          setUploadedImages([]);
        } catch (error) {
          console.error("[ChatInterface] Error uploading images:", error);
          // TODO: Show error to user
        } finally {
          setIsUploadingImages(false);
        }
      },
      [input, isLoading, sendMessage, threadId, uploadedImages]
    );

    const handleNewThread = useCallback(() => {
      // Cancel any ongoing thread when creating new thread
      if (isLoading) {
        stopStream();
      }
      setIsThreadHistoryOpen(false);
      onNewThread();
    }, [isLoading, stopStream, onNewThread]);

    const handleThreadSelect = useCallback(
      (id: string) => {
        setThreadId(id);
        setIsThreadHistoryOpen(false);
      },
      [setThreadId]
    );

    const toggleThreadHistory = useCallback(() => {
      setIsThreadHistoryOpen((prev) => !prev);
    }, []);

    const hasMessages = messages.length > 0;

    const processedMessages = useMemo(() => {
      /* 
    1. Loop through all messages
    2. For each AI message, add the AI message, and any tool calls to the messageMap
    3. For each tool message, find the corresponding tool call in the messageMap and update the status and output
    */
      // Filter out unsupported message types (only human, ai, system, developer, tool are supported)
      const supportedTypes = ["human", "ai", "system", "developer", "tool"];

      const validMessages = messages.filter(
        (message: Message) =>
          message.type && supportedTypes.includes(message.type)
      );

      const messageMap = new Map<string, any>();
      validMessages.forEach((message: Message) => {
        if (message.type === "ai") {
          const toolCallsInMessage: any[] = [];
          if (
            message.additional_kwargs?.tool_calls &&
            Array.isArray(message.additional_kwargs.tool_calls)
          ) {
            toolCallsInMessage.push(...message.additional_kwargs.tool_calls);
          } else if (message.tool_calls && Array.isArray(message.tool_calls)) {
            toolCallsInMessage.push(
              ...message.tool_calls.filter(
                (toolCall: any) => toolCall.name !== ""
              )
            );
          } else if (Array.isArray(message.content)) {
            const toolUseBlocks = message.content.filter(
              (block: any) => block.type === "tool_use"
            );
            toolCallsInMessage.push(...toolUseBlocks);
          }
          const toolCallsWithStatus = toolCallsInMessage.map(
            (toolCall: any) => {
              const name =
                toolCall.function?.name ||
                toolCall.name ||
                toolCall.type ||
                "unknown";
              const args =
                toolCall.function?.arguments ||
                toolCall.args ||
                toolCall.input ||
                {};
              return {
                id: toolCall.id || `tool-${Math.random()}`,
                name,
                args,
                status: "pending" as const,
              } as ToolCall;
            }
          );
          messageMap.set(message.id!, {
            message,
            toolCalls: toolCallsWithStatus,
          });
        } else if (message.type === "tool") {
          const toolCallId = message.tool_call_id;
          if (!toolCallId) {
            return;
          }
          for (const [, data] of messageMap.entries()) {
            const toolCallIndex = data.toolCalls.findIndex(
              (tc: any) => tc.id === toolCallId
            );
            if (toolCallIndex === -1) {
              continue;
            }
            data.toolCalls[toolCallIndex] = {
              ...data.toolCalls[toolCallIndex],
              status: "completed" as const,
              // TODO: Make this nicer
              result: extractStringFromMessageContent(message),
            };
            break;
          }
        } else if (message.type === "human") {
          messageMap.set(message.id!, {
            message,
            toolCalls: [],
          });
        }
      });
      const processedArray = Array.from(messageMap.values());
      return processedArray.map((data, index) => {
        const prevMessage =
          index > 0 ? processedArray[index - 1].message : null;
        return {
          ...data,
          showAvatar: data.message.type !== prevMessage?.type,
        };
      });
    }, [messages]);

    return (
      <div className={styles.container}>
        <div className={styles.header}>
          <div className={styles.headerLeft}>
            <Bot className={styles.logo} />
            <h1 className={styles.title}>Deep Agents</h1>
          </div>
          <div className={styles.headerRight}>
            <Button
              variant="ghost"
              size="icon"
              onClick={handleNewThread}
              disabled={!hasMessages}
            >
              <SquarePen size={20} />
            </Button>
            <Button variant="ghost" size="icon" onClick={toggleThreadHistory}>
              <History size={20} />
            </Button>
          </div>
        </div>
        <div className={styles.content}>
          <ThreadHistorySidebar
            open={isThreadHistoryOpen}
            setOpen={setIsThreadHistoryOpen}
            currentThreadId={threadId}
            onThreadSelect={handleThreadSelect}
          />
          <div className={styles.messagesContainer}>
            {!hasMessages && !isLoading && !isLoadingThreadState && (
              <div className={styles.emptyState}>
                <Bot size={48} className={styles.emptyIcon} />
                <h2>Start a conversation or select a thread from history</h2>
              </div>
            )}
            {isLoadingThreadState && (
              <div className={styles.threadLoadingState}>
                <LoaderCircle className={styles.threadLoadingSpinner} />
              </div>
            )}
            <div className={styles.messagesList}>
              {processedMessages.map((data) => (
                <ChatMessage
                  key={data.message.id}
                  message={data.message}
                  toolCalls={data.toolCalls}
                  showAvatar={data.showAvatar}
                  onSelectSubAgent={onSelectSubAgent}
                  selectedSubAgent={selectedSubAgent}
                />
              ))}
              {isLoading && (
                <div className={styles.loadingMessage}>
                  <LoaderCircle className={styles.spinner} />
                  <span>Working...</span>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>
          </div>
        </div>
        <form onSubmit={handleSubmit} className={styles.inputForm}>
          <div className={styles.inputContainer}>
            {uploadedImages.length > 0 && (
              <div className={styles.imagePreviewContainer}>
                {uploadedImages.map((img, index) => (
                  <div key={index} className={styles.imagePreview}>
                    <img
                      src={img.previewUrl}
                      alt={`Upload ${index + 1}`}
                      className={styles.previewImage}
                    />
                    <button
                      type="button"
                      onClick={() => handleRemoveImage(index)}
                      className={styles.removeImageButton}
                      disabled={isLoading || isUploadingImages}
                    >
                      <X size={14} />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <div className={styles.inputRow}>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                onChange={handleFileSelect}
                style={{ display: "none" }}
                disabled={isLoading || isUploadingImages}
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => fileInputRef.current?.click()}
                disabled={isLoading || isUploadingImages}
                className={styles.attachButton}
              >
                <Paperclip size={20} />
              </Button>
              <Input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Type your message..."
                disabled={isLoading || isUploadingImages}
                className={styles.input}
              />
              {isLoading ? (
                <Button
                  type="button"
                  onClick={stopStream}
                  className={styles.stopButton}
                >
                  Stop
                </Button>
              ) : (
                <Button
                  type="submit"
                  disabled={
                    (!input.trim() && uploadedImages.length === 0) ||
                    isUploadingImages
                  }
                  className={styles.sendButton}
                >
                  {isUploadingImages ? (
                    <LoaderCircle size={16} className={styles.spinner} />
                  ) : (
                    <Send size={16} />
                  )}
                </Button>
              )}
            </div>
          </div>
        </form>
      </div>
    );
  }
);

ChatInterface.displayName = "ChatInterface";
