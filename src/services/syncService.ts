import {
  Route,
  Student,
  CheckinRecord,
  RouteSessionState,
  AppNotification,
  GoogleSheetsConfig,
  ZaloConfig,
  DatabaseSaveLog,
  UserAccount,
  RoleDefinition,
} from '../types';

export type SyncSliceName =
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

export interface ServerStatePayload {
  initialized: boolean;
  hasUserEdits: boolean;
  version: number;
  updatedAt: string;
  routes: Route[];
  students: Student[];
  records: Record<string, CheckinRecord>;
  sessionStates: Record<string, RouteSessionState>;
  notifications: AppNotification[];
  sheetsConfig: GoogleSheetsConfig;
  zaloConfig?: ZaloConfig;
  dbLogs: DatabaseSaveLog[];
  accounts: UserAccount[];
  roleDefinitions: RoleDefinition[];
}

export interface FetchStateResponse {
  changed: boolean;
  bootId?: string;
  version?: number;
  updatedAt?: string;
  state?: ServerStatePayload;
}

export type RealtimeWsEvent =
  | {
      type: 'state:full';
      bootId: string;
      version: number;
      updatedAt: string;
      state: ServerStatePayload;
    }
  | {
      type: 'state:slice';
      bootId: string;
      version: number;
      updatedAt: string;
      slice: SyncSliceName;
      data: unknown;
    }
  | {
      type: 'state:records';
      bootId: string;
      version: number;
      updatedAt: string;
      updates?: Record<string, Record<string, unknown>>;
      deleteIds?: string[];
      records: Record<string, CheckinRecord>;
    }
  | {
      type: 'state:sessions';
      bootId: string;
      version: number;
      updatedAt: string;
      sessionStates: Record<string, RouteSessionState>;
    }
  | {
      type: 'pong';
      bootId: string;
      version: number;
    };

const CLIENT_ID = (() => {
  try {
    const existing = sessionStorage.getItem('schoolbus_client_id');
    if (existing) return existing;
    const next = `client-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    sessionStorage.setItem('schoolbus_client_id', next);
    return next;
  } catch {
    return `client-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  }
})();

export function getSyncClientId(): string {
  return CLIENT_ID;
}

function buildJsonHeaders(): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    'X-Client-Id': CLIENT_ID,
  };
}

/**
 * Convert explicit `undefined` values in partial update objects to `null`
 * so JSON.stringify preserves field deletion markers for the server.
 */
function serializePatchWithDeletions(patch: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(patch)) {
    out[key] = val === undefined ? null : val;
  }
  return out;
}

export async function fetchServerState(
  sinceVersion?: number,
  bootId?: string
): Promise<FetchStateResponse> {
  const params = new URLSearchParams();
  if (typeof sinceVersion === 'number' && sinceVersion > 0) {
    params.set('sinceVersion', String(sinceVersion));
  }
  if (bootId) {
    params.set('bootId', bootId);
  }
  const query = params.toString();
  const url = query ? `/api/state?${query}` : '/api/state';

  const res = await fetch(url, {
    method: 'GET',
    cache: 'no-store',
    headers: { Accept: 'application/json', 'X-Client-Id': CLIENT_ID },
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }
  return (await res.json()) as FetchStateResponse;
}

export async function fetchDailyRecordsForMonth(
  monthKey: string
): Promise<Record<string, Record<string, CheckinRecord>>> {
  try {
    const params = new URLSearchParams({ month: monthKey });
    const res = await fetch(`/api/state/daily-records?${params.toString()}`, {
      method: 'GET',
      cache: 'no-store',
      headers: { Accept: 'application/json', 'X-Client-Id': CLIENT_ID },
    });
    if (!res.ok) return {};
    const json = (await res.json()) as {
      ok?: boolean;
      dailyRecords?: Record<string, Record<string, CheckinRecord>>;
    };
    return json?.dailyRecords || {};
  } catch {
    return {};
  }
}

export async function fetchZaloServerStatus(): Promise<{ hasServerToken: boolean }> {
  try {
    const res = await fetch('/api/zalo/status', {
      method: 'GET',
      cache: 'no-store',
      headers: { Accept: 'application/json', 'X-Client-Id': CLIENT_ID },
    });
    if (!res.ok) return { hasServerToken: false };
    const json = (await res.json()) as { hasServerToken?: boolean };
    return { hasServerToken: Boolean(json?.hasServerToken) };
  } catch {
    return { hasServerToken: false };
  }
}

export async function sendZaloNotificationViaServer(params: {
  callerAccountId: string;
  title: string;
  message: string;
  routeId?: string;
  routeCode?: string;
  recipientIds?: string[];
  deliveryModeOverride?: 'zalo_oa' | 'webhook';
  webhookUrlOverride?: string;
}): Promise<{
  ok: boolean;
  message: string;
  sentCount?: number;
  failedCount?: number;
  errorCode?: string;
}> {
  try {
    const res = await fetch('/api/zalo/send', {
      method: 'POST',
      headers: buildJsonHeaders(),
      body: JSON.stringify(params),
    });
    const json = (await res.json()) as {
      ok?: boolean;
      message?: string;
      sentCount?: number;
      failedCount?: number;
      errorCode?: string;
    };
    return {
      ok: Boolean(json?.ok),
      message: json?.message || (res.ok ? 'Đã gửi thông báo Zalo.' : `Lỗi HTTP ${res.status}`),
      sentCount: json?.sentCount,
      failedCount: json?.failedCount,
      errorCode: json?.errorCode,
    };
  } catch (err) {
    return {
      ok: false,
      errorCode: 'NETWORK_ERROR',
      message: `Không thể kết nối máy chủ gửi Zalo: ${(err as Error)?.message || 'Lỗi mạng'}`,
    };
  }
}

export async function bootstrapServerState(
  payload: Omit<ServerStatePayload, 'initialized' | 'hasUserEdits' | 'version' | 'updatedAt'> & {
    hasLocalCustomization: boolean;
    forceIfUnedited?: boolean;
  }
): Promise<{ bootstrapped: boolean; bootId?: string; state: ServerStatePayload }> {
  const res = await fetch('/api/state/bootstrap', {
    method: 'POST',
    headers: buildJsonHeaders(),
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }
  return (await res.json()) as {
    bootstrapped: boolean;
    bootId?: string;
    state: ServerStatePayload;
  };
}

export async function pushSliceToServer<T>(
  slice: SyncSliceName,
  data: T
): Promise<{ ok: boolean; bootId?: string; version: number; updatedAt: string }> {
  const res = await fetch('/api/state/slice', {
    method: 'PUT',
    headers: buildJsonHeaders(),
    body: JSON.stringify({ slice, data }),
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }
  return (await res.json()) as {
    ok: boolean;
    bootId?: string;
    version: number;
    updatedAt: string;
  };
}

export async function stampLoginOnServer(
  accountId: string,
  lastLoginAt: string
): Promise<{ ok: boolean; bootId?: string; version: number }> {
  const res = await fetch('/api/auth/login-stamp', {
    method: 'POST',
    headers: buildJsonHeaders(),
    body: JSON.stringify({ accountId, lastLoginAt }),
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }
  return (await res.json()) as { ok: boolean; bootId?: string; version: number };
}

export async function patchRecordsOnServer(
  updates?: Record<string, Partial<CheckinRecord>>,
  deleteIds?: string[]
): Promise<{
  ok: boolean;
  bootId?: string;
  version: number;
  records: Record<string, CheckinRecord>;
}> {
  const serializedUpdates: Record<string, Record<string, unknown>> | undefined = updates
    ? Object.fromEntries(
        Object.entries(updates).map(([id, patch]) => [
          id,
          serializePatchWithDeletions(patch as Record<string, unknown>),
        ])
      )
    : undefined;

  const res = await fetch('/api/state/records', {
    method: 'PATCH',
    headers: buildJsonHeaders(),
    body: JSON.stringify({ updates: serializedUpdates, deleteIds }),
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }
  return (await res.json()) as {
    ok: boolean;
    bootId?: string;
    version: number;
    records: Record<string, CheckinRecord>;
  };
}

export async function patchSessionOnServer(
  routeId?: string,
  updates?: Partial<RouteSessionState>,
  deleteRouteId?: string
): Promise<{
  ok: boolean;
  bootId?: string;
  version: number;
  sessionStates: Record<string, RouteSessionState>;
}> {
  const res = await fetch('/api/state/sessions', {
    method: 'PATCH',
    headers: buildJsonHeaders(),
    body: JSON.stringify({
      routeId,
      updates: updates ? serializePatchWithDeletions(updates as Record<string, unknown>) : undefined,
      deleteRouteId,
    }),
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }
  return (await res.json()) as {
    ok: boolean;
    bootId?: string;
    version: number;
    sessionStates: Record<string, RouteSessionState>;
  };
}

export async function appendItemToServer(
  slice: 'notifications' | 'dbLogs',
  item: AppNotification | DatabaseSaveLog,
  maxItems = 100
): Promise<{ ok: boolean; bootId?: string; version: number }> {
  const res = await fetch('/api/state/append', {
    method: 'POST',
    headers: buildJsonHeaders(),
    body: JSON.stringify({ slice, item, maxItems }),
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }
  return (await res.json()) as { ok: boolean; bootId?: string; version: number };
}

export async function importFullServerState(
  payload: Partial<ServerStatePayload>
): Promise<{ ok: boolean; bootId?: string; state: ServerStatePayload }> {
  const res = await fetch('/api/state/import-full', {
    method: 'POST',
    headers: buildJsonHeaders(),
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }
  return (await res.json()) as { ok: boolean; bootId?: string; state: ServerStatePayload };
}

export async function resetServerBusData(defaults: {
  routes: Route[];
  students: Student[];
  records: Record<string, CheckinRecord>;
  sessionStates: Record<string, RouteSessionState>;
  notifications: AppNotification[];
}): Promise<{ ok: boolean; bootId?: string; state: ServerStatePayload }> {
  const res = await fetch('/api/state/reset', {
    method: 'POST',
    headers: buildJsonHeaders(),
    body: JSON.stringify(defaults),
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }
  return (await res.json()) as { ok: boolean; bootId?: string; state: ServerStatePayload };
}

export interface ServerBackupInfo {
  fileName: string;
  createdAt: string;
  routesCount: number;
  studentsCount: number;
  reason: string;
}

export async function fetchServerBackups(): Promise<ServerBackupInfo[]> {
  const res = await fetch('/api/state/backups', { cache: 'no-store' });
  if (!res.ok) return [];
  const data = (await res.json()) as { backups?: ServerBackupInfo[] };
  return Array.isArray(data.backups) ? data.backups : [];
}

export async function restoreServerBackup(
  fileName: string
): Promise<{ ok: boolean; bootId?: string; state: ServerStatePayload }> {
  const res = await fetch('/api/state/restore-backup', {
    method: 'POST',
    headers: buildJsonHeaders(),
    body: JSON.stringify({ fileName }),
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }
  return (await res.json()) as { ok: boolean; bootId?: string; state: ServerStatePayload };
}

// =========================================================
// Persistent Offline Outbox Queue (retried automatically)
// =========================================================

export type QueuedMutationInput =
  | {
      kind: 'patch_records';
      updates?: Record<string, Partial<CheckinRecord>>;
      deleteIds?: string[];
    }
  | {
      kind: 'patch_session';
      routeId?: string;
      updates?: Partial<RouteSessionState>;
      deleteRouteId?: string;
    }
  | {
      kind: 'put_slice';
      slice: SyncSliceName;
      data: unknown;
    }
  | {
      kind: 'append_item';
      slice: 'notifications' | 'dbLogs';
      item: AppNotification | DatabaseSaveLog;
      maxItems?: number;
    }
  | {
      kind: 'login_stamp';
      accountId: string;
      lastLoginAt: string;
    };

export type QueuedMutationOp = QueuedMutationInput & { id: string };

const OUTBOX_STORAGE_KEY = 'schoolbus_sync_outbox_v1';

export function readOutbox(): QueuedMutationOp[] {
  try {
    const raw = localStorage.getItem(OUTBOX_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function writeOutbox(ops: QueuedMutationOp[]): void {
  try {
    if (ops.length === 0) {
      localStorage.removeItem(OUTBOX_STORAGE_KEY);
    } else {
      localStorage.setItem(OUTBOX_STORAGE_KEY, JSON.stringify(ops));
    }
  } catch {
    // Ignore storage quota issues
  }
}

export function enqueueOutboxOp(op: QueuedMutationInput): void {
  const current = readOutbox();
  const nextOp: QueuedMutationOp = {
    ...op,
    id: `op-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
  };

  // Replace earlier put_slice for the same slice so queue stays compact
  if (nextOp.kind === 'put_slice') {
    const filtered = current.filter(
      (existing) => !(existing.kind === 'put_slice' && existing.slice === nextOp.slice)
    );
    writeOutbox([...filtered, nextOp]);
    return;
  }

  writeOutbox([...current, nextOp]);
}

export async function executeQueuedOp(
  op: QueuedMutationOp
): Promise<{ bootId?: string; version?: number }> {
  switch (op.kind) {
    case 'patch_records':
      return patchRecordsOnServer(op.updates, op.deleteIds);
    case 'patch_session':
      return patchSessionOnServer(op.routeId, op.updates, op.deleteRouteId);
    case 'put_slice':
      return pushSliceToServer(op.slice, op.data);
    case 'append_item':
      return appendItemToServer(op.slice, op.item, op.maxItems);
    case 'login_stamp':
      return stampLoginOnServer(op.accountId, op.lastLoginAt);
  }
}

// =========================================================
// Real-time WebSocket Client with Auto-Reconnect & Heartbeat
// =========================================================

export interface RealtimeConnection {
  close: () => void;
  requestSync: () => void;
}

export function connectRealtimeSync(callbacks: {
  onEvent: (event: RealtimeWsEvent) => void;
  onOpen?: () => void;
  onClose?: () => void;
}): RealtimeConnection {
  let ws: WebSocket | null = null;
  let closedByCaller = false;
  let reconnectTimer: number | null = null;
  let pingTimer: number | null = null;
  let retryDelayMs = 600;

  const clearTimers = () => {
    if (reconnectTimer !== null) {
      window.clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
    if (pingTimer !== null) {
      window.clearInterval(pingTimer);
      pingTimer = null;
    }
  };

  const connect = () => {
    if (closedByCaller || typeof window === 'undefined') return;
    clearTimers();

    const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${wsProtocol}//${window.location.host}/ws?clientId=${encodeURIComponent(
      CLIENT_ID
    )}`;

    try {
      ws = new WebSocket(wsUrl);
    } catch {
      scheduleReconnect();
      return;
    }

    ws.onopen = () => {
      retryDelayMs = 600;
      callbacks.onOpen?.();

      pingTimer = window.setInterval(() => {
        if (ws && ws.readyState === WebSocket.OPEN) {
          try {
            ws.send(JSON.stringify({ type: 'ping' }));
          } catch {
            // Reconnect handler will clean up
          }
        }
      }, 20000);
    };

    ws.onmessage = (evt) => {
      try {
        const parsed = JSON.parse(String(evt.data)) as RealtimeWsEvent;
        if (parsed && parsed.type) {
          callbacks.onEvent(parsed);
        }
      } catch {
        // Ignore malformed frames
      }
    };

    ws.onclose = () => {
      clearTimers();
      callbacks.onClose?.();
      scheduleReconnect();
    };

    ws.onerror = () => {
      // onclose fires right after onerror
    };
  };

  const scheduleReconnect = () => {
    if (closedByCaller) return;
    if (reconnectTimer !== null) return;
    const delay = retryDelayMs;
    retryDelayMs = Math.min(retryDelayMs * 1.6, 5000);
    reconnectTimer = window.setTimeout(() => {
      reconnectTimer = null;
      connect();
    }, delay);
  };

  connect();

  return {
    close: () => {
      closedByCaller = true;
      clearTimers();
      try {
        ws?.close();
      } catch {
        // Ignore close error
      }
      ws = null;
    },
    requestSync: () => {
      if (ws && ws.readyState === WebSocket.OPEN) {
        try {
          ws.send(JSON.stringify({ type: 'request_sync' }));
        } catch {
          // Ignore send failure
        }
      }
    },
  };
}
