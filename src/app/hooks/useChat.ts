import { useCallback, useMemo, useEffect, useState, useRef } from "react";
import { useStream } from "@langchain/langgraph-sdk/react";
import { type Message } from "@langchain/langgraph-sdk";
import { getDeployment } from "@/lib/environment/deployments";
import { v4 as uuidv4 } from "uuid";
import type { MessageContent, TodoItem, InterruptState, HITLDecision } from "../types/types";
import { createClient } from "@/lib/client";
import { useAuthContext } from "@/providers/Auth";

type StateType = {
  messages: Message[];
  todos: TodoItem[];
  files: Record<string, string>;
};

export function useChat(
  threadId: string | null,
  setThreadId: (
    value: string | ((old: string | null) => string | null) | null
  ) => void,
  onTodosUpdate: (todos: TodoItem[]) => void,
  onFilesUpdate: (files: Record<string, string>) => void
) {
  const deployment = useMemo(() => getDeployment(), []);
  const { session } = useAuthContext();
  const accessToken = session?.accessToken;

  // HITL state
  const [interruptState, setInterruptState] = useState<InterruptState | null>(null);
  const [enableHITL, setEnableHITL] = useState(true); // Feature flag - enabled by default
  const handledInterruptIdsRef = useRef<Set<string>>(new Set());
  const lastInterruptIdRef = useRef<string | null>(null); // Track last interrupt ID to prevent unnecessary updates

  const agentId = useMemo(() => {
    if (!deployment?.agentId) {
      throw new Error(`No agent ID configured in environment`);
    }
    return deployment.agentId;
  }, [deployment]);

  const handleUpdateEvent = useCallback(
    (data: { [node: string]: Partial<StateType> }) => {
      console.log("[useChat] Received update event from backend:", {
        timestamp: new Date().toISOString(),
        data,
        nodeKeys: Object.keys(data),
      });

      Object.entries(data).forEach(([nodeName, nodeData]) => {
        console.log(`[useChat] Processing update for node: ${nodeName}`, {
          hasTodos: !!nodeData?.todos,
          hasFiles: !!nodeData?.files,
          todosCount: nodeData?.todos?.length || 0,
          filesCount: nodeData?.files ? Object.keys(nodeData.files).length : 0,
        });

        if (nodeData?.todos) {
          console.log("[useChat] Updating todos:", nodeData.todos);
          onTodosUpdate(nodeData.todos);
        }
        if (nodeData?.files) {
          console.log("[useChat] Updating files:", {
            fileCount: Object.keys(nodeData.files).length,
            filePaths: Object.keys(nodeData.files),
          });
          onFilesUpdate(nodeData.files);
        }
      });
    },
    [onTodosUpdate, onFilesUpdate]
  );

  const stream = useStream<StateType>({
    assistantId: agentId,
    client: createClient(accessToken || ""),
    reconnectOnMount: true,
    threadId: threadId ?? null,
    onUpdateEvent: handleUpdateEvent,
    onThreadId: (newThreadId) => {
      console.log("[useChat] Thread ID changed:", {
        timestamp: new Date().toISOString(),
        oldThreadId: threadId,
        newThreadId,
      });
      setThreadId(newThreadId);
    },
    onError: (error: unknown, run) => {
      console.error("[useChat] Stream error occurred:", {
        timestamp: new Date().toISOString(),
        error,
        errorType: typeof error,
        errorMessage: error instanceof Error ? error.message : String(error),
        errorStack: error instanceof Error ? error.stack : undefined,
        runId: run?.run_id,
        threadId: run?.thread_id,
      });

      // Check if this is a message coercion error
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      if (
        errorMessage.includes("Unable to coerce message") ||
        errorMessage.includes("MESSAGE_COERCION_FAILURE") ||
        errorMessage.includes("only human, AI, system, developer, or tool")
      ) {
        console.warn(
          "[useChat] Message coercion error handled via onError callback:",
          {
            timestamp: new Date().toISOString(),
            errorMessage,
            note: "This error is expected when backend sends unsupported message types (like 'remove'). The message will be filtered out.",
          }
        );
        // Don't throw - we handle this gracefully by filtering messages
      } else {
        // Log other errors but don't throw to prevent app crashes
        console.error("[useChat] Unexpected stream error:", {
          timestamp: new Date().toISOString(),
          errorMessage,
          errorDetails: error,
        });
      }
    },
    defaultHeaders: {
      "x-auth-scheme": "langsmith",
    },
  });

  // Log stream initialization and configuration
  useEffect(() => {
    console.log("[useChat] Stream initialized:", {
      timestamp: new Date().toISOString(),
      agentId,
      threadId,
      hasAccessToken: !!accessToken,
      deploymentUrl: deployment?.deploymentUrl,
    });
  }, [agentId, threadId, accessToken, deployment]);

  // Clear handled interrupts when thread changes
  useEffect(() => {
    handledInterruptIdsRef.current.clear();
    setInterruptState(null);
    lastInterruptIdRef.current = null;
  }, [threadId]);

  // Monitor stream errors
  useEffect(() => {
    if (stream.error) {
      console.error(
        "[useChat] Stream error detected in stream.error property:",
        {
          timestamp: new Date().toISOString(),
          error: stream.error,
          errorType: typeof stream.error,
          errorMessage:
            stream.error instanceof Error
              ? stream.error.message
              : String(stream.error),
          errorStack:
            stream.error instanceof Error ? stream.error.stack : undefined,
        }
      );
    }
  }, [stream.error]);

  // Log all raw messages received from stream
  useEffect(() => {
    if (stream.messages && stream.messages.length > 0) {
      console.log("[useChat] Raw messages received from stream:", {
        timestamp: new Date().toISOString(),
        messageCount: stream.messages.length,
        messages: stream.messages.map((msg) => ({
          id: msg.id,
          type: msg.type,
          content:
            typeof msg.content === "string"
              ? msg.content.substring(0, 100)
              : Array.isArray(msg.content)
                ? `[Array with ${msg.content.length} items]`
                : msg.content,
          toolCallId: (msg as any).tool_call_id,
          hasAdditionalKwargs: !!(msg as any).additional_kwargs,
          hasToolCalls: !!(
            (msg as any).tool_calls && (msg as any).tool_calls.length > 0
          ),
        })),
      });
    }
  }, [stream.messages]);

  const sendMessage = useCallback(
    (message: string, imageUrls?: string[]) => {
      console.log("[useChat] Preparing to send message to backend:", {
        timestamp: new Date().toISOString(),
        messageText: message,
        messageLength: message.length,
        imageCount: imageUrls?.length || 0,
        threadId,
      });

      // Build content as array of text and image_url objects
      const contentParts: MessageContent[] = [];

      // Append imageUrls inline to the message, if provided
      let fullMessage = message.trim();

      if (imageUrls && imageUrls.length > 0) {
        const imageList = imageUrls.map((url) => `"${url}"`).join(", ");
        fullMessage += `\n\nHere are ${imageUrls.length} imageurl${imageUrls.length > 1 ? "s" : ""}: ${imageList}`;
      }

      if (fullMessage) {
        contentParts.push({
          type: "text",
          text: fullMessage,
        });
      }

      // If no content at all, use empty string (shouldn't happen, but safeguard)
      const content = contentParts.length > 0 ? contentParts : message;

      const humanMessage: Message = {
        id: uuidv4(),
        type: "human",
        content,
      };

      console.log("[useChat] Sending message to backend:", {
        timestamp: new Date().toISOString(),
        messageId: humanMessage.id,
        messageType: humanMessage.type,
        messageContent: humanMessage.content,
        contentParts: contentParts.length,
        hasText: message.trim().length > 0,
        hasImages: (imageUrls?.length || 0) > 0,
        payload: { messages: [humanMessage] },
        threadId,
        agentId,
      });

      // Note: stream.submit() may throw synchronously or errors may be handled via onError callback
      // The onError callback is the primary way to handle stream processing errors
      try {
        stream.submit(
          { messages: [humanMessage] },
          {
            optimisticValues(prev) {
              const prevMessages = prev.messages ?? [];
              const newMessages = [...prevMessages, humanMessage];
              console.log("[useChat] Optimistic update:", {
                timestamp: new Date().toISOString(),
                prevMessageCount: prevMessages.length,
                newMessageCount: newMessages.length,
                addedMessageId: humanMessage.id,
              });
              return { ...prev, messages: newMessages };
            },
            config: {
              recursion_limit: 100,
            },
          }
        );
      } catch (error: any) {
        // Handle synchronous errors from stream.submit()
        // Most errors will be caught by onError callback, but some may throw synchronously
        const errorMessage = error?.message || String(error);
        if (
          errorMessage.includes("Unable to coerce message") ||
          errorMessage.includes("MESSAGE_COERCION_FAILURE") ||
          errorMessage.includes("only human, AI, system, developer, or tool")
        ) {
          console.warn(
            "[useChat] Synchronous message coercion error caught in try-catch:",
            {
              timestamp: new Date().toISOString(),
              errorMessage,
              errorDetails: error,
              note: "This will also be handled by onError callback. Continuing...",
            }
          );
          // Don't throw - let onError handle it
        } else {
          // Re-throw other unexpected synchronous errors
          console.error("[useChat] Unexpected synchronous error:", {
            timestamp: new Date().toISOString(),
            errorMessage,
            errorStack: error?.stack,
            errorName: error?.name,
          });
          throw error;
        }
      }
    },
    [stream, threadId, agentId]
  );

  const stopStream = useCallback(() => {
    console.log("[useChat] Stopping stream:", {
      timestamp: new Date().toISOString(),
      threadId,
      currentMessageCount: stream.messages?.length || 0,
    });
    stream.stop();
  }, [stream, threadId]);

  // HITL: Use stream.interrupt property (official LangGraph SDK way)
  // Fallback to polling thread state if stream.interrupt is not available
  useEffect(() => {
    if (!enableHITL || !threadId || !accessToken) {
      setInterruptState(null);
      lastInterruptIdRef.current = null;
      return;
    }

    let cancelled = false;

    const checkInterrupts = async () => {
      try {
        // First, try to use stream.interrupt (official way)
        const streamAny = stream as any;
        const interrupt = streamAny?.interrupt;

        if (interrupt) {
          const interruptValue = interrupt?.value || interrupt;
          const interruptId = interrupt?.id;
          
          // Skip if we've already handled this interrupt
          if (interruptId && handledInterruptIdsRef.current.has(interruptId)) {
            if (!cancelled && lastInterruptIdRef.current !== null) {
              setInterruptState(null);
              lastInterruptIdRef.current = null;
            }
            return;
          }

          // Only update if interrupt ID actually changed
          if (interruptId === lastInterruptIdRef.current) {
            return; // Already showing this interrupt
          }

          const nodeName = 
            interruptValue?.action_requests?.[0]?.name ||
            interruptValue?.name ||
            "unknown";

          if (!cancelled) {
            lastInterruptIdRef.current = interruptId || null;
            setInterruptState({
              runId: streamAny?.runId || "unknown",
              threadId: threadId,
              nodeName: nodeName,
              pendingAction: interruptValue,
              state: streamAny?.values || {},
              interruptId: interruptId,
            });
          }
          return;
        }

        // Fallback: Check thread state directly (if stream.interrupt not available)
        const client = createClient(accessToken);
        const state = await client.threads.getState(threadId);
        const stateAny = state as any;
        
        const interrupts = stateAny?.interrupts || [];
        const taskInterrupts = stateAny?.tasks?.flatMap((task: any) => task?.interrupts || []) || [];
        const allInterrupts = [...interrupts, ...taskInterrupts];

        if (allInterrupts.length > 0 && !cancelled && state.values) {
          const interrupt = allInterrupts[0];
          const interruptId = interrupt?.id;
          
          if (interruptId && handledInterruptIdsRef.current.has(interruptId)) {
            if (!cancelled && lastInterruptIdRef.current !== null) {
              setInterruptState(null);
              lastInterruptIdRef.current = null;
            }
            return;
          }

          // Only update if interrupt ID actually changed
          if (interruptId === lastInterruptIdRef.current) {
            return; // Already showing this interrupt
          }
          
          const interruptValue = interrupt?.value || interrupt;
          const nodeName = 
            interruptValue?.action_requests?.[0]?.name ||
            interruptValue?.name ||
            "unknown";

          if (!cancelled) {
            lastInterruptIdRef.current = interruptId || null;
            setInterruptState({
              runId: "unknown",
              threadId: threadId,
              nodeName: nodeName,
              pendingAction: interruptValue,
              state: state.values,
              interruptId: interruptId,
            });
          }
        } else if (!cancelled) {
          // Only clear if we had an interrupt before
          if (lastInterruptIdRef.current !== null) {
            setInterruptState(null);
            lastInterruptIdRef.current = null;
          }
        }
      } catch (error) {
        console.warn("[useChat] HITL check failed (non-critical):", error);
        if (!cancelled && lastInterruptIdRef.current !== null) {
          setInterruptState(null);
          lastInterruptIdRef.current = null;
        }
      }
    };

    // Check immediately and then poll every 2 seconds
    checkInterrupts();
    const interval = setInterval(checkInterrupts, 2000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
    // Remove stream from dependencies - use it via closure instead
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enableHITL, threadId, accessToken]);

  // HITL: Resume function
  const resumeRun = useCallback(
    async (decision: HITLDecision, editedState?: any) => {
      // Safety: Only work if interrupt exists
      if (!interruptState || !accessToken) {
        console.warn("[useChat] Cannot resume - no interrupt state");
        return;
      }

      const interruptId = interruptState.interruptId;
      
      // Mark this interrupt as handled immediately to prevent re-detection
      if (interruptId) {
        handledInterruptIdsRef.current.add(interruptId);
        console.log("[useChat] Marking interrupt as handled:", interruptId);
      }
      
      // Clear interrupt state immediately to prevent showing it again
      setInterruptState(null);
      lastInterruptIdRef.current = null;

      try {
        // Use official LangGraph SDK resume method
        // According to LangChain HITL docs: resume={ "decisions": [{ "type": "approve" }] }
        // The decisions array should match the order of action_requests in the interrupt
        const actionRequests = interruptState.pendingAction?.action_requests || [];
        
        if (decision === "approve") {
          // Resume with approve decision for each action request
          // Format: { decisions: [{ type: "approve" }, ...] } - one per action
          const resumeValue = {
            decisions: actionRequests.map(() => ({ type: "approve" })),
          };
          
          stream.submit(undefined, {
            command: { resume: resumeValue },
            config: {
              recursion_limit: 100,
            },
          });
          console.log("[useChat] Run approved and resumed using command.resume", {
            decisionsCount: resumeValue.decisions.length,
          });
        } else if (decision === "reject") {
          // Resume with reject decision
          const resumeValue = {
            decisions: actionRequests.map(() => ({ type: "reject" })),
          };
          
          stream.submit(undefined, {
            command: { resume: resumeValue },
            config: {
              recursion_limit: 100,
            },
          });
          console.log("[useChat] Run rejected using command.resume");
        }
      } catch (error) {
        // Don't throw - log and continue
        console.error("[useChat] Resume failed:", error);
        // Remove from handled set if it failed so it can be retried
        if (interruptId) {
          handledInterruptIdsRef.current.delete(interruptId);
          // Re-set interrupt state so user can try again
          setInterruptState(interruptState);
          if (interruptState?.interruptId) {
            lastInterruptIdRef.current = interruptState.interruptId;
          }
        }
      }
    },
    [interruptState, accessToken, stream]
  );

  // Filter out unsupported message types to prevent coercion errors
  // LangChain only supports: human, ai, system, developer, tool
  const supportedTypes = ["human", "ai", "system", "developer", "tool"];
  const filteredMessages = useMemo(() => {
    const rawMessages = stream.messages || [];
    const unsupportedMessages = rawMessages.filter(
      (message: Message) =>
        !message.type || !supportedTypes.includes(message.type)
    );

    if (unsupportedMessages.length > 0) {
      console.warn("[useChat] Filtering out unsupported message types:", {
        timestamp: new Date().toISOString(),
        unsupportedCount: unsupportedMessages.length,
        unsupportedMessages: unsupportedMessages.map((msg) => ({
          id: msg.id,
          type: msg.type,
          name: msg.name,
          content:
            typeof msg.content === "string"
              ? msg.content.substring(0, 100)
              : "Non-string content",
        })),
        supportedTypes,
      });
    }

    const filtered = rawMessages.filter(
      (message: Message) =>
        message.type && supportedTypes.includes(message.type)
    );

    return filtered;
  }, [stream.messages]);

  return {
    messages: filteredMessages,
    isLoading: stream.isLoading,
    sendMessage,
    stopStream,
    // HITL functionality
    interruptState: enableHITL ? interruptState : null,
    resumeRun,
    enableHITL,
    setEnableHITL,
  };
}
