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
