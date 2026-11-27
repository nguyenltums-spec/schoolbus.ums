import {
  DailyTrendData,
  RoutePerformanceData,
  AbsenceReasonStat,
  Student,
  Route,
  CheckinRecord,
  DatabaseSaveLog,
  RouteSessionState,
} from '../types';
import { getTodayDateString } from './defaultData';
import {
  isTransferredInAcceptedForSession,
  isTransferredOutAcceptedForSession,
} from '../utils/transferHelpers';

const DAYS_OF_WEEK_VI = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
const FULL_DAYS_OF_WEEK_VI = [
  'Chủ nhật',
  'Thứ 2',
  'Thứ 3',
  'Thứ 4',
  'Thứ 5',
  'Thứ 6',
  'Thứ 7',
];

export type AnalyticsPeriodMode = 'day' | 'week' | 'month';

export interface PeriodDateRange {
  mode: AnalyticsPeriodMode;
  startDate: string; // YYYY-MM-DD
  endDate: string;   // YYYY-MM-DD
  dates: string[];   // YYYY-MM-DD[]
  label: string;
}

export interface PeriodDailyRow {
  date: string;
  displayDate: string;
  shortLabel: string;
  dayOfWeek: string;
  isToday: boolean;
  hasData: boolean;
  activeRoutesCount: number;
  morningLoggedRoutes: number;
  afternoonLoggedRoutes: number;
  total: number;
  present: number | null;
  absent: number;
  late: number;
  afternoonBoarded: number;
  afternoonDroppedOff: number;
  transferredIn: number;
  transferredOut: number;
  attendanceRate: number | null;
  routeRates: Record<string, number | null>;
  routePresent: Record<string, number>;
  routeAbsent: Record<string, number>;
}

export interface PeriodRouteStat {
  routeId: string;
  code: string;
  name: string;
  plateNumber: string;
  driverName: string;
  color: string;
  capacity: number;
  assignedStudents: number;
  occupancyRate: number;
  activeDays: number;
  morningLoggedSessions: number;
  afternoonLoggedSessions: number;
  totalExpectedRides: number;
  totalPresent: number;
  totalAbsent: number;
  totalAfternoonBoarded: number;
  totalAfternoonDroppedOff: number;
  totalTransferredIn: number;
  totalTransferredOut: number;
  attendanceRate: number;
  // Single-day detailed breakdown
  dayTotalRoster: number;
  dayMorningDriverReported: number;
  dayMorningSchoolVerified: number;
  dayMorningAbsent: number;
  dayMorningSavedToDb: boolean;
  dayAfternoonBoarded: number;
  dayAfternoonDroppedOff: number;
  dayAfternoonAbsent: number;
  dayAfternoonSavedToDb: boolean;
  dayTransferredIn: number;
  dayTransferredOut: number;
}

export interface PeriodSummaryKPI {
  avgAttendanceRate: number;
  totalExpectedRides: number;
  totalPresentRides: number;
  totalAbsences: number;
  totalAfternoonBoarded: number;
  totalAfternoonDroppedOff: number;
  activeDaysCount: number;
  totalCalendarDays: number;
  loggedSessionsCount: number;
  expectedSessionsCount: number;
  bestRoute: PeriodRouteStat | null;
}

export interface PeriodAnalyticsResult {
  range: PeriodDateRange;
  dailyRows: PeriodDailyRow[];
  routeStats: PeriodRouteStat[];
  summary: PeriodSummaryKPI;
  absenceReasonsToday: AbsenceReasonStat[];
  absenceByRoute: AbsenceReasonStat[];
}

export const parseDateLocal = (dateStr: string): Date => {
  const parts = dateStr.split('-').map(Number);
  if (parts.length !== 3 || parts.some(Number.isNaN)) {
    return new Date();
  }
  return new Date(parts[0], parts[1] - 1, parts[2]);
};

export const formatDateLocal = (d: Date): string => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

export const formatDisplayDateVi = (dateStr: string): string => {
  const parts = dateStr.split('-');
  return parts.length === 3 ? `${parts[2]}/${parts[1]}/${parts[0]}` : dateStr;
};

export const formatShortDateVi = (dateStr: string): string => {
  const parts = dateStr.split('-');
  return parts.length === 3 ? `${parts[2]}/${parts[1]}` : dateStr;
};

export const shiftDateStr = (dateStr: string, deltaDays: number): string => {
  const d = parseDateLocal(dateStr);
  d.setDate(d.getDate() + deltaDays);
  return formatDateLocal(d);
};

export const shiftMonthStr = (monthStr: string, deltaMonths: number): string => {
  const [yStr, mStr] = monthStr.split('-');
  const y = Number(yStr) || new Date().getFullYear();
  const m = Number(mStr) || new Date().getMonth() + 1;
  const d = new Date(y, m - 1 + deltaMonths, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

export const getWeekBounds = (anchorDateStr: string): {
  startDate: string;
  endDate: string;
  dates: string[];
} => {
  const anchor = parseDateLocal(anchorDateStr);
  const day = anchor.getDay(); // 0=Sun..6=Sat
  const diffToMonday = day === 0 ? -6 : 1 - day;
  const monday = new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate() + diffToMonday);
  const dates: string[] = [];
  for (let i = 0; i < 7; i++) {
    const cur = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + i);
    dates.push(formatDateLocal(cur));
  }
  return {
    startDate: dates[0],
    endDate: dates[dates.length - 1],
    dates,
  };
};

export const getMonthBounds = (monthStr: string): {
  startDate: string;
  endDate: string;
  dates: string[];
} => {
  const [yStr, mStr] = monthStr.split('-');
  const year = Number(yStr) || new Date().getFullYear();
  const month = Number(mStr) || new Date().getMonth() + 1;
  const daysInMonth = new Date(year, month, 0).getDate();
  const dates: string[] = [];
  for (let day = 1; day <= daysInMonth; day++) {
    dates.push(
      `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    );
  }
  return {
    startDate: dates[0],
    endDate: dates[dates.length - 1],
    dates,
  };
};

export const getPeriodDateRange = (
  mode: AnalyticsPeriodMode,
  selectedDate: string,
  selectedMonth: string
): PeriodDateRange => {
  if (mode === 'day') {
    return {
      mode,
      startDate: selectedDate,
      endDate: selectedDate,
      dates: [selectedDate],
      label: `Ngày ${formatDisplayDateVi(selectedDate)}`,
    };
  }
  if (mode === 'week') {
    const bounds = getWeekBounds(selectedDate);
    return {
      mode,
      ...bounds,
      label: `Tuần ${formatShortDateVi(bounds.startDate)} – ${formatDisplayDateVi(bounds.endDate)}`,
    };
  }
  const bounds = getMonthBounds(selectedMonth);
  const [y, m] = selectedMonth.split('-');
  return {
    mode,
    ...bounds,
    label: `Tháng ${m}/${y}`,
  };
};

export const getAbsenceReasonDistribution = (
  students: Student[],
  records: Record<string, CheckinRecord>
): AbsenceReasonStat[] => {
  let parentDrop = 0;
  let sick = 0;
  let family = 0;
  let driverMarked = 0;
  let other = 0;

  students.forEach((s) => {
    const rec = records[s.id];
    const isAbsent =
      rec?.morningPickupStatus === 'absent' || rec?.afternoonBoardStatus === 'absent';
    if (!isAbsent) return;

    const reasonText = (
      rec?.parentExcusedReason ||
      rec?.morningPickupNote ||
      rec?.afternoonNote ||
      ''
    ).toLowerCase();

    if (reasonText.includes('ốm') || reasonText.includes('sốt') || reasonText.includes('bệnh')) {
      sick++;
    } else if (
      reasonText.includes('bố mẹ') ||
      reasonText.includes('ph đón') ||
      reasonText.includes('đưa đón') ||
      reasonText.includes('tự túc')
    ) {
      parentDrop++;
    } else if (
      reasonText.includes('gia đình') ||
      reasonText.includes('bận') ||
      reasonText.includes('về quê')
    ) {
      family++;
    } else if (reasonText.includes('lái xe')) {
      driverMarked++;
    } else {
      other++;
    }
  });

  const total = sick + parentDrop + family + driverMarked + other;
  if (total === 0) {
    return [];
  }

  const items: Array<{ name: string; count: number; color: string }> = [
    { name: 'Phụ huynh tự đưa đón', count: parentDrop, color: '#3b82f6' },
    { name: 'Sốt / Ốm', count: sick, color: '#f43f5e' },
    { name: 'Việc gia đình', count: family, color: '#f59e0b' },
    { name: 'Lái xe báo vắng', count: driverMarked, color: '#8b5cf6' },
    { name: 'Lý do khác', count: other, color: '#64748b' },
  ].filter((x) => x.count > 0);

  return items.map((item) => ({
    ...item,
    percentage: Math.round((item.count / total) * 100),
  }));
};

export const computePeriodAnalytics = ({
  routes,
  students,
  records,
  sessionStates = {},
  dbLogs = [],
  todayDate = getTodayDateString(),
  range,
  routeFilterId = 'all',
}: {
  routes: Route[];
  students: Student[];
  records: Record<string, CheckinRecord>;
  sessionStates?: Record<string, RouteSessionState>;
  dbLogs?: DatabaseSaveLog[];
  todayDate?: string;
  range: PeriodDateRange;
  routeFilterId?: string;
}): PeriodAnalyticsResult => {
  const targetRoutes =
    routeFilterId && routeFilterId !== 'all'
      ? routes.filter((r) => r.id === routeFilterId)
      : routes;

  const targetRouteIds = new Set(targetRoutes.map((r) => r.id));
  const targetStudents = students.filter((s) => targetRouteIds.has(s.routeId));

  // Index DB logs by date -> routeId -> latest morning/afternoon log
  const logsByDate = new Map<
    string,
    {
      morning: Map<string, DatabaseSaveLog>;
      afternoon: Map<string, DatabaseSaveLog>;
    }
  >();

  dbLogs.forEach((log) => {
    if (!targetRouteIds.has(log.routeId)) return;
    let bucket = logsByDate.get(log.date);
    if (!bucket) {
      bucket = { morning: new Map(), afternoon: new Map() };
      logsByDate.set(log.date, bucket);
    }
    const targetMap = log.sessionType === 'morning' ? bucket.morning : bucket.afternoon;
    // dbLogs is stored newest-first; keep first seen entry as latest
    if (!targetMap.has(log.routeId)) {
      targetMap.set(log.routeId, log);
    }
  });

  // Accumulators per route across the entire selected period
  const routeAccMap = new Map<string, PeriodRouteStat>();
  targetRoutes.forEach((r) => {
    const assigned = students.filter((s) => s.routeId === r.id).length;
    const occupancyRate =
      r.capacity > 0 ? Math.min(100, Math.round((assigned / r.capacity) * 100)) : 0;
    routeAccMap.set(r.id, {
      routeId: r.id,
      code: r.code,
      name: r.name,
      plateNumber: r.plateNumber,
      driverName: r.driverName,
      color: r.color || '#3b82f6',
      capacity: r.capacity,
      assignedStudents: assigned,
      occupancyRate,
      activeDays: 0,
      morningLoggedSessions: 0,
      afternoonLoggedSessions: 0,
      totalExpectedRides: 0,
      totalPresent: 0,
      totalAbsent: 0,
      totalAfternoonBoarded: 0,
      totalAfternoonDroppedOff: 0,
      totalTransferredIn: 0,
      totalTransferredOut: 0,
      attendanceRate: 0,
      dayTotalRoster: assigned,
      dayMorningDriverReported: 0,
      dayMorningSchoolVerified: 0,
      dayMorningAbsent: 0,
      dayMorningSavedToDb: false,
      dayAfternoonBoarded: 0,
      dayAfternoonDroppedOff: 0,
      dayAfternoonAbsent: 0,
      dayAfternoonSavedToDb: false,
      dayTransferredIn: 0,
      dayTransferredOut: 0,
    });
  });

  const dailyRows: PeriodDailyRow[] = range.dates.map((dateStr) => {
    const isToday = dateStr === todayDate;
    const dObj = parseDateLocal(dateStr);
    const dayIdx = Number.isNaN(dObj.getTime()) ? 1 : dObj.getDay();
    const shortDate = formatShortDateVi(dateStr);
    const displayDate = isToday
      ? `Hôm nay (${shortDate})`
      : `${DAYS_OF_WEEK_VI[dayIdx]} ${shortDate}`;
    const shortLabel = range.mode === 'month' ? shortDate.split('/')[0] : `${DAYS_OF_WEEK_VI[dayIdx]} ${shortDate}`;
    const dayOfWeek = FULL_DAYS_OF_WEEK_VI[dayIdx];

    const routeRates: Record<string, number | null> = {};
    const routePresent: Record<string, number> = {};
    const routeAbsent: Record<string, number> = {};

    const dayLogsBucket = logsByDate.get(dateStr);

    if (isToday) {
      let totalRoster = 0;
      let totalPresent = 0;
      let totalAbsent = 0;
      let totalLate = 0;
      let totalAfternoonBoarded = 0;
      let totalAfternoonDroppedOff = 0;
      let totalTransferredIn = 0;
      let totalTransferredOut = 0;
      let activeRoutesCount = 0;
      let morningLoggedRoutes = 0;
      let afternoonLoggedRoutes = 0;

      targetRoutes.forEach((r) => {
        const rStudents = students.filter((s) => s.routeId === r.id);
        const assigned = rStudents.length;

        const morningPresentCount = rStudents.filter((s) => {
          const rec = records[s.id];
          return (
            rec?.morningPickupStatus === 'boarded' ||
            rec?.morningSchoolStatus === 'dropped_at_school'
          );
        }).length;

        const morningDriverBoardedCount = rStudents.filter(
          (s) => records[s.id]?.morningPickupStatus === 'boarded'
        ).length;

        const morningSchoolVerifiedCount = rStudents.filter(
          (s) => records[s.id]?.morningSchoolStatus === 'dropped_at_school'
        ).length;

        const morningAbsentCount = rStudents.filter(
          (s) => records[s.id]?.morningPickupStatus === 'absent'
        ).length;

        const morningLateCount = rStudents.filter(
          (s) => records[s.id]?.morningPickupStatus === 'late'
        ).length;

        const afternoonBoardedCount = rStudents.filter((s) => {
          const rec = records[s.id];
          return (
            rec?.afternoonBoardStatus === 'boarded' ||
            rec?.afternoonDropoffStatus === 'dropped_off'
          );
        }).length;

        const afternoonDropoffCount = rStudents.filter(
          (s) => records[s.id]?.afternoonDropoffStatus === 'dropped_off'
        ).length;

        const afternoonAbsentCount = rStudents.filter(
          (s) => records[s.id]?.afternoonBoardStatus === 'absent'
        ).length;

        const transIn = students.filter(
          (s) =>
            isTransferredInAcceptedForSession(records[s.id], r.id, 'morning') ||
            isTransferredInAcceptedForSession(records[s.id], r.id, 'afternoon')
        ).length;

        const transOut = rStudents.filter(
          (s) =>
            isTransferredOutAcceptedForSession(records[s.id], r.id, 'morning') ||
            isTransferredOutAcceptedForSession(records[s.id], r.id, 'afternoon')
        ).length;

        const sess = sessionStates[r.id];
        const isTodaySess = sess?.date === todayDate;
        const morningLog = dayLogsBucket?.morning.get(r.id);
        const afternoonLog = dayLogsBucket?.afternoon.get(r.id);

        const morningSaved = Boolean(
          morningLog || (isTodaySess && (sess?.morningLocked || sess?.morningDbSavedAt))
        );
        const afternoonSaved = Boolean(
          afternoonLog ||
            (isTodaySess &&
              (sess?.afternoonLocked ||
                sess?.afternoonDropoffConfirmed ||
                sess?.afternoonDbSavedAt))
        );

        if (morningSaved) morningLoggedRoutes++;
        if (afternoonSaved) afternoonLoggedRoutes++;

        const routeHasActivity =
          morningPresentCount > 0 ||
          morningAbsentCount > 0 ||
          afternoonBoardedCount > 0 ||
          morningSaved ||
          afternoonSaved ||
          assigned > 0;
        if (routeHasActivity && assigned > 0) {
          activeRoutesCount++;
        }

        const rRate = assigned > 0 ? Math.round((morningPresentCount / assigned) * 100) : 0;
        routeRates[r.id] = assigned > 0 ? rRate : null;
        routePresent[r.id] = morningPresentCount;
        routeAbsent[r.id] = morningAbsentCount;

        totalRoster += assigned;
        totalPresent += morningPresentCount;
        totalAbsent += morningAbsentCount;
        totalLate += morningLateCount;
        totalAfternoonBoarded += afternoonBoardedCount;
        totalAfternoonDroppedOff += afternoonDropoffCount;
        totalTransferredIn += transIn;
        totalTransferredOut += transOut;

        const acc = routeAccMap.get(r.id);
        if (acc) {
          if (assigned > 0) {
            acc.activeDays += 1;
          }
          if (morningSaved) acc.morningLoggedSessions += 1;
          if (afternoonSaved) acc.afternoonLoggedSessions += 1;
          acc.totalExpectedRides += assigned;
          acc.totalPresent += morningPresentCount;
          acc.totalAbsent += morningAbsentCount;
          acc.totalAfternoonBoarded += afternoonBoardedCount;
          acc.totalAfternoonDroppedOff += afternoonDropoffCount;
          acc.totalTransferredIn += transIn;
          acc.totalTransferredOut += transOut;

          // Day breakdown
          acc.dayTotalRoster = assigned;
          acc.dayMorningDriverReported =
            isTodaySess && typeof sess?.morningReportedBoarded === 'number'
              ? sess.morningReportedBoarded
              : morningDriverBoardedCount;
          acc.dayMorningSchoolVerified = morningSchoolVerifiedCount;
          acc.dayMorningAbsent = morningAbsentCount;
          acc.dayMorningSavedToDb = morningSaved;
          acc.dayAfternoonBoarded = afternoonBoardedCount;
          acc.dayAfternoonDroppedOff = afternoonDropoffCount;
          acc.dayAfternoonAbsent = afternoonAbsentCount;
          acc.dayAfternoonSavedToDb = afternoonSaved;
          acc.dayTransferredIn = transIn;
          acc.dayTransferredOut = transOut;
        }
      });

      const rate = totalRoster > 0 ? Math.round((totalPresent / totalRoster) * 1000) / 10 : 0;

      return {
        date: dateStr,
        displayDate,
        shortLabel,
        dayOfWeek,
        isToday: true,
        hasData: totalRoster > 0,
        activeRoutesCount,
        morningLoggedRoutes,
        afternoonLoggedRoutes,
        total: totalRoster,
        present: totalRoster > 0 ? totalPresent : null,
        absent: totalAbsent,
        late: totalLate,
        afternoonBoarded: totalAfternoonBoarded,
        afternoonDroppedOff: totalAfternoonDroppedOff,
        transferredIn: totalTransferredIn,
        transferredOut: totalTransferredOut,
        attendanceRate: totalRoster > 0 ? rate : null,
        routeRates,
        routePresent,
        routeAbsent,
      };
    }

    // Historical day (strictly from dbLogs)
    if (!dayLogsBucket || (dayLogsBucket.morning.size === 0 && dayLogsBucket.afternoon.size === 0)) {
      targetRoutes.forEach((r) => {
        routeRates[r.id] = null;
        routePresent[r.id] = 0;
        routeAbsent[r.id] = 0;
      });
      return {
        date: dateStr,
        displayDate,
        shortLabel,
        dayOfWeek,
        isToday: false,
        hasData: false,
        activeRoutesCount: 0,
        morningLoggedRoutes: 0,
        afternoonLoggedRoutes: 0,
        total: 0,
        present: null,
        absent: 0,
        late: 0,
        afternoonBoarded: 0,
        afternoonDroppedOff: 0,
        transferredIn: 0,
        transferredOut: 0,
        attendanceRate: null,
        routeRates,
        routePresent,
        routeAbsent,
      };
    }

    let dayTotal = 0;
    let dayPresent = 0;
    let dayAbsent = 0;
    let dayAfternoonBoarded = 0;
    let dayAfternoonDroppedOff = 0;
    let dayTransferredIn = 0;
    let dayTransferredOut = 0;
    let activeRoutesCount = 0;
    let morningLoggedRoutes = 0;
    let afternoonLoggedRoutes = 0;

    targetRoutes.forEach((r) => {
      const mLog = dayLogsBucket.morning.get(r.id);
      const aLog = dayLogsBucket.afternoon.get(r.id);
      const primaryLog = mLog || aLog;

      if (!primaryLog) {
        routeRates[r.id] = null;
        routePresent[r.id] = 0;
        routeAbsent[r.id] = 0;
        return;
      }

      activeRoutesCount++;
      if (mLog) morningLoggedRoutes++;
      if (aLog) afternoonLoggedRoutes++;

      const rTotal = primaryLog.totalRoster;
      const rPresent = primaryLog.supervisorVerifiedCount;
      const rAbsent = primaryLog.absentCount;
      const rAftBoard = aLog ? aLog.supervisorVerifiedCount : 0;
      const rAftDrop = aLog?.afternoonDropoffCount ?? 0;
      const rTransIn = (mLog?.transferredInCount ?? 0) + (aLog?.transferredInCount ?? 0);
      const rTransOut = (mLog?.transferredOutCount ?? 0) + (aLog?.transferredOutCount ?? 0);

      dayTotal += rTotal;
      dayPresent += rPresent;
      dayAbsent += rAbsent;
      dayAfternoonBoarded += rAftBoard;
      dayAfternoonDroppedOff += rAftDrop;
      dayTransferredIn += rTransIn;
      dayTransferredOut += rTransOut;

      routeRates[r.id] = rTotal > 0 ? Math.round((rPresent / rTotal) * 100) : 0;
      routePresent[r.id] = rPresent;
      routeAbsent[r.id] = rAbsent;

      const acc = routeAccMap.get(r.id);
      if (acc) {
        acc.activeDays += 1;
        if (mLog) acc.morningLoggedSessions += 1;
        if (aLog) acc.afternoonLoggedSessions += 1;
        acc.totalExpectedRides += rTotal;
        acc.totalPresent += rPresent;
        acc.totalAbsent += rAbsent;
        acc.totalAfternoonBoarded += rAftBoard;
        acc.totalAfternoonDroppedOff += rAftDrop;
        acc.totalTransferredIn += rTransIn;
        acc.totalTransferredOut += rTransOut;

        if (range.mode === 'day') {
          acc.dayTotalRoster = rTotal;
          acc.dayMorningDriverReported = mLog?.driverReportedPresent ?? 0;
          acc.dayMorningSchoolVerified = mLog?.supervisorVerifiedCount ?? 0;
          acc.dayMorningAbsent = mLog?.absentCount ?? 0;
          acc.dayMorningSavedToDb = Boolean(mLog);
          acc.dayAfternoonBoarded = aLog?.supervisorVerifiedCount ?? 0;
          acc.dayAfternoonDroppedOff = aLog?.afternoonDropoffCount ?? 0;
          acc.dayAfternoonAbsent = aLog?.absentCount ?? 0;
          acc.dayAfternoonSavedToDb = Boolean(aLog);
          acc.dayTransferredIn = rTransIn;
          acc.dayTransferredOut = rTransOut;
        }
      }
    });

    const dayRate = dayTotal > 0 ? Math.round((dayPresent / dayTotal) * 1000) / 10 : 0;

    return {
      date: dateStr,
      displayDate,
      shortLabel,
      dayOfWeek,
      isToday: false,
      hasData: activeRoutesCount > 0,
      activeRoutesCount,
      morningLoggedRoutes,
      afternoonLoggedRoutes,
      total: dayTotal,
      present: dayPresent,
      absent: dayAbsent,
      late: 0,
      afternoonBoarded: dayAfternoonBoarded,
      afternoonDroppedOff: dayAfternoonDroppedOff,
      transferredIn: dayTransferredIn,
      transferredOut: dayTransferredOut,
      attendanceRate: dayRate,
      routeRates,
      routePresent,
      routeAbsent,
    };
  });

  const routeStats: PeriodRouteStat[] = Array.from(routeAccMap.values()).map((acc) => ({
    ...acc,
    attendanceRate:
      acc.totalExpectedRides > 0
        ? Math.round((acc.totalPresent / acc.totalExpectedRides) * 1000) / 10
        : 0,
  }));

  const activeDays = dailyRows.filter((d) => d.hasData);
  const totalExpectedRides = activeDays.reduce((s, d) => s + d.total, 0);
  const totalPresentRides = activeDays.reduce((s, d) => s + (d.present ?? 0), 0);
  const totalAbsences = activeDays.reduce((s, d) => s + d.absent, 0);
  const totalAfternoonBoarded = activeDays.reduce((s, d) => s + d.afternoonBoarded, 0);
  const totalAfternoonDroppedOff = activeDays.reduce((s, d) => s + d.afternoonDroppedOff, 0);
  const loggedSessionsCount = activeDays.reduce(
    (s, d) => s + d.morningLoggedRoutes + d.afternoonLoggedRoutes,
    0
  );
  const expectedSessionsCount = activeDays.length * targetRoutes.length * 2;

  const avgAttendanceRate =
    totalExpectedRides > 0
      ? Math.round((totalPresentRides / totalExpectedRides) * 1000) / 10
      : 0;

  const routesWithRides = routeStats.filter((r) => r.totalExpectedRides > 0);
  const bestRoute =
    routesWithRides.length > 0
      ? [...routesWithRides].sort(
          (a, b) => b.attendanceRate - a.attendanceRate || b.totalPresent - a.totalPresent
        )[0]
      : null;

  const todayInPeriod = range.dates.includes(todayDate);
  const absenceReasonsToday = todayInPeriod
    ? getAbsenceReasonDistribution(targetStudents, records)
    : [];

  const totalRouteAbsent = routeStats.reduce((sum, r) => sum + r.totalAbsent, 0);
  const absenceByRoute: AbsenceReasonStat[] =
    totalRouteAbsent > 0
      ? routeStats
          .filter((r) => r.totalAbsent > 0)
          .sort((a, b) => b.totalAbsent - a.totalAbsent)
          .map((r) => ({
            name: `${r.code} (${r.totalAbsent} lượt)`,
            count: r.totalAbsent,
            percentage: Math.round((r.totalAbsent / totalRouteAbsent) * 100),
            color: r.color || '#f43f5e',
          }))
      : [];

  return {
    range,
    dailyRows,
    routeStats,
    summary: {
      avgAttendanceRate,
      totalExpectedRides,
      totalPresentRides,
      totalAbsences,
      totalAfternoonBoarded,
      totalAfternoonDroppedOff,
      activeDaysCount: activeDays.length,
      totalCalendarDays: range.dates.length,
      loggedSessionsCount,
      expectedSessionsCount,
      bestRoute,
    },
    absenceReasonsToday,
    absenceByRoute,
  };
};

// Backward-compatible legacy exports if referenced anywhere else
export const generateAttendanceTrendData = (
  students: Student[],
  routes: Route[],
  records: Record<string, CheckinRecord>,
  dbLogs: DatabaseSaveLog[] = []
): DailyTrendData[] => {
  const todayStr = getTodayDateString();
  const startDate = shiftDateStr(todayStr, -13);
  const range: PeriodDateRange = {
    mode: 'week',
    startDate,
    endDate: todayStr,
    dates: Array.from({ length: 14 }, (_, idx) => shiftDateStr(startDate, idx)),
    label: '14 ngày gần nhất',
  };
  const computed = computePeriodAnalytics({
    routes,
    students,
    records,
    dbLogs,
    todayDate: todayStr,
    range,
  });

  return computed.dailyRows
    .filter((d) => d.hasData)
    .map((d) => ({
      date: d.date,
      displayDate: d.displayDate,
      dayOfWeek: d.dayOfWeek,
      total: d.total,
      present: d.present ?? 0,
      absent: d.absent,
      late: d.late,
      attendanceRate: d.attendanceRate ?? 0,
      route1Rate: routes[0] ? d.routeRates[routes[0].id] ?? 0 : 0,
      route2Rate: routes[1] ? d.routeRates[routes[1].id] ?? 0 : 0,
      route3Rate: routes[2] ? d.routeRates[routes[2].id] ?? 0 : 0,
      onTimeArrivalMins: 0,
    }));
};

export const getRoutePerformanceStats = (
  routes: Route[],
  students: Student[],
  records: Record<string, CheckinRecord>
): RoutePerformanceData[] => {
  return routes.map((route) => {
    const routeStudents = students.filter((s) => s.routeId === route.id);
    const assigned = routeStudents.length;
    const presentToday = routeStudents.filter((s) => {
      const rec = records[s.id];
      return (
        rec?.morningPickupStatus === 'boarded' ||
        rec?.morningSchoolStatus === 'dropped_at_school'
      );
    }).length;

    const attendanceRate = assigned > 0 ? Math.round((presentToday / assigned) * 100) : 0;
    const occupancyRate = route.capacity > 0 ? Math.round((assigned / route.capacity) * 100) : 0;

    return {
      routeId: route.id,
      code: route.code,
      name: route.name,
      plateNumber: route.plateNumber,
      capacity: route.capacity,
      assignedStudents: assigned,
      presentToday,
      occupancyRate: Math.min(100, occupancyRate),
      attendanceRate,
      punctualityScore: 100,
      driverName: route.driverName,
    };
  });
};
