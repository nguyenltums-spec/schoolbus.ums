import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import express from 'express';
import dotenv from 'dotenv';
import { WebSocketServer, WebSocket } from 'ws';

dotenv.config();

type SliceName =
  | 'routes'
  | 'students'
  | 'records'
  | 'sessionStates'
  | 'notifications'
  | 'sheetsConfig'
  | 'dbLogs'
  | 'accounts'
  | 'roleDefinitions';

interface ServerDbState {
  initialized: boolean;
  hasUserEdits: boolean;
  version: number;
  updatedAt: string;
  routes: unknown[];
  students: unknown[];
  records: Record<string, Record<string, unknown>>;
  sessionStates: Record<string, Record<string, unknown>>;
  notifications: unknown[];
  sheetsConfig: Record<string, unknown>;
  dbLogs: unknown[];
  accounts: unknown[];
  roleDefinitions: unknown[];
}

interface AuthedWebSocket extends WebSocket {
  isAlive?: boolean;
  clientId?: string;
}

const PORT = Number(process.env.PORT) || 3000;
const DATA_DIR = path.join(process.cwd(), 'data');
const DB_FILE = path.join(DATA_DIR, 'schoolbus_db.json');
const SERVER_BOOT_ID = crypto.randomUUID();

const ALLOWED_SLICES: Set<string> = new Set([
  'routes',
  'students',
  'records',
  'sessionStates',
  'notifications',
  'sheetsConfig',
  'dbLogs',
  'accounts',
  'roleDefinitions',
]);

function createEmptyState(): ServerDbState {
  return {
    initialized: false,
    hasUserEdits: false,
    version: 0,
    updatedAt: new Date().toISOString(),
    routes: [],
    students: [],
    records: {},
    sessionStates: {},
    notifications: [],
    sheetsConfig: {
      webhookUrl: '',
      sheetName: 'DiemDanhXeTuyen',
      autoSync: false,
    },
    dbLogs: [],
    accounts: [],
    roleDefinitions: [],
  };
}

function loadStateFromDisk(): ServerDbState {
  try {
    if (fs.existsSync(DB_FILE)) {
      const raw = fs.readFileSync(DB_FILE, 'utf-8');
      const parsed = JSON.parse(raw) as Partial<ServerDbState>;
      const base = createEmptyState();
      return {
        ...base,
        ...parsed,
        initialized: Boolean(parsed.initialized),
        hasUserEdits: Boolean(parsed.hasUserEdits),
        version: typeof parsed.version === 'number' ? parsed.version : 1,
        updatedAt: parsed.updatedAt || new Date().toISOString(),
        routes: Array.isArray(parsed.routes) ? parsed.routes : [],
        students: Array.isArray(parsed.students) ? parsed.students : [],
        records:
          parsed.records && typeof parsed.records === 'object' && !Array.isArray(parsed.records)
            ? (parsed.records as Record<string, Record<string, unknown>>)
            : {},
        sessionStates:
          parsed.sessionStates &&
          typeof parsed.sessionStates === 'object' &&
          !Array.isArray(parsed.sessionStates)
            ? (parsed.sessionStates as Record<string, Record<string, unknown>>)
            : {},
        notifications: Array.isArray(parsed.notifications) ? parsed.notifications : [],
        sheetsConfig:
          parsed.sheetsConfig && typeof parsed.sheetsConfig === 'object'
            ? (parsed.sheetsConfig as Record<string, unknown>)
            : base.sheetsConfig,
        dbLogs: Array.isArray(parsed.dbLogs) ? parsed.dbLogs : [],
        accounts: Array.isArray(parsed.accounts) ? parsed.accounts : [],
        roleDefinitions: Array.isArray(parsed.roleDefinitions) ? parsed.roleDefinitions : [],
      };
    }
  } catch (err) {
    console.error('[SchoolBus Server] Failed to read DB file:', err);
  }
  return createEmptyState();
}

const BACKUPS_DIR = path.join(DATA_DIR, 'backups');

function persistStateToDisk(state: ServerDbState): void {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    const tmpFile = `${DB_FILE}.tmp`;
    fs.writeFileSync(tmpFile, JSON.stringify(state, null, 2), 'utf-8');
    fs.renameSync(tmpFile, DB_FILE);
  } catch (err) {
    console.error('[SchoolBus Server] Failed to write DB file:', err);
  }
}

function createRollingBackup(state: ServerDbState, reason: string): void {
  try {
    if (!state.initialized || (state.students.length === 0 && state.routes.length <= 1)) {
      return;
    }
    if (!fs.existsSync(BACKUPS_DIR)) {
      fs.mkdirSync(BACKUPS_DIR, { recursive: true });
    }
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const safeReason = reason.replace(/[^a-zA-Z0-9_-]/g, '');
    const fileName = `backup_${stamp}_r${state.routes.length}_s${state.students.length}_${safeReason}.json`;
    const filePath = path.join(BACKUPS_DIR, fileName);
    fs.writeFileSync(filePath, JSON.stringify(state, null, 2), 'utf-8');

    const files = fs
      .readdirSync(BACKUPS_DIR)
      .filter((f) => f.endsWith('.json'))
      .sort()
      .reverse();
    files.slice(12).forEach((oldFile) => {
      try {
        fs.unlinkSync(path.join(BACKUPS_DIR, oldFile));
      } catch {
        // Ignore cleanup failure
      }
    });
  } catch (err) {
    console.error('[SchoolBus Server] Failed to write rolling backup:', err);
  }
}

let dbState: ServerDbState = loadStateFromDisk();

function hasOperationalDataset(state: ServerDbState): boolean {
  return (
    state.hasUserEdits ||
    state.students.length > 0 ||
    state.routes.length > 1 ||
    state.dbLogs.length > 0
  );
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '15mb' }));

  const httpServer = http.createServer(app);
  const wss = new WebSocketServer({ noServer: true });

  const broadcastEvent = (
    payload: Record<string, unknown>,
    excludeClientId?: string
  ) => {
    const serialized = JSON.stringify({
      bootId: SERVER_BOOT_ID,
      version: dbState.version,
      updatedAt: dbState.updatedAt,
      ...payload,
    });

    wss.clients.forEach((client) => {
      const wsClient = client as AuthedWebSocket;
      if (wsClient.readyState !== WebSocket.OPEN) return;
      if (excludeClientId && wsClient.clientId === excludeClientId) return;
      try {
        wsClient.send(serialized);
      } catch {
        // Ignore broken socket send; heartbeat will clean up
      }
    });
  };

  httpServer.on('upgrade', (request, socket, head) => {
    const reqUrl = request.url || '';
    if (!reqUrl.startsWith('/ws')) {
      return;
    }

    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit('connection', ws, request);
    });
  });

  wss.on('connection', (ws: AuthedWebSocket, req) => {
    ws.isAlive = true;
    try {
      const parsed = new URL(req.url || '/ws', 'http://localhost');
      ws.clientId = parsed.searchParams.get('clientId') || undefined;
    } catch {
      ws.clientId = undefined;
    }

    ws.on('pong', () => {
      ws.isAlive = true;
    });

    ws.on('message', (raw) => {
      try {
        const msg = JSON.parse(raw.toString()) as { type?: string };
        if (msg.type === 'ping') {
          ws.isAlive = true;
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(
              JSON.stringify({
                type: 'pong',
                bootId: SERVER_BOOT_ID,
                version: dbState.version,
              })
            );
          }
        } else if (msg.type === 'request_sync' && dbState.initialized) {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(
              JSON.stringify({
                type: 'state:full',
                bootId: SERVER_BOOT_ID,
                version: dbState.version,
                updatedAt: dbState.updatedAt,
                state: dbState,
              })
            );
          }
        }
      } catch {
        // Ignore malformed client frames
      }
    });

    // Push current authoritative state immediately on WebSocket connection
    if (dbState.initialized && ws.readyState === WebSocket.OPEN) {
      ws.send(
        JSON.stringify({
          type: 'state:full',
          bootId: SERVER_BOOT_ID,
          version: dbState.version,
          updatedAt: dbState.updatedAt,
          state: dbState,
        })
      );
    }
  });

  const heartbeatInterval = setInterval(() => {
    wss.clients.forEach((client) => {
      const wsClient = client as AuthedWebSocket;
      if (wsClient.isAlive === false) {
        wsClient.terminate();
        return;
      }
      wsClient.isAlive = false;
      try {
        wsClient.ping();
      } catch {
        wsClient.terminate();
      }
    });
  }, 25000);

  wss.on('close', () => {
    clearInterval(heartbeatInterval);
  });

  // Disable HTTP caching for API routes so mobile/desktop browsers always receive fresh state
  app.use('/api', (_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    next();
  });

  app.get('/api/health', (_req, res) => {
    res.json({
      ok: true,
      bootId: SERVER_BOOT_ID,
      initialized: dbState.initialized,
      version: dbState.version,
      updatedAt: dbState.updatedAt,
      connectedClients: wss.clients.size,
    });
  });

  // Fetch full shared state (supports ?sinceVersion=N&bootId=ID)
  app.get('/api/state', (req, res) => {
    const sinceParam = req.query.sinceVersion;
    const bootIdParam = typeof req.query.bootId === 'string' ? req.query.bootId : '';
    const sinceVersion =
      typeof sinceParam === 'string' && sinceParam !== '' ? Number(sinceParam) : NaN;

    // Only skip payload when client is on the exact same server boot AND exact same version
    if (
      dbState.initialized &&
      bootIdParam === SERVER_BOOT_ID &&
      Number.isFinite(sinceVersion) &&
      sinceVersion === dbState.version
    ) {
      res.json({
        changed: false,
        bootId: SERVER_BOOT_ID,
        version: dbState.version,
        updatedAt: dbState.updatedAt,
      });
      return;
    }

    res.json({
      changed: true,
      bootId: SERVER_BOOT_ID,
      state: dbState,
    });
  });

  // Bootstrap server state from first connected client (or promote custom PC localStorage over unmodified seed)
  app.post('/api/state/bootstrap', (req, res) => {
    const originClientId = req.header('x-client-id') || undefined;
    const body = req.body as Partial<ServerDbState> & {
      hasLocalCustomization?: boolean;
      forceIfUnedited?: boolean;
    };

    const incomingRoutes = Array.isArray(body.routes) ? body.routes : [];
    const incomingStudents = Array.isArray(body.students) ? body.students : [];
    const incomingHasRealData =
      Boolean(body.hasLocalCustomization) ||
      incomingStudents.length > 0 ||
      incomingRoutes.length > 1;

    const serverHasNoRealData = !hasOperationalDataset(dbState);

    const canBootstrap =
      !dbState.initialized ||
      (Boolean(body.forceIfUnedited) && serverHasNoRealData && incomingHasRealData);

    if (!canBootstrap) {
      res.json({
        bootstrapped: false,
        bootId: SERVER_BOOT_ID,
        state: dbState,
      });
      return;
    }

    const base = createEmptyState();
    dbState = {
      initialized: true,
      hasUserEdits: incomingHasRealData,
      version: Math.max(dbState.version + 1, 1),
      updatedAt: new Date().toISOString(),
      routes: incomingRoutes.length > 0 ? incomingRoutes : base.routes,
      students: incomingStudents,
      records:
        body.records && typeof body.records === 'object' && !Array.isArray(body.records)
          ? (body.records as Record<string, Record<string, unknown>>)
          : {},
      sessionStates:
        body.sessionStates &&
        typeof body.sessionStates === 'object' &&
        !Array.isArray(body.sessionStates)
          ? (body.sessionStates as Record<string, Record<string, unknown>>)
          : {},
      notifications: Array.isArray(body.notifications) ? body.notifications : [],
      sheetsConfig:
        body.sheetsConfig && typeof body.sheetsConfig === 'object'
          ? (body.sheetsConfig as Record<string, unknown>)
          : base.sheetsConfig,
      dbLogs: Array.isArray(body.dbLogs) ? body.dbLogs : [],
      accounts: Array.isArray(body.accounts) ? body.accounts : [],
      roleDefinitions: Array.isArray(body.roleDefinitions) ? body.roleDefinitions : [],
    };

    persistStateToDisk(dbState);
    broadcastEvent({ type: 'state:full', state: dbState }, originClientId);

    res.json({
      bootstrapped: true,
      bootId: SERVER_BOOT_ID,
      state: dbState,
    });
  });

  // Replace a single state slice atomically
  app.put('/api/state/slice', (req, res) => {
    const originClientId = req.header('x-client-id') || undefined;
    const { slice, data } = req.body as { slice?: string; data?: unknown };
    if (!slice || !ALLOWED_SLICES.has(slice) || data === undefined) {
      res.status(400).json({ error: 'Invalid slice or missing data' });
      return;
    }

    const sliceKey = slice as SliceName;
    if (sliceKey === 'routes' || sliceKey === 'students' || sliceKey === 'accounts') {
      createRollingBackup(dbState, `before-${sliceKey}`);
    }

    dbState = {
      ...dbState,
      initialized: true,
      hasUserEdits: true,
      version: dbState.version + 1,
      updatedAt: new Date().toISOString(),
      [sliceKey]: data,
    } as ServerDbState;

    persistStateToDisk(dbState);
    broadcastEvent({ type: 'state:slice', slice: sliceKey, data }, originClientId);

    res.json({
      ok: true,
      bootId: SERVER_BOOT_ID,
      version: dbState.version,
      updatedAt: dbState.updatedAt,
    });
  });

  // Atomically update only lastLoginAt for a logged-in account (without overwriting other fields or locking bootstrap)
  app.post('/api/auth/login-stamp', (req, res) => {
    const originClientId = req.header('x-client-id') || undefined;
    const { accountId, lastLoginAt } = req.body as {
      accountId?: string;
      lastLoginAt?: string;
    };
    if (!accountId) {
      res.status(400).json({ error: 'Missing accountId' });
      return;
    }

    if (Array.isArray(dbState.accounts) && dbState.accounts.length > 0) {
      const nextAccounts = dbState.accounts.map((acc) => {
        if (acc && typeof acc === 'object' && (acc as { id?: string }).id === accountId) {
          return {
            ...(acc as Record<string, unknown>),
            lastLoginAt: lastLoginAt || new Date().toISOString(),
          };
        }
        return acc;
      });
      dbState = {
        ...dbState,
        version: dbState.version + 1,
        updatedAt: new Date().toISOString(),
        accounts: nextAccounts,
      };
      persistStateToDisk(dbState);
      broadcastEvent(
        { type: 'state:slice', slice: 'accounts', data: nextAccounts },
        originClientId
      );
    }

    res.json({
      ok: true,
      bootId: SERVER_BOOT_ID,
      version: dbState.version,
    });
  });

  // Atomically patch student attendance records (prevents concurrent multi-device overwrites)
  app.patch('/api/state/records', (req, res) => {
    const originClientId = req.header('x-client-id') || undefined;
    const { updates, deleteIds } = req.body as {
      updates?: Record<string, Record<string, unknown>>;
      deleteIds?: string[];
    };

    const nextRecords: Record<string, Record<string, unknown>> = { ...dbState.records };

    if (updates && typeof updates === 'object') {
      for (const [studentId, patch] of Object.entries(updates)) {
        if (!patch || typeof patch !== 'object') continue;
        const existing = nextRecords[studentId] || { studentId };
        const merged: Record<string, unknown> = { ...existing };
        for (const [k, v] of Object.entries(patch)) {
          if (v === null || v === undefined) {
            delete merged[k];
          } else {
            merged[k] = v;
          }
        }
        nextRecords[studentId] = merged;
      }
    }

    if (Array.isArray(deleteIds)) {
      for (const id of deleteIds) {
        delete nextRecords[id];
      }
    }

    dbState = {
      ...dbState,
      initialized: true,
      hasUserEdits: true,
      version: dbState.version + 1,
      updatedAt: new Date().toISOString(),
      records: nextRecords,
    };

    persistStateToDisk(dbState);
    broadcastEvent(
      {
        type: 'state:records',
        updates: updates || {},
        deleteIds: deleteIds || [],
        records: dbState.records,
      },
      originClientId
    );

    res.json({
      ok: true,
      bootId: SERVER_BOOT_ID,
      version: dbState.version,
      updatedAt: dbState.updatedAt,
      records: dbState.records,
    });
  });

  // Atomically patch a route's session state
  app.patch('/api/state/sessions', (req, res) => {
    const originClientId = req.header('x-client-id') || undefined;
    const { routeId, updates, deleteRouteId } = req.body as {
      routeId?: string;
      updates?: Record<string, unknown>;
      deleteRouteId?: string;
    };

    const nextSessions: Record<string, Record<string, unknown>> = { ...dbState.sessionStates };

    if (routeId && updates && typeof updates === 'object') {
      const existing = nextSessions[routeId] || { routeId };
      const merged: Record<string, unknown> = { ...existing };
      for (const [k, v] of Object.entries(updates)) {
        if (v === null || v === undefined) {
          delete merged[k];
        } else {
          merged[k] = v;
        }
      }
      nextSessions[routeId] = merged;
    }

    if (deleteRouteId) {
      delete nextSessions[deleteRouteId];
    }

    dbState = {
      ...dbState,
      initialized: true,
      hasUserEdits: true,
      version: dbState.version + 1,
      updatedAt: new Date().toISOString(),
      sessionStates: nextSessions,
    };

    persistStateToDisk(dbState);
    broadcastEvent(
      {
        type: 'state:sessions',
        sessionStates: dbState.sessionStates,
      },
      originClientId
    );

    res.json({
      ok: true,
      bootId: SERVER_BOOT_ID,
      version: dbState.version,
      updatedAt: dbState.updatedAt,
      sessionStates: dbState.sessionStates,
    });
  });

  // Atomically prepend a notification or DB log entry
  app.post('/api/state/append', (req, res) => {
    const originClientId = req.header('x-client-id') || undefined;
    const { slice, item, maxItems } = req.body as {
      slice?: 'notifications' | 'dbLogs';
      item?: unknown;
      maxItems?: number;
    };

    if ((slice !== 'notifications' && slice !== 'dbLogs') || !item) {
      res.status(400).json({ error: 'Invalid append payload' });
      return;
    }

    const effectiveMaxItems =
      typeof maxItems === 'number' && maxItems > 0
        ? maxItems
        : slice === 'dbLogs'
        ? 2000
        : 100;

    const currentList = Array.isArray(dbState[slice]) ? dbState[slice] : [];
    const itemId =
      item && typeof item === 'object' ? (item as { id?: string }).id : undefined;
    const deduped = itemId
      ? currentList.filter((existing) => (existing as { id?: string })?.id !== itemId)
      : currentList;
    const nextList = [item, ...deduped].slice(0, effectiveMaxItems);

    dbState = {
      ...dbState,
      initialized: true,
      hasUserEdits: true,
      version: dbState.version + 1,
      updatedAt: new Date().toISOString(),
      [slice]: nextList,
    } as ServerDbState;

    persistStateToDisk(dbState);
    broadcastEvent({ type: 'state:slice', slice, data: nextList }, originClientId);

    res.json({
      ok: true,
      bootId: SERVER_BOOT_ID,
      version: dbState.version,
      updatedAt: dbState.updatedAt,
      items: nextList,
    });
  });

  // Atomically import/restore a complete system snapshot (syncs all routes/students/records/accounts immediately)
  app.post('/api/state/import-full', (req, res) => {
    const originClientId = req.header('x-client-id') || undefined;
    const body = req.body as Partial<ServerDbState>;
    const base = createEmptyState();

    createRollingBackup(dbState, 'before-import');
    dbState = {
      initialized: true,
      hasUserEdits: true,
      version: Math.max(dbState.version + 1, 1),
      updatedAt: new Date().toISOString(),
      routes: Array.isArray(body.routes) && body.routes.length > 0 ? body.routes : dbState.routes,
      students: Array.isArray(body.students) ? body.students : dbState.students,
      records:
        body.records && typeof body.records === 'object' && !Array.isArray(body.records)
          ? (body.records as Record<string, Record<string, unknown>>)
          : dbState.records,
      sessionStates:
        body.sessionStates &&
        typeof body.sessionStates === 'object' &&
        !Array.isArray(body.sessionStates)
          ? (body.sessionStates as Record<string, Record<string, unknown>>)
          : dbState.sessionStates,
      notifications: Array.isArray(body.notifications)
        ? body.notifications
        : dbState.notifications,
      sheetsConfig:
        body.sheetsConfig && typeof body.sheetsConfig === 'object'
          ? (body.sheetsConfig as Record<string, unknown>)
          : base.sheetsConfig,
      dbLogs: Array.isArray(body.dbLogs) ? body.dbLogs : dbState.dbLogs,
      accounts:
        Array.isArray(body.accounts) && body.accounts.length > 0
          ? body.accounts
          : dbState.accounts,
      roleDefinitions:
        Array.isArray(body.roleDefinitions) && body.roleDefinitions.length > 0
          ? body.roleDefinitions
          : dbState.roleDefinitions,
    };

    persistStateToDisk(dbState);
    broadcastEvent({ type: 'state:full', state: dbState }, originClientId);

    res.json({
      ok: true,
      bootId: SERVER_BOOT_ID,
      state: dbState,
    });
  });

  // List available rolling backup snapshots
  app.get('/api/state/backups', (_req, res) => {
    try {
      if (!fs.existsSync(BACKUPS_DIR)) {
        res.json({ backups: [] });
        return;
      }
      const files = fs
        .readdirSync(BACKUPS_DIR)
        .filter((f) => f.endsWith('.json'))
        .sort()
        .reverse();
      const backups = files.map((fileName) => {
        const stat = fs.statSync(path.join(BACKUPS_DIR, fileName));
        const match = fileName.match(/_r(\d+)_s(\d+)_([^.]+)\.json$/);
        return {
          fileName,
          createdAt: stat.mtime.toISOString(),
          routesCount: match ? Number(match[1]) : 0,
          studentsCount: match ? Number(match[2]) : 0,
          reason: match ? match[3] : 'snapshot',
        };
      });
      res.json({ backups });
    } catch {
      res.json({ backups: [] });
    }
  });

  // Restore a specific server backup snapshot
  app.post('/api/state/restore-backup', (req, res) => {
    const originClientId = req.header('x-client-id') || undefined;
    const { fileName } = req.body as { fileName?: string };
    if (!fileName || fileName.includes('..') || fileName.includes('/')) {
      res.status(400).json({ error: 'Invalid backup fileName' });
      return;
    }
    const targetPath = path.join(BACKUPS_DIR, fileName);
    if (!fs.existsSync(targetPath)) {
      res.status(404).json({ error: 'Backup not found' });
      return;
    }
    try {
      createRollingBackup(dbState, 'before-restore');
      const parsed = JSON.parse(fs.readFileSync(targetPath, 'utf-8')) as ServerDbState;
      dbState = {
        ...parsed,
        initialized: true,
        hasUserEdits: true,
        version: Math.max(dbState.version + 1, (parsed.version || 1) + 1),
        updatedAt: new Date().toISOString(),
      };
      persistStateToDisk(dbState);
      broadcastEvent({ type: 'state:full', state: dbState }, originClientId);
      res.json({ ok: true, bootId: SERVER_BOOT_ID, state: dbState });
    } catch {
      res.status(500).json({ error: 'Failed to restore backup' });
    }
  });

  // Server-side proxy to Google Apps Script Web App so real HTTP status & JSON response are captured
  app.post('/api/google-sheets/sync', async (req, res) => {
    const originClientId = req.header('x-client-id') || undefined;
    const { webhookUrl, payload, updateLastSynced = true } = req.body as {
      webhookUrl?: string;
      payload?: unknown;
      updateLastSynced?: boolean;
    };

    const trimmedUrl = typeof webhookUrl === 'string' ? webhookUrl.trim() : '';
    if (!trimmedUrl) {
      res.status(400).json({ ok: false, errorCode: 'MISSING_URL', message: 'Chưa cấu hình Google Apps Script Webhook URL.' });
      return;
    }

    let parsedUrl: URL;
    try {
      parsedUrl = new URL(trimmedUrl);
    } catch {
      res.status(400).json({ ok: false, errorCode: 'INVALID_URL', message: 'Đường dẫn Webhook URL không hợp lệ.' });
      return;
    }

    const allowedHosts = ['script.google.com', 'script.googleusercontent.com'];
    if (
      parsedUrl.protocol !== 'https:' ||
      !allowedHosts.includes(parsedUrl.hostname)
    ) {
      res.status(400).json({
        ok: false,
        errorCode: 'INVALID_HOST',
        message: 'URL phải là link Web App Google Apps Script hợp lệ (https://script.google.com/macros/s/.../exec).',
      });
      return;
    }

    try {
      const initialRes = await fetch(trimmedUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload ?? {}),
        redirect: 'manual',
      });

      const location = initialRes.headers.get('location') || '';

      if (
        initialRes.status === 401 ||
        initialRes.status === 403 ||
        location.includes('accounts.google.com')
      ) {
        res.status(200).json({
          ok: false,
          errorCode: 'AUTH_REQUIRED',
          httpStatus: initialRes.status,
          message:
            'Google Apps Script từ chối truy cập (Lỗi 401 - Chưa mở quyền công khai). Hãy mở Google Sheet → Tiện ích mở rộng → Apps Script → Triển khai (Deploy) → Quản lý các lần triển khai → Sửa (✏️) → mục "Người có quyền truy cập" chọn "Bất kỳ ai (Anyone)" rồi bấm Triển khai lại.',
        });
        return;
      }

      if (initialRes.status === 404) {
        res.status(200).json({
          ok: false,
          errorCode: 'NOT_FOUND',
          httpStatus: 404,
          message:
            'Không tìm thấy Web App URL (Lỗi 404). Hãy kiểm tra lại xem đã copy đúng URL kết thúc bằng /exec hay chưa.',
        });
        return;
      }

      let finalRes = initialRes;
      if (initialRes.status >= 300 && initialRes.status < 400 && location) {
        finalRes = await fetch(location, {
          method: 'GET',
          redirect: 'follow',
        });
      }

      const rawText = await finalRes.text();

      if (
        finalRes.url.includes('accounts.google.com') ||
        rawText.includes('ServiceLogin') ||
        rawText.includes('accounts.google.com')
      ) {
        res.status(200).json({
          ok: false,
          errorCode: 'AUTH_REQUIRED',
          httpStatus: 401,
          message:
            'Apps Script đang yêu cầu đăng nhập tài khoản Google. Cần chỉnh quyền triển khai mục "Who has access / Người có quyền truy cập" thành "Anyone / Bất kỳ ai".',
        });
        return;
      }

      if (rawText.includes('Script function not found: doPost')) {
        res.status(200).json({
          ok: false,
          errorCode: 'MISSING_DOPOST',
          message:
            'File Code.gs trong Apps Script chưa có hàm doPost(e). Hãy sao chép đúng đoạn mã mẫu trong tab "Hướng dẫn 3 phút", dán vào Apps Script và Triển khai bản mới.',
        });
        return;
      }

      try {
        const parsedJson = JSON.parse(rawText) as { status?: string; message?: string };
        if (parsedJson.status === 'error') {
          res.status(200).json({
            ok: false,
            errorCode: 'SCRIPT_ERROR',
            message: `Lỗi bên trong mã Apps Script: ${parsedJson.message || 'Không xác định'}`,
          });
          return;
        }

        if (updateLastSynced) {
          const nextSheetsConfig = {
            ...(dbState.sheetsConfig || {}),
            lastSyncedAt: new Date().toISOString(),
          };
          dbState = {
            ...dbState,
            version: dbState.version + 1,
            updatedAt: new Date().toISOString(),
            sheetsConfig: nextSheetsConfig,
          };
          persistStateToDisk(dbState);
          broadcastEvent({ type: 'state:slice', slice: 'sheetsConfig', data: nextSheetsConfig }, originClientId);
        }

        res.status(200).json({
          ok: true,
          message: parsedJson.message || 'Đã đồng bộ dữ liệu lên Google Sheet thành công!',
          data: parsedJson,
        });
        return;
      } catch {
        // Non-JSON response
        if (!finalRes.ok) {
          res.status(200).json({
            ok: false,
            errorCode: 'HTTP_ERROR',
            httpStatus: finalRes.status,
            message: `Google Apps Script trả về lỗi HTTP ${finalRes.status}. Hãy kiểm tra lại quyền Triển khai "Anyone" và mã nguồn Code.gs.`,
          });
          return;
        }

        res.status(200).json({
          ok: false,
          errorCode: 'UNEXPECTED_RESPONSE',
          message:
            'Google Apps Script không trả về JSON hợp lệ. Hãy kiểm tra lại hàm doPost(e) trong Code.gs đã được lưu và Triển khai phiên bản mới chưa.',
        });
      }
    } catch (err) {
      res.status(200).json({
        ok: false,
        errorCode: 'NETWORK_ERROR',
        message: `Không thể kết nối tới Google Apps Script: ${(err as Error)?.message || 'Lỗi mạng'}`,
      });
    }
  });

  // Reset bus operational data (preserving accounts & roleDefinitions)
  app.post('/api/state/reset', (req, res) => {
    const originClientId = req.header('x-client-id') || undefined;
    const body = req.body as Partial<ServerDbState>;
    createRollingBackup(dbState, 'before-reset');
    dbState = {
      ...dbState,
      initialized: true,
      hasUserEdits: true,
      version: dbState.version + 1,
      updatedAt: new Date().toISOString(),
      routes: Array.isArray(body.routes) ? body.routes : [],
      students: Array.isArray(body.students) ? body.students : [],
      records:
        body.records && typeof body.records === 'object'
          ? (body.records as Record<string, Record<string, unknown>>)
          : {},
      sessionStates:
        body.sessionStates && typeof body.sessionStates === 'object'
          ? (body.sessionStates as Record<string, Record<string, unknown>>)
          : {},
      notifications: Array.isArray(body.notifications) ? body.notifications : [],
      dbLogs: [],
    };

    persistStateToDisk(dbState);
    broadcastEvent({ type: 'state:full', state: dbState }, originClientId);

    res.json({
      ok: true,
      bootId: SERVER_BOOT_ID,
      state: dbState,
    });
  });

  // Frontend serving: Vite middleware in dev, static dist/ in production
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.join(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`[SchoolBus Pro] Realtime HTTP+WS server running at http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('[SchoolBus Pro] Fatal startup error:', err);
  process.exit(1);
});
