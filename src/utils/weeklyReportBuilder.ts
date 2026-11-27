import XLSXImport from 'xlsx-js-style';
import type { CellObject, CellStyle, WorkSheet } from 'xlsx-js-style';

const XLSX =
  (XLSXImport as unknown as { default?: typeof XLSXImport }).default || XLSXImport;
import { CheckinRecord, DatabaseSaveLog, Route, RouteSessionState, Student } from '../types';
import { sortRoutesByOrder } from './routeSort';
import {
  evaluateAfternoonCell,
  evaluateMorningCell,
  splitParentPhones,
} from './monthlySheetBuilder';
import { formatDateLocal, formatDisplayDateVi, formatShortDateVi, parseDateLocal } from '../services/analyticsService';

export type WeeklyCellMode = 'binary' | 'symbol' | 'blank';

export interface WeeklyDayMeta {
  dateStr: string; // YYYY-MM-DD
  dayLabel: string; // Thứ 2..Thứ 6
  shortDate: string; // DD/MM
}

export interface WeeklyStudentRow {
  tt: number;
  studentId: string;
  studentCode: string;
  name: string;
  className: string;
  fatherPhone: string;
  motherPhone: string;
  cells: Array<{
    dateStr: string;
    morning: string | number;
    afternoon: string | number;
  }>;
  note: string;
}

export interface WeeklyRouteSheetData {
  route: Route;
  busNumber: number | null;
  busCodeLabel: string; // e.g. "XE  01"
  headerTitle: string; // e.g. "PHIẾU ĐÓN TRẢ HỌC SINH - TUYẾN XE SỐ 1"
  sheetTabName: string; // e.g. "XE_01"
  driverName: string;
  driverPhone: string;
  startDateStr: string;
  endDateStr: string;
  startDateVi: string;
  endDateVi: string;
  weekLabel: string;
  blankDateFields: boolean;
  days: WeeklyDayMeta[];
  rows: WeeklyStudentRow[];
  dailyTotals: Array<{
    morning: number | '';
    afternoon: number | '';
  }>;
}

const WEEKDAY_LABELS = ['Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6'];

export function extractRouteNumber(route?: Route): number | null {
  if (!route) return null;
  const codeMatch = (route.code || '').match(/(\d+)/);
  if (codeMatch) return Number.parseInt(codeMatch[1], 10);
  const nameMatch = (route.name || '').match(/(\d+)/);
  if (nameMatch) return Number.parseInt(nameMatch[1], 10);
  return null;
}

export function formatWeeklySheetHeaderTitle(route: Route): string {
  const num = extractRouteNumber(route);
  if (num !== null) {
    return `PHIẾU ĐÓN TRẢ HỌC SINH - TUYẾN XE SỐ ${num}`;
  }
  return `PHIẾU ĐÓN TRẢ HỌC SINH - ${(route.code || route.name || '').toUpperCase()}`;
}

export function formatWeeklyBusCode(route: Route): string {
  const num = extractRouteNumber(route);
  if (num !== null) {
    return `XE  ${String(num).padStart(2, '0')}`;
  }
  return (route.code || 'XE').toUpperCase();
}

export function getIsoWeekNumber(dateStr: string): number {
  const d = parseDateLocal(dateStr);
  const utc = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = utc.getUTCDay() || 7;
  utc.setUTCDate(utc.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(utc.getUTCFullYear(), 0, 1));
  return Math.ceil(((utc.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

export function getWeekMonToFri(anchorDateStr: string): {
  startDate: string;
  endDate: string;
  days: WeeklyDayMeta[];
} {
  const anchor = parseDateLocal(anchorDateStr);
  const day = anchor.getDay(); // 0=Sun..6=Sat
  const diffToMonday = day === 0 ? -6 : 1 - day;
  const monday = new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate() + diffToMonday);

  const days: WeeklyDayMeta[] = WEEKDAY_LABELS.map((dayLabel, idx) => {
    const cur = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + idx);
    const dateStr = formatDateLocal(cur);
    return {
      dateStr,
      dayLabel,
      shortDate: formatShortDateVi(dateStr),
    };
  });

  return {
    startDate: days[0].dateStr,
    endDate: days[days.length - 1].dateStr,
    days,
  };
}

function formatCellByMode(rawVal: 1 | 0 | '', mode: WeeklyCellMode): string | number {
  if (mode === 'blank' || rawVal === '') return '';
  if (mode === 'binary') return rawVal;
  return rawVal === 1 ? '✓' : 'V';
}

export function buildWeeklyReportSheets({
  routes,
  students,
  dailyRecords = {},
  currentRecords = {},
  sessionStates = {},
  dbLogs = [],
  todayDate,
  anchorDate,
  routeFilterId = 'all',
  cellMode = 'binary',
  customWeekLabel,
  blankDateFields = false,
}: {
  routes: Route[];
  students: Student[];
  dailyRecords?: Record<string, Record<string, CheckinRecord>>;
  currentRecords?: Record<string, CheckinRecord>;
  sessionStates?: Record<string, RouteSessionState>;
  dbLogs?: DatabaseSaveLog[];
  todayDate: string;
  anchorDate: string;
  routeFilterId?: string;
  cellMode?: WeeklyCellMode;
  customWeekLabel?: string;
  blankDateFields?: boolean;
}): WeeklyRouteSheetData[] {
  const sortedRoutes = sortRoutesByOrder(routes);
  const targetRoutes =
    routeFilterId && routeFilterId !== 'all'
      ? sortedRoutes.filter((r) => r.id === routeFilterId)
      : sortedRoutes;

  const { startDate, endDate, days } = getWeekMonToFri(anchorDate);
  const isoWeek = getIsoWeekNumber(startDate);
  const weekLabel = customWeekLabel !== undefined ? customWeekLabel : String(isoWeek);

  // Build quick lookup of finalized sessions `${dateStr}|${routeId}|${sessionType}`
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

  // Merge currentRecords into effectiveDaily map for fast lookup
  const effectiveDaily: Record<string, Record<string, CheckinRecord>> = { ...dailyRecords };
  Object.entries(currentRecords).forEach(([studentId, rec]) => {
    const d = rec?.date || todayDate;
    if (!d) return;
    if (!effectiveDaily[d]) {
      effectiveDaily[d] = { [studentId]: rec };
    } else {
      effectiveDaily[d] = {
        ...effectiveDaily[d],
        [studentId]: { ...effectiveDaily[d][studentId], ...rec },
      };
    }
  });

  const usedTabNames = new Set<string>();

  return targetRoutes.map((route, routeIdx) => {
    const busNumber = extractRouteNumber(route);
    let sheetTabName =
      busNumber !== null
        ? `XE_${String(busNumber).padStart(2, '0')}`
        : (route.code || `Xe_${routeIdx + 1}`).replace(/[\\/?*[\]:]/g, '_').slice(0, 28);
    if (usedTabNames.has(sheetTabName)) {
      sheetTabName = `${sheetTabName}_${routeIdx + 1}`.slice(0, 31);
    }
    usedTabNames.add(sheetTabName);

    const routeStudents = students.filter((s) => s.routeId === route.id);

    const morningTotals = new Array<number>(days.length).fill(0);
    const morningHasAny = new Array<boolean>(days.length).fill(false);
    const afternoonTotals = new Array<number>(days.length).fill(0);
    const afternoonHasAny = new Array<boolean>(days.length).fill(false);

    const rows: WeeklyStudentRow[] = routeStudents.map((s, idx) => {
      const { fatherPhone, motherPhone } = splitParentPhones(s.parentPhone);
      const noteParts: string[] = [];
      if (cellMode !== 'blank' && s.notes) {
        noteParts.push(s.notes);
      }

      const cells = days.map((dMeta, dIdx) => {
        if (cellMode === 'blank') {
          return { dateStr: dMeta.dateStr, morning: '', afternoon: '' };
        }
        const rec = effectiveDaily[dMeta.dateStr]?.[s.id];
        const mDone = finalizedSessions.has(`${dMeta.dateStr}|${route.id}|morning`);
        const aDone = finalizedSessions.has(`${dMeta.dateStr}|${route.id}|afternoon`);

        const mRaw = evaluateMorningCell(rec, mDone);
        const aRaw = evaluateAfternoonCell(rec, aDone);

        if (mRaw !== '') {
          morningHasAny[dIdx] = true;
          if (mRaw === 1) morningTotals[dIdx]++;
        }
        if (aRaw !== '') {
          afternoonHasAny[dIdx] = true;
          if (aRaw === 1) afternoonTotals[dIdx]++;
        }

        if (rec?.parentExcusedReason) {
          noteParts.push(`${dMeta.dayLabel}: ${rec.parentExcusedReason}`);
        } else if (rec?.morningPickupNote) {
          noteParts.push(`${dMeta.dayLabel}: ${rec.morningPickupNote}`);
        }

        return {
          dateStr: dMeta.dateStr,
          morning: formatCellByMode(mRaw, cellMode),
          afternoon: formatCellByMode(aRaw, cellMode),
        };
      });

      const uniqueNotes = Array.from(new Set(noteParts.filter(Boolean)));

      return {
        tt: idx + 1,
        studentId: s.id,
        studentCode: s.code,
        name: s.name,
        className: s.class,
        fatherPhone,
        motherPhone,
        cells,
        note: uniqueNotes.join('; '),
      };
    });

    const dailyTotals = days.map((_, dIdx) => ({
      morning:
        cellMode !== 'blank' && morningHasAny[dIdx] ? morningTotals[dIdx] : ('' as const),
      afternoon:
        cellMode !== 'blank' && afternoonHasAny[dIdx] ? afternoonTotals[dIdx] : ('' as const),
    }));

    return {
      route,
      busNumber,
      busCodeLabel: formatWeeklyBusCode(route),
      headerTitle: formatWeeklySheetHeaderTitle(route),
      sheetTabName,
      driverName: route.driverName || 'Chưa cập nhật',
      driverPhone: route.driverPhone || '',
      startDateStr: startDate,
      endDateStr: endDate,
      startDateVi: formatDisplayDateVi(startDate),
      endDateVi: formatDisplayDateVi(endDate),
      weekLabel,
      blankDateFields,
      days,
      rows,
      dailyTotals,
    };
  });
}

const THIN_BORDER = {
  top: { style: 'thin', color: { rgb: '000000' } },
  bottom: { style: 'thin', color: { rgb: '000000' } },
  left: { style: 'thin', color: { rgb: '000000' } },
  right: { style: 'thin', color: { rgb: '000000' } },
};

function styledCell(
  value: string | number,
  style: CellStyle,
  type?: 's' | 'n'
): CellObject {
  const cellType: 's' | 'n' = type || (typeof value === 'number' ? 'n' : 's');
  return {
    v: value,
    t: cellType,
    s: style,
  };
}

function buildWorksheetForRoute(sheet: WeeklyRouteSheetData): WorkSheet {
  const baseFont = { name: 'Times New Roman', sz: 11, color: { rgb: '000000' } };
  const boldFont = { ...baseFont, bold: true };
  const titleFont = { name: 'Times New Roman', sz: 14, bold: true, color: { rgb: '000000' } };

  const titleStyle: CellStyle = {
    font: titleFont,
    alignment: { horizontal: 'center', vertical: 'center' },
  };

  const metaLeftStyle: CellStyle = {
    font: boldFont,
    alignment: { horizontal: 'left', vertical: 'center' },
  };

  const metaRightStyle: CellStyle = {
    font: boldFont,
    alignment: { horizontal: 'right', vertical: 'center' },
  };

  const headerStyle: CellStyle = {
    font: boldFont,
    border: THIN_BORDER,
    alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
  };

  const centerCellStyle: CellStyle = {
    font: baseFont,
    border: THIN_BORDER,
    alignment: { horizontal: 'center', vertical: 'center' },
  };

  const leftCellStyle: CellStyle = {
    font: baseFont,
    border: THIN_BORDER,
    alignment: { horizontal: 'left', vertical: 'center', wrapText: true },
  };

  const footerBoldCenterStyle: CellStyle = {
    font: boldFont,
    border: THIN_BORDER,
    alignment: { horizontal: 'center', vertical: 'center' },
  };

  const aoa: Array<Array<CellObject>> = [];

  // Row 0: Document Title (A1:P1)
  const titleRow: CellObject[] = Array.from({ length: 16 }, (_, c) =>
    styledCell(c === 0 ? sheet.headerTitle : '', titleStyle, 's')
  );
  aoa.push(titleRow);

  // Row 1: Meta Row (A2:I2 left driver info | J2:P2 right date/week info)
  const driverMetaText = `${sheet.busCodeLabel}      Lái Xe: ${sheet.driverName}${
    sheet.driverPhone ? `      ĐT:${sheet.driverPhone}` : ''
  }`;
  const dateMetaText = sheet.blankDateFields
    ? 'Từ ngày:      /      đến      /      Tuần:...........'
    : `Từ ngày: ${sheet.startDateVi}   đến   ${sheet.endDateVi}      Tuần: ${sheet.weekLabel || '........'}`;

  const metaRow: CellObject[] = Array.from({ length: 16 }, (_, c) => {
    if (c === 0) return styledCell(driverMetaText, metaLeftStyle, 's');
    if (c === 9) return styledCell(dateMetaText, metaRightStyle, 's');
    return styledCell('', c < 9 ? metaLeftStyle : metaRightStyle, 's');
  });
  aoa.push(metaRow);

  // Row 2 & Row 3: Table Headers (16 cols: 0..15)
  const headerRow1: CellObject[] = [
    styledCell('TT', headerStyle, 's'),
    styledCell('Họ và tên HS', headerStyle, 's'),
    styledCell('Lớp', headerStyle, 's'),
    styledCell('ĐT bố', headerStyle, 's'),
    styledCell('ĐT Mẹ', headerStyle, 's'),
    styledCell('Thứ 2', headerStyle, 's'),
    styledCell('', headerStyle, 's'),
    styledCell('Thứ 3', headerStyle, 's'),
    styledCell('', headerStyle, 's'),
    styledCell('Thứ 4', headerStyle, 's'),
    styledCell('', headerStyle, 's'),
    styledCell('Thứ 5', headerStyle, 's'),
    styledCell('', headerStyle, 's'),
    styledCell('Thứ 6', headerStyle, 's'),
    styledCell('', headerStyle, 's'),
    styledCell('Ghi chú', headerStyle, 's'),
  ];
  const headerRow2: CellObject[] = [
    styledCell('', headerStyle, 's'),
    styledCell('', headerStyle, 's'),
    styledCell('', headerStyle, 's'),
    styledCell('', headerStyle, 's'),
    styledCell('', headerStyle, 's'),
    styledCell('S', headerStyle, 's'),
    styledCell('C', headerStyle, 's'),
    styledCell('S', headerStyle, 's'),
    styledCell('C', headerStyle, 's'),
    styledCell('S', headerStyle, 's'),
    styledCell('C', headerStyle, 's'),
    styledCell('S', headerStyle, 's'),
    styledCell('C', headerStyle, 's'),
    styledCell('S', headerStyle, 's'),
    styledCell('C', headerStyle, 's'),
    styledCell('', headerStyle, 's'),
  ];
  aoa.push(headerRow1, headerRow2);

  // Student Rows
  sheet.rows.forEach((r) => {
    const rowCells: CellObject[] = [
      styledCell(r.tt, centerCellStyle, 'n'),
      styledCell(r.name, leftCellStyle, 's'),
      styledCell(r.className, centerCellStyle, 's'),
      styledCell(r.fatherPhone, centerCellStyle, 's'),
      styledCell(r.motherPhone, centerCellStyle, 's'),
    ];
    r.cells.forEach((c) => {
      rowCells.push(
        styledCell(c.morning, centerCellStyle),
        styledCell(c.afternoon, centerCellStyle)
      );
    });
    rowCells.push(styledCell(r.note, leftCellStyle, 's'));
    aoa.push(rowCells);
  });

  // Footer Row 1: Tổng: N Học sinh (col 0 blank, cols 1..3 merged)
  const totalRowIdx = aoa.length;
  const totalRow: CellObject[] = [
    styledCell('', centerCellStyle, 's'),
    styledCell(`Tổng: ${sheet.rows.length} Học sinh`, footerBoldCenterStyle, 's'),
    styledCell('', footerBoldCenterStyle, 's'),
    styledCell('', footerBoldCenterStyle, 's'),
    styledCell('', centerCellStyle, 's'),
  ];
  sheet.dailyTotals.forEach((dt) => {
    totalRow.push(
      styledCell(dt.morning, footerBoldCenterStyle),
      styledCell(dt.afternoon, footerBoldCenterStyle)
    );
  });
  totalRow.push(styledCell('', centerCellStyle, 's'));
  aoa.push(totalRow);

  // Footer Row 2: Lái xe ký tên (cols 0..3 merged)
  const driverSignRowIdx = aoa.length;
  const driverSignRow: CellObject[] = Array.from({ length: 16 }, (_, c) =>
    styledCell(c === 0 ? 'Lái xe ký tên' : '', c < 4 ? footerBoldCenterStyle : centerCellStyle, 's')
  );
  aoa.push(driverSignRow);

  // Footer Row 3: GT ký tên (cols 0..3 merged)
  const supSignRowIdx = aoa.length;
  const supSignRow: CellObject[] = Array.from({ length: 16 }, (_, c) =>
    styledCell(c === 0 ? 'GT ký tên' : '', c < 4 ? footerBoldCenterStyle : centerCellStyle, 's')
  );
  aoa.push(supSignRow);

  const ws = XLSX.utils.aoa_to_sheet(aoa);

  ws['!merges'] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: 15 } },
    { s: { r: 1, c: 0 }, e: { r: 1, c: 8 } },
    { s: { r: 1, c: 9 }, e: { r: 1, c: 15 } },
    // Header vertical merges
    { s: { r: 2, c: 0 }, e: { r: 3, c: 0 } },
    { s: { r: 2, c: 1 }, e: { r: 3, c: 1 } },
    { s: { r: 2, c: 2 }, e: { r: 3, c: 2 } },
    { s: { r: 2, c: 3 }, e: { r: 3, c: 3 } },
    { s: { r: 2, c: 4 }, e: { r: 3, c: 4 } },
    { s: { r: 2, c: 15 }, e: { r: 3, c: 15 } },
    // Day horizontal merges
    { s: { r: 2, c: 5 }, e: { r: 2, c: 6 } },
    { s: { r: 2, c: 7 }, e: { r: 2, c: 8 } },
    { s: { r: 2, c: 9 }, e: { r: 2, c: 10 } },
    { s: { r: 2, c: 11 }, e: { r: 2, c: 12 } },
    { s: { r: 2, c: 13 }, e: { r: 2, c: 14 } },
    // Footer merges
    { s: { r: totalRowIdx, c: 1 }, e: { r: totalRowIdx, c: 3 } },
    { s: { r: driverSignRowIdx, c: 0 }, e: { r: driverSignRowIdx, c: 3 } },
    { s: { r: supSignRowIdx, c: 0 }, e: { r: supSignRowIdx, c: 3 } },
  ];

  ws['!cols'] = [
    { wch: 4.5 }, // TT
    { wch: 24 }, // Họ và tên HS
    { wch: 7 }, // Lớp
    { wch: 13 }, // ĐT bố
    { wch: 13 }, // ĐT Mẹ
    { wch: 4.5 }, // T2 S
    { wch: 4.5 }, // T2 C
    { wch: 4.5 }, // T3 S
    { wch: 4.5 }, // T3 C
    { wch: 4.5 }, // T4 S
    { wch: 4.5 }, // T4 C
    { wch: 4.5 }, // T5 S
    { wch: 4.5 }, // T5 C
    { wch: 4.5 }, // T6 S
    { wch: 4.5 }, // T6 C
    { wch: 16 }, // Ghi chú
  ];

  ws['!rows'] = [
    { hpt: 24 }, // Title
    { hpt: 20 }, // Meta
    { hpt: 19 }, // Header 1
    { hpt: 18 }, // Header 2
    ...sheet.rows.map(() => ({ hpt: 20 })),
    { hpt: 26 }, // Tổng
    { hpt: 36 }, // Lái xe ký tên
    { hpt: 36 }, // GT ký tên
  ];

  ws['!pageSetup'] = {
    orientation: 'landscape',
    paperSize: 9,
    fitToWidth: 1,
    fitToHeight: 1,
  };

  return ws;
}

export function exportWeeklyReportToExcel(
  sheets: WeeklyRouteSheetData[],
  fileName: string
): void {
  const wb = XLSX.utils.book_new();
  sheets.forEach((sheet) => {
    const ws = buildWorksheetForRoute(sheet);
    XLSX.utils.book_append_sheet(wb, ws, sheet.sheetTabName);
  });
  XLSX.writeFile(wb, fileName.endsWith('.xlsx') ? fileName : `${fileName}.xlsx`);
}
