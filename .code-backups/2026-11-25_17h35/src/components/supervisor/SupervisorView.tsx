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

  const filteredStudents = displayStudents.filter(
    (s) =>
      s.name.toLowerCase().includes(search.toLowerCase()) ||
      s.code.toLowerCase().includes(search.toLowerCase()) ||
      s.class.toLowerCase().includes(search.toLowerCase())
  );

  const recentLogsForRoute = dbLogs
    .filter((l) => l.routeId === currentRoute.id && l.date === todayDate)
    .slice(0, 2);

  return (
    <div className="space-y-4">
      {/* Fleet Attendance Overview from All Drivers */}
      <RouteAttendanceOverview
        routes={isRouteLocked ? [currentRoute] : routes}
        students={students}
        records={records}
        sessionStates={sessionStates}
        activeSessionType={activeSessionType}
        activeRouteId={currentRoute.id}
        onSelectRoute={isRouteLocked ? undefined : onSelectRoute}
        title="Bảng Tiếp Nhận Điểm Danh Từ Các Xe & Tình Trạng Lưu CSDL"
      />

      {/* Top Banner: Route Selector & Supervisor Identity */}
      <div className="bg-white rounded-2xl p-4 shadow-xs border border-slate-200">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-indigo-600 text-white flex items-center justify-center shrink-0 shadow-md shadow-indigo-600/20">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-bold text-indigo-700 uppercase tracking-wider">
                  Cán bộ kiểm soát trường
                </span>
                {isLocked ? (
                  <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 text-[10px] font-extrabold rounded-full flex items-center gap-1">
                    <Lock className="w-3 h-3" /> ĐÃ CHỐT & LƯU CSDL
                  </span>
                ) : isDriverReportSubmitted ? (
                  <span className="px-2 py-0.5 bg-blue-100 text-blue-800 text-[10px] font-extrabold rounded-full flex items-center gap-1">
                    <ClipboardCheck className="w-3 h-3" /> LÁI XE ĐÃ GỬI ĐIỂM DANH
                  </span>
                ) : (
                  <span className="px-2 py-0.5 bg-amber-100 text-amber-800 text-[10px] font-extrabold rounded-full flex items-center gap-1">
                    <Unlock className="w-3 h-3" /> ĐANG KIỂM TRA
                  </span>
                )}
              </div>

              <div className="flex items-center gap-2 mt-0.5">
                {isRouteLocked ? (
                  <h2 className="font-extrabold text-slate-900 text-base">
                    {currentRoute.code} - {currentRoute.name} ({currentRoute.plateNumber})
                  </h2>
                ) : (
                  <select
                    value={currentRoute.id}
                    onChange={(e) => onSelectRoute(e.target.value)}
                    className="font-extrabold text-slate-900 text-base bg-transparent border-b border-dashed border-slate-300 focus:outline-none focus:border-indigo-600 cursor-pointer"
                  >
                    {routes.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.code} - {r.name} ({r.plateNumber})
                      </option>
                    ))}
                  </select>
                )}
              </div>

              <p className="text-xs text-slate-500 mt-1 flex items-center gap-2">
                <span>Người trực:</span>
                <input
                  type="text"
                  value={supervisorName}
                  onChange={(e) => setSupervisorName(e.target.value)}
                  className="text-slate-800 font-semibold bg-slate-100 px-2 py-0.5 rounded text-xs border border-slate-200 focus:bg-white"
                />
              </p>
            </div>
          </div>

          {/* Quick Scanner & Google Sheets indicator */}
          <div className="flex items-center gap-2">
            <button
              onClick={onOpenQrScanner}
              className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-md shadow-indigo-600/20 flex items-center gap-1.5 transition-colors"
            >
              <QrCode className="w-4 h-4" />
              <span>Quét QR Cổng Trường</span>
            </button>
            <button
              onClick={onOpenSheetsModal}
              className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold border border-slate-200 flex items-center gap-1.5 transition-colors"
              title="Cài đặt đồng bộ Google Sheets"
            >
              <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
              <span>CSDL Google Sheet</span>
            </button>
          </div>
        </div>

        {/* Driver Report Comparison Strip */}
        <div
          className={`mt-4 p-3 rounded-xl border text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2 ${
            isDriverReportSubmitted
              ? 'bg-blue-50/70 border-blue-200 text-blue-950'
              : 'bg-slate-50 border-slate-200 text-slate-700'
          }`}
        >
          <div>
            {isDriverReportSubmitted ? (
              activeSessionType === 'morning' ? (
                <p>
                  <strong>Báo cáo lái xe sáng ({sessionState.morningReportSubmittedBy || currentRoute.driverName}):</strong>{' '}
                  Đã gửi lúc <strong>{sessionState.morningReportSubmittedAt}</strong>{' '}
                  • Sĩ số gốc: <strong>{total}</strong> • Báo có đi: <strong className="text-blue-700">{driverReportedCount}</strong> • Vắng: <strong className="text-rose-600">{morningDriverAbsent}</strong>
                  {incomingStudents.length > 0 && (
                    <span className="text-purple-700 font-bold"> • +{incomingStudents.length} HS đi nhờ tới</span>
                  )}
                  {transferredOutStudents.length > 0 && (
                    <span className="text-purple-700 font-bold"> • -{transferredOutStudents.length} HS chuyển xe</span>
                  )}
                </p>
              ) : (
                <p>
                  <strong>Báo cáo lái xe chiều ({sessionState.afternoonReportSubmittedBy || currentRoute.driverName}):</strong>{' '}
                  Đã gửi lúc <strong>{sessionState.afternoonReportSubmittedAt}</strong>{' '}
                  • Sĩ số gốc: <strong>{total}</strong> • Đi xe về: <strong className="text-blue-700">{driverReportedCount}</strong> • Vắng/PH đón: <strong className="text-rose-600">{afternoonAbsent}</strong>
                  {sessionState.afternoonDropoffConfirmed && (
                    <span className="text-emerald-700 font-bold"> • Đã xác nhận trả hết ({sessionState.afternoonDropoffConfirmedAt})</span>
                  )}
                  {incomingStudents.length > 0 && (
                    <span className="text-purple-700 font-bold"> • +{incomingStudents.length} HS đi nhờ chiều</span>
                  )}
                  {transferredOutStudents.length > 0 && (
                    <span className="text-purple-700 font-bold"> • -{transferredOutStudents.length} HS chuyển xe chiều</span>
                  )}
                </p>
              )
            ) : (
              <p>
                Lái xe tuyến <strong>{currentRoute.code}</strong> chưa bấm &quot;Gửi điểm danh {activeSessionType === 'morning' ? 'sáng' : 'chiều'}&quot;. Dữ liệu bên dưới đang cập nhật trực tiếp theo từng thao tác trên xe.
              </p>
            )}
          </div>

          {activeSessionType === 'morning' ? (
            <div className="shrink-0">
              {countsMatchDriverReport ? (
                <span className="px-2.5 py-1 bg-emerald-100 text-emerald-800 border border-emerald-200 rounded-lg font-extrabold inline-flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  Khớp thực tế: {morningSchoolVerified}/{morningDriverBoarded} em
                </span>
              ) : morningDriverBoarded > 0 ? (
                <span className="px-2.5 py-1 bg-amber-100 text-amber-800 border border-amber-200 rounded-lg font-bold">
                  Đã kiểm {morningSchoolVerified}/{morningDriverBoarded} em đi xe
                </span>
              ) : null}
            </div>
          ) : (
            <div className="shrink-0">
              <span
                className={`px-2.5 py-1 rounded-lg font-bold border ${
                  sessionState.afternoonDropoffConfirmed
                    ? 'bg-emerald-100 text-emerald-800 border-emerald-200'
                    : 'bg-indigo-100 text-indigo-800 border-indigo-200'
                }`}
              >
                {sessionState.afternoonDropoffConfirmed
                  ? `LX đã xác nhận trả hết (${afternoonDroppedCount} em)`
                  : `Đã trả điểm: ${afternoonDroppedCount}/${afternoonBoarded || activeBusRiders.length - afternoonAbsent} em`}
              </span>
            </div>
          )}
        </div>

        {/* Verification Counter Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-3">
          <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
            <p className="text-[11px] font-semibold text-slate-500">Tổng sĩ số tuyến</p>
            <p className="text-xl font-black text-slate-900 mt-0.5">
              {total} <span className="text-xs font-normal text-slate-500">học sinh</span>
            </p>
          </div>

          <div className="p-3 bg-blue-50 rounded-xl border border-blue-200">
            <p className="text-[11px] font-semibold text-blue-700">
              {activeSessionType === 'morning' ? 'Lái xe báo có đi' : 'Lên xe về (Chiều)'}
            </p>
            <p className="text-xl font-black text-blue-900 mt-0.5">
              {activeSessionType === 'morning' ? morningDriverBoarded : afternoonBoarded}{' '}
              <span className="text-xs font-normal text-blue-600">em</span>
            </p>
          </div>

          <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-200">
            <p className="text-[11px] font-semibold text-emerald-700">
              {activeSessionType === 'morning' ? 'Thực tế đã vào trường' : 'Đã trả về điểm'}
            </p>
            <p className="text-xl font-black text-emerald-900 mt-0.5">
              {activeSessionType === 'morning' ? morningSchoolVerified : afternoonDroppedCount}{' '}
              <span className="text-xs font-normal text-emerald-600">em</span>
            </p>
          </div>

          <div className="p-3 bg-rose-50 rounded-xl border border-rose-200">
            <p className="text-[11px] font-semibold text-rose-700">
              {activeSessionType === 'morning' ? 'Vắng / Không đi sáng' : 'Vắng / PH đón chiều'}
            </p>
            <p className="text-xl font-black text-rose-900 mt-0.5">
              {activeSessionType === 'morning' ? morningDriverAbsent : afternoonAbsent}{' '}
              <span className="text-xs font-normal text-rose-600">em</span>
            </p>
          </div>
        </div>
      </div>

      {/* Critical Safety Alert Discrepancy Banner */}
      {activeSessionType === 'morning' && morningDiscrepancies.length > 0 && !isLocked && (
        <div className="p-4 bg-rose-500 text-white rounded-2xl shadow-lg border-2 border-rose-600">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className="p-2 bg-white/20 rounded-xl shrink-0">
                <AlertTriangle className="w-6 h-6 text-white" />
              </div>
              <div>
                <h4 className="font-extrabold text-sm uppercase tracking-wide">
                  CẢNH BÁO: Còn {morningDiscrepancies.length} học sinh lái xe báo đã lên xe nhưng chưa kiểm vào trường!
                </h4>
                <p className="text-xs text-rose-100 mt-0.5">
                  Kiểm tra ngay thực tế tại cửa xe và trên cabin để đảm bảo không bỏ sót học sinh nào!
                </p>
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {morningDiscrepancies.map((s) => (
                    <span
                      key={s.id}
                      className="px-2 py-0.5 bg-white text-rose-800 rounded-md font-bold text-xs shadow-xs"
                    >
                      {s.name} ({s.class})
                    </span>
                  ))}
                </div>
              </div>
            </div>

            <button
              onClick={handleVerifyAllAtSchool}
              className="px-4 py-2 bg-white text-rose-700 hover:bg-rose-50 rounded-xl text-xs font-black shadow-md shrink-0 transition-colors"
            >
              Xác Nhận Đủ {morningDiscrepancies.length} Em Đã Vào Trường
            </button>
          </div>
        </div>
      )}

      {/* Sync Status Banner */}
      {syncStatus && (
        <div
          className={`p-3.5 rounded-xl text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2 font-bold shadow-xs border ${
            syncStatus.type === 'error'
              ? 'bg-rose-50 text-rose-900 border-rose-300'
              : syncStatus.type === 'info'
              ? 'bg-blue-50 text-blue-900 border-blue-200'
              : 'bg-emerald-50 text-emerald-900 border-emerald-300'
          }`}
        >
          <div className="flex items-start gap-2">
            <Database
              className={`w-4 h-4 shrink-0 mt-0.5 ${
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
              className="px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-[11px] font-bold shrink-0 self-start sm:self-auto"
            >
              Kiểm tra kết nối Google Sheet
            </button>
          )}
        </div>
      )}

      {/* Main Student Check-in Table for School Supervisor */}
      <div className="bg-white rounded-2xl shadow-xs border border-slate-200 overflow-hidden">
        {/* Controls Bar */}
        <div className="p-3.5 bg-slate-50 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Tìm theo tên học sinh, lớp hoặc mã thẻ..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 bg-white rounded-xl border border-slate-300 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <div className="flex items-center gap-2">
            {!isLocked ? (
              <button
                onClick={activeSessionType === 'morning' ? handleVerifyAllAtSchool : handleVerifyAllAfternoon}
                className="px-3.5 py-1.5 bg-slate-800 hover:bg-slate-900 text-white rounded-xl text-xs font-bold transition-colors flex items-center gap-1.5 shadow-xs"
              >
                <UserCheck className="w-4 h-4 text-emerald-400" />
                <span>
                  {activeSessionType === 'morning'
                    ? `Xác nhận khớp tất cả HS đi xe (${morningDriverBoarded} em)`
                    : 'Xác nhận cả xe đã lên xe về'}
                </span>
              </button>
            ) : (
              <div className="text-xs text-slate-500 italic">
                Phiên này đã chốt & lưu CSDL. Để chỉnh sửa hãy mở khóa sổ.
              </div>
            )}
          </div>
        </div>

        {/* List of Students */}
        <div className="divide-y divide-slate-100 max-h-[550px] overflow-y-auto">
          {filteredStudents.length === 0 ? (
            <div className="text-center py-12 text-slate-400 text-sm">Không tìm thấy học sinh</div>
          ) : (
            filteredStudents.map((s) => {
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
                <div
                  key={s.id}
                  className={`p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition-colors ${
                    movedOut
                      ? 'bg-purple-50/30 opacity-85'
                      : isSessionAbsent
                      ? 'bg-rose-50/25'
                      : isSessionDone
                      ? 'bg-emerald-50/25'
                      : 'hover:bg-slate-50'
                  }`}
                >
                  {/* Left: Avatar & Metadata */}
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl overflow-hidden bg-slate-200 shrink-0 border border-slate-200">
                      <img src={s.avatar} alt={s.name} className="w-full h-full object-cover" />
                    </div>
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-bold text-slate-900 text-sm">{s.name}</span>
                        <span className="px-1.5 py-0.5 bg-slate-100 text-slate-700 font-mono text-xs rounded font-semibold">
                          {s.class}
                        </span>
                        <span className="text-xs text-slate-400 font-mono">{s.code}</span>
                        {movedIn && (
                          <span className="px-2 py-0.5 bg-purple-100 text-purple-800 rounded text-[10px] font-extrabold inline-flex items-center gap-1">
                            <ArrowRightLeft className="w-3 h-3" />
                            Đi nhờ ({activeSessionType === 'morning' ? 'Sáng' : 'Chiều'}) từ xe{' '}
                            {fromRoute?.code}
                          </span>
                        )}
                        {movedOut && (
                          <span className="px-2 py-0.5 bg-purple-100 text-purple-800 rounded text-[10px] font-extrabold inline-flex items-center gap-1">
                            <ArrowRightLeft className="w-3 h-3" />
                            Chuyển đi nhờ ({activeSessionType === 'morning' ? 'Sáng' : 'Chiều'}) sang xe{' '}
                            {targetRoute?.code}
                          </span>
                        )}
                      </div>

                      {/* Status Badges */}
                      <div className="flex flex-wrap items-center gap-2 text-xs mt-1">
                        {movedOut ? (
                          <span className="px-2 py-0.5 rounded font-semibold text-[11px] bg-purple-100 text-purple-800">
                            Xe {targetRoute?.code} đã xác nhận đón ({sessionTransfer?.acceptedAt})
                          </span>
                        ) : activeSessionType === 'morning' ? (
                          <>
                            <span
                              className={`px-2 py-0.5 rounded font-semibold text-[11px] ${
                                isMorningBoarded
                                  ? 'bg-blue-100 text-blue-800'
                                  : isMorningAbsent
                                  ? 'bg-rose-100 text-rose-800'
                                  : 'bg-slate-100 text-slate-600'
                              }`}
                            >
                              Lái xe:{' '}
                              {isMorningBoarded
                                ? `Đã đón (${rec?.morningPickupTime})`
                                : isMorningAbsent
                                ? 'Vắng mặt (Không đi xe)'
                                : 'Chưa đón'}
                            </span>

                            {isMorningAbsent ? (
                              <span className="px-2 py-0.5 rounded font-semibold text-[11px] bg-slate-100 text-slate-500">
                                Không đi xe tuyến sáng nay
                              </span>
                            ) : (
                              <span
                                className={`px-2 py-0.5 rounded font-semibold text-[11px] ${
                                  isSchoolVerified
                                    ? 'bg-emerald-100 text-emerald-800'
                                    : isMorningBoarded
                                    ? 'bg-amber-100 text-amber-800'
                                    : 'bg-slate-100 text-slate-500'
                                }`}
                              >
                                Cổng trường:{' '}
                                {isSchoolVerified
                                  ? `Đã vào lúc ${rec?.morningSchoolTime}`
                                  : isMorningBoarded
                                  ? 'Chờ kiểm tra xuống xe'
                                  : 'Chờ lái xe đón'}
                              </span>
                            )}
                          </>
                        ) : (
                          <>
                            <span
                              className={`px-2 py-0.5 rounded font-semibold text-[11px] ${
                                isAfternoonBoarded
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : isAfternoonAbsent
                                  ? 'bg-rose-100 text-rose-800'
                                  : 'bg-slate-100 text-slate-600'
                              }`}
                            >
                              Lên xe về:{' '}
                              {isAfternoonBoarded
                                ? `Đã lên (${rec?.afternoonBoardTime || ''})`
                                : isAfternoonAbsent
                                ? 'PH đón tại trường'
                                : 'Chờ lên xe'}
                            </span>
                            {!isAfternoonAbsent && (
                              <span
                                className={`px-2 py-0.5 rounded font-semibold text-[11px] ${
                                  isAfternoonDropped
                                    ? 'bg-indigo-100 text-indigo-800'
                                    : 'bg-slate-100 text-slate-500'
                                }`}
                              >
                                Trả điểm:{' '}
                                {isAfternoonDropped
                                  ? `Đã trả lúc ${rec?.afternoonDropoffTime}`
                                  : 'Chưa trả'}
                              </span>
                            )}
                          </>
                        )}

                        <a
                          href={`tel:${s.parentPhone}`}
                          className="text-slate-500 hover:text-blue-600 flex items-center gap-1 font-mono text-[11px]"
                        >
                          <Phone className="w-3 h-3" />
                          {s.parentPhone}
                        </a>
                      </div>

                      {rec?.parentExcusedReason && (
                        <p className="text-[11px] text-rose-700 mt-1">
                          Lý do: <strong>{rec.parentExcusedReason}</strong>
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Right: Actions (FIXED: Absent or Transferred-out students NEVER show "Xác nhận vào trường") */}
                  <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
                    {movedOut ? (
                      <span className="px-3 py-1.5 bg-purple-100 text-purple-800 rounded-xl text-xs font-bold border border-purple-200">
                        Đi nhờ xe {targetRoute?.code}
                      </span>
                    ) : activeSessionType === 'morning' ? (
                      isMorningAbsent ? (
                        <span className="px-3 py-1.5 bg-rose-100 text-rose-800 rounded-xl text-xs font-bold border border-rose-200 flex items-center gap-1.5">
                          <UserX className="w-3.5 h-3.5" />
                          <span>Vắng (Không đi xe)</span>
                        </span>
                      ) : !isMorningBoarded ? (
                        <span className="px-3 py-1.5 bg-slate-100 text-slate-500 rounded-xl text-xs font-semibold border border-slate-200">
                          Chưa lên xe
                        </span>
                      ) : (
                        <button
                          disabled={isLocked}
                          onClick={() => handleVerifyStudentAtSchool(s.id)}
                          className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
                            isSchoolVerified
                              ? 'bg-emerald-600 text-white shadow-xs'
                              : 'bg-amber-50 text-amber-800 hover:bg-emerald-600 hover:text-white border border-amber-300'
                          } ${isLocked ? 'opacity-80 cursor-not-allowed' : ''}`}
                        >
                          <CheckCircle2 className="w-4 h-4" />
                          <span>{isSchoolVerified ? 'Đã Vào Trường' : 'Xác nhận vào trường'}</span>
                        </button>
                      )
                    ) : (
                      <>
                        <button
                          disabled={isLocked}
                          onClick={() => handleVerifyAfternoonBoarding(s.id, true)}
                          className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
                            isAfternoonBoarded
                              ? 'bg-emerald-600 text-white shadow-xs'
                              : 'bg-slate-100 text-slate-700 hover:bg-emerald-50 hover:text-emerald-700 border border-slate-200'
                          } ${isLocked ? 'opacity-80 cursor-not-allowed' : ''}`}
                        >
                          <CheckCircle2 className="w-4 h-4" />
                          <span>{isAfternoonBoarded ? 'Đã lên xe về' : 'Lên xe về'}</span>
                        </button>
                        <button
                          disabled={isLocked}
                          onClick={() => handleVerifyAfternoonBoarding(s.id, false)}
                          className={`px-2.5 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1 ${
                            isAfternoonAbsent
                              ? 'bg-rose-600 text-white'
                              : 'bg-slate-100 text-slate-600 hover:bg-rose-50 hover:text-rose-700 border border-slate-200'
                          } ${isLocked ? 'opacity-80 cursor-not-allowed' : ''}`}
                        >
                          <UserX className="w-3.5 h-3.5" />
                          <span>PH đón trường</span>
                        </button>
                      </>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Bottom Chốt Sổ & Commit to Database Action Footer */}
        <div className="p-4 bg-gradient-to-r from-slate-900 to-indigo-950 text-white border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-extrabold text-sm sm:text-base">
                {activeSessionType === 'morning'
                  ? 'Xác Nhận Thực Tế & Lưu Vào CSDL (Buổi Sáng)'
                  : 'Chốt Danh Sách & Lưu CSDL (Buổi Chiều)'}
              </span>
              {isLocked && (
                <span className="px-2 py-0.5 bg-emerald-500 text-white font-mono text-[10px] font-bold rounded-full">
                  ĐÃ LƯU CSDL
                </span>
              )}
            </div>
            <p className="text-xs text-slate-300">
              {isLocked
                ? `Được chốt bởi: ${
                    activeSessionType === 'morning'
                      ? sessionState?.morningLockedBy
                      : sessionState?.afternoonLockedBy
                  } lúc ${
                    activeSessionType === 'morning'
                      ? sessionState?.morningLockedAt
                      : sessionState?.afternoonLockedAt
                  }. Dữ liệu đã ghi vào CSDL.`
                : activeSessionType === 'morning'
                ? `Lái xe báo có đi: ${morningDriverBoarded} em • Trường đã kiểm: ${morningSchoolVerified} em • Vắng: ${morningDriverAbsent} em.`
                : 'Sau khi kiểm tra đủ học sinh lên xe về, bấm chốt để lưu vào CSDL và cho xe khởi hành.'}
            </p>
            {recentLogsForRoute.length > 0 && (
              <p className="text-[11px] text-emerald-300">
                Lần lưu CSDL gần nhất: {recentLogsForRoute[0].savedAt} bởi {recentLogsForRoute[0].savedBy}{' '}
                ({recentLogsForRoute[0].supervisorVerifiedCount} em có mặt
                {recentLogsForRoute[0].syncedToGoogleSheet ? ' • Đã đẩy Google Sheet' : ''})
              </p>
            )}
          </div>

          <div className="flex items-center gap-2.5 w-full sm:w-auto">
            {isLocked ? (
              <button
                onClick={handleUnlockSession}
                className="w-full sm:w-auto px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-bold border border-slate-700 flex items-center justify-center gap-1.5 transition-colors"
              >
                <Unlock className="w-4 h-4 text-amber-400" />
                <span>Mở Khóa Để Chỉnh Sửa Lại</span>
              </button>
            ) : (
              <button
                onClick={handleLockSession}
                disabled={isLocking}
                className="w-full sm:w-auto px-6 py-2.5 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white text-xs font-extrabold rounded-xl shadow-lg shadow-emerald-500/30 flex items-center justify-center gap-2 transition-all active:scale-95"
              >
                <Database className="w-4 h-4" />
                <span>
                  {activeSessionType === 'morning'
                    ? 'XÁC NHẬN KHỚP & CẬP NHẬT VÀO CSDL'
                    : 'CHỐT DANH SÁCH CHIỀU & LƯU CSDL'}
                </span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
