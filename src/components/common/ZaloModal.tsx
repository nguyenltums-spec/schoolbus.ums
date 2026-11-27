import React, { useEffect, useMemo, useState } from 'react';
import {
  X,
  Send,
  Copy,
  CheckCircle2,
  ExternalLink,
  Settings2,
  History,
  MessageCircle,
  Search,
  AlertCircle,
  ShieldCheck,
  Sparkles,
  Bus,
  Phone,
} from 'lucide-react';
import {
  CheckinRecord,
  Route,
  SessionType,
  Student,
  UserAccount,
  ZaloConfig,
  ZaloDeliveryLog,
} from '../../types';
import { sortRoutesByOrder } from '../../utils/routeSort';
import {
  fetchZaloServerStatus,
  sendZaloNotificationViaServer,
} from '../../services/syncService';
import { isTransferredInAcceptedForSession, isTransferredOutAcceptedForSession } from '../../utils/transferHelpers';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  config: ZaloConfig;
  onSaveConfig: (cfg: ZaloConfig) => void;
  routes: Route[];
  students: Student[];
  records: Record<string, CheckinRecord>;
  activeRouteId: string;
  activeSessionType: SessionType;
  todayDate: string;
  currentUser: UserAccount;
  canConfigureZalo: boolean;
  zaloLogs: ZaloDeliveryLog[];
  onAddZaloLog: (log: ZaloDeliveryLog) => void;
  prefill?: { title: string; message: string; routeId?: string } | null;
}

function extractParentZaloLinks(rawPhone: string): Array<{ display: string; zaloUrl: string }> {
  if (!rawPhone || typeof rawPhone !== 'string') return [];
  const segments = rawPhone.split(/[/,;\n|]+/);
  const results: Array<{ display: string; zaloUrl: string }> = [];
  const seen = new Set<string>();

  for (const seg of segments) {
    let digits = seg.replace(/[^\d]/g, '');
    if (!digits) continue;
    if (digits.startsWith('84') && digits.length >= 11) {
      digits = `0${digits.slice(2)}`;
    } else if (digits.length === 9 && !digits.startsWith('0')) {
      digits = `0${digits}`;
    }
    if (digits.length < 9 || digits.length > 15) continue;
    if (seen.has(digits)) continue;
    seen.add(digits);
    results.push({
      display: digits,
      zaloUrl: `https://zalo.me/${digits}`,
    });
  }
  return results;
}

export const ZaloModal: React.FC<Props> = ({
  isOpen,
  onClose,
  config,
  onSaveConfig,
  routes,
  students,
  records,
  activeRouteId,
  activeSessionType,
  todayDate,
  currentUser,
  canConfigureZalo,
  zaloLogs,
  onAddZaloLog,
  prefill,
}) => {
  const sortedRoutes = useMemo(() => sortRoutesByOrder(routes), [routes]);

  const [activeTab, setActiveTab] = useState<'quick' | 'config' | 'logs'>('quick');
  const [selectedRouteFilter, setSelectedRouteFilter] = useState<string>(activeRouteId || 'all');
  const [msgTitle, setMsgTitle] = useState<string>('Thông báo xe đưa đón học sinh');
  const [msgBody, setMsgBody] = useState<string>('');
  const [customRecipientIds, setCustomRecipientIds] = useState<string>('');
  const [studentSearch, setStudentSearch] = useState<string>('');
  const [copiedFlag, setCopiedFlag] = useState(false);

  // Server & config state
  const [hasServerToken, setHasServerToken] = useState(false);
  const [draftConfig, setDraftConfig] = useState<ZaloConfig>(config);
  const [isSending, setIsSending] = useState(false);
  const [sendFeedback, setSendFeedback] = useState<{ ok: boolean; text: string } | null>(null);
  const [configSavedNotice, setConfigSavedNotice] = useState(false);

  const buildSummaryMessage = (routeIdOrAll: string): { title: string; message: string } => {
    const sessionLabel = activeSessionType === 'morning' ? 'Sáng đi đón' : 'Chiều về trả';
    const targetRoutes =
      routeIdOrAll === 'all'
        ? sortedRoutes
        : sortedRoutes.filter((r) => r.id === routeIdOrAll);

    if (targetRoutes.length === 0) {
      return {
        title: `Thông báo xe tuyến (${todayDate})`,
        message: 'Chưa có dữ liệu tuyến xe.',
      };
    }

    if (targetRoutes.length === 1) {
      const route = targetRoutes[0];
      const riders = students.filter(
        (s) =>
          (s.routeId === route.id &&
            !isTransferredOutAcceptedForSession(records[s.id], route.id, activeSessionType)) ||
          isTransferredInAcceptedForSession(records[s.id], route.id, activeSessionType)
      );
      const boardedCount =
        activeSessionType === 'morning'
          ? riders.filter((s) => records[s.id]?.morningPickupStatus === 'boarded').length
          : riders.filter((s) => records[s.id]?.afternoonBoardStatus === 'boarded').length;
      const absentList = riders.filter((s) =>
        activeSessionType === 'morning'
          ? records[s.id]?.morningPickupStatus === 'absent'
          : records[s.id]?.afternoonBoardStatus === 'absent'
      );
      const absentNames =
        absentList.length > 0
          ? absentList
              .map((s) => `- ${s.name} (${s.class})${records[s.id]?.parentExcusedReason ? `: ${records[s.id]?.parentExcusedReason}` : ''}`)
              .join('\n')
          : 'Không có';

      return {
        title: `Báo cáo điểm danh ${route.code} - ${sessionLabel} (${todayDate})`,
        message:
          `🚌 ${route.code} (${route.name})\n` +
          `👨‍✈️ Lái xe: ${route.driverName} (${route.driverPhone})\n` +
          `📅 Ngày: ${todayDate} | Ca: ${sessionLabel}\n` +
          `✅ Đã lên xe: ${boardedCount}/${riders.length} HS\n` +
          `🚫 Vắng/PH tự đón (${absentList.length}):\n${absentNames}`,
      };
    }

    const lines = targetRoutes.map((route) => {
      const riders = students.filter(
        (s) =>
          (s.routeId === route.id &&
            !isTransferredOutAcceptedForSession(records[s.id], route.id, activeSessionType)) ||
          isTransferredInAcceptedForSession(records[s.id], route.id, activeSessionType)
      );
      const boardedCount =
        activeSessionType === 'morning'
          ? riders.filter((s) => records[s.id]?.morningPickupStatus === 'boarded').length
          : riders.filter((s) => records[s.id]?.afternoonBoardStatus === 'boarded').length;
      const absentCount = riders.filter((s) =>
        activeSessionType === 'morning'
          ? records[s.id]?.morningPickupStatus === 'absent'
          : records[s.id]?.afternoonBoardStatus === 'absent'
      ).length;
      return `• ${route.code}: ${boardedCount}/${riders.length} lên xe (vắng ${absentCount})`;
    });

    return {
      title: `Tổng hợp điểm danh toàn trường - ${sessionLabel} (${todayDate})`,
      message: `📊 TỔNG HỢP XE TUYẾN (${todayDate} - ${sessionLabel}):\n${lines.join('\n')}`,
    };
  };

  useEffect(() => {
    if (!isOpen) return;
    setDraftConfig(config);
    setSendFeedback(null);
    setConfigSavedNotice(false);
    fetchZaloServerStatus().then((st) => setHasServerToken(st.hasServerToken));

    if (prefill) {
      setActiveTab('quick');
      setSelectedRouteFilter(prefill.routeId || activeRouteId || 'all');
      setMsgTitle(prefill.title);
      setMsgBody(prefill.message);
    } else {
      const initialRoute = activeRouteId || sortedRoutes[0]?.id || 'all';
      setSelectedRouteFilter(initialRoute);
      const summary = buildSummaryMessage(initialRoute);
      setMsgTitle(summary.title);
      setMsgBody(summary.message);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, prefill]);

  if (!isOpen) return null;

  const applyTemplate = (kind: 'attendance' | 'arrival' | 'absent') => {
    const route = sortedRoutes.find((r) => r.id === selectedRouteFilter) || sortedRoutes[0];
    if (kind === 'attendance') {
      const s = buildSummaryMessage(selectedRouteFilter);
      setMsgTitle(s.title);
      setMsgBody(s.message);
      return;
    }
    if (kind === 'arrival') {
      const target = route;
      const stop = target?.stops?.[target.currentStopIndex] || target?.stops?.[0];
      setMsgTitle(`🚌 Xe ${target?.code || ''} sắp đến điểm ${stop?.name || 'đón'}`);
      setMsgBody(
        `Kính gửi Quý phụ huynh,\nXe tuyến ${target?.code || ''} (${target?.plateNumber || ''}) đang đến điểm dừng "${stop?.name || 'theo lộ trình'}". Kính mời phụ huynh đưa con ra điểm đón đúng giờ.\nLái xe: ${target?.driverName || ''} - ${target?.driverPhone || ''}`
      );
      return;
    }
    if (kind === 'absent') {
      const targetRoutes =
        selectedRouteFilter === 'all'
          ? sortedRoutes
          : sortedRoutes.filter((r) => r.id === selectedRouteFilter);
      const absentRows: string[] = [];
      for (const r of targetRoutes) {
        const routeStudents = students.filter((s) => s.routeId === r.id);
        for (const st of routeStudents) {
          const rec = records[st.id];
          const isAbs =
            activeSessionType === 'morning'
              ? rec?.morningPickupStatus === 'absent'
              : rec?.afternoonBoardStatus === 'absent';
          if (isAbs) {
            absentRows.push(
              `• [${r.code}] ${st.name} (${st.class})${rec?.parentExcusedReason ? ` - ${rec.parentExcusedReason}` : ''}`
            );
          }
        }
      }
      setMsgTitle(`Danh sách học sinh vắng (${todayDate})`);
      setMsgBody(
        absentRows.length > 0
          ? `📋 DANH SÁCH HỌC SINH VẮNG (${todayDate} - ${
              activeSessionType === 'morning' ? 'Sáng' : 'Chiều'
            }):\n${absentRows.join('\n')}`
          : `✅ Ngày ${todayDate} (${activeSessionType === 'morning' ? 'Sáng' : 'Chiều'}) hiện chưa ghi nhận học sinh vắng.`
      );
    }
  };

  const fullFormattedText = msgTitle.trim() ? `[${msgTitle.trim()}]\n${msgBody.trim()}` : msgBody.trim();

  const handleCopyMessage = async () => {
    if (!fullFormattedText) return;
    try {
      await navigator.clipboard.writeText(fullFormattedText);
      setCopiedFlag(true);
      setTimeout(() => setCopiedFlag(false), 2500);
      onAddZaloLog({
        id: `zlog-${Date.now()}`,
        timestamp: new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }),
        title: msgTitle.trim() || 'Tin nhắn Zalo',
        message: msgBody.trim(),
        mode: 'manual_share',
        recipientSummary: 'Sao chép gửi Zalo cá nhân / Nhóm lớp',
        ok: true,
        detail: 'Đã sao chép nội dung vào bộ nhớ tạm để dán vào Zalo.',
      });
    } catch {
      setSendFeedback({
        ok: false,
        text: 'Trình duyệt không cho phép sao chép tự động. Vui lòng bôi đen nội dung và nhấn Ctrl+C.',
      });
    }
  };

  const handleSendAutomated = async (isTest = false) => {
    setIsSending(true);
    setSendFeedback(null);

    const routeObj = sortedRoutes.find((r) => r.id === selectedRouteFilter);
    const parsedCustomRecipients = customRecipientIds
      .split(/[,;\s\n]+/)
      .map((s) => s.trim())
      .filter(Boolean);

    const payloadTitle = isTest
      ? 'SchoolBus Pro - Kiểm tra kết nối Zalo'
      : msgTitle.trim() || 'Thông báo xe tuyến SchoolBus Pro';
    const payloadBody = isTest
      ? `Tin nhắn thử nghiệm từ hệ thống SchoolBus Pro lúc ${new Date().toLocaleTimeString('vi-VN')} (người gửi: ${currentUser.fullName}).`
      : msgBody.trim();

    const activeMode = activeTab === 'config' ? draftConfig.deliveryMode : config.deliveryMode;
    const hookOverride = activeTab === 'config' ? draftConfig.webhookUrl : undefined;

    const result = await sendZaloNotificationViaServer({
      callerAccountId: currentUser.id,
      title: payloadTitle,
      message: payloadBody,
      routeId: selectedRouteFilter !== 'all' ? selectedRouteFilter : undefined,
      routeCode: routeObj?.code,
      recipientIds: parsedCustomRecipients.length > 0 ? parsedCustomRecipients : undefined,
      deliveryModeOverride: activeMode,
      webhookUrlOverride: hookOverride,
    });

    setIsSending(false);
    setSendFeedback({ ok: result.ok, text: result.message });

    onAddZaloLog({
      id: `zlog-${Date.now()}`,
      timestamp: new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }),
      title: payloadTitle,
      message: payloadBody,
      mode: activeMode,
      recipientSummary:
        parsedCustomRecipients.length > 0
          ? `${parsedCustomRecipients.length} ID chỉ định`
          : routeObj
          ? `Tuyến ${routeObj.code}`
          : 'Mặc định hệ thống',
      ok: result.ok,
      detail: result.message,
    });
  };

  const handleSaveZaloConfig = () => {
    onSaveConfig(draftConfig);
    setConfigSavedNotice(true);
    setTimeout(() => setConfigSavedNotice(false), 3000);
  };

  const filteredStudentsForZalo = students.filter((s) => {
    const matchRoute = selectedRouteFilter === 'all' || s.routeId === selectedRouteFilter;
    if (!matchRoute) return false;
    const q = studentSearch.trim().toLowerCase();
    if (!q) return true;
    return (
      s.name.toLowerCase().includes(q) ||
      s.class.toLowerCase().includes(q) ||
      s.parentName.toLowerCase().includes(q) ||
      s.parentPhone.toLowerCase().includes(q)
    );
  });

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-4xl max-h-[92vh] flex flex-col border border-slate-200 overflow-hidden">
        {/* Header */}
        <div className="px-5 py-4 bg-gradient-to-r from-blue-600 to-sky-600 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-2xl bg-white/15 backdrop-blur-xs flex items-center justify-center shrink-0 font-black text-base tracking-tight">
              Zalo
            </div>
            <div className="min-w-0">
              <h2 className="font-extrabold text-base sm:text-lg truncate">
                Gửi Thông Báo Đến Zalo
              </h2>
              <p className="text-xs text-sky-100 truncate">
                Nhắn nhanh phụ huynh / nhóm lớp hoặc tự động đẩy qua Zalo OA / Webhook HTTPS
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl hover:bg-white/15 text-white transition-colors shrink-0"
            title="Đóng"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Navigation Tabs */}
        <div className="px-5 pt-3 bg-slate-50 border-b border-slate-200 flex items-center gap-2 overflow-x-auto shrink-0">
          <button
            type="button"
            onClick={() => setActiveTab('quick')}
            className={`px-3.5 py-2 rounded-t-xl text-xs sm:text-sm font-bold flex items-center gap-1.5 border-b-2 transition-colors whitespace-nowrap ${
              activeTab === 'quick'
                ? 'border-blue-600 text-blue-700 bg-white'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            <MessageCircle className="w-4 h-4" />
            Gửi nhanh & Nhắn PH
          </button>

          {canConfigureZalo && (
            <button
              type="button"
              onClick={() => setActiveTab('config')}
              className={`px-3.5 py-2 rounded-t-xl text-xs sm:text-sm font-bold flex items-center gap-1.5 border-b-2 transition-colors whitespace-nowrap ${
                activeTab === 'config'
                  ? 'border-blue-600 text-blue-700 bg-white'
                  : 'border-transparent text-slate-600 hover:text-slate-900'
              }`}
            >
              <Settings2 className="w-4 h-4" />
              Cấu hình tự động (OA / Webhook)
            </button>
          )}

          <button
            type="button"
            onClick={() => setActiveTab('logs')}
            className={`px-3.5 py-2 rounded-t-xl text-xs sm:text-sm font-bold flex items-center gap-1.5 border-b-2 transition-colors whitespace-nowrap ${
              activeTab === 'logs'
                ? 'border-blue-600 text-blue-700 bg-white'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            <History className="w-4 h-4" />
            Nhật ký gửi ({zaloLogs.length})
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-5">
          {activeTab === 'quick' && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
              {/* Left: Message Composer & Direct Actions */}
              <div className="lg:col-span-7 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Bus className="w-4 h-4 text-blue-600" />
                    <label className="text-xs font-bold text-slate-700">Chọn tuyến xe:</label>
                    <select
                      value={selectedRouteFilter}
                      onChange={(e) => {
                        const val = e.target.value;
                        setSelectedRouteFilter(val);
                        const s = buildSummaryMessage(val);
                        setMsgTitle(s.title);
                        setMsgBody(s.message);
                      }}
                      className="text-xs font-semibold bg-slate-50 border border-slate-300 rounded-xl px-2.5 py-1.5 text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="all">Tất cả các xe ({sortedRoutes.length})</option>
                      {sortedRoutes.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.code} - {r.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Quick Templates */}
                <div className="flex flex-wrap gap-1.5">
                  <span className="text-[11px] font-semibold text-slate-500 self-center mr-1">
                    Mẫu nhanh:
                  </span>
                  <button
                    type="button"
                    onClick={() => applyTemplate('attendance')}
                    className="px-2.5 py-1 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-700 text-xs font-semibold border border-blue-200 transition-colors"
                  >
                    Báo cáo điểm danh
                  </button>
                  <button
                    type="button"
                    onClick={() => applyTemplate('arrival')}
                    className="px-2.5 py-1 rounded-lg bg-amber-50 hover:bg-amber-100 text-amber-800 text-xs font-semibold border border-amber-200 transition-colors"
                  >
                    Xe sắp đến điểm
                  </button>
                  <button
                    type="button"
                    onClick={() => applyTemplate('absent')}
                    className="px-2.5 py-1 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs font-semibold border border-rose-200 transition-colors"
                  >
                    DS học sinh vắng
                  </button>
                </div>

                <div className="space-y-2.5">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Tiêu đề thông báo
                    </label>
                    <input
                      type="text"
                      value={msgTitle}
                      onChange={(e) => setMsgTitle(e.target.value)}
                      maxLength={200}
                      placeholder="Ví dụ: Thông báo đón trả học sinh..."
                      className="w-full px-3 py-2 text-xs sm:text-sm border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Nội dung gửi Zalo
                    </label>
                    <textarea
                      rows={7}
                      value={msgBody}
                      onChange={(e) => setMsgBody(e.target.value)}
                      maxLength={2000}
                      placeholder="Nhập nội dung tin nhắn gửi phụ huynh hoặc nhóm Zalo..."
                      className="w-full px-3 py-2 text-xs sm:text-sm border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 font-sans leading-relaxed"
                    />
                  </div>

                  {config.deliveryMode === 'zalo_oa' && (
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                        Zalo OA User ID người nhận (tuỳ chọn — bỏ trống sẽ lấy theo cấu hình tuyến)
                      </label>
                      <input
                        type="text"
                        value={customRecipientIds}
                        onChange={(e) => setCustomRecipientIds(e.target.value)}
                        placeholder="Ví dụ: 1234567890123456789, 9876543210987654321"
                        className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  )}
                </div>

                {/* Action buttons */}
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <button
                    type="button"
                    onClick={handleCopyMessage}
                    className="px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold flex items-center gap-1.5 transition-colors shadow-xs"
                  >
                    {copiedFlag ? (
                      <>
                        <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                        Đã sao chép tin!
                      </>
                    ) : (
                      <>
                        <Copy className="w-4 h-4" />
                        Sao chép nội dung tin
                      </>
                    )}
                  </button>

                  <a
                    href="https://zalo.me"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-3.5 py-2 rounded-xl bg-sky-50 hover:bg-sky-100 text-sky-700 border border-sky-200 text-xs font-bold flex items-center gap-1.5 transition-colors"
                  >
                    <ExternalLink className="w-4 h-4" />
                    Mở Zalo Web / App
                  </a>

                  <button
                    type="button"
                    disabled={isSending || !msgBody.trim()}
                    onClick={() => handleSendAutomated(false)}
                    className="px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-bold flex items-center gap-1.5 transition-colors shadow-xs"
                  >
                    <Send className="w-4 h-4" />
                    {isSending
                      ? 'Đang gửi...'
                      : config.deliveryMode === 'webhook'
                      ? 'Gửi qua Webhook HTTPS'
                      : 'Gửi qua Zalo OA'}
                  </button>
                </div>

                {sendFeedback && (
                  <div
                    className={`p-3 rounded-xl border text-xs flex items-start gap-2 ${
                      sendFeedback.ok
                        ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                        : 'bg-amber-50 border-amber-200 text-amber-900'
                    }`}
                  >
                    {sendFeedback.ok ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                    ) : (
                      <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                    )}
                    <span>{sendFeedback.text}</span>
                  </div>
                )}
              </div>

              {/* Right: 1-Click Direct Zalo Chat to Student Parents */}
              <div className="lg:col-span-5 bg-slate-50 rounded-2xl border border-slate-200 p-3.5 flex flex-col max-h-[470px]">
                <div className="flex items-center justify-between gap-2 mb-2.5">
                  <div>
                    <h3 className="text-xs font-extrabold text-slate-900">
                      Nhắn Zalo trực tiếp Phụ huynh
                    </h3>
                    <p className="text-[11px] text-slate-500">
                      Bấm để mở khung chat Zalo theo SĐT bố/mẹ
                    </p>
                  </div>
                  <span className="text-[11px] font-bold bg-blue-100 text-blue-800 px-2 py-0.5 rounded-lg">
                    {filteredStudentsForZalo.length} HS
                  </span>
                </div>

                <div className="relative mb-2.5">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={studentSearch}
                    onChange={(e) => setStudentSearch(e.target.value)}
                    placeholder="Tìm tên HS, lớp hoặc SĐT..."
                    className="w-full pl-8 pr-3 py-1.5 text-xs bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div className="flex-1 overflow-y-auto space-y-2 pr-1">
                  {filteredStudentsForZalo.length === 0 ? (
                    <p className="text-xs text-slate-400 text-center py-8">
                      Không tìm thấy học sinh phù hợp.
                    </p>
                  ) : (
                    filteredStudentsForZalo.map((st) => {
                      const links = extractParentZaloLinks(st.parentPhone);
                      const routeObj = sortedRoutes.find((r) => r.id === st.routeId);
                      return (
                        <div
                          key={st.id}
                          className="bg-white rounded-xl border border-slate-200 p-2.5 flex items-center justify-between gap-2"
                        >
                          <div className="min-w-0">
                            <div className="text-xs font-bold text-slate-900 truncate">
                              {st.name}{' '}
                              <span className="text-[11px] font-semibold text-slate-500">
                                ({st.class})
                              </span>
                            </div>
                            <div className="text-[11px] text-slate-500 truncate">
                              {routeObj?.code || ''} • PH: {st.parentName || 'Chưa cập nhật'}
                            </div>
                          </div>

                          <div className="flex flex-wrap items-center gap-1 shrink-0">
                            {links.length === 0 ? (
                              <span className="text-[10px] text-slate-400 italic">Thiếu SĐT</span>
                            ) : (
                              links.map((lk, idx) => (
                                <a
                                  key={lk.display}
                                  href={lk.zaloUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="px-2 py-1 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 text-[11px] font-bold flex items-center gap-1 transition-colors"
                                  title={`Mở Zalo số ${lk.display}`}
                                >
                                  <Phone className="w-3 h-3" />
                                  {links.length > 1 ? `PH${idx + 1}` : 'Zalo'}
                                </a>
                              ))
                            )}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'config' && canConfigureZalo && (
            <div className="space-y-5">
              {/* Server Token Status */}
              <div
                className={`p-3.5 rounded-2xl border flex items-start gap-3 text-xs ${
                  hasServerToken
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                    : 'bg-slate-50 border-slate-200 text-slate-700'
                }`}
              >
                <ShieldCheck
                  className={`w-5 h-5 shrink-0 mt-0.5 ${
                    hasServerToken ? 'text-emerald-600' : 'text-slate-500'
                  }`}
                />
                <div className="space-y-1">
                  <div className="font-bold">
                    {hasServerToken
                      ? 'Máy chủ đã cấu hình ZALO_OA_ACCESS_TOKEN an toàn'
                      : 'Máy chủ chưa thiết lập ZALO_OA_ACCESS_TOKEN'}
                  </div>
                  <p className="text-[11px] leading-relaxed">
                    Khóa truy cập Zalo OA được giữ hoàn toàn ở biến môi trường máy chủ (không lưu
                    trên trình duyệt). Nếu chưa có Zalo OA, bạn vẫn có thể dùng chế độ{' '}
                    <strong>Webhook HTTPS</strong> (Make / n8n / Apps Script) hoặc{' '}
                    <strong>Gửi nhanh & Nhắn PH</strong> ngay lập tức.
                  </p>
                </div>
              </div>

              {/* Main Switch + Mode */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-4 rounded-2xl border border-slate-200 bg-white space-y-3">
                  <label className="flex items-center justify-between cursor-pointer">
                    <div>
                      <div className="text-sm font-extrabold text-slate-900">
                        Tự động gửi thông báo sang Zalo
                      </div>
                      <div className="text-xs text-slate-500">
                        Khi bật, các sự kiện được chọn bên dưới sẽ tự đẩy qua máy chủ
                      </div>
                    </div>
                    <input
                      type="checkbox"
                      checked={draftConfig.enabled}
                      onChange={(e) =>
                        setDraftConfig((prev) => ({ ...prev, enabled: e.target.checked }))
                      }
                      className="w-5 h-5 accent-blue-600 rounded"
                    />
                  </label>

                  <div className="pt-2 border-t border-slate-100 space-y-2">
                    <label className="block text-xs font-bold text-slate-700">
                      Phương thức gửi tự động
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() =>
                          setDraftConfig((prev) => ({ ...prev, deliveryMode: 'zalo_oa' }))
                        }
                        className={`px-3 py-2 rounded-xl border text-xs font-bold text-left transition-all ${
                          draftConfig.deliveryMode === 'zalo_oa'
                            ? 'bg-blue-50 border-blue-500 text-blue-800'
                            : 'bg-slate-50 border-slate-200 text-slate-600'
                        }`}
                      >
                        Zalo OA API v3
                        <span className="block text-[10px] font-normal text-slate-500 mt-0.5">
                          Gửi tới User ID đã theo dõi OA
                        </span>
                      </button>

                      <button
                        type="button"
                        onClick={() =>
                          setDraftConfig((prev) => ({ ...prev, deliveryMode: 'webhook' }))
                        }
                        className={`px-3 py-2 rounded-xl border text-xs font-bold text-left transition-all ${
                          draftConfig.deliveryMode === 'webhook'
                            ? 'bg-blue-50 border-blue-500 text-blue-800'
                            : 'bg-slate-50 border-slate-200 text-slate-600'
                        }`}
                      >
                        Webhook HTTPS
                        <span className="block text-[10px] font-normal text-slate-500 mt-0.5">
                          Make / n8n / Apps Script / Bot
                        </span>
                      </button>
                    </div>
                  </div>

                  {draftConfig.deliveryMode === 'webhook' ? (
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        Webhook HTTPS URL
                      </label>
                      <input
                        type="url"
                        value={draftConfig.webhookUrl}
                        onChange={(e) =>
                          setDraftConfig((prev) => ({ ...prev, webhookUrl: e.target.value }))
                        }
                        placeholder="https://hook.eu1.make.com/..."
                        className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                      <p className="text-[11px] text-slate-500 mt-1">
                        Chỉ chấp nhận địa chỉ HTTPS công khai. Máy chủ sẽ gửi JSON gồm title,
                        message, routeCode, sentBy.
                      </p>
                    </div>
                  ) : (
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        Zalo OA User ID mặc định (phân tách bằng dấu phẩy)
                      </label>
                      <input
                        type="text"
                        value={draftConfig.defaultRecipientIds}
                        onChange={(e) =>
                          setDraftConfig((prev) => ({
                            ...prev,
                            defaultRecipientIds: e.target.value,
                          }))
                        }
                        placeholder="Ví dụ: 3829104819201, 4910293847123"
                        className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  )}
                </div>

                {/* Event Triggers */}
                <div className="p-4 rounded-2xl border border-slate-200 bg-white space-y-2.5">
                  <div className="text-sm font-extrabold text-slate-900 mb-1">
                    Sự kiện tự động gửi Zalo
                  </div>
                  {(
                    [
                      ['notifyOnStopArrival', 'Xe đến điểm đón / trả học sinh'],
                      ['notifyOnDriverReport', 'Lái xe gửi báo cáo điểm danh ca sáng/chiều'],
                      ['notifyOnSupervisorLock', 'Giám sát chốt sổ & lưu CSDL'],
                      ['notifyOnParentAbsence', 'Phụ huynh báo xin nghỉ học / tự đưa đón'],
                      ['notifyOnEmptyBus', 'Lái xe xác nhận kiểm tra xe trống an toàn'],
                    ] as Array<[keyof ZaloConfig, string]>
                  ).map(([fieldKey, label]) => (
                    <label
                      key={fieldKey}
                      className="flex items-center justify-between gap-2 p-2 rounded-xl hover:bg-slate-50 cursor-pointer text-xs"
                    >
                      <span className="font-medium text-slate-700">{label}</span>
                      <input
                        type="checkbox"
                        checked={Boolean(draftConfig[fieldKey])}
                        onChange={(e) =>
                          setDraftConfig((prev) => ({ ...prev, [fieldKey]: e.target.checked }))
                        }
                        className="w-4 h-4 accent-blue-600 rounded"
                      />
                    </label>
                  ))}
                </div>
              </div>

              {/* Per-route Zalo OA User IDs */}
              {draftConfig.deliveryMode === 'zalo_oa' && (
                <div className="p-4 rounded-2xl border border-slate-200 bg-white space-y-3">
                  <div>
                    <h4 className="text-xs font-extrabold text-slate-900">
                      Zalo OA User ID nhận tin riêng theo từng tuyến xe (tuỳ chọn)
                    </h4>
                    <p className="text-[11px] text-slate-500">
                      Nhập danh sách User ID quản lý/giáo viên phụ trách từng tuyến (cách nhau dấu
                      phẩy). Hệ thống sẽ gộp cùng danh sách mặc định khi gửi.
                    </p>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    {sortedRoutes.map((r) => (
                      <div key={r.id} className="flex items-center gap-2">
                        <span className="text-xs font-bold text-slate-700 w-20 shrink-0">
                          {r.code}
                        </span>
                        <input
                          type="text"
                          value={draftConfig.routeRecipientIds?.[r.id] || ''}
                          onChange={(e) =>
                            setDraftConfig((prev) => ({
                              ...prev,
                              routeRecipientIds: {
                                ...(prev.routeRecipientIds || {}),
                                [r.id]: e.target.value,
                              },
                            }))
                          }
                          placeholder={`User ID nhận tin ${r.code}...`}
                          className="flex-1 px-2.5 py-1.5 text-xs border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleSaveZaloConfig}
                    className="px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold transition-colors"
                  >
                    Lưu cấu hình Zalo
                  </button>
                  <button
                    type="button"
                    disabled={isSending}
                    onClick={() => handleSendAutomated(true)}
                    className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-bold flex items-center gap-1.5 transition-colors"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    {isSending ? 'Đang thử...' : 'Gửi tin thử nghiệm'}
                  </button>
                </div>

                {configSavedNotice && (
                  <span className="text-xs font-bold text-emerald-700 flex items-center gap-1">
                    <CheckCircle2 className="w-4 h-4" />
                    Đã lưu & đồng bộ cấu hình Zalo!
                  </span>
                )}
              </div>

              {sendFeedback && (
                <div
                  className={`p-3 rounded-xl border text-xs flex items-start gap-2 ${
                    sendFeedback.ok
                      ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                      : 'bg-amber-50 border-amber-200 text-amber-900'
                  }`}
                >
                  {sendFeedback.ok ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                  ) : (
                    <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  )}
                  <span>{sendFeedback.text}</span>
                </div>
              )}
            </div>
          )}

          {activeTab === 'logs' && (
            <div className="space-y-2.5">
              {zaloLogs.length === 0 ? (
                <div className="text-center py-12 text-slate-400">
                  <History className="w-10 h-10 mx-auto mb-2 text-slate-300" />
                  <p className="text-sm font-semibold">Chưa có lịch sử gửi thông báo Zalo</p>
                  <p className="text-xs mt-1">
                    Các tin nhắn đã gửi qua Zalo OA, Webhook hoặc sao chép nhanh sẽ hiển thị tại đây.
                  </p>
                </div>
              ) : (
                zaloLogs.map((log) => (
                  <div
                    key={log.id}
                    className="p-3 rounded-2xl border border-slate-200 bg-slate-50/70 space-y-1"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <span
                          className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${
                            log.ok
                              ? 'bg-emerald-100 text-emerald-800'
                              : 'bg-rose-100 text-rose-800'
                          }`}
                        >
                          {log.ok ? 'Thành công' : 'Thất bại'}
                        </span>
                        <span className="text-xs font-extrabold text-slate-900 truncate">
                          {log.title}
                        </span>
                      </div>
                      <span className="text-[11px] text-slate-500 shrink-0">
                        {log.timestamp} • {log.recipientSummary}
                      </span>
                    </div>
                    <p className="text-xs text-slate-600 whitespace-pre-line line-clamp-3">
                      {log.message}
                    </p>
                    <p className="text-[11px] text-slate-500">{log.detail}</p>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
