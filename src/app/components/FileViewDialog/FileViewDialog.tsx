"use client";

import React, { useCallback } from "react";
import { FileText, Copy, Download } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import type { FileItem } from "../../types/types";
import styles from "./FileViewDialog.module.scss";

interface FileViewDialogProps {
  file: FileItem;
  onClose: () => void;
}

export const FileViewDialog = React.memo<FileViewDialogProps>(
  ({ file, onClose }) => {
    const handleCopy = useCallback(() => {
      if (file.content) {
        navigator.clipboard.writeText(file.content);
      }
    }, [file.content]);

    const handleDownload = useCallback(() => {
      if (file.content) {
        const blob = new Blob([file.content], { type: "text/plain" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = file.path;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }
    }, [file.content, file.path]);

    return (
      <Dialog open={true} onOpenChange={onClose}>
        <DialogContent className={styles.dialog}>
          <DialogTitle className="sr-only">{file.path}</DialogTitle>
          <div className={styles.header}>
            <div className={styles.titleSection}>
              <FileText className={styles.fileIcon} />
              <span className={styles.fileName}>{file.path}</span>
            </div>
            <div className={styles.actions}>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleCopy}
                className={styles.actionButton}
              >
                <Copy size={16} />
                Copy
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleDownload}
                className={styles.actionButton}
              >
                <Download size={16} />
                Download
              </Button>
            </div>
          </div>

          <div className={styles.contentArea}>
            {file.content ? (
              <pre className={styles.codeContent}>{file.content}</pre>
            ) : (
              <div className={styles.emptyContent}>
                <p>File is empty</p>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    );
  }
);

FileViewDialog.displayName = "FileViewDialog";
