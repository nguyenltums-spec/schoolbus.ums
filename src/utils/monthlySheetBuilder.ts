import { CheckinRecord, DatabaseSaveLog, Route, RouteSessionState, Student } from '../types';
import { sortRoutesByOrder } from './routeSort';

export type MonthlyCellValue = 1 | 0 | '';

export interface MonthlyDayMeta {
  day: number;
  dateStr: string; // YYYY-MM-DD
  dowLabel: string; // CN, T2, T3, T4, T5, T6, T7
  headerLabel: string; // e.g. "CN (01)" or "T2 (02)"
  isWeekend: boolean;
}

export interface MonthlyStudentRow {
  tt: number;
  studentId: string;
  studentCode: string;
  name: string;
  className: string;
  fatherPhone: string;
  motherPhone: string;
  routeId: string;
  routeCode: string;
  routeLabel: string; // e.g. "Xe 1"
  driverInfo: string; // e.g. "Nguyễn Văn A / 0912345678"
  days: Array<{
    day: number;
    dateStr: string;
    isWeekend: boolean;
    morning: MonthlyCellValue;
    afternoon: MonthlyCellValue;
  }>;
  totalMorning: number;
  totalAfternoon: number;
  totalAll: number;
}

export interface MonthlyAttendanceMatrix {
  year: number;
  month: number; // 1..12
  monthKey: string; // YYYY-MM
  sheetTitle: string; // e.g. Thang_11_2026
  days: MonthlyDayMeta[];
  rows: MonthlyStudentRow[];
  recordedDatesCount: number;
}

const DOW_LABELS = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];

export function formatRouteBusLabel(route?: Route): string {
  if (!route) return '';
  const code = (route.code || '').trim();
  const match = code.match(/(\d+)/);
  if (match) {
    return `Xe ${Number.parseInt(match[1], 10)}`;
  }
  const nameMatch = (route.name || '').match(/(\d+)/);
  if (nameMatch) {
    return `Xe ${Number.parseInt(nameMatch[1], 10)}`;
  }
  return code || route.name;
}

export function formatDriverPhoneInfo(route?: Route): string {
  if (!route) return '';
  const name = (route.driverName || '').trim();
  const phone = (route.driverPhone || '').trim();
  if (name && phone) return `${name} / ${phone}`;
  return name || phone || '';
}

export function splitParentPhones(rawPhone?: string): {
  fatherPhone: string;
  motherPhone: string;
} {
  const clean = (rawPhone || '').trim();
  if (!clean) return { fatherPhone: '', motherPhone: '' };
  const parts = clean
    .split(/[/,;|]+|\s+-\s+/)
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length >= 2) {
    return { fatherPhone: parts[0], motherPhone: parts[1] };
  }
  return { fatherPhone: clean, motherPhone: '' };
}

export function getMonthDaysMeta(year: number, month: number): MonthlyDayMeta[] {
  const daysInMonth = new Date(year, month, 0).getDate();
  const mm = String(month).padStart(2, '0');
  const days: MonthlyDayMeta[] = [];

  for (let d = 1; d <= daysInMonth; d++) {
    const dd = String(d).padStart(2, '0');
    const dateObj = new Date(year, month - 1, d);
    const dow = dateObj.getDay(); // 0=CN..6=T7
    const dowLabel = DOW_LABELS[dow];
    const isWeekend = dow === 0 || dow === 6;
    days.push({
      day: d,
      dateStr: `${year}-${mm}-${dd}`,
      dowLabel,
      headerLabel: `${dowLabel} (${dd})`,
      isWeekend,
    });
  }
  return days;
}

export function evaluateMorningCell(
  rec: CheckinRecord | undefined,
  isRouteMorningFinalized: boolean
): MonthlyCellValue {
  if (rec) {
    if (
      rec.morningPickupStatus === 'boarded' ||
      rec.morningSchoolStatus === 'dropped_at_school'
    ) {
      return 1;
    }
    if (rec.morningPickupStatus === 'absent' || rec.morningPickupStatus === 'late') {
      return 0;
    }
  }
  return isRouteMorningFinalized ? 0 : '';
}

export function evaluateAfternoonCell(
  rec: CheckinRecord | undefined,
  isRouteAfternoonFinalized: boolean
): MonthlyCellValue {
  if (rec) {
    if (
      rec.afternoonBoardStatus === 'boarded' ||
      rec.afternoonDropoffStatus === 'dropped_off'
    ) {
      return 1;
    }
    if (rec.afternoonBoardStatus === 'absent' || rec.afternoonBoardStatus === 'missing') {
      return 0;
    }
  }
  return isRouteAfternoonFinalized ? 0 : '';
}

export function buildMonthlyAttendanceMatrix({
  year,
  month,
  routes,
  students,
  dailyRecords = {},
  currentRecords = {},
  sessionStates = {},
  dbLogs = [],
  todayDate,
  routeFilterId = 'all',
}: {
  year: number;
  month: number;
  routes: Route[];
  students: Student[];
  dailyRecords?: Record<string, Record<string, CheckinRecord>>;
  currentRecords?: Record<string, CheckinRecord>;
  sessionStates?: Record<string, RouteSessionState>;
  dbLogs?: DatabaseSaveLog[];
  todayDate?: string;
  routeFilterId?: string;
}): MonthlyAttendanceMatrix {
  const sortedRoutes = sortRoutesByOrder(routes);
  const routeOrderMap = new Map(sortedRoutes.map((r, idx) => [r.id, idx]));
  const routeById = new Map(sortedRoutes.map((r) => [r.id, r]));

  const days = getMonthDaysMeta(year, month);
  const mm = String(month).padStart(2, '0');
  const monthKey = `${year}-${mm}`;
  const sheetTitle = `Thang_${mm}_${year}`;

  // Build quick lookup of finalized sessions by `${dateStr}|${routeId}|${sessionType}`
  const finalizedSessions = new Set<string>();
  dbLogs.forEach((log) => {
    if (log.date && log.routeId && log.sessionType) {
      finalizedSessions.add(`${log.date}|${log.routeId}|${log.sessionType}`);
    }
  });
  Object.values(sessionStates).forEach((st) => {
    if (!st?.date || !st?.routeId) return;
    if (st.morningLocked || st.morningReportSubmitted) {
      finalizedSessions.add(`${st.date}|${st.routeId}|morning`);
    }
    if (st.afternoonLocked || st.afternoonReportSubmitted || st.afternoonDropoffConfirmed) {
      finalizedSessions.add(`${st.date}|${st.routeId}|afternoon`);
    }
  });

  // Also index currentRecords by their date (fallback if dailyRecords doesn't have today yet)
  const effectiveDaily: Record<string, Record<string, CheckinRecord>> = { ...dailyRecords };
  Object.entries(currentRecords).forEach(([studentId, rec]) => {
    const d = rec?.date || todayDate;
    if (!d || !d.startsWith(monthKey)) return;
    if (!effectiveDaily[d]) effectiveDaily[d] = {};
    if (!effectiveDaily[d][studentId]) {
      effectiveDaily[d][studentId] = rec;
    } else {
      // Prefer whichever was updated more recently or already has status
      effectiveDaily[d] = {
        ...effectiveDaily[d],
        [studentId]: { ...effectiveDaily[d][studentId], ...rec },
      };
    }
  });

  const targetStudents = students
    .filter((s) => routeFilterId === 'all' || s.routeId === routeFilterId)
    .sort((a, b) => {
      const rA = routeOrderMap.get(a.routeId) ?? 9999;
      const rB = routeOrderMap.get(b.routeId) ?? 9999;
      if (rA !== rB) return rA - rB;
      return 0;
    });

  const recordedDatesSet = new Set<string>();

  const rows: MonthlyStudentRow[] = targetStudents.map((s, idx) => {
    const route = routeById.get(s.routeId);
    const { fatherPhone, motherPhone } = splitParentPhones(s.parentPhone);
    let totalMorning = 0;
    let totalAfternoon = 0;

    const studentDays = days.map((dayMeta) => {
      if (dayMeta.isWeekend) {
        return {
          day: dayMeta.day,
          dateStr: dayMeta.dateStr,
          isWeekend: true,
          morning: '' as const,
          afternoon: '' as const,
        };
      }

      const rec = effectiveDaily[dayMeta.dateStr]?.[s.id];
      const morningDone = finalizedSessions.has(`${dayMeta.dateStr}|${s.routeId}|morning`);
      const afternoonDone = finalizedSessions.has(`${dayMeta.dateStr}|${s.routeId}|afternoon`);

      const morning = evaluateMorningCell(rec, morningDone);
      const afternoon = evaluateAfternoonCell(rec, afternoonDone);

      if (morning !== '' || afternoon !== '') {
        recordedDatesSet.add(dayMeta.dateStr);
      }
      if (morning === 1) totalMorning++;
      if (afternoon === 1) totalAfternoon++;

      return {
        day: dayMeta.day,
        dateStr: dayMeta.dateStr,
        isWeekend: false,
        morning,
        afternoon,
      };
    });

    return {
      tt: idx + 1,
      studentId: s.id,
      studentCode: s.code,
      name: s.name,
      className: s.class,
      fatherPhone,
      motherPhone,
      routeId: s.routeId,
      routeCode: route?.code || '',
      routeLabel: formatRouteBusLabel(route),
      driverInfo: formatDriverPhoneInfo(route),
      days: studentDays,
      totalMorning,
      totalAfternoon,
      totalAll: totalMorning + totalAfternoon,
    };
  });

  return {
    year,
    month,
    monthKey,
    sheetTitle,
    days,
    rows,
    recordedDatesCount: recordedDatesSet.size,
  };
}

export function exportMonthlyAttendanceCSV(matrix: MonthlyAttendanceMatrix): string {
  const esc = (v: string | number) => `"${String(v ?? '').replace(/"/g, '""')}"`;

  const row1: string[] = [
    'TT',
    'Họ và tên HS',
    'Lớp',
    'ĐT bố',
    'X.Tuyến',
    'Lái xe/ĐT',
    'ĐT Mẹ',
  ];
  const row2: string[] = ['', '', '', '', '', '', ''];

  matrix.days.forEach((d) => {
    row1.push(d.headerLabel, '');
    row2.push('S', 'C');
  });

  row1.push('Tổng S', 'Tổng C', 'Tổng lượt');
  row2.push('', '', '');

  const dataLines = matrix.rows.map((r) => {
    const cells: Array<string | number> = [
      r.tt,
      r.name,
      r.className,
      r.fatherPhone,
      r.routeLabel,
      r.driverInfo,
      r.motherPhone,
    ];
    r.days.forEach((d) => {
      cells.push(d.morning, d.afternoon);
    });
    cells.push(r.totalMorning, r.totalAfternoon, r.totalAll);
    return cells.map(esc).join(',');
  });

  return '\uFEFF' + [row1.map(esc).join(','), row2.map(esc).join(','), ...dataLines].join('\r\n');
}
