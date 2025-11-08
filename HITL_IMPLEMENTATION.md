# Human-In-The-Loop (HITL) Implementation Guide

## Overview

This document explains how the Human-In-The-Loop (HITL) interrupt feature is implemented in the chat interface. This feature allows users to approve, reject, or edit tool calls before they are executed by the AI agent.

## How It Works

### 1. **Interrupt Detection**

When the backend agent needs human approval for a tool call, it triggers an interrupt. Our frontend detects this interrupt in two ways:

#### Primary Method: `stream.interrupt` (Official LangGraph SDK)
- The `useStream` hook exposes an `interrupt` property
- We check `stream.interrupt` for active interrupts
- This is the recommended way according to LangGraph documentation

#### Fallback Method: Polling Thread State
- If `stream.interrupt` is not available, we poll the thread state every 2 seconds
- We check `state.interrupts` and `state.tasks[].interrupts` arrays
- This ensures compatibility with different backend configurations

**Location:** `src/app/hooks/useChat.ts` (lines 306-429)

### 2. **Interrupt Structure**

When an interrupt is detected, it contains:
```typescript
{
  id: "unique-interrupt-id",
  value: {
    action_requests: [
      {
        name: "analyze_image",  // Tool name
        args: {                 // Tool arguments
          image_url: "...",
          query: "..."
        },
        description: "Tool execution requires approval..."
      }
    ],
    review_configs: [
      {
        action_name: "analyze_image",
        allowed_decisions: ["approve", "reject"]
      }
    ]
  }
}
```

### 3. **Displaying the Approval UI**

When an interrupt is detected:
1. The interrupt data is stored in `interruptState`
2. The `HITLPanel` component is rendered inline in the chat
3. It appears right after the last AI message that triggered the interrupt
4. Shows the tool name and key arguments in a compact format

**Location:** 
- Detection: `src/app/hooks/useChat.ts`
- UI Component: `src/app/components/HITLPanel/HITLPanel.tsx`
- Integration: `src/app/components/ChatInterface/ChatInterface.tsx` (lines 346-370)

### 4. **User Actions (Approve/Reject/Edit)**

When the user clicks a button:

#### Approve
```typescript
stream.submit(undefined, {
  command: { 
    resume: { 
      decisions: [{ type: "approve" }] 
    } 
  }
});
```

#### Reject
```typescript
stream.submit(undefined, {
  command: { 
    resume: { 
      decisions: [{ type: "reject" }] 
    } 
  }
});
```

#### Edit
```typescript
stream.submit(undefined, {
  command: { 
    resume: { 
      decisions: [{ 
        type: "edit", 
        edited_args: editedState 
      }] 
    } 
  }
});
```

**Key Point:** We use `stream.submit(undefined, { command: { resume: ... } })` instead of sending regular messages. This is the official LangGraph SDK way to resume interrupted runs.

**Location:** `src/app/hooks/useChat.ts` (lines 431-520)

### 5. **Preventing Infinite Loops**

To prevent the same interrupt from showing repeatedly:

1. **Track Handled Interrupts**: We use a `useRef` to store interrupt IDs we've already processed
2. **Immediate State Clear**: When user approves/rejects, we immediately:
   - Mark the interrupt as handled
   - Clear the interrupt state
   - Send the resume command
3. **Skip Re-detection**: The detection logic skips interrupts that are already in the handled set

**Location:** `src/app/hooks/useChat.ts` (lines 31-32, 327-334, 443-450)

## File Structure

```
src/app/
├── hooks/
│   └── useChat.ts              # Main HITL logic (detection + resume)
├── components/
│   ├── HITLPanel/
│   │   ├── HITLPanel.tsx       # Approval UI component
│   │   └── HITLPanel.module.scss
│   └── ChatInterface/
│       ├── ChatInterface.tsx   # Integrates HITL panel into chat
│       └── ChatInterface.module.scss
└── types/
    └── types.ts                # InterruptState and HITLDecision types
```

## Key Components

### `useChat` Hook

**Responsibilities:**
- Detects interrupts from `stream.interrupt` or thread state
- Tracks handled interrupts to prevent loops
- Provides `resumeRun()` function to handle approve/reject/edit
- Returns `interruptState` for UI to display

**Key Functions:**
- `checkInterrupts()`: Polls for interrupts every 2 seconds
- `resumeRun()`: Resumes the interrupted run with user's decision

### `HITLPanel` Component

**Responsibilities:**
- Displays tool name and arguments
- Shows Approve/Reject buttons
- Handles user interactions

**Design:**
- Compact, inline design (like Cursor)
- Appears after the relevant message
- Right-aligned like user actions

### `ChatInterface` Component

**Responsibilities:**
- Integrates HITLPanel into message flow
- Shows panel after last AI message when interrupt exists
- Maintains chat conversation flow

## Data Flow

```
1. Backend triggers interrupt
   ↓
2. useChat detects interrupt (via stream.interrupt or polling)
   ↓
3. interruptState is set with interrupt data
   ↓
4. ChatInterface renders HITLPanel inline
   ↓
5. User clicks Approve/Reject
   ↓
6. resumeRun() is called
   ↓
7. Interrupt marked as handled
   ↓
8. stream.submit() with command.resume
   ↓
9. Backend resumes execution
   ↓
10. Interrupt cleared from state
```

## Important Implementation Details

### 1. **Resume Format**

The resume value must match the interrupt structure:
- For single action: `{ decisions: [{ type: "approve" }] }`
- For multiple actions: `{ decisions: [{ type: "approve" }, { type: "reject" }] }`
- Decisions array order must match `action_requests` order

### 2. **Loop Prevention**

Three mechanisms prevent infinite loops:
1. **Handled Interrupts Set**: Tracks processed interrupt IDs
2. **Last Interrupt ID Ref**: Prevents re-setting same interrupt
3. **Immediate State Clear**: Clears UI before resuming

### 3. **Error Handling**

- All errors are caught and logged (non-breaking)
- Failed resumes can be retried (removed from handled set)
- Graceful fallback if `stream.interrupt` not available

## Configuration

### Enable/Disable HITL

The feature can be toggled via the `enableHITL` state:

```typescript
const { enableHITL, setEnableHITL } = useChat(...);

// Disable HITL
setEnableHITL(false);

// Enable HITL
setEnableHITL(true);
```

**Default:** Enabled (`true`)

## Testing

To test the HITL feature:

1. **Trigger an interrupt**: Use a backend that requires approval for certain tools
2. **Check detection**: Open browser console, look for `[useChat] Interrupt detected!`
3. **Test approve**: Click approve, check console for `[useChat] Run approved and resumed`
4. **Verify no loop**: Same interrupt should not reappear after approval

## Troubleshooting

### Interrupt not showing?
- Check browser console for `[useChat] Interrupt detected!` logs
- Verify `enableHITL` is `true`
- Check if `stream.interrupt` exists or if polling is working

### Infinite loop after approval?
- Check if `handledInterruptIdsRef` is tracking the interrupt ID
- Verify resume command format matches backend expectations
- Check console for resume success/failure logs

### Interrupt appears at top of chat?
- Ensure HITLPanel is rendered inside `messagesList` (not before)
- Check `ChatInterface.tsx` line 346-370

## References

- [LangGraph Interrupts Documentation](https://docs.langchain.com/langsmith/use-stream-react)
- [LangGraph HITL Guide](https://docs.langchain.com/langsmith/add-human-in-the-loop)
- [React useStream Hook](https://docs.langchain.com/langsmith/use-stream-react)

