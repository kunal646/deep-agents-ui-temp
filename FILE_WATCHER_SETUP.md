# File Watcher Setup Guide

This guide explains the real-time file watching system using WebSocket and watchfiles.

## Overview

The file watcher system allows the frontend to receive real-time notifications when files are modified, created, or deleted on the filesystem. This enables automatic file reloading and conflict detection.

## Architecture

- **Frontend**: React hook (`useFileWatcher`) that connects to a WebSocket endpoint
- **Backend**: FastAPI WebSocket endpoint with `watchfiles.awatch()` file system monitoring (already implemented)
- **Communication**: WebSocket connection at `ws://localhost:8001/ws/files`
- **Events**: Backend broadcasts `file_created`, `file_updated`, `file_deleted` events

## Frontend Implementation

The frontend implementation is already complete:

1. **`useFileWatcher` hook** (`src/app/hooks/useFileWatcher.ts`)
   - Manages WebSocket connection
   - Handles reconnection logic
   - Provides callbacks for file change events

2. **`EditorWorkspace` component** (`src/app/components/EditorWorkspace/EditorWorkspace.tsx`)
   - Integrates the file watcher
   - Handles file change events:
     - Auto-reloads files with no unsaved changes
     - Prompts user when conflicts occur (external changes + unsaved edits)
     - Handles file deletions gracefully

## Backend Setup

✅ **Backend is already implemented!** 

Your backend (`file_api.py`) already includes:
- WebSocket endpoint at `/ws/files`
- File watcher using `watchfiles.awatch()` (faster than watchdog)
- ConnectionManager with debouncing
- Broadcasts `file_created`, `file_updated`, `file_deleted` events

### Running the Backend

```bash
python file_api.py
# or
uvicorn file_api:file_app --port 8001
```

The backend watches the `agent_data/` directory by default and broadcasts file changes to all connected WebSocket clients.

## How It Works

1. **Connection**: Frontend connects to `ws://localhost:8001/ws/files` when `EditorWorkspace` mounts
2. **File Watching**: Backend uses `watchfiles.awatch()` to monitor the `agent_data/` directory
3. **Events**: When files change, backend broadcasts events:
   - `file_updated`: File was modified
   - `file_created`: New file was created
   - `file_deleted`: File was deleted
4. **Broadcast**: Backend broadcasts events to all connected WebSocket clients with debouncing
5. **Frontend Handling**:
   - If file is open and has no unsaved changes → auto-reload
   - If file is open and has unsaved changes → prompt user
   - If file was deleted → prompt user to close tab

## Features

- ✅ **Automatic reconnection** on connection loss (up to 5 attempts)
- ✅ **Debouncing** to prevent spam from rapid file saves (backend handles this)
- ✅ **Conflict detection** for unsaved changes
- ✅ **Async file watching** using `watchfiles.awatch()` (faster than watchdog)
- ✅ **Path normalization** for cross-platform compatibility
- ✅ **Production-ready** - backend already implemented and tested

## Testing

1. Start your backend server:
   ```bash
   uvicorn main:app --host 0.0.0.0 --port 8001
   ```

2. Start the frontend:
   ```bash
   npm run dev
   ```

3. Open a file in the editor

4. Modify the file externally (using another editor or command line)

5. The file should auto-reload if you have no unsaved changes, or prompt you if you do

## Troubleshooting

### WebSocket Connection Fails

- Check that backend is running on port 8001
- Verify WebSocket endpoint is accessible: `ws://localhost:8001/ws/files`
- Check browser console for connection errors

### Files Not Updating

- Verify `watchfiles.awatch()` is watching the correct directory (check `agent_data/` path)
- Check backend logs for file change events
- Ensure file paths match between frontend and backend (path normalization)
- Verify WebSocket connection is established (check browser console)

### Too Many Notifications

- Adjust debounce delay in `FileChangeHandler._schedule_broadcast`
- Check that debounce logic is working correctly

## Customization

### Change WebSocket URL

In `src/app/hooks/useFileWatcher.ts`:
```typescript
const WS_URL = 'ws://localhost:8001/ws/files';
```

### Change Debounce Delay

In backend `FileChangeHandler`:
```python
self.debounce_delay = 0.5  # 500ms
```

### Custom Watch Path

Send message from frontend:
```typescript
ws.send(JSON.stringify({
  type: "set_watch_path",
  path: "/custom/path"
}));
```

## Security Considerations

- **Path Validation**: Ensure watched paths are validated to prevent directory traversal
- **Authentication**: Add authentication to WebSocket endpoint if needed
- **Rate Limiting**: Consider rate limiting for file change events
- **Path Restrictions**: Restrict which directories can be watched

