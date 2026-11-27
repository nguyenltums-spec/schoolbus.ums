import React, { useState, useEffect } from 'react';
import {
  ShieldCheck,
  CheckCircle2,
  Lock,
  Unlock,
  AlertTriangle,
  Search,
  UserCheck,
  UserX,
  FileSpreadsheet,
  QrCode,
  Phone,
  Database,
  ArrowRightLeft,
  ClipboardCheck,
} from 'lucide-react';
import confetti from 'canvas-confetti';
import {
  Route,
  Student,
  CheckinRecord,
  RouteSessionState,
  GoogleSheetsConfig,
  DatabaseSaveLog,
} from '../../types';
import { playSound } from '../../services/notificationAudio';
import { buildRouteGoogleSheetPayload, syncToGoogleSheets } from '../../services/storageService';
import { RouteAttendanceOverview } from '../common/RouteAttendanceOverview';
import {
  getSessionTransfer,
  isTransferredInAcceptedForSession,
  isTransferredOutAcceptedForSession,
} from '../../utils/transferHelpers';

interface Props {
  routes: Route[];
  activeRouteId: string;
  lockedRouteId?: string;
  onSelectRoute: (id: string) => void;
  students: Student[];
  records: Record<string, CheckinRecord>;
  onUpdateRecord: (studentId: string, updates: Partial<CheckinRecord>) => void;
  sessionState: RouteSessionState;
  sessionStates: Record<string, RouteSessionState>;
  onUpdateSessionState: (updates: Partial<RouteSessionState>) => void;
  activeSessionType: 'morning' | 'afternoon';
  onSendNotification: (title: string, message: string, type: 'school_arrival' | 'lock' | 'alert') => void;
  onOpenQrScanner: () => void;
  sheetsConfig: GoogleSheetsConfig;
  onOpenSheetsModal: () => void;
  todayDate: string;
  onSaveDbLog: (log: DatabaseSaveLog) => void;
  dbLogs: DatabaseSaveLog[];
  defaultSupervisorName?: string;
}

export const SupervisorView: React.FC<Props> = ({
  routes,
  activeRouteId,
  lockedRouteId,
  onSelectRoute,
  students,
  records,
  onUpdateRecord,
  sessionState,
  sessionStates,
  onUpdateSessionState,
  activeSessionType,
  onSendNotification,
  onOpenQrScanner,
  sheetsConfig,
  onOpenSheetsModal,
  todayDate,
  onSaveDbLog,
  dbLogs,
  defaultSupervisorName,
}) => {
  const isRouteLocked = Boolean(lockedRouteId);
  const resolvedRoute = isRouteLocked
    ? routes.find((r) => r.id === lockedRouteId)
    : routes.find((r) => r.id === activeRouteId) || routes[0];

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'done' | 'absent'>('all');
  const [showFleetTable, setShowFleetTable] = useState(true);
  const [supervisorName, setSupervisorName] = useState(
    defaultSupervisorName || 'Cô Nguyễn Bích Thủy (Ban Giám Sát Cổng)'
  );
  const [isLocking, setIsLocking] = useState(false);
  const [syncStatus, setSyncStatus] = useState<{
    type: 'success' | 'error' | 'info';
    message: string;
  } | null>(null);

  useEffect(() => {
    if (defaultSupervisorName) {
      setSupervisorName(defaultSupervisorName);
    }
  }, [defaultSupervisorName]);

  if (!resolvedRoute) {
    return (
      <div className="bg-white rounded-2xl p-8 border border-rose-200 shadow-xs text-center space-y-2">
        <AlertTriangle className="w-8 h-8 text-rose-500 mx-auto" />
        <h3 className="text-base font-extrabold text-slate-900">
          Chưa tìm thấy tuyến xe được phân công cho tài khoản này
        </h3>
        <p className="text-xs text-slate-500 max-w-md mx-auto">
          Vui lòng liên hệ Quản trị viên để kiểm tra lại tuyến xe phụ trách.
        </p>
      </div>
    );
  }

  const currentRoute = resolvedRoute;

  // Native students + incoming accepted transfer students (strictly scoped by activeSessionType)
  const nativeStudents = students.filter((s) => s.routeId === currentRoute.id);
  const incomingStudents = students.filter(
    (s) =>
      s.routeId !== currentRoute.id &&
      isTransferredInAcceptedForSession(records[s.id], currentRoute.id, activeSessionType)
  );
  const displayStudents = [...incomingStudents, ...nativeStudents];

  const isTransferredOutAccepted = (s: Student) =>
    isTransferredOutAcceptedForSession(records[s.id], currentRoute.id, activeSessionType);

  const isTransferredInAccepted = (s: Student) =>
    s.routeId !== currentRoute.id &&
    isTransferredInAcceptedForSession(records[s.id], currentRoute.id, activeSessionType);

  // Students who actually ride THIS bus in the current session
  const activeBusRiders = displayStudents.filter((s) => !isTransferredOutAccepted(s));
  const transferredOutStudents = nativeStudents.filter((s) => isTransferredOutAccepted(s));

  const total = nativeStudents.length;

  // Morning counts
  const morningDriverBoarded = activeBusRiders.filter(
    (s) => records[s.id]?.morningPickupStatus === 'boarded'
  ).length;
  const morningDriverAbsent = activeBusRiders.filter(
    (s) => records[s.id]?.morningPickupStatus === 'absent'
  ).length;
  const morningSchoolVerified = activeBusRiders.filter(
    (s) =>
      records[s.id]?.morningPickupStatus === 'boarded' &&
      records[s.id]?.morningSchoolStatus === 'dropped_at_school'
  ).length;

  // Afternoon counts
  const afternoonBoarded = activeBusRiders.filter(
    (s) => records[s.id]?.afternoonBoardStatus === 'boarded'
  ).length;
  const afternoonAbsent = activeBusRiders.filter(
    (s) => records[s.id]?.afternoonBoardStatus === 'absent'
  ).length;
  const afternoonDroppedCount = activeBusRiders.filter(
    (s) => records[s.id]?.afternoonDropoffStatus === 'dropped_off'
  ).length;

  // Detect discrepancies: driver marked boarded in morning, not yet verified at school gate
  const morningDiscrepancies = activeBusRiders.filter((s) => {
    const rec = records[s.id];
    return rec?.morningPickupStatus === 'boarded' && rec?.morningSchoolStatus !== 'dropped_at_school';
  });

  const isLocked =
    activeSessionType === 'morning' ? sessionState?.morningLocked : sessionState?.afternoonLocked;
  const isDriverReportSubmitted =
    activeSessionType === 'morning'
      ? Boolean(sessionState?.morningReportSubmitted)
      : Boolean(sessionState?.afternoonReportSubmitted);
  const driverReportedCount =
    activeSessionType === 'morning'
      ? sessionState?.morningReportedBoarded ?? morningDriverBoarded
      : sessionState?.afternoonReportedBoarded ?? afternoonBoarded;
  const countsMatchDriverReport =
    activeSessionType === 'morning'
      ? morningSchoolVerified === morningDriverBoarded && morningDriverBoarded > 0
      : afternoonBoarded >= 0;

  const getNowTime = () => {
    const now = new Date();
    return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  };

  // Verification actions
  const handleVerifyStudentAtSchool = (studentId: string) => {
    if (isLocked) return;
    const rec = records[studentId];
    // Never confirm absent or pending students as entering school from bus
    if (rec?.morningPickupStatus !== 'boarded') return;

    playSound('beep');
    const timeStr = getNowTime();
    const isAlreadyVerified = rec?.morningSchoolStatus === 'dropped_at_school';

    onUpdateRecord(studentId, {
      morningSchoolStatus: isAlreadyVerified ? 'pending' : 'dropped_at_school',
      morningSchoolTime: isAlreadyVerified ? undefined : timeStr,
      morningSchoolVerifier: isAlreadyVerified ? undefined : supervisorName,
    });
  };

  const handleVerifyAllAtSchool = () => {
    if (isLocked) return;
    playSound('success');
    const timeStr = getNowTime();

    activeBusRiders.forEach((s) => {
      const rec = records[s.id];
      if (rec?.morningPickupStatus === 'boarded') {
        onUpdateRecord(s.id, {
          morningSchoolStatus: 'dropped_at_school',
          morningSchoolTime: timeStr,
          morningSchoolVerifier: supervisorName,
        });
      }
    });
  };

  // Afternoon verification
  const handleVerifyAfternoonBoarding = (studentId: string, boarded: boolean) => {
    if (isLocked) return;
    playSound(boarded ? 'beep' : 'alert');
    const timeStr = getNowTime();

    onUpdateRecord(studentId, {
      afternoonBoardStatus: boarded ? 'boarded' : 'absent',
      afternoonBoardTime: boarded ? timeStr : undefined,
    });
  };

  const handleVerifyAllAfternoon = () => {
    if (isLocked) return;
    playSound('success');
    const timeStr = getNowTime();

    activeBusRiders.forEach((s) => {
      const rec = records[s.id];
      if (rec?.afternoonBoardStatus !== 'absent') {
        onUpdateRecord(s.id, {
          afternoonBoardStatus: 'boarded',
          afternoonBoardTime: timeStr,
        });
      }
    });
  };

  // Official Lock-in & Commit to Database (Chốt Sổ & Cập Nhật CSDL)
  const handleLockSession = async () => {
    setIsLocking(true);
    playSound('lock');

    try {
      confetti({
        particleCount: 80,
        spread: 70,
        origin: { y: 0.6 },
      });
    } catch {
      // Confetti fallback
    }

    const timeStr = getNowTime();
    let syncedSheet = false;

    if (activeSessionType === 'morning') {
      onUpdateSessionState({
        morningLocked: true,
        morningLockedBy: supervisorName,
        morningLockedAt: timeStr,
        morningDbSavedAt: timeStr,
      });

      onSendNotification(
        `🔒 ĐÃ XÁC NHẬN & LƯU CSDL SÁNG - ${currentRoute.code}`,
        `Giám sát ${supervisorName} đã đối chiếu khớp thực tế ${morningSchoolVerified}/${morningDriverBoarded} học sinh đi xe ${currentRoute.code} (Vắng: ${morningDriverAbsent}) và lưu vào CSDL lúc ${timeStr}.`,
        'lock'
      );
    } else {
      onUpdateSessionState({
        afternoonLocked: true,
        afternoonLockedBy: supervisorName,
        afternoonLockedAt: timeStr,
        afternoonDbSavedAt: timeStr,
      });

      onSendNotification(
        `🔒 ĐÃ CHỐT & LƯU CSDL CHIỀU - ${currentRoute.code}`,
        `Đã chốt danh sách ${afternoonBoarded} học sinh lên xe chiều lúc ${timeStr}. Cho phép xe ${currentRoute.plateNumber} xuất phát!`,
        'lock'
      );
    }

    // Auto sync to Google Sheets if configured
    if (sheetsConfig.webhookUrl && sheetsConfig.autoSync !== false) {
      setSyncStatus({
        type: 'info',
        message: 'Đang cập nhật dữ liệu lên CSDL Google Sheets...',
      });
      try {
        const payload = buildRouteGoogleSheetPayload({
          route: currentRoute,
          students,
          records,
          date: todayDate,
          sessionType: activeSessionType,
          lockedBy: supervisorName,
          sheetName: sheetsConfig.sheetName,
        });

        const result = await syncToGoogleSheets(sheetsConfig.webhookUrl, payload);

        syncedSheet = true;
        setSyncStatus({
          type: 'success',
          message: `Đã chốt sổ và đồng bộ thành công xe ${currentRoute.code} lên CSDL Google Sheets! (${result.message})`,
        });
      } catch (e) {
        syncedSheet = false;
        setSyncStatus({
          type: 'error',
          message: `Đã lưu CSDL nội bộ nhưng CHƯA lưu được vào Google Sheet: ${(e as Error).message}`,
        });
      }
    } else {
      setSyncStatus({
        type: 'success',
        message: `Đã xác nhận khớp số liệu & cập nhật vào CSDL nội bộ lúc ${timeStr} (${
          activeSessionType === 'morning' ? `${morningSchoolVerified} em vào trường` : `${afternoonBoarded} em lên xe chiều`
        }).`,
      });
    }

    const afternoonDroppedCount = activeBusRiders.filter(
      (s) => records[s.id]?.afternoonDropoffStatus === 'dropped_off'
    ).length;

    onSaveDbLog({
      id: `db-${Date.now()}`,
      date: todayDate,
      sessionType: activeSessionType,
      routeId: currentRoute.id,
      routeCode: currentRoute.code,
      routeName: currentRoute.name,
      totalRoster: total,
      driverReportedPresent: driverReportedCount,
      supervisorVerifiedCount: activeSessionType === 'morning' ? morningSchoolVerified : afternoonBoarded,
      absentCount: activeSessionType === 'morning' ? morningDriverAbsent : afternoonAbsent,
      transferredInCount: incomingStudents.length,
      transferredOutCount: transferredOutStudents.length,
      afternoonDropoffCount: activeSessionType === 'afternoon' ? afternoonDroppedCount : undefined,
      savedBy: supervisorName,
      savedAt: timeStr,
      syncedToGoogleSheet: syncedSheet,
    });

    if (syncedSheet || !sheetsConfig.webhookUrl || sheetsConfig.autoSync === false) {
      setTimeout(() => setSyncStatus(null), 6000);
    }
    setIsLocking(false);
  };

  const handleUnlockSession = () => {
    if (activeSessionType === 'morning') {
      onUpdateSessionState({ morningLocked: false });
    } else {
      onUpdateSessionState({ afternoonLocked: false });
    }
  };

  const filteredStudents = displayStudents.filter((s) => {
    const matchesSearch =
      s.name.toLowerCase().includes(search.toLowerCase()) ||
      s.code.toLowerCase().includes(search.toLowerCase()) ||
      s.class.toLowerCase().includes(search.toLowerCase());
    if (!matchesSearch) return false;

    if (statusFilter === 'all') return true;
    const rec = records[s.id];
    const movedOut = isTransferredOutAccepted(s);
    if (activeSessionType === 'morning') {
      const isAbsent = !movedOut && rec?.morningPickupStatus === 'absent';
      const isDone = !movedOut && !isAbsent && rec?.morningSchoolStatus === 'dropped_at_school';
      if (statusFilter === 'absent') return isAbsent;
      if (statusFilter === 'done') return isDone;
      if (statusFilter === 'pending') return !movedOut && !isAbsent && !isDone;
    } else {
      const isAbsent = !movedOut && rec?.afternoonBoardStatus === 'absent';
      const isDone = !movedOut && !isAbsent && rec?.afternoonBoardStatus === 'boarded';
      if (statusFilter === 'absent') return isAbsent;
      if (statusFilter === 'done') return isDone;
      if (statusFilter === 'pending') return !movedOut && !isAbsent && !isDone;
    }
    return true;
  });

  const recentLogsForRoute = dbLogs
    .filter((l) => l.routeId === currentRoute.id && l.date === todayDate)
    .slice(0, 2);

  return (
    <div className="space-y-3">
      {/* Fleet Attendance Overview (collapsible for multi-route supervisors; hidden if locked to 1 route) */}
      {!isRouteLocked && (
        <div className="space-y-1.5">
          {showFleetTable ? (
            <div className="relative">
              <RouteAttendanceOverview
                routes={routes}
                students={students}
                records={records}
                sessionStates={sessionStates}
                activeSessionType={activeSessionType}
                activeRouteId={currentRoute.id}
                onSelectRoute={onSelectRoute}
                title="Tổng Hợp Các Xe & Tình Trạng Lưu CSDL"
              />
              <button
                type="button"
                onClick={() => setShowFleetTable(false)}
                className="mt-1 text-[11px] font-semibold text-slate-500 hover:text-slate-800 underline"
              >
                Thu gọn bảng tổng hợp các xe
              </button>
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-slate-200 px-3.5 py-2 flex items-center justify-between gap-2 text-xs">
              <span className="font-semibold text-slate-700">
                Bảng tổng hợp {routes.length} tuyến xe đang được thu gọn
              </span>
              <button
                type="button"
                onClick={() => setShowFleetTable(true)}
                className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-lg font-bold whitespace-nowrap"
              >
                Hiện bảng các xe ({routes.length})
              </button>
            </div>
          )}
        </div>
      )}

      {/* Compact Single-Card Control Header & Inline KPI Strip */}
      <div className="bg-white rounded-xl p-3 sm:p-3.5 border border-slate-200 space-y-2.5">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-2.5">
          <div className="flex flex-wrap items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-indigo-600 text-white flex items-center justify-center shrink-0">
              <ShieldCheck className="w-5 h-5" />
            </div>

            <div className="min-w-0 flex flex-wrap items-center gap-x-2.5 gap-y-1">
              {isRouteLocked ? (
                <h2 className="font-extrabold text-slate-900 text-sm sm:text-base whitespace-nowrap">
                  {currentRoute.code} · {currentRoute.name} ({currentRoute.plateNumber})
                </h2>
              ) : (
                <select
                  value={currentRoute.id}
                  onChange={(e) => onSelectRoute(e.target.value)}
                  className="font-extrabold text-slate-900 text-sm sm:text-base bg-slate-50 border border-slate-300 rounded-lg px-2 py-1 focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
                >
                  {routes.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.code} - {r.name} ({r.plateNumber})
                    </option>
                  ))}
                </select>
              )}

              <span
                className={`text-xs font-bold whitespace-nowrap ${
                  isLocked
                    ? 'text-emerald-700'
                    : isDriverReportSubmitted
                    ? 'text-blue-700'
                    : 'text-amber-700'
                }`}
              >
                ·{' '}
                {isLocked
                  ? 'Đã chốt & lưu CSDL'
                  : isDriverReportSubmitted
                  ? 'Lái xe đã gửi điểm danh'
                  : 'Đang kiểm tra'}
              </span>

              <div className="flex items-center gap-1.5 text-xs text-slate-500">
                <span>Trực:</span>
                <input
                  type="text"
                  value={supervisorName}
                  onChange={(e) => setSupervisorName(e.target.value)}
                  className="text-slate-800 font-semibold bg-slate-50 px-2 py-0.5 rounded border border-slate-200 text-xs w-48 sm:w-56 focus:bg-white focus:outline-none focus:border-indigo-400"
                />
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={onOpenQrScanner}
              className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors whitespace-nowrap"
            >
              <QrCode className="w-3.5 h-3.5" />
              <span>Quét QR Cổng Trường</span>
            </button>
            <button
              onClick={onOpenSheetsModal}
              className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold border border-slate-200 flex items-center gap-1.5 transition-colors whitespace-nowrap"
              title="Cài đặt đồng bộ Google Sheets"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
              <span>Google Sheet</span>
            </button>
          </div>
        </div>

        {/* Unified Single-Row Metrics + Driver Report Summary */}
        <div className="pt-2 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2 text-xs tabular-nums">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <span>
              Sĩ số: <strong className="text-slate-900">{total}</strong>
            </span>
            <span>
              {activeSessionType === 'morning' ? 'LX báo đi:' : 'Lên xe về:'}{' '}
              <strong className="text-blue-700">
                {activeSessionType === 'morning' ? morningDriverBoarded : afternoonBoarded}
              </strong>
            </span>
            <span>
              {activeSessionType === 'morning' ? 'Đã vào trường:' : 'Đã trả điểm:'}{' '}
              <strong className="text-emerald-700">
                {activeSessionType === 'morning' ? morningSchoolVerified : afternoonDroppedCount}
              </strong>
            </span>
            <span>
              {activeSessionType === 'morning' ? 'Vắng:' : 'Vắng/PH đón:'}{' '}
              <strong className="text-rose-600">
                {activeSessionType === 'morning' ? morningDriverAbsent : afternoonAbsent}
              </strong>
            </span>
            {incomingStudents.length > 0 && (
              <span className="text-purple-700 font-semibold">
                +{incomingStudents.length} HS đi nhờ tới
              </span>
            )}
            {transferredOutStudents.length > 0 && (
              <span className="text-purple-700 font-semibold">
                -{transferredOutStudents.length} HS chuyển xe
              </span>
            )}
          </div>

          <div className="flex items-center gap-2 text-[11px]">
            {isDriverReportSubmitted && (
              <span className="text-slate-500">
                LX gửi lúc{' '}
                <strong className="text-slate-700">
                  {activeSessionType === 'morning'
                    ? sessionState.morningReportSubmittedAt
                    : sessionState.afternoonReportSubmittedAt}
                </strong>
              </span>
            )}
            {activeSessionType === 'morning' ? (
              countsMatchDriverReport ? (
                <span className="text-emerald-700 font-bold inline-flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  Khớp {morningSchoolVerified}/{morningDriverBoarded}
                </span>
              ) : morningDriverBoarded > 0 ? (
                <span className="text-amber-700 font-bold">
                  Đã kiểm {morningSchoolVerified}/{morningDriverBoarded}
                </span>
              ) : null
            ) : (
              <span
                className={`font-bold ${
                  sessionState.afternoonDropoffConfirmed ? 'text-emerald-700' : 'text-indigo-700'
                }`}
              >
                {sessionState.afternoonDropoffConfirmed
                  ? `LX xác nhận trả hết (${afternoonDroppedCount})`
                  : `Trả điểm: ${afternoonDroppedCount}/${afternoonBoarded || activeBusRiders.length - afternoonAbsent}`}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Compact Safety Discrepancy Alert (1 compact row/bar) */}
      {activeSessionType === 'morning' && morningDiscrepancies.length > 0 && !isLocked && (
        <div className="px-3.5 py-2.5 bg-rose-50 border border-rose-300 text-rose-950 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
          <div className="flex items-center gap-2 min-w-0">
            <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
            <span className="font-bold truncate">
              Cảnh báo: {morningDiscrepancies.length} HS lái xe báo đã lên xe nhưng chưa kiểm vào trường (
              {morningDiscrepancies.map((s) => `${s.name} ${s.class}`).join(', ')})
            </span>
          </div>
          <button
            onClick={handleVerifyAllAtSchool}
            className="px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-xs font-bold shrink-0 whitespace-nowrap transition-colors"
          >
            Xác nhận đủ {morningDiscrepancies.length} em vào trường
          </button>
        </div>
      )}

      {/* Sync Status Banner */}
      {syncStatus && (
        <div
          className={`px-3.5 py-2.5 rounded-xl text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2 font-bold border ${
            syncStatus.type === 'error'
              ? 'bg-rose-50 text-rose-900 border-rose-300'
              : syncStatus.type === 'info'
              ? 'bg-blue-50 text-blue-900 border-blue-200'
              : 'bg-emerald-50 text-emerald-900 border-emerald-300'
          }`}
        >
          <div className="flex items-center gap-2">
            <Database
              className={`w-4 h-4 shrink-0 ${
                syncStatus.type === 'error'
                  ? 'text-rose-600'
                  : syncStatus.type === 'info'
                  ? 'text-blue-600'
                  : 'text-emerald-600'
              }`}
            />
            <span>{syncStatus.message}</span>
          </div>
          {syncStatus.type === 'error' && (
            <button
              onClick={onOpenSheetsModal}
              className="px-3 py-1 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-[11px] font-bold shrink-0"
            >
              Kiểm tra Google Sheet
            </button>
          )}
        </div>
      )}

      {/* Main High-Density Single-Row Student Table */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        {/* Compact Toolbar: Search + Filter Tabs + Bulk Verify */}
        <div className="px-3.5 py-2.5 bg-slate-50 border-b border-slate-200 flex flex-col md:flex-row md:items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Tìm tên, lớp, mã HS..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-8 pr-2.5 py-1.5 bg-white rounded-lg border border-slate-300 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500 w-44 sm:w-56"
              />
            </div>

            <div className="inline-flex p-0.5 bg-slate-200/70 rounded-lg gap-0.5 text-[11px]">
              {(
                [
                  { id: 'all', label: `Tất cả (${displayStudents.length})` },
                  { id: 'pending', label: activeSessionType === 'morning' ? 'Chờ kiểm' : 'Chưa lên' },
                  { id: 'done', label: activeSessionType === 'morning' ? 'Đã vào trường' : 'Đã lên xe' },
                  { id: 'absent', label: 'Vắng' },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setStatusFilter(tab.id)}
                  className={`px-2.5 py-1 rounded-md font-semibold whitespace-nowrap transition-colors ${
                    statusFilter === tab.id
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {!isLocked ? (
              <button
                onClick={activeSessionType === 'morning' ? handleVerifyAllAtSchool : handleVerifyAllAfternoon}
                className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-bold transition-colors flex items-center gap-1.5 whitespace-nowrap"
              >
                <UserCheck className="w-3.5 h-3.5 text-emerald-400" />
                <span>
                  {activeSessionType === 'morning'
                    ? `Xác nhận khớp tất cả (${morningDriverBoarded})`
                    : 'Xác nhận cả xe đã lên'}
                </span>
              </button>
            ) : (
              <span className="text-xs text-slate-500 whitespace-nowrap">
                Đã chốt CSDL · Mở khóa bên dưới nếu cần sửa
              </span>
            )}
          </div>
        </div>

        {/* Single-Row Table with Pinned Header */}
        <div className="overflow-auto max-h-[52vh] min-h-[260px]">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-100 text-slate-600 font-semibold text-[11px]">
                <th className="sticky top-0 z-10 bg-slate-100 shadow-[inset_0_-1px_0_0_#cbd5e1] py-2 pl-3.5 pr-1.5 w-10 text-right">
                  STT
                </th>
                <th className="sticky top-0 z-10 bg-slate-100 shadow-[inset_0_-1px_0_0_#cbd5e1] py-2 px-2">Họ và tên</th>
                <th className="sticky top-0 z-10 bg-slate-100 shadow-[inset_0_-1px_0_0_#cbd5e1] py-2 px-2 text-center">Lớp</th>
                <th className="sticky top-0 z-10 bg-slate-100 shadow-[inset_0_-1px_0_0_#cbd5e1] py-2 px-2 hidden lg:table-cell">
                  Mã HS
                </th>
                <th className="sticky top-0 z-10 bg-slate-100 shadow-[inset_0_-1px_0_0_#cbd5e1] py-2 px-2">SĐT PH</th>
                <th className="sticky top-0 z-10 bg-slate-100 shadow-[inset_0_-1px_0_0_#cbd5e1] py-2 px-2">
                  {activeSessionType === 'morning' ? 'Lái xe đón' : 'Lên xe về'}
                </th>
                <th className="sticky top-0 z-10 bg-slate-100 shadow-[inset_0_-1px_0_0_#cbd5e1] py-2 px-2">
                  {activeSessionType === 'morning' ? 'Cổng trường' : 'Trả điểm'}
                </th>
                <th className="sticky top-0 z-10 bg-slate-100 shadow-[inset_0_-1px_0_0_#cbd5e1] py-2 pl-2 pr-3.5 text-right">
                  Thao tác
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 tabular-nums">
              {filteredStudents.length === 0 ? (
                <tr>
                  <td colSpan={8} className="text-center py-8 text-slate-400">
                    Không tìm thấy học sinh nào phù hợp
                  </td>
                </tr>
              ) : (
                filteredStudents.map((s, idx) => {
                  const rec = records[s.id];
                  const movedOut = isTransferredOutAccepted(s);
                  const movedIn = isTransferredInAccepted(s);
                  const sessionTransfer = getSessionTransfer(rec, activeSessionType);
                  const targetRoute = sessionTransfer?.toRouteId
                    ? routes.find((r) => r.id === sessionTransfer.toRouteId)
                    : undefined;
                  const fromRoute = sessionTransfer?.fromRouteId
                    ? routes.find((r) => r.id === sessionTransfer.fromRouteId)
                    : undefined;

                  const isMorningBoarded = rec?.morningPickupStatus === 'boarded';
                  const isMorningAbsent = rec?.morningPickupStatus === 'absent';
                  const isSchoolVerified =
                    !isMorningAbsent && rec?.morningSchoolStatus === 'dropped_at_school';

                  const isAfternoonBoarded = rec?.afternoonBoardStatus === 'boarded';
                  const isAfternoonAbsent = rec?.afternoonBoardStatus === 'absent';
                  const isAfternoonDropped = rec?.afternoonDropoffStatus === 'dropped_off';

                  const isSessionAbsent =
                    activeSessionType === 'morning' ? isMorningAbsent : isAfternoonAbsent;
                  const isSessionDone =
                    activeSessionType === 'morning' ? isSchoolVerified : isAfternoonDropped;

                  return (
                    <tr
                      key={s.id}
                      className={`transition-colors ${
                        movedOut
                          ? 'bg-purple-50/30 opacity-85'
                          : isSessionAbsent
                          ? 'bg-rose-50/30'
                          : isSessionDone
                          ? 'bg-emerald-50/25'
                          : 'hover:bg-slate-50'
                      }`}
                    >
                      <td className="py-1.5 pl-3.5 pr-1.5 text-right font-mono text-slate-400 font-semibold">
                        {idx + 1}
                      </td>

                      <td className="py-1.5 px-2 whitespace-nowrap">
                        <div className="flex items-center gap-1.5">
                          <span
                            className="font-bold text-slate-900 truncate max-w-[160px] sm:max-w-[210px]"
                            title={`${s.name} (${s.code})${rec?.parentExcusedReason ? ` · PH báo: ${rec.parentExcusedReason}` : ''}`}
                          >
                            {s.name}
                          </span>
                          {movedIn && (
                            <span className="text-[10px] font-bold text-purple-700 inline-flex items-center gap-0.5 shrink-0">
                              <ArrowRightLeft className="w-3 h-3" />
                              từ {fromRoute?.code}
                            </span>
                          )}
                          {movedOut && (
                            <span className="text-[10px] font-bold text-purple-700 inline-flex items-center gap-0.5 shrink-0">
                              <ArrowRightLeft className="w-3 h-3" />
                              sang {targetRoute?.code}
                            </span>
                          )}
                          {rec?.parentExcusedReason && (
                            <span
                              className="text-[10px] text-rose-700 truncate max-w-[110px] hidden xl:inline"
                              title={rec.parentExcusedReason}
                            >
                              · {rec.parentExcusedReason}
                            </span>
                          )}
                        </div>
                      </td>

                      <td className="py-1.5 px-2 text-center font-mono font-semibold text-slate-700 whitespace-nowrap">
                        {s.class}
                      </td>

                      <td className="py-1.5 px-2 font-mono text-slate-400 whitespace-nowrap hidden lg:table-cell">
                        {s.code}
                      </td>

                      <td className="py-1.5 px-2 whitespace-nowrap">
                        <a
                          href={`tel:${s.parentPhone}`}
                          className="text-blue-600 hover:underline inline-flex items-center gap-1 font-mono text-[11px]"
                          title={`Gọi PH ${s.parentName}`}
                        >
                          <Phone className="w-3 h-3 shrink-0" />
                          <span className="hidden sm:inline">{s.parentPhone}</span>
                        </a>
                      </td>

                      {/* Driver pickup / Afternoon boarding column */}
                      <td className="py-1.5 px-2 whitespace-nowrap">
                        {movedOut ? (
                          <span className="text-purple-700 font-semibold">
                            Xe {targetRoute?.code} nhận ({sessionTransfer?.acceptedAt || ''})
                          </span>
                        ) : activeSessionType === 'morning' ? (
                          <span
                            className={`font-semibold ${
                              isMorningBoarded
                                ? 'text-blue-700'
                                : isMorningAbsent
                                ? 'text-rose-600'
                                : 'text-slate-400'
                            }`}
                          >
                            {isMorningBoarded
                              ? `Đã đón ${rec?.morningPickupTime || ''}`
                              : isMorningAbsent
                              ? 'Vắng'
                              : 'Chưa đón'}
                          </span>
                        ) : (
                          <span
                            className={`font-semibold ${
                              isAfternoonBoarded
                                ? 'text-emerald-700'
                                : isAfternoonAbsent
                                ? 'text-rose-600'
                                : 'text-slate-400'
                            }`}
                          >
                            {isAfternoonBoarded
                              ? `Đã lên ${rec?.afternoonBoardTime || ''}`
                              : isAfternoonAbsent
                              ? 'PH đón trường'
                              : 'Chờ lên xe'}
                          </span>
                        )}
                      </td>

                      {/* School gate / Drop-off column */}
                      <td className="py-1.5 px-2 whitespace-nowrap">
                        {movedOut ? (
                          <span className="text-slate-400">—</span>
                        ) : activeSessionType === 'morning' ? (
                          isMorningAbsent ? (
                            <span className="text-slate-400">Không đi xe</span>
                          ) : (
                            <span
                              className={`font-semibold ${
                                isSchoolVerified
                                  ? 'text-emerald-700'
                                  : isMorningBoarded
                                  ? 'text-amber-700'
                                  : 'text-slate-400'
                              }`}
                            >
                              {isSchoolVerified
                                ? `Đã vào ${rec?.morningSchoolTime || ''}`
                                : isMorningBoarded
                                ? 'Chờ kiểm tra'
                                : 'Chờ LX đón'}
                            </span>
                          )
                        ) : isAfternoonAbsent ? (
                          <span className="text-slate-400">—</span>
                        ) : (
                          <span
                            className={`font-semibold ${
                              isAfternoonDropped ? 'text-indigo-700' : 'text-slate-400'
                            }`}
                          >
                            {isAfternoonDropped
                              ? `Đã trả ${rec?.afternoonDropoffTime || ''}`
                              : 'Chưa trả'}
                          </span>
                        )}
                      </td>

                      {/* Single-line Action Column */}
                      <td className="py-1.5 pl-2 pr-3.5 text-right whitespace-nowrap">
                        {movedOut ? (
                          <span className="text-[11px] font-bold text-purple-700">
                            Đi nhờ {targetRoute?.code}
                          </span>
                        ) : activeSessionType === 'morning' ? (
                          isMorningAbsent ? (
                            <span className="text-[11px] font-bold text-rose-600 inline-flex items-center gap-1">
                              <UserX className="w-3.5 h-3.5" />
                              Vắng
                            </span>
                          ) : !isMorningBoarded ? (
                            <span className="text-[11px] text-slate-400">Chưa lên xe</span>
                          ) : (
                            <button
                              disabled={isLocked}
                              onClick={() => handleVerifyStudentAtSchool(s.id)}
                              className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-colors inline-flex items-center gap-1 ${
                                isSchoolVerified
                                  ? 'bg-emerald-600 text-white'
                                  : 'bg-amber-50 text-amber-800 hover:bg-emerald-600 hover:text-white border border-amber-300'
                              } ${isLocked ? 'opacity-70 cursor-not-allowed' : ''}`}
                            >
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              <span>{isSchoolVerified ? 'Đã vào trường' : 'Xác nhận'}</span>
                            </button>
                          )
                        ) : (
                          <div className="inline-flex items-center gap-1">
                            <button
                              disabled={isLocked}
                              onClick={() => handleVerifyAfternoonBoarding(s.id, true)}
                              className={`px-2 py-1 rounded-lg text-[11px] font-bold transition-colors inline-flex items-center gap-1 ${
                                isAfternoonBoarded
                                  ? 'bg-emerald-600 text-white'
                                  : 'bg-slate-100 text-slate-700 hover:bg-emerald-50 hover:text-emerald-700 border border-slate-200'
                              } ${isLocked ? 'opacity-70 cursor-not-allowed' : ''}`}
                            >
                              <CheckCircle2 className="w-3 h-3" />
                              <span>{isAfternoonBoarded ? 'Đã lên' : 'Lên xe'}</span>
                            </button>
                            <button
                              disabled={isLocked}
                              onClick={() => handleVerifyAfternoonBoarding(s.id, false)}
                              className={`px-2 py-1 rounded-lg text-[11px] font-bold transition-colors inline-flex items-center gap-1 ${
                                isAfternoonAbsent
                                  ? 'bg-rose-600 text-white'
                                  : 'bg-slate-100 text-slate-600 hover:bg-rose-50 hover:text-rose-700 border border-slate-200'
                              } ${isLocked ? 'opacity-70 cursor-not-allowed' : ''}`}
                            >
                              <UserX className="w-3 h-3" />
                              <span>PH đón</span>
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Compact Bottom Chốt Sổ & Commit to Database Action Footer */}
        <div className="px-4 py-2.5 bg-slate-900 text-white border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-2.5">
          <div className="text-xs flex flex-wrap items-center gap-x-3 gap-y-0.5">
            <span className="font-bold text-sm">
              {activeSessionType === 'morning'
                ? 'Chốt Kiểm Tra Sáng & Lưu CSDL'
                : 'Chốt Danh Sách Chiều & Lưu CSDL'}
            </span>
            <span className="text-slate-300 tabular-nums">
              {isLocked
                ? `Đã lưu bởi ${
                    activeSessionType === 'morning'
                      ? sessionState?.morningLockedBy
                      : sessionState?.afternoonLockedBy
                  } lúc ${
                    activeSessionType === 'morning'
                      ? sessionState?.morningLockedAt
                      : sessionState?.afternoonLockedAt
                  }`
                : activeSessionType === 'morning'
                ? `LX báo: ${morningDriverBoarded} · Đã kiểm: ${morningSchoolVerified} · Vắng: ${morningDriverAbsent}`
                : `Lên xe: ${afternoonBoarded} · Vắng/PH đón: ${afternoonAbsent}`}
            </span>
            {recentLogsForRoute.length > 0 && (
              <span className="text-emerald-300 text-[11px]">
                · Lưu gần nhất: {recentLogsForRoute[0].savedAt}
                {recentLogsForRoute[0].syncedToGoogleSheet ? ' (Đã gửi Sheet)' : ''}
              </span>
            )}
          </div>

          <div className="shrink-0 w-full sm:w-auto">
            {isLocked ? (
              <button
                onClick={handleUnlockSession}
                className="w-full sm:w-auto px-3.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-bold border border-slate-700 flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap"
              >
                <Unlock className="w-3.5 h-3.5 text-amber-400" />
                <span>Mở Khóa Chỉnh Sửa</span>
              </button>
            ) : (
              <button
                onClick={handleLockSession}
                disabled={isLocking}
                className="w-full sm:w-auto px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-extrabold rounded-lg flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap"
              >
                <Database className="w-3.5 h-3.5" />
                <span>
                  {activeSessionType === 'morning'
                    ? 'XÁC NHẬN KHỚP & LƯU CSDL'
                    : 'CHỐT CHIỀU & LƯU CSDL'}
                </span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
