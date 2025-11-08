"use client";

import React, { useState, useCallback, useMemo, useEffect, useRef } from "react";
import { X, Save, LoaderCircle, MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { FileItem } from "../../types/types";
import styles from "./EditorWorkspace.module.scss";
import dynamic from "next/dynamic";

const Editor = dynamic(() => import("@monaco-editor/react"), { ssr: false });

const FILE_API_URL = 'http://localhost:8001/api';

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
        const response = await fetch(`${FILE_API_URL}/files/${encodeURIComponent(activeFile.path)}`, {
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

