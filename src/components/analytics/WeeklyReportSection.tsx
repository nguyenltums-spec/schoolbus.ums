import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { toPng } from 'html-to-image';
import { jsPDF } from 'jspdf';
import {
  Bus,
  ChevronLeft,
  ChevronRight,
  FileSpreadsheet,
  FileText,
  Loader2,
  Printer,
  RefreshCw,
} from 'lucide-react';
import { CheckinRecord, DatabaseSaveLog, Route, RouteSessionState, Student } from '../../types';
import { fetchDailyRecordsForMonth } from '../../services/syncService';
import { shiftDateStr } from '../../services/analyticsService';
import { sortRoutesByOrder } from '../../utils/routeSort';
import {
  WeeklyCellMode,
  WeeklyRouteSheetData,
  buildWeeklyReportSheets,
  exportWeeklyReportToExcel,
  getIsoWeekNumber,
  getWeekMonToFri,
} from '../../utils/weeklyReportBuilder';
import { playSound } from '../../services/notificationAudio';

interface Props {
  routes: Route[];
  students: Student[];
  records: Record<string, CheckinRecord>;
  sessionStates?: Record<string, RouteSessionState>;
  dbLogs?: DatabaseSaveLog[];
  todayDate: string;
  initialRouteFilterId?: string;
  initialAnchorDate?: string;
}

const PrintableWeeklySheet: React.FC<{ sheet: WeeklyRouteSheetData }> = ({ sheet }) => {
  const borderCell: React.CSSProperties = {
    border: '1px solid #000000',
    padding: '3px 5px',
    fontSize: '12px',
    lineHeight: 1.25,
    color: '#000000',
  };

  const headerCell: React.CSSProperties = {
    ...borderCell,
    fontWeight: 700,
    textAlign: 'center',
    verticalAlign: 'middle',
    backgroundColor: '#ffffff',
  };

  return (
    <div
      style={{
        fontFamily: '"Times New Roman", Times, Georgia, serif',
        color: '#000000',
        backgroundColor: '#ffffff',
        padding: '10px 12px',
        width: '100%',
        boxSizing: 'border-box',
      }}
    >
      {/* Top Centered Document Title */}
      <div
        style={{
          textAlign: 'center',
          fontWeight: 700,
          fontSize: '16px',
          letterSpacing: '0.2px',
          marginBottom: '6px',
          textTransform: 'uppercase',
          color: '#000000',
        }}
      >
        {sheet.headerTitle}
      </div>

      {/* Metadata Line: Bus + Driver + Phone | Date range + Week */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '12px',
          fontWeight: 700,
          fontSize: '12.5px',
          marginBottom: '5px',
          color: '#000000',
          flexWrap: 'wrap',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '18px', flexWrap: 'wrap' }}>
          <span>{sheet.busCodeLabel}</span>
          <span>Lái Xe: {sheet.driverName}</span>
          {sheet.driverPhone && <span>ĐT:{sheet.driverPhone}</span>}
        </div>
        <div>
          {sheet.blankDateFields ? (
            <span>Từ ngày: &nbsp;&nbsp;&nbsp;/&nbsp;&nbsp;&nbsp;&nbsp; đến &nbsp;&nbsp;&nbsp;/&nbsp;&nbsp;&nbsp;&nbsp; Tuần:...............</span>
          ) : (
            <span>
              Từ ngày: {sheet.startDateVi} &nbsp; đến &nbsp; {sheet.endDateVi} &nbsp;&nbsp; Tuần:{' '}
              {sheet.weekLabel || '........'}
            </span>
          )}
        </div>
      </div>

      {/* Attendance Grid Table matching template */}
      <table
        style={{
          width: '100%',
          borderCollapse: 'collapse',
          tableLayout: 'fixed',
          color: '#000000',
          backgroundColor: '#ffffff',
        }}
      >
        <colgroup>
          <col style={{ width: '32px' }} />
          <col style={{ width: '175px' }} />
          <col style={{ width: '48px' }} />
          <col style={{ width: '88px' }} />
          <col style={{ width: '88px' }} />
          {sheet.days.map((d) => (
            <React.Fragment key={d.dateStr}>
              <col style={{ width: '28px' }} />
              <col style={{ width: '28px' }} />
            </React.Fragment>
          ))}
          <col style={{ width: '90px' }} />
        </colgroup>
        <thead>
          <tr>
            <th rowSpan={2} style={headerCell}>
              TT
            </th>
            <th rowSpan={2} style={headerCell}>
              Họ và tên HS
            </th>
            <th rowSpan={2} style={headerCell}>
              Lớp
            </th>
            <th rowSpan={2} style={headerCell}>
              ĐT bố
            </th>
            <th rowSpan={2} style={headerCell}>
              ĐT Mẹ
            </th>
            {sheet.days.map((d) => (
              <th key={d.dateStr} colSpan={2} style={headerCell}>
                <div>{d.dayLabel}</div>
                {!sheet.blankDateFields && (
                  <div style={{ fontSize: '10px', fontWeight: 400 }}>{d.shortDate}</div>
                )}
              </th>
            ))}
            <th rowSpan={2} style={headerCell}>
              Ghi chú
            </th>
          </tr>
          <tr>
            {sheet.days.map((d) => (
              <React.Fragment key={`${d.dateStr}-sub`}>
                <th style={{ ...headerCell, padding: '2px' }}>S</th>
                <th style={{ ...headerCell, padding: '2px' }}>C</th>
              </React.Fragment>
            ))}
          </tr>
        </thead>
        <tbody>
          {sheet.rows.length === 0 ? (
            <tr>
              <td colSpan={16} style={{ ...borderCell, textAlign: 'center', padding: '14px' }}>
                Chưa có học sinh nào được gán vào tuyến xe này
              </td>
            </tr>
          ) : (
            sheet.rows.map((r) => (
              <tr key={r.studentId}>
                <td style={{ ...borderCell, textAlign: 'center' }}>{r.tt}</td>
                <td style={{ ...borderCell, textAlign: 'left' }}>{r.name}</td>
                <td style={{ ...borderCell, textAlign: 'center' }}>{r.className}</td>
                <td style={{ ...borderCell, textAlign: 'center' }}>{r.fatherPhone}</td>
                <td style={{ ...borderCell, textAlign: 'center' }}>{r.motherPhone}</td>
                {r.cells.map((c) => (
                  <React.Fragment key={`${r.studentId}-${c.dateStr}`}>
                    <td style={{ ...borderCell, textAlign: 'center', fontWeight: c.morning === 0 || c.morning === 'V' ? 700 : 400 }}>
                      {c.morning}
                    </td>
                    <td style={{ ...borderCell, textAlign: 'center', fontWeight: c.afternoon === 0 || c.afternoon === 'V' ? 700 : 400 }}>
                      {c.afternoon}
                    </td>
                  </React.Fragment>
                ))}
                <td style={{ ...borderCell, textAlign: 'left', fontSize: '11px' }}>{r.note}</td>
              </tr>
            ))
          )}

          {/* Footer Row 1: Tổng số học sinh */}
          <tr>
            <td style={{ ...borderCell, height: '28px' }}>&nbsp;</td>
            <td
              colSpan={3}
              style={{
                ...borderCell,
                fontWeight: 700,
                textAlign: 'center',
                verticalAlign: 'middle',
                fontSize: '13px',
                height: '28px',
              }}
            >
              Tổng: {sheet.rows.length} Học sinh
            </td>
            <td style={borderCell}>&nbsp;</td>
            {sheet.dailyTotals.map((dt, idx) => (
              <React.Fragment key={`tot-${idx}`}>
                <td style={{ ...borderCell, textAlign: 'center', fontWeight: 700 }}>
                  {dt.morning}
                </td>
                <td style={{ ...borderCell, textAlign: 'center', fontWeight: 700 }}>
                  {dt.afternoon}
                </td>
              </React.Fragment>
            ))}
            <td style={borderCell}>&nbsp;</td>
          </tr>

          {/* Footer Row 2: Lái xe ký tên */}
          <tr>
            <td
              colSpan={4}
              style={{
                ...borderCell,
                fontWeight: 700,
                textAlign: 'center',
                verticalAlign: 'middle',
                fontSize: '13px',
                height: '38px',
              }}
            >
              Lái xe ký tên
            </td>
            <td style={borderCell}>&nbsp;</td>
            {sheet.days.map((d) => (
              <React.Fragment key={`drv-${d.dateStr}`}>
                <td style={borderCell}>&nbsp;</td>
                <td style={borderCell}>&nbsp;</td>
              </React.Fragment>
            ))}
            <td style={borderCell}>&nbsp;</td>
          </tr>

          {/* Footer Row 3: GT ký tên */}
          <tr>
            <td
              colSpan={4}
              style={{
                ...borderCell,
                fontWeight: 700,
                textAlign: 'center',
                verticalAlign: 'middle',
                fontSize: '13px',
                height: '38px',
              }}
            >
              GT ký tên
            </td>
            <td style={borderCell}>&nbsp;</td>
            {sheet.days.map((d) => (
              <React.Fragment key={`sup-${d.dateStr}`}>
                <td style={borderCell}>&nbsp;</td>
                <td style={borderCell}>&nbsp;</td>
              </React.Fragment>
            ))}
            <td style={borderCell}>&nbsp;</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
};

export const WeeklyReportSection: React.FC<Props> = ({
  routes,
  students,
  records,
  sessionStates = {},
  dbLogs = [],
  todayDate,
  initialRouteFilterId = 'all',
  initialAnchorDate,
}) => {
  const sortedRoutes = useMemo(() => sortRoutesByOrder(routes), [routes]);
  const [selectedRouteId, setSelectedRouteId] = useState<string>(initialRouteFilterId);
  const [anchorDate, setAnchorDate] = useState<string>(initialAnchorDate || todayDate);
  const [cellMode, setCellMode] = useState<WeeklyCellMode>('binary');
  const [blankDateFields, setBlankDateFields] = useState<boolean>(false);
  const [customWeekLabel, setCustomWeekLabel] = useState<string>(() =>
    String(getIsoWeekNumber(initialAnchorDate || todayDate))
  );
  const [dailyRecordsMap, setDailyRecordsMap] = useState<
    Record<string, Record<string, CheckinRecord>>
  >({});
  const [isLoadingDaily, setIsLoadingDaily] = useState<boolean>(false);
  const [isExportingPdf, setIsExportingPdf] = useState<boolean>(false);
  const [isPrinting, setIsPrinting] = useState<boolean>(false);

  const sheetRefs = useRef<Record<string, HTMLDivElement | null>>({});

  useEffect(() => {
    if (initialRouteFilterId) {
      setSelectedRouteId(initialRouteFilterId);
    }
  }, [initialRouteFilterId]);

  useEffect(() => {
    if (initialAnchorDate) {
      setAnchorDate(initialAnchorDate);
      setCustomWeekLabel(String(getIsoWeekNumber(initialAnchorDate)));
    }
  }, [initialAnchorDate]);

  const weekBounds = useMemo(() => getWeekMonToFri(anchorDate), [anchorDate]);

  // Fetch daily attendance records from server for the month(s) covered by Mon-Fri of the selected week
  const loadWeekDailyRecords = async (startStr: string, endStr: string) => {
    setIsLoadingDaily(true);
    try {
      const months = Array.from(new Set([startStr.slice(0, 7), endStr.slice(0, 7)]));
      const chunks = await Promise.all(months.map((m) => fetchDailyRecordsForMonth(m)));
      const merged: Record<string, Record<string, CheckinRecord>> = {};
      chunks.forEach((chunk) => {
        Object.entries(chunk).forEach(([dateKey, studentMap]) => {
          merged[dateKey] = studentMap;
        });
      });
      setDailyRecordsMap(merged);
    } finally {
      setIsLoadingDaily(false);
    }
  };

  useEffect(() => {
    void loadWeekDailyRecords(weekBounds.startDate, weekBounds.endDate);
  }, [weekBounds.startDate, weekBounds.endDate]);

  const handleShiftWeek = (deltaWeeks: number) => {
    const next = shiftDateStr(anchorDate, deltaWeeks * 7);
    setAnchorDate(next);
    setCustomWeekLabel(String(getIsoWeekNumber(next)));
  };

  const handleDateChange = (nextDate: string) => {
    if (!nextDate) return;
    setAnchorDate(nextDate);
    setCustomWeekLabel(String(getIsoWeekNumber(nextDate)));
  };

  const sheets = useMemo(
    () =>
      buildWeeklyReportSheets({
        routes: sortedRoutes,
        students,
        dailyRecords: dailyRecordsMap,
        currentRecords: records,
        sessionStates,
        dbLogs,
        todayDate,
        anchorDate,
        routeFilterId: selectedRouteId,
        cellMode,
        customWeekLabel,
        blankDateFields,
      }),
    [
      sortedRoutes,
      students,
      dailyRecordsMap,
      records,
      sessionStates,
      dbLogs,
      todayDate,
      anchorDate,
      selectedRouteId,
      cellMode,
      customWeekLabel,
      blankDateFields,
    ]
  );

  const fileSuffix = useMemo(() => {
    const routeTag =
      selectedRouteId === 'all'
        ? 'TatCaXe'
        : sheets[0]?.sheetTabName || 'Xe';
    return `${routeTag}_${weekBounds.startDate}_den_${weekBounds.endDate}`;
  }, [selectedRouteId, sheets, weekBounds.startDate, weekBounds.endDate]);

  const handleExportExcel = () => {
    if (sheets.length === 0) return;
    playSound('beep');
    exportWeeklyReportToExcel(sheets, `PhieuDonTraHocSinh_Tuan_${fileSuffix}.xlsx`);
  };

  const handleExportPdf = async () => {
    if (sheets.length === 0 || isExportingPdf) return;
    playSound('beep');
    setIsExportingPdf(true);
    try {
      const pdf = new jsPDF({
        orientation: 'landscape',
        unit: 'mm',
        format: 'a4',
      });
      const pageW = pdf.internal.pageSize.getWidth();
      const pageH = pdf.internal.pageSize.getHeight();
      const margin = 8;
      const maxW = pageW - margin * 2;
      const maxH = pageH - margin * 2;

      for (let i = 0; i < sheets.length; i++) {
        const sheet = sheets[i];
        const node = sheetRefs.current[sheet.route.id];
        if (!node) continue;

        const dataUrl = await toPng(node, {
          pixelRatio: 2,
          backgroundColor: '#ffffff',
          cacheBust: true,
        });

        const img = new Image();
        await new Promise<void>((resolve, reject) => {
          img.onload = () => resolve();
          img.onerror = () => reject(new Error('Image load failed'));
          img.src = dataUrl;
        });

        const ratio = Math.min(maxW / img.width, maxH / img.height);
        const renderW = img.width * ratio;
        const renderH = img.height * ratio;
        const offsetX = margin + (maxW - renderW) / 2;
        const offsetY = margin;

        if (i > 0) {
          pdf.addPage('a4', 'landscape');
        }
        pdf.addImage(dataUrl, 'PNG', offsetX, offsetY, renderW, renderH, undefined, 'FAST');
      }

      pdf.save(`PhieuDonTraHocSinh_Tuan_${fileSuffix}.pdf`);
    } catch (err) {
      console.error('Export PDF failed:', err);
    } finally {
      setIsExportingPdf(false);
    }
  };

  const handlePrint = () => {
    if (sheets.length === 0) return;
    playSound('beep');
    setIsPrinting(true);
    document.body.classList.add('printing-weekly-report');

    const cleanup = () => {
      document.body.classList.remove('printing-weekly-report');
      setIsPrinting(false);
      window.removeEventListener('afterprint', cleanup);
    };

    window.addEventListener('afterprint', cleanup);
    window.setTimeout(() => {
      window.print();
      // Fallback cleanup in case afterprint doesn't fire in embedded iframes
      window.setTimeout(cleanup, 1200);
    }, 80);
  };

  return (
    <div className="space-y-4 p-4">
      {/* Weekly Report Controls Toolbar */}
      <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 space-y-3">
        <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2.5">
            {/* Bus Selector */}
            <div className="inline-flex items-center gap-1.5 bg-white border border-slate-300 rounded-lg px-2.5 py-1.5">
              <Bus className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
              <select
                value={selectedRouteId}
                onChange={(e) => setSelectedRouteId(e.target.value)}
                className="bg-transparent text-xs font-bold text-slate-800 focus:outline-none cursor-pointer"
              >
                <option value="all">Tất cả các xe ({sortedRoutes.length} xe)</option>
                {sortedRoutes.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.code} - {r.name} ({students.filter((s) => s.routeId === r.id).length} HS)
                  </option>
                ))}
              </select>
            </div>

            {/* Week Stepper & Date Picker */}
            <div className="inline-flex items-center gap-1 bg-white border border-slate-300 rounded-lg p-1">
              <button
                type="button"
                onClick={() => handleShiftWeek(-1)}
                className="p-1 hover:bg-slate-100 rounded text-slate-600"
                title="Tuần trước"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <input
                type="date"
                value={anchorDate}
                onChange={(e) => handleDateChange(e.target.value)}
                className="text-xs font-bold text-slate-800 px-1.5 py-0.5 focus:outline-none"
              />
              <button
                type="button"
                onClick={() => handleShiftWeek(1)}
                className="p-1 hover:bg-slate-100 rounded text-slate-600"
                title="Tuần sau"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => handleDateChange(todayDate)}
                className="px-2 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded text-[11px] font-bold"
              >
                Tuần này
              </button>
            </div>

            {/* Editable Week Number */}
            <label className="inline-flex items-center gap-1.5 bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs">
              <span className="font-semibold text-slate-600">Tuần:</span>
              <input
                type="text"
                value={customWeekLabel}
                onChange={(e) => setCustomWeekLabel(e.target.value)}
                className="w-12 font-bold text-slate-900 border-b border-slate-300 focus:border-indigo-600 focus:outline-none text-center"
                placeholder="48"
              />
            </label>

            {/* Refresh Week Data */}
            <button
              type="button"
              onClick={() => void loadWeekDailyRecords(weekBounds.startDate, weekBounds.endDate)}
              disabled={isLoadingDaily}
              className="p-2 bg-white hover:bg-slate-100 border border-slate-300 rounded-lg text-slate-600 transition-colors"
              title="Tải lại dữ liệu điểm danh tuần này từ máy chủ"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoadingDaily ? 'animate-spin text-indigo-600' : ''}`} />
            </button>
          </div>

          {/* Export & Print Buttons */}
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={handlePrint}
              disabled={sheets.length === 0 || isPrinting}
              className="px-3.5 py-2 bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-xs transition-colors whitespace-nowrap"
            >
              <Printer className="w-4 h-4" />
              <span>In Báo Cáo</span>
            </button>

            <button
              type="button"
              onClick={() => void handleExportPdf()}
              disabled={sheets.length === 0 || isExportingPdf}
              className="px-3.5 py-2 bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-xs transition-colors whitespace-nowrap"
            >
              {isExportingPdf ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <FileText className="w-4 h-4" />
              )}
              <span>{isExportingPdf ? 'Đang xuất PDF...' : 'Xuất PDF'}</span>
            </button>

            <button
              type="button"
              onClick={handleExportExcel}
              disabled={sheets.length === 0}
              className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-xs transition-colors whitespace-nowrap"
            >
              <FileSpreadsheet className="w-4 h-4" />
              <span>Xuất Excel (.xlsx)</span>
            </button>
          </div>
        </div>

        {/* Display Options Row */}
        <div className="pt-2.5 border-t border-slate-200 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-bold text-slate-700">Hiển thị ô S / C:</span>
            <div className="inline-flex p-0.5 bg-white rounded-lg border border-slate-300">
              {(
                [
                  { id: 'binary', label: 'Điền số (1 / 0)' },
                  { id: 'symbol', label: 'Ký hiệu (✓ / V)' },
                  { id: 'blank', label: 'Phiếu trống (ký tay)' },
                ] as const
              ).map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setCellMode(opt.id)}
                  className={`px-2.5 py-1 rounded-md text-[11px] font-bold transition-colors ${
                    cellMode === opt.id
                      ? 'bg-indigo-600 text-white'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <label className="inline-flex items-center gap-1.5 cursor-pointer select-none font-medium text-slate-700">
            <input
              type="checkbox"
              checked={blankDateFields}
              onChange={(e) => setBlankDateFields(e.target.checked)}
              className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
            />
            <span>Để trống dòng Từ ngày / Tuần (in mẫu trắng)</span>
          </label>
        </div>
      </div>

      {/* Live Printable Sheets Preview (1 sheet per selected bus) */}
      <div className="space-y-6">
        {sheets.map((sheet) => (
          <div
            key={sheet.route.id}
            className="bg-white border border-slate-300 rounded-xl shadow-xs overflow-x-auto"
          >
            <div
              ref={(el) => {
                sheetRefs.current[sheet.route.id] = el;
              }}
              style={{ minWidth: '940px', backgroundColor: '#ffffff' }}
            >
              <PrintableWeeklySheet sheet={sheet} />
            </div>
          </div>
        ))}
      </div>

      {/* Dedicated Print Portal rendered directly into document.body */}
      {typeof document !== 'undefined' &&
        createPortal(
          <div id="weekly-report-print-portal">
            {sheets.map((sheet) => (
              <div key={`print-${sheet.route.id}`} className="weekly-print-page">
                <PrintableWeeklySheet sheet={sheet} />
              </div>
            ))}
          </div>,
          document.body
        )}
    </div>
  );
};
