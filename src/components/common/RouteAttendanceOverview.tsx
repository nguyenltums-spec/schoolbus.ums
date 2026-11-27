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
import { sortRoutesByOrder } from '../../utils/routeSort';

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
  const sortedRoutes = sortRoutesByOrder(routes);

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
    <div className="space-y-2.5">
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="px-3.5 py-2 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <ClipboardCheck className="w-4 h-4 text-blue-600 shrink-0" />
            <h3 className="font-bold text-slate-900 text-xs sm:text-sm truncate">{title}</h3>
            <span className="text-[11px] font-semibold text-slate-500 whitespace-nowrap">
              · {isMorning ? 'Ca sáng (Đón)' : 'Ca chiều (Trả)'}
            </span>
          </div>
          {onSelectRoute && (
            <span className="text-[11px] text-slate-500 whitespace-nowrap">
              Bấm vào dòng tuyến xe để kiểm tra &amp; chốt CSDL
            </span>
          )}
        </div>

        {/* High-density 1-row-per-bus table with pinned sticky header */}
        <div className="overflow-auto max-h-[300px]">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-100 text-slate-600 font-semibold text-[11px]">
                <th className="sticky top-0 z-10 bg-slate-100 shadow-[inset_0_-1px_0_0_#cbd5e1] py-2 pl-3.5 pr-2 whitespace-nowrap">Tuyến xe</th>
                <th className="sticky top-0 z-10 bg-slate-100 shadow-[inset_0_-1px_0_0_#cbd5e1] py-2 px-2 whitespace-nowrap hidden md:table-cell">Biển số</th>
                <th className="sticky top-0 z-10 bg-slate-100 shadow-[inset_0_-1px_0_0_#cbd5e1] py-2 px-2 whitespace-nowrap hidden lg:table-cell">Lái xe</th>
                <th className="sticky top-0 z-10 bg-slate-100 shadow-[inset_0_-1px_0_0_#cbd5e1] py-2 px-2 text-center whitespace-nowrap">Sĩ số</th>
                <th className="sticky top-0 z-10 bg-slate-100 shadow-[inset_0_-1px_0_0_#cbd5e1] py-2 px-2 text-center whitespace-nowrap">
                  {isMorning ? 'Đi sáng' : 'Đi chiều'}
                </th>
                <th className="sticky top-0 z-10 bg-slate-100 shadow-[inset_0_-1px_0_0_#cbd5e1] py-2 px-2 text-center whitespace-nowrap">Vắng</th>
                <th className="sticky top-0 z-10 bg-slate-100 shadow-[inset_0_-1px_0_0_#cbd5e1] py-2 px-2 text-center whitespace-nowrap">
                  {isMorning ? 'Vào trường' : 'Đã trả'}
                </th>
                <th className="sticky top-0 z-10 bg-slate-100 shadow-[inset_0_-1px_0_0_#cbd5e1] py-2 px-2 text-center whitespace-nowrap hidden sm:table-cell">
                  Trả chiều
                </th>
                <th className="sticky top-0 z-10 bg-slate-100 shadow-[inset_0_-1px_0_0_#cbd5e1] py-2 pl-2 pr-3.5 text-right whitespace-nowrap">Trạng thái CSDL</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 tabular-nums">
              {sortedRoutes.map((route) => {
                const st = sessionStates[route.id];
                const nativeStudents = students.filter((s) => s.routeId === route.id);

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
                    className={`transition-colors ${onSelectRoute ? 'cursor-pointer' : ''} ${
                      isSelected
                        ? 'bg-indigo-50/80'
                        : isLocked
                        ? 'bg-emerald-50/20 hover:bg-emerald-50/40'
                        : 'hover:bg-slate-50'
                    }`}
                  >
                    {/* 1. Tuyến xe (1 line) */}
                    <td className="py-1.5 pl-3.5 pr-2 whitespace-nowrap">
                      <div className="flex items-center gap-2 min-w-0">
                        <span
                          className="w-2.5 h-2.5 rounded-sm shrink-0"
                          style={{ backgroundColor: route.color || '#2563eb' }}
                        />
                        <span className="font-bold text-slate-900 shrink-0">{route.code}</span>
                        <span
                          className="text-slate-600 truncate max-w-[140px] xl:max-w-[220px]"
                          title={`${route.name} · ${route.plateNumber} · LX: ${route.driverName}`}
                        >
                          {route.name}
                        </span>
                        {(transferredInAccepted > 0 || transferredOutAccepted > 0) && (
                          <span className="inline-flex items-center gap-0.5 text-[10px] font-bold text-purple-700 shrink-0">
                            <ArrowRightLeft className="w-3 h-3" />
                            {transferredInAccepted > 0 ? `+${transferredInAccepted}` : ''}
                            {transferredOutAccepted > 0 ? `-${transferredOutAccepted}` : ''}
                          </span>
                        )}
                      </div>
                    </td>

                    {/* 2. Biển số */}
                    <td className="py-1.5 px-2 font-mono text-[11px] text-slate-500 whitespace-nowrap hidden md:table-cell">
                      {route.plateNumber}
                    </td>

                    {/* 3. Lái xe */}
                    <td className="py-1.5 px-2 text-slate-700 whitespace-nowrap hidden lg:table-cell max-w-[150px] truncate">
                      {route.driverName}
                    </td>

                    {/* 4. Sĩ số */}
                    <td className="py-1.5 px-2 text-center font-bold text-slate-900 whitespace-nowrap">
                      {nativeStudents.length}
                    </td>

                    {/* 5. Đi sáng / Đi chiều */}
                    <td className="py-1.5 px-2 text-center font-bold text-blue-700 whitespace-nowrap">
                      {primaryPresent}
                    </td>

                    {/* 6. Vắng */}
                    <td
                      className={`py-1.5 px-2 text-center font-bold whitespace-nowrap ${
                        primaryAbsent > 0 ? 'text-rose-600' : 'text-slate-400'
                      }`}
                    >
                      {primaryAbsent}
                    </td>

                    {/* 7. Vào trường (GS) / Đã trả (Chiều) */}
                    <td className="py-1.5 px-2 text-center whitespace-nowrap">
                      {isMorning ? (
                        <span
                          className={`font-bold ${
                            morningBoarded > 0 && verifiedAtSchoolCount === morningBoarded
                              ? 'text-emerald-700'
                              : verifiedAtSchoolCount > 0
                              ? 'text-amber-700'
                              : 'text-slate-500'
                          }`}
                        >
                          {verifiedAtSchoolCount}/{morningBoarded}
                        </span>
                      ) : (
                        <span
                          className={`font-bold ${
                            afternoonDropoffTarget > 0 &&
                            afternoonDroppedCount >= afternoonDropoffTarget
                              ? 'text-emerald-700'
                              : afternoonDroppedCount > 0
                              ? 'text-indigo-700'
                              : 'text-slate-500'
                          }`}
                        >
                          {afternoonDroppedCount}/{afternoonDropoffTarget}
                        </span>
                      )}
                    </td>

                    {/* 8. Trả chiều */}
                    <td className="py-1.5 px-2 text-center whitespace-nowrap hidden sm:table-cell text-[11px]">
                      {isAfternoonDropoffConfirmed ? (
                        <span className="inline-flex items-center gap-1 font-semibold text-emerald-700">
                          <Home className="w-3 h-3" />
                          Xong ({st?.afternoonDropoffConfirmedAt})
                        </span>
                      ) : afternoonDroppedCount > 0 ? (
                        <span className="inline-flex items-center gap-1 font-semibold text-indigo-700">
                          <Clock className="w-3 h-3" />
                          {afternoonDroppedCount}/{afternoonDropoffTarget}
                        </span>
                      ) : (
                        <span className="text-slate-400">Chưa trả</span>
                      )}
                    </td>

                    {/* 9. Báo cáo & Lưu CSDL */}
                    <td className="py-1.5 pl-2 pr-3.5 text-right whitespace-nowrap text-[11px]">
                      {isLocked ? (
                        <span className="inline-flex items-center gap-1 font-bold text-emerald-700">
                          <Database className="w-3 h-3" />
                          {dbSavedAt ? `Đã lưu (${dbSavedAt})` : 'Đã chốt sổ'}
                        </span>
                      ) : isSubmitted ? (
                        <span className="inline-flex items-center gap-1 font-bold text-blue-700">
                          <CheckCircle2 className="w-3 h-3" />
                          LX gửi ({submittedAt})
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 font-medium text-amber-700">
                          <Clock className="w-3 h-3" />
                          {isMorning ? 'Chờ báo cáo' : 'Đang trả'}
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Compact Cross-bus Transfer Activity Line */}
      {sessionTransfers.length > 0 && (
        <div className="bg-purple-50/70 border border-purple-200 rounded-xl px-3.5 py-2 space-y-1.5">
          <div className="flex items-center gap-2 text-xs font-bold text-purple-950">
            <ArrowRightLeft className="w-3.5 h-3.5 text-purple-700 shrink-0" />
            <span>
              Đi nhờ xe khác ({isMorning ? 'Ca sáng' : 'Ca chiều'} · {sessionTransfers.length})
            </span>
          </div>

          <div className="divide-y divide-purple-200/60 bg-white rounded-lg border border-purple-200/80">
            {sessionTransfers.map(({ student: s, transfer }) => {
              const fromRoute = routes.find((r) => r.id === transfer.fromRouteId);
              const toRoute = routes.find((r) => r.id === transfer.toRouteId);
              return (
                <div
                  key={s.id}
                  className="px-3 py-1.5 text-xs flex flex-wrap items-center justify-between gap-2"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="font-bold text-slate-900 truncate">{s.name}</span>
                    <span className="font-mono text-[11px] text-slate-500">({s.class})</span>
                    <span className="text-purple-800 font-semibold whitespace-nowrap">
                      {fromRoute?.code || 'Xe cũ'} &rarr; {toRoute?.code || 'Xe mới'}
                    </span>
                    {transfer.note && (
                      <span className="text-[11px] text-slate-500 truncate max-w-[200px] hidden md:inline">
                        · {transfer.note}
                      </span>
                    )}
                  </div>
                  <span
                    className={`text-[11px] font-bold whitespace-nowrap ${
                      transfer.status === 'accepted'
                        ? 'text-emerald-700'
                        : transfer.status === 'pending_accept'
                        ? 'text-amber-700'
                        : 'text-rose-700 inline-flex items-center gap-1'
                    }`}
                  >
                    {transfer.status === 'accepted' ? (
                      `Xe ${toRoute?.code} đã nhận${transfer.acceptedAt ? ` (${transfer.acceptedAt})` : ''}`
                    ) : transfer.status === 'pending_accept' ? (
                      `Chờ xe ${toRoute?.code} nhận`
                    ) : (
                      <>
                        <AlertTriangle className="w-3 h-3" />
                        Từ chối
                      </>
                    )}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
