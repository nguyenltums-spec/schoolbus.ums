import React, { useState, useEffect } from 'react';
import {
  Bus,
  MapPin,
  CheckCircle2,
  XCircle,
  QrCode,
  Send,
  Phone,
  ShieldAlert,
  Filter,
  Check,
  Building2,
  ArrowRightLeft,
  ClipboardCheck,
  X,
  UserPlus,
  AlertTriangle,
  Home,
  CheckCheck,
  Lock,
  ChevronDown,
  Info,
} from 'lucide-react';
import {
  Route,
  Student,
  CheckinRecord,
  RouteSessionState,
  PickupStatus,
  AppNotification,
  UserRole,
  BusTransferInfo,
} from '../../types';
import { playSound } from '../../services/notificationAudio';
import {
  getSessionTransfer,
  isTransferredOutAcceptedForSession,
} from '../../utils/transferHelpers';

interface Props {
  routes: Route[];
  activeRouteId: string;
  lockedRouteId?: string;
  onSelectRoute: (routeId: string) => void;
  students: Student[];
  records: Record<string, CheckinRecord>;
  onUpdateRecord: (studentId: string, updates: Partial<CheckinRecord>) => void;
  onUpdateRecordsBulk?: (updates: Record<string, Partial<CheckinRecord>>) => void;
  sessionState: RouteSessionState;
  onUpdateSessionState: (updates: Partial<RouteSessionState>) => void;
  activeSessionType: 'morning' | 'afternoon';
  onSendNotification: (
    title: string,
    message: string,
    type: AppNotification['type'],
    roleTarget?: UserRole | 'all'
  ) => void;
  onOpenQrScanner: () => void;
}

export const DriverView: React.FC<Props> = ({
  routes,
  activeRouteId,
  lockedRouteId,
  onSelectRoute,
  students,
  records,
  onUpdateRecord,
  onUpdateRecordsBulk,
  sessionState,
  onUpdateSessionState,
  activeSessionType,
  onSendNotification,
  onOpenQrScanner,
}) => {
  const isRouteLocked = Boolean(lockedRouteId);
  const resolvedRoute = isRouteLocked
    ? routes.find((r) => r.id === lockedRouteId)
    : routes.find((r) => r.id === activeRouteId) || routes[0];
  const resolvedRouteId = resolvedRoute?.id || '';
  const otherRoutes = routes.filter((r) => r.id !== resolvedRouteId);

  const [activeStopIndex, setActiveStopIndex] = useState(resolvedRoute?.currentStopIndex || 0);
  const [filterStatus, setFilterStatus] = useState<'all' | 'pending' | 'boarded' | 'absent'>('all');
  const [showEmptyBusConfirm, setShowEmptyBusConfirm] = useState(false);
  const [showSubmitReportModal, setShowSubmitReportModal] = useState(false);
  const [showConfirmDropoffAllModal, setShowConfirmDropoffAllModal] = useState(false);
  const [autoDropoffRemaining, setAutoDropoffRemaining] = useState(true);
  const [autoMarkPendingAsBoarded, setAutoMarkPendingAsBoarded] = useState(true);
  const [alsoMarkArrivedAtSchool, setAlsoMarkArrivedAtSchool] = useState(true);
  const [reportBanner, setReportBanner] = useState<string | null>(null);

  // Cross-bus transfer modal state
  const [transferModalStudent, setTransferModalStudent] = useState<Student | null>(null);
  const [transferTargetRouteId, setTransferTargetRouteId] = useState<string>(otherRoutes[0]?.id || '');
  const [transferNote, setTransferNote] = useState('');
  const [transferScope, setTransferScope] = useState<'morning' | 'afternoon' | 'both'>(activeSessionType);

  useEffect(() => {
    setActiveStopIndex(resolvedRoute?.currentStopIndex || 0);
  }, [resolvedRouteId, resolvedRoute?.currentStopIndex]);

  useEffect(() => {
    if (!otherRoutes.some((r) => r.id === transferTargetRouteId)) {
      setTransferTargetRouteId(otherRoutes[0]?.id || '');
    }
  }, [resolvedRouteId, otherRoutes, transferTargetRouteId]);

  if (!resolvedRoute) {
    return (
      <div className="bg-white rounded-2xl p-8 border border-rose-200 shadow-xs text-center space-y-2">
        <AlertTriangle className="w-8 h-8 text-rose-500 mx-auto" />
        <h3 className="text-base font-extrabold text-slate-900">
          Chưa tìm thấy tuyến xe được phân công cho tài khoản này
        </h3>
        <p className="text-xs text-slate-500 max-w-md mx-auto">
          Tài khoản lái xe chỉ được phép truy cập đúng tuyến xe đã phân công. Vui lòng liên hệ Quản trị viên để kiểm tra lại mục &quot;Phụ trách tuyến xe&quot;.
        </p>
      </div>
    );
  }

  const currentRoute = resolvedRoute;
  const routeStudents = students.filter((s) => s.routeId === currentRoute.id);

  const activeStop = currentRoute.stops[activeStopIndex] || currentRoute.stops[0];
  const emptyBusChecked =
    activeSessionType === 'morning'
      ? Boolean(sessionState?.morningEmptyBusChecked)
      : Boolean(sessionState?.afternoonEmptyBusChecked);

  const isReportSubmitted =
    activeSessionType === 'morning'
      ? Boolean(sessionState?.morningReportSubmitted)
      : Boolean(sessionState?.afternoonReportSubmitted);
  const reportSubmittedAt =
    activeSessionType === 'morning'
      ? sessionState?.morningReportSubmittedAt
      : sessionState?.afternoonReportSubmittedAt;

  // Cross-bus transfers strictly scoped to the current session (morning or afternoon)
  const incomingTransfers = students.filter((s) => {
    const t = getSessionTransfer(records[s.id], activeSessionType);
    return (
      t?.toRouteId === currentRoute.id &&
      (t.status === 'pending_accept' || t.status === 'accepted')
    );
  });
  const incomingPendingCount = incomingTransfers.filter(
    (s) => getSessionTransfer(records[s.id], activeSessionType)?.status === 'pending_accept'
  ).length;
  const incomingAcceptedStudents = incomingTransfers.filter(
    (s) => getSessionTransfer(records[s.id], activeSessionType)?.status === 'accepted'
  );

  const isTransferredOutAccepted = (studentId: string) =>
    isTransferredOutAcceptedForSession(records[studentId], currentRoute.id, activeSessionType);

  const transferredOutAcceptedCount = routeStudents.filter((s) =>
    isTransferredOutAccepted(s.id)
  ).length;

  // Morning statistics
  const total = routeStudents.length;
  const morningBoardedNative = routeStudents.filter(
    (s) => !isTransferredOutAccepted(s.id) && records[s.id]?.morningPickupStatus === 'boarded'
  ).length;
  const morningAbsent = routeStudents.filter(
    (s) => !isTransferredOutAccepted(s.id) && records[s.id]?.morningPickupStatus === 'absent'
  ).length;
  const morningPending = routeStudents.filter(
    (s) =>
      !isTransferredOutAccepted(s.id) &&
      (!records[s.id] || records[s.id]?.morningPickupStatus === 'pending')
  ).length;
  const morningTotalOnBus = morningBoardedNative + incomingAcceptedStudents.length;

  // Afternoon statistics (independent from morning attendance)
  const afternoonBoardedNative = routeStudents.filter(
    (s) => !isTransferredOutAccepted(s.id) && records[s.id]?.afternoonBoardStatus === 'boarded'
  ).length;
  const afternoonAbsent = routeStudents.filter(
    (s) => !isTransferredOutAccepted(s.id) && records[s.id]?.afternoonBoardStatus === 'absent'
  ).length;
  const afternoonPending = routeStudents.filter(
    (s) =>
      !isTransferredOutAccepted(s.id) &&
      (!records[s.id] || records[s.id]?.afternoonBoardStatus === 'pending')
  ).length;
  const afternoonTotalOnBus = afternoonBoardedNative + incomingAcceptedStudents.length;
  const afternoonRiders = [
    ...routeStudents.filter(
      (s) => !isTransferredOutAccepted(s.id) && records[s.id]?.afternoonBoardStatus !== 'absent'
    ),
    ...incomingAcceptedStudents.filter((s) => s.routeId !== currentRoute.id),
  ];
  const afternoonDropped = afternoonRiders.filter(
    (s) => records[s.id]?.afternoonDropoffStatus === 'dropped_off'
  ).length;
  const isAfternoonDropoffConfirmed = Boolean(sessionState?.afternoonDropoffConfirmed);

  // Native students in active session who haven't been marked absent, transferred out, or boarded yet
  const activeSessionPendingStudents = routeStudents.filter((s) => {
    if (isTransferredOutAccepted(s.id)) return false;
    const rec = records[s.id];
    if (activeSessionType === 'morning') {
      return !rec || rec.morningPickupStatus === 'pending';
    }
    return !rec || rec.afternoonBoardStatus === 'pending';
  });
  const activeSessionPendingCount = activeSessionPendingStudents.length;
  const currentTotalOnBus = activeSessionType === 'morning' ? morningTotalOnBus : afternoonTotalOnBus;
  const projectedBoardedOnSubmit =
    currentTotalOnBus + (autoMarkPendingAsBoarded ? activeSessionPendingCount : 0);

  // Filter native students
  const filteredStudents = routeStudents.filter((s) => {
    const rec = records[s.id];
    if (activeSessionType === 'morning') {
      const status = rec?.morningPickupStatus || 'pending';
      if (filterStatus === 'pending') return status === 'pending' && !isTransferredOutAccepted(s.id);
      if (filterStatus === 'boarded') return status === 'boarded' && !isTransferredOutAccepted(s.id);
      if (filterStatus === 'absent') return status === 'absent' && !isTransferredOutAccepted(s.id);
    } else {
      const status = rec?.afternoonBoardStatus || 'pending';
      if (filterStatus === 'pending') return status === 'pending' && !isTransferredOutAccepted(s.id);
      if (filterStatus === 'boarded') return status === 'boarded' && !isTransferredOutAccepted(s.id);
      if (filterStatus === 'absent') return status === 'absent' && !isTransferredOutAccepted(s.id);
    }
    return true;
  });

  const getNowTime = () => {
    const now = new Date();
    return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  };

  // Handle Morning Boarding Actions
  const handleMarkMorningStatus = (studentId: string, status: PickupStatus, note?: string) => {
    playSound(status === 'boarded' ? 'beep' : 'alert');
    const timeStr = getNowTime();
    const student = students.find((s) => s.id === studentId);

    if (status === 'absent') {
      // Ensure absent student in morning is never marked as arrived at school or morning-transferred
      onUpdateRecord(studentId, {
        morningPickupStatus: 'absent',
        morningPickupTime: undefined,
        morningPickupNote: note || 'Lái xe ghi nhận vắng tại điểm đón',
        morningSchoolStatus: 'pending',
        morningSchoolTime: undefined,
        morningSchoolVerifier: undefined,
        morningTransfer: null,
        transferFromRouteId: undefined,
        transferToRouteId: undefined,
        transferStatus: undefined,
      });
    } else {
      onUpdateRecord(studentId, {
        morningPickupStatus: status,
        morningPickupTime: status === 'boarded' ? timeStr : undefined,
        morningPickupNote: note,
        morningTransfer: null,
        transferFromRouteId: undefined,
        transferToRouteId: undefined,
        transferStatus: undefined,
      });
    }

    if (student) {
      if (status === 'boarded') {
        onSendNotification(
          `Học sinh ${student.name} đã lên xe`,
          `Bé ${student.name} (${student.class}) đã lên xe ${currentRoute.code} lúc ${timeStr} an toàn.`,
          'boarded',
          'parent'
        );
      } else if (status === 'absent') {
        onSendNotification(
          `Học sinh vắng: ${student.name}`,
          `Bé ${student.name} (${student.class}) vắng mặt tại điểm đón ${activeStop?.name || currentRoute.code}.`,
          'alert',
          'all'
        );
      }
    }
  };

  const handleMarkAfternoonBoardStatus = (studentId: string, status: 'boarded' | 'absent') => {
    playSound(status === 'boarded' ? 'beep' : 'alert');
    const timeStr = getNowTime();
    if (status === 'absent') {
      onUpdateRecord(studentId, {
        afternoonBoardStatus: 'absent',
        afternoonBoardTime: undefined,
        afternoonDropoffStatus: 'pending',
        afternoonDropoffTime: undefined,
        afternoonNote: 'PH đón tại trường / Vắng chiều',
        afternoonTransfer: null,
      });
    } else {
      onUpdateRecord(studentId, {
        afternoonBoardStatus: 'boarded',
        afternoonBoardTime: timeStr,
        afternoonNote: undefined,
      });
    }
  };

  const handleMarkAfternoonDropoff = (studentId: string) => {
    playSound('beep');
    const timeStr = getNowTime();
    const student = students.find((s) => s.id === studentId);
    const existing = records[studentId];

    onUpdateRecord(studentId, {
      afternoonBoardStatus:
        existing?.afternoonBoardStatus === 'boarded' ? existing.afternoonBoardStatus : 'boarded',
      afternoonBoardTime: existing?.afternoonBoardTime || timeStr,
      afternoonDropoffStatus: 'dropped_off',
      afternoonDropoffTime: timeStr,
    });

    if (student) {
      onSendNotification(
        `Bàn giao học sinh ${student.name}`,
        `Bé ${student.name} đã được trả tại điểm ${activeStop?.name || ''} lúc ${timeStr}.`,
        'arrival',
        'parent'
      );
    }
  };

  // Bulk mark all remaining non-absent/non-transferred students as boarded for current session
  const handleMarkAllSessionBoarded = () => {
    const timeStr = getNowTime();
    const bulkUpdates: Record<string, Partial<CheckinRecord>> = {};

    activeSessionPendingStudents.forEach((s) => {
      if (activeSessionType === 'morning') {
        bulkUpdates[s.id] = {
          morningPickupStatus: 'boarded',
          morningPickupTime: timeStr,
          morningTransfer: null,
          transferFromRouteId: undefined,
          transferToRouteId: undefined,
          transferStatus: undefined,
        };
      } else {
        bulkUpdates[s.id] = {
          afternoonBoardStatus: 'boarded',
          afternoonBoardTime: timeStr,
        };
      }
    });

    const count = Object.keys(bulkUpdates).length;
    if (count === 0) {
      setReportBanner('Tất cả học sinh đi xe trong buổi này đã được đánh dấu Lên xe.');
      setTimeout(() => setReportBanner(null), 4000);
      return;
    }

    if (onUpdateRecordsBulk) {
      onUpdateRecordsBulk(bulkUpdates);
    } else {
      Object.entries(bulkUpdates).forEach(([sid, upd]) => onUpdateRecord(sid, upd));
    }

    playSound('success');
    setReportBanner(
      `Đã đánh dấu ${count} học sinh còn lại ĐÃ LÊN XE (${
        activeSessionType === 'morning' ? 'Ca sáng' : 'Ca chiều'
      }) lúc ${timeStr}!`
    );
    setTimeout(() => setReportBanner(null), 5000);
  };

  // Bulk mark all remaining afternoon riders as dropped off (without closing route confirm modal)
  const handleMarkAllAfternoonDroppedOff = () => {
    const timeStr = getNowTime();
    const bulkUpdates: Record<string, Partial<CheckinRecord>> = {};

    afternoonRiders.forEach((s) => {
      const existing = records[s.id];
      if (existing?.afternoonDropoffStatus !== 'dropped_off') {
        bulkUpdates[s.id] = {
          afternoonBoardStatus:
            existing?.afternoonBoardStatus === 'boarded' ? existing.afternoonBoardStatus : 'boarded',
          afternoonBoardTime: existing?.afternoonBoardTime || timeStr,
          afternoonDropoffStatus: 'dropped_off',
          afternoonDropoffTime: timeStr,
        };
      }
    });

    const count = Object.keys(bulkUpdates).length;
    if (count === 0) {
      setReportBanner('Tất cả học sinh chuyến chiều đã được tích Đã trả điểm.');
      setTimeout(() => setReportBanner(null), 4000);
      return;
    }

    if (onUpdateRecordsBulk) {
      onUpdateRecordsBulk(bulkUpdates);
    } else {
      Object.entries(bulkUpdates).forEach(([sid, upd]) => onUpdateRecord(sid, upd));
    }

    playSound('success');
    setReportBanner(`Đã tích ĐÃ TRẢ ĐIỂM cho ${count} học sinh còn lại lúc ${timeStr}!`);
    setTimeout(() => setReportBanner(null), 5000);
  };

  // Cross-bus Transfer Handlers (supports Morning-only, Afternoon-only, or Both)
  const openTransferModal = (student: Student) => {
    setTransferModalStudent(student);
    setTransferTargetRouteId(otherRoutes[0]?.id || '');
    setTransferScope(activeSessionType);
    setTransferNote('');
  };

  const handleConfirmRequestTransfer = (e: React.FormEvent) => {
    e.preventDefault();
    if (!transferModalStudent || !transferTargetRouteId) return;
    const targetRoute = routes.find((r) => r.id === transferTargetRouteId);
    if (!targetRoute) return;

    const timeStr = getNowTime();
    const scopeLabel =
      transferScope === 'morning'
        ? 'Ca sáng'
        : transferScope === 'afternoon'
        ? 'Ca chiều'
        : 'Cả ngày';
    const cleanNote =
      transferNote.trim() ||
      `Đi nhờ (${scopeLabel}) từ xe ${currentRoute.code} sang xe ${targetRoute.code}`;

    const transferPayload: BusTransferInfo = {
      fromRouteId: currentRoute.id,
      toRouteId: targetRoute.id,
      status: 'pending_accept',
      note: cleanNote,
      requestedBy: currentRoute.driverName,
      requestedAt: timeStr,
    };

    const existingRec = records[transferModalStudent.id];
    const updates: Partial<CheckinRecord> = {};

    if (transferScope === 'morning' || transferScope === 'both') {
      updates.morningTransfer = transferPayload;
      updates.morningPickupStatus = 'pending';
      updates.morningSchoolStatus = 'pending';
    } else if (existingRec && existingRec.morningTransfer === undefined) {
      // Preserve or explicitly isolate afternoon-only transfer from legacy morning view
      updates.morningTransfer = null;
    }

    if (transferScope === 'afternoon' || transferScope === 'both') {
      updates.afternoonTransfer = transferPayload;
      updates.afternoonBoardStatus = 'pending';
      updates.afternoonDropoffStatus = 'pending';
    } else if (existingRec && existingRec.afternoonTransfer === undefined) {
      updates.afternoonTransfer = null;
    }

    onUpdateRecord(transferModalStudent.id, updates);

    playSound('beep');
    onSendNotification(
      `🔁 Chuyển xe đi nhờ (${scopeLabel}): ${transferModalStudent.name} (${currentRoute.code} → ${targetRoute.code})`,
      `Lái xe ${currentRoute.code} gửi học sinh ${transferModalStudent.name} (${transferModalStudent.class}) đi nhờ sang xe ${targetRoute.code} (${scopeLabel}). Mời lái xe ${targetRoute.code} xác nhận đón!`,
      'transfer',
      'all'
    );

    setReportBanner(
      `Đã gửi yêu cầu chuyển ${transferModalStudent.name} (${scopeLabel}) sang xe ${targetRoute.code}. Chờ lái xe ${targetRoute.code} xác nhận đón!`
    );
    setTimeout(() => setReportBanner(null), 5000);
    setTransferModalStudent(null);
  };

  const handleCancelTransfer = (student: Student) => {
    const rec = records[student.id];
    const updates: Partial<CheckinRecord> = {};
    if (activeSessionType === 'morning') {
      updates.morningTransfer = null;
      if (!rec?.transferSession || rec.transferSession === 'morning') {
        updates.transferFromRouteId = undefined;
        updates.transferToRouteId = undefined;
        updates.transferStatus = undefined;
        updates.transferSession = undefined;
      }
    } else {
      updates.afternoonTransfer = null;
      if (rec?.transferSession === 'afternoon') {
        updates.transferFromRouteId = undefined;
        updates.transferToRouteId = undefined;
        updates.transferStatus = undefined;
        updates.transferSession = undefined;
      }
    }
    onUpdateRecord(student.id, updates);
    playSound('beep');
  };

  const handleRespondTransfer = (student: Student, accept: boolean) => {
    const timeStr = getNowTime();
    const rec = records[student.id];
    const currentTransfer = getSessionTransfer(rec, activeSessionType);
    const fromRoute = routes.find((r) => r.id === currentTransfer?.fromRouteId);
    const sessionLabel = activeSessionType === 'morning' ? 'Ca sáng' : 'Ca chiều';

    if (!currentTransfer) return;

    const updatedTransfer: BusTransferInfo = {
      ...currentTransfer,
      status: accept ? 'accepted' : 'rejected',
      acceptedBy: currentRoute.driverName,
      acceptedAt: timeStr,
    };

    if (accept) {
      playSound('success');
      if (activeSessionType === 'morning') {
        onUpdateRecord(student.id, {
          morningTransfer: updatedTransfer,
          morningPickupStatus: 'boarded',
          morningPickupTime: timeStr,
          morningPickupNote: `Đi nhờ từ xe ${fromRoute?.code || ''} sang xe ${currentRoute.code}`,
        });
      } else {
        onUpdateRecord(student.id, {
          afternoonTransfer: updatedTransfer,
          afternoonBoardStatus: 'boarded',
          afternoonBoardTime: timeStr,
          afternoonNote: `Đi nhờ về trên xe ${currentRoute.code} (từ ${fromRoute?.code || ''})`,
        });
      }

      onSendNotification(
        `✅ Xe ${currentRoute.code} đã nhận đón đi nhờ (${sessionLabel}): ${student.name}`,
        `Lái xe ${currentRoute.driverName} (${currentRoute.code}) đã xác nhận đón học sinh ${student.name} (${student.class}) chuyển từ xe ${fromRoute?.code || ''} lúc ${timeStr}.`,
        'transfer',
        'all'
      );
    } else {
      playSound('alert');
      if (activeSessionType === 'morning') {
        onUpdateRecord(student.id, { morningTransfer: updatedTransfer });
      } else {
        onUpdateRecord(student.id, { afternoonTransfer: updatedTransfer });
      }
      onSendNotification(
        `⚠️ Xe ${currentRoute.code} từ chối nhận đi nhờ (${sessionLabel}): ${student.name}`,
        `Lái xe ${currentRoute.code} báo chưa thấy học sinh ${student.name} (${student.class}) lên xe từ ${fromRoute?.code || ''}. Vui lòng kiểm tra lại!`,
        'alert',
        'all'
      );
    }
  };

  // Trigger stop arrival notification
  const handleNotifyStopArrival = () => {
    if (!activeStop) return;
    playSound('arrival');
    const stopStudents = routeStudents.filter((s) => s.stopId === activeStop.id);
    onSendNotification(
      `🚌 Xe ${currentRoute.code} ĐÃ ĐẾN ĐIỂM: ${activeStop.name}`,
      `Xe tuyến ${currentRoute.name} đã dừng tại ${activeStop.name} (${activeStop.address}). Kính mời quý phụ huynh đưa ${stopStudents.length} học sinh ra vị trí xe đón!`,
      'arrival',
      'parent'
    );
  };

  // Complete Empty Bus check
  const handleConfirmEmptyBus = () => {
    playSound('success');
    const timeStr = getNowTime();
    setShowEmptyBusConfirm(false);
    if (activeSessionType === 'morning') {
      onUpdateSessionState({
        morningEmptyBusChecked: true,
        morningEmptyBusCheckedAt: timeStr,
      });
    } else {
      onUpdateSessionState({
        afternoonEmptyBusChecked: true,
        afternoonEmptyBusCheckedAt: timeStr,
      });
    }
    onSendNotification(
      `✅ Đã kiểm tra xe trống an toàn: ${currentRoute.code}`,
      `Lái xe ${currentRoute.driverName} đã rà soát toàn bộ hàng ghế và gầm xe, xác nhận không còn học sinh nào bị bỏ quên.`,
      'arrival',
      'all'
    );
  };

  // Submit Driver Attendance Report to Supervisor & Admin
  const handleConfirmSubmitReport = () => {
    playSound('success');
    const timeStr = getNowTime();
    setShowSubmitReportModal(false);

    let autoBoardedCount = 0;
    if (autoMarkPendingAsBoarded && activeSessionPendingStudents.length > 0) {
      const bulkUpdates: Record<string, Partial<CheckinRecord>> = {};
      activeSessionPendingStudents.forEach((s) => {
        if (activeSessionType === 'morning') {
          bulkUpdates[s.id] = {
            morningPickupStatus: 'boarded',
            morningPickupTime: timeStr,
            morningTransfer: null,
            transferFromRouteId: undefined,
            transferToRouteId: undefined,
            transferStatus: undefined,
          };
        } else {
          bulkUpdates[s.id] = {
            afternoonBoardStatus: 'boarded',
            afternoonBoardTime: timeStr,
          };
        }
      });
      autoBoardedCount = Object.keys(bulkUpdates).length;
      if (onUpdateRecordsBulk) {
        onUpdateRecordsBulk(bulkUpdates);
      } else {
        Object.entries(bulkUpdates).forEach(([sid, upd]) => onUpdateRecord(sid, upd));
      }
    }

    if (activeSessionType === 'morning') {
      const finalMorningOnBus = morningTotalOnBus + autoBoardedCount;
      onUpdateSessionState({
        morningReportSubmitted: true,
        morningReportSubmittedAt: timeStr,
        morningReportSubmittedBy: currentRoute.driverName,
        morningReportedTotal: total,
        morningReportedBoarded: finalMorningOnBus,
        morningReportedAbsent: morningAbsent,
        morningReportedTransferredOut: transferredOutAcceptedCount,
        morningReportedTransferredIn: incomingAcceptedStudents.length,
      });

      onSendNotification(
        `📋 Xe ${currentRoute.code} đã gửi điểm danh sáng (${finalMorningOnBus} em có mặt)`,
        `Lái xe ${currentRoute.driverName} báo cáo hoàn tất đón sáng: Sĩ số ${total} • Lên xe thực tế ${finalMorningOnBus} em • Vắng ${morningAbsent} em${
          transferredOutAcceptedCount > 0 ? ` • Chuyển sang xe khác ${transferredOutAcceptedCount} em` : ''
        }${incomingAcceptedStudents.length > 0 ? ` • Nhận đi nhờ ${incomingAcceptedStudents.length} em` : ''}.${
          alsoMarkArrivedAtSchool ? ' Xe đã đến cổng trường, mời Giám sát kiểm tra chốt sổ!' : ''
        }`,
        'arrival',
        'all'
      );
    } else {
      const finalAfternoonOnBus = afternoonTotalOnBus + autoBoardedCount;
      onUpdateSessionState({
        afternoonReportSubmitted: true,
        afternoonReportSubmittedAt: timeStr,
        afternoonReportSubmittedBy: currentRoute.driverName,
        afternoonReportedBoarded: finalAfternoonOnBus,
        afternoonReportedAbsent: afternoonAbsent,
      });

      onSendNotification(
        `📋 Xe ${currentRoute.code} đã gửi điểm danh chiều (${finalAfternoonOnBus} em đi xe)`,
        `Lái xe ${currentRoute.driverName} báo cáo chiều lúc ${timeStr}: Có mặt ${finalAfternoonOnBus} em • Vắng/PH đón ${afternoonAbsent} em.`,
        'arrival',
        'all'
      );
    }

    setReportBanner(
      `Đã gửi bảng điểm danh xe ${currentRoute.code} lúc ${timeStr}${
        autoBoardedCount > 0 ? ` (tự động tích Đã lên xe ${autoBoardedCount} em còn lại)` : ''
      } cho Giám sát & Quản trị viên!`
    );
    setTimeout(() => setReportBanner(null), 6000);
  };

  return (
    <div className="space-y-4">
      {/* Route Switcher & Driver Card */}
      <div className="bg-white rounded-2xl p-3.5 sm:p-4 shadow-xs border border-slate-200">
        <div className="flex items-start justify-between gap-2.5">
          <div className="flex items-start sm:items-center gap-2.5 sm:gap-3 min-w-0 flex-1">
            <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-2xl bg-blue-600 text-white flex items-center justify-center shrink-0 shadow-md shadow-blue-500/20">
              <Bus className="w-5 h-5 sm:w-6 sm:h-6" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                {isRouteLocked ? (
                  <div className="flex flex-wrap items-center gap-1.5">
                    <h2 className="font-extrabold text-slate-900 text-sm sm:text-lg leading-tight">
                      {currentRoute.code} - {currentRoute.name} ({currentRoute.plateNumber})
                    </h2>
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-slate-100 text-slate-600 rounded-md text-[10px] font-bold border border-slate-200">
                      <Lock className="w-3 h-3 text-slate-500" />
                      Tuyến được phân công
                    </span>
                  </div>
                ) : (
                  <select
                    value={currentRoute.id}
                    onChange={(e) => onSelectRoute(e.target.value)}
                    className="font-extrabold text-slate-900 text-sm sm:text-lg bg-transparent border-b border-dashed border-slate-300 focus:outline-none focus:border-blue-600 cursor-pointer max-w-full"
                  >
                    {routes.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.code} - {r.name} ({r.plateNumber})
                      </option>
                    ))}
                  </select>
                )}
                {isReportSubmitted && (
                  <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 rounded-full text-[10px] font-extrabold">
                    Đã gửi điểm danh ({reportSubmittedAt})
                  </span>
                )}
              </div>
              <p className="text-[11px] sm:text-xs text-slate-500 mt-0.5 truncate">
                Lái xe: <strong className="text-slate-700">{currentRoute.driverName}</strong> ({currentRoute.driverPhone})
                • Giám sát xe: <strong className="text-slate-700">{currentRoute.supervisorName}</strong>
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onOpenQrScanner}
            className="px-2.5 sm:px-3.5 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white rounded-xl text-[11px] sm:text-xs font-bold shadow-md shadow-blue-600/20 flex items-center gap-1.5 transition-transform active:scale-95 shrink-0 whitespace-nowrap"
          >
            <QrCode className="w-4 h-4 shrink-0" />
            <span className="sm:hidden">Quét QR</span>
            <span className="hidden sm:inline">Quét Mã Thẻ QR</span>
          </button>
        </div>

        {/* Live Progress Bar */}
        <div className="mt-4 pt-4 border-t border-slate-100">
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs mb-1.5 font-medium">
            <span className="text-slate-600">
              {activeSessionType === 'morning' ? 'Tiến độ đón sáng:' : 'Tiến độ trả chiều:'}
            </span>
            <span className="font-bold text-slate-900">
              {activeSessionType === 'morning'
                ? `Thực tế trên xe: ${morningTotalOnBus} (Tuyến: ${morningBoardedNative}/${total}${
                    incomingAcceptedStudents.length > 0 ? ` + Đi nhờ: ${incomingAcceptedStudents.length}` : ''
                  }) • Vắng: ${morningAbsent}${
                    transferredOutAcceptedCount > 0 ? ` • Chuyển xe khác: ${transferredOutAcceptedCount}` : ''
                  } • Chưa đón: ${morningPending}`
                : `Trên xe: ${afternoonTotalOnBus} • Đã trả: ${afternoonDropped}/${afternoonTotalOnBus || total}`}
            </span>
          </div>
          <div className="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden flex">
            <div
              className="bg-emerald-500 h-full transition-all duration-300"
              style={{
                width: `${
                  total
                    ? ((activeSessionType === 'morning' ? morningBoardedNative : afternoonBoardedNative) /
                        total) *
                      100
                    : 0
                }%`,
              }}
              title={activeSessionType === 'morning' ? 'Đã lên xe sáng' : 'Đã lên xe chiều'}
            />
            <div
              className="bg-purple-500 h-full transition-all duration-300"
              style={{ width: `${total ? (transferredOutAcceptedCount / total) * 100 : 0}%` }}
              title="Đi nhờ xe khác"
            />
            <div
              className="bg-rose-400 h-full transition-all duration-300"
              style={{
                width: `${
                  total
                    ? ((activeSessionType === 'morning' ? morningAbsent : afternoonAbsent) / total) *
                      100
                    : 0
                }%`,
              }}
              title={activeSessionType === 'morning' ? 'Vắng sáng' : 'Vắng chiều / PH đón'}
            />
          </div>
        </div>
      </div>

      {reportBanner && (
        <div className="p-3.5 bg-emerald-50 border border-emerald-300 text-emerald-900 rounded-2xl flex items-center justify-between gap-2 text-xs font-bold shadow-xs">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
            <span>{reportBanner}</span>
          </div>
          <button onClick={() => setReportBanner(null)} className="p-1 text-emerald-700 hover:bg-emerald-100 rounded-lg">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* INCOMING BUS TRANSFER REQUESTS PANEL (Scoped to Morning OR Afternoon) */}
      {incomingTransfers.length > 0 && (
        <div className="bg-purple-50 border-2 border-purple-300 rounded-2xl p-4 space-y-3 shadow-xs">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-purple-600 text-white flex items-center justify-center shrink-0">
                <UserPlus className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-extrabold text-purple-950 text-sm">
                  Học Sinh Đi Nhờ Từ Xe Khác Gửi Sang -{' '}
                  {activeSessionType === 'morning' ? 'Ca Sáng' : 'Ca Chiều'} ({incomingTransfers.length} em)
                </h3>
                <p className="text-xs text-purple-700">
                  {incomingPendingCount > 0
                    ? `Có ${incomingPendingCount} học sinh đang chờ bạn xác nhận đã lên xe ${currentRoute.code}.`
                    : `Tất cả học sinh đi nhờ đã được xe ${currentRoute.code} xác nhận đón.`}
                </p>
              </div>
            </div>
          </div>

          <div className="divide-y divide-purple-200 bg-white rounded-xl border border-purple-200 overflow-hidden">
            {incomingTransfers.map((s) => {
              const rec = records[s.id];
              const transfer = getSessionTransfer(rec, activeSessionType);
              const fromRoute = routes.find((r) => r.id === transfer?.fromRouteId);
              const isAccepted = transfer?.status === 'accepted';
              const isDroppedOff = rec?.afternoonDropoffStatus === 'dropped_off';

              return (
                <div
                  key={s.id}
                  className="p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl overflow-hidden bg-slate-200 shrink-0 border border-purple-200">
                      <img src={s.avatar} alt={s.name} className="w-full h-full object-cover" />
                    </div>
                    <div>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="font-bold text-slate-900 text-sm">{s.name}</span>
                        <span className="px-1.5 py-0.5 bg-slate-100 text-slate-700 font-mono text-[11px] rounded font-semibold">
                          {s.class}
                        </span>
                        <span className="px-2 py-0.5 bg-purple-100 text-purple-800 rounded font-bold text-[10px]">
                          Từ xe {fromRoute?.code || 'khác'} gửi sang
                        </span>
                      </div>
                      <p className="text-xs text-slate-500 mt-0.5">
                        {transfer?.note} • Yêu cầu lúc {transfer?.requestedAt} • SĐT PH: {s.parentPhone}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {!isAccepted ? (
                      <>
                        <button
                          type="button"
                          onClick={() => handleRespondTransfer(s, true)}
                          className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-xs"
                        >
                          <CheckCircle2 className="w-4 h-4" />
                          <span>Xác Nhận Đón Lên Xe</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleRespondTransfer(s, false)}
                          className="px-3 py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-xl text-xs font-bold flex items-center gap-1"
                        >
                          <XCircle className="w-4 h-4" />
                          <span>Từ chối</span>
                        </button>
                      </>
                    ) : (
                      <div className="flex items-center gap-2">
                        <span className="px-3 py-1.5 bg-emerald-100 text-emerald-800 rounded-xl text-xs font-bold flex items-center gap-1">
                          <CheckCircle2 className="w-4 h-4" />
                          Đã xác nhận đón ({transfer?.acceptedAt})
                        </span>
                        {activeSessionType === 'afternoon' && (
                          <button
                            type="button"
                            onClick={() => handleMarkAfternoonDropoff(s.id)}
                            className={`px-3 py-1.5 rounded-xl text-xs font-bold ${
                              isDroppedOff
                                ? 'bg-indigo-600 text-white'
                                : 'bg-indigo-50 text-indigo-700 border border-indigo-200 hover:bg-indigo-100'
                            }`}
                          >
                            {isDroppedOff ? `Đã trả (${rec?.afternoonDropoffTime})` : 'Đã trả điểm'}
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Student List & Attendance Toggles */}
      <div className="bg-white rounded-2xl shadow-xs border border-slate-200 overflow-hidden">
        {/* Top Action Bar: Evenly Aligned Action Buttons */}
        <div className="p-2.5 sm:p-3 bg-gradient-to-r from-slate-50 via-blue-50/40 to-emerald-50/40 border-b border-slate-200">
          <div
            className={`grid gap-1.5 sm:gap-2 ${
              activeSessionType === 'afternoon'
                ? 'grid-cols-2 lg:grid-cols-4'
                : 'grid-cols-2'
            }`}
          >
            <button
              type="button"
              onClick={() => setShowSubmitReportModal(true)}
              className="w-full px-2 sm:px-3.5 py-2 sm:py-2.5 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-slate-950 text-[11px] sm:text-xs font-extrabold rounded-xl shadow-xs transition-all flex items-center justify-center gap-1 sm:gap-1.5 whitespace-nowrap active:scale-95"
            >
              <ClipboardCheck className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
              <span className="truncate">
                {isReportSubmitted ? (
                  <>
                    Cập Nhật &amp; Gửi Lại
                    <span className="hidden sm:inline"> ({reportSubmittedAt})</span>
                  </>
                ) : (
                  'Gửi Điểm Danh'
                )}
              </span>
            </button>

            <button
              type="button"
              onClick={handleMarkAllSessionBoarded}
              disabled={activeSessionPendingCount === 0}
              className={`w-full px-2 sm:px-3.5 py-2 sm:py-2.5 rounded-xl text-[11px] sm:text-xs font-bold flex items-center justify-center gap-1 sm:gap-1.5 transition-all whitespace-nowrap ${
                activeSessionPendingCount === 0
                  ? 'bg-emerald-100 text-emerald-700 border border-emerald-200 cursor-default'
                  : 'bg-emerald-600 hover:bg-emerald-700 text-white active:scale-95'
              }`}
            >
              <CheckCheck className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
              <span className="truncate">
                {activeSessionPendingCount === 0
                  ? activeSessionType === 'morning'
                    ? 'Tất cả đã lên xe'
                    : 'Tất cả đã lên xe về'
                  : `Tích lên xe (${activeSessionPendingCount})`}
              </span>
            </button>

            {activeSessionType === 'afternoon' && (
              <>
                <button
                  type="button"
                  onClick={handleMarkAllAfternoonDroppedOff}
                  disabled={afternoonDropped >= afternoonRiders.length}
                  className={`w-full px-2 sm:px-3.5 py-2 sm:py-2.5 rounded-xl text-[11px] sm:text-xs font-bold flex items-center justify-center gap-1 sm:gap-1.5 transition-all whitespace-nowrap ${
                    afternoonDropped >= afternoonRiders.length
                      ? 'bg-indigo-100 text-indigo-700 border border-indigo-200 cursor-default'
                      : 'bg-indigo-600 hover:bg-indigo-700 text-white active:scale-95'
                  }`}
                >
                  <Home className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
                  <span className="truncate">
                    {afternoonDropped >= afternoonRiders.length
                      ? 'Đã trả đủ điểm'
                      : `Tích trả (${afternoonRiders.length - afternoonDropped})`}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setShowConfirmDropoffAllModal(true)}
                  className="w-full px-2 sm:px-3.5 py-2 sm:py-2.5 bg-teal-600 hover:bg-teal-700 text-white text-[11px] sm:text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-1 sm:gap-1.5 whitespace-nowrap active:scale-95"
                >
                  <CheckCircle2 className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
                  <span className="truncate">
                    {isAfternoonDropoffConfirmed ? (
                      <>
                        Đã trả hết
                        <span className="hidden sm:inline"> ({sessionState?.afternoonDropoffConfirmedAt})</span>
                      </>
                    ) : (
                      'Xác nhận trả hết'
                    )}
                  </span>
                </button>
              </>
            )}
          </div>
        </div>

        {/* Filter Bar (All filter buttons kept cleanly on 1 horizontal row) */}
        <div className="px-3 py-2.5 bg-slate-50 border-b border-slate-200 flex flex-col lg:flex-row lg:items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <Filter className="w-3.5 h-3.5 text-slate-400 shrink-0 hidden sm:inline" />
            <span className="text-xs font-bold text-slate-700 shrink-0 hidden md:inline">
              Lọc danh sách:
            </span>
            <div className="flex items-center gap-1 flex-nowrap overflow-x-auto pb-0.5 sm:pb-0">
              <button
                onClick={() => setFilterStatus('all')}
                className={`px-2 sm:px-2.5 py-1 rounded-lg text-[11px] sm:text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                  filterStatus === 'all' ? 'bg-slate-900 text-white' : 'bg-white text-slate-600 border border-slate-200'
                }`}
              >
                Tất cả ({routeStudents.length})
              </button>
              <button
                onClick={() => setFilterStatus('pending')}
                className={`px-2 sm:px-2.5 py-1 rounded-lg text-[11px] sm:text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                  filterStatus === 'pending' ? 'bg-amber-500 text-white' : 'bg-white text-slate-600 border border-slate-200'
                }`}
              >
                {activeSessionType === 'morning'
                  ? `Chưa đón (${morningPending})`
                  : `Chờ lên xe (${afternoonPending})`}
              </button>
              <button
                onClick={() => setFilterStatus('boarded')}
                className={`px-2 sm:px-2.5 py-1 rounded-lg text-[11px] sm:text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                  filterStatus === 'boarded' ? 'bg-emerald-600 text-white' : 'bg-white text-slate-600 border border-slate-200'
                }`}
              >
                {activeSessionType === 'morning'
                  ? `Đã lên xe (${morningBoardedNative})`
                  : `Đi chiều (${afternoonBoardedNative})`}
              </button>
              <button
                onClick={() => setFilterStatus('absent')}
                className={`px-2 sm:px-2.5 py-1 rounded-lg text-[11px] sm:text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                  filterStatus === 'absent' ? 'bg-rose-600 text-white' : 'bg-white text-slate-600 border border-slate-200'
                }`}
              >
                {activeSessionType === 'morning'
                  ? `Vắng (${morningAbsent})`
                  : `Vắng/PH đón (${afternoonAbsent})`}
              </button>
            </div>
          </div>

          <div className="text-[11px] sm:text-xs text-slate-500 shrink-0">
            Hiển thị điểm: <strong className="text-slate-800">{activeStop?.name}</strong>
          </div>
        </div>

        {/* Scrollable Student List with Pinned Column Header */}
        <div className="max-h-[58vh] min-h-[260px] overflow-y-auto">
          {filteredStudents.length > 0 && (
            <div className="sticky top-0 z-10 px-2.5 sm:px-3.5 py-1.5 bg-slate-100 border-b border-slate-200 text-[10px] font-bold uppercase tracking-wider text-slate-500 flex items-center justify-between gap-2">
              <div className="min-w-0 flex-1 flex items-center gap-1.5 sm:gap-2">
                <span className="w-5 sm:w-6 shrink-0 text-right">STT</span>
                <span className="min-w-0 flex-1 truncate">Họ và tên học sinh</span>
                <span className="w-11 sm:w-14 shrink-0 text-center">Lớp</span>
                <span className="w-7 sm:w-28 shrink-0 text-center sm:text-left">SĐT</span>
              </div>
              <span className="shrink-0 text-right">
                {activeSessionType === 'morning' ? (
                  <>
                    <span className="sm:hidden">Trạng thái</span>
                    <span className="hidden sm:inline">Trạng thái (Mặc định: Đã lên)</span>
                  </>
                ) : (
                  <>
                    <span className="sm:hidden">Trạng thái · Trả</span>
                    <span className="hidden sm:inline">Trạng thái · Trả điểm</span>
                  </>
                )}
              </span>
            </div>
          )}

          {/* Compact Single-Row Student List */}
          <div className="divide-y divide-slate-100">
            {filteredStudents.length === 0 ? (
              <div className="text-center py-8 text-slate-400 text-sm">
                Không có học sinh nào theo bộ lọc này
              </div>
            ) : (
            filteredStudents.map((s, idx) => {
              const rec = records[s.id];
              const stop = currentRoute.stops.find((st) => st.id === s.stopId);
              const isCurrentStop = s.stopId === activeStop?.id;

              const sessionTransfer = getSessionTransfer(rec, activeSessionType);
              const hasOutgoingTransfer =
                sessionTransfer?.fromRouteId === currentRoute.id && Boolean(sessionTransfer?.toRouteId);
              const targetRoute = hasOutgoingTransfer
                ? routes.find((r) => r.id === sessionTransfer?.toRouteId)
                : undefined;
              const transferAccepted = hasOutgoingTransfer && sessionTransfer?.status === 'accepted';
              const transferPending = hasOutgoingTransfer && sessionTransfer?.status === 'pending_accept';
              const transferRejected = hasOutgoingTransfer && sessionTransfer?.status === 'rejected';

              const isBoarded =
                activeSessionType === 'morning'
                  ? rec?.morningPickupStatus === 'boarded'
                  : rec?.afternoonBoardStatus === 'boarded';
              const isAbsent =
                activeSessionType === 'morning'
                  ? rec?.morningPickupStatus === 'absent'
                  : rec?.afternoonBoardStatus === 'absent';
              const isDroppedOff = rec?.afternoonDropoffStatus === 'dropped_off';
              const selectValue: 'boarded' | 'absent' = isAbsent ? 'absent' : 'boarded';

              return (
                <div
                  key={s.id}
                  className={`px-2.5 sm:px-3.5 py-2 transition-colors ${
                    transferAccepted
                      ? 'bg-purple-50/50 border-l-4 border-l-purple-500'
                      : isCurrentStop
                      ? 'bg-blue-50/40 border-l-4 border-l-blue-500'
                      : 'hover:bg-slate-50'
                  }`}
                >
                  {/* Main Single Row: STT + Name + Class + Phone | Status Dropdown (+ Dropoff in Afternoon) */}
                  <div className="flex items-center justify-between gap-2">
                    {/* Left: STT · Full Name · Class · Phone */}
                    <div className="min-w-0 flex-1 flex items-center gap-1.5 sm:gap-2">
                      <span className="text-[11px] font-mono font-bold text-slate-400 w-5 sm:w-6 shrink-0 text-right">
                        {idx + 1}.
                      </span>

                      <div className="min-w-0 flex-1 flex items-center gap-1.5">
                        <h4
                          className="font-bold text-slate-900 text-xs sm:text-sm truncate"
                          title={`${s.name} (${s.class}) - ${stop?.name || ''}`}
                        >
                          {s.name}
                        </h4>
                        {(s.notes || rec?.parentExcusedReason) && (
                          <span
                            className="hidden lg:inline-block truncate max-w-[140px] text-[10px] px-1.5 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-200 font-medium shrink-0"
                            title={rec?.parentExcusedReason || s.notes}
                          >
                            {rec?.parentExcusedReason ? `PH: ${rec.parentExcusedReason}` : s.notes}
                          </span>
                        )}
                      </div>

                      {/* Class Column (always visible) */}
                      <div className="w-11 sm:w-14 shrink-0 flex justify-center">
                        <span className="px-1.5 py-0.5 bg-slate-100 text-slate-700 border border-slate-200 font-mono text-[10px] sm:text-[11px] rounded font-bold truncate max-w-full">
                          {s.class}
                        </span>
                      </div>

                      {/* Parent Phone Column */}
                      <div className="w-7 sm:w-28 shrink-0 flex items-center justify-center sm:justify-start">
                        <a
                          href={`tel:${s.parentPhone}`}
                          className="inline-flex items-center gap-1 px-1.5 py-1 text-blue-600 hover:bg-blue-50 rounded-md transition-colors text-[11px] font-mono font-semibold"
                          title={`Gọi PH ${s.parentName}: ${s.parentPhone}${stop?.name ? ` • Điểm: ${stop.name}` : ''}`}
                        >
                          <Phone className="w-3.5 h-3.5 shrink-0" />
                          <span className="hidden sm:inline truncate">{s.parentPhone}</span>
                        </a>
                      </div>
                    </div>

                    {/* Right: Status Dropdown (Đã lên / Vắng / Đi nhờ) + Afternoon Drop-off */}
                    <div className="flex items-center gap-1.5 shrink-0">
                      {transferAccepted ? (
                        <div className="flex items-center gap-1.5">
                          <span className="px-2 py-1 bg-purple-100 text-purple-800 border border-purple-200 rounded-lg text-[11px] font-bold whitespace-nowrap">
                            Đi nhờ {targetRoute?.code}
                          </span>
                          <button
                            type="button"
                            onClick={() => handleCancelTransfer(s)}
                            className="px-2 py-1 bg-white hover:bg-purple-100 text-purple-800 border border-purple-200 rounded-lg text-[11px] font-bold whitespace-nowrap"
                          >
                            Hủy
                          </button>
                        </div>
                      ) : transferPending ? (
                        <div className="flex items-center gap-1.5">
                          <span className="px-2 py-1 bg-amber-100 text-amber-800 border border-amber-200 rounded-lg text-[11px] font-bold whitespace-nowrap">
                            Chờ {targetRoute?.code}
                          </span>
                          <button
                            type="button"
                            onClick={() => handleCancelTransfer(s)}
                            className="px-2 py-1 bg-white hover:bg-amber-100 text-amber-800 border border-amber-200 rounded-lg text-[11px] font-bold whitespace-nowrap"
                          >
                            Hủy
                          </button>
                        </div>
                      ) : (
                        <>
                          <div className="relative">
                            <select
                              value={selectValue}
                              aria-label={`Trạng thái điểm danh của ${s.name}`}
                              onChange={(e) => {
                                const val = e.target.value as 'boarded' | 'absent' | 'transfer';
                                if (val === 'transfer') {
                                  openTransferModal(s);
                                  return;
                                }
                                if (activeSessionType === 'morning') {
                                  handleMarkMorningStatus(s.id, val);
                                } else {
                                  handleMarkAfternoonBoardStatus(s.id, val);
                                }
                              }}
                              className={`appearance-none cursor-pointer pl-2.5 pr-6 py-1.5 rounded-lg text-[11px] font-bold border transition-all focus:outline-none focus:ring-2 focus:ring-blue-500/30 ${
                                isAbsent
                                  ? 'bg-rose-600 text-white border-rose-600 shadow-xs'
                                  : isBoarded
                                  ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs'
                                  : 'bg-emerald-50 text-emerald-800 border-emerald-300 hover:bg-emerald-100'
                              }`}
                            >
                              <option value="boarded" className="bg-white text-emerald-800 font-bold">
                                Đã lên
                              </option>
                              <option value="absent" className="bg-white text-rose-700 font-bold">
                                Vắng
                              </option>
                              {otherRoutes.length > 0 && (
                                <option value="transfer" className="bg-white text-purple-800 font-bold">
                                  Đi nhờ
                                </option>
                              )}
                            </select>
                            <ChevronDown
                              className={`w-3.5 h-3.5 pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 ${
                                isAbsent || isBoarded ? 'text-white' : 'text-emerald-700'
                              }`}
                            />
                          </div>

                          {activeSessionType === 'afternoon' && (
                            <button
                              type="button"
                              onClick={() => handleMarkAfternoonDropoff(s.id)}
                              disabled={isAbsent}
                              className={`px-2 py-1.5 rounded-lg text-[11px] font-bold transition-all flex items-center gap-1 whitespace-nowrap ${
                                isAbsent
                                  ? 'bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed'
                                  : isDroppedOff
                                  ? 'bg-indigo-600 text-white shadow-xs'
                                  : 'bg-indigo-50 text-indigo-700 hover:bg-indigo-100 border border-indigo-200'
                              }`}
                              title={isAbsent ? 'Học sinh vắng / PH đón' : 'Xác nhận đã trả học sinh tại điểm'}
                            >
                              <Check className="hidden sm:inline w-3.5 h-3.5" />
                              <span>{isDroppedOff ? 'Đã trả' : 'Trả'}</span>
                            </button>
                          )}
                        </>
                      )}
                    </div>
                  </div>

                  {/* Subtle inline alert line ONLY when rejected transfer or mobile parent note exists */}
                  {(transferRejected || rec?.parentExcusedReason) && (
                    <div className="mt-1 pl-6 flex flex-wrap items-center gap-1.5 text-[10px]">
                      {rec?.parentExcusedReason && (
                        <span className="lg:hidden px-1.5 py-0.5 bg-rose-50 text-rose-700 border border-rose-200 rounded font-medium">
                          PH báo: {rec.parentExcusedReason}
                        </span>
                      )}
                      {transferRejected && (
                        <span className="px-1.5 py-0.5 bg-rose-100 text-rose-800 border border-rose-200 rounded font-bold inline-flex items-center gap-1">
                          <AlertTriangle className="w-3 h-3" />
                          Xe {targetRoute?.code} từ chối nhận
                        </span>
                      )}
                    </div>
                  )}
                </div>
              );
            })
            )}
          </div>
        </div>

        {/* Ghi chú mặc định (moved below student list) */}
        <div className="px-3.5 py-2.5 bg-emerald-50/90 border-t border-emerald-200 text-xs text-slate-700 flex items-start sm:items-center gap-2 leading-relaxed">
          <Info className="w-4 h-4 text-emerald-700 shrink-0 mt-0.5 sm:mt-0" />
          <div>
            <span className="font-extrabold text-emerald-900">Ghi chú:</span> Mặc định tất cả học sinh trên xe đều đã lên xe. Chỉ cần đổi sang{' '}
            <strong>Vắng</strong> hoặc <strong>Đi nhờ</strong> nếu có thay đổi, sau đó bấm <strong>Gửi Điểm Danh</strong>.
          </div>
        </div>

        {/* Footer: Submit Attendance Report / Confirm Afternoon Drop-off */}
        <div className="p-4 bg-gradient-to-r from-slate-900 to-blue-950 text-white border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="text-xs space-y-0.5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-extrabold text-sm">
                {activeSessionType === 'morning'
                  ? 'Hoàn Tất Đón Sáng & Gửi Điểm Danh'
                  : 'Hoàn Tất Trả Học Sinh Buổi Chiều'}
              </span>
              {activeSessionType === 'morning' && isReportSubmitted && (
                <span className="px-2 py-0.5 bg-emerald-500 text-white rounded-full text-[10px] font-bold">
                  Đã gửi lúc {reportSubmittedAt}
                </span>
              )}
              {activeSessionType === 'afternoon' && isAfternoonDropoffConfirmed && (
                <span className="px-2 py-0.5 bg-emerald-500 text-white rounded-full text-[10px] font-bold">
                  Đã xác nhận trả hết lúc {sessionState?.afternoonDropoffConfirmedAt}
                </span>
              )}
            </div>
            <p className="text-slate-300">
              {activeSessionType === 'morning'
                ? `Tổng sĩ số: ${total} • Thực tế trên xe: ${morningTotalOnBus} em • Vắng: ${morningAbsent} em${
                    transferredOutAcceptedCount > 0 ? ` • Chuyển xe khác: ${transferredOutAcceptedCount}` : ''
                  }`
                : `Tổng sĩ số: ${total} • Đã trả tại điểm: ${afternoonDropped}/${afternoonRiders.length} em • Vắng/PH đón: ${afternoonAbsent} em`}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
            {activeSessionType === 'afternoon' && (
              <button
                type="button"
                onClick={() => setShowConfirmDropoffAllModal(true)}
                className="flex-1 sm:flex-initial px-4 py-2.5 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 text-xs font-extrabold rounded-xl shadow-lg transition-all flex items-center justify-center gap-2 shrink-0"
              >
                <Home className="w-4 h-4" />
                <span>
                  {isAfternoonDropoffConfirmed
                    ? `Đã Xác Nhận Trả Hết (${sessionState?.afternoonDropoffConfirmedAt})`
                    : 'Xác Nhận Đã Trả Hết Học Sinh'}
                </span>
              </button>
            )}

            <button
              onClick={() => setShowSubmitReportModal(true)}
              className="flex-1 sm:flex-initial px-4 py-2.5 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-slate-950 text-xs font-extrabold rounded-xl shadow-lg transition-all flex items-center justify-center gap-2 shrink-0"
            >
              <ClipboardCheck className="w-4 h-4" />
              <span>
                {isReportSubmitted
                  ? 'Cập Nhật & Gửi Lại Điểm Danh'
                  : 'Gửi Điểm Danh Cho Giám Sát & Quản Trị'}
              </span>
            </button>
          </div>
        </div>
      </div>

      {/* Stop Progression Navigation Bar */}
      <div className="bg-slate-900 text-white rounded-2xl p-4 shadow-lg">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <div className="flex items-center gap-2">
            <MapPin className="w-4 h-4 text-amber-400" />
            <span className="text-xs font-bold uppercase tracking-wider text-slate-300">
              Lộ trình điểm dừng ({activeStopIndex + 1}/{currentRoute.stops.length})
            </span>
          </div>
          <button
            onClick={handleNotifyStopArrival}
            className="px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold rounded-xl flex items-center gap-1.5 shadow-sm transition-all active:scale-95"
          >
            <Send className="w-3.5 h-3.5" />
            Báo Đã Đến Điểm Này Cho Phụ Huynh
          </button>
        </div>

        {/* Stops Carousel */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 overflow-x-auto pb-1">
          {currentRoute.stops.map((stop, index) => {
            const isActive = index === activeStopIndex;
            const isSchool = index === currentRoute.stops.length - 1;
            const stopStudentsCount = routeStudents.filter((s) => s.stopId === stop.id).length;

            return (
              <button
                key={stop.id}
                onClick={() => setActiveStopIndex(index)}
                className={`p-2.5 rounded-xl text-left border transition-all ${
                  isActive
                    ? 'bg-blue-600/30 border-blue-400 ring-2 ring-blue-500/50'
                    : 'bg-slate-800/80 border-slate-700/60 hover:bg-slate-800'
                }`}
              >
                <div className="flex items-center justify-between text-[11px] mb-1">
                  <span className="font-mono text-slate-400">
                    {activeSessionType === 'morning' ? stop.morningTime : stop.afternoonTime}
                  </span>
                  {isSchool ? (
                    <span className="px-1.5 py-0.2 bg-amber-400/20 text-amber-300 rounded text-[9px] font-bold">
                      TRƯỜNG
                    </span>
                  ) : (
                    <span className="px-1.5 py-0.2 bg-slate-700 text-slate-300 rounded text-[9px]">
                      {stopStudentsCount} HS
                    </span>
                  )}
                </div>
                <p className="text-xs font-bold text-white line-clamp-1">{stop.name}</p>
                <p className="text-[10px] text-slate-400 line-clamp-1 mt-0.5">{stop.landmark || stop.address}</p>
              </button>
            );
          })}
        </div>
      </div>

      {/* Safety Protocol Box (moved down below) */}
      <div
        className={`w-full p-3.5 rounded-2xl border transition-all ${
          emptyBusChecked
            ? 'bg-emerald-50 border-emerald-200 text-emerald-950'
            : 'bg-rose-50 border-rose-300 text-rose-950 shadow-xs'
        }`}
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div
              className={`p-2 rounded-xl shrink-0 ${
                emptyBusChecked ? 'bg-emerald-500 text-white' : 'bg-rose-600 text-white'
              }`}
            >
              <ShieldAlert className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-1.5">
                <h4 className="font-bold text-xs sm:text-sm leading-tight">
                  Quy Trình An Toàn: Quét Xe Trống
                </h4>
                {emptyBusChecked && (
                  <span className="px-1.5 py-0.5 bg-emerald-200 text-emerald-800 rounded text-[10px] font-extrabold">
                    ĐÃ XÁC NHẬN
                  </span>
                )}
              </div>
              <p className="text-[11px] sm:text-xs text-slate-600 mt-0.5 leading-snug">
                {emptyBusChecked
                  ? `Đã rà soát không còn học sinh trên xe lúc ${
                      activeSessionType === 'morning'
                        ? sessionState.morningEmptyBusCheckedAt
                        : sessionState.afternoonEmptyBusCheckedAt || 'hôm nay'
                    }.`
                  : 'Kiểm tra gầm ghế & hàng ghế cuối trước khi bàn giao xe sau chuyến.'}
              </p>
            </div>
          </div>

          {!emptyBusChecked ? (
            <button
              type="button"
              onClick={() => setShowEmptyBusConfirm(true)}
              className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold rounded-xl shadow-xs transition-colors shrink-0 whitespace-nowrap"
            >
              Xác Nhận Xe Trống
            </button>
          ) : (
            <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-700 shrink-0 whitespace-nowrap">
              <CheckCircle2 className="w-4 h-4" />
              <span>Đã đảm bảo an toàn</span>
            </div>
          )}
        </div>
      </div>

      {/* Modal: Request Cross-Bus Transfer */}
      {transferModalStudent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/65 backdrop-blur-xs">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 space-y-4">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-xl bg-purple-100 text-purple-700 flex items-center justify-center">
                  <ArrowRightLeft className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-extrabold text-slate-900 text-base">
                    Chuyển Học Sinh Đi Nhờ Xe Khác
                  </h3>
                  <p className="text-xs text-slate-500">
                    {transferModalStudent.name} ({transferModalStudent.class}) • Xe gốc: {currentRoute.code}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setTransferModalStudent(null)}
                className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleConfirmRequestTransfer} className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                  Buổi đi nhờ *
                </label>
                <div className="grid grid-cols-3 gap-1.5">
                  {[
                    { id: 'morning' as const, label: 'Chỉ Ca Sáng' },
                    { id: 'afternoon' as const, label: 'Chỉ Ca Chiều' },
                    { id: 'both' as const, label: 'Cả Sáng & Chiều' },
                  ].map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setTransferScope(opt.id)}
                      className={`py-2 px-2 rounded-xl text-xs font-bold border transition-colors ${
                        transferScope === opt.id
                          ? 'bg-purple-600 text-white border-purple-600 shadow-xs'
                          : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                  Chọn xe nhận học sinh đi nhờ *
                </label>
                <select
                  required
                  value={transferTargetRouteId}
                  onChange={(e) => setTransferTargetRouteId(e.target.value)}
                  className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-semibold"
                >
                  {otherRoutes.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.code} - {r.name} (LX: {r.driverName})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                  Lý do / Ghi chú gửi tài xế xe nhận, Giám sát & Quản trị
                </label>
                <input
                  type="text"
                  placeholder="VD: Hôm nay bé đi nhờ xe cùng bạn sang nhà bà..."
                  value={transferNote}
                  onChange={(e) => setTransferNote(e.target.value)}
                  className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs"
                />
              </div>

              <div className="p-3 bg-purple-50 border border-purple-200 rounded-xl text-[11px] text-purple-900 leading-relaxed">
                Sau khi gửi, lái xe tuyến được chọn sẽ nhận yêu cầu đúng theo buổi bạn chọn để bấm <strong>Xác nhận đón lên xe</strong>. Các buổi còn lại học sinh vẫn đi theo xe gốc bình thường.
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setTransferModalStudent(null)}
                  className="flex-1 py-2.5 bg-slate-100 text-slate-700 rounded-xl text-xs font-bold hover:bg-slate-200"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-xs font-bold shadow-md"
                >
                  Gửi Sang Xe Nhận
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Confirm Empty Bus Check */}
      {showEmptyBusConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 text-center space-y-4">
            <div className="w-14 h-14 rounded-2xl bg-rose-100 text-rose-600 flex items-center justify-center mx-auto">
              <ShieldAlert className="w-8 h-8" />
            </div>
            <div>
              <h3 className="font-extrabold text-slate-900 text-lg">Cam Kết Rà Soát Xe Trống</h3>
              <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                Tôi xác nhận đã đích thân đi dọc xe, kiểm tra dưới tất cả gầm ghế và hàng ghế sau cùng. Hiện tại không còn
                bất kỳ học sinh nào còn sót lại trên xe.
              </p>
            </div>
            <div className="pt-2 flex gap-3">
              <button
                onClick={() => setShowEmptyBusConfirm(false)}
                className="flex-1 py-2.5 bg-slate-100 text-slate-700 rounded-xl text-xs font-bold hover:bg-slate-200"
              >
                Hủy bỏ
              </button>
              <button
                onClick={handleConfirmEmptyBus}
                className="flex-1 py-2.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold shadow-md"
              >
                Tôi Đã Kiểm Tra Xong
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Submit Attendance Report to Supervisor & Admin */}
      {showSubmitReportModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 space-y-4">
            <div className="w-14 h-14 rounded-2xl bg-blue-100 text-blue-600 flex items-center justify-center mx-auto">
              <Building2 className="w-8 h-8" />
            </div>
            <div className="text-center">
              <h3 className="font-extrabold text-slate-900 text-lg">
                Gửi Điểm Danh Xe {currentRoute.code}
              </h3>
              <p className="text-xs text-slate-600 mt-1">
                Số liệu tổng hợp bên dưới sẽ được gửi ngay tới <strong>Giám sát nhà trường</strong> và <strong>Quản trị viên</strong> để đối chiếu thực tế khi xe vào trường.
              </p>
            </div>

            <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 text-xs space-y-1.5">
              <div className="flex justify-between">
                <span className="text-slate-600">• Tổng sĩ số tuyến:</span>
                <strong className="text-slate-900">{total} học sinh</strong>
              </div>
              <div className="flex justify-between text-emerald-700">
                <span>• Số học sinh có đi (trên xe này):</span>
                <strong>
                  {projectedBoardedOnSubmit} học sinh
                  {autoMarkPendingAsBoarded && activeSessionPendingCount > 0
                    ? ` (+${activeSessionPendingCount} mặc định lên xe)`
                    : ''}
                </strong>
              </div>
              <div className="flex justify-between text-rose-600">
                <span>• Số học sinh vắng / nghỉ:</span>
                <strong>{activeSessionType === 'morning' ? morningAbsent : afternoonAbsent} học sinh</strong>
              </div>
              {transferredOutAcceptedCount > 0 && (
                <div className="flex justify-between text-purple-700">
                  <span>• Chuyển đi nhờ sang xe khác:</span>
                  <strong>{transferredOutAcceptedCount} học sinh</strong>
                </div>
              )}
              {incomingAcceptedStudents.length > 0 && (
                <div className="flex justify-between text-indigo-700">
                  <span>• Đón đi nhờ từ xe khác:</span>
                  <strong>{incomingAcceptedStudents.length} học sinh</strong>
                </div>
              )}
            </div>

            {activeSessionPendingCount > 0 && (
              <label className="flex items-start gap-2.5 p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-950 cursor-pointer">
                <input
                  type="checkbox"
                  checked={autoMarkPendingAsBoarded}
                  onChange={(e) => setAutoMarkPendingAsBoarded(e.target.checked)}
                  className="w-4 h-4 rounded border-emerald-400 text-emerald-600 mt-0.5 shrink-0"
                />
                <span>
                  Mặc định <strong>{activeSessionPendingCount} học sinh còn lại</strong> (chưa báo vắng/đi nhờ) là{' '}
                  <strong>ĐÃ LÊN XE</strong> khi gửi điểm danh
                </span>
              </label>
            )}

            {activeSessionType === 'morning' && (
              <label className="flex items-center gap-2.5 p-3 bg-blue-50 border border-blue-200 rounded-xl text-xs text-blue-900 cursor-pointer">
                <input
                  type="checkbox"
                  checked={alsoMarkArrivedAtSchool}
                  onChange={(e) => setAlsoMarkArrivedAtSchool(e.target.checked)}
                  className="w-4 h-4 rounded border-blue-300 text-blue-600 shrink-0"
                />
                <span>Kèm thông báo xe đã cập bến cổng trường để Giám sát kiểm đếm</span>
              </label>
            )}

            <div className="pt-1 flex gap-3">
              <button
                onClick={() => setShowSubmitReportModal(false)}
                className="flex-1 py-2.5 bg-slate-100 text-slate-700 rounded-xl text-xs font-bold hover:bg-slate-200"
              >
                Đóng
              </button>
              <button
                onClick={handleConfirmSubmitReport}
                className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-md"
              >
                Gửi Điểm Danh Ngay
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Confirm Afternoon All Students Dropped Off */}
      {showConfirmDropoffAllModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 space-y-4">
            <div className="w-14 h-14 rounded-2xl bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto">
              <Home className="w-8 h-8" />
            </div>
            <div className="text-center">
              <h3 className="font-extrabold text-slate-900 text-lg">
                Xác Nhận Đã Trả Hết Học Sinh Chiều
              </h3>
              <p className="text-xs text-slate-600 mt-1">
                Xác nhận xe <strong>{currentRoute.code}</strong> đã hoàn tất việc bàn giao toàn bộ học sinh cho gia đình và cập nhật ngay lên bảng tổng hợp của Quản trị & Giám sát.
              </p>
            </div>

            <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 text-xs space-y-1.5">
              <div className="flex justify-between">
                <span className="text-slate-600">• Số học sinh đi chuyến chiều:</span>
                <strong className="text-slate-900">{afternoonRiders.length} học sinh</strong>
              </div>
              <div className="flex justify-between text-emerald-700">
                <span>• Đã tích trả tại điểm:</span>
                <strong>{afternoonDropped} học sinh</strong>
              </div>
              <div className="flex justify-between text-rose-600">
                <span>• Nghỉ / PH đón tại trường:</span>
                <strong>{afternoonAbsent} học sinh</strong>
              </div>
            </div>

            {afternoonDropped < afternoonRiders.length && (
              <label className="flex items-start gap-2 p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-900 cursor-pointer">
                <input
                  type="checkbox"
                  checked={autoDropoffRemaining}
                  onChange={(e) => setAutoDropoffRemaining(e.target.checked)}
                  className="w-4 h-4 rounded border-emerald-300 text-emerald-600 mt-0.5"
                />
                <span>
                  Tự động đánh dấu <strong>Đã trả điểm</strong> cho {afternoonRiders.length - afternoonDropped} học sinh còn lại của chuyến chiều này.
                </span>
              </label>
            )}

            <div className="pt-1 flex gap-3">
              <button
                type="button"
                onClick={() => setShowConfirmDropoffAllModal(false)}
                className="flex-1 py-2.5 bg-slate-100 text-slate-700 rounded-xl text-xs font-bold hover:bg-slate-200"
              >
                Đóng
              </button>
              <button
                type="button"
                onClick={() => {
                  playSound('success');
                  const timeStr = getNowTime();

                  if (autoDropoffRemaining) {
                    const bulkUpdates: Record<string, Partial<CheckinRecord>> = {};
                    afternoonRiders.forEach((s) => {
                      const existing = records[s.id];
                      if (existing?.afternoonDropoffStatus !== 'dropped_off') {
                        bulkUpdates[s.id] = {
                          afternoonBoardStatus:
                            existing?.afternoonBoardStatus === 'boarded'
                              ? existing.afternoonBoardStatus
                              : 'boarded',
                          afternoonBoardTime: existing?.afternoonBoardTime || timeStr,
                          afternoonDropoffStatus: 'dropped_off',
                          afternoonDropoffTime: timeStr,
                        };
                      }
                    });
                    if (Object.keys(bulkUpdates).length > 0) {
                      if (onUpdateRecordsBulk) {
                        onUpdateRecordsBulk(bulkUpdates);
                      } else {
                        Object.entries(bulkUpdates).forEach(([sid, upd]) => onUpdateRecord(sid, upd));
                      }
                    }
                  }

                  onUpdateSessionState({
                    afternoonDropoffConfirmed: true,
                    afternoonDropoffConfirmedAt: timeStr,
                    afternoonDropoffConfirmedBy: currentRoute.driverName,
                    afternoonReportSubmitted: true,
                    afternoonReportSubmittedAt: timeStr,
                    afternoonReportSubmittedBy: currentRoute.driverName,
                    afternoonReportedBoarded: afternoonRiders.length,
                    afternoonReportedAbsent: afternoonAbsent,
                  });

                  onSendNotification(
                    `🏠 Xe ${currentRoute.code} ĐÃ TRẢ HẾT HỌC SINH`,
                    `Lái xe ${currentRoute.driverName} xác nhận đã trả an toàn toàn bộ ${afternoonRiders.length} học sinh chuyến chiều lúc ${timeStr}.`,
                    'arrival',
                    'all'
                  );

                  setShowConfirmDropoffAllModal(false);
                  setReportBanner(`Đã xác nhận trả hết học sinh xe ${currentRoute.code} lúc ${timeStr} và đồng bộ lên Quản trị & Giám sát!`);
                  setTimeout(() => setReportBanner(null), 6000);
                }}
                className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-md"
              >
                Xác Nhận Đã Trả Hết
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
