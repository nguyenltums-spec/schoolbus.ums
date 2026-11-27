import React, { useState, useEffect } from 'react';
import {
  X,
  FileSpreadsheet,
  CheckCircle2,
  Copy,
  ExternalLink,
  Zap,
  Server,
  Cloud,
  ArrowRight,
  Download,
  AlertCircle,
  UploadCloud,
  CalendarDays,
} from 'lucide-react';
import {
  GoogleSheetsConfig,
  Student,
  Route,
  CheckinRecord,
  RouteSessionState,
  DatabaseSaveLog,
} from '../../types';
import {
  GOOGLE_APPS_SCRIPT_TEMPLATE,
  buildMonthlyMatrixGoogleSheetPayload,
  buildRouteGoogleSheetPayload,
  exportRecordsToCSV,
  syncToGoogleSheets,
} from '../../services/storageService';
import { fetchDailyRecordsForMonth } from '../../services/syncService';
import {
  buildMonthlyAttendanceMatrix,
  exportMonthlyAttendanceCSV,
} from '../../utils/monthlySheetBuilder';
import { sortRoutesByOrder } from '../../utils/routeSort';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  config: GoogleSheetsConfig;
  onSaveConfig: (cfg: GoogleSheetsConfig) => void;
  students: Student[];
  routes: Route[];
  records: Record<string, CheckinRecord>;
  sessionStates?: Record<string, RouteSessionState>;
  dbLogs?: DatabaseSaveLog[];
  todayDate: string;
}

export const GoogleSheetsModal: React.FC<Props> = ({
  isOpen,
  onClose,
  config,
  onSaveConfig,
  students,
  routes,
  records,
  sessionStates = {},
  dbLogs = [],
  todayDate,
}) => {
  const [webhookUrl, setWebhookUrl] = useState(config.webhookUrl);
  const [sheetName, setSheetName] = useState(config.sheetName || 'DiemDanhXeTuyen');
  const [autoSync, setAutoSync] = useState(config.autoSync);
  const [copied, setCopied] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [isSyncingAll, setIsSyncingAll] = useState(false);
  const [isSyncingMonthly, setIsSyncingMonthly] = useState(false);
  const [manualSyncSession, setManualSyncSession] = useState<'morning' | 'afternoon'>('morning');
  const [selectedMonth, setSelectedMonth] = useState<string>(() =>
    todayDate ? todayDate.slice(0, 7) : new Date().toISOString().slice(0, 7)
  );
  const [monthlyRouteFilter, setMonthlyRouteFilter] = useState<string>('all');
  const [dailyRecordsMap, setDailyRecordsMap] = useState<
    Record<string, Record<string, CheckinRecord>>
  >({});
  const [testResult, setTestResult] = useState<{
    success: boolean;
    message: string;
    errorCode?: string;
  } | null>(null);
  const [activeTab, setActiveTab] = useState<'config' | 'monthly' | 'guide' | 'comparison'>('config');

  useEffect(() => {
    if (isOpen) {
      setWebhookUrl(config.webhookUrl || '');
      setSheetName(config.sheetName || 'DiemDanhXeTuyen');
      setAutoSync(config.autoSync !== false);
      setTestResult(null);
    }
  }, [isOpen, config.webhookUrl, config.sheetName, config.autoSync]);

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    fetchDailyRecordsForMonth(selectedMonth).then((map) => {
      if (!cancelled) setDailyRecordsMap(map);
    });
    return () => {
      cancelled = true;
    };
  }, [isOpen, selectedMonth, records]);

  if (!isOpen) return null;

  const sortedRoutes = sortRoutesByOrder(routes);
  const [monthYearStr, monthNumStr] = selectedMonth.split('-');
  const parsedYear = Number(monthYearStr) || new Date().getFullYear();
  const parsedMonth = Number(monthNumStr) || new Date().getMonth() + 1;

  const fullMonthlyMatrix = buildMonthlyAttendanceMatrix({
    year: parsedYear,
    month: parsedMonth,
    routes: sortedRoutes,
    students,
    dailyRecords: dailyRecordsMap,
    currentRecords: records,
    sessionStates,
    dbLogs,
    todayDate,
    routeFilterId: 'all',
  });

  const previewMonthlyMatrix =
    monthlyRouteFilter === 'all'
      ? fullMonthlyMatrix
      : buildMonthlyAttendanceMatrix({
          year: parsedYear,
          month: parsedMonth,
          routes: sortedRoutes,
          students,
          dailyRecords: dailyRecordsMap,
          currentRecords: records,
          sessionStates,
          dbLogs,
          todayDate,
          routeFilterId: monthlyRouteFilter,
        });

  const handleCopyCode = () => {
    navigator.clipboard.writeText(GOOGLE_APPS_SCRIPT_TEMPLATE);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const handleSave = () => {
    onSaveConfig({
      webhookUrl: webhookUrl.trim(),
      sheetName: sheetName.trim(),
      autoSync,
      lastSyncedAt: config.lastSyncedAt,
    });
    onClose();
  };

  const handleTestConnection = async () => {
    if (!webhookUrl.trim().startsWith('http')) {
      setTestResult({
        success: false,
        message: 'Vui lòng nhập đường dẫn URL Web App Google Apps Script hợp lệ (bắt đầu bằng https://script.google.com/...)',
      });
      return;
    }

    setIsTesting(true);
    setTestResult(null);

    try {
      const res = await syncToGoogleSheets(webhookUrl.trim(), {
        event: 'TEST_CONNECTION',
        date: todayDate,
        sheetName: sheetName.trim() || undefined,
        routeCode: 'TEST',
        lockedBy: 'Quản trị viên kiểm tra',
        totalStudents: 1,
        presentMorning: 1,
        absentMorning: 0,
        recordsSummary: [
          {
            code: 'TEST-01',
            name: 'Học sinh Thử Nghiệm Kết Nối',
            class: 'Test',
            morningStatus: 'Đã kết nối',
            schoolStatus: 'Thành công',
            afternoonStatus: 'OK',
            notes: 'SchoolBus Pro kết nối Google Sheet thành công!',
          },
        ],
      });

      setTestResult({
        success: true,
        message: `${res.message} Vui lòng mở Google Sheet của bạn để xem dòng thử nghiệm mới.`,
      });
    } catch (err: unknown) {
      const typedErr = err as Error & { errorCode?: string };
      setTestResult({
        success: false,
        errorCode: typedErr.errorCode,
        message:
          typedErr?.message ||
          'Không thể gửi dữ liệu tới webhook. Hãy kiểm tra cài đặt quyền "Anyone" khi triển khai Apps Script.',
      });
    } finally {
      setIsTesting(false);
    }
  };

  const handleSyncAllRoutesToday = async () => {
    const trimmed = webhookUrl.trim();
    if (!trimmed.startsWith('http')) {
      setTestResult({
        success: false,
        message: 'Vui lòng nhập đường dẫn URL Web App Google Apps Script hợp lệ trước khi đẩy dữ liệu.',
      });
      return;
    }

    setIsSyncingAll(true);
    setTestResult(null);

    try {
      let syncedRoutes = 0;
      let totalRowsPushed = 0;
      for (const route of routes) {
        const payload = buildRouteGoogleSheetPayload({
          route,
          students,
          records,
          date: todayDate,
          sessionType: manualSyncSession,
          lockedBy: 'Đồng bộ thủ công (Quản trị)',
          sheetName: sheetName.trim() || undefined,
        });
        if (payload.recordsSummary.length === 0) continue;
        await syncToGoogleSheets(trimmed, payload);
        syncedRoutes++;
        totalRowsPushed += payload.recordsSummary.length;
      }

      onSaveConfig({
        webhookUrl: trimmed,
        sheetName: sheetName.trim() || 'DiemDanhXeTuyen',
        autoSync,
        lastSyncedAt: new Date().toISOString(),
      });

      setTestResult({
        success: true,
        message: `Đã đẩy thành công ${totalRowsPushed} lượt học sinh (${syncedRoutes} tuyến - ${
          manualSyncSession === 'morning' ? 'Ca Sáng' : 'Ca Chiều'
        }) lên Google Sheet!`,
      });
    } catch (err: unknown) {
      const typedErr = err as Error & { errorCode?: string };
      setTestResult({
        success: false,
        errorCode: typedErr.errorCode,
        message: typedErr?.message || 'Lỗi khi đẩy dữ liệu điểm danh lên Google Sheet.',
      });
    } finally {
      setIsSyncingAll(false);
    }
  };

  const handleSyncMonthlyToSheets = async () => {
    const trimmed = webhookUrl.trim();
    if (!trimmed.startsWith('http')) {
      setTestResult({
        success: false,
        message:
          'Vui lòng nhập đường dẫn URL Web App Google Apps Script hợp lệ trước khi đẩy bảng tháng.',
      });
      return;
    }

    setIsSyncingMonthly(true);
    setTestResult(null);

    try {
      const freshDaily = await fetchDailyRecordsForMonth(selectedMonth);
      setDailyRecordsMap(freshDaily);
      const matrixToPush = buildMonthlyAttendanceMatrix({
        year: parsedYear,
        month: parsedMonth,
        routes: sortedRoutes,
        students,
        dailyRecords: freshDaily,
        currentRecords: records,
        sessionStates,
        dbLogs,
        todayDate,
        routeFilterId: 'all',
      });

      const payload = buildMonthlyMatrixGoogleSheetPayload(
        matrixToPush,
        'Quản trị viên (Đồng bộ tháng)'
      );
      const res = await syncToGoogleSheets(trimmed, payload);

      onSaveConfig({
        webhookUrl: trimmed,
        sheetName: sheetName.trim() || 'DiemDanhXeTuyen',
        autoSync,
        lastSyncedAt: new Date().toISOString(),
      });

      setTestResult({
        success: true,
        message:
          res.message ||
          `Đã cập nhật sheet điểm danh tháng "${matrixToPush.sheetTitle}" (${matrixToPush.rows.length} học sinh - tất cả các xe) lên Google Sheet!`,
      });
    } catch (err: unknown) {
      const typedErr = err as Error & { errorCode?: string };
      setTestResult({
        success: false,
        errorCode: typedErr.errorCode,
        message: typedErr?.message || 'Lỗi khi đẩy bảng điểm danh tháng lên Google Sheet.',
      });
    } finally {
      setIsSyncingMonthly(false);
    }
  };

  const handleDownloadMonthlyCsv = () => {
    const csvContent = exportMonthlyAttendanceCSV(previewMonthlyMatrix);
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `DiemDanh_${previewMonthlyMatrix.sheetTitle}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleDownloadCsv = () => {
    const csvContent = exportRecordsToCSV(students, sortedRoutes, records, todayDate);
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `DiemDanh_XeTuyen_${todayDate}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div
        className={`bg-white rounded-2xl shadow-2xl w-full overflow-hidden border border-slate-100 flex flex-col max-h-[92vh] transition-all ${
          activeTab === 'monthly' ? 'max-w-6xl' : 'max-w-2xl'
        }`}
      >
        {/* Header */}
        <div className="p-4 bg-gradient-to-r from-emerald-600 to-teal-700 text-white flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-white/15 rounded-xl backdrop-blur-sm">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-base">Cơ Sở Dữ Liệu & Đồng Bộ Google Sheets Miễn Phí</h3>
              <p className="text-xs text-emerald-100">
                Lưu trữ điểm danh hàng ngày &amp; bảng điểm danh theo tháng (S/C · 1/0 · T2–T6)
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-white/80 hover:text-white hover:bg-white/10 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex flex-wrap border-b border-slate-200 bg-slate-50 px-4 pt-2 gap-1.5 text-xs font-semibold">
          <button
            onClick={() => setActiveTab('config')}
            className={`pb-2.5 px-3 border-b-2 transition-colors whitespace-nowrap ${
              activeTab === 'config'
                ? 'border-emerald-600 text-emerald-700 font-bold'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            Cấu hình Webhook
          </button>
          <button
            onClick={() => setActiveTab('monthly')}
            className={`pb-2.5 px-3 border-b-2 transition-colors whitespace-nowrap flex items-center gap-1.5 ${
              activeTab === 'monthly'
                ? 'border-emerald-600 text-emerald-700 font-bold'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <CalendarDays className="w-3.5 h-3.5" />
            <span>Bảng Điểm Danh Tháng (S/C · 1/0)</span>
          </button>
          <button
            onClick={() => setActiveTab('guide')}
            className={`pb-2.5 px-3 border-b-2 transition-colors whitespace-nowrap ${
              activeTab === 'guide'
                ? 'border-emerald-600 text-emerald-700 font-bold'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            Hướng dẫn 3 phút (Apps Script)
          </button>
          <button
            onClick={() => setActiveTab('comparison')}
            className={`pb-2.5 px-3 border-b-2 transition-colors whitespace-nowrap ${
              activeTab === 'comparison'
                ? 'border-emerald-600 text-emerald-700 font-bold'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            Tư vấn CSDL
          </button>
        </div>

        {/* Tab Content */}
        <div className="p-6 overflow-y-auto flex-1 space-y-4">
          {activeTab === 'config' && (
            <div className="space-y-4">
              <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3.5 flex items-start gap-3">
                <Zap className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                <div className="text-xs text-emerald-900 leading-relaxed">
                  <span className="font-semibold">Cơ chế hoạt động:</span> Khi người phụ trách trường nhấn{' '}
                  <strong>&quot;Chốt sổ điểm danh&quot;</strong>, toàn bộ danh sách lên xe/xuống xe, giờ giấc và người chốt
                  sẽ tự động bắn một bản sao vào Google Sheet của bạn thông qua Google Apps Script Webhook.
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  Google Apps Script Web App URL
                </label>
                <input
                  type="url"
                  placeholder="https://script.google.com/macros/s/AKfycbx.../exec"
                  value={webhookUrl}
                  onChange={(e) => setWebhookUrl(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm font-mono focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
                <p className="text-[11px] text-slate-500 mt-1">
                  Chưa có Webhook URL? Xem tab <strong>&quot;Hướng dẫn 3 phút&quot;</strong> để copy mã nguồn miễn phí.
                </p>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  Tên Tab Trang Tính (Sheet Name)
                </label>
                <input
                  type="text"
                  placeholder="DiemDanhXeTuyen"
                  value={sheetName}
                  onChange={(e) => setSheetName(e.target.value)}
                  className="w-full px-3.5 py-2 bg-slate-50 border border-slate-300 rounded-xl text-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div className="flex items-center gap-3 pt-2">
                <input
                  type="checkbox"
                  id="autoSync"
                  checked={autoSync}
                  onChange={(e) => setAutoSync(e.target.checked)}
                  className="w-4 h-4 text-emerald-600 rounded border-slate-300 focus:ring-emerald-500"
                />
                <label htmlFor="autoSync" className="text-sm font-medium text-slate-700 cursor-pointer">
                  Tự động đẩy dữ liệu lên Google Sheet mỗi khi trường &quot;Chốt sổ sáng&quot; hoặc &quot;Chốt sổ chiều&quot;
                </label>
              </div>

              {/* Test & Manual Push Buttons + Result */}
              <div className="pt-2 space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={handleTestConnection}
                    disabled={isTesting || isSyncingAll}
                    className="px-4 py-2 bg-slate-100 hover:bg-slate-200 disabled:opacity-60 text-slate-800 text-xs font-semibold rounded-xl border border-slate-300 transition-colors flex items-center gap-2"
                  >
                    <Zap className="w-3.5 h-3.5 text-amber-600" />
                    {isTesting ? 'Đang kiểm tra kết nối...' : 'Kiểm tra kết nối (Test Ping)'}
                  </button>

                  <div className="flex items-center gap-1.5 bg-emerald-50 border border-emerald-200 rounded-xl p-1">
                    <select
                      value={manualSyncSession}
                      onChange={(e) => setManualSyncSession(e.target.value as 'morning' | 'afternoon')}
                      className="bg-white border border-emerald-200 rounded-lg px-2 py-1 text-xs font-bold text-slate-800 focus:outline-none"
                    >
                      <option value="morning">Ca Sáng</option>
                      <option value="afternoon">Ca Chiều</option>
                    </select>
                    <button
                      type="button"
                      onClick={handleSyncAllRoutesToday}
                      disabled={isTesting || isSyncingAll || isSyncingMonthly}
                      className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white text-xs font-bold rounded-lg transition-colors flex items-center gap-1.5"
                    >
                      <UploadCloud className="w-3.5 h-3.5" />
                      {isSyncingAll ? 'Đang đẩy dữ liệu...' : 'Đẩy toàn bộ hôm nay lên Sheet'}
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={handleSyncMonthlyToSheets}
                    disabled={isTesting || isSyncingAll || isSyncingMonthly}
                    className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white text-xs font-bold rounded-xl transition-colors flex items-center gap-1.5"
                  >
                    <CalendarDays className="w-3.5 h-3.5" />
                    {isSyncingMonthly
                      ? 'Đang tạo/cập nhật sheet tháng...'
                      : `Đẩy Bảng Tháng (${fullMonthlyMatrix.sheetTitle})`}
                  </button>
                </div>

                <div className="p-2.5 bg-amber-50 border border-amber-200 rounded-xl text-[11px] text-amber-900">
                  <strong>Lưu ý Sheet Tháng:</strong> Để Google Sheet tự động tạo tab{' '}
                  <code className="font-mono font-bold">{fullMonthlyMatrix.sheetTitle}</code> (Sáng/Chiều từ T2–T6, T7–CN nghỉ, đi=1 / nghỉ=0), hãy mở tab{' '}
                  <button
                    type="button"
                    onClick={() => setActiveTab('guide')}
                    className="underline font-bold text-amber-950"
                  >
                    Hướng dẫn 3 phút (Apps Script)
                  </button>{' '}
                  để cập nhật mã <code className="font-mono">Code.gs</code> mới và chọn <em>Triển khai &rarr; Phiên bản mới</em>.
                </div>

                {config.lastSyncedAt && (
                  <p className="text-[11px] text-emerald-700 font-medium">
                    Lần đồng bộ thành công gần nhất:{' '}
                    <strong>{new Date(config.lastSyncedAt).toLocaleString('vi-VN')}</strong>
                  </p>
                )}

                {testResult && (
                  <div
                    className={`p-3.5 rounded-xl border text-xs space-y-2 ${
                      testResult.success
                        ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                        : 'bg-rose-50 border-rose-200 text-rose-900'
                    }`}
                  >
                    <div className="flex items-start gap-2">
                      {testResult.success ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                      ) : (
                        <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                      )}
                      <span className="font-semibold leading-relaxed">{testResult.message}</span>
                    </div>

                    {!testResult.success && testResult.errorCode === 'AUTH_REQUIRED' && (
                      <div className="bg-white/80 border border-rose-200 rounded-lg p-2.5 text-[11px] text-slate-700 space-y-1">
                        <p className="font-bold text-rose-800">Cách khắc phục nhanh (chỉ mất 30 giây):</p>
                        <ol className="list-decimal pl-4 space-y-0.5">
                          <li>Mở file Google Sheet của bạn → menu <strong>Tiện ích mở rộng (Extensions)</strong> → <strong>Apps Script</strong>.</li>
                          <li>Bấm nút <strong>Triển khai (Deploy)</strong> → <strong>Quản lý các lần triển khai (Manage deployments)</strong>.</li>
                          <li>Bấm biểu tượng bút chì <strong>Chỉnh sửa (Edit)</strong> ở góc phải.</li>
                          <li>Mục <strong>Người có quyền truy cập (Who has access)</strong>: đổi sang <strong>Bất kỳ ai (Anyone)</strong>.</li>
                          <li>Bấm <strong>Triển khai (Deploy)</strong>, copy lại URL Web App mới (nếu thay đổi) và bấm <strong>Kiểm tra kết nối</strong> lại.</li>
                        </ol>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Instant CSV download alternative */}
              <div className="mt-4 pt-4 border-t border-slate-200 flex items-center justify-between bg-slate-50 p-3 rounded-xl">
                <div>
                  <h4 className="text-xs font-bold text-slate-800">Xuất file Excel / CSV Ngay Lập Tức</h4>
                  <p className="text-[11px] text-slate-500">Tải dữ liệu điểm danh hôm nay dạng bảng Excel UTF-8</p>
                </div>
                <button
                  type="button"
                  onClick={handleDownloadCsv}
                  className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-sm"
                >
                  <Download className="w-3.5 h-3.5" />
                  Tải File Excel (.csv)
                </button>
              </div>
            </div>
          )}

          {activeTab === 'monthly' && (
            <div className="space-y-3">
              {/* Monthly Controls */}
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 flex flex-wrap items-center justify-between gap-2.5">
                <div className="flex flex-wrap items-center gap-2">
                  <div className="flex items-center gap-1.5">
                    <label className="text-xs font-bold text-slate-700">Tháng:</label>
                    <input
                      type="month"
                      value={selectedMonth}
                      onChange={(e) => setSelectedMonth(e.target.value)}
                      className="px-2.5 py-1 bg-white border border-slate-300 rounded-lg text-xs font-semibold text-slate-900"
                    />
                  </div>

                  <select
                    value={monthlyRouteFilter}
                    onChange={(e) => setMonthlyRouteFilter(e.target.value)}
                    className="px-2.5 py-1 bg-white border border-slate-300 rounded-lg text-xs font-semibold text-slate-700"
                  >
                    <option value="all">Tất cả các xe ({sortedRoutes.length} xe · {fullMonthlyMatrix.rows.length} HS)</option>
                    {sortedRoutes.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.code} - {r.name}
                      </option>
                    ))}
                  </select>

                  <span className="text-[11px] text-slate-500 tabular-nums">
                    Sheet: <strong className="font-mono text-slate-800">{previewMonthlyMatrix.sheetTitle}</strong> · T2–T6 (1=Đi, 0=Nghỉ), T7–CN để trống
                  </span>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={handleDownloadMonthlyCsv}
                    className="px-3 py-1.5 bg-white hover:bg-slate-100 text-slate-800 border border-slate-300 rounded-lg text-xs font-bold flex items-center gap-1.5"
                  >
                    <Download className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Tải CSV Tháng</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleSyncMonthlyToSheets}
                    disabled={isSyncingMonthly}
                    className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white rounded-lg text-xs font-bold flex items-center gap-1.5"
                  >
                    <UploadCloud className="w-3.5 h-3.5" />
                    <span>
                      {isSyncingMonthly
                        ? 'Đang đẩy lên Sheet...'
                        : `Đẩy tất cả xe lên Google Sheet`}
                    </span>
                  </button>
                </div>
              </div>

              {testResult && (
                <div
                  className={`p-3 rounded-xl border text-xs flex items-start gap-2 ${
                    testResult.success
                      ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                      : 'bg-rose-50 border-rose-200 text-rose-900'
                  }`}
                >
                  {testResult.success ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                  ) : (
                    <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                  )}
                  <span className="font-semibold">{testResult.message}</span>
                </div>
              )}

              {/* Preview Table matching exact Google Sheet Layout */}
              <div className="border border-slate-200 rounded-xl overflow-hidden bg-white">
                <div className="overflow-x-auto max-h-[52vh]">
                  <table className="border-collapse text-[11px] text-left tabular-nums">
                    <thead className="sticky top-0 z-20 bg-slate-100 text-slate-700 font-bold">
                      <tr>
                        <th rowSpan={2} className="py-1.5 px-2 border border-slate-200 text-center bg-slate-100 sticky left-0 z-30 min-w-[34px]">
                          TT
                        </th>
                        <th rowSpan={2} className="py-1.5 px-2.5 border border-slate-200 bg-slate-100 sticky left-[34px] z-30 min-w-[155px]">
                          Họ và tên HS
                        </th>
                        <th rowSpan={2} className="py-1.5 px-2 border border-slate-200 text-center bg-slate-100 whitespace-nowrap">
                          Lớp
                        </th>
                        <th rowSpan={2} className="py-1.5 px-2 border border-slate-200 bg-slate-100 whitespace-nowrap">
                          ĐT bố
                        </th>
                        <th rowSpan={2} className="py-1.5 px-2 border border-slate-200 text-center bg-slate-100 whitespace-nowrap">
                          X.Tuyến
                        </th>
                        <th rowSpan={2} className="py-1.5 px-2 border border-slate-200 bg-slate-100 whitespace-nowrap">
                          Lái xe/ĐT
                        </th>
                        <th rowSpan={2} className="py-1.5 px-2 border border-slate-200 bg-slate-100 whitespace-nowrap">
                          ĐT Mẹ
                        </th>
                        {previewMonthlyMatrix.days.map((d) => (
                          <th
                            key={d.day}
                            colSpan={2}
                            className={`py-1 px-1 border border-slate-200 text-center whitespace-nowrap ${
                              d.isWeekend ? 'bg-slate-200 text-slate-500' : 'bg-blue-50 text-blue-900'
                            }`}
                          >
                            {d.headerLabel}
                          </th>
                        ))}
                        <th rowSpan={2} className="py-1.5 px-2 border border-slate-200 text-center bg-emerald-50 text-emerald-900 whitespace-nowrap">
                          Tổng S
                        </th>
                        <th rowSpan={2} className="py-1.5 px-2 border border-slate-200 text-center bg-emerald-50 text-emerald-900 whitespace-nowrap">
                          Tổng C
                        </th>
                        <th rowSpan={2} className="py-1.5 px-2 border border-slate-200 text-center bg-emerald-100 text-emerald-950 whitespace-nowrap">
                          Tổng
                        </th>
                      </tr>
                      <tr>
                        {previewMonthlyMatrix.days.map((d) => (
                          <React.Fragment key={`sub-${d.day}`}>
                            <th
                              className={`py-0.5 px-1.5 border border-slate-200 text-center text-[10px] ${
                                d.isWeekend ? 'bg-slate-200 text-slate-500' : 'bg-blue-50/70 text-slate-700'
                              }`}
                            >
                              S
                            </th>
                            <th
                              className={`py-0.5 px-1.5 border border-slate-200 text-center text-[10px] ${
                                d.isWeekend ? 'bg-slate-200 text-slate-500' : 'bg-blue-50/70 text-slate-700'
                              }`}
                            >
                              C
                            </th>
                          </React.Fragment>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {previewMonthlyMatrix.rows.map((r) => (
                        <tr key={r.studentId} className="hover:bg-slate-50">
                          <td className="py-1 px-2 border border-slate-200 text-center text-slate-500 bg-white sticky left-0 z-10">
                            {r.tt}
                          </td>
                          <td className="py-1 px-2.5 border border-slate-200 font-semibold text-slate-900 bg-white sticky left-[34px] z-10 whitespace-nowrap">
                            {r.name}
                          </td>
                          <td className="py-1 px-2 border border-slate-200 text-center font-mono text-slate-700 whitespace-nowrap">
                            {r.className}
                          </td>
                          <td className="py-1 px-2 border border-slate-200 font-mono text-slate-600 whitespace-nowrap">
                            {r.fatherPhone || '—'}
                          </td>
                          <td className="py-1 px-2 border border-slate-200 text-center font-bold text-blue-700 whitespace-nowrap">
                            {r.routeLabel}
                          </td>
                          <td className="py-1 px-2 border border-slate-200 text-slate-600 whitespace-nowrap">
                            {r.driverInfo}
                          </td>
                          <td className="py-1 px-2 border border-slate-200 font-mono text-slate-500 whitespace-nowrap">
                            {r.motherPhone || ''}
                          </td>
                          {r.days.map((d) => (
                            <React.Fragment key={`${r.studentId}-${d.day}`}>
                              <td
                                className={`py-1 px-1.5 border border-slate-200 text-center font-mono font-bold ${
                                  d.isWeekend
                                    ? 'bg-slate-100 text-slate-300'
                                    : d.morning === 1
                                    ? 'text-emerald-700 bg-emerald-50/40'
                                    : d.morning === 0
                                    ? 'text-rose-600 bg-rose-50/40'
                                    : 'text-slate-300'
                                }`}
                              >
                                {d.morning}
                              </td>
                              <td
                                className={`py-1 px-1.5 border border-slate-200 text-center font-mono font-bold ${
                                  d.isWeekend
                                    ? 'bg-slate-100 text-slate-300'
                                    : d.afternoon === 1
                                    ? 'text-blue-700 bg-blue-50/40'
                                    : d.afternoon === 0
                                    ? 'text-rose-600 bg-rose-50/40'
                                    : 'text-slate-300'
                                }`}
                              >
                                {d.afternoon}
                              </td>
                            </React.Fragment>
                          ))}
                          <td className="py-1 px-2 border border-slate-200 text-center font-bold text-emerald-700 bg-emerald-50/30">
                            {r.totalMorning}
                          </td>
                          <td className="py-1 px-2 border border-slate-200 text-center font-bold text-blue-700 bg-emerald-50/30">
                            {r.totalAfternoon}
                          </td>
                          <td className="py-1 px-2 border border-slate-200 text-center font-extrabold text-slate-900 bg-emerald-50/60">
                            {r.totalAll}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'guide' && (
            <div className="space-y-4">
              <div className="prose text-xs text-slate-600 space-y-2">
                <div className="flex items-center gap-2 font-bold text-slate-800 text-sm">
                  <span className="w-6 h-6 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center text-xs">
                    1
                  </span>
                  Tạo một file Google Sheets mới
                </div>
                <p className="pl-8">
                  Truy cập{' '}
                  <a
                    href="https://sheets.new"
                    target="_blank"
                    rel="noreferrer"
                    className="text-emerald-600 underline inline-flex items-center gap-0.5"
                  >
                    sheets.new <ExternalLink className="w-3 h-3" />
                  </a>{' '}
                  để tạo bảng tính điểm danh cho trường.
                </p>

                <div className="flex items-center gap-2 font-bold text-slate-800 text-sm pt-2">
                  <span className="w-6 h-6 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center text-xs">
                    2
                  </span>
                  Mở trình soạn thảo Google Apps Script
                </div>
                <p className="pl-8">
                  Trên thanh menu Google Sheets, bấm vào <strong>Tiện ích mở rộng (Extensions)</strong> &rarr;{' '}
                  <strong>Apps Script</strong>.
                </p>

                <div className="flex items-center gap-2 font-bold text-slate-800 text-sm pt-2">
                  <span className="w-6 h-6 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center text-xs">
                    3
                  </span>
                  Dán đoạn mã dưới đây vào file Code.gs:
                </div>
              </div>

              {/* Script code box */}
              <div className="relative">
                <button
                  type="button"
                  onClick={handleCopyCode}
                  className="absolute top-2 right-2 px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-white text-xs rounded-lg flex items-center gap-1 border border-slate-700 shadow"
                >
                  {copied ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  {copied ? 'Đã sao chép!' : 'Sao chép mã'}
                </button>
                <pre className="p-3 bg-slate-900 text-slate-200 text-[11px] font-mono rounded-xl max-h-56 overflow-y-auto leading-relaxed">
                  {GOOGLE_APPS_SCRIPT_TEMPLATE}
                </pre>
              </div>

              <div className="prose text-xs text-slate-600 space-y-2 pt-2">
                <div className="flex items-center gap-2 font-bold text-slate-800 text-sm">
                  <span className="w-6 h-6 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center text-xs">
                    4
                  </span>
                  Triển khai Web App (Deploy)
                </div>
                <p className="pl-8">
                  Bấm nút <strong>Deploy (Triển khai)</strong> &rarr; <strong>New deployment</strong> &rarr; Chọn bánh răng ⚙️{' '}
                  <strong>Web app</strong> &rarr; Chọn:
                  <br />• <em>Execute as:</em> <strong>Me (Tôi)</strong>
                  <br />• <em>Who has access:</em> <strong>Anyone (Bất kỳ ai)</strong>
                  <br />Nhấn <strong>Deploy</strong> &rarr; Cấp quyền truy cập &rarr; Copy đường link Web App dán vào tab Cấu hình!
                </p>
              </div>
            </div>
          )}

          {activeTab === 'comparison' && (
            <div className="space-y-3">
              <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                Tư vấn giải pháp lưu trữ dữ liệu miễn phí & hiệu quả:
              </h4>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {/* Option 1: Google Sheets */}
                <div className="p-3.5 rounded-xl border-2 border-emerald-500 bg-emerald-50/50 flex flex-col justify-between">
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <FileSpreadsheet className="w-5 h-5 text-emerald-600" />
                      <span className="font-bold text-xs text-emerald-950">Google Sheets (Khuyên dùng)</span>
                    </div>
                    <span className="inline-block px-1.5 py-0.5 bg-emerald-200 text-emerald-800 rounded text-[10px] font-bold mb-2">
                      Miễn phí 100% trọn đời
                    </span>
                    <ul className="text-[11px] text-slate-600 space-y-1 list-disc pl-4">
                      <li>Không cần thuê máy chủ hay cài đặt phức tạp.</li>
                      <li>Ban giám hiệu & kế toán mở xem trực tiếp như Excel.</li>
                      <li>Dễ chia sẻ phân quyền qua Gmail.</li>
                    </ul>
                  </div>
                  <div className="mt-3 text-[11px] font-bold text-emerald-700">★ Lựa chọn tối ưu nhất cho nhà trường</div>
                </div>

                {/* Option 2: Firebase Firestore */}
                <div className="p-3.5 rounded-xl border border-slate-200 bg-white flex flex-col justify-between">
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <Cloud className="w-5 h-5 text-amber-500" />
                      <span className="font-bold text-xs text-slate-800">Firebase Firestore</span>
                    </div>
                    <span className="inline-block px-1.5 py-0.5 bg-amber-100 text-amber-800 rounded text-[10px] font-bold mb-2">
                      Gói Spark miễn phí
                    </span>
                    <ul className="text-[11px] text-slate-600 space-y-1 list-disc pl-4">
                      <li>Thời gian thực mili-giây (Real-time).</li>
                      <li>Hỗ trợ 50,000 lượt đọc/ngày miễn phí.</li>
                      <li>Phù hợp nếu trường muốn mở rộng mobile app native.</li>
                    </ul>
                  </div>
                  <div className="mt-3 text-[11px] text-slate-500">Thích hợp khi quy mô trên 50 xe buýt</div>
                </div>

                {/* Option 3: Local + Excel Export */}
                <div className="p-3.5 rounded-xl border border-slate-200 bg-white flex flex-col justify-between">
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <Server className="w-5 h-5 text-blue-600" />
                      <span className="font-bold text-xs text-slate-800">Bộ nhớ thiết bị & Xuất CSV</span>
                    </div>
                    <span className="inline-block px-1.5 py-0.5 bg-blue-100 text-blue-800 rounded text-[10px] font-bold mb-2">
                      Tích hợp sẵn ngay lập tức
                    </span>
                    <ul className="text-[11px] text-slate-600 space-y-1 list-disc pl-4">
                      <li>Hoạt động ngay cả khi mất mạng 4G/Wifi (Offline).</li>
                      <li>Tự động lưu vào trình duyệt máy tính, iPad, điện thoại.</li>
                      <li>Bấm 1 nút xuất ra file Excel hàng ngày.</li>
                    </ul>
                  </div>
                  <div className="mt-3 text-[11px] text-blue-700 font-semibold">Đang hoạt động trên máy bạn</div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800"
          >
            Đóng
          </button>

          {activeTab === 'config' ? (
            <button
              type="button"
              onClick={handleSave}
              className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-md transition-colors flex items-center gap-1.5"
            >
              Lưu Cấu Hình
              <ArrowRight className="w-4 h-4" />
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setActiveTab('config')}
              className="px-4 py-2 bg-emerald-600 text-white rounded-xl text-xs font-bold hover:bg-emerald-700"
            >
              Quay lại Cấu Hình
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
