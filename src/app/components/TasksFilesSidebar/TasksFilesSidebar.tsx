"use client";

import React, { useState, useMemo, useCallback, useEffect } from "react";
import {
  ChevronLeft,
  ChevronRight,
  FileText,
  Folder,
  FolderOpen,
  CheckCircle,
  Circle,
  Clock,
  ArrowUp,
  RefreshCw,
} from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import type { TodoItem, FileItem } from "../../types/types";
import styles from "./TasksFilesSidebar.module.scss";

const FILE_API_URL = 'http://localhost:8001/api';

interface FileInfo {
  path: string;
  is_dir: boolean;
  size: number;
  modified_at: string;
}

interface TasksFilesSidebarProps {
  todos: TodoItem[];
  files: Record<string, any>;
  onFileClick: (file: FileItem) => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
}

export const TasksFilesSidebar = React.memo<TasksFilesSidebarProps>(
  ({ todos, files, onFileClick, collapsed, onToggleCollapse }) => {
    // File system API state
    const [fileSystemFiles, setFileSystemFiles] = useState<FileInfo[]>([]);
    const [currentPath, setCurrentPath] = useState<string>('/');
    const [loadingFiles, setLoadingFiles] = useState(false);
    const [useFileSystem, setUseFileSystem] = useState(true); // Toggle between LangChain and File System

    const getStatusIcon = useCallback((status: TodoItem["status"]) => {
      switch (status) {
        case "completed":
          return <CheckCircle size={16} className={styles.completedIcon} />;
        case "in_progress":
          return <Clock size={16} className={styles.progressIcon} />;
        default:
          return <Circle size={16} className={styles.pendingIcon} />;
      }
    }, []);

    const groupedTodos = useMemo(() => {
      return {
        pending: todos.filter((t) => t.status === "pending"),
        in_progress: todos.filter((t) => t.status === "in_progress"),
        completed: todos.filter((t) => t.status === "completed"),
      };
    }, [todos]);

    // Helper to detect if file is a media file
    const isMediaFile = useCallback((filePath: string): boolean => {
      const ext = filePath.split('.').pop()?.toLowerCase();
      const mediaExtensions = ['mp3', 'mp4', 'wav', 'ogg', 'webm', 'm4a', 'aac', 'flac', 'mov', 'avi', 'mkv', 'wmv'];
      return mediaExtensions.includes(ext || '');
    }, []);

    // Helper to get MIME type from file extension
    const getMediaType = useCallback((filePath: string): string => {
      const ext = filePath.split('.').pop()?.toLowerCase();
      const mimeTypes: Record<string, string> = {
        'mp3': 'audio/mpeg',
        'mp4': 'video/mp4',
        'wav': 'audio/wav',
        'ogg': 'audio/ogg',
        'webm': 'video/webm',
        'm4a': 'audio/mp4',
        'aac': 'audio/aac',
        'flac': 'audio/flac',
        'mov': 'video/quicktime',
        'avi': 'video/x-msvideo',
        'mkv': 'video/x-matroska',
        'wmv': 'video/x-ms-wmv',
      };
      return mimeTypes[ext || ''] || 'application/octet-stream';
    }, []);

    // Load files from file system API
    const loadFiles = useCallback(async (path: string) => {
      setLoadingFiles(true);
      try {
        const response = await fetch(`${FILE_API_URL}/files?path=${encodeURIComponent(path)}`);
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        const data = await response.json();
        setFileSystemFiles(data.files || []);
      } catch (error) {
        console.error('Error loading files:', error);
        setFileSystemFiles([]);
      } finally {
        setLoadingFiles(false);
      }
    }, []);

    // Load file content from API
    const loadFileContent = useCallback(async (filePath: string) => {
      // Check if it's a media file
      if (isMediaFile(filePath)) {
        try {
          // Try to load as binary blob - check multiple endpoint patterns
          let blobUrl: string | null = null;
          
          // Approach 1: Try /raw endpoint
          try {
            const rawResponse = await fetch(`${FILE_API_URL}/files/${encodeURIComponent(filePath)}/raw`, {
              headers: { 'Accept': '*/*' }
            });
            if (rawResponse.ok) {
              const blob = await rawResponse.blob();
              blobUrl = URL.createObjectURL(blob);
            }
          } catch (e) {
            console.log('[loadFileContent] Raw endpoint not available, trying alternatives...');
          }
          
          // Approach 2: Try with ?raw=true query parameter
          if (!blobUrl) {
            try {
              const rawResponse = await fetch(`${FILE_API_URL}/files/${encodeURIComponent(filePath)}?raw=true`, {
                headers: { 'Accept': '*/*' }
              });
              if (rawResponse.ok) {
                const contentType = rawResponse.headers.get('content-type');
                if (contentType && !contentType.includes('application/json')) {
                  const blob = await rawResponse.blob();
                  blobUrl = URL.createObjectURL(blob);
                }
              }
            } catch (e) {
              console.log('[loadFileContent] Raw query parameter not available...');
            }
          }
          
          // Approach 3: Try regular endpoint and see if it returns binary
          if (!blobUrl) {
            try {
              const response = await fetch(`${FILE_API_URL}/files/${encodeURIComponent(filePath)}`, {
                headers: { 'Accept': '*/*' }
              });
              if (response.ok) {
                const contentType = response.headers.get('content-type');
                // If response is binary (not JSON), use it as blob
                if (contentType && !contentType.includes('application/json')) {
                  const blob = await response.blob();
                  blobUrl = URL.createObjectURL(blob);
                }
              }
            } catch (e) {
              console.error('[loadFileContent] Failed to load file as blob:', e);
            }
          }
          
          if (blobUrl) {
            onFileClick({ 
              path: filePath, 
              content: '', 
              mediaUrl: blobUrl,
              mediaType: getMediaType(filePath)
            });
            return;
          } else {
            // Fallback: show helpful message
            alert(`Unable to load media file. The backend API needs to support binary file serving (e.g., /api/files/{path}/raw endpoint).`);
            console.warn('[loadFileContent] Media file detected but no binary endpoint available');
            return;
          }
        } catch (error) {
          console.error('Error loading media file:', error);
          alert('Error loading media file');
          return;
        }
      }

      // For text files, use the existing logic
      try {
        const response = await fetch(`${FILE_API_URL}/files/${encodeURIComponent(filePath)}`);
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        const data = await response.json();
        
        console.log('[loadFileContent] Raw API response:', data);
        console.log('[loadFileContent] Content type:', typeof data.content);
        console.log('[loadFileContent] Content length:', data.content?.length);
        console.log('[loadFileContent] First 200 chars:', data.content?.substring(0, 200));
        
        // Remove line numbers if present (format: "1\tcontent\n2\tcontent")
        // Backend adds line numbers with tabs, so we strip them to avoid double numbering
        const content = data.content || '';
        const linesArray = content.split('\n');
        console.log('[loadFileContent] Total lines:', linesArray.length);
        console.log('[loadFileContent] First 5 lines:', linesArray.slice(0, 5));
        
        const lines = linesArray.map((line: string, index: number) => {
          // Match: optional whitespace, one or more digits, followed by tab or whitespace, then capture rest
          // Format: "     1\tcontent" or "     1 content" or "1\tcontent"
          // This handles both tabs and spaces after the line number
          const match = line.match(/^\s*\d+[\t\s]+(.*)$/);
          
          // Debug first few lines
          if (index < 5) {
            console.log(`[loadFileContent] Line ${index}:`, {
              original: JSON.stringify(line),
              hasMatch: match !== null,
              matchResult: match ? match[1] : null,
              regexTest: /^\s*\d+[\t\s]+(.*)$/.test(line)
            });
          }
          
          // If match found, return the content part (which might be empty for blank lines)
          // If no match, return line as-is (for lines that don't start with numbers)
          return match !== null ? match[1] : line;
        }).join('\n');
        
        console.log('[loadFileContent] Processed content length:', lines.length);
        console.log('[loadFileContent] First 200 chars of processed:', lines.substring(0, 200));
        
        onFileClick({ path: filePath, content: lines });
      } catch (error) {
        console.error('Error loading file:', error);
        alert('Error loading file');
      }
    }, [onFileClick, isMediaFile, getMediaType]);

    useEffect(() => {
      if (useFileSystem) {
        loadFiles(currentPath);
      }
    }, [currentPath, useFileSystem, loadFiles]);

    const handleDirectoryClick = useCallback((path: string) => {
      // API returns absolute paths but expects relative paths for navigation
      // Extract just the directory name from the absolute path
      const dirName = path.split('/').filter(p => p).pop() || '';
      // Append to current path (relative to current location)
      const newPath = currentPath === '/' ? dirName + '/' : currentPath + dirName + '/';
      setCurrentPath(newPath);
    }, [currentPath]);

    const handleFileClick = useCallback((path: string) => {
      loadFileContent(path);
    }, [loadFileContent]);

    const handleGoUp = useCallback(() => {
      const parts = currentPath.split('/').filter(p => p);
      parts.pop();
      const parentPath = parts.length > 0 ? parts.join('/') + '/' : '/';
      setCurrentPath(parentPath);
    }, [currentPath]);

    if (collapsed) {
      return (
        <div className={styles.sidebarCollapsed}>
          <Button
            variant="ghost"
            size="sm"
            onClick={onToggleCollapse}
            className={styles.toggleButton}
          >
            <ChevronRight size={20} />
          </Button>
        </div>
      );
    }

    return (
      <div className={styles.sidebar}>
        <div className={styles.header}>
          <h2 className={styles.title}>Workspace</h2>
          <Button
            variant="ghost"
            size="sm"
            onClick={onToggleCollapse}
            className={styles.toggleButton}
          >
            <ChevronLeft size={20} />
          </Button>
        </div>
        <Tabs defaultValue="tasks" className={styles.tabs}>
          <TabsList className={styles.tabsList}>
            <TabsTrigger value="tasks" className={styles.tabTrigger}>
              Tasks ({todos.length})
            </TabsTrigger>
            <TabsTrigger value="files" className={styles.tabTrigger}>
              Files ({useFileSystem ? fileSystemFiles.length : Object.keys(files).length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="tasks" className={styles.tabContent}>
            <ScrollArea className={styles.scrollArea}>
              {todos.length === 0 ? (
                <div className={styles.emptyState}>
                  <p>No tasks yet</p>
                </div>
              ) : (
                <div className={styles.todoGroups}>
                  {groupedTodos.in_progress.length > 0 && (
                    <div className={styles.todoGroup}>
                      <h3 className={styles.groupTitle}>In Progress</h3>
                      {groupedTodos.in_progress.map((todo, index) => (
                        <div
                          key={`in_progress_${todo.id}_${index}`}
                          className={styles.todoItem}
                        >
                          {getStatusIcon(todo.status)}
                          <span className={styles.todoContent}>
                            {todo.content}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}

                  {groupedTodos.pending.length > 0 && (
                    <div className={styles.todoGroup}>
                      <h3 className={styles.groupTitle}>Pending</h3>
                      {groupedTodos.pending.map((todo, index) => (
                        <div
                          key={`pending_${todo.id}_${index}`}
                          className={styles.todoItem}
                        >
                          {getStatusIcon(todo.status)}
                          <span className={styles.todoContent}>
                            {todo.content}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}

                  {groupedTodos.completed.length > 0 && (
                    <div className={styles.todoGroup}>
                      <h3 className={styles.groupTitle}>Completed</h3>
                      {groupedTodos.completed.map((todo, index) => (
                        <div
                          key={`completed_${todo.id}_${index}`}
                          className={styles.todoItem}
                        >
                          {getStatusIcon(todo.status)}
                          <span className={styles.todoContent}>
                            {todo.content}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </ScrollArea>
          </TabsContent>

          <TabsContent value="files" className={styles.tabContent}>
            {useFileSystem ? (
              <>
                {/* File System Browser */}
                <div className={styles.fileBrowserHeader}>
                  <div className={styles.pathControls}>
                    {currentPath !== '/' && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={handleGoUp}
                        className={styles.pathButton}
                      >
                        <ArrowUp size={14} />
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => loadFiles(currentPath)}
                      disabled={loadingFiles}
                      className={styles.pathButton}
                    >
                      <RefreshCw size={14} className={loadingFiles ? styles.spinning : ''} />
                    </Button>
                  </div>
                  <div className={styles.currentPath}>
                    {currentPath}
                  </div>
                </div>
                <ScrollArea className={styles.scrollArea}>
                  {loadingFiles ? (
                    <div className={styles.emptyState}>
                      <p>Loading files...</p>
                    </div>
                  ) : fileSystemFiles.length === 0 ? (
                    <div className={styles.emptyState}>
                      <p>No files found</p>
                    </div>
                  ) : (
                    <div className={styles.fileTree}>
                      {fileSystemFiles.map((file) => (
                        <div
                          key={file.path}
                          className={styles.fileItem}
                          onClick={() => file.is_dir ? handleDirectoryClick(file.path) : handleFileClick(file.path)}
                        >
                          <div className={styles.fileRow}>
                            {file.is_dir ? (
                              <Folder size={16} />
                            ) : (
                              <FileText size={16} />
                            )}
                            <span className={styles.fileName}>
                              {file.path.split('/').filter(p => p).pop() || file.path}
                            </span>
                            {!file.is_dir && (
                              <span className={styles.fileSize}>
                                {file.size} B
                              </span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </ScrollArea>
              </>
            ) : (
              /* LangChain Files (existing) */
              <ScrollArea className={styles.scrollArea}>
                {Object.keys(files).length === 0 ? (
                  <div className={styles.emptyState}>
                    <p>No files yet</p>
                  </div>
                ) : (
                  <div className={styles.fileTree}>
                    {Object.keys(files).map((file) => (
                      <div key={file} className={styles.fileItem}>
                        <div
                          className={styles.fileRow}
                          onClick={() =>
                            onFileClick({
                              path: file,
                              content:
                                typeof files[file] === "string"
                                  ? files[file]
                                  : files[file].content || "",
                            })
                          }
                        >
                          <FileText size={16} />
                          <span className={styles.fileName}>{file}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </ScrollArea>
            )}
          </TabsContent>
        </Tabs>
      </div>
    );
  }
);

TasksFilesSidebar.displayName = "TasksFilesSidebar";
