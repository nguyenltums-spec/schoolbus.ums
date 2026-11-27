import { Route, Student, CheckinRecord, RouteSessionState, AppNotification, GoogleSheetsConfig, ZaloConfig, DatabaseSaveLog } from '../types';
import { INITIAL_ROUTES, INITIAL_STUDENTS, createInitialRecords, INITIAL_ROUTE_SESSIONS, INITIAL_NOTIFICATIONS } from './defaultData';
import { getSessionTransfer } from '../utils/transferHelpers';
import {
  MonthlyAttendanceMatrix,
  evaluateAfternoonCell,
  evaluateMorningCell,
  formatDriverPhoneInfo,
  formatRouteBusLabel,
  getMonthDaysMeta,
  splitParentPhones,
} from '../utils/monthlySheetBuilder';

const STORAGE_KEYS = {
  ROUTES: 'schoolbus_routes_v1',
  STUDENTS: 'schoolbus_students_v1',
  RECORDS: 'schoolbus_records_v1',
  SESSIONS: 'schoolbus_sessions_v1',
  NOTIFICATIONS: 'schoolbus_notifications_v1',
  SHEETS_CONFIG: 'schoolbus_sheets_config_v1',
  ZALO_CONFIG: 'schoolbus_zalo_config_v1',
  DB_LOGS: 'schoolbus_db_logs_v1',
};

export const getStoredRoutes = (): Route[] => {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.ROUTES);
    if (raw) return JSON.parse(raw);
  } catch (e) {
    console.error('Error loading routes', e);
  }
  return INITIAL_ROUTES;
};

export const saveStoredRoutes = (routes: Route[]) => {
  try {
    localStorage.setItem(STORAGE_KEYS.ROUTES, JSON.stringify(routes));
  } catch (e) {
    console.error('Error saving routes', e);
  }
};

export const getStoredStudents = (): Student[] => {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.STUDENTS);
    if (raw) return JSON.parse(raw);
  } catch (e) {
    console.error('Error loading students', e);
  }
  return INITIAL_STUDENTS;
};

export const saveStoredStudents = (students: Student[]) => {
  try {
    localStorage.setItem(STORAGE_KEYS.STUDENTS, JSON.stringify(students));
  } catch (e) {
    console.error('Error saving students', e);
  }
};

export const getStoredRecords = (students: Student[]): Record<string, CheckinRecord> => {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.RECORDS);
    if (raw) return JSON.parse(raw);
  } catch (e) {
    console.error('Error loading records', e);
  }
  return createInitialRecords(students);
};

export const saveStoredRecords = (records: Record<string, CheckinRecord>) => {
  try {
    localStorage.setItem(STORAGE_KEYS.RECORDS, JSON.stringify(records));
  } catch (e) {
    console.error('Error saving records', e);
  }
};

export const getStoredSessions = (): Record<string, RouteSessionState> => {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.SESSIONS);
    if (raw) return JSON.parse(raw);
  } catch (e) {
    console.error('Error loading sessions', e);
  }
  return INITIAL_ROUTE_SESSIONS;
};

export const saveStoredSessions = (sessions: Record<string, RouteSessionState>) => {
  try {
    localStorage.setItem(STORAGE_KEYS.SESSIONS, JSON.stringify(sessions));
  } catch (e) {
    console.error('Error saving sessions', e);
  }
};

export const getStoredNotifications = (): AppNotification[] => {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.NOTIFICATIONS);
    if (raw) return JSON.parse(raw);
  } catch (e) {
    console.error('Error loading notifications', e);
  }
  return INITIAL_NOTIFICATIONS;
};

export const saveStoredNotifications = (notifications: AppNotification[]) => {
  try {
    localStorage.setItem(STORAGE_KEYS.NOTIFICATIONS, JSON.stringify(notifications));
  } catch (e) {
    console.error('Error saving notifications', e);
  }
};

export const getStoredSheetsConfig = (): GoogleSheetsConfig => {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.SHEETS_CONFIG);
    if (raw) return JSON.parse(raw);
  } catch (e) {
    console.error('Error loading sheets config', e);
  }
  return {
    webhookUrl: '',
    sheetName: 'DiemDanhXeTuyen',
    autoSync: false,
  };
};

export const saveStoredSheetsConfig = (cfg: GoogleSheetsConfig) => {
  try {
    localStorage.setItem(STORAGE_KEYS.SHEETS_CONFIG, JSON.stringify(cfg));
  } catch (e) {
    console.error('Error saving sheets config', e);
  }
};

export const DEFAULT_ZALO_CONFIG: ZaloConfig = {
  enabled: false,
  deliveryMode: 'zalo_oa',
  webhookUrl: '',
  defaultRecipientIds: '',
  routeRecipientIds: {},
  notifyOnStopArrival: true,
  notifyOnDriverReport: true,
  notifyOnSupervisorLock: true,
  notifyOnParentAbsence: true,
  notifyOnEmptyBus: true,
};

export const getStoredZaloConfig = (): ZaloConfig => {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.ZALO_CONFIG);
    if (raw) {
      return { ...DEFAULT_ZALO_CONFIG, ...JSON.parse(raw) };
    }
  } catch (e) {
    console.error('Error loading zalo config', e);
  }
  return { ...DEFAULT_ZALO_CONFIG };
};

export const saveStoredZaloConfig = (cfg: ZaloConfig) => {
  try {
    localStorage.setItem(STORAGE_KEYS.ZALO_CONFIG, JSON.stringify(cfg));
  } catch (e) {
    console.error('Error saving zalo config', e);
  }
};

export const getStoredDbLogs = (): DatabaseSaveLog[] => {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.DB_LOGS);
    if (raw) return JSON.parse(raw);
  } catch (e) {
    console.error('Error loading db logs', e);
  }
  return [];
};

export const saveStoredDbLogs = (logs: DatabaseSaveLog[]) => {
  try {
    localStorage.setItem(STORAGE_KEYS.DB_LOGS, JSON.stringify(logs));
  } catch (e) {
    console.error('Error saving db logs', e);
  }
};

export const resetAllData = () => {
  localStorage.removeItem(STORAGE_KEYS.ROUTES);
  localStorage.removeItem(STORAGE_KEYS.STUDENTS);
  localStorage.removeItem(STORAGE_KEYS.RECORDS);
  localStorage.removeItem(STORAGE_KEYS.SESSIONS);
  localStorage.removeItem(STORAGE_KEYS.NOTIFICATIONS);
  localStorage.removeItem(STORAGE_KEYS.DB_LOGS);
};

export interface LocalSafetySnapshot {
  savedAt: string;
  routes: Route[];
  students: Student[];
  records: Record<string, CheckinRecord>;
  sessionStates: Record<string, RouteSessionState>;
  sheetsConfig: GoogleSheetsConfig;
}

const SAFETY_SNAPSHOT_KEY = 'schoolbus_local_safety_snapshot_v1';

export const getLocalSafetySnapshot = (): LocalSafetySnapshot | null => {
  try {
    const raw = localStorage.getItem(SAFETY_SNAPSHOT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as LocalSafetySnapshot;
    if (Array.isArray(parsed?.routes) && Array.isArray(parsed?.students)) {
      return parsed;
    }
  } catch {
    // Ignore parse error
  }
  return null;
};

export const saveLocalSafetySnapshot = (snapshot: LocalSafetySnapshot) => {
  try {
    localStorage.setItem(SAFETY_SNAPSHOT_KEY, JSON.stringify(snapshot));
  } catch {
    // Ignore quota errors
  }
};

export const clearLocalSafetySnapshot = () => {
  try {
    localStorage.removeItem(SAFETY_SNAPSHOT_KEY);
  } catch {
    // Ignore
  }
};

/**
 * Generate CSV data with UTF-8 BOM for Microsoft Excel Vietnamese compatibility
 */
export const exportRecordsToCSV = (
  students: Student[],
  routes: Route[],
  records: Record<string, CheckinRecord>,
  dateStr: string
): string => {
  const routeMap = new Map(routes.map(r => [r.id, r]));
  const headers = [
    'Mã học sinh',
    'Họ và tên',
    'Lớp',
    'Tuyến xe',
    'Điểm đón/trả',
    'Sáng - Lên xe',
    'Sáng - Giờ lên',
    'Sáng - Vào trường',
    'Sáng - Giờ vào trường',
    'Chiều - Lên xe trường',
    'Chiều - Giờ lên',
    'Chiều - Xuống điểm',
    'Chiều - Giờ xuống',
    'Ghi chú / Lý do vắng',
    'SĐT Phụ huynh',
  ];

  const rows = students.map(s => {
    const route = routeMap.get(s.routeId);
    const stop = route?.stops.find(st => st.id === s.stopId);
    const rec = records[s.id];

    const morningPickup = rec?.morningPickupStatus === 'boarded'
      ? 'Đã lên xe'
      : rec?.morningPickupStatus === 'absent'
      ? 'Vắng / Nghỉ'
      : rec?.morningPickupStatus === 'late'
      ? 'Đến muộn/Tự túc'
      : 'Chưa điểm danh';

    const morningSchool = rec?.morningSchoolStatus === 'dropped_at_school'
      ? 'Đã vào trường'
      : rec?.morningSchoolStatus === 'missing'
      ? 'CẢNH BÁO: CHƯA VÀO TRƯỜNG'
      : 'Chờ kiểm tra';

    const afternoonBoard = rec?.afternoonBoardStatus === 'boarded'
      ? 'Đã lên xe về'
      : rec?.afternoonBoardStatus === 'absent'
      ? 'PH đón tại trường'
      : 'Chờ lên xe';

    const afternoonDrop = rec?.afternoonDropoffStatus === 'dropped_off'
      ? 'Đã trả tại điểm'
      : 'Chưa trả';

    const escapeCsv = (val: string) => `"${(val || '').replace(/"/g, '""')}"`;

    const morningT = getSessionTransfer(rec, 'morning');
    const afternoonT = getSessionTransfer(rec, 'afternoon');
    const morningTag = morningT
      ? `[Sáng: ${morningT.status === 'accepted' ? 'Đi nhờ' : morningT.status === 'pending_accept' ? 'Chờ nhận' : 'Từ chối'} xe ${routeMap.get(morningT.toRouteId)?.code || morningT.toRouteId}] `
      : '';
    const afternoonTag = afternoonT
      ? `[Chiều: ${afternoonT.status === 'accepted' ? 'Đi nhờ' : afternoonT.status === 'pending_accept' ? 'Chờ nhận' : 'Từ chối'} xe ${routeMap.get(afternoonT.toRouteId)?.code || afternoonT.toRouteId}] `
      : '';
    const transferTag = `${morningTag}${afternoonTag}`;

    return [
      escapeCsv(s.code),
      escapeCsv(s.name),
      escapeCsv(s.class),
      escapeCsv(route ? `${route.code} - ${route.name}` : ''),
      escapeCsv(stop ? stop.name : ''),
      escapeCsv(morningPickup),
      escapeCsv(rec?.morningPickupTime || ''),
      escapeCsv(morningSchool),
      escapeCsv(rec?.morningSchoolTime || ''),
      escapeCsv(afternoonBoard),
      escapeCsv(rec?.afternoonBoardTime || ''),
      escapeCsv(afternoonDrop),
      escapeCsv(rec?.afternoonDropoffTime || ''),
      escapeCsv(`${transferTag}${rec?.parentExcusedReason || rec?.morningPickupNote || s.notes || ''}`),
      escapeCsv(s.parentPhone),
    ].join(',');
  });

  // \uFEFF is UTF-8 Byte Order Mark for Excel
  return '\uFEFF' + [headers.join(','), ...rows].join('\r\n');
};

export interface MonthlyDayStudentItem {
  code: string;
  name: string;
  className: string;
  fatherPhone: string;
  motherPhone: string;
  routeLabel: string;
  driverInfo: string;
  value: 1 | 0 | '';
}

export interface MonthlyDayUpdatePayload {
  year: number;
  month: number;
  day: number;
  date: string;
  isWeekend: boolean;
  sessionType: 'morning' | 'afternoon';
  monthlySheetName: string;
  daysHeader: Array<{
    day: number;
    headerLabel: string;
    isWeekend: boolean;
  }>;
  students: MonthlyDayStudentItem[];
}

export interface GoogleSheetSyncPayload {
  event: string;
  date: string;
  sessionType?: 'morning' | 'afternoon';
  sheetName?: string;
  routeCode: string;
  lockedBy?: string;
  totalStudents: number;
  presentMorning: number;
  absentMorning: number;
  recordsSummary: Array<{
    code: string;
    name: string;
    class: string;
    morningStatus: string;
    schoolStatus: string;
    afternoonStatus: string;
    notes: string;
  }>;
  monthlyDayUpdate?: MonthlyDayUpdatePayload;
  monthlyMatrix?: {
    year: number;
    month: number;
    monthlySheetName: string;
    days: Array<{
      day: number;
      headerLabel: string;
      isWeekend: boolean;
    }>;
    rows: Array<{
      tt: number;
      name: string;
      className: string;
      fatherPhone: string;
      routeLabel: string;
      driverInfo: string;
      motherPhone: string;
      values: Array<1 | 0 | ''>;
    }>;
  };
}

export const buildMonthlyMatrixGoogleSheetPayload = (
  matrix: MonthlyAttendanceMatrix,
  lockedBy?: string
): GoogleSheetSyncPayload => {
  return {
    event: 'SYNC_MONTHLY_MATRIX',
    date: `${matrix.monthKey}-01`,
    routeCode: 'ALL_ROUTES',
    lockedBy: lockedBy || 'Quản trị viên',
    totalStudents: matrix.rows.length,
    presentMorning: matrix.rows.reduce((sum, r) => sum + r.totalMorning, 0),
    absentMorning: 0,
    recordsSummary: [],
    monthlyMatrix: {
      year: matrix.year,
      month: matrix.month,
      monthlySheetName: matrix.sheetTitle,
      days: matrix.days.map((d) => ({
        day: d.day,
        headerLabel: d.headerLabel,
        isWeekend: d.isWeekend,
      })),
      rows: matrix.rows.map((r) => ({
        tt: r.tt,
        name: r.name,
        className: r.className,
        fatherPhone: r.fatherPhone,
        routeLabel: r.routeLabel,
        driverInfo: r.driverInfo,
        motherPhone: r.motherPhone,
        values: r.days.flatMap((d) => [d.morning, d.afternoon]),
      })),
    },
  };
};

export const buildRouteGoogleSheetPayload = ({
  route,
  students,
  records,
  date,
  sessionType,
  lockedBy,
  sheetName,
}: {
  route: Route;
  students: Student[];
  records: Record<string, CheckinRecord>;
  date: string;
  sessionType: 'morning' | 'afternoon';
  lockedBy?: string;
  sheetName?: string;
}): GoogleSheetSyncPayload => {
  const nativeStudents = students.filter((s) => s.routeId === route.id);
  const activeBusRiders = students.filter((s) => {
    const rec = records[s.id];
    const inThisRoute = s.routeId === route.id;
    const tr = getSessionTransfer(rec, sessionType);
    const transferredOutAccepted =
      tr?.fromRouteId === route.id && tr?.status === 'accepted';
    const transferredInAccepted =
      tr?.toRouteId === route.id && tr?.status === 'accepted';
    return (inThisRoute && !transferredOutAccepted) || transferredInAccepted;
  });

  const translateMorning = (st?: string) =>
    st === 'boarded'
      ? 'Đã lên xe'
      : st === 'absent'
      ? 'Vắng / Nghỉ'
      : st === 'late'
      ? 'Đến muộn'
      : 'Chờ đón';

  const translateSchool = (st?: string) =>
    st === 'dropped_at_school'
      ? 'Đã vào trường'
      : st === 'missing'
      ? 'Chưa vào trường'
      : 'Chờ kiểm tra';

  const translateAfternoon = (rec?: CheckinRecord) => {
    if (rec?.afternoonDropoffStatus === 'dropped_off') return 'Đã trả về nhà';
    if (rec?.afternoonBoardStatus === 'boarded') return 'Đã lên xe về';
    if (rec?.afternoonBoardStatus === 'absent') return 'PH đón tại trường';
    return 'Chưa lên xe chiều';
  };

  const presentCount =
    sessionType === 'morning'
      ? activeBusRiders.filter(
          (s) => records[s.id]?.morningSchoolStatus === 'dropped_at_school'
        ).length
      : activeBusRiders.filter(
          (s) =>
            records[s.id]?.afternoonBoardStatus === 'boarded' ||
            records[s.id]?.afternoonDropoffStatus === 'dropped_off'
        ).length;

  const absentCount =
    sessionType === 'morning'
      ? activeBusRiders.filter(
          (s) => records[s.id]?.morningPickupStatus === 'absent'
        ).length
      : activeBusRiders.filter(
          (s) => records[s.id]?.afternoonBoardStatus === 'absent'
        ).length;

  const recordsSummary = activeBusRiders.map((s) => {
    const rec = records[s.id];
    const tr = getSessionTransfer(rec, sessionType);
    const isTransferredIn = tr?.toRouteId === route.id && tr?.status === 'accepted';
    const noteBase =
      sessionType === 'morning'
        ? rec?.morningPickupNote || rec?.parentExcusedReason || s.notes || ''
        : rec?.afternoonNote || rec?.parentExcusedReason || s.notes || '';
    return {
      code: s.code,
      name: s.name,
      class: s.class,
      morningStatus: translateMorning(rec?.morningPickupStatus),
      schoolStatus: translateSchool(rec?.morningSchoolStatus),
      afternoonStatus: translateAfternoon(rec),
      notes: `${isTransferredIn ? '[Đi nhờ] ' : ''}${noteBase}`.trim(),
    };
  });

  // Build incremental monthly update for the date (Mon-Fri only, Sat/Sun empty)
  const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date || '');
  const nowObj = new Date();
  const year = dateMatch ? Number(dateMatch[1]) : nowObj.getFullYear();
  const month = dateMatch ? Number(dateMatch[2]) : nowObj.getMonth() + 1;
  const day = dateMatch ? Number(dateMatch[3]) : nowObj.getDate();
  const dateObj = new Date(year, month - 1, day);
  const dow = dateObj.getDay();
  const isWeekend = dow === 0 || dow === 6;
  const mm = String(month).padStart(2, '0');
  const routeLabel = formatRouteBusLabel(route);
  const driverInfo = formatDriverPhoneInfo(route);
  const daysHeader = getMonthDaysMeta(year, month).map((d) => ({
    day: d.day,
    headerLabel: d.headerLabel,
    isWeekend: d.isWeekend,
  }));

  const monthlyStudents: MonthlyDayStudentItem[] = nativeStudents.map((s) => {
    const rec = records[s.id];
    const { fatherPhone, motherPhone } = splitParentPhones(s.parentPhone);
    const val: 1 | 0 | '' = isWeekend
      ? ''
      : sessionType === 'morning'
      ? evaluateMorningCell(rec, true)
      : evaluateAfternoonCell(rec, true);
    return {
      code: s.code,
      name: s.name,
      className: s.class,
      fatherPhone,
      motherPhone,
      routeLabel,
      driverInfo,
      value: val,
    };
  });

  return {
    event:
      sessionType === 'morning' ? 'LOCK_MORNING_SESSION' : 'LOCK_AFTERNOON_SESSION',
    date,
    sessionType,
    sheetName,
    routeCode: `${route.code} (${sessionType === 'morning' ? 'Sáng' : 'Chiều'})`,
    lockedBy: lockedBy || 'Hệ thống',
    totalStudents: activeBusRiders.length,
    presentMorning: presentCount,
    absentMorning: absentCount,
    recordsSummary,
    monthlyDayUpdate: {
      year,
      month,
      day,
      date,
      isWeekend,
      sessionType,
      monthlySheetName: `Thang_${mm}_${year}`,
      daysHeader,
      students: monthlyStudents,
    },
  };
};

/**
 * Triggers sync to Google Sheets via backend proxy (/api/google-sheets/sync)
 * so real HTTP status codes (e.g. 401 permission error) and Apps Script JSON responses are accurately reported.
 */
export const syncToGoogleSheets = async (
  webhookUrl: string,
  payload: GoogleSheetSyncPayload
): Promise<{ ok: boolean; message: string; errorCode?: string }> => {
  const trimmed = (webhookUrl || '').trim();
  if (!trimmed || !trimmed.startsWith('http')) {
    throw new Error('Vui lòng nhập đường dẫn Google Apps Script Webhook URL hợp lệ');
  }

  const res = await fetch('/api/google-sheets/sync', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      webhookUrl: trimmed,
      payload,
      updateLastSynced: payload.event !== 'TEST_CONNECTION',
    }),
  });

  const data = (await res.json().catch(() => null)) as
    | { ok?: boolean; message?: string; errorCode?: string }
    | null;

  if (!res.ok || !data?.ok) {
    const err = new Error(
      data?.message || 'Không thể đồng bộ dữ liệu lên Google Sheet.'
    ) as Error & { errorCode?: string };
    err.errorCode = data?.errorCode;
    throw err;
  }

  return {
    ok: true,
    message: data.message || 'Đã đồng bộ dữ liệu lên Google Sheet thành công!',
  };
};

/**
 * Ready-to-use Google Apps Script code template (supports Daily Log Sheet + Monthly S/C 1/0 Matrix Sheet)
 */
export const GOOGLE_APPS_SCRIPT_TEMPLATE = `// ========================================================
// MÃ NGUỒN GOOGLE APPS SCRIPT - SCHOOLBUS PRO (TỰ ĐỘNG LƯU CẢ SHEET NGÀY & SHEET THÁNG)
// 1. Mở file Google Sheets -> Tiện ích mở rộng (Extensions) -> Apps Script
// 2. Dán toàn bộ mã nguồn dưới đây vào Code.gs (thay thế mã cũ)
// 3. Nhấn "Triển khai" (Deploy) -> "Quản lý các lần triển khai" -> Chỉnh sửa (Edit)
//    -> Chọn "Phiên bản mới" (New version) -> Người có quyền truy cập: "Bất kỳ ai" (Anyone)
//    -> Nhấn "Triển khai" (Deploy)
// ========================================================

function doGet(e) {
  return ContentService.createTextOutput(JSON.stringify({
    status: "ok",
    message: "Google Apps Script Webhook (hỗ trợ Sheet Tháng S/C 1-0) đang hoạt động!"
  })).setMimeType(ContentService.MimeType.JSON);
}

function getOrCreateMonthlySheet(ss, sheetName, days) {
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
  }
  if (sheet.getLastRow() >= 2) {
    return sheet;
  }

  var fixedCount = 7;
  var totalCols = fixedCount + days.length * 2 + 3;
  var row1 = ["TT", "Họ và tên HS", "Lớp", "ĐT bố", "X.Tuyến", "Lái xe/ĐT", "ĐT Mẹ"];
  var row2 = ["", "", "", "", "", "", ""];

  for (var i = 0; i < days.length; i++) {
    row1.push(days[i].headerLabel || ("Ngày " + days[i].day), "");
    row2.push("S", "C");
  }
  row1.push("Tổng S", "Tổng C", "Tổng lượt");
  row2.push("", "", "");

  sheet.getRange(1, 1, 2, totalCols).setValues([row1, row2]);

  // Gộp ô tiêu đề
  for (var c = 1; c <= fixedCount; c++) {
    sheet.getRange(1, c, 2, 1).merge();
  }
  for (var d = 0; d < days.length; d++) {
    var startCol = fixedCount + 1 + d * 2;
    sheet.getRange(1, startCol, 1, 2).merge();
    if (days[d].isWeekend) {
      sheet.getRange(1, startCol, 2, 2).setBackground("#e2e8f0");
    } else {
      sheet.getRange(1, startCol, 1, 2).setBackground("#dbeafe");
      sheet.getRange(2, startCol, 1, 2).setBackground("#eff6ff");
    }
  }
  for (var sCol = totalCols - 2; sCol <= totalCols; sCol++) {
    sheet.getRange(1, sCol, 2, 1).merge();
  }

  var headerRange = sheet.getRange(1, 1, 2, totalCols);
  headerRange
    .setFontWeight("bold")
    .setHorizontalAlignment("center")
    .setVerticalAlignment("middle")
    .setBorder(true, true, true, true, true, true, "#cbd5e1", SpreadsheetApp.BorderStyle.SOLID);

  sheet.getRange(1, 1, 2, fixedCount).setBackground("#f1f5f9");
  sheet.getRange(1, totalCols - 2, 2, 3).setBackground("#dcfce7");

  sheet.setFrozenRows(2);
  sheet.setFrozenColumns(fixedCount);

  // Độ rộng cột gọn gàng
  sheet.setColumnWidth(1, 38);
  sheet.setColumnWidth(2, 170);
  sheet.setColumnWidth(3, 56);
  sheet.setColumnWidth(4, 100);
  sheet.setColumnWidth(5, 64);
  sheet.setColumnWidth(6, 180);
  sheet.setColumnWidth(7, 100);
  for (var col = fixedCount + 1; col <= fixedCount + days.length * 2; col++) {
    sheet.setColumnWidth(col, 28);
  }
  return sheet;
}

function columnToLetter(col) {
  var letter = "";
  while (col > 0) {
    var temp = (col - 1) % 26;
    letter = String.fromCharCode(temp + 65) + letter;
    col = (col - temp - 1) / 26;
  }
  return letter;
}

function isSemicolonLocale(ss) {
  var loc = String(ss.getSpreadsheetLocale() || "en_US").toLowerCase();
  var prefixes = [
    "vi", "fr", "de", "es", "it", "pt", "ru", "pl", "nl", "da", "fi",
    "sv", "no", "nb", "cs", "sk", "hu", "ro", "bg", "el", "tr", "uk",
    "id", "hr", "sr", "sl", "et", "lv", "lt", "ca", "eu", "gl"
  ];
  for (var i = 0; i < prefixes.length; i++) {
    if (loc.indexOf(prefixes[i]) === 0) return true;
  }
  return false;
}

function buildSummaryFormulaRows(startRow, numRows, firstColLetter, lastColLetter, sep) {
  var formulas = [];
  for (var i = 0; i < numRows; i++) {
    var r = startRow + i;
    var sumS = '=SUMIF($' + firstColLetter + '$2:$' + lastColLetter + '$2' + sep + '"S"' + sep + firstColLetter + r + ':' + lastColLetter + r + ')';
    var sumC = '=SUMIF($' + firstColLetter + '$2:$' + lastColLetter + '$2' + sep + '"C"' + sep + firstColLetter + r + ':' + lastColLetter + r + ')';
    var sumAll = '=SUM(' + firstColLetter + r + ':' + lastColLetter + r + ')';
    formulas.push([sumS, sumC, sumAll]);
  }
  return formulas;
}

function applyMonthlySummaryFormulas(sheet, startRow, numRows, daysCount) {
  if (numRows <= 0) return;
  var ss = sheet.getParent();
  var fixedCount = 7;
  var firstDayCol = fixedCount + 1;
  var lastDayCol = fixedCount + daysCount * 2;
  var firstColLetter = columnToLetter(firstDayCol);
  var lastColLetter = columnToLetter(lastDayCol);
  var summaryRange = sheet.getRange(startRow, lastDayCol + 1, numRows, 3);

  var primarySep = isSemicolonLocale(ss) ? ";" : ",";
  var altSep = primarySep === ";" ? "," : ";";

  summaryRange.setFormulas(buildSummaryFormulaRows(startRow, numRows, firstColLetter, lastColLetter, primarySep));
  SpreadsheetApp.flush();

  var checkVal = String(sheet.getRange(startRow, lastDayCol + 1).getDisplayValue() || "");
  if (checkVal.indexOf("#") === 0) {
    summaryRange.setFormulas(buildSummaryFormulaRows(startRow, numRows, firstColLetter, lastColLetter, altSep));
    SpreadsheetApp.flush();
    checkVal = String(sheet.getRange(startRow, lastDayCol + 1).getDisplayValue() || "");
  }

  // Fallback cuối cùng: tính tổng trực tiếp bằng giá trị số nếu công thức vẫn lỗi
  if (checkVal.indexOf("#") === 0) {
    var grid = sheet.getRange(startRow, firstDayCol, numRows, daysCount * 2).getValues();
    var totals = [];
    for (var i = 0; i < grid.length; i++) {
      var sTotal = 0;
      var cTotal = 0;
      for (var c = 0; c < grid[i].length; c++) {
        var val = Number(grid[i][c]);
        if (!isNaN(val) && grid[i][c] !== "") {
          if (c % 2 === 0) sTotal += val;
          else cTotal += val;
        }
      }
      totals.push([sTotal, cTotal, sTotal + cTotal]);
    }
    summaryRange.setValues(totals);
  }
}

function syncFullMonthlyMatrix(ss, matrix) {
  var sheet = ss.getSheetByName(matrix.monthlySheetName);
  if (sheet) {
    sheet.clear();
  }
  sheet = getOrCreateMonthlySheet(ss, matrix.monthlySheetName, matrix.days);

  var fixedCount = 7;
  var daysCount = matrix.days.length;
  var totalCols = fixedCount + daysCount * 2 + 3;
  var rows = [];

  for (var i = 0; i < matrix.rows.length; i++) {
    var item = matrix.rows[i];
    var row = [
      item.tt,
      item.name || "",
      item.className || "",
      item.fatherPhone || "",
      item.routeLabel || "",
      item.driverInfo || "",
      item.motherPhone || ""
    ];
    for (var v = 0; v < item.values.length; v++) {
      row.push(item.values[v]);
    }
    row.push("", "", "");
    rows.push(row);
  }

  if (rows.length > 0) {
    sheet.getRange(3, 4, rows.length, 1).setNumberFormat("@");
    sheet.getRange(3, 7, rows.length, 1).setNumberFormat("@");
    sheet.getRange(3, 1, rows.length, totalCols).setValues(rows);
    applyMonthlySummaryFormulas(sheet, 3, rows.length, daysCount);

    sheet.getRange(3, 1, rows.length, 1).setHorizontalAlignment("center");
    sheet.getRange(3, 3, rows.length, 3).setHorizontalAlignment("center");
    sheet.getRange(3, fixedCount + 1, rows.length, daysCount * 2 + 3).setHorizontalAlignment("center");

    for (var d = 0; d < daysCount; d++) {
      if (matrix.days[d].isWeekend) {
        sheet.getRange(3, fixedCount + 1 + d * 2, rows.length, 2).setBackground("#f1f5f9");
      }
    }
  }
  return rows.length;
}

function updateMonthlyDayFromSession(ss, upd) {
  var sheet = getOrCreateMonthlySheet(ss, upd.monthlySheetName, upd.daysHeader);
  var fixedCount = 7;
  var daysCount = upd.daysHeader.length;
  var totalCols = fixedCount + daysCount * 2 + 3;
  var dayOffset = (upd.day - 1) * 2 + (upd.sessionType === "afternoon" ? 1 : 0);
  var targetCol = fixedCount + 1 + dayOffset;

  var lastRow = sheet.getLastRow();
  var existingIndex = {};
  if (lastRow >= 3) {
    var existingNames = sheet.getRange(3, 2, lastRow - 2, 4).getValues();
    for (var i = 0; i < existingNames.length; i++) {
      var key = String(existingNames[i][0]).trim() + "|" + String(existingNames[i][1]).trim() + "|" + String(existingNames[i][3]).trim();
      existingIndex[key] = 3 + i;
    }
  }

  var nextRow = Math.max(lastRow + 1, 3);
  var addedCount = 0;

  for (var j = 0; j < upd.students.length; j++) {
    var st = upd.students[j];
    var lookupKey = String(st.name || "").trim() + "|" + String(st.className || "").trim() + "|" + String(st.routeLabel || "").trim();
    var rowNum = existingIndex[lookupKey];

    if (!rowNum) {
      rowNum = nextRow++;
      addedCount++;
      var emptyRow = new Array(totalCols);
      for (var k = 0; k < totalCols; k++) emptyRow[k] = "";
      emptyRow[0] = rowNum - 2;
      emptyRow[1] = st.name || "";
      emptyRow[2] = st.className || "";
      emptyRow[3] = st.fatherPhone || "";
      emptyRow[4] = st.routeLabel || "";
      emptyRow[5] = st.driverInfo || "";
      emptyRow[6] = st.motherPhone || "";
      sheet.getRange(rowNum, 4, 1, 1).setNumberFormat("@");
      sheet.getRange(rowNum, 7, 1, 1).setNumberFormat("@");
      sheet.getRange(rowNum, 1, 1, totalCols).setValues([emptyRow]);
      existingIndex[lookupKey] = rowNum;
    }

    if (!upd.isWeekend && st.value !== "") {
      sheet.getRange(rowNum, targetCol).setValue(st.value).setHorizontalAlignment("center");
    }
  }

  var finalLastRow = sheet.getLastRow();
  if (finalLastRow >= 3) {
    applyMonthlySummaryFormulas(sheet, 3, finalLastRow - 2, daysCount);
  }
  return upd.students.length;
}

function doPost(e) {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var data = JSON.parse(e.postData.contents);

    // 1. Đồng bộ toàn bộ bảng điểm danh tháng (tất cả các xe, sáng/chiều T2-T6 = 1/0)
    if (data.event === "SYNC_MONTHLY_MATRIX" && data.monthlyMatrix) {
      var count = syncFullMonthlyMatrix(ss, data.monthlyMatrix);
      return ContentService.createTextOutput(JSON.stringify({
        status: "success",
        message: "Đã cập nhật bảng điểm danh tháng (" + data.monthlyMatrix.monthlySheetName + ") cho " + count + " học sinh thành công!"
      })).setMimeType(ContentService.MimeType.JSON);
    }

    // 2. Lưu nhật ký chi tiết theo ngày vào sheet chính
    var sheet = (data.sheetName && ss.getSheetByName(data.sheetName)) || ss.getActiveSheet();
    if (sheet.getLastRow() === 0) {
      sheet.appendRow([
        "Thời gian ghi nhận",
        "Ngày",
        "Tuyến xe",
        "Mã HS",
        "Họ và tên",
        "Lớp",
        "Trạng thái sáng",
        "Đến trường",
        "Trạng thái chiều",
        "Người chốt",
        "Ghi chú"
      ]);
      sheet.getRange(1, 1, 1, 11).setFontWeight("bold").setBackground("#e2e8f0");
    }

    var now = new Date();
    var formattedDate = Utilities.formatDate(now, "Asia/Ho_Chi_Minh", "dd/MM/yyyy HH:mm:ss");

    if (data.recordsSummary && data.recordsSummary.length > 0) {
      var rows = [];
      for (var i = 0; i < data.recordsSummary.length; i++) {
        var r = data.recordsSummary[i];
        rows.push([
          formattedDate,
          data.date || "",
          data.routeCode || "",
          r.code || "",
          r.name || "",
          r.class || "",
          r.morningStatus || "",
          r.schoolStatus || "",
          r.afternoonStatus || "",
          data.lockedBy || "Hệ thống",
          r.notes || ""
        ]);
      }
      sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, 11).setValues(rows);
    }

    // 3. Tự động cập nhật ô S/C (1 hoặc 0) vào sheet điểm danh tháng tương ứng
    if (data.monthlyDayUpdate && data.event !== "TEST_CONNECTION") {
      updateMonthlyDayFromSession(ss, data.monthlyDayUpdate);
    }

    return ContentService.createTextOutput(JSON.stringify({
      status: "success",
      message: "Đã lưu " + (data.recordsSummary ? data.recordsSummary.length : 0) + " học sinh vào Google Sheet (và cập nhật sheet tháng)!"
    })).setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({
      status: "error",
      message: err.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  }
}
`;

