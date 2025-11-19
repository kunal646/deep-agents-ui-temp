"use client";

import React, { useState, useMemo, useCallback, useEffect, useRef } from "react";
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
  Plus,
  Trash2,
  Edit2,
  Scissors,
  Copy,
  Clipboard,
} from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import type { TodoItem, FileItem } from "../../types/types";
import styles from "./TasksFilesSidebar.module.scss";
import { useFileWatcher, type FileChangeEvent } from "../../hooks/useFileWatcher";
import { isElectron } from "../../utils/environment";

const FILE_API_URL = 'https://agentstoryboard-production.up.railway.app/api';

// Root path is agent_workspace - this is what we show as "root" in the UI
const ROOT_PATH = '/app/agent_workspace';

// Helper function to normalize file path (ensure leading slash for backend API)
function normalizeFilePath(path: string): string {
  // Backend expects paths with leading slash (e.g., /app/agent_workspace/...)
  // Just return as-is since paths from the API already have the correct format
  return path;
}

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
    // Start at agent_workspace root - this will show agent_workspace folder and allow navigation
    const [currentPath, setCurrentPath] = useState<string>(ROOT_PATH);
    const [loadingFiles, setLoadingFiles] = useState(false);
    const [useFileSystem, setUseFileSystem] = useState(true); // Toggle between LangChain and File System
    
    // Context menu and dialog state
    const [createDialogOpen, setCreateDialogOpen] = useState(false);
    const [createType, setCreateType] = useState<'file' | 'folder'>('file');
    const [newName, setNewName] = useState('');
    const [renamingItem, setRenamingItem] = useState<FileInfo | null>(null);
    const [editingName, setEditingName] = useState<string | null>(null);
    const editingInputRef = useRef<HTMLInputElement>(null);
    
    // Drag and drop state
    const [draggedItem, setDraggedItem] = useState<FileInfo | null>(null);
    const [dragOverItem, setDragOverItem] = useState<string | null>(null);
    const [dragOverCurrentDir, setDragOverCurrentDir] = useState(false);
    const [clipboard, setClipboard] = useState<{ type: 'cut' | 'copy'; item: FileInfo } | null>(null);
    
    // Selected item for keyboard shortcuts
    const [selectedItem, setSelectedItem] = useState<string | null>(null);

    // Expanded folders state for tree view
    const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
    const [folderContents, setFolderContents] = useState<Map<string, FileInfo[]>>(new Map());
    const [loadingFolders, setLoadingFolders] = useState<Set<string>>(new Set());
    
    // Refs for debouncing and managing file operations
    const fileOperationInProgressRef = useRef(false);
    const reloadDebounceTimerRef = useRef<NodeJS.Timeout | null>(null);

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
    const loadFiles = useCallback(async (path: string, immediate: boolean = false) => {
      // If not immediate and a reload is already scheduled, don't do anything
      if (!immediate && reloadDebounceTimerRef.current) {
        return;
      }
      
      setLoadingFiles(true);
      try {
        console.log('[loadFiles] Requested path:', path);
        
        // Query the API with the requested path - API returns immediate children only
        const response = await fetch(`${FILE_API_URL}/files?path=${encodeURIComponent(path)}`);
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        const data = await response.json();
        const files = data.files || [];
        
        console.log('[loadFiles] Files received from API:', files.length);
        
        // Use the API response directly - it already contains immediate children only
        setFileSystemFiles(files);
      } catch (error) {
        console.error('Error loading files:', error);
        setFileSystemFiles([]);
      } finally {
        setLoadingFiles(false);
      }
    }, []);
    
    // Debounced reload function to batch multiple file change events
    const debouncedReload = useCallback((path: string) => {
      // Clear any existing timer
      if (reloadDebounceTimerRef.current) {
        clearTimeout(reloadDebounceTimerRef.current);
      }
      
      // Set a new timer to reload after a short delay
      reloadDebounceTimerRef.current = setTimeout(() => {
        reloadDebounceTimerRef.current = null;
        loadFiles(path, true);
      }, 300); // 300ms debounce - batches rapid events together
    }, [loadFiles]);
    
    // Load folder contents for tree view expansion
    const loadFolderContents = useCallback(async (folderPath: string) => {
      setLoadingFolders(prev => new Set(prev).add(folderPath));
      
      try {
        console.log('[loadFolderContents] Loading:', folderPath);
        const response = await fetch(`${FILE_API_URL}/files?path=${encodeURIComponent(folderPath)}`);
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        const data = await response.json();
        const files = data.files || [];
        
        console.log('[loadFolderContents] Loaded', files.length, 'items for', folderPath);
        
        setFolderContents(prev => {
          const newMap = new Map(prev);
          newMap.set(folderPath, files);
          return newMap;
        });
      } catch (error) {
        console.error('Error loading folder contents:', error);
        setFolderContents(prev => {
          const newMap = new Map(prev);
          newMap.set(folderPath, []);
          return newMap;
        });
      } finally {
        setLoadingFolders(prev => {
          const newSet = new Set(prev);
          newSet.delete(folderPath);
          return newSet;
        });
      }
    }, []);
    
    // Toggle folder expansion
    const toggleFolderExpansion = useCallback(async (folderPath: string) => {
      setExpandedFolders(prev => {
        const newSet = new Set(prev);
        if (newSet.has(folderPath)) {
          // Collapse
          newSet.delete(folderPath);
        } else {
          // Expand
          newSet.add(folderPath);
          // Load contents if not already loaded
          if (!folderContents.has(folderPath)) {
            loadFolderContents(folderPath);
          }
        }
        return newSet;
      });
    }, [folderContents, loadFolderContents]);
    
    // Refresh expanded folders after file operations
    const refreshExpandedFolders = useCallback(() => {
      // Reload all currently expanded folders
      expandedFolders.forEach(folderPath => {
        loadFolderContents(folderPath);
      });
    }, [expandedFolders, loadFolderContents]);

    // Auto-refresh sidebar when files change
    const handleFileChange = useCallback((event: FileChangeEvent) => {
      console.log('[handleFileChange] Received event:', event.type, event.path, 'Operation in progress:', fileOperationInProgressRef.current);
      
      // Only refresh if we're using file system view
      if (!useFileSystem) {
        return;
      }
      
      // If a file operation is in progress, skip this event
      // The operation will reload the files when it completes
      if (fileOperationInProgressRef.current) {
        console.log('[handleFileChange] Skipping reload - operation in progress');
        return;
      }
      
      // Use debounced reload to batch multiple rapid events together
      debouncedReload(currentPath);
    }, [useFileSystem, currentPath, debouncedReload]);

    // Set up file watcher to auto-refresh sidebar
    useFileWatcher({
      enabled: useFileSystem, // Only watch when using file system view
      onFileChanged: handleFileChange,
      onError: (error) => {
        console.error('[TasksFilesSidebar] File watcher error:', error);
      },
    });

    // Load file content from API
    const loadFileContent = useCallback(async (filePath: string) => {
      // Check if it's a media file
      if (isMediaFile(filePath)) {
        try {
          // Try to load as binary blob - check multiple endpoint patterns
          let blobUrl: string | null = null;
          
          // Approach 1: Try /raw endpoint
          try {
            const rawResponse = await fetch(`${FILE_API_URL}/files/${encodeURIComponent(normalizeFilePath(filePath))}/raw`, {
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
              const rawResponse = await fetch(`${FILE_API_URL}/files/${encodeURIComponent(normalizeFilePath(filePath))}?raw=true`, {
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
              const response = await fetch(`${FILE_API_URL}/files/${encodeURIComponent(normalizeFilePath(filePath))}`, {
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
        const response = await fetch(`${FILE_API_URL}/files/${encodeURIComponent(normalizeFilePath(filePath))}`);
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
      // Use the full path from the API response directly
      setCurrentPath(path);
    }, []);

    const handleFileClick = useCallback((path: string) => {
      loadFileContent(path);
    }, [loadFileContent]);

    const handleGoUp = useCallback(() => {
      // Don't allow going above the root
      if (currentPath === ROOT_PATH || currentPath === ROOT_PATH + '/') {
        return;
      }
      const parts = currentPath.split('/').filter(p => p);
      parts.pop();
      const parentPath = parts.length > 0 ? '/' + parts.join('/') : ROOT_PATH;
      // Ensure we don't go above root
      if (parentPath.length < ROOT_PATH.length || !parentPath.startsWith(ROOT_PATH)) {
        setCurrentPath(ROOT_PATH);
      } else {
        setCurrentPath(parentPath);
      }
    }, [currentPath]);

    // Focus input when editing starts
    useEffect(() => {
      if (editingName !== null && editingInputRef.current) {
        editingInputRef.current.focus();
        editingInputRef.current.select();
      }
    }, [editingName]);
    
    // Cleanup debounce timer on unmount
    useEffect(() => {
      return () => {
        if (reloadDebounceTimerRef.current) {
          clearTimeout(reloadDebounceTimerRef.current);
        }
      };
    }, []);

    // File operations
    const createFileOrFolder = useCallback(async (name: string, type: 'file' | 'folder') => {
      if (!name.trim()) {
        alert('Please enter a name');
        return;
      }
      
      // Ensure path ends with / for proper concatenation
      const basePath = currentPath.endsWith('/') ? currentPath : currentPath + '/';
      const fullPath = basePath + name;
      
      console.log('[createFileOrFolder] Creating:', { type, name, fullPath, currentPath });
      
      // Set flag to prevent file watcher from triggering reloads during this operation
      fileOperationInProgressRef.current = true;
      
      try {
        const endpoint = type === 'file' ? 'file' : 'folder';
        const requestBody = { 
          path: fullPath,
          content: '' // API requires content field even for empty files/folders
        };
        
        console.log('[createFileOrFolder] Request:', {
          url: `${FILE_API_URL}/files/${endpoint}`,
          body: requestBody
        });
        
        const response = await fetch(`${FILE_API_URL}/files/${endpoint}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(requestBody),
        });

        console.log('[createFileOrFolder] Response status:', response.status, response.statusText);
        
        const responseData = await response.json().catch(() => null);
        console.log('[createFileOrFolder] Response data:', responseData);

        if (!response.ok) {
          const errorMessage = responseData?.detail 
            ? (Array.isArray(responseData.detail) 
                ? responseData.detail.map((e: any) => e.msg || JSON.stringify(e)).join(', ')
                : responseData.detail)
            : `HTTP ${response.status}: ${response.statusText}`;
          throw new Error(errorMessage);
        }

        console.log('[createFileOrFolder] Success, reloading files...');
        
        // Wait a bit for the file system to settle before reloading
        await new Promise(resolve => setTimeout(resolve, 100));
        await loadFiles(currentPath, true);
        refreshExpandedFolders();
        
        // Only close dialog on success
        setCreateDialogOpen(false);
        setNewName('');
        
        // If it's a file, open it for editing
        // The API might store files with a different path format, so we need to find it
        if (type === 'file') {
          setTimeout(async () => {
            // Reload files to get the updated list with the new file
            const reloadResponse = await fetch(`${FILE_API_URL}/files?path=${encodeURIComponent(currentPath)}`);
            if (reloadResponse.ok) {
              const reloadData = await reloadResponse.json();
              const files = reloadData.files || [];
              // Find the file we just created by matching the name
              const createdFile = files.find((f: FileInfo) => {
                const fileName = f.path.split('/').pop();
                return fileName === name && !f.is_dir;
              });
              if (createdFile) {
                console.log('[createFileOrFolder] Found created file, opening:', createdFile.path);
                loadFileContent(createdFile.path);
              } else {
                console.warn('[createFileOrFolder] Created file not found in listing, trying original path:', fullPath);
                // Fallback: try the original path
                loadFileContent(fullPath);
              }
            } else {
              // If reload fails, just try the original path
              console.warn('[createFileOrFolder] Failed to reload files, trying original path:', fullPath);
              loadFileContent(fullPath);
            }
          }, 200);
        }
      } catch (error: any) {
        console.error('[createFileOrFolder] Error:', error);
        const errorMessage = error?.message || 'Unknown error occurred';
        alert(`Error creating ${type}: ${errorMessage}`);
        // Keep dialog open on error so user can retry
      } finally {
        // Clear flag after a short delay to ensure all file watcher events have been processed
        setTimeout(() => {
          fileOperationInProgressRef.current = false;
        }, 500);
      }
    }, [currentPath, loadFiles, loadFileContent, refreshExpandedFolders]);

    const deleteFileOrFolder = useCallback(async (item: FileInfo) => {
      if (!confirm(`Are you sure you want to delete ${item.is_dir ? 'folder' : 'file'} "${item.path.split('/').pop()}"?`)) {
        return;
      }

      // Set flag to prevent file watcher from triggering reloads during this operation
      fileOperationInProgressRef.current = true;

      try {
        // Send path as-is (don't remove leading slash) - backend expects /app/agent_workspace prefix
        const response = await fetch(`${FILE_API_URL}/files/${encodeURIComponent(item.path)}`, {
          method: 'DELETE',
        });

        if (!response.ok) {
          const error = await response.json().catch(() => ({ detail: 'Failed to delete' }));
          const errorMessage = typeof error.detail === 'string' 
            ? error.detail 
            : JSON.stringify(error.detail || error);
          throw new Error(errorMessage || 'Failed to delete');
        }

        // Wait a bit for the file system to settle before reloading
        await new Promise(resolve => setTimeout(resolve, 100));
        await loadFiles(currentPath, true);
        refreshExpandedFolders();
      } catch (error: any) {
        console.error('Error deleting:', error);
        alert(`Error deleting: ${error.message}`);
      } finally {
        // Clear flag after a short delay to ensure all file watcher events have been processed
        setTimeout(() => {
          fileOperationInProgressRef.current = false;
        }, 500);
      }
    }, [currentPath, loadFiles, refreshExpandedFolders]);

    const renameFileOrFolder = useCallback(async (item: FileInfo, newName: string) => {
      if (!newName.trim() || newName === item.path.split('/').pop()) {
        setEditingName(null);
        return;
      }

      const oldPath = item.path;
      const parentPath = oldPath.substring(0, oldPath.lastIndexOf('/') + 1) || '/';
      const newPath = parentPath === '/' ? `/${newName}` : `${parentPath}${newName}`;

      // Set flag to prevent file watcher from triggering reloads during this operation
      fileOperationInProgressRef.current = true;

      try {
        const response = await fetch(`${FILE_API_URL}/files/rename`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            old_path: oldPath,
            new_path: newPath 
          }),
        });

        if (!response.ok) {
          const error = await response.json().catch(() => ({ detail: 'Failed to rename' }));
          throw new Error(error.detail || 'Failed to rename');
        }

        // Wait a bit for the file system to settle before reloading
        await new Promise(resolve => setTimeout(resolve, 100));
        await loadFiles(currentPath, true);
        refreshExpandedFolders();
        setEditingName(null);
      } catch (error: any) {
        console.error('Error renaming:', error);
        alert(`Error renaming: ${error.message}`);
        setEditingName(null);
      } finally {
        // Clear flag after a short delay to ensure all file watcher events have been processed
        setTimeout(() => {
          fileOperationInProgressRef.current = false;
        }, 500);
      }
    }, [currentPath, loadFiles, refreshExpandedFolders]);

    const moveFileOrFolder = useCallback(async (item: FileInfo, destinationPath: string) => {
      // Set flag to prevent file watcher from triggering reloads during this operation
      fileOperationInProgressRef.current = true;
      
      try {
        const response = await fetch(`${FILE_API_URL}/files/move`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            source_path: item.path,
            destination_path: destinationPath
          }),
        });

        if (!response.ok) {
          const error = await response.json().catch(() => ({ detail: 'Failed to move' }));
          const errorMessage = typeof error.detail === 'string' 
            ? error.detail 
            : JSON.stringify(error.detail || error);
          throw new Error(errorMessage || 'Failed to move');
        }

        // Wait a bit for the file system to settle before reloading
        await new Promise(resolve => setTimeout(resolve, 100));
        await loadFiles(currentPath, true);
        refreshExpandedFolders();
        setClipboard(null);
      } catch (error: any) {
        console.error('Error moving:', error);
        alert(`Error moving: ${error.message}`);
        setClipboard(null);
      } finally {
        // Clear flag after a short delay to ensure all file watcher events have been processed
        setTimeout(() => {
          fileOperationInProgressRef.current = false;
        }, 500);
      }
    }, [currentPath, loadFiles, refreshExpandedFolders]);

    const copyFileOrFolder = useCallback(async (item: FileInfo, destinationPath: string) => {
      // Set flag to prevent file watcher from triggering reloads during this operation
      fileOperationInProgressRef.current = true;
      
      try {
        const response = await fetch(`${FILE_API_URL}/files/copy`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            source_path: item.path,
            destination_path: destinationPath
          }),
        });

        if (!response.ok) {
          const error = await response.json().catch(() => ({ detail: 'Failed to copy' }));
          const errorMessage = typeof error.detail === 'string' 
            ? error.detail 
            : JSON.stringify(error.detail || error);
          throw new Error(errorMessage || 'Failed to copy');
        }

        // Wait a bit for the file system to settle before reloading
        await new Promise(resolve => setTimeout(resolve, 100));
        await loadFiles(currentPath, true);
        refreshExpandedFolders();
        setClipboard(null);
      } catch (error: any) {
        console.error('Error copying:', error);
        alert(`Error copying: ${error.message}`);
        setClipboard(null);
      } finally {
        // Clear flag after a short delay to ensure all file watcher events have been processed
        setTimeout(() => {
          fileOperationInProgressRef.current = false;
        }, 500);
      }
    }, [currentPath, loadFiles, refreshExpandedFolders]);

    const handlePaste = useCallback(async (destinationPath: string) => {
      if (!clipboard) return;

      const destination = destinationPath || currentPath;
      const fileName = clipboard.item.path.split('/').filter(p => p).pop() || '';
      const newPath = destination === '/' 
        ? `/${fileName}` 
        : `${destination}/${fileName}`;

      if (clipboard.type === 'cut') {
        await moveFileOrFolder(clipboard.item, newPath);
      } else {
        await copyFileOrFolder(clipboard.item, newPath);
      }
    }, [clipboard, currentPath, moveFileOrFolder, copyFileOrFolder]);

    const handleStartRename = useCallback((item: FileInfo) => {
      const currentName = item.path.split('/').filter(p => p).pop() || '';
      setEditingName(item.path);
      setRenamingItem(item);
    }, []);

    const handleRenameSubmit = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter' && renamingItem && editingName) {
        const newName = editingInputRef.current?.value || '';
        renameFileOrFolder(renamingItem, newName);
      } else if (e.key === 'Escape') {
        setEditingName(null);
        setRenamingItem(null);
      }
    }, [renamingItem, editingName, renameFileOrFolder]);

    const handleBlurRename = useCallback(() => {
      if (renamingItem && editingInputRef.current) {
        const newName = editingInputRef.current.value;
        renameFileOrFolder(renamingItem, newName);
      }
    }, [renamingItem, renameFileOrFolder]);

    // Drag and drop handlers
    const handleDragStart = useCallback((e: React.DragEvent, item: FileInfo) => {
      setDraggedItem(item);
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', item.path);
    }, []);

    const handleDragOver = useCallback((e: React.DragEvent, itemPath: string) => {
      e.preventDefault();
      e.stopPropagation();
      e.dataTransfer.dropEffect = 'move';
      setDragOverItem(itemPath);
    }, []);

    const handleDragLeave = useCallback(() => {
      setDragOverItem(null);
    }, []);

    const handleDrop = useCallback(async (e: React.DragEvent, destinationItem: FileInfo) => {
      e.preventDefault();
      e.stopPropagation();
      
      if (!draggedItem) return;
      
      // Don't allow dropping on itself
      if (draggedItem.path === destinationItem.path) {
        setDraggedItem(null);
        setDragOverItem(null);
        return;
      }

      // Only allow dropping on folders
      if (!destinationItem.is_dir) {
        setDraggedItem(null);
        setDragOverItem(null);
        return;
      }

      const destinationPath = destinationItem.path;
      const fileName = draggedItem.path.split('/').filter(p => p).pop() || '';
      const newPath = destinationPath === '/' 
        ? `/${fileName}` 
        : `${destinationPath}/${fileName}`;

      await moveFileOrFolder(draggedItem, newPath);
      
      setDraggedItem(null);
      setDragOverItem(null);
    }, [draggedItem, moveFileOrFolder]);

    const handleDragEnd = useCallback(() => {
      setDraggedItem(null);
      setDragOverItem(null);
      setDragOverCurrentDir(false);
    }, []);
    
    // Handle drag over current directory (background/empty space)
    const handleDragOverBackground = useCallback((e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (draggedItem) {
        e.dataTransfer.dropEffect = 'move';
        setDragOverCurrentDir(true);
      }
    }, [draggedItem]);
    
    // Handle drag leave from current directory
    const handleDragLeaveBackground = useCallback((e: React.DragEvent) => {
      // Only clear if we're leaving the container entirely
      const target = e.currentTarget as HTMLElement;
      const relatedTarget = e.relatedTarget as Node | null;
      
      if (!relatedTarget || !target.contains(relatedTarget)) {
        setDragOverCurrentDir(false);
      }
    }, []);
    
    // Handle drop on current directory (background/empty space)
    const handleDropOnBackground = useCallback(async (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      
      setDragOverCurrentDir(false);
      
      if (!draggedItem) return;
      
      // Get the parent directory of the dragged item
      const draggedParentPath = draggedItem.path.substring(0, draggedItem.path.lastIndexOf('/')) || ROOT_PATH;
      
      // Don't move if already in the current directory
      if (draggedParentPath === currentPath) {
        setDraggedItem(null);
        setDragOverItem(null);
        return;
      }
      
      // Move to current directory
      const fileName = draggedItem.path.split('/').filter(p => p).pop() || '';
      const newPath = currentPath === '/' 
        ? `/${fileName}` 
        : `${currentPath}/${fileName}`;
      
      await moveFileOrFolder(draggedItem, newPath);
      
      setDraggedItem(null);
      setDragOverItem(null);
    }, [draggedItem, currentPath, moveFileOrFolder]);

    // Keyboard shortcuts
    useEffect(() => {
      const handleKeyDown = (e: KeyboardEvent) => {
        if (!useFileSystem || !selectedItem) return;
        
        const item = fileSystemFiles.find(f => f.path === selectedItem);
        if (!item) return;

        // Delete key
        if (e.key === 'Delete' && !editingName) {
          e.preventDefault();
          deleteFileOrFolder(item);
        }
        
        // F2 to rename
        if (e.key === 'F2' && !editingName) {
          e.preventDefault();
          handleStartRename(item);
        }
      };

      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
    }, [selectedItem, fileSystemFiles, useFileSystem, editingName, deleteFileOrFolder, handleStartRename]);
    
    // Recursive file tree renderer
    const renderFileItem = useCallback((file: FileInfo, depth: number = 0): React.ReactNode => {
      const fileName = file.path.split('/').filter(p => p).pop() || file.path;
      const isDragging = draggedItem?.path === file.path;
      const isDragOver = dragOverItem === file.path;
      const isSelected = selectedItem === file.path;
      const isExpanded = expandedFolders.has(file.path);
      const isLoadingFolder = loadingFolders.has(file.path);
      const children = file.is_dir ? folderContents.get(file.path) : undefined;
      
      return (
        <React.Fragment key={file.path}>
          <ContextMenu>
            <ContextMenuTrigger asChild>
              <div
                className={`${styles.fileItem} ${isDragging ? styles.dragging : ''} ${isDragOver && file.is_dir ? styles.dragOver : ''} ${isSelected ? styles.selected : ''}`}
                style={{ paddingLeft: `${depth * 16 + 8}px` }}
                draggable={true}
                onDragStart={(e) => handleDragStart(e, file)}
                onDragOver={(e) => {
                  if (file.is_dir) {
                    handleDragOver(e, file.path);
                  }
                }}
                onDragLeave={handleDragLeave}
                onDrop={(e) => handleDrop(e, file)}
                onDragEnd={handleDragEnd}
                onClick={() => {
                  setSelectedItem(file.path);
                }}
              >
                <div className={styles.fileRow}>
                  {file.is_dir && (
                    <button
                      className={styles.chevronButton}
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleFolderExpansion(file.path);
                      }}
                    >
                      {isLoadingFolder ? (
                        <RefreshCw size={14} className={styles.spinning} />
                      ) : isExpanded ? (
                        <ChevronRight size={14} style={{ transform: 'rotate(90deg)' }} />
                      ) : (
                        <ChevronRight size={14} />
                      )}
                    </button>
                  )}
                  {!file.is_dir && <span style={{ width: '14px', display: 'inline-block' }} />}
                  
                  <div
                    className={styles.fileContent}
                    onClick={() => {
                      if (editingName !== file.path) {
                        if (file.is_dir) {
                          // Single click on folder name does nothing, use chevron to expand
                        } else {
                          handleFileClick(file.path);
                        }
                      }
                    }}
                    onDoubleClick={() => {
                      if (file.is_dir && editingName !== file.path) {
                        handleDirectoryClick(file.path);
                      }
                    }}
                  >
                    {file.is_dir ? (
                      isExpanded ? (
                        <FolderOpen size={16} />
                      ) : (
                        <Folder size={16} />
                      )
                    ) : (
                      <FileText size={16} />
                    )}
                    {editingName === file.path ? (
                      <Input
                        ref={editingInputRef}
                        className={styles.renameInput}
                        defaultValue={fileName}
                        onKeyDown={handleRenameSubmit}
                        onBlur={handleBlurRename}
                        onClick={(e) => e.stopPropagation()}
                      />
                    ) : (
                      <span className={styles.fileName}>
                        {fileName}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </ContextMenuTrigger>
            <ContextMenuContent>
              {!file.is_dir && (
                <ContextMenuItem onClick={() => handleFileClick(file.path)}>
                  <FileText size={14} className={styles.contextMenuIcon} />
                  Open
                </ContextMenuItem>
              )}
              {file.is_dir && (
                <ContextMenuItem onClick={() => handleDirectoryClick(file.path)}>
                  <Folder size={14} className={styles.contextMenuIcon} />
                  Navigate Into
                </ContextMenuItem>
              )}
              <ContextMenuItem onClick={() => handleStartRename(file)}>
                <Edit2 size={14} className={styles.contextMenuIcon} />
                Rename
              </ContextMenuItem>
              <ContextMenuSeparator />
              <ContextMenuItem onClick={() => setClipboard({ type: 'copy', item: file })}>
                <Copy size={14} className={styles.contextMenuIcon} />
                Copy
              </ContextMenuItem>
              <ContextMenuItem onClick={() => setClipboard({ type: 'cut', item: file })}>
                <Scissors size={14} className={styles.contextMenuIcon} />
                Cut
              </ContextMenuItem>
              {clipboard && (
                <ContextMenuItem onClick={() => {
                  const destPath = file.is_dir ? file.path : currentPath;
                  handlePaste(destPath);
                }}>
                  <Clipboard size={14} className={styles.contextMenuIcon} />
                  Paste {clipboard.type === 'cut' ? '(Move)' : '(Copy)'} Here
                </ContextMenuItem>
              )}
              <ContextMenuSeparator />
              <ContextMenuItem 
                onClick={() => deleteFileOrFolder(file)}
                className={styles.dangerItem}
              >
                <Trash2 size={14} className={styles.contextMenuIcon} />
                Delete
              </ContextMenuItem>
            </ContextMenuContent>
          </ContextMenu>
          
          {/* Render children if folder is expanded */}
          {file.is_dir && isExpanded && children && children.length > 0 && (
            <>
              {children.map(child => renderFileItem(child, depth + 1))}
            </>
          )}
        </React.Fragment>
      );
    }, [
      draggedItem, dragOverItem, selectedItem, expandedFolders, loadingFolders, folderContents,
      editingName, handleDragStart, handleDragOver, handleDragLeave, handleDrop, handleDragEnd,
      handleFileClick, handleDirectoryClick, toggleFolderExpansion, handleRenameSubmit,
      handleBlurRename, handleStartRename, clipboard, currentPath, handlePaste, deleteFileOrFolder
    ]);

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
                    {currentPath !== ROOT_PATH && currentPath !== ROOT_PATH + '/' && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={handleGoUp}
                        className={styles.pathButton}
                        title="Go up"
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
                      title="Refresh"
                    >
                      <RefreshCw size={14} className={loadingFiles ? styles.spinning : ''} />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setCreateType('file');
                        setCreateDialogOpen(true);
                      }}
                      className={styles.pathButton}
                      title="New File"
                    >
                      <Plus size={14} />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setCreateType('folder');
                        setCreateDialogOpen(true);
                      }}
                      className={styles.pathButton}
                      title="New Folder"
                    >
                      <Folder size={14} />
                    </Button>
                    {clipboard && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handlePaste(currentPath)}
                        className={styles.pathButton}
                        title={`Paste ${clipboard.type === 'cut' ? '(Move)' : '(Copy)'}`}
                      >
                        <Clipboard size={14} />
                      </Button>
                    )}
                  </div>
                  <div className={styles.currentPath}>
                    {currentPath === ROOT_PATH || currentPath === ROOT_PATH + '/' 
                      ? 'agent_workspace' 
                      : currentPath.replace(ROOT_PATH + '/', 'agent_workspace/') || 'agent_workspace'}
                  </div>
                </div>
                <ScrollArea className={styles.scrollArea}>
                  {loadingFiles ? (
                    <div className={styles.emptyState}>
                      <p>Loading files...</p>
                    </div>
                  ) : fileSystemFiles.length === 0 ? (
                    <ContextMenu>
                      <ContextMenuTrigger asChild>
                        <div 
                          className={styles.emptyState}
                          onDragOver={handleDragOverBackground}
                          onDragLeave={handleDragLeaveBackground}
                          onDrop={handleDropOnBackground}
                        >
                          <p>No files found</p>
                          <p className={styles.emptyHint}>Right-click to create</p>
                        </div>
                      </ContextMenuTrigger>
                      <ContextMenuContent>
                        <ContextMenuItem onClick={() => {
                          setCreateType('file');
                          setCreateDialogOpen(true);
                        }}>
                          <Plus size={14} className={styles.contextMenuIcon} />
                          New File
                        </ContextMenuItem>
                        <ContextMenuItem onClick={() => {
                          setCreateType('folder');
                          setCreateDialogOpen(true);
                        }}>
                          <Folder size={14} className={styles.contextMenuIcon} />
                          New Folder
                        </ContextMenuItem>
                        {clipboard && (
                          <>
                            <ContextMenuSeparator />
                            <ContextMenuItem onClick={() => handlePaste(currentPath)}>
                              <Clipboard size={14} className={styles.contextMenuIcon} />
                              Paste {clipboard.type === 'cut' ? '(Move)' : '(Copy)'}
                            </ContextMenuItem>
                          </>
                        )}
                      </ContextMenuContent>
                    </ContextMenu>
                  ) : (
                    <div 
                      className={styles.fileTree}
                      onDragOver={handleDragOverBackground}
                      onDragLeave={handleDragLeaveBackground}
                      onDrop={handleDropOnBackground}
                    >
                      {fileSystemFiles.map((file) => renderFileItem(file, 0))}
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

        {/* Create File/Folder Dialog */}
        <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>New {createType === 'file' ? 'File' : 'Folder'}</DialogTitle>
              <DialogDescription>
                Enter a name for the new {createType === 'file' ? 'file' : 'folder'}
              </DialogDescription>
            </DialogHeader>
            <div style={{ padding: '1rem 0' }}>
              <Input
                placeholder={`Enter ${createType} name`}
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    createFileOrFolder(newName, createType);
                  } else if (e.key === 'Escape') {
                    setCreateDialogOpen(false);
                    setNewName('');
                  }
                }}
                autoFocus
              />
            </div>
            <DialogFooter>
              <Button 
                variant="ghost" 
                onClick={() => {
                  setCreateDialogOpen(false);
                  setNewName('');
                }}
                className="text-foreground"
              >
                Cancel
              </Button>
              <Button 
                onClick={async () => {
                  if (!newName.trim()) {
                    alert('Please enter a name');
                    return;
                  }
                  await createFileOrFolder(newName, createType);
                }}
                disabled={!newName.trim()}
                variant="default"
              >
                Create
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    );
  }
);

TasksFilesSidebar.displayName = "TasksFilesSidebar";
