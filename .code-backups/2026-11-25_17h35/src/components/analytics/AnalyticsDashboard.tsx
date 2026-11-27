import React, { useState, useMemo } from 'react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';
import {
  TrendingUp,
  Calendar,
  Users,
  Bus,
  Download,
  PieChart as PieIcon,
  BarChart3,
  Award,
  Info,
  ChevronLeft,
  ChevronRight,
  Database,
  Search,
  ArrowLeftRight,
} from 'lucide-react';
import {
  Route,
  Student,
  CheckinRecord,
  DatabaseSaveLog,
  RouteSessionState,
} from '../../types';
import {
  AnalyticsPeriodMode,
  PeriodDailyRow,
  PeriodRouteStat,
  computePeriodAnalytics,
  formatDisplayDateVi,
  getPeriodDateRange,
  shiftDateStr,
  shiftMonthStr,
} from '../../services/analyticsService';
import { getTodayDateString } from '../../services/defaultData';
import { playSound } from '../../services/notificationAudio';

interface Props {
  routes: Route[];
  students: Student[];
  records: Record<string, CheckinRecord>;
  sessionStates?: Record<string, RouteSessionState>;
  dbLogs?: DatabaseSaveLog[];
  todayDate?: string;
  onExportCsv?: () => void;
}

type DetailTab = 'routes' | 'daily' | 'students';
type StudentStatusFilter = 'all' | 'present' | 'absent' | 'transfer' | 'pending';

const escapeCsv = (val: string | number | null | undefined): string => {
  const s = val === null || val === undefined ? '' : String(val);
  return `"${s.replace(/"/g, '""')}"`;
};

export const AnalyticsDashboard: React.FC<Props> = ({
  routes,
  students,
  records,
  sessionStates = {},
  dbLogs = [],
  todayDate: todayProp,
  onExportCsv,
}) => {
  const todayDate = todayProp || getTodayDateString();
  const currentMonth = todayDate.slice(0, 7);

  const [periodMode, setPeriodMode] = useState<AnalyticsPeriodMode>('week');
  const [selectedDate, setSelectedDate] = useState<string>(todayDate);
  const [selectedMonth, setSelectedMonth] = useState<string>(currentMonth);
  const [routeFilterId, setRouteFilterId] = useState<string>('all');
  const [chartMode, setChartMode] = useState<'percentage' | 'count'>('percentage');
  const [detailTab, setDetailTab] = useState<DetailTab>('daily');
  const [onlyDaysWithData, setOnlyDaysWithData] = useState<boolean>(false);
  const [absenceChartType, setAbsenceChartType] = useState<'reason' | 'route'>('reason');
  const [studentSearch, setStudentSearch] = useState<string>('');
  const [studentStatusFilter, setStudentStatusFilter] = useState<StudentStatusFilter>('all');

  const range = useMemo(
    () => getPeriodDateRange(periodMode, selectedDate, selectedMonth),
    [periodMode, selectedDate, selectedMonth]
  );

  const analytics = useMemo(
    () =>
      computePeriodAnalytics({
        routes,
        students,
        records,
        sessionStates,
        dbLogs,
        todayDate,
        range,
        routeFilterId,
      }),
    [routes, students, records, sessionStates, dbLogs, todayDate, range, routeFilterId]
  );

  const { dailyRows, routeStats, summary, absenceReasonsToday, absenceByRoute } = analytics;

  const isViewingExactToday = periodMode === 'day' && selectedDate === todayDate;
  const visibleRoutes = useMemo(
    () => (routeFilterId === 'all' ? routes : routes.filter((r) => r.id === routeFilterId)),
    [routes, routeFilterId]
  );

  const tableDailyRows = useMemo(() => {
    if (onlyDaysWithData) {
      return dailyRows.filter((d) => d.hasData);
    }
    return dailyRows;
  }, [dailyRows, onlyDaysWithData]);

  // Switch sensible default detail tab when changing mode
  const handleChangePeriodMode = (nextMode: AnalyticsPeriodMode) => {
    setPeriodMode(nextMode);
    if (nextMode === 'day') {
      setDetailTab('routes');
      setOnlyDaysWithData(false);
    } else if (nextMode === 'month') {
      setDetailTab('daily');
      setOnlyDaysWithData(true);
    } else {
      setDetailTab('daily');
      setOnlyDaysWithData(false);
    }
  };

  const handleStepPeriod = (delta: number) => {
    if (periodMode === 'day') {
      setSelectedDate((prev) => shiftDateStr(prev, delta));
    } else if (periodMode === 'week') {
      setSelectedDate((prev) => shiftDateStr(prev, delta * 7));
    } else {
      setSelectedMonth((prev) => shiftMonthStr(prev, delta));
    }
  };

  const handleResetToCurrentPeriod = () => {
    if (periodMode === 'month') {
      setSelectedMonth(currentMonth);
    } else {
      setSelectedDate(todayDate);
    }
  };

  // Student live rows (available for Today inspection & student report drill-down)
  const filteredStudentRows = useMemo(() => {
    const q = studentSearch.trim().toLowerCase();
    return students
      .filter((s) => (routeFilterId === 'all' ? true : s.routeId === routeFilterId))
      .map((s) => {
        const rec = records[s.id];
        const route = routes.find((r) => r.id === s.routeId);
        const stop = route?.stops.find((st) => st.id === s.stopId);
        const isMorningPresent =
          rec?.morningPickupStatus === 'boarded' ||
          rec?.morningSchoolStatus === 'dropped_at_school';
        const isAbsent =
          rec?.morningPickupStatus === 'absent' || rec?.afternoonBoardStatus === 'absent';
        const hasTransfer = Boolean(
          rec?.morningTransfer || rec?.afternoonTransfer || rec?.transferToRouteId
        );
        return {
          student: s,
          rec,
          route,
          stop,
          isMorningPresent,
          isAbsent,
          hasTransfer,
        };
      })
      .filter(({ student, rec, route, isMorningPresent, isAbsent, hasTransfer }) => {
        if (studentStatusFilter === 'present' && !isMorningPresent) return false;
        if (studentStatusFilter === 'absent' && !isAbsent) return false;
        if (studentStatusFilter === 'transfer' && !hasTransfer) return false;
        if (
          studentStatusFilter === 'pending' &&
          (isMorningPresent || isAbsent || rec?.morningPickupStatus === 'late')
        ) {
          return false;
        }
        if (!q) return true;
        return (
          student.name.toLowerCase().includes(q) ||
          student.code.toLowerCase().includes(q) ||
          student.class.toLowerCase().includes(q) ||
          (route?.code || '').toLowerCase().includes(q) ||
          (route?.name || '').toLowerCase().includes(q)
        );
      });
  }, [students, records, routes, routeFilterId, studentSearch, studentStatusFilter]);

  const handleDownloadReport = () => {
    playSound('beep');

    const lines: string[] = [];
    const routeScopeLabel =
      routeFilterId === 'all'
        ? `Tất cả (${routes.length} tuyến)`
        : visibleRoutes[0]
        ? `${visibleRoutes[0].code} - ${visibleRoutes[0].name}`
        : routeFilterId;

    lines.push(
      [
        escapeCsv('BÁO CÁO ĐIỂM DANH XE TUYẾN'),
        escapeCsv(`Kỳ: ${range.label}`),
        escapeCsv(`Phạm vi: ${routeScopeLabel}`),
      ].join(',')
    );
    lines.push('');

    // Section 1: Route summary
    lines.push(escapeCsv('1. TỔNG HỢP THEO TUYẾN XE'));
    lines.push(
      [
        'Mã tuyến',
        'Tên tuyến',
        'Tài xế',
        'Sĩ số hiện tại',
        'Số ngày ghi nhận',
        'Phiên CSDL (Sáng/Chiều)',
        'Tổng lượt đi (Sáng)',
        'Tổng lượt vắng',
        'Chiều lên xe',
        'Chiều đã trả',
        'Đi nhờ đến',
        'Đi nhờ đi',
        'Tỷ lệ chuyên cần (%)',
      ]
        .map(escapeCsv)
        .join(',')
    );

    routeStats.forEach((r) => {
      lines.push(
        [
          r.code,
          r.name,
          r.driverName,
          r.assignedStudents,
          r.activeDays,
          `${r.morningLoggedSessions}/${r.afternoonLoggedSessions}`,
          r.totalPresent,
          r.totalAbsent,
          r.totalAfternoonBoarded,
          r.totalAfternoonDroppedOff,
          r.totalTransferredIn,
          r.totalTransferredOut,
          `${r.attendanceRate}%`,
        ]
          .map(escapeCsv)
          .join(',')
      );
    });

    lines.push('');

    // Section 2: Daily summary
    lines.push(escapeCsv('2. CHI TIẾT THEO TỪNG NGÀY'));
    const dailyHeaders = [
      'Ngày',
      'Thứ',
      'Trạng thái dữ liệu',
      'Số tuyến ghi nhận',
      'Tổng sĩ số',
      'Sáng đi xe',
      'Sáng vắng',
      'Chiều lên xe',
      'Chiều đã trả',
      'Tỷ lệ chuyên cần (%)',
      ...visibleRoutes.map((r) => `${r.code} (%)`),
    ];
    lines.push(dailyHeaders.map(escapeCsv).join(','));

    dailyRows.forEach((d) => {
      lines.push(
        [
          formatDisplayDateVi(d.date),
          d.dayOfWeek,
          d.hasData ? (d.isToday ? 'Trực tiếp hôm nay' : 'Đã lưu CSDL') : 'Chưa có dữ liệu',
          d.activeRoutesCount,
          d.total,
          d.present ?? 0,
          d.absent,
          d.afternoonBoarded,
          d.afternoonDroppedOff,
          d.attendanceRate !== null ? `${d.attendanceRate}%` : '-',
          ...visibleRoutes.map((r) => {
            const rate = d.routeRates[r.id];
            return rate !== null && rate !== undefined ? `${rate}%` : '-';
          }),
        ]
          .map(escapeCsv)
          .join(',')
      );
    });

    // Section 3: Per-student details if viewing Today (or delegate if user specifically wants student list on today)
    if (isViewingExactToday && filteredStudentRows.length > 0) {
      lines.push('');
      lines.push(escapeCsv(`3. CHI TIẾT ĐIỂM DANH HỌC SINH HÔM NAY (${formatDisplayDateVi(todayDate)})`));
      lines.push(
        [
          'Mã HS',
          'Họ và tên',
          'Lớp',
          'Tuyến xe',
          'Đón sáng',
          'Vào trường sáng',
          'Lên xe chiều',
          'Trả chiều',
          'Ghi chú / Lý do',
        ]
          .map(escapeCsv)
          .join(',')
      );

      filteredStudentRows.forEach(({ student, rec, route }) => {
        lines.push(
          [
            student.code,
            student.name,
            student.class,
            route ? `${route.code} - ${route.name}` : student.routeId,
            rec?.morningPickupStatus || 'pending',
            rec?.morningSchoolStatus || 'pending',
            rec?.afternoonBoardStatus || 'pending',
            rec?.afternoonDropoffStatus || 'pending',
            rec?.parentExcusedReason || rec?.morningPickupNote || rec?.afternoonNote || '',
          ]
            .map(escapeCsv)
            .join(',')
        );
      });
    }

    const blob = new Blob(['\uFEFF' + lines.join('\n')], {
      type: 'text/csv;charset=utf-8;',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const suffix =
      periodMode === 'day'
        ? selectedDate
        : periodMode === 'week'
        ? `Tuan_${range.startDate}_${range.endDate}`
        : `Thang_${selectedMonth}`;
    a.download = `BaoCao_DiemDanh_${suffix}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Decide which absence dataset to show
  const canShowReasonPie = isViewingExactToday || (range.dates.includes(todayDate) && absenceReasonsToday.length > 0);
  const activeAbsenceData =
    canShowReasonPie && absenceChartType === 'reason' && absenceReasonsToday.length > 0
      ? absenceReasonsToday
      : absenceByRoute;

  const isCurrentPeriodSelected =
    (periodMode === 'day' && selectedDate === todayDate) ||
    (periodMode === 'week' && range.dates.includes(todayDate)) ||
    (periodMode === 'month' && selectedMonth === currentMonth);

  const periodModeNoun =
    periodMode === 'day' ? 'trong ngày' : periodMode === 'week' ? 'trong tuần' : 'trong tháng';

  const translateStatusBadge = (status?: string) => {
    switch (status) {
      case 'boarded':
        return { text: 'Đã lên xe', cls: 'bg-emerald-100 text-emerald-800' };
      case 'dropped_at_school':
        return { text: 'Đã vào trường', cls: 'bg-blue-100 text-blue-800' };
      case 'dropped_off':
        return { text: 'Đã trả về', cls: 'bg-emerald-100 text-emerald-800' };
      case 'absent':
        return { text: 'Vắng', cls: 'bg-rose-100 text-rose-700' };
      case 'late':
        return { text: 'Đến muộn', cls: 'bg-amber-100 text-amber-800' };
      case 'missing':
        return { text: 'Cần kiểm tra', cls: 'bg-rose-100 text-rose-800' };
      default:
        return { text: 'Chưa điểm danh', cls: 'bg-slate-100 text-slate-600' };
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Top Header & Time Period Filter Bar */}
      <div className="bg-white rounded-2xl p-5 shadow-xs border border-slate-200 space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <span className="p-2.5 bg-indigo-100 text-indigo-700 rounded-xl shrink-0">
              <TrendingUp className="w-5 h-5" />
            </span>
            <div>
              <h2 className="text-lg font-extrabold text-slate-900 tracking-tight">
                Dashboard Phân Tích & Báo Cáo Điểm Danh
              </h2>
              <p className="text-xs text-slate-500">
                Xem báo cáo điểm danh chi tiết theo Ngày, Tuần hoặc Tháng trên toàn bộ {routes.length} tuyến xe
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Metric toggle */}
            <div className="inline-flex p-1 bg-slate-100 rounded-xl border border-slate-200 text-xs font-semibold">
              <button
                onClick={() => setChartMode('percentage')}
                className={`px-3 py-1.5 rounded-lg transition-all ${
                  chartMode === 'percentage'
                    ? 'bg-slate-900 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Tỷ lệ %
              </button>
              <button
                onClick={() => setChartMode('count')}
                className={`px-3 py-1.5 rounded-lg transition-all ${
                  chartMode === 'count'
                    ? 'bg-slate-900 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Số lượng HS
              </button>
            </div>

            {onExportCsv && isViewingExactToday && (
              <button
                onClick={() => {
                  playSound('beep');
                  onExportCsv();
                }}
                className="px-3 py-2 bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors"
                title="Xuất nhanh bảng điểm danh học sinh hôm nay"
              >
                <Download className="w-3.5 h-3.5 text-slate-500" />
                <span>CSV Học sinh</span>
              </button>
            )}

            <button
              onClick={handleDownloadReport}
              className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-sm transition-colors"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Xuất Báo Cáo Kỳ Này</span>
            </button>
          </div>
        </div>

        {/* Period Filter Controls Bar */}
        <div className="pt-3 border-t border-slate-100 flex flex-col xl:flex-row xl:items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2.5">
            {/* Mode Switcher: Day / Week / Month */}
            <div className="inline-flex p-1 bg-slate-100 rounded-xl border border-slate-200 text-xs font-bold">
              <button
                onClick={() => handleChangePeriodMode('day')}
                className={`px-3.5 py-1.5 rounded-lg transition-all ${
                  periodMode === 'day'
                    ? 'bg-indigo-600 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Theo Ngày
              </button>
              <button
                onClick={() => handleChangePeriodMode('week')}
                className={`px-3.5 py-1.5 rounded-lg transition-all ${
                  periodMode === 'week'
                    ? 'bg-indigo-600 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Theo Tuần
              </button>
              <button
                onClick={() => handleChangePeriodMode('month')}
                className={`px-3.5 py-1.5 rounded-lg transition-all ${
                  periodMode === 'month'
                    ? 'bg-indigo-600 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Theo Tháng
              </button>
            </div>

            {/* Contextual Date / Week / Month Selector */}
            <div className="inline-flex items-center gap-1 bg-slate-50 border border-slate-200 rounded-xl p-1">
              <button
                onClick={() => handleStepPeriod(-1)}
                className="p-1.5 hover:bg-white rounded-lg text-slate-600 hover:text-slate-900 transition-colors"
                title={
                  periodMode === 'day'
                    ? 'Ngày trước'
                    : periodMode === 'week'
                    ? 'Tuần trước'
                    : 'Tháng trước'
                }
              >
                <ChevronLeft className="w-4 h-4" />
              </button>

              {periodMode === 'month' ? (
                <input
                  type="month"
                  value={selectedMonth}
                  onChange={(e) => {
                    if (e.target.value) setSelectedMonth(e.target.value);
                  }}
                  className="bg-white border border-slate-200 rounded-lg px-2.5 py-1 text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              ) : (
                <input
                  type="date"
                  value={selectedDate}
                  onChange={(e) => {
                    if (e.target.value) setSelectedDate(e.target.value);
                  }}
                  className="bg-white border border-slate-200 rounded-lg px-2.5 py-1 text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              )}

              <button
                onClick={() => handleStepPeriod(1)}
                className="p-1.5 hover:bg-white rounded-lg text-slate-600 hover:text-slate-900 transition-colors"
                title={
                  periodMode === 'day'
                    ? 'Ngày sau'
                    : periodMode === 'week'
                    ? 'Tuần sau'
                    : 'Tháng sau'
                }
              >
                <ChevronRight className="w-4 h-4" />
              </button>

              {!isCurrentPeriodSelected && (
                <button
                  onClick={handleResetToCurrentPeriod}
                  className="ml-1 px-2.5 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-lg text-[11px] font-bold transition-colors"
                >
                  {periodMode === 'day'
                    ? 'Hôm nay'
                    : periodMode === 'week'
                    ? 'Tuần này'
                    : 'Tháng này'}
                </button>
              )}
            </div>

            {/* Route Selector */}
            <div className="inline-flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1.5">
              <Bus className="w-3.5 h-3.5 text-slate-500 shrink-0" />
              <select
                value={routeFilterId}
                onChange={(e) => setRouteFilterId(e.target.value)}
                className="bg-transparent text-xs font-bold text-slate-800 focus:outline-none pr-1"
              >
                <option value="all">Tất cả {routes.length} tuyến xe</option>
                {routes.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.code} - {r.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Active Period Summary Label */}
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-indigo-50 text-indigo-800 font-bold border border-indigo-100">
              <Calendar className="w-3.5 h-3.5" />
              {range.label}
            </span>
            <span className="text-slate-500">
              • Ghi nhận dữ liệu:{' '}
              <strong className="text-slate-800">
                {summary.activeDaysCount}/{summary.totalCalendarDays} ngày
              </strong>
            </span>
          </div>
        </div>
      </div>

      {/* Empty Historical Notice (if non-today period has zero data) */}
      {summary.activeDaysCount === 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-start gap-3 text-xs text-amber-900">
          <Info className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
          <div>
            <p className="font-bold">
              Chưa có dữ liệu điểm danh được chốt sổ CSDL trong {range.label.toLowerCase()}.
            </p>
            <p className="text-amber-700 mt-0.5">
              Dữ liệu lịch sử theo ngày/tuần/tháng được tự động lưu lại mỗi khi Giám sát hoặc Quản trị bấm{' '}
              <strong>&quot;Xác nhận khớp số liệu &amp; Lưu CSDL&quot;</strong> cho từng tuyến xe.
            </p>
          </div>
        </div>
      )}

      {/* KPI Cards Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Attendance Rate */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs relative overflow-hidden">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold uppercase text-slate-500 tracking-wider">
              Tỷ lệ chuyên cần {periodModeNoun}
            </span>
            <span className="p-1.5 bg-emerald-100 text-emerald-700 rounded-lg">
              <TrendingUp className="w-4 h-4" />
            </span>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-black text-slate-900">{summary.avgAttendanceRate}%</span>
            <span className="text-xs font-semibold text-emerald-700">
              {summary.totalPresentRides}/{summary.totalExpectedRides} lượt
            </span>
          </div>
          <p className="text-[11px] text-slate-500 mt-1">
            Tính trên {visibleRoutes.length} tuyến trong {range.label.toLowerCase()}
          </p>
          <div className="absolute bottom-0 inset-x-0 h-1 bg-gradient-to-r from-emerald-500 to-teal-500" />
        </div>

        {/* Card 2: DB Save / Dropoff Completion */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs relative overflow-hidden">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold uppercase text-slate-500 tracking-wider">
              Tiến độ chốt sổ CSDL
            </span>
            <span className="p-1.5 bg-blue-100 text-blue-700 rounded-lg">
              <Database className="w-4 h-4" />
            </span>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-black text-slate-900">
              {summary.loggedSessionsCount}
              <span className="text-lg font-bold text-slate-400">
                /{summary.expectedSessionsCount || 0}
              </span>
            </span>
            <span className="text-xs font-bold text-blue-600">phiên sáng/chiều</span>
          </div>
          <p className="text-[11px] text-slate-500 mt-1">
            Chiều: {summary.totalAfternoonBoarded} lên xe • {summary.totalAfternoonDroppedOff} đã trả
          </p>
          <div className="absolute bottom-0 inset-x-0 h-1 bg-gradient-to-r from-blue-500 to-indigo-500" />
        </div>

        {/* Card 3: Best Performing Route */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs relative overflow-hidden">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold uppercase text-slate-500 tracking-wider">
              Tuyến chuyên cần nhất
            </span>
            <span className="p-1.5 bg-amber-100 text-amber-700 rounded-lg">
              <Award className="w-4 h-4" />
            </span>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-black text-slate-900">
              {summary.bestRoute?.code || '---'}
            </span>
            <span className="text-xs font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded">
              {summary.bestRoute ? `${summary.bestRoute.attendanceRate}%` : '0%'}
            </span>
          </div>
          <p className="text-[11px] text-slate-500 mt-1 truncate">
            {summary.bestRoute
              ? `${summary.bestRoute.name} (${summary.bestRoute.totalPresent}/${summary.bestRoute.totalExpectedRides} lượt)`
              : 'Chưa có dữ liệu tuyến'}
          </p>
          <div className="absolute bottom-0 inset-x-0 h-1 bg-gradient-to-r from-amber-400 to-orange-500" />
        </div>

        {/* Card 4: Total Absences */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs relative overflow-hidden">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold uppercase text-slate-500 tracking-wider">
              Tổng lượt vắng {periodModeNoun}
            </span>
            <span className="p-1.5 bg-rose-100 text-rose-700 rounded-lg">
              <Users className="w-4 h-4" />
            </span>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-black text-slate-900">{summary.totalAbsences}</span>
            <span className="text-xs font-bold text-slate-500">lượt vắng mặt</span>
          </div>
          <p className="text-[11px] text-slate-500 mt-1">
            Trên {summary.activeDaysCount} ngày có dữ liệu điểm danh
          </p>
          <div className="absolute bottom-0 inset-x-0 h-1 bg-gradient-to-r from-rose-400 to-pink-500" />
        </div>
      </div>

      {/* Main Chart Section */}
      <div className="bg-white rounded-2xl p-5 shadow-xs border border-slate-200">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
          <div>
            <h3 className="font-extrabold text-base text-slate-900 flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-indigo-600" />
              <span>
                {periodMode === 'day'
                  ? `Biểu Đồ Điểm Danh Từng Tuyến Xe (${range.label})`
                  : `Biểu Đồ Xu Hướng Điểm Danh Theo Ngày (${range.label})`}
              </span>
            </h3>
            <p className="text-xs text-slate-500">
              {periodMode === 'day'
                ? isViewingExactToday
                  ? 'So sánh trực tiếp số học sinh đi xe, vắng mặt và trả chiều của các tuyến hôm nay'
                  : 'Số liệu được tổng hợp từ dữ liệu chốt sổ CSDL của ngày đã chọn'
                : 'Theo dõi biến động tỷ lệ đi xe giữa các ngày trong khoảng thời gian đã chọn'}
            </p>
          </div>

          <div className="flex items-center gap-3 text-xs">
            <span className="flex items-center gap-1.5 text-slate-600 font-medium">
              <span className="w-3 h-3 rounded-full bg-indigo-600 inline-block" />
              {chartMode === 'percentage' ? 'Tỷ lệ đi xe (%)' : 'HS đi xe (sáng)'}
            </span>
            {chartMode === 'count' && (
              <span className="flex items-center gap-1.5 text-slate-600 font-medium">
                <span className="w-3 h-3 rounded-full bg-rose-400 inline-block" />
                HS vắng
              </span>
            )}
          </div>
        </div>

        <div className="h-72 w-full pt-2">
          {summary.activeDaysCount === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-slate-400 text-xs gap-2 border border-dashed border-slate-200 rounded-xl">
              <Calendar className="w-7 h-7 text-slate-300" />
              <p>Không có dữ liệu biểu đồ trong {range.label.toLowerCase()}</p>
            </div>
          ) : periodMode === 'day' ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={routeStats} margin={{ top: 10, right: 10, left: -15, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                <XAxis
                  dataKey="code"
                  stroke="#64748b"
                  fontSize={11}
                  tickLine={false}
                  axisLine={{ stroke: '#e2e8f0' }}
                />
                <YAxis
                  stroke="#64748b"
                  fontSize={11}
                  tickLine={false}
                  axisLine={false}
                  domain={chartMode === 'percentage' ? [0, 100] : [0, 'auto']}
                  unit={chartMode === 'percentage' ? '%' : ''}
                />
                <Tooltip
                  content={({ active, payload }) => {
                    if (active && payload && payload.length) {
                      const item = payload[0].payload as PeriodRouteStat;
                      return (
                        <div className="bg-slate-900 text-white p-3 rounded-xl shadow-xl border border-slate-700 text-xs space-y-1">
                          <p className="font-bold text-indigo-300">
                            {item.code}: {item.name}
                          </p>
                          <p className="text-emerald-300">
                            • Tỷ lệ đi xe: <strong>{item.attendanceRate}%</strong> ({item.totalPresent}/{item.totalExpectedRides} HS)
                          </p>
                          <p className="text-rose-300">
                            • Vắng mặt: <strong>{item.totalAbsent} em</strong>
                          </p>
                          <p className="text-blue-300">
                            • Chiều lên xe / đã trả: <strong>{item.totalAfternoonBoarded} / {item.totalAfternoonDroppedOff} em</strong>
                          </p>
                        </div>
                      );
                    }
                    return null;
                  }}
                />
                {chartMode === 'percentage' ? (
                  <Bar
                    dataKey="attendanceRate"
                    name="Tỷ lệ chuyên cần (%)"
                    fill="#4f46e5"
                    radius={[6, 6, 0, 0]}
                    barSize={32}
                  />
                ) : (
                  <>
                    <Bar
                      dataKey="totalPresent"
                      name="HS đi xe (sáng)"
                      fill="#4f46e5"
                      radius={[6, 6, 0, 0]}
                      barSize={22}
                    />
                    <Bar
                      dataKey="totalAbsent"
                      name="HS vắng"
                      fill="#f43f5e"
                      radius={[6, 6, 0, 0]}
                      barSize={22}
                    />
                    <Bar
                      dataKey="totalAfternoonDroppedOff"
                      name="Chiều đã trả"
                      fill="#10b981"
                      radius={[6, 6, 0, 0]}
                      barSize={22}
                    />
                  </>
                )}
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={dailyRows} margin={{ top: 10, right: 10, left: -15, bottom: 0 }}>
                <defs>
                  <linearGradient id="attendanceGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#4f46e5" stopOpacity={0.38} />
                    <stop offset="95%" stopColor="#4f46e5" stopOpacity={0.0} />
                  </linearGradient>
                  <linearGradient id="absentGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#f43f5e" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#f43f5e" stopOpacity={0.0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                <XAxis
                  dataKey="shortLabel"
                  stroke="#64748b"
                  fontSize={11}
                  tickLine={false}
                  axisLine={{ stroke: '#e2e8f0' }}
                />
                <YAxis
                  stroke="#64748b"
                  fontSize={11}
                  tickLine={false}
                  axisLine={false}
                  domain={chartMode === 'percentage' ? [0, 100] : [0, 'auto']}
                  unit={chartMode === 'percentage' ? '%' : ''}
                />
                <Tooltip
                  content={({ active, payload }) => {
                    if (active && payload && payload.length) {
                      const data = payload[0].payload as PeriodDailyRow;
                      return (
                        <div className="bg-slate-900 text-white p-3 rounded-xl shadow-xl border border-slate-700 text-xs space-y-1">
                          <p className="font-bold text-sm text-indigo-300">
                            {data.displayDate} ({data.dayOfWeek})
                          </p>
                          {!data.hasData ? (
                            <p className="text-slate-400">Chưa có dữ liệu điểm danh ngày này</p>
                          ) : (
                            <div className="pt-1 space-y-0.5">
                              <p className="text-emerald-300">
                                • Tỷ lệ chuyên cần: <strong>{data.attendanceRate}%</strong>
                              </p>
                              <p className="text-slate-200">
                                • Sáng đi xe: <strong>{data.present} / {data.total} em</strong>
                              </p>
                              <p className="text-rose-300">
                                • Vắng mặt: <strong>{data.absent} em</strong>
                              </p>
                              <p className="text-blue-300">
                                • Chiều lên xe / đã trả:{' '}
                                <strong>
                                  {data.afternoonBoarded} / {data.afternoonDroppedOff} em
                                </strong>
                              </p>
                            </div>
                          )}
                        </div>
                      );
                    }
                    return null;
                  }}
                />
                <Area
                  type="monotone"
                  dataKey={chartMode === 'percentage' ? 'attendanceRate' : 'present'}
                  name={chartMode === 'percentage' ? 'Tỷ lệ đi xe (%)' : 'Số học sinh đi'}
                  stroke="#4f46e5"
                  strokeWidth={3}
                  fillOpacity={1}
                  fill="url(#attendanceGradient)"
                  connectNulls={false}
                  dot={{ r: 4, fill: '#4f46e5', strokeWidth: 2, stroke: '#fff' }}
                  activeDot={{ r: 6, stroke: '#ffffff', strokeWidth: 2 }}
                />
                {chartMode === 'count' && (
                  <Area
                    type="monotone"
                    dataKey="absent"
                    name="Số học sinh vắng"
                    stroke="#f43f5e"
                    strokeWidth={2}
                    fillOpacity={1}
                    fill="url(#absentGradient)"
                  />
                )}
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Side-by-Side Comparison & Absence Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Route Comparison Bar Chart */}
        <div className="bg-white rounded-2xl p-5 shadow-xs border border-slate-200 flex flex-col justify-between">
          <div>
            <div className="mb-3">
              <h3 className="font-extrabold text-base text-slate-900 flex items-center gap-2">
                <Bus className="w-4 h-4 text-blue-600" />
                <span>So Sánh Tỷ Lệ Theo Tuyến Xe</span>
              </h3>
              <p className="text-xs text-slate-500">
                Chuyên cần thực tế ({range.label}) vs Tỷ lệ lấp đầy ghế xe
              </p>
            </div>

            <div className="h-64 w-full pt-2">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={routeStats} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                  <XAxis
                    dataKey="code"
                    stroke="#64748b"
                    fontSize={11}
                    tickLine={false}
                    axisLine={{ stroke: '#e2e8f0' }}
                  />
                  <YAxis
                    stroke="#64748b"
                    fontSize={11}
                    tickLine={false}
                    axisLine={false}
                    domain={[0, 100]}
                    unit="%"
                  />
                  <Tooltip
                    content={({ active, payload }) => {
                      if (active && payload && payload.length) {
                        const item = payload[0].payload as PeriodRouteStat;
                        return (
                          <div className="bg-slate-900 text-white p-3 rounded-xl shadow-lg text-xs space-y-1">
                            <p className="font-bold text-blue-300">
                              {item.code}: {item.name}
                            </p>
                            <p className="text-slate-300">
                              Biển số: {item.plateNumber} • Tài xế: {item.driverName}
                            </p>
                            <p className="text-emerald-300">
                              • Chuyên cần kỳ này: <strong>{item.attendanceRate}%</strong> ({item.totalPresent}/{item.totalExpectedRides} lượt)
                            </p>
                            <p className="text-amber-300">
                              • Tỷ lệ lấp đầy ghế: <strong>{item.occupancyRate}%</strong> ({item.assignedStudents}/{item.capacity} chỗ)
                            </p>
                          </div>
                        );
                      }
                      return null;
                    }}
                  />
                  <Legend
                    wrapperStyle={{ fontSize: '11px', paddingTop: '10px' }}
                    formatter={(val) =>
                      val === 'attendanceRate' ? 'Tỷ lệ chuyên cần (%)' : 'Tỷ lệ lấp đầy ghế (%)'
                    }
                  />
                  <Bar
                    dataKey="attendanceRate"
                    name="attendanceRate"
                    fill="#3b82f6"
                    radius={[6, 6, 0, 0]}
                    barSize={22}
                  />
                  <Bar
                    dataKey="occupancyRate"
                    name="occupancyRate"
                    fill="#cbd5e1"
                    radius={[6, 6, 0, 0]}
                    barSize={22}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
            <span>Phạm vi đang lọc: {visibleRoutes.length} tuyến</span>
            <span className="font-bold text-blue-600">{students.length} học sinh toàn hệ thống</span>
          </div>
        </div>

        {/* Absence Distribution Donut Chart */}
        <div className="bg-white rounded-2xl p-5 shadow-xs border border-slate-200 flex flex-col justify-between">
          <div>
            <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
              <div>
                <h3 className="font-extrabold text-base text-slate-900 flex items-center gap-2">
                  <PieIcon className="w-4 h-4 text-rose-500" />
                  <span>Phân Tích Vắng Mặt ({range.label})</span>
                </h3>
                <p className="text-xs text-slate-500">
                  {canShowReasonPie && absenceChartType === 'reason' && absenceReasonsToday.length > 0
                    ? 'Phân loại theo lý do phụ huynh/tài xế báo hôm nay'
                    : 'Phân bổ tổng số lượt vắng theo từng tuyến xe trong kỳ'}
                </p>
              </div>

              {canShowReasonPie && absenceReasonsToday.length > 0 && absenceByRoute.length > 0 && (
                <div className="inline-flex p-0.5 bg-slate-100 rounded-lg border border-slate-200 text-[11px] font-semibold">
                  <button
                    onClick={() => setAbsenceChartType('reason')}
                    className={`px-2 py-1 rounded-md ${
                      absenceChartType === 'reason'
                        ? 'bg-white text-slate-900 shadow-xs'
                        : 'text-slate-500'
                    }`}
                  >
                    Lý do (hôm nay)
                  </button>
                  <button
                    onClick={() => setAbsenceChartType('route')}
                    className={`px-2 py-1 rounded-md ${
                      absenceChartType === 'route'
                        ? 'bg-white text-slate-900 shadow-xs'
                        : 'text-slate-500'
                    }`}
                  >
                    Theo tuyến
                  </button>
                </div>
              )}
            </div>

            <div className="h-64 w-full flex items-center justify-center">
              {activeAbsenceData.length === 0 ? (
                <div className="text-center text-xs text-slate-400 px-4">
                  Không ghi nhận học sinh vắng mặt trong {range.label.toLowerCase()}.
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={activeAbsenceData}
                      dataKey="count"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      innerRadius={52}
                      outerRadius={82}
                      paddingAngle={3}
                    >
                      {activeAbsenceData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip
                      content={({ active, payload }) => {
                        if (active && payload && payload.length) {
                          const item = payload[0].payload as (typeof activeAbsenceData)[0];
                          return (
                            <div className="bg-slate-900 text-white p-2.5 rounded-xl shadow-lg text-xs space-y-1">
                              <p className="font-bold" style={{ color: item.color }}>
                                {item.name}
                              </p>
                              <p className="text-slate-200">
                                Số lượng: <strong>{item.count} lượt</strong> ({item.percentage}%)
                              </p>
                            </div>
                          );
                        }
                        return null;
                      }}
                    />
                    <Legend
                      layout="vertical"
                      align="right"
                      verticalAlign="middle"
                      wrapperStyle={{ fontSize: '11px', paddingRight: '8px' }}
                      formatter={(val, entry) => {
                        const payload = entry.payload as unknown as {
                          count: number;
                          percentage: number;
                        };
                        return `${val} (${payload.percentage || 0}%)`;
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

          <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
            <span className="flex items-center gap-1 text-slate-600">
              <Info className="w-3.5 h-3.5 text-blue-500" />
              {activeAbsenceData[0] ? (
                <>
                  Nhiều nhất: <strong>{activeAbsenceData[0].name}</strong>
                </>
              ) : (
                'Tất cả học sinh đi xe đầy đủ trong giai đoạn đã chọn'
              )}
            </span>
          </div>
        </div>
      </div>

      {/* Detailed Tables Card with Sub-tabs */}
      <div className="bg-white rounded-2xl shadow-xs border border-slate-200 overflow-hidden">
        <div className="p-4 bg-slate-50 border-b border-slate-200 flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex p-1 bg-white rounded-xl border border-slate-200 text-xs font-bold">
              <button
                onClick={() => setDetailTab('routes')}
                className={`px-3 py-1.5 rounded-lg transition-all ${
                  detailTab === 'routes'
                    ? 'bg-indigo-600 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Chi tiết theo Tuyến Xe
              </button>
              <button
                onClick={() => setDetailTab('daily')}
                className={`px-3 py-1.5 rounded-lg transition-all ${
                  detailTab === 'daily'
                    ? 'bg-indigo-600 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Tổng hợp theo Ngày ({tableDailyRows.length})
              </button>
              <button
                onClick={() => setDetailTab('students')}
                className={`px-3 py-1.5 rounded-lg transition-all ${
                  detailTab === 'students'
                    ? 'bg-indigo-600 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Chi tiết Học Sinh hôm nay ({filteredStudentRows.length})
              </button>
            </div>
          </div>

          <div className="flex items-center gap-3 text-xs text-slate-600">
            {detailTab === 'daily' && periodMode !== 'day' && (
              <label className="inline-flex items-center gap-1.5 cursor-pointer select-none font-medium">
                <input
                  type="checkbox"
                  checked={onlyDaysWithData}
                  onChange={(e) => setOnlyDaysWithData(e.target.checked)}
                  className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                />
                <span>Chỉ hiện ngày có dữ liệu</span>
              </label>
            )}
            <span>
              Kỳ: <strong>{range.label}</strong>
            </span>
          </div>
        </div>

        {/* Sub-tab 1: Route Breakdown Table */}
        {detailTab === 'routes' && (
          <div className="overflow-x-auto max-h-[520px]">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="sticky top-0 z-10 bg-slate-100 border-b border-slate-200 text-slate-600 font-bold uppercase tracking-wider text-[11px]">
                {periodMode === 'day' ? (
                  <tr>
                    <th className="p-3 pl-4">Tuyến xe</th>
                    <th className="p-3">Tài xế</th>
                    <th className="p-3 text-center">Sĩ số</th>
                    <th className="p-3 text-center">Sáng: Lái xe báo</th>
                    <th className="p-3 text-center">Sáng: Vào trường</th>
                    <th className="p-3 text-center">Sáng: Vắng</th>
                    <th className="p-3 text-center">Chiều: Lên xe</th>
                    <th className="p-3 text-center">Chiều: Đã trả</th>
                    <th className="p-3 text-center">Đi nhờ (Đến/Đi)</th>
                    <th className="p-3 text-center">Lưu CSDL</th>
                    <th className="p-3 text-right pr-4">Tỷ lệ chuyên cần</th>
                  </tr>
                ) : (
                  <tr>
                    <th className="p-3 pl-4">Tuyến xe</th>
                    <th className="p-3">Tài xế</th>
                    <th className="p-3 text-center">Sĩ số</th>
                    <th className="p-3 text-center">Ngày có DL</th>
                    <th className="p-3 text-center">Chốt CSDL (S/C)</th>
                    <th className="p-3 text-center">Tổng lượt đi</th>
                    <th className="p-3 text-center">Tổng lượt vắng</th>
                    <th className="p-3 text-center">Chiều lên / trả</th>
                    <th className="p-3 text-center">Đi nhờ (Đến/Đi)</th>
                    <th className="p-3 text-right pr-4">Chuyên cần TB</th>
                  </tr>
                )}
              </thead>
              <tbody className="divide-y divide-slate-100">
                {routeStats.map((r) => (
                  <tr key={r.routeId} className="hover:bg-slate-50 transition-colors">
                    <td className="p-3 pl-4">
                      <div className="font-bold text-slate-900">{r.code}</div>
                      <div className="text-[11px] text-slate-500 max-w-[200px] truncate">{r.name}</div>
                    </td>
                    <td className="p-3 text-slate-700">{r.driverName}</td>
                    <td className="p-3 text-center font-mono font-bold text-slate-800">
                      {periodMode === 'day' ? r.dayTotalRoster : r.assignedStudents}
                    </td>

                    {periodMode === 'day' ? (
                      <>
                        <td className="p-3 text-center font-mono text-indigo-700 font-semibold">
                          {r.dayMorningDriverReported}
                        </td>
                        <td className="p-3 text-center font-mono text-emerald-700 font-bold">
                          {r.dayMorningSchoolVerified}
                        </td>
                        <td className="p-3 text-center font-mono text-rose-600 font-semibold">
                          {r.dayMorningAbsent}
                        </td>
                        <td className="p-3 text-center font-mono text-blue-700 font-semibold">
                          {r.dayAfternoonBoarded}
                        </td>
                        <td className="p-3 text-center font-mono text-emerald-700 font-semibold">
                          {r.dayAfternoonDroppedOff}
                        </td>
                        <td className="p-3 text-center font-mono text-slate-600">
                          +{r.dayTransferredIn} / -{r.dayTransferredOut}
                        </td>
                        <td className="p-3 text-center">
                          <div className="inline-flex items-center gap-1 text-[10px] font-bold">
                            <span
                              className={`px-1.5 py-0.5 rounded ${
                                r.dayMorningSavedToDb
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : 'bg-slate-100 text-slate-500'
                              }`}
                            >
                              Sáng
                            </span>
                            <span
                              className={`px-1.5 py-0.5 rounded ${
                                r.dayAfternoonSavedToDb
                                  ? 'bg-blue-100 text-blue-800'
                                  : 'bg-slate-100 text-slate-500'
                              }`}
                            >
                              Chiều
                            </span>
                          </div>
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="p-3 text-center font-mono text-slate-700">{r.activeDays}</td>
                        <td className="p-3 text-center font-mono text-indigo-700 font-semibold">
                          {r.morningLoggedSessions} / {r.afternoonLoggedSessions}
                        </td>
                        <td className="p-3 text-center font-mono text-emerald-700 font-bold">
                          {r.totalPresent} / {r.totalExpectedRides}
                        </td>
                        <td className="p-3 text-center font-mono text-rose-600 font-semibold">
                          {r.totalAbsent}
                        </td>
                        <td className="p-3 text-center font-mono text-blue-700">
                          {r.totalAfternoonBoarded} / {r.totalAfternoonDroppedOff}
                        </td>
                        <td className="p-3 text-center font-mono text-slate-600">
                          +{r.totalTransferredIn} / -{r.totalTransferredOut}
                        </td>
                      </>
                    )}

                    <td className="p-3 text-right pr-4">
                      <span
                        className={`px-2 py-0.5 rounded font-bold font-mono ${
                          r.attendanceRate >= 95
                            ? 'bg-emerald-100 text-emerald-800'
                            : r.attendanceRate >= 85
                            ? 'bg-blue-100 text-blue-800'
                            : r.totalExpectedRides === 0
                            ? 'bg-slate-100 text-slate-500'
                            : 'bg-amber-100 text-amber-800'
                        }`}
                      >
                        {r.totalExpectedRides > 0 ? `${r.attendanceRate}%` : '---'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Sub-tab 2: Daily Summary Table */}
        {detailTab === 'daily' && (
          <div className="overflow-x-auto max-h-[520px]">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="sticky top-0 z-10 bg-slate-100 border-b border-slate-200 text-slate-600 font-bold uppercase tracking-wider text-[11px]">
                <tr>
                  <th className="p-3 pl-4 sticky left-0 bg-slate-100 z-20 min-w-[140px]">Ngày</th>
                  <th className="p-3">Thứ</th>
                  <th className="p-3 text-center">Tuyến ghi nhận</th>
                  <th className="p-3 text-center">Sĩ số</th>
                  <th className="p-3 text-center">Đi xe (Sáng)</th>
                  <th className="p-3 text-center">Vắng</th>
                  <th className="p-3 text-center">Chiều lên / trả</th>
                  {visibleRoutes.map((r) => (
                    <th key={r.id} className="p-3 text-center whitespace-nowrap">
                      {r.code}
                    </th>
                  ))}
                  <th className="p-3 text-right pr-4">Chuyên cần</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {tableDailyRows.length === 0 ? (
                  <tr>
                    <td colSpan={8 + visibleRoutes.length} className="p-8 text-center text-slate-400">
                      Chưa có ngày nào được lưu dữ liệu trong {range.label.toLowerCase()}.
                    </td>
                  </tr>
                ) : (
                  tableDailyRows.map((d) => (
                    <tr
                      key={d.date}
                      className={`hover:bg-slate-50 transition-colors ${
                        d.isToday ? 'bg-indigo-50/50 font-semibold' : !d.hasData ? 'text-slate-400' : ''
                      }`}
                    >
                      <td className="p-3 pl-4 font-mono font-bold text-slate-900 sticky left-0 bg-white/95 backdrop-blur-xs whitespace-nowrap">
                        {d.displayDate}
                        {d.isToday && (
                          <span className="ml-1.5 px-1.5 py-0.5 bg-indigo-600 text-white rounded text-[10px] uppercase">
                            Trực tiếp
                          </span>
                        )}
                      </td>
                      <td className="p-3 whitespace-nowrap">{d.dayOfWeek}</td>
                      <td className="p-3 text-center font-mono">
                        {d.hasData ? `${d.activeRoutesCount}/${visibleRoutes.length}` : '---'}
                      </td>
                      <td className="p-3 text-center font-mono">
                        {d.hasData ? d.total : '---'}
                      </td>
                      <td className="p-3 text-center font-mono text-emerald-700 font-bold">
                        {d.hasData && d.present !== null ? d.present : '---'}
                      </td>
                      <td className="p-3 text-center font-mono text-rose-600">
                        {d.hasData ? d.absent : '---'}
                      </td>
                      <td className="p-3 text-center font-mono text-blue-700">
                        {d.hasData ? `${d.afternoonBoarded} / ${d.afternoonDroppedOff}` : '---'}
                      </td>
                      {visibleRoutes.map((r) => {
                        const rate = d.routeRates[r.id];
                        return (
                          <td key={r.id} className="p-3 text-center font-mono">
                            {rate !== null && rate !== undefined ? `${rate}%` : '—'}
                          </td>
                        );
                      })}
                      <td className="p-3 text-right pr-4">
                        {d.hasData && d.attendanceRate !== null ? (
                          <span
                            className={`px-2 py-0.5 rounded font-bold font-mono ${
                              d.attendanceRate >= 95
                                ? 'bg-emerald-100 text-emerald-800'
                                : d.attendanceRate >= 85
                                ? 'bg-blue-100 text-blue-800'
                                : 'bg-amber-100 text-amber-800'
                            }`}
                          >
                            {d.attendanceRate}%
                          </span>
                        ) : (
                          <span className="text-slate-400 text-[11px]">Chưa có DL</span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* Sub-tab 3: Live Student Attendance Detail Table (Today) */}
        {detailTab === 'students' && (
          <div>
            <div className="p-3 bg-slate-50/70 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="relative flex-1 max-w-sm">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={studentSearch}
                  onChange={(e) => setStudentSearch(e.target.value)}
                  placeholder="Tìm tên, mã HS, lớp hoặc mã tuyến..."
                  className="w-full pl-8 pr-3 py-1.5 bg-white border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div className="flex flex-wrap items-center gap-1.5 text-[11px] font-bold">
                {(
                  [
                    { id: 'all', label: 'Tất cả' },
                    { id: 'present', label: 'Có đi xe' },
                    { id: 'absent', label: 'Vắng mặt' },
                    { id: 'transfer', label: 'Đi nhờ xe' },
                    { id: 'pending', label: 'Chưa điểm danh' },
                  ] as const
                ).map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => setStudentStatusFilter(tab.id)}
                    className={`px-2.5 py-1 rounded-lg border transition-colors ${
                      studentStatusFilter === tab.id
                        ? 'bg-indigo-600 text-white border-indigo-600'
                        : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="overflow-x-auto max-h-[520px]">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="sticky top-0 z-10 bg-slate-100 border-b border-slate-200 text-slate-600 font-bold uppercase tracking-wider text-[11px]">
                  <tr>
                    <th className="p-3 pl-4">Học sinh</th>
                    <th className="p-3">Lớp</th>
                    <th className="p-3">Tuyến</th>
                    <th className="p-3 text-center">Đón sáng</th>
                    <th className="p-3 text-center">Vào trường</th>
                    <th className="p-3 text-center">Lên xe chiều</th>
                    <th className="p-3 text-center">Trả chiều</th>
                    <th className="p-3 pr-4">Ghi chú / Đi nhờ</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredStudentRows.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="p-8 text-center text-slate-400">
                        Không tìm thấy học sinh phù hợp bộ lọc.
                      </td>
                    </tr>
                  ) : (
                    filteredStudentRows.map(({ student, rec, route, hasTransfer }) => {
                      const mPick = translateStatusBadge(rec?.morningPickupStatus);
                      const mSchool = translateStatusBadge(rec?.morningSchoolStatus);
                      const aBoard = translateStatusBadge(rec?.afternoonBoardStatus);
                      const aDrop = translateStatusBadge(rec?.afternoonDropoffStatus);
                      return (
                        <tr key={student.id} className="hover:bg-slate-50">
                          <td className="p-3 pl-4">
                            <div className="font-bold text-slate-900">{student.name}</div>
                            <div className="text-[11px] font-mono text-slate-500">{student.code}</div>
                          </td>
                          <td className="p-3 font-semibold text-slate-700">{student.class}</td>
                          <td className="p-3">
                            <span className="font-mono font-bold text-indigo-700">
                              {route?.code || student.routeId}
                            </span>
                          </td>
                          <td className="p-3 text-center">
                            <span className={`px-2 py-0.5 rounded font-semibold ${mPick.cls}`}>
                              {mPick.text}
                            </span>
                          </td>
                          <td className="p-3 text-center">
                            <span className={`px-2 py-0.5 rounded font-semibold ${mSchool.cls}`}>
                              {mSchool.text}
                            </span>
                          </td>
                          <td className="p-3 text-center">
                            <span className={`px-2 py-0.5 rounded font-semibold ${aBoard.cls}`}>
                              {aBoard.text}
                            </span>
                          </td>
                          <td className="p-3 text-center">
                            <span className={`px-2 py-0.5 rounded font-semibold ${aDrop.cls}`}>
                              {aDrop.text}
                            </span>
                          </td>
                          <td className="p-3 pr-4 text-slate-600 max-w-[220px]">
                            <div className="flex flex-wrap items-center gap-1">
                              {hasTransfer && (
                                <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-purple-100 text-purple-800 font-bold text-[10px]">
                                  <ArrowLeftRight className="w-3 h-3" />
                                  Đi nhờ
                                </span>
                              )}
                              <span className="truncate">
                                {rec?.parentExcusedReason ||
                                  rec?.morningPickupNote ||
                                  rec?.afternoonNote ||
                                  '—'}
                              </span>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
