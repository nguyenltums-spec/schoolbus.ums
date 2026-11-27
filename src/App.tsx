/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import {
  UserRole,
  Route,
  Student,
  CheckinRecord,
  RouteSessionState,
  AppNotification,
  GoogleSheetsConfig,
  ZaloConfig,
  ZaloDeliveryLog,
  UserAccount,
  RoleDefinition,
  DatabaseSaveLog,
} from './types';
import {
  getStoredRoutes,
  saveStoredRoutes,
  getStoredStudents,
  saveStoredStudents,
  getStoredRecords,
  saveStoredRecords,
  getStoredSessions,
  saveStoredSessions,
  getStoredNotifications,
  saveStoredNotifications,
  getStoredSheetsConfig,
  saveStoredSheetsConfig,
  getStoredZaloConfig,
  saveStoredZaloConfig,
  DEFAULT_ZALO_CONFIG,
  getStoredDbLogs,
  saveStoredDbLogs,
  resetAllData,
  exportRecordsToCSV,
  LocalSafetySnapshot,
  getLocalSafetySnapshot,
  saveLocalSafetySnapshot,
  clearLocalSafetySnapshot,
} from './services/storageService';
import {
  getStoredRoles,
  saveStoredRoles,
  getStoredAccounts,
  saveStoredAccounts,
  getStoredSessionUserId,
  saveStoredSessionUserId,
  getAllowedViewsForPermissions,
  getDefaultViewForPermissions,
  hashPassword,
  INITIAL_ACCOUNTS,
  INITIAL_ROLES,
} from './services/authService';
import {
  fetchServerState,
  bootstrapServerState,
  pushSliceToServer,
  patchRecordsOnServer,
  patchSessionOnServer,
  appendItemToServer,
  stampLoginOnServer,
  importFullServerState,
  resetServerBusData,
  sendZaloNotificationViaServer,
  connectRealtimeSync,
  enqueueOutboxOp,
  readOutbox,
  writeOutbox,
  executeQueuedOp,
  QueuedMutationInput,
  RealtimeWsEvent,
  ServerStatePayload,
  SyncSliceName,
} from './services/syncService';
import { Header } from './components/Header';
import { DriverView } from './components/driver/DriverView';
import { SupervisorView } from './components/supervisor/SupervisorView';
import { ParentView } from './components/parent/ParentView';
import { AdminView } from './components/admin/AdminView';
import { AnalyticsDashboard } from './components/analytics/AnalyticsDashboard';
import { QrScannerModal } from './components/common/QrScannerModal';
import { GoogleSheetsModal } from './components/common/GoogleSheetsModal';
import { ZaloModal } from './components/common/ZaloModal';
import { NotificationDrawer } from './components/common/NotificationDrawer';
import { StudentIdCardModal } from './components/common/StudentIdCardModal';
import { LoginScreen } from './components/auth/LoginScreen';
import { ChangePasswordModal } from './components/auth/ChangePasswordModal';
import {
  getTodayDateString,
  INITIAL_ROUTES,
  INITIAL_STUDENTS,
  createInitialRecords,
  INITIAL_ROUTE_SESSIONS,
  INITIAL_NOTIFICATIONS,
} from './services/defaultData';
import {
  isTransferredInAcceptedForSession,
  isTransferredOutAcceptedForSession,
} from './utils/transferHelpers';
import { sortRoutesByOrder } from './utils/routeSort';

export default function App() {
  const [routes, setRoutes] = useState<Route[]>(() => sortRoutesByOrder(getStoredRoutes()));
  const [students, setStudents] = useState<Student[]>(() => getStoredStudents());
  const [records, setRecords] = useState<Record<string, CheckinRecord>>(() =>
    getStoredRecords(getStoredStudents())
  );
  const [sessionStates, setSessionStates] = useState<Record<string, RouteSessionState>>(() =>
    getStoredSessions()
  );
  const [notifications, setNotifications] = useState<AppNotification[]>(() =>
    getStoredNotifications()
  );
  const [sheetsConfig, setSheetsConfig] = useState<GoogleSheetsConfig>(() =>
    getStoredSheetsConfig()
  );
  const [zaloConfig, setZaloConfig] = useState<ZaloConfig>(() => getStoredZaloConfig());
  const [zaloLogs, setZaloLogs] = useState<ZaloDeliveryLog[]>([]);
  const [dbLogs, setDbLogs] = useState<DatabaseSaveLog[]>(() => getStoredDbLogs());

  const [accounts, setAccounts] = useState<UserAccount[]>(() => getStoredAccounts());
  const [roleDefinitions, setRoleDefinitions] = useState<RoleDefinition[]>(() => getStoredRoles());
  const [currentUserId, setCurrentUserId] = useState<string | null>(() =>
    getStoredSessionUserId()
  );

  const [currentRole, setCurrentRole] = useState<UserRole>('admin');
  const [activeRouteId, setActiveRouteId] = useState<string>(routes[0]?.id || 'route-1');
  const [activeSessionType, setActiveSessionType] = useState<'morning' | 'afternoon'>('morning');

  // Modals state
  const [isQrScannerOpen, setIsQrScannerOpen] = useState(false);
  const [isSheetsModalOpen, setIsSheetsModalOpen] = useState(false);
  const [isZaloModalOpen, setIsZaloModalOpen] = useState(false);
  const [zaloPrefill, setZaloPrefill] = useState<{
    title: string;
    message: string;
    routeId?: string;
  } | null>(null);
  const [isNotifDrawerOpen, setIsNotifDrawerOpen] = useState(false);
  const [isChangePasswordOpen, setIsChangePasswordOpen] = useState(false);
  const [selectedStudentForCard, setSelectedStudentForCard] = useState<Student | null>(null);

  const todayDate = getTodayDateString();

  // Cross-device server sync refs
  const serverVersionRef = useRef<number>(0);
  const serverBootIdRef = useRef<string>('');
  const pendingWritesRef = useRef<number>(0);
  const lastLocalWriteAtRef = useRef<number>(0);
  const recordPatchQueueRef = useRef<Record<string, Partial<CheckinRecord>>>({});
  const recordFlushTimerRef = useRef<number | null>(null);
  const isBootstrappedRef = useRef<boolean>(false);
  const isFlushingOutboxRef = useRef<boolean>(false);
  const [localSafetySnapshot, setLocalSafetySnapshot] = useState<LocalSafetySnapshot | null>(() =>
    getLocalSafetySnapshot()
  );
  const initialLocalDataRef = useRef({
    routes,
    students,
    records,
    sessionStates,
    sheetsConfig,
  });

  const flushOutbox = useCallback(async () => {
    if (isFlushingOutboxRef.current) return;
    const queue = readOutbox();
    if (queue.length === 0) return;

    isFlushingOutboxRef.current = true;
    try {
      let remaining = [...queue];
      while (remaining.length > 0) {
        const nextOp = remaining[0];
        const res = await executeQueuedOp(nextOp);
        if (res.bootId) {
          serverBootIdRef.current = res.bootId;
        }
        if (typeof res.version === 'number') {
          serverVersionRef.current = Math.max(serverVersionRef.current, res.version);
        }
        remaining = remaining.slice(1);
        writeOutbox(remaining);
      }
    } catch {
      // Network unavailable; keep remaining ops in outbox for automatic retry
    } finally {
      isFlushingOutboxRef.current = false;
    }
  }, []);

  const runServerWrite = useCallback(
    async (
      fn: () => Promise<{ bootId?: string; version?: number } | void>,
      fallbackOutboxOp?: QueuedMutationInput
    ) => {
      pendingWritesRef.current += 1;
      lastLocalWriteAtRef.current = Date.now();
      try {
        // Flush any earlier queued ops first so server order matches local edits
        await flushOutbox();
        const res = await fn();
        if (res && res.bootId) {
          serverBootIdRef.current = res.bootId;
        }
        if (res && typeof res.version === 'number') {
          serverVersionRef.current = Math.max(serverVersionRef.current, res.version);
        }
      } catch (err) {
        console.warn('[SchoolBus Sync] Server write queued for retry:', err);
        if (fallbackOutboxOp) {
          enqueueOutboxOp(fallbackOutboxOp);
        }
      } finally {
        pendingWritesRef.current = Math.max(0, pendingWritesRef.current - 1);
        lastLocalWriteAtRef.current = Date.now();
      }
    },
    [flushOutbox]
  );

  const applyServerSlice = useCallback((slice: SyncSliceName, data: unknown) => {
    switch (slice) {
      case 'routes':
        if (Array.isArray(data) && data.length > 0) {
          const nextRoutes = sortRoutesByOrder(data as Route[]);
          setRoutes(nextRoutes);
          setActiveRouteId((prev) =>
            nextRoutes.some((r) => r.id === prev) ? prev : nextRoutes[0].id
          );
        }
        break;
      case 'students':
        if (Array.isArray(data)) {
          setStudents(data as Student[]);
        }
        break;
      case 'records':
        if (data && typeof data === 'object') {
          setRecords(data as Record<string, CheckinRecord>);
        }
        break;
      case 'sessionStates':
        if (data && typeof data === 'object') {
          setSessionStates(data as Record<string, RouteSessionState>);
        }
        break;
      case 'notifications':
        if (Array.isArray(data)) {
          setNotifications(data as AppNotification[]);
        }
        break;
      case 'sheetsConfig':
        if (data && typeof data === 'object') {
          setSheetsConfig(data as GoogleSheetsConfig);
        }
        break;
      case 'zaloConfig':
        if (data && typeof data === 'object') {
          setZaloConfig({ ...DEFAULT_ZALO_CONFIG, ...(data as Partial<ZaloConfig>) });
        }
        break;
      case 'dbLogs':
        if (Array.isArray(data)) {
          setDbLogs(data as DatabaseSaveLog[]);
        }
        break;
      case 'accounts':
        if (Array.isArray(data) && data.length > 0) {
          setAccounts(data as UserAccount[]);
        }
        break;
      case 'roleDefinitions':
        if (Array.isArray(data) && data.length > 0) {
          setRoleDefinitions(data as RoleDefinition[]);
        }
        break;
    }
  }, []);

  const applyServerState = useCallback((serverState: ServerStatePayload, bootId?: string) => {
    if (bootId) {
      serverBootIdRef.current = bootId;
    }
    serverVersionRef.current = serverState.version;
    if (Array.isArray(serverState.routes) && serverState.routes.length > 0) {
      const sortedRoutes = sortRoutesByOrder(serverState.routes);
      setRoutes(sortedRoutes);
      setActiveRouteId((prev) =>
        sortedRoutes.some((r) => r.id === prev) ? prev : sortedRoutes[0].id
      );
    }
    if (Array.isArray(serverState.students)) {
      setStudents(serverState.students);
    }
    if (serverState.records && typeof serverState.records === 'object') {
      const pendingLocalIds = Object.keys(recordPatchQueueRef.current);
      if (pendingLocalIds.length === 0) {
        setRecords(serverState.records);
      } else {
        setRecords((prev) => {
          const merged = { ...serverState.records };
          pendingLocalIds.forEach((id) => {
            if (prev[id]) merged[id] = prev[id];
          });
          return merged;
        });
      }
    }
    if (serverState.sessionStates && typeof serverState.sessionStates === 'object') {
      setSessionStates(serverState.sessionStates);
    }
    if (Array.isArray(serverState.notifications)) {
      setNotifications(serverState.notifications);
    }
    if (serverState.sheetsConfig && typeof serverState.sheetsConfig === 'object') {
      setSheetsConfig(serverState.sheetsConfig);
    }
    if (serverState.zaloConfig && typeof serverState.zaloConfig === 'object') {
      setZaloConfig({ ...DEFAULT_ZALO_CONFIG, ...serverState.zaloConfig });
    }
    if (Array.isArray(serverState.dbLogs)) {
      setDbLogs(serverState.dbLogs);
    }
    if (Array.isArray(serverState.accounts) && serverState.accounts.length > 0) {
      setAccounts(serverState.accounts);
    }
    if (Array.isArray(serverState.roleDefinitions) && serverState.roleDefinitions.length > 0) {
      setRoleDefinitions(serverState.roleDefinitions);
    }
  }, []);

  // Real-time WebSocket + HTTP fallback sync across all phones, tablets, and PCs
  useEffect(() => {
    let cancelled = false;
    let preservedLocalOnce = false;

    const preserveLocalIfRicher = (serverState: ServerStatePayload) => {
      if (preservedLocalOnce) return;
      preservedLocalOnce = true;
      const localSnap = initialLocalDataRef.current;
      const localHasMore =
        localSnap.students.length > serverState.students.length ||
        localSnap.routes.length > serverState.routes.length;
      if (localHasMore && (localSnap.students.length > 0 || localSnap.routes.length > 1)) {
        const snapshot: LocalSafetySnapshot = {
          savedAt: new Date().toISOString(),
          routes: localSnap.routes,
          students: localSnap.students,
          records: localSnap.records,
          sessionStates: localSnap.sessionStates,
          sheetsConfig: localSnap.sheetsConfig,
        };
        saveLocalSafetySnapshot(snapshot);
        setLocalSafetySnapshot(snapshot);
      }
    };

    const initOrSyncWithServer = async () => {
      try {
        await flushOutbox();
        const res = await fetchServerState();
        if (cancelled) return;

        const isCustomizedLocally =
          JSON.stringify(routes) !== JSON.stringify(INITIAL_ROUTES) ||
          JSON.stringify(students) !== JSON.stringify(INITIAL_STUDENTS) ||
          accounts.length !== INITIAL_ACCOUNTS.length ||
          roleDefinitions.length !== INITIAL_ROLES.length ||
          dbLogs.length > 0;

        const serverHasEmptySeed =
          !res.state?.initialized ||
          (!res.state.hasUserEdits &&
            res.state.students.length === 0 &&
            res.state.routes.length <= 1);

        if (serverHasEmptySeed && (!res.state?.initialized || isCustomizedLocally)) {
          const boot = await bootstrapServerState({
            routes,
            students,
            records,
            sessionStates,
            notifications,
            sheetsConfig,
            zaloConfig,
            dbLogs,
            accounts,
            roleDefinitions,
            hasLocalCustomization: isCustomizedLocally,
            forceIfUnedited: true,
          });
          if (cancelled) return;
          isBootstrappedRef.current = true;
          if (!boot.bootstrapped) {
            preserveLocalIfRicher(boot.state);
            applyServerState(boot.state, boot.bootId);
          } else {
            if (boot.bootId) serverBootIdRef.current = boot.bootId;
            serverVersionRef.current = boot.state.version;
          }
        } else if (res.state) {
          isBootstrappedRef.current = true;
          preserveLocalIfRicher(res.state);
          applyServerState(res.state, res.bootId);
        }
      } catch (err) {
        console.warn('[SchoolBus Sync] Waiting for server connection:', err);
      }
    };

    initOrSyncWithServer();

    const pollServer = async () => {
      if (cancelled) return;
      await flushOutbox();

      if (!isBootstrappedRef.current) {
        await initOrSyncWithServer();
        return;
      }

      if (pendingWritesRef.current > 0 || Date.now() - lastLocalWriteAtRef.current < 800) {
        return;
      }

      try {
        const res = await fetchServerState(serverVersionRef.current, serverBootIdRef.current);
        if (cancelled) return;
        if (pendingWritesRef.current > 0 || Date.now() - lastLocalWriteAtRef.current < 800) {
          return;
        }
        const bootChanged = Boolean(res.bootId && res.bootId !== serverBootIdRef.current);
        if (
          res.changed &&
          res.state &&
          (bootChanged || res.state.version !== serverVersionRef.current)
        ) {
          applyServerState(res.state, res.bootId);
        }
      } catch {
        // Silent retry on next tick or WS reconnect
      }
    };

    const handleWsEvent = (event: RealtimeWsEvent) => {
      if (cancelled) return;
      if (event.type === 'pong') {
        if (
          event.bootId !== serverBootIdRef.current ||
          event.version !== serverVersionRef.current
        ) {
          pollServer();
        }
        return;
      }

      // Wait for initOrSyncWithServer to complete bootstrap decision before applying WS pushes
      if (!isBootstrappedRef.current) {
        return;
      }

      const isNewBoot = event.bootId !== serverBootIdRef.current;
      if (!isNewBoot && event.version <= serverVersionRef.current) {
        return;
      }

      serverBootIdRef.current = event.bootId;
      serverVersionRef.current = event.version;

      if (event.type === 'state:full') {
        preserveLocalIfRicher(event.state);
        applyServerState(event.state, event.bootId);
      } else if (event.type === 'state:slice') {
        applyServerSlice(event.slice, event.data);
      } else if (event.type === 'state:records') {
        const pendingLocalIds = Object.keys(recordPatchQueueRef.current);
        if (pendingLocalIds.length === 0) {
          setRecords(event.records);
        } else {
          setRecords((prev) => {
            const merged = { ...event.records };
            pendingLocalIds.forEach((id) => {
              if (prev[id]) merged[id] = prev[id];
            });
            return merged;
          });
        }
      } else if (event.type === 'state:sessions') {
        setSessionStates(event.sessionStates);
      }
    };

    const realtimeConn = connectRealtimeSync({
      onEvent: handleWsEvent,
      onOpen: () => {
        if (!cancelled) {
          pollServer();
        }
      },
    });

    const intervalId = window.setInterval(pollServer, 3000);
    const handleFocusOrOnline = () => {
      if (document.visibilityState === 'visible' || navigator.onLine) {
        pollServer();
        realtimeConn.requestSync();
      }
    };

    window.addEventListener('focus', handleFocusOrOnline);
    window.addEventListener('online', handleFocusOrOnline);
    document.addEventListener('visibilitychange', handleFocusOrOnline);

    return () => {
      cancelled = true;
      realtimeConn.close();
      window.clearInterval(intervalId);
      window.removeEventListener('focus', handleFocusOrOnline);
      window.removeEventListener('online', handleFocusOrOnline);
      document.removeEventListener('visibilitychange', handleFocusOrOnline);
    };
    // Run once on mount; initial local snapshot is intentionally captured at startup
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Resolve current logged-in user & role permissions
  const currentUser = useMemo(
    () => accounts.find((a) => a.id === currentUserId && a.isActive) || null,
    [accounts, currentUserId]
  );

  const currentRoleDef = useMemo(() => {
    if (!currentUser) return roleDefinitions[0];
    return roleDefinitions.find((r) => r.id === currentUser.roleId) || roleDefinitions[0];
  }, [currentUser, roleDefinitions]);

  const userPermissions = useMemo(
    () => currentRoleDef?.permissions || [],
    [currentRoleDef]
  );

  const allowedViews = useMemo(
    () => getAllowedViewsForPermissions(userPermissions),
    [userPermissions]
  );

  // Keep localStorage cache synchronized as fast offline fallback
  useEffect(() => {
    saveStoredRoutes(routes);
  }, [routes]);

  useEffect(() => {
    saveStoredStudents(students);
  }, [students]);

  useEffect(() => {
    saveStoredRecords(records);
  }, [records]);

  useEffect(() => {
    saveStoredSessions(sessionStates);
  }, [sessionStates]);

  useEffect(() => {
    saveStoredNotifications(notifications);
  }, [notifications]);

  useEffect(() => {
    saveStoredSheetsConfig(sheetsConfig);
  }, [sheetsConfig]);

  useEffect(() => {
    saveStoredZaloConfig(zaloConfig);
  }, [zaloConfig]);

  useEffect(() => {
    saveStoredDbLogs(dbLogs);
  }, [dbLogs]);

  useEffect(() => {
    saveStoredAccounts(accounts);
  }, [accounts]);

  useEffect(() => {
    saveStoredRoles(roleDefinitions);
  }, [roleDefinitions]);

  useEffect(() => {
    saveStoredSessionUserId(currentUserId);
  }, [currentUserId]);

  const lockedRouteId = useMemo(() => {
    if (
      currentUser &&
      !currentRoleDef?.isSystemAdmin &&
      currentUser.assignedRouteId &&
      currentUser.assignedRouteId !== 'all'
    ) {
      return currentUser.assignedRouteId;
    }
    return undefined;
  }, [currentUser, currentRoleDef]);

  const effectiveActiveRouteId = useMemo(() => {
    if (lockedRouteId) return lockedRouteId;
    if (routes.some((r) => r.id === activeRouteId)) return activeRouteId;
    return routes[0]?.id || activeRouteId;
  }, [lockedRouteId, routes, activeRouteId]);

  const handleSelectRoute = (nextRouteId: string) => {
    if (lockedRouteId) {
      setActiveRouteId(lockedRouteId);
      return;
    }
    setActiveRouteId(nextRouteId);
  };

  // Keep currentRole within allowed views whenever user/permissions change
  useEffect(() => {
    if (!currentUser) return;
    if (allowedViews.length > 0 && !allowedViews.includes(currentRole)) {
      setCurrentRole(getDefaultViewForPermissions(userPermissions));
    }
  }, [currentUser, allowedViews, currentRole, userPermissions]);

  // Enforce assignedRouteId whenever user/accounts/routes load or sync
  useEffect(() => {
    if (!lockedRouteId) return;
    if (activeRouteId !== lockedRouteId) {
      setActiveRouteId(lockedRouteId);
    }
  }, [lockedRouteId, activeRouteId]);

  // Current Route's session state
  const currentSessionState: RouteSessionState = sessionStates[effectiveActiveRouteId] || {
    date: todayDate,
    routeId: effectiveActiveRouteId,
    morningLocked: false,
    morningEmptyBusChecked: false,
    afternoonLocked: false,
    afternoonEmptyBusChecked: false,
  };

  // Flush queued record updates as a single atomic PATCH
  const enqueueRecordPatches = useCallback(
    (batch: Record<string, Partial<CheckinRecord>>) => {
      const nowTime = new Date().toLocaleTimeString('vi-VN', {
        hour: '2-digit',
        minute: '2-digit',
      });

      for (const [studentId, updates] of Object.entries(batch)) {
        const existingQueued = recordPatchQueueRef.current[studentId] || {};
        recordPatchQueueRef.current[studentId] = {
          ...existingQueued,
          ...updates,
          studentId,
          date: updates.date || existingQueued.date || todayDate,
          updatedAt: updates.updatedAt || nowTime,
        };
      }

      if (recordFlushTimerRef.current !== null) {
        window.clearTimeout(recordFlushTimerRef.current);
      }

      recordFlushTimerRef.current = window.setTimeout(() => {
        const payload = { ...recordPatchQueueRef.current };
        recordPatchQueueRef.current = {};
        recordFlushTimerRef.current = null;
        if (Object.keys(payload).length > 0) {
          runServerWrite(
            () => patchRecordsOnServer(payload),
            { kind: 'patch_records', updates: payload }
          );
        }
      }, 40);
    },
    [runServerWrite, todayDate]
  );

  const handleUpdateRecord = (studentId: string, updates: Partial<CheckinRecord>) => {
    const nowTime = new Date().toLocaleTimeString('vi-VN', {
      hour: '2-digit',
      minute: '2-digit',
    });

    setRecords((prev) => {
      const existing = prev[studentId] || {
        studentId,
        date: todayDate,
        morningPickupStatus: 'pending',
        morningSchoolStatus: 'pending',
        afternoonBoardStatus: 'pending',
        afternoonDropoffStatus: 'pending',
        updatedAt: '06:00',
      };
      return {
        ...prev,
        [studentId]: {
          ...existing,
          ...updates,
          updatedAt: nowTime,
        },
      };
    });

    enqueueRecordPatches({ [studentId]: { ...updates, updatedAt: nowTime } });
  };

  const handleUpdateRecordsBulk = (bulkUpdates: Record<string, Partial<CheckinRecord>>) => {
    const entries = Object.entries(bulkUpdates);
    if (entries.length === 0) return;
    const nowTime = new Date().toLocaleTimeString('vi-VN', {
      hour: '2-digit',
      minute: '2-digit',
    });

    setRecords((prev) => {
      const next = { ...prev };
      for (const [studentId, updates] of entries) {
        const existing = next[studentId] || {
          studentId,
          date: todayDate,
          morningPickupStatus: 'pending',
          morningSchoolStatus: 'pending',
          afternoonBoardStatus: 'pending',
          afternoonDropoffStatus: 'pending',
          updatedAt: '06:00',
        };
        next[studentId] = {
          ...existing,
          ...updates,
          updatedAt: nowTime,
        };
      }
      return next;
    });

    const stamped: Record<string, Partial<CheckinRecord>> = {};
    for (const [studentId, updates] of entries) {
      stamped[studentId] = { ...updates, updatedAt: nowTime };
    }
    enqueueRecordPatches(stamped);
  };

  const handleUpdateSessionState = (updates: Partial<RouteSessionState>) => {
    const targetRouteId = effectiveActiveRouteId;
    const existing = sessionStates[targetRouteId] || currentSessionState;
    // Send only the changed fields (+ date/routeId) so concurrent Driver & Supervisor updates never overwrite each other
    const patchPayload: Partial<RouteSessionState> = {
      date: updates.date || existing.date || todayDate,
      routeId: targetRouteId,
      ...updates,
    };

    setSessionStates((prev) => ({
      ...prev,
      [targetRouteId]: {
        ...(prev[targetRouteId] || existing),
        ...updates,
      },
    }));
    runServerWrite(
      () => patchSessionOnServer(targetRouteId, patchPayload),
      { kind: 'patch_session', routeId: targetRouteId, updates: patchPayload }
    );
  };

  // Push Notification dispatcher
  const handleSendNotification = (
    title: string,
    message: string,
    type: AppNotification['type'] = 'arrival',
    roleTarget: UserRole | 'all' = 'all'
  ) => {
    const now = new Date();
    const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(
      now.getMinutes()
    ).padStart(2, '0')}`;

    const newNotif: AppNotification = {
      id: `notif-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      title,
      message,
      timestamp: timeStr,
      type,
      routeId: effectiveActiveRouteId,
      isRead: false,
      roleTarget,
    };

    setNotifications((prev) => [newNotif, ...prev]);
    runServerWrite(
      () => appendItemToServer('notifications', newNotif, 100),
      { kind: 'append_item', slice: 'notifications', item: newNotif, maxItems: 100 }
    );

    // Real Web Notification API if permitted
    if (
      typeof window !== 'undefined' &&
      'Notification' in window &&
      Notification.permission === 'granted'
    ) {
      try {
        new Notification(title, {
          body: message,
          icon: '/favicon.ico',
        });
      } catch {
        // Ignored if blocked
      }
    }

    // Automated Zalo delivery when enabled and matching configured event trigger
    if (zaloConfig.enabled && currentUser) {
      const lowerTitle = title.toLowerCase();
      const lowerMsg = message.toLowerCase();
      const isEmptyBusEvent =
        lowerTitle.includes('xe trống') ||
        lowerMsg.includes('không bỏ quên') ||
        lowerMsg.includes('xe trống');
      const isDriverReportEvent =
        lowerTitle.includes('báo cáo') || lowerMsg.includes('báo cáo điểm danh');

      const shouldAutoSend =
        (type === 'arrival' && zaloConfig.notifyOnStopArrival) ||
        (type === 'absence' && zaloConfig.notifyOnParentAbsence) ||
        (type === 'lock' && zaloConfig.notifyOnSupervisorLock) ||
        (isEmptyBusEvent && zaloConfig.notifyOnEmptyBus) ||
        (isDriverReportEvent && zaloConfig.notifyOnDriverReport);

      if (shouldAutoSend) {
        const activeRoute = routes.find((r) => r.id === effectiveActiveRouteId);
        sendZaloNotificationViaServer({
          callerAccountId: currentUser.id,
          title,
          message,
          routeId: effectiveActiveRouteId,
          routeCode: activeRoute?.code,
        }).then((res) => {
          const logItem: ZaloDeliveryLog = {
            id: `zlog-auto-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            timestamp: timeStr,
            title,
            message,
            mode: zaloConfig.deliveryMode,
            recipientSummary: activeRoute ? `Tự động (${activeRoute.code})` : 'Tự động',
            ok: res.ok,
            detail: res.message,
          };
          setZaloLogs((prev) => [logItem, ...prev].slice(0, 100));
        });
      }
    }
  };

  const handleMarkAllNotifsRead = () => {
    const next = notifications.map((n) => ({ ...n, isRead: true }));
    setNotifications(next);
    runServerWrite(() => pushSliceToServer('notifications', next));
  };

  const handleClearAllNotifs = () => {
    setNotifications([]);
    runServerWrite(() => pushSliceToServer('notifications', []));
  };

  // QR Scan callback
  const handleQrScanSuccess = (scannedStudent: Student) => {
    const timeStr = new Date().toLocaleTimeString('vi-VN', {
      hour: '2-digit',
      minute: '2-digit',
    });

    if (currentRole === 'driver') {
      if (activeSessionType === 'morning') {
        handleUpdateRecord(scannedStudent.id, {
          morningPickupStatus: 'boarded',
          morningPickupTime: timeStr,
        });
        handleSendNotification(
          `Quét thẻ thành công: ${scannedStudent.name}`,
          `Học sinh ${scannedStudent.name} (${scannedStudent.class}) đã quét thẻ lên xe lúc ${timeStr}.`,
          'boarded'
        );
      } else {
        handleUpdateRecord(scannedStudent.id, {
          afternoonDropoffStatus: 'dropped_off',
          afternoonDropoffTime: timeStr,
        });
      }
    } else if (currentRole === 'supervisor') {
      if (activeSessionType === 'morning') {
        handleUpdateRecord(scannedStudent.id, {
          morningSchoolStatus: 'dropped_at_school',
          morningSchoolTime: timeStr,
          morningSchoolVerifier: 'Cán bộ cổng trường (QR)',
        });
        handleSendNotification(
          `Cổng trường: ${scannedStudent.name} đã vào lớp`,
          `Bé ${scannedStudent.name} (${scannedStudent.class}) đã được xác thực an toàn tại cổng trường lúc ${timeStr}.`,
          'school_arrival'
        );
      } else {
        handleUpdateRecord(scannedStudent.id, {
          afternoonBoardStatus: 'boarded',
          afternoonBoardTime: timeStr,
        });
      }
    }
  };

  // Student CRUD (Admin)
  const handleAddStudent = (newS: Student) => {
    const nextStudents = [...students, newS];
    setStudents(nextStudents);
    runServerWrite(
      () => pushSliceToServer('students', nextStudents),
      { kind: 'put_slice', slice: 'students', data: nextStudents }
    );

    handleUpdateRecord(newS.id, {
      studentId: newS.id,
      date: todayDate,
      morningPickupStatus: 'pending',
      morningSchoolStatus: 'pending',
      afternoonBoardStatus: 'pending',
      afternoonDropoffStatus: 'pending',
      updatedAt: '06:00',
    });
  };

  const handleUpdateStudent = (updatedS: Student) => {
    const nextStudents = students.map((s) => (s.id === updatedS.id ? updatedS : s));
    setStudents(nextStudents);
    runServerWrite(
      () => pushSliceToServer('students', nextStudents),
      { kind: 'put_slice', slice: 'students', data: nextStudents }
    );
  };

  const handleDeleteStudent = (id: string) => {
    const nextStudents = students.filter((s) => s.id !== id);
    setStudents(nextStudents);
    setRecords((prev) => {
      const copy = { ...prev };
      delete copy[id];
      return copy;
    });
    runServerWrite(async () => {
      await pushSliceToServer('students', nextStudents);
      return patchRecordsOnServer(undefined, [id]);
    });
  };

  const handleDeleteStudentsBulk = (ids: string[]) => {
    if (ids.length === 0) return;
    const idSet = new Set(ids);
    const nextStudents = students.filter((s) => !idSet.has(s.id));
    setStudents(nextStudents);
    setRecords((prev) => {
      const copy = { ...prev };
      ids.forEach((id) => delete copy[id]);
      return copy;
    });
    runServerWrite(async () => {
      await pushSliceToServer('students', nextStudents);
      return patchRecordsOnServer(undefined, ids);
    });
  };

  const handleImportStudents = (newStudentsList: Student[]) => {
    const nextStudents = [...students, ...newStudentsList];
    setStudents(nextStudents);
    const nowTime = new Date().toLocaleTimeString('vi-VN', {
      hour: '2-digit',
      minute: '2-digit',
    });
    const newRecordsBatch: Record<string, CheckinRecord> = {};
    newStudentsList.forEach((s) => {
      newRecordsBatch[s.id] = {
        studentId: s.id,
        date: todayDate,
        morningPickupStatus: 'pending',
        morningSchoolStatus: 'pending',
        afternoonBoardStatus: 'pending',
        afternoonDropoffStatus: 'pending',
        updatedAt: nowTime,
      };
    });
    setRecords((prev) => ({ ...prev, ...newRecordsBatch }));
    runServerWrite(async () => {
      await pushSliceToServer('students', nextStudents);
      return patchRecordsOnServer(newRecordsBatch);
    });
  };

  // Route CRUD (Admin)
  const handleAddRoute = (newRoute: Route) => {
    const nextRoutes = sortRoutesByOrder([...routes, newRoute]);
    setRoutes(nextRoutes);
    runServerWrite(
      () => pushSliceToServer('routes', nextRoutes),
      { kind: 'put_slice', slice: 'routes', data: nextRoutes }
    );
  };

  const handleUpdateRoute = (updatedRoute: Route) => {
    const nextRoutes = sortRoutesByOrder(
      routes.map((r) => (r.id === updatedRoute.id ? updatedRoute : r))
    );
    const validStopIds = new Set(updatedRoute.stops.map((st) => st.id));
    const fallbackStopId = updatedRoute.stops[0]?.id || '';
    const nextStudents = students.map((s) =>
      s.routeId === updatedRoute.id && !validStopIds.has(s.stopId)
        ? { ...s, stopId: fallbackStopId }
        : s
    );

    setRoutes(nextRoutes);
    setStudents(nextStudents);
    runServerWrite(async () => {
      const res = await pushSliceToServer('routes', nextRoutes);
      await pushSliceToServer('students', nextStudents);
      return res;
    });
  };

  const handleDeleteRoute = (routeId: string, studentAction?: string) => {
    if (routes.length <= 1) return;
    const remainingRoutes = sortRoutesByOrder(routes.filter((r) => r.id !== routeId));
    const affectedStudents = students.filter((s) => s.routeId === routeId);
    const fallbackRoute =
      remainingRoutes.find((r) => r.id === studentAction) || remainingRoutes[0];

    setRoutes(remainingRoutes);
    if (activeRouteId === routeId && fallbackRoute) {
      setActiveRouteId(fallbackRoute.id);
    }

    let nextStudents = students;
    let deleteIds: string[] = [];

    if (affectedStudents.length > 0) {
      if (studentAction === '__delete_students__') {
        deleteIds = affectedStudents.map((s) => s.id);
        nextStudents = students.filter((s) => s.routeId !== routeId);
        setStudents(nextStudents);
        setRecords((prev) => {
          const copy = { ...prev };
          deleteIds.forEach((id) => delete copy[id]);
          return copy;
        });
      } else if (fallbackRoute) {
        nextStudents = students.map((s) =>
          s.routeId === routeId
            ? { ...s, routeId: fallbackRoute.id, stopId: fallbackRoute.stops[0]?.id || '' }
            : s
        );
        setStudents(nextStudents);
      }
    }

    setSessionStates((prev) => {
      const copy = { ...prev };
      delete copy[routeId];
      return copy;
    });

    runServerWrite(async () => {
      await pushSliceToServer('routes', remainingRoutes);
      if (affectedStudents.length > 0) {
        await pushSliceToServer('students', nextStudents);
      }
      if (deleteIds.length > 0) {
        await patchRecordsOnServer(undefined, deleteIds);
      }
      return patchSessionOnServer(undefined, undefined, routeId);
    });
  };

  const handleResetData = () => {
    resetAllData();
    const defaultRecords = createInitialRecords(INITIAL_STUDENTS);
    setRoutes(INITIAL_ROUTES);
    setStudents(INITIAL_STUDENTS);
    setRecords(defaultRecords);
    setSessionStates(INITIAL_ROUTE_SESSIONS);
    setNotifications(INITIAL_NOTIFICATIONS);
    setDbLogs([]);
    setActiveRouteId(INITIAL_ROUTES[0]?.id || 'route-1');

    runServerWrite(async () => {
      const res = await resetServerBusData({
        routes: INITIAL_ROUTES,
        students: INITIAL_STUDENTS,
        records: defaultRecords,
        sessionStates: INITIAL_ROUTE_SESSIONS,
        notifications: INITIAL_NOTIFICATIONS,
      });
      return { version: res.state.version };
    });
  };

  const handleUpdateSheetsConfig = (nextConfig: GoogleSheetsConfig) => {
    setSheetsConfig(nextConfig);
    runServerWrite(
      () => pushSliceToServer('sheetsConfig', nextConfig),
      { kind: 'put_slice', slice: 'sheetsConfig', data: nextConfig }
    );
  };

  const handleUpdateZaloConfig = (nextConfig: ZaloConfig) => {
    setZaloConfig(nextConfig);
    runServerWrite(
      () => pushSliceToServer('zaloConfig', nextConfig),
      { kind: 'put_slice', slice: 'zaloConfig', data: nextConfig }
    );
  };

  const handleAddZaloLog = (log: ZaloDeliveryLog) => {
    setZaloLogs((prev) => [log, ...prev].slice(0, 100));
  };

  const handleOpenZaloModal = (prefill?: { title: string; message: string; routeId?: string }) => {
    setZaloPrefill(prefill || null);
    setIsZaloModalOpen(true);
  };

  // Auth & RBAC Handlers
  const handleLoginSuccess = (user: UserAccount) => {
    const loginTime = new Date().toISOString();
    const nextAccounts = accounts.map((a) =>
      a.id === user.id ? { ...a, lastLoginAt: loginTime } : a
    );
    setAccounts(nextAccounts);
    setCurrentUserId(user.id);
    runServerWrite(
      () => stampLoginOnServer(user.id, loginTime),
      { kind: 'login_stamp', accountId: user.id, lastLoginAt: loginTime }
    );

    const roleDef = roleDefinitions.find((r) => r.id === user.roleId);
    const perms = roleDef?.permissions || [];
    setCurrentRole(getDefaultViewForPermissions(perms));

    if (
      user.assignedRouteId &&
      user.assignedRouteId !== 'all' &&
      routes.some((r) => r.id === user.assignedRouteId)
    ) {
      setActiveRouteId(user.assignedRouteId);
    }
  };

  const handleLogout = () => {
    setCurrentUserId(null);
    setIsChangePasswordOpen(false);
    setIsNotifDrawerOpen(false);
    setIsSheetsModalOpen(false);
    setIsZaloModalOpen(false);
    setIsQrScannerOpen(false);
  };

  const handleAddAccount = (newAccount: UserAccount) => {
    const nextAccounts = [...accounts, newAccount];
    setAccounts(nextAccounts);
    runServerWrite(() => pushSliceToServer('accounts', nextAccounts));
  };

  const handleUpdateAccount = (updatedAccount: UserAccount) => {
    const nextAccounts = accounts.map((a) =>
      a.id === updatedAccount.id ? updatedAccount : a
    );
    setAccounts(nextAccounts);
    runServerWrite(() => pushSliceToServer('accounts', nextAccounts));
  };

  const handleDeleteAccount = (accountId: string) => {
    if (accountId === currentUserId) return;
    const nextAccounts = accounts.filter((a) => a.id !== accountId);
    setAccounts(nextAccounts);
    runServerWrite(() => pushSliceToServer('accounts', nextAccounts));
  };

  const handleResetAccountPassword = (
    accountId: string,
    newPassword: string,
    mustChangePassword: boolean
  ) => {
    const newHash = hashPassword(newPassword);
    const nextAccounts = accounts.map((a) =>
      a.id === accountId ? { ...a, passwordHash: newHash, mustChangePassword } : a
    );
    setAccounts(nextAccounts);
    runServerWrite(() => pushSliceToServer('accounts', nextAccounts));
  };

  const handleChangeOwnPassword = (newPassword: string) => {
    if (!currentUser) return;
    const newHash = hashPassword(newPassword);
    const nextAccounts = accounts.map((a) =>
      a.id === currentUser.id ? { ...a, passwordHash: newHash, mustChangePassword: false } : a
    );
    setAccounts(nextAccounts);
    setIsChangePasswordOpen(false);
    runServerWrite(() => pushSliceToServer('accounts', nextAccounts));
  };

  const handleAddRoleDef = (newRole: RoleDefinition) => {
    const nextRoles = [...roleDefinitions, newRole];
    setRoleDefinitions(nextRoles);
    runServerWrite(() => pushSliceToServer('roleDefinitions', nextRoles));
  };

  const handleUpdateRoleDef = (updatedRole: RoleDefinition) => {
    const nextRoles = roleDefinitions.map((r) =>
      r.id === updatedRole.id ? updatedRole : r
    );
    setRoleDefinitions(nextRoles);
    runServerWrite(() => pushSliceToServer('roleDefinitions', nextRoles));
  };

  const handleDeleteRoleDef = (roleId: string, migrateToRoleId: string) => {
    const target = roleDefinitions.find((r) => r.id === roleId);
    if (!target || target.isSystemAdmin) return;
    const nextRoles = roleDefinitions.filter((r) => r.id !== roleId);
    setRoleDefinitions(nextRoles);

    let nextAccounts = accounts;
    if (migrateToRoleId) {
      nextAccounts = accounts.map((a) =>
        a.roleId === roleId ? { ...a, roleId: migrateToRoleId } : a
      );
      setAccounts(nextAccounts);
    }

    runServerWrite(async () => {
      const res = await pushSliceToServer('roleDefinitions', nextRoles);
      if (migrateToRoleId) {
        await pushSliceToServer('accounts', nextAccounts);
      }
      return res;
    });
  };

  const handleSaveDbLog = (newLog: DatabaseSaveLog) => {
    setDbLogs((prev) => [newLog, ...prev.filter((l) => l.id !== newLog.id)].slice(0, 2000));
    runServerWrite(
      () => appendItemToServer('dbLogs', newLog, 2000),
      { kind: 'append_item', slice: 'dbLogs', item: newLog, maxItems: 2000 }
    );
  };

  const handleImportFullBackup = async (snapshot: Partial<ServerStatePayload>) => {
    const res = await importFullServerState(snapshot);
    applyServerState(res.state, res.bootId);
    isBootstrappedRef.current = true;
  };

  if (!currentUser || !currentRoleDef) {
    return <LoginScreen accounts={accounts} onLoginSuccess={handleLoginSuccess} />;
  }

  const unreadNotifCount = notifications.filter((n) => !n.isRead).length;

  return (
    <div className="min-h-screen bg-slate-100/70 text-slate-900 flex flex-col font-sans pb-12">
      {/* Top Main Navigation Header */}
      <Header
        currentRole={currentRole}
        onSelectRole={setCurrentRole}
        unreadNotifCount={unreadNotifCount}
        onOpenNotifications={() => setIsNotifDrawerOpen(true)}
        onOpenSheetsModal={() => setIsSheetsModalOpen(true)}
        sheetsConfig={sheetsConfig}
        onOpenZaloModal={() => handleOpenZaloModal()}
        zaloConfig={zaloConfig}
        activeSessionType={activeSessionType}
        onToggleSessionType={setActiveSessionType}
        currentUser={currentUser}
        currentRoleDef={currentRoleDef}
        userPermissions={userPermissions}
        onOpenChangePassword={() => setIsChangePasswordOpen(true)}
        onLogout={handleLogout}
      />

      {/* Main Container */}
      <main className="max-w-7xl mx-auto px-3 sm:px-6 py-4 sm:py-6 flex-1 w-full">
        {currentRole === 'driver' && allowedViews.includes('driver') && (
          <DriverView
            routes={routes}
            activeRouteId={effectiveActiveRouteId}
            lockedRouteId={lockedRouteId}
            onSelectRoute={handleSelectRoute}
            students={students}
            records={records}
            onUpdateRecord={handleUpdateRecord}
            onUpdateRecordsBulk={handleUpdateRecordsBulk}
            sessionState={currentSessionState}
            onUpdateSessionState={handleUpdateSessionState}
            activeSessionType={activeSessionType}
            onSendNotification={(title, msg, type, roleTarget) =>
              handleSendNotification(title, msg, type, roleTarget || 'all')
            }
            onOpenQrScanner={() => setIsQrScannerOpen(true)}
          />
        )}

        {currentRole === 'supervisor' && allowedViews.includes('supervisor') && (
          <SupervisorView
            routes={routes}
            activeRouteId={effectiveActiveRouteId}
            lockedRouteId={lockedRouteId}
            onSelectRoute={handleSelectRoute}
            students={students}
            records={records}
            onUpdateRecord={handleUpdateRecord}
            sessionState={currentSessionState}
            sessionStates={sessionStates}
            onUpdateSessionState={handleUpdateSessionState}
            activeSessionType={activeSessionType}
            onSendNotification={(title, msg, type) => handleSendNotification(title, msg, type, 'all')}
            onOpenQrScanner={() => setIsQrScannerOpen(true)}
            sheetsConfig={sheetsConfig}
            onOpenSheetsModal={() => setIsSheetsModalOpen(true)}
            todayDate={todayDate}
            onSaveDbLog={handleSaveDbLog}
            dbLogs={dbLogs}
            defaultSupervisorName={currentUser.fullName}
          />
        )}

        {currentRole === 'parent' && allowedViews.includes('parent') && (
          <ParentView
            students={students}
            routes={routes}
            records={records}
            onUpdateRecord={handleUpdateRecord}
            onSendNotification={(title, msg, type) => handleSendNotification(title, msg, type, 'driver')}
            onViewStudentCard={(s) => setSelectedStudentForCard(s)}
            initialStudentId={currentUser.assignedStudentId}
          />
        )}

        {currentRole === 'admin' && allowedViews.includes('admin') && (
          <AdminView
            students={students}
            routes={routes}
            records={records}
            onAddStudent={handleAddStudent}
            onUpdateStudent={handleUpdateStudent}
            onDeleteStudent={handleDeleteStudent}
            onDeleteStudentsBulk={handleDeleteStudentsBulk}
            onImportStudents={handleImportStudents}
            onAddRoute={handleAddRoute}
            onUpdateRoute={handleUpdateRoute}
            onDeleteRoute={handleDeleteRoute}
            onResetData={handleResetData}
            onViewStudentCard={(s) => setSelectedStudentForCard(s)}
            onOpenSheetsModal={() => setIsSheetsModalOpen(true)}
            sheetsConfig={sheetsConfig}
            todayDate={todayDate}
            onNavigateToAnalytics={() => setCurrentRole('analytics')}
            userPermissions={userPermissions}
            currentUser={currentUser}
            accounts={accounts}
            roleDefinitions={roleDefinitions}
            onAddAccount={handleAddAccount}
            onUpdateAccount={handleUpdateAccount}
            onDeleteAccount={handleDeleteAccount}
            onResetAccountPassword={handleResetAccountPassword}
            onAddRoleDef={handleAddRoleDef}
            onUpdateRoleDef={handleUpdateRoleDef}
            onDeleteRoleDef={handleDeleteRoleDef}
            sessionStates={sessionStates}
            activeSessionType={activeSessionType}
            dbLogs={dbLogs}
            onImportFullBackup={handleImportFullBackup}
            localSafetySnapshot={localSafetySnapshot}
            onRestoreLocalSafetySnapshot={async () => {
              if (!localSafetySnapshot) return;
              await handleImportFullBackup({
                routes: localSafetySnapshot.routes,
                students: localSafetySnapshot.students,
                records: localSafetySnapshot.records,
                sessionStates: localSafetySnapshot.sessionStates,
                sheetsConfig: localSafetySnapshot.sheetsConfig,
              });
              clearLocalSafetySnapshot();
              setLocalSafetySnapshot(null);
            }}
            onDismissLocalSafetySnapshot={() => {
              clearLocalSafetySnapshot();
              setLocalSafetySnapshot(null);
            }}
          />
        )}

        {currentRole === 'analytics' && allowedViews.includes('analytics') && (
          <AnalyticsDashboard
            routes={routes}
            students={students}
            records={records}
            sessionStates={sessionStates}
            dbLogs={dbLogs}
            todayDate={todayDate}
            onExportCsv={() => {
              const csvContent = exportRecordsToCSV(students, routes, records, todayDate);
              const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
              const url = URL.createObjectURL(blob);
              const link = document.createElement('a');
              link.href = url;
              link.setAttribute('download', `DiemDanh_XeTuyen_${todayDate}.csv`);
              document.body.appendChild(link);
              link.click();
              document.body.removeChild(link);
            }}
          />
        )}
      </main>

      {/* QR / Barcode Scanner Modal */}
      <QrScannerModal
        isOpen={isQrScannerOpen}
        onClose={() => setIsQrScannerOpen(false)}
        students={students.filter(
          (s) =>
            (s.routeId === effectiveActiveRouteId &&
              !isTransferredOutAcceptedForSession(records[s.id], effectiveActiveRouteId, activeSessionType)) ||
            isTransferredInAcceptedForSession(records[s.id], effectiveActiveRouteId, activeSessionType)
        )}
        onScanSuccess={handleQrScanSuccess}
        title={
          currentRole === 'driver'
            ? 'Lái Xe Quét Thẻ Lên Xe (QR)'
            : 'Giám Sát Quét Thẻ Vào Cổng Trường'
        }
        actionLabel={currentRole === 'driver' ? 'Đón lên xe' : 'Vào trường'}
      />

      {/* Google Sheets Sync & Advice Modal */}
      <GoogleSheetsModal
        isOpen={isSheetsModalOpen}
        onClose={() => setIsSheetsModalOpen(false)}
        config={sheetsConfig}
        onSaveConfig={handleUpdateSheetsConfig}
        students={students}
        routes={routes}
        records={records}
        sessionStates={sessionStates}
        dbLogs={dbLogs}
        todayDate={todayDate}
      />

      {/* Zalo Notification & Direct Messaging Modal */}
      <ZaloModal
        isOpen={isZaloModalOpen}
        onClose={() => {
          setIsZaloModalOpen(false);
          setZaloPrefill(null);
        }}
        config={zaloConfig}
        onSaveConfig={handleUpdateZaloConfig}
        routes={routes}
        students={students}
        records={records}
        activeRouteId={effectiveActiveRouteId}
        activeSessionType={activeSessionType}
        todayDate={todayDate}
        currentUser={currentUser}
        canConfigureZalo={
          Boolean(currentRoleDef.isSystemAdmin) ||
          userPermissions.includes('manage_sheets') ||
          userPermissions.includes('manage_accounts')
        }
        zaloLogs={zaloLogs}
        onAddZaloLog={handleAddZaloLog}
        prefill={zaloPrefill}
      />

      {/* Real-time Notification Drawer */}
      <NotificationDrawer
        isOpen={isNotifDrawerOpen}
        onClose={() => setIsNotifDrawerOpen(false)}
        notifications={notifications}
        onMarkAllAsRead={handleMarkAllNotifsRead}
        onClearAll={handleClearAllNotifs}
        currentRole={currentRole}
        onShareToZalo={(prefill) => handleOpenZaloModal(prefill)}
        onSendTestNotification={() => {
          const sampleStops = [
            'KĐT Ngoại Giao Đoàn',
            'Chung cư Golden Park',
            'Royal City',
            'Metropolis Liễu Giai',
          ];
          const randomStop = sampleStops[Math.floor(Math.random() * sampleStops.length)];
          handleSendNotification(
            `🚌 Thông báo: Xe đã đến điểm ${randomStop}`,
            `Xe buýt đón học sinh đã cập bến tại ${randomStop}. Kính mời phụ huynh đưa con ra xe!`,
            'arrival'
          );
        }}
      />

      {/* Student Bus Pass ID Card Modal */}
      <StudentIdCardModal
        student={selectedStudentForCard}
        route={routes.find((r) => r.id === selectedStudentForCard?.routeId)}
        onClose={() => setSelectedStudentForCard(null)}
      />

      {/* Change Password Modal (Voluntary or Forced on Admin Password Reset) */}
      <ChangePasswordModal
        isOpen={isChangePasswordOpen || Boolean(currentUser.mustChangePassword)}
        currentUser={currentUser}
        forceRequired={Boolean(currentUser.mustChangePassword)}
        onClose={() => setIsChangePasswordOpen(false)}
        onChangePassword={handleChangeOwnPassword}
      />
    </div>
  );
}
