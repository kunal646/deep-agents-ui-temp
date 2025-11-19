"use client";

import React, { useState, useCallback, useMemo, useEffect, useRef } from "react";
import { X, Save, LoaderCircle, MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { FileItem } from "../../types/types";
import styles from "./EditorWorkspace.module.scss";
import dynamic from "next/dynamic";
import { useFileWatcher, type FileChangeEvent } from "../../hooks/useFileWatcher";

const Editor = dynamic(() => import("@monaco-editor/react"), { ssr: false });

//dev env
//const FILE_API_URL = 'http://localhost:8001/api';
//prod env
const FILE_API_URL = 'https://agentstoryboard-production.up.railway.app/api';

// Helper function to normalize file path (ensure leading slash for backend API)
function normalizeFilePath(path: string): string {
  // Backend expects paths with leading slash (e.g., /app/agent_workspace/...)
  // Just return as-is since paths from the API already have the correct format
  return path;
}

// Helper function to detect language from file extension
function getLanguageFromPath(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase();
  const langMap: Record<string, string> = {
    'py': 'python', 'js': 'javascript', 'ts': 'typescript', 'tsx': 'typescript',
    'jsx': 'javascript', 'json': 'json', 'md': 'markdown', 'html': 'html',
    'css': 'css', 'scss': 'scss', 'yaml': 'yaml', 'yml': 'yaml',
    'xml': 'xml', 'sql': 'sql', 'sh': 'shell', 'bash': 'shell',
    'go': 'go', 'rs': 'rust', 'java': 'java', 'cpp': 'cpp', 'c': 'c',
    'php': 'php', 'rb': 'ruby', 'swift': 'swift', 'kt': 'kotlin',
    'dart': 'dart', 'lua': 'lua', 'r': 'r', 'perl': 'perl',
    'toml': 'toml', 'ini': 'ini', 'dockerfile': 'dockerfile',
  };
  return langMap[ext || ''] || 'plaintext';
}

// Helper function to detect if file is a media file
function isMediaFile(file: FileItem): boolean {
  return !!file.mediaUrl || !!file.mediaType;
}

interface EditorWorkspaceProps {
  openFiles: FileItem[];
  onFileClose: (fileId: string) => void;
  onFileSelect: (fileId: string) => void;
  onFileSave: (fileId: string, content: string) => void;
  chatPanel?: React.ReactNode;
  showChat?: boolean;
  onToggleChat?: () => void;
}

export const EditorWorkspace = React.memo<EditorWorkspaceProps>(
  ({ openFiles, onFileClose, onFileSelect, onFileSave, chatPanel, showChat = false, onToggleChat }) => {
    const [activeFileId, setActiveFileId] = useState<string | null>(
      openFiles.length > 0 ? openFiles[0].path : null
    );
    const [fileContents, setFileContents] = useState<Record<string, string>>({});
    const [savingFileId, setSavingFileId] = useState<string | null>(null);
    const [chatPanelWidth, setChatPanelWidth] = useState(400);
    const [isResizing, setIsResizing] = useState(false);
    const resizeRef = useRef<HTMLDivElement>(null);
    const contentRowRef = useRef<HTMLDivElement>(null);
    const previousFilesRef = useRef<FileItem[]>([]);
    const fileChangeNotificationsRef = useRef<Set<string>>(new Set());

    // Initialize file contents
    useEffect(() => {
      openFiles.forEach(file => {
        if (!fileContents[file.path]) {
          setFileContents(prev => ({ ...prev, [file.path]: file.content || '' }));
        }
      });
    }, [openFiles]);

    // Cleanup blob URLs when files are closed
    useEffect(() => {
      const currentFiles = openFiles;
      
      // Find files that were removed
      const removedFiles = previousFilesRef.current.filter(
        prevFile => !currentFiles.some(currFile => currFile.path === prevFile.path)
      );
      
      // Cleanup blob URLs for removed files
      removedFiles.forEach(file => {
        if (file.mediaUrl && file.mediaUrl.startsWith('blob:')) {
          URL.revokeObjectURL(file.mediaUrl);
        }
      });
      
      // Update ref for next comparison
      previousFilesRef.current = currentFiles;
    }, [openFiles]);

    // Track previous file count and last file path to detect changes
    const prevFileCountRef = React.useRef(openFiles.length);
    const prevLastFilePathRef = React.useRef<string | null>(
      openFiles.length > 0 ? openFiles[openFiles.length - 1].path : null
    );
    
    // Set active file when NEW files are added or files are reordered - make last file active
    useEffect(() => {
      const currentFileCount = openFiles.length;
      const prevFileCount = prevFileCountRef.current;
      const currentLastFile = openFiles.length > 0 ? openFiles[openFiles.length - 1] : null;
      const currentLastFilePath = currentLastFile?.path || null;
      const prevLastFilePath = prevLastFilePathRef.current;
      
      // If count increased (new file) or last file changed (reordered), make it active
      if (currentFileCount > prevFileCount || (currentLastFilePath && currentLastFilePath !== prevLastFilePath)) {
        // New file was added or file was reordered - make the last file active
        if (currentLastFile) {
          setActiveFileId(currentLastFile.path);
        }
      } else if (currentFileCount === 0) {
        // All files closed
        setActiveFileId(null);
      }
      
      // Update refs for next comparison
      prevFileCountRef.current = currentFileCount;
      prevLastFilePathRef.current = currentLastFilePath;
    }, [openFiles]); // Trigger when files change

    // Handle resize
    useEffect(() => {
      if (!isResizing) return;

      const handleMouseMove = (e: MouseEvent) => {
        if (!contentRowRef.current) return;
        
        const containerRect = contentRowRef.current.getBoundingClientRect();
        const newWidth = containerRect.right - e.clientX;
        const minWidth = 300;
        const maxWidth = Math.min(800, containerRect.width * 0.7);
        
        if (newWidth >= minWidth && newWidth <= maxWidth) {
          setChatPanelWidth(newWidth);
        }
      };

      const handleMouseUp = () => {
        setIsResizing(false);
      };

      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';

      return () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
      };
    }, [isResizing]);

    const activeFile = useMemo(() => {
      return openFiles.find(f => f.path === activeFileId) || null;
    }, [openFiles, activeFileId]);

    const hasChanges = useMemo(() => {
      if (!activeFile) return false;
      const currentContent = fileContents[activeFile.path] || '';
      return currentContent !== (activeFile.content || '');
    }, [activeFile, fileContents]);

    const handleContentChange = useCallback((value: string | undefined) => {
      if (activeFileId) {
        setFileContents(prev => ({ ...prev, [activeFileId]: value || '' }));
      }
    }, [activeFileId]);

    const handleSave = useCallback(async () => {
      if (!activeFileId || !activeFile) return;

      const content = fileContents[activeFileId] || '';
      setSavingFileId(activeFileId);

      try {
        const response = await fetch(`${FILE_API_URL}/files/${encodeURIComponent(normalizeFilePath(activeFile.path))}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content }),
        });

        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.detail || 'Failed to save file');
        }

        onFileSave(activeFileId, content);
      } catch (error: any) {
        console.error('Error saving file:', error);
        alert(`Error saving file: ${error.message}`);
      } finally {
        setSavingFileId(null);
      }
    }, [activeFileId, activeFile, fileContents, onFileSave]);

    const handleTabClick = useCallback((fileId: string) => {
      setActiveFileId(fileId);
      onFileSelect(fileId);
    }, [onFileSelect]);

    const handleTabClose = useCallback((e: React.MouseEvent, fileId: string) => {
      e.stopPropagation();
      if (openFiles.length === 1) {
        // Don't close the last file
        return;
      }
      onFileClose(fileId);
      if (activeFileId === fileId) {
        const currentIndex = openFiles.findIndex(f => f.path === fileId);
        const newIndex = currentIndex > 0 ? currentIndex - 1 : 0;
        const newFile = openFiles[newIndex];
        if (newFile && newFile.path !== fileId) {
          setActiveFileId(newFile.path);
        }
      }
    }, [activeFileId, openFiles, onFileClose]);

    // Handle file reload from API
    const reloadFile = useCallback(async (filePath: string) => {
      try {
        const response = await fetch(`${FILE_API_URL}/files/${encodeURIComponent(normalizeFilePath(filePath))}`);
        if (!response.ok) {
          throw new Error(`Failed to reload file: ${response.statusText}`);
        }
        const fileData = await response.json();
        const rawContent = fileData.content || '';
        
        // Remove line numbers if present (format: "1\tcontent\n2\tcontent")
        // Backend adds line numbers with tabs, so we strip them to avoid double numbering
        const linesArray = rawContent.split('\n');
        const newContent = linesArray.map((line: string) => {
          // Match: optional whitespace, one or more digits, followed by tab or whitespace, then capture rest
          // Format: "     1\tcontent" or "     1 content" or "1\tcontent"
          const match = line.match(/^\s*\d+[\t\s]+(.*)$/);
          // If match found, return the content part (which might be empty for blank lines)
          // If no match, return line as-is (for lines that don't start with numbers)
          return match !== null ? match[1] : line;
        }).join('\n');
        
        setFileContents(prev => ({
          ...prev,
          [filePath]: newContent
        }));
        
        // Update the file in openFiles via onFileSave callback
        onFileSave(filePath, newContent);
        
        return newContent;
      } catch (error: any) {
        console.error('Error reloading file:', error);
        throw error;
      }
    }, [onFileSave]);

    // Handle file change events from backend (file_created, file_updated, file_deleted)
    const handleFileChange = useCallback(async (event: FileChangeEvent) => {
      const { path, type: changeType } = event;
      
      // Backend sends paths like "s.txt" but frontend stores "agent_data/s.txt"
      // Try to find the file by exact match first, then by filename match
      let openFile = openFiles.find(f => f.path === path);
      
      // If exact match fails, try matching by filename (backend sends just filename)
      if (!openFile) {
        openFile = openFiles.find(f => {
          const fileName = f.path.split('/').pop() || f.path.split('\\').pop();
          return f.path.endsWith(path) || 
                 f.path.endsWith(`/${path}`) ||
                 f.path.endsWith(`\\${path}`) ||
                 fileName === path;
        });
      }
      
      if (!openFile) {
        // File is not open, no action needed
        return;
      }

      // Use the actual file path from openFiles for consistency
      const actualPath = openFile.path;

      // Skip if we just saved this file (avoid reloading our own saves)
      if (savingFileId === actualPath) {
        return;
      }

      // Debounce: Skip if we've already notified about this file recently
      const notificationKey = `${actualPath}-${changeType}`;
      if (fileChangeNotificationsRef.current.has(notificationKey)) {
        return;
      }
      fileChangeNotificationsRef.current.add(notificationKey);
      setTimeout(() => {
        fileChangeNotificationsRef.current.delete(notificationKey);
      }, 2000);

      if (changeType === 'file_deleted') {
        // File was deleted externally
        const hasUnsavedChanges = (fileContents[actualPath] || '') !== (openFile.content || '');
        if (hasUnsavedChanges) {
          const shouldClose = window.confirm(
            `File "${actualPath}" was deleted externally, but you have unsaved changes. Do you want to close this tab?`
          );
          if (shouldClose) {
            onFileClose(actualPath);
          }
        } else {
          onFileClose(actualPath);
        }
        return;
      }

      if (changeType === 'file_updated') {
        // Check if file has unsaved changes
        const currentContent = fileContents[actualPath] || '';
        const originalContent = openFile.content || '';
        const hasUnsavedChanges = currentContent !== originalContent;

        if (hasUnsavedChanges) {
          // File was modified externally but we have unsaved changes
          const shouldReload = window.confirm(
            `File "${actualPath}" was modified externally. Do you want to reload it? Your unsaved changes will be lost.`
          );
          if (shouldReload) {
            try {
              await reloadFile(actualPath);
            } catch (error: any) {
              alert(`Failed to reload file: ${error.message}`);
            }
          }
        } else {
          // No unsaved changes, auto-reload
          try {
            await reloadFile(actualPath);
          } catch (error: any) {
            console.error(`[EditorWorkspace] Failed to auto-reload file: ${actualPath}`, error);
          }
        }
      } else if (changeType === 'file_created') {
        // File was created (might be a new file we're watching)
        // Just reload to get the content
        try {
          await reloadFile(actualPath);
        } catch (error: any) {
          console.error(`[EditorWorkspace] Failed to reload created file: ${actualPath}`, error);
        }
      }
    }, [openFiles, fileContents, savingFileId, reloadFile, onFileClose, onFileSave]);

    // Set up file watcher
    useFileWatcher({
      enabled: true,
      onFileChanged: handleFileChange,
      onError: (error) => {
        console.error('[EditorWorkspace] File watcher error:', error);
      },
    });

    return (
      <div className={styles.workspace}>
        {/* Tab Bar - only show if there are files */}
        {openFiles.length > 0 && (
          <div className={styles.tabBar}>
            <div className={styles.tabs}>
              {openFiles.map((file) => {
                const fileContent = fileContents[file.path] || file.content || '';
                const isChanged = fileContent !== (file.content || '');
                const isActive = file.path === activeFileId;

                return (
                  <div
                    key={file.path}
                    className={`${styles.tab} ${isActive ? styles.tabActive : ''}`}
                    onClick={() => handleTabClick(file.path)}
                  >
                    <span className={styles.tabLabel}>{file.path.split('/').pop() || file.path}</span>
                    {isChanged && <span className={styles.tabDot}>●</span>}
                    {openFiles.length > 1 && (
                      <button
                        className={styles.tabClose}
                        onClick={(e) => handleTabClose(e, file.path)}
                        aria-label="Close tab"
                      >
                        <X size={12} />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
            {onToggleChat && (
              <Button
                variant="ghost"
                size="sm"
                onClick={onToggleChat}
                className={styles.chatToggle}
              >
                <MessageSquare size={16} />
              </Button>
            )}
          </div>
        )}

        {/* Content Row: Editor + Chat */}
        <div ref={contentRowRef} className={styles.contentRow}>
          {/* Editor Area - only show when there are files */}
          {openFiles.length > 0 && (
            <div className={styles.editorArea}>
              {activeFile && (
                <>
                  <div className={styles.editorHeader}>
                    <div className={styles.fileInfo}>
                      <span className={styles.fileName}>{activeFile.path}</span>
                      <span className={styles.languageBadge}>
                        {isMediaFile(activeFile) 
                          ? (activeFile.mediaType?.startsWith('audio/') ? 'Audio' : 'Video')
                          : getLanguageFromPath(activeFile.path)
                        }
                      </span>
                      {hasChanges && (
                        <span className={styles.unsavedIndicator}>● Unsaved</span>
                      )}
                    </div>
                    {!isMediaFile(activeFile) && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={handleSave}
                        disabled={!hasChanges || savingFileId === activeFileId}
                        className={styles.saveButton}
                      >
                        {savingFileId === activeFileId ? (
                          <LoaderCircle size={16} className={styles.spinning} />
                        ) : (
                          <Save size={16} />
                        )}
                        Save
                      </Button>
                    )}
                  </div>
                  <div className={styles.editorContainer}>
                    {isMediaFile(activeFile) ? (
                      // Render media player for media files
                      <div className={styles.mediaContainer}>
                        {activeFile.mediaType?.startsWith('audio/') ? (
                          <audio 
                            controls 
                            src={activeFile.mediaUrl} 
                            style={{ width: '100%', maxHeight: '100%' }}
                            preload="metadata"
                          />
                        ) : activeFile.mediaType?.startsWith('video/') ? (
                          <video 
                            controls 
                            src={activeFile.mediaUrl} 
                            style={{ width: '100%', maxHeight: '100%' }}
                            preload="metadata"
                          />
                        ) : (
                          <div className={styles.mediaError}>
                            <p>Unsupported media type: {activeFile.mediaType}</p>
                            {activeFile.mediaUrl && (
                              <a href={activeFile.mediaUrl} download={activeFile.path.split('/').pop()}>
                                Download file
                              </a>
                            )}
                          </div>
                        )}
                      </div>
                    ) : (
                      // Render Monaco Editor for text files
                      <Editor
                        height="100%"
                        language={getLanguageFromPath(activeFile.path)}
                        value={fileContents[activeFile.path] || activeFile.content || ''}
                        onChange={handleContentChange}
                        theme="vs-dark"
                        options={{
                          minimap: { enabled: true },
                          fontSize: 14,
                          wordWrap: 'on' as const,
                          automaticLayout: true,
                          scrollBeyondLastLine: false,
                          tabSize: 2,
                          insertSpaces: true,
                          lineNumbers: 'on' as const,
                          renderWhitespace: 'selection' as const,
                          formatOnPaste: true,
                          formatOnType: true,
                        }}
                      />
                    )}
                  </div>
                </>
              )}
            </div>
          )}

          {/* Resize Handle - only show when there are files and chat is visible */}
          {openFiles.length > 0 && showChat && chatPanel && (
            <div
              ref={resizeRef}
              className={styles.resizeHandle}
              onMouseDown={(e) => {
                e.preventDefault();
                setIsResizing(true);
              }}
            />
          )}

          {/* Chat Panel - full width when no files, otherwise use chatPanelWidth */}
          {showChat && chatPanel && (
            <div 
              className={styles.chatPanel} 
              style={{ width: openFiles.length === 0 ? '100%' : `${chatPanelWidth}px` }}
            >
              {chatPanel}
            </div>
          )}
        </div>
      </div>
    );
  }
);

EditorWorkspace.displayName = "EditorWorkspace";

