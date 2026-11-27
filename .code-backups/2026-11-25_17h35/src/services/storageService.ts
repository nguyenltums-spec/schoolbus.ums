import { Route, Student, CheckinRecord, RouteSessionState, AppNotification, GoogleSheetsConfig, DatabaseSaveLog } from '../types';
import { INITIAL_ROUTES, INITIAL_STUDENTS, createInitialRecords, INITIAL_ROUTE_SESSIONS, INITIAL_NOTIFICATIONS } from './defaultData';
import { getSessionTransfer } from '../utils/transferHelpers';

const STORAGE_KEYS = {
  ROUTES: 'schoolbus_routes_v1',
  STUDENTS: 'schoolbus_students_v1',
  RECORDS: 'schoolbus_records_v1',
  SESSIONS: 'schoolbus_sessions_v1',
  NOTIFICATIONS: 'schoolbus_notifications_v1',
  SHEETS_CONFIG: 'schoolbus_sheets_config_v1',
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
}

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
 * Ready-to-use Google Apps Script code template that user can deploy for free
 */
export const GOOGLE_APPS_SCRIPT_TEMPLATE = `// ========================================================
// HƯỚNG DẪN TẠO CƠ SỞ DỮ LIỆU GOOGLE SHEETS MIỄN PHÍ 100%
// 1. Tạo 1 file Google Sheets mới trên drive.google.com
// 2. Vào menu: Tiện ích mở rộng (Extensions) -> Apps Script
// 3. Dán toàn bộ mã nguồn bên dưới vào file Code.gs
// 4. Nhấn "Triển khai" (Deploy) -> "Tùy chọn triển khai mới" (New deployment)
// 5. Chọn loại: "Ứng dụng web" (Web app)
//    - Thực thi dưới dạng (Execute as): Tôi (Me)
//    - Người có quyền truy cập (Who has access): "Bất kỳ ai" (Anyone)  <-- RẤT QUAN TRỌNG!
// 6. Nhấn "Triển khai", cấp quyền và Copy URL Web App dán vào SchoolBus Pro!
// ========================================================

function doGet(e) {
  return ContentService.createTextOutput(JSON.stringify({
    status: "ok",
    message: "Google Apps Script Webhook đang hoạt động!"
  })).setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var data = JSON.parse(e.postData.contents);
    var sheet = (data.sheetName && ss.getSheetByName(data.sheetName)) || ss.getActiveSheet();

    // Nếu sheet rỗng, khởi tạo tiêu đề cột
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

    return ContentService.createTextOutput(JSON.stringify({
      status: "success",
      message: "Đã lưu " + (data.recordsSummary ? data.recordsSummary.length : 0) + " học sinh vào Google Sheet thành công!"
    })).setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({
      status: "error",
      message: err.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  }
}
`;
