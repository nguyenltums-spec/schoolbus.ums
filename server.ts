import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import dns from 'node:dns/promises';
import net from 'node:net';
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
  | 'zaloConfig'
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
  dailyRecords: Record<string, Record<string, Record<string, unknown>>>;
  sessionStates: Record<string, Record<string, unknown>>;
  notifications: unknown[];
  sheetsConfig: Record<string, unknown>;
  zaloConfig: Record<string, unknown>;
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
  'zaloConfig',
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
    dailyRecords: {},
    sessionStates: {},
    notifications: [],
    sheetsConfig: {
      webhookUrl: '',
      sheetName: 'DiemDanhXeTuyen',
      autoSync: false,
    },
    zaloConfig: {
      enabled: false,
      deliveryMode: 'zalo_oa',
      webhookUrl: '',
      defaultRecipientIds: '',
      routeRecipientIds: {},
      notifyOnStopArrival: true,
      notifyOnDriverReport: true,
      notifyOnSupervisorLock: true,
      notifyOnParentAbsence: true,
      notifyOnEmptyBus: true,
    },
    dbLogs: [],
    accounts: [],
    roleDefinitions: [],
  };
}

function mergeRecordsIntoDaily(
  existingDaily: Record<string, Record<string, Record<string, unknown>>>,
  recordsMap: Record<string, Record<string, unknown>>
): Record<string, Record<string, Record<string, unknown>>> {
  const nextDaily: Record<string, Record<string, Record<string, unknown>>> = { ...existingDaily };
  for (const [studentId, rec] of Object.entries(recordsMap)) {
    if (!rec || typeof rec !== 'object') continue;
    const recDate =
      typeof rec.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(rec.date)
        ? rec.date
        : new Date().toISOString().slice(0, 10);
    if (!nextDaily[recDate]) {
      nextDaily[recDate] = {};
    } else {
      nextDaily[recDate] = { ...nextDaily[recDate] };
    }
    nextDaily[recDate][studentId] = { ...rec };
  }
  return nextDaily;
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
        dailyRecords: mergeRecordsIntoDaily(
          parsed.dailyRecords &&
            typeof parsed.dailyRecords === 'object' &&
            !Array.isArray(parsed.dailyRecords)
            ? (parsed.dailyRecords as Record<string, Record<string, Record<string, unknown>>>)
            : {},
          parsed.records && typeof parsed.records === 'object' && !Array.isArray(parsed.records)
            ? (parsed.records as Record<string, Record<string, unknown>>)
            : {}
        ),
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
        zaloConfig:
          parsed.zaloConfig && typeof parsed.zaloConfig === 'object'
            ? { ...base.zaloConfig, ...(parsed.zaloConfig as Record<string, unknown>) }
            : base.zaloConfig,
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

function isPublicIpv4(ip: string): boolean {
  const parts = ip.split('.').map((p) => Number(p));
  if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) {
    return false;
  }
  const [a, b, c] = parts;
  if (a === 0) return false; // 0.0.0.0/8
  if (a === 10) return false; // 10.0.0.0/8
  if (a === 100 && b >= 64 && b <= 127) return false; // 100.64.0.0/10 CGNAT
  if (a === 127) return false; // 127.0.0.0/8 loopback
  if (a === 169 && b === 254) return false; // 169.254.0.0/16 link-local / cloud metadata
  if (a === 172 && b >= 16 && b <= 31) return false; // 172.16.0.0/12
  if (a === 192 && b === 0 && c === 0) return false; // 192.0.0.0/24
  if (a === 192 && b === 0 && c === 2) return false; // 192.0.2.0/24 TEST-NET-1
  if (a === 192 && b === 168) return false; // 192.168.0.0/16
  if (a === 198 && (b === 18 || b === 19)) return false; // 198.18.0.0/15
  if (a === 198 && b === 51 && c === 100) return false; // 198.51.100.0/24 TEST-NET-2
  if (a === 203 && b === 0 && c === 113) return false; // 203.0.113.0/24 TEST-NET-3
  if (a >= 224) return false; // Multicast & reserved
  return true;
}

function isPublicIpAddress(rawIp: string): boolean {
  const ip = rawIp.trim().toLowerCase();
  if (net.isIPv4(ip)) {
    return isPublicIpv4(ip);
  }
  if (!net.isIPv6(ip)) {
    return false;
  }
  if (ip === '::' || ip === '::1') return false;
  if (ip.startsWith('::ffff:')) {
    const mappedV4 = ip.slice('::ffff:'.length);
    if (net.isIPv4(mappedV4)) {
      return isPublicIpv4(mappedV4);
    }
  }
  if (ip.startsWith('fc') || ip.startsWith('fd')) return false; // fc00::/7 ULA
  if (ip.startsWith('fe8') || ip.startsWith('fe9') || ip.startsWith('fea') || ip.startsWith('feb')) {
    return false; // fe80::/10 link-local
  }
  if (ip.startsWith('ff')) return false; // multicast
  if (ip.startsWith('2001:db8:')) return false; // documentation
  return true;
}

async function validateSafeHttpsWebhookUrl(
  rawUrl: string
): Promise<{ ok: true; url: URL } | { ok: false; message: string }> {
  const trimmed = rawUrl.trim();
  if (!trimmed) {
    return { ok: false, message: 'Chưa nhập Webhook HTTPS URL.' };
  }
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return { ok: false, message: 'Webhook URL không đúng định dạng.' };
  }
  if (parsed.protocol !== 'https:') {
    return { ok: false, message: 'Webhook URL bắt buộc phải sử dụng giao thức HTTPS.' };
  }
  if (parsed.username || parsed.password) {
    return { ok: false, message: 'Webhook URL không được chứa thông tin đăng nhập.' };
  }

  const hostname = parsed.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (
    !hostname ||
    hostname === 'localhost' ||
    hostname.endsWith('.localhost') ||
    hostname.endsWith('.local') ||
    hostname.endsWith('.internal') ||
    hostname.endsWith('.localdomain')
  ) {
    return { ok: false, message: 'Không cho phép gửi Webhook tới địa chỉ nội bộ hoặc localhost.' };
  }

  if (net.isIP(hostname)) {
    if (!isPublicIpAddress(hostname)) {
      return { ok: false, message: 'Không cho phép gửi Webhook tới dải địa chỉ IP nội bộ.' };
    }
    return { ok: true, url: parsed };
  }

  try {
    const records = await dns.lookup(hostname, { all: true });
    if (!records || records.length === 0) {
      return { ok: false, message: 'Không thể phân giải tên miền Webhook.' };
    }
    for (const rec of records) {
      if (!isPublicIpAddress(rec.address)) {
        return { ok: false, message: 'Tên miền Webhook trỏ về địa chỉ IP nội bộ không hợp lệ.' };
      }
    }
    return { ok: true, url: parsed };
  } catch {
    return { ok: false, message: 'Không thể phân giải tên miền Webhook URL.' };
  }
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

  // Fetch daily attendance records map (optionally filtered by ?month=YYYY-MM)
  app.get('/api/state/daily-records', (req, res) => {
    const monthParam = typeof req.query.month === 'string' ? req.query.month.trim() : '';
    const allDaily = mergeRecordsIntoDaily(dbState.dailyRecords || {}, dbState.records || {});
    if (!monthParam) {
      res.json({ ok: true, dailyRecords: allDaily });
      return;
    }
    const filtered: Record<string, Record<string, Record<string, unknown>>> = {};
    for (const [dateKey, studentMap] of Object.entries(allDaily)) {
      if (dateKey.startsWith(monthParam)) {
        filtered[dateKey] = studentMap;
      }
    }
    res.json({ ok: true, month: monthParam, dailyRecords: filtered });
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
      dailyRecords: mergeRecordsIntoDaily(
        body.dailyRecords &&
          typeof body.dailyRecords === 'object' &&
          !Array.isArray(body.dailyRecords)
          ? (body.dailyRecords as Record<string, Record<string, Record<string, unknown>>>)
          : {},
        body.records && typeof body.records === 'object' && !Array.isArray(body.records)
          ? (body.records as Record<string, Record<string, unknown>>)
          : {}
      ),
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
      zaloConfig:
        body.zaloConfig && typeof body.zaloConfig === 'object'
          ? { ...base.zaloConfig, ...(body.zaloConfig as Record<string, unknown>) }
          : base.zaloConfig,
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

    const nextDailyRecords =
      sliceKey === 'records' && data && typeof data === 'object' && !Array.isArray(data)
        ? mergeRecordsIntoDaily(dbState.dailyRecords || {}, data as Record<string, Record<string, unknown>>)
        : dbState.dailyRecords || {};

    dbState = {
      ...dbState,
      initialized: true,
      hasUserEdits: true,
      version: dbState.version + 1,
      updatedAt: new Date().toISOString(),
      [sliceKey]: data,
      dailyRecords: nextDailyRecords,
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
    const nextDailyRecords: Record<string, Record<string, Record<string, unknown>>> = {
      ...(dbState.dailyRecords || {}),
    };

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

        const recDate =
          typeof merged.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(merged.date)
            ? merged.date
            : new Date().toISOString().slice(0, 10);
        if (!nextDailyRecords[recDate]) {
          nextDailyRecords[recDate] = {};
        } else {
          nextDailyRecords[recDate] = { ...nextDailyRecords[recDate] };
        }
        nextDailyRecords[recDate][studentId] = { ...merged };
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
      dailyRecords: nextDailyRecords,
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
      dailyRecords: mergeRecordsIntoDaily(
        body.dailyRecords &&
          typeof body.dailyRecords === 'object' &&
          !Array.isArray(body.dailyRecords)
          ? (body.dailyRecords as Record<string, Record<string, Record<string, unknown>>>)
          : dbState.dailyRecords || {},
        body.records && typeof body.records === 'object' && !Array.isArray(body.records)
          ? (body.records as Record<string, Record<string, unknown>>)
          : dbState.records
      ),
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
      zaloConfig:
        body.zaloConfig && typeof body.zaloConfig === 'object'
          ? { ...base.zaloConfig, ...(body.zaloConfig as Record<string, unknown>) }
          : dbState.zaloConfig || base.zaloConfig,
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

  // Check whether server-side ZALO_OA_ACCESS_TOKEN is configured (never exposes secret value)
  app.get('/api/zalo/status', (_req, res) => {
    const hasServerToken = Boolean(process.env.ZALO_OA_ACCESS_TOKEN?.trim());
    res.json({ ok: true, hasServerToken });
  });

  // Server-side proxy for automated Zalo OA API v3 or validated HTTPS Webhook delivery
  app.post('/api/zalo/send', async (req, res) => {
    const originClientId = req.header('x-client-id') || undefined;
    const body = (req.body || {}) as {
      callerAccountId?: string;
      title?: string;
      message?: string;
      routeId?: string;
      routeCode?: string;
      recipientIds?: string[];
      deliveryModeOverride?: 'zalo_oa' | 'webhook';
      webhookUrlOverride?: string;
    };

    const accountsList = Array.isArray(dbState.accounts)
      ? (dbState.accounts as Array<{ id?: string; fullName?: string; isActive?: boolean }>)
      : [];
    const callerAccount = accountsList.find(
      (a) => a && a.id === body.callerAccountId && a.isActive !== false
    );
    if (accountsList.length > 0 && !callerAccount) {
      res.status(403).json({
        ok: false,
        errorCode: 'UNAUTHORIZED',
        message: 'Tài khoản gửi không hợp lệ hoặc đã bị vô hiệu hóa.',
      });
      return;
    }

    const cleanTitle = typeof body.title === 'string' ? body.title.trim().slice(0, 200) : '';
    const cleanMessage = typeof body.message === 'string' ? body.message.trim().slice(0, 2000) : '';
    if (!cleanMessage) {
      res.status(400).json({
        ok: false,
        errorCode: 'EMPTY_MESSAGE',
        message: 'Nội dung tin nhắn Zalo không được để trống.',
      });
      return;
    }

    const zaloCfg = (dbState.zaloConfig || {}) as {
      deliveryMode?: string;
      webhookUrl?: string;
      defaultRecipientIds?: string;
      routeRecipientIds?: Record<string, string>;
    };

    const mode: 'zalo_oa' | 'webhook' =
      body.deliveryModeOverride === 'webhook' || body.deliveryModeOverride === 'zalo_oa'
        ? body.deliveryModeOverride
        : zaloCfg.deliveryMode === 'webhook'
        ? 'webhook'
        : 'zalo_oa';

    const routeMap =
      zaloCfg.routeRecipientIds && typeof zaloCfg.routeRecipientIds === 'object'
        ? zaloCfg.routeRecipientIds
        : {};
    const routeSpecificRaw =
      typeof body.routeId === 'string' && body.routeId ? routeMap[body.routeId] || '' : '';
    const defaultRaw = typeof zaloCfg.defaultRecipientIds === 'string' ? zaloCfg.defaultRecipientIds : '';

    const rawCandidates =
      Array.isArray(body.recipientIds) && body.recipientIds.length > 0
        ? body.recipientIds
        : `${routeSpecificRaw},${defaultRaw}`.split(/[,;\s\n]+/);

    const resolvedRecipients = Array.from(
      new Set(
        rawCandidates
          .map((id) => (typeof id === 'string' ? id.trim() : ''))
          .filter((id) => /^[a-zA-Z0-9_-]{4,64}$/.test(id))
      )
    ).slice(0, 50);

    const senderName = callerAccount?.fullName || 'Hệ thống SchoolBus';
    const fullText = cleanTitle ? `[${cleanTitle}]\n${cleanMessage}` : cleanMessage;

    const recordZaloStatus = (statusMsg: string) => {
      const nextZaloConfig = {
        ...(dbState.zaloConfig || {}),
        lastSentAt: new Date().toISOString(),
        lastStatus: statusMsg,
      };
      dbState = {
        ...dbState,
        version: dbState.version + 1,
        updatedAt: new Date().toISOString(),
        zaloConfig: nextZaloConfig,
      };
      persistStateToDisk(dbState);
      broadcastEvent({ type: 'state:slice', slice: 'zaloConfig', data: nextZaloConfig }, originClientId);
    };

    if (mode === 'webhook') {
      const targetUrl =
        typeof body.webhookUrlOverride === 'string' && body.webhookUrlOverride.trim()
          ? body.webhookUrlOverride.trim()
          : String(zaloCfg.webhookUrl || '').trim();
      const validation = await validateSafeHttpsWebhookUrl(targetUrl);
      if (validation.ok === false) {
        res.status(400).json({
          ok: false,
          errorCode: 'INVALID_WEBHOOK_URL',
          message: validation.message,
        });
        return;
      }

      try {
        const hookRes = await fetch(validation.url.toString(), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            event: 'SCHOOLBUS_ZALO_NOTIFICATION',
            title: cleanTitle || 'Thông báo SchoolBus Pro',
            message: cleanMessage,
            fullText,
            routeId: body.routeId || '',
            routeCode: body.routeCode || '',
            recipients: resolvedRecipients,
            sentBy: senderName,
            sentAt: new Date().toISOString(),
          }),
          redirect: 'error',
          signal: AbortSignal.timeout(10000),
        });

        if (!hookRes.ok) {
          const msg = `Webhook trả về mã lỗi HTTP ${hookRes.status}.`;
          recordZaloStatus(msg);
          res.status(200).json({ ok: false, errorCode: 'WEBHOOK_HTTP_ERROR', message: msg });
          return;
        }

        const successMsg = 'Đã đẩy thông báo qua Webhook HTTPS thành công.';
        recordZaloStatus(successMsg);
        res.json({ ok: true, sentCount: 1, failedCount: 0, message: successMsg });
        return;
      } catch (err) {
        const msg = `Không thể kết nối Webhook HTTPS: ${(err as Error)?.message || 'Lỗi mạng'}`;
        recordZaloStatus(msg);
        res.status(200).json({ ok: false, errorCode: 'NETWORK_ERROR', message: msg });
        return;
      }
    }

    // Zalo OA OpenAPI v3 mode (server-held token only)
    const token = (process.env.ZALO_OA_ACCESS_TOKEN || '').trim();
    if (!token) {
      res.status(400).json({
        ok: false,
        errorCode: 'MISSING_SERVER_TOKEN',
        message:
          'Máy chủ chưa cấu hình biến môi trường ZALO_OA_ACCESS_TOKEN. Bạn vẫn có thể dùng tab "Gửi nhanh qua Zalo" để nhắn trực tiếp hoặc dùng Webhook HTTPS.',
      });
      return;
    }

    if (resolvedRecipients.length === 0) {
      res.status(400).json({
        ok: false,
        errorCode: 'MISSING_RECIPIENTS',
        message: 'Chưa có Zalo User ID người nhận hợp lệ trong cấu hình Zalo.',
      });
      return;
    }

    let sentCount = 0;
    let failedCount = 0;
    let lastErrorDetail = '';

    for (const userId of resolvedRecipients) {
      try {
        const oaRes = await fetch('https://openapi.zalo.me/v3.0/oa/message/cs', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            access_token: token,
          },
          body: JSON.stringify({
            recipient: { user_id: userId },
            message: { text: fullText },
          }),
          redirect: 'error',
          signal: AbortSignal.timeout(10000),
        });

        const oaJson = (await oaRes.json().catch(() => null)) as {
          error?: number;
          message?: string;
        } | null;

        if (oaRes.ok && oaJson && oaJson.error === 0) {
          sentCount += 1;
        } else {
          failedCount += 1;
          lastErrorDetail = oaJson?.message || `HTTP ${oaRes.status}`;
        }
      } catch (err) {
        failedCount += 1;
        lastErrorDetail = (err as Error)?.message || 'Lỗi mạng';
      }
    }

    const summaryMsg =
      sentCount > 0 && failedCount === 0
        ? `Đã gửi thành công ${sentCount} tin nhắn qua Zalo OA.`
        : sentCount > 0
        ? `Đã gửi ${sentCount}/${resolvedRecipients.length} tin nhắn Zalo OA (lỗi ${failedCount}: ${lastErrorDetail}).`
        : `Gửi Zalo OA thất bại (${lastErrorDetail || 'Không xác định'}).`;

    recordZaloStatus(summaryMsg);
    res.status(200).json({
      ok: sentCount > 0,
      sentCount,
      failedCount,
      errorCode: sentCount === 0 ? 'ZALO_OA_ERROR' : undefined,
      message: summaryMsg,
    });
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
      server: {
        middlewareMode: true,
        ws: {
          server: httpServer,
          path: '/__vite_hmr',
        },
        hmr:
          process.env.DISABLE_HMR === 'true'
            ? false
            : {
                server: httpServer,
                path: '/__vite_hmr',
              },
      },
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
