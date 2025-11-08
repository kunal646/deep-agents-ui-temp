"use client";

import React from "react";
import { Button } from "@/components/ui/button";
import { Check, X, LoaderCircle } from "lucide-react";
import type { InterruptState, HITLDecision } from "../../types/types";
import styles from "./HITLPanel.module.scss";

interface HITLPanelProps {
  interruptState: InterruptState;
  onResume: (decision: HITLDecision, editedState?: any) => void;
  isLoading?: boolean;
}

export const HITLPanel: React.FC<HITLPanelProps> = ({
  interruptState,
  onResume,
  isLoading = false,
}) => {
  const actionRequest = interruptState.pendingAction?.action_requests?.[0];
  const toolName = actionRequest?.name || interruptState.nodeName;
  const args = actionRequest?.args || {};

  // Format arguments for display (better formatting)
  const formatArgs = (args: any) => {
    if (!args || typeof args !== 'object') return '';
    
    // Format as readable JSON-like structure
    try {
      return JSON.stringify(args, null, 2);
    } catch {
      // Fallback to simple string representation
      return Object.entries(args)
        .map(([key, value]) => {
          let displayValue = String(value);
          // Truncate very long values but keep structure readable
          if (displayValue.length > 200) {
            displayValue = displayValue.substring(0, 200) + '...';
          }
          return `${key}: ${displayValue}`;
        })
        .join('\n');
    }
  };

  const handleApprove = () => {
    onResume("approve");
  };

  const handleReject = () => {
    onResume("reject");
  };

  return (
    <>
      <div className={styles.container}>
        <div className={styles.content}>
          <div className={styles.toolInfo}>
            <div className={styles.toolName}>
              Calling <strong>{toolName}</strong>
            </div>
            {Object.keys(args).length > 0 ? (
              <pre className={styles.toolArgs}>{formatArgs(args)}</pre>
            ) : (
              <div className={styles.noParams}>No parameters</div>
            )}
          </div>
        </div>

        <div className={styles.actions}>
          <Button
            onClick={handleReject}
            variant="outline"
            disabled={isLoading}
            className={styles.rejectButton}
            size="sm"
          >
            <X size={14} />
            Reject
          </Button>
          <Button
            onClick={handleApprove}
            disabled={isLoading}
            className={styles.approveButton}
            size="sm"
          >
            {isLoading ? (
              <>
                <LoaderCircle className={styles.spinner} size={14} />
                Processing...
              </>
            ) : (
              <>
                <Check size={14} />
                Approve
              </>
            )}
          </Button>
        </div>
      </div>
    </>
  );
};

