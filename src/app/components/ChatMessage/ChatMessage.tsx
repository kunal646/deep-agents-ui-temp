"use client";

import React, { useEffect, useMemo } from "react";
import { SubAgentIndicator } from "../SubAgentIndicator/SubAgentIndicator";
import { ToolCallBox } from "../ToolCallBox/ToolCallBox";
import { MarkdownContent } from "../MarkdownContent/MarkdownContent";
import type { SubAgent, ToolCall } from "../../types/types";
import styles from "./ChatMessage.module.scss";
import { Message } from "@langchain/langgraph-sdk";
import {
  extractStringFromMessageContent,
  parseImageUrlsFromContent,
} from "../../utils/utils";

interface ChatMessageProps {
  message: Message;
  toolCalls: ToolCall[];
  showAvatar: boolean;
  onSelectSubAgent: (subAgent: SubAgent) => void;
  selectedSubAgent: SubAgent | null;
}

export const ChatMessage = React.memo<ChatMessageProps>(
  ({ message, toolCalls, showAvatar, onSelectSubAgent, selectedSubAgent }) => {
    const isUser = message.type === "human";
    console.log("[ChatMessage] Is user:", {
      isUser,
    });
    const messageContent = extractStringFromMessageContent(message);

    // Parse image URLs from message content for user messages
    const { cleanText, imageUrls } = useMemo(
      () =>
        isUser
          ? parseImageUrlsFromContent(messageContent)
          : { cleanText: messageContent, imageUrls: [] },
      [messageContent, isUser]
    );
    console.log("[ChatMessage] Message content:", {
      messageContent,
    });
    console.log("[ChatMessage] Clean text:", {
      cleanText,
    });
    console.log("[ChatMessage] Image URLs:", {
      imageUrls,
    });

    const displayContent = isUser ? cleanText : messageContent;
    const hasContent = displayContent && displayContent.trim() !== "";
    const hasImages = imageUrls.length > 0;
    console.log("[ChatMessage] Has images:", {
      hasImages,
      imageUrls,
    });
    const hasToolCalls = toolCalls.length > 0;
    const subAgents = useMemo(() => {
      return toolCalls
        .filter((toolCall: ToolCall) => {
          return (
            toolCall.name === "task" &&
            toolCall.args["subagent_type"] &&
            toolCall.args["subagent_type"] !== "" &&
            toolCall.args["subagent_type"] !== null
          );
        })
        .map((toolCall: ToolCall) => {
          return {
            id: toolCall.id,
            name: toolCall.name,
            subAgentName: toolCall.args["subagent_type"],
            input: toolCall.args["description"],
            output: toolCall.result,
            status: toolCall.status,
          };
        });
    }, [toolCalls]);

    const subAgentsString = useMemo(() => {
      return JSON.stringify(subAgents);
    }, [subAgents]);

    useEffect(() => {
      if (
        subAgents.some(
          (subAgent: SubAgent) => subAgent.id === selectedSubAgent?.id
        )
      ) {
        onSelectSubAgent(
          subAgents.find(
            (subAgent: SubAgent) => subAgent.id === selectedSubAgent?.id
          )!
        );
      }
    }, [selectedSubAgent, onSelectSubAgent, subAgentsString]);

    return (
      <div
        className={`${styles.message} ${isUser ? styles.user : styles.assistant}`}
      >
        {!isUser && (
          <div
            className={`${styles.avatar} ${!showAvatar ? styles.avatarHidden : ""}`}
          >
            {showAvatar && (
              <img
                src="/chromatic-logo-landing.svg"
                alt="Chromatic"
                className={styles.avatarIcon}
              />
            )}
          </div>
        )}
        <div className={styles.content}>
          {hasContent && (
            <div className={styles.bubble}>
              {isUser ? (
                <p className={styles.text}>{displayContent}</p>
              ) : (
                <MarkdownContent content={displayContent} />
              )}
            </div>
          )}
          {hasImages && (
            <div className={styles.images}>
              {imageUrls.map((url, index) => (
                <img
                  key={index}
                  src={url}
                  alt={`Uploaded image ${index + 1}`}
                  className={styles.uploadedImage}
                />
              ))}
            </div>
          )}
          {hasToolCalls && (
            <div className={styles.toolCalls}>
              {toolCalls.map((toolCall: ToolCall) => {
                if (toolCall.name === "task") return null;
                return <ToolCallBox key={toolCall.id} toolCall={toolCall} />;
              })}
            </div>
          )}
          {!isUser && subAgents.length > 0 && (
            <div className={styles.subAgents}>
              {subAgents.map((subAgent: SubAgent) => (
                <SubAgentIndicator
                  key={subAgent.id}
                  subAgent={subAgent}
                  onClick={() => onSelectSubAgent(subAgent)}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }
);

ChatMessage.displayName = "ChatMessage";
