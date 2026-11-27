import React from 'react';
import {
  Bus,
  CheckCircle2,
  Clock,
  ArrowRightLeft,
  Database,
  AlertTriangle,
  ClipboardCheck,
  Home,
} from 'lucide-react';
import { Route, Student, CheckinRecord, RouteSessionState, SessionType } from '../../types';
import {
  getSessionTransfer,
  isTransferredInAcceptedForSession,
  isTransferredOutAcceptedForSession,
} from '../../utils/transferHelpers';

interface Props {
  routes: Route[];
  students: Student[];
  records: Record<string, CheckinRecord>;
  sessionStates: Record<string, RouteSessionState>;
  activeSessionType: SessionType;
  activeRouteId?: string;
  onSelectRoute?: (routeId: string) => void;
  title?: string;
}

export const RouteAttendanceOverview: React.FC<Props> = ({
  routes,
  students,
  records,
  sessionStates,
  activeSessionType,
  activeRouteId,
  onSelectRoute,
  title = 'Báo Cáo Các Tuyến Xe Đã Đón/Trả & Tình Trạng Lưu CSDL',
}) => {
  const isMorning = activeSessionType === 'morning';

  // Transfers strictly matching the currently selected session (Morning OR Afternoon)
  const sessionTransfers = students
    .map((student) => ({
      student,
      transfer: getSessionTransfer(records[student.id], activeSessionType),
    }))
    .filter((item): item is { student: Student; transfer: NonNullable<typeof item.transfer> } =>
      Boolean(item.transfer)
    );

  return (
    <div className="space-y-3">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <ClipboardCheck className="w-4 h-4 text-blue-600" />
            <h3 className="font-extrabold text-slate-900 text-sm">{title}</h3>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-[11px]">
            <span
              className={`px-2 py-0.5 rounded-full font-extrabold ${
                isMorning
                  ? 'bg-amber-100 text-amber-800 border border-amber-200'
                  : 'bg-indigo-100 text-indigo-800 border border-indigo-200'
              }`}
            >
              {isMorning ? 'Ca Sáng (Đón đến trường)' : 'Ca Chiều (Trả về điểm)'}
            </span>
            {onSelectRoute && (
              <span className="text-slate-500 font-medium">
                Bấm vào từng hàng để chọn xe kiểm tra & chốt CSDL
              </span>
            )}
          </div>
        </div>

        {/* Horizontal 1-row-per-bus table with sticky first header row */}
        <div className="overflow-auto max-h-[440px]">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="text-slate-700 font-bold uppercase tracking-wider text-[11px]">
                <th className="sticky top-0 z-20 bg-slate-100 shadow-[inset_0_-1px_0_0_#cbd5e1] py-3 px-3 pl-4 whitespace-nowrap">
                  Tuyến xe / Lái xe
                </th>
                <th className="sticky top-0 z-20 bg-slate-100 shadow-[inset_0_-1px_0_0_#cbd5e1] py-3 px-3 text-center whitespace-nowrap">
                  Sĩ số
                </th>
                <th className="sticky top-0 z-20 bg-slate-100 shadow-[inset_0_-1px_0_0_#cbd5e1] py-3 px-3 text-center whitespace-nowrap">
                  {isMorning ? 'Đi sáng (LX đón)' : 'Đi chiều (Lên xe)'}
                </th>
                <th className="sticky top-0 z-20 bg-slate-100 shadow-[inset_0_-1px_0_0_#cbd5e1] py-3 px-3 text-center whitespace-nowrap">
                  {isMorning ? 'Vắng sáng' : 'Vắng / PH đón'}
                </th>
                <th className="sticky top-0 z-20 bg-slate-100 shadow-[inset_0_-1px_0_0_#cbd5e1] py-3 px-3 text-center whitespace-nowrap">
                  {isMorning ? 'Vào trường (GS)' : 'Đã trả điểm'}
                </th>
                <th className="sticky top-0 z-20 bg-slate-100 shadow-[inset_0_-1px_0_0_#cbd5e1] py-3 px-3 text-center whitespace-nowrap">
                  Trả học sinh (Chiều)
                </th>
                <th className="sticky top-0 z-20 bg-slate-100 shadow-[inset_0_-1px_0_0_#cbd5e1] py-3 px-3 pr-4 text-right whitespace-nowrap">
                  Báo cáo & Lưu CSDL
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {routes.map((route) => {
                const st = sessionStates[route.id];
                const nativeStudents = students.filter((s) => s.routeId === route.id);

                // Session-scoped transfers for the active session (for badge & primary metrics)
                const transferredOutAccepted = nativeStudents.filter((s) =>
                  isTransferredOutAcceptedForSession(records[s.id], route.id, activeSessionType)
                ).length;

                const transferredInStudents = students.filter(
                  (s) =>
                    s.routeId !== route.id &&
                    isTransferredInAcceptedForSession(records[s.id], route.id, activeSessionType)
                );
                const transferredInAccepted = transferredInStudents.length;

                const ridersActiveSession = [
                  ...nativeStudents.filter(
                    (s) =>
                      !isTransferredOutAcceptedForSession(
                        records[s.id],
                        route.id,
                        activeSessionType
                      )
                  ),
                  ...transferredInStudents,
                ];

                // Morning-only metrics
                const morningBoarded = ridersActiveSession.filter(
                  (s) => records[s.id]?.morningPickupStatus === 'boarded'
                ).length;
                const morningAbsent = ridersActiveSession.filter(
                  (s) => records[s.id]?.morningPickupStatus === 'absent'
                ).length;
                const verifiedAtSchoolCount = ridersActiveSession.filter(
                  (s) =>
                    records[s.id]?.morningPickupStatus === 'boarded' &&
                    records[s.id]?.morningSchoolStatus === 'dropped_at_school'
                ).length;

                // Afternoon-only metrics (always resolved using afternoon transfers!)
                const afternoonRidersOnBus = [
                  ...nativeStudents.filter(
                    (s) =>
                      !isTransferredOutAcceptedForSession(records[s.id], route.id, 'afternoon')
                  ),
                  ...students.filter(
                    (s) =>
                      s.routeId !== route.id &&
                      isTransferredInAcceptedForSession(records[s.id], route.id, 'afternoon')
                  ),
                ];

                const afternoonBoarded = afternoonRidersOnBus.filter(
                  (s) => records[s.id]?.afternoonBoardStatus === 'boarded'
                ).length;
                const afternoonAbsent = afternoonRidersOnBus.filter(
                  (s) => records[s.id]?.afternoonBoardStatus === 'absent'
                ).length;
                const afternoonDroppedCount = afternoonRidersOnBus.filter(
                  (s) => records[s.id]?.afternoonDropoffStatus === 'dropped_off'
                ).length;
                const afternoonExpectedRiders = afternoonRidersOnBus.filter(
                  (s) => records[s.id]?.afternoonBoardStatus !== 'absent'
                );
                const afternoonDropoffTarget =
                  afternoonBoarded > 0
                    ? Math.max(afternoonBoarded, afternoonDroppedCount)
                    : afternoonExpectedRiders.length;
                const isAfternoonDropoffConfirmed = Boolean(st?.afternoonDropoffConfirmed);

                const isLocked = isMorning ? st?.morningLocked : st?.afternoonLocked;
                const isSubmitted = isMorning
                  ? st?.morningReportSubmitted
                  : st?.afternoonReportSubmitted;
                const submittedAt = isMorning
                  ? st?.morningReportSubmittedAt
                  : st?.afternoonReportSubmittedAt;
                const dbSavedAt = isMorning ? st?.morningDbSavedAt : st?.afternoonDbSavedAt;
                const isSelected = activeRouteId === route.id;

                const primaryPresent = isMorning ? morningBoarded : afternoonBoarded;
                const primaryAbsent = isMorning ? morningAbsent : afternoonAbsent;

                return (
                  <tr
                    key={route.id}
                    onClick={onSelectRoute ? () => onSelectRoute(route.id) : undefined}
                    className={`transition-colors ${
                      onSelectRoute ? 'cursor-pointer' : ''
                    } ${
                      isSelected
                        ? 'bg-indigo-50/70'
                        : isLocked
                        ? 'bg-emerald-50/20 hover:bg-emerald-50/40'
                        : 'hover:bg-slate-50'
                    }`}
                  >
                    {/* 1. Tuyến xe / Lái xe */}
                    <td className="py-3 px-3 pl-4">
                      <div className="flex items-start gap-2.5">
                        <div
                          className="w-8 h-8 rounded-xl flex items-center justify-center text-white shrink-0 mt-0.5 shadow-xs"
                          style={{ backgroundColor: route.color || '#2563eb' }}
                        >
                          <Bus className="w-4 h-4" />
                        </div>
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="font-extrabold text-slate-900">{route.code}</span>
                            <span className="font-mono text-[11px] text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">
                              {route.plateNumber}
                            </span>
                            {(transferredInAccepted > 0 || transferredOutAccepted > 0) && (
                              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-purple-100 text-purple-800 rounded text-[10px] font-bold">
                                <ArrowRightLeft className="w-2.5 h-2.5" />
                                {transferredInAccepted > 0 ? `+${transferredInAccepted} nhờ` : ''}
                                {transferredOutAccepted > 0 ? ` -${transferredOutAccepted} đi` : ''}
                              </span>
                            )}
                          </div>
                          <p className="text-[11px] text-slate-600 font-medium truncate max-w-[230px]">
                            {route.name}
                          </p>
                          <p className="text-[10px] text-slate-400">
                            LX: <strong className="text-slate-600">{route.driverName}</strong>
                          </p>
                        </div>
                      </div>
                    </td>

                    {/* 2. Sĩ số */}
                    <td className="py-3 px-3 text-center">
                      <span className="inline-flex items-center justify-center min-w-[32px] px-2 py-1 rounded-lg bg-slate-100 font-black text-slate-900 text-sm">
                        {nativeStudents.length}
                      </span>
                    </td>

                    {/* 3. Đi sáng / Đi chiều */}
                    <td className="py-3 px-3 text-center">
                      <span className="inline-flex items-center justify-center min-w-[32px] px-2 py-1 rounded-lg bg-blue-50 text-blue-700 font-black text-sm border border-blue-200/70">
                        {primaryPresent}
                      </span>
                    </td>

                    {/* 4. Vắng sáng / Vắng chiều */}
                    <td className="py-3 px-3 text-center">
                      <span
                        className={`inline-flex items-center justify-center min-w-[32px] px-2 py-1 rounded-lg font-black text-sm ${
                          primaryAbsent > 0
                            ? 'bg-rose-50 text-rose-700 border border-rose-200/70'
                            : 'bg-slate-50 text-slate-400'
                        }`}
                      >
                        {primaryAbsent}
                      </span>
                    </td>

                    {/* 5. Vào trường (GS) / Đã trả điểm (Chiều) */}
                    <td className="py-3 px-3 text-center">
                      {isMorning ? (
                        <span
                          className={`px-2 py-1 rounded-lg font-black text-xs border ${
                            morningBoarded > 0 && verifiedAtSchoolCount === morningBoarded
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                              : verifiedAtSchoolCount > 0
                              ? 'bg-amber-50 text-amber-800 border-amber-200'
                              : 'bg-slate-50 text-slate-500 border-slate-200'
                          }`}
                        >
                          {verifiedAtSchoolCount}/{morningBoarded}
                        </span>
                      ) : (
                        <span
                          className={`px-2 py-1 rounded-lg font-black text-xs border ${
                            afternoonDropoffTarget > 0 &&
                            afternoonDroppedCount >= afternoonDropoffTarget
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                              : afternoonDroppedCount > 0
                              ? 'bg-indigo-50 text-indigo-800 border-indigo-200'
                              : 'bg-slate-50 text-slate-500 border-slate-200'
                          }`}
                        >
                          {afternoonDroppedCount}/{afternoonDropoffTarget}
                        </span>
                      )}
                    </td>

                    {/* 6. Trả học sinh (Chiều về) */}
                    <td className="py-3 px-3 text-center">
                      {isAfternoonDropoffConfirmed ? (
                        <div className="inline-flex flex-col items-center gap-0.5">
                          <span className="px-2.5 py-1 bg-emerald-100 text-emerald-800 border border-emerald-200 rounded-lg text-[11px] font-extrabold inline-flex items-center gap-1 whitespace-nowrap">
                            <Home className="w-3 h-3" />
                            Đã trả hết ({st?.afternoonDropoffConfirmedAt})
                          </span>
                          <span className="text-[10px] text-emerald-700 font-semibold">
                            {afternoonDroppedCount}/{afternoonDropoffTarget} em
                          </span>
                        </div>
                      ) : afternoonDroppedCount > 0 ? (
                        <span className="px-2.5 py-1 bg-indigo-50 text-indigo-800 border border-indigo-200 rounded-lg text-[11px] font-bold inline-flex items-center gap-1 whitespace-nowrap">
                          <Clock className="w-3 h-3" />
                          Đang trả ({afternoonDroppedCount}/{afternoonDropoffTarget})
                        </span>
                      ) : (
                        <span className="px-2.5 py-1 bg-slate-100 text-slate-500 rounded-lg text-[11px] font-medium whitespace-nowrap">
                          Chưa trả chiều
                        </span>
                      )}
                    </td>

                    {/* 7. Trạng thái Báo cáo & Lưu CSDL */}
                    <td className="py-3 px-3 pr-4 text-right">
                      <div className="flex flex-col items-end gap-1">
                        {isLocked ? (
                          <span className="px-2.5 py-1 bg-emerald-100 text-emerald-800 rounded-full text-[10px] font-extrabold inline-flex items-center gap-1 whitespace-nowrap">
                            <Database className="w-3 h-3" />
                            {dbSavedAt ? `Đã lưu CSDL (${dbSavedAt})` : 'Đã chốt sổ'}
                          </span>
                        ) : isSubmitted ? (
                          <span className="px-2.5 py-1 bg-blue-100 text-blue-800 rounded-full text-[10px] font-extrabold inline-flex items-center gap-1 whitespace-nowrap">
                            <CheckCircle2 className="w-3 h-3" />
                            LX đã gửi ({submittedAt})
                          </span>
                        ) : (
                          <span className="px-2.5 py-1 bg-amber-100 text-amber-800 rounded-full text-[10px] font-bold inline-flex items-center gap-1 whitespace-nowrap">
                            <Clock className="w-3 h-3" />
                            {isMorning ? 'Đang đón / Chưa gửi' : 'Đang trả / Chưa gửi'}
                          </span>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Session-Scoped Cross-bus Transfer Activity Strip */}
      {sessionTransfers.length > 0 && (
        <div className="bg-purple-50 border border-purple-200 rounded-2xl p-3.5 space-y-2">
          <div className="flex items-center gap-2">
            <ArrowRightLeft className="w-4 h-4 text-purple-700" />
            <h4 className="font-extrabold text-purple-950 text-xs uppercase tracking-wide">
              Theo dõi Học Sinh Đi Nhờ Sang Xe Khác - {isMorning ? 'Ca Sáng' : 'Ca Chiều'} (
              {sessionTransfers.length} trường hợp)
            </h4>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {sessionTransfers.map(({ student: s, transfer }) => {
              const fromRoute = routes.find((r) => r.id === transfer.fromRouteId);
              const toRoute = routes.find((r) => r.id === transfer.toRouteId);
              return (
                <div
                  key={s.id}
                  className="bg-white rounded-xl border border-purple-200 p-2.5 text-xs flex flex-col justify-between gap-1"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-bold text-slate-900">
                      {s.name} <span className="font-mono text-slate-500">({s.class})</span>
                    </span>
                    {transfer.status === 'accepted' ? (
                      <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 rounded font-bold text-[10px]">
                        Xe {toRoute?.code} đã nhận
                      </span>
                    ) : transfer.status === 'pending_accept' ? (
                      <span className="px-2 py-0.5 bg-amber-100 text-amber-800 rounded font-bold text-[10px]">
                        Chờ xe {toRoute?.code} nhận
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 bg-rose-100 text-rose-800 rounded font-bold text-[10px] inline-flex items-center gap-1">
                        <AlertTriangle className="w-3 h-3" />
                        Từ chối
                      </span>
                    )}
                  </div>
                  <div className="text-[11px] text-purple-800 font-semibold">
                    {fromRoute?.code || 'Xe cũ'} &rarr; {toRoute?.code || 'Xe mới'}
                    {transfer.acceptedAt ? ` • Xác nhận lúc ${transfer.acceptedAt}` : ''}
                  </div>
                  {transfer.note && (
                    <p className="text-[10px] text-slate-500 truncate">{transfer.note}</p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
