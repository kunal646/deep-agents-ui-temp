export interface ToolCall {
  id: string;
  name: string;
  args: any;
  result?: string;
  status: "pending" | "completed" | "error";
}

export interface SubAgent {
  id: string;
  name: string;
  subAgentName: string;
  input: any;
  output?: any;
  status: "pending" | "active" | "completed" | "error";
}

export interface FileItem {
  path: string;
  content: string;
  mediaUrl?: string;  // Blob URL for media files (audio/video)
  mediaType?: string; // MIME type (e.g., 'audio/mpeg', 'video/mp4')
}

export interface FileMetadata {
  content: string;
  created_at?: string;
  modified_at?: string;
}

export interface TodoItem {
  id: string;
  content: string;
  status: "pending" | "in_progress" | "completed";
  createdAt?: Date;
  updatedAt?: Date;
}

export interface Thread {
  id: string;
  title: string;
  createdAt: Date;
  updatedAt: Date;
}

export type MessageContentText = {
  type: "text";
  text: string;
};

export type MessageContentImageUrl = {
  type: "image_url";
  image_url: {
    url: string;
    detail?: "auto" | "low" | "high";
  };
};

export type MessageContent = MessageContentText | MessageContentImageUrl;

export interface UploadedImage {
  file: File;
  previewUrl: string;
  uploadedUrl?: string;
}

export interface InterruptState {
  runId: string;
  threadId: string;
  nodeName: string;
  pendingAction?: any; // The action waiting for approval
  state: any; // Current state at interrupt point
  interruptId?: string; // Unique ID of the interrupt to track handled interrupts
}

export type HITLDecision = "approve" | "reject" | "edit";
