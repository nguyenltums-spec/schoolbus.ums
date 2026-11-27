import React, { useState } from 'react';
import {
  Bell,
  X,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Sparkles,
  Volume2,
  Trash2,
  CheckCheck,
  ArrowRightLeft,
  MessageCircle
} from 'lucide-react';
import { AppNotification, UserRole } from '../../types';
import { playSound } from '../../services/notificationAudio';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  notifications: AppNotification[];
  onMarkAllAsRead: () => void;
  onClearAll: () => void;
  currentRole: UserRole;
  onSendTestNotification: () => void;
  onShareToZalo?: (prefill?: { title: string; message: string; routeId?: string }) => void;
}

export const NotificationDrawer: React.FC<Props> = ({
  isOpen,
  onClose,
  notifications,
  onMarkAllAsRead,
  onClearAll,
  currentRole,
  onSendTestNotification,
  onShareToZalo,
}) => {
  const [filter, setFilter] = useState<'all' | 'unread'>('all');
  const [browserPerm, setBrowserPerm] = useState<NotificationPermission>(
    typeof window !== 'undefined' && 'Notification' in window ? Notification.permission : 'default'
  );

  if (!isOpen) return null;

  const requestBrowserPermission = async () => {
    if ('Notification' in window) {
      const res = await Notification.requestPermission();
      setBrowserPerm(res);
      if (res === 'granted') {
        new Notification('SchoolBus Pro', {
          body: 'Đã bật thông báo đẩy thành công trên thiết bị!',
          icon: '/favicon.ico',
        });
        playSound('success');
      }
    }
  };

  const filtered = notifications.filter((n) => {
    if (filter === 'unread') return !n.isRead;
    return true;
  });

  const getIconForType = (type: AppNotification['type']) => {
    switch (type) {
      case 'arrival':
        return <Clock className="w-4 h-4 text-amber-500" />;
      case 'boarded':
      case 'school_arrival':
        return <CheckCircle2 className="w-4 h-4 text-emerald-500" />;
      case 'alert':
        return <AlertTriangle className="w-4 h-4 text-rose-500" />;
      case 'lock':
        return <Sparkles className="w-4 h-4 text-blue-500" />;
      case 'transfer':
        return <ArrowRightLeft className="w-4 h-4 text-purple-600" />;
      default:
        return <Bell className="w-4 h-4 text-slate-500" />;
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-hidden bg-slate-900/50 backdrop-blur-xs flex justify-end animate-in fade-in duration-200">
      <div className="w-full max-w-md bg-white h-full shadow-2xl flex flex-col border-l border-slate-200 animate-in slide-in-from-right duration-300">
        {/* Header */}
        <div className="p-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-blue-100 text-blue-700 rounded-xl">
              <Bell className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-slate-800 text-base">Thông Báo Đẩy Thời Gian Thực</h3>
              <p className="text-xs text-slate-500">Cập nhật lộ trình xe & trạng thái học sinh</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-200 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Browser Push Permission Banner */}
        {browserPerm !== 'granted' && typeof window !== 'undefined' && 'Notification' in window && (
          <div className="p-3 bg-amber-50 border-b border-amber-200 flex items-center justify-between text-xs">
            <div className="text-amber-800">
              <span className="font-semibold">Nhận thông báo khi xe đến điểm:</span> Bật thông báo đẩy trên trình duyệt.
            </div>
            <button
              onClick={requestBrowserPermission}
              className="px-2.5 py-1 bg-amber-600 text-white font-semibold rounded-lg hover:bg-amber-700 text-xs shrink-0 ml-2"
            >
              Cho phép
            </button>
          </div>
        )}

        {/* Filter & Actions Bar */}
        <div className="p-3 bg-white border-b border-slate-100 flex items-center justify-between text-xs">
          <div className="flex gap-1">
            <button
              onClick={() => setFilter('all')}
              className={`px-3 py-1 rounded-lg font-medium transition-colors ${
                filter === 'all' ? 'bg-blue-600 text-white' : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              Tất cả ({notifications.length})
            </button>
            <button
              onClick={() => setFilter('unread')}
              className={`px-3 py-1 rounded-lg font-medium transition-colors ${
                filter === 'unread' ? 'bg-blue-600 text-white' : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              Chưa đọc ({notifications.filter((n) => !n.isRead).length})
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={onMarkAllAsRead}
              title="Đánh dấu tất cả đã đọc"
              className="p-1.5 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
            >
              <CheckCheck className="w-4 h-4" />
            </button>
            <button
              onClick={onClearAll}
              title="Xóa tất cả thông báo"
              className="p-1.5 text-slate-500 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Notifications List */}
        <div className="flex-1 overflow-y-auto p-3 space-y-2.5 divide-y divide-slate-100">
          {filtered.length === 0 ? (
            <div className="text-center py-12 text-slate-400">
              <Bell className="w-10 h-10 mx-auto mb-2 text-slate-300" />
              <p className="text-sm font-medium">Không có thông báo mới</p>
              <p className="text-xs text-slate-400 mt-1">Các sự kiện đón/trả học sinh sẽ hiển thị ở đây</p>
            </div>
          ) : (
            filtered.map((n) => (
              <div
                key={n.id}
                className={`pt-2.5 first:pt-0 flex gap-3 p-3 rounded-xl transition-colors ${
                  !n.isRead ? 'bg-blue-50/70 border border-blue-100' : 'hover:bg-slate-50'
                }`}
              >
                <div className="w-8 h-8 rounded-full bg-white shadow-xs border border-slate-200 flex items-center justify-center shrink-0 mt-0.5">
                  {getIconForType(n.type)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <h4 className="text-xs font-bold text-slate-900 truncate">{n.title}</h4>
                    <span className="text-[10px] text-slate-400 shrink-0">{n.timestamp}</span>
                  </div>
                  <p className="text-xs text-slate-600 mt-1 leading-relaxed">{n.message}</p>
                  {onShareToZalo && currentRole !== 'parent' && (
                    <div className="mt-1.5 flex justify-end">
                      <button
                        type="button"
                        onClick={() => {
                          onClose();
                          onShareToZalo({
                            title: n.title,
                            message: n.message,
                            routeId: n.routeId,
                          });
                        }}
                        className="px-2 py-0.5 rounded-lg bg-sky-50 hover:bg-sky-100 text-sky-700 border border-sky-200 text-[11px] font-bold inline-flex items-center gap-1 transition-colors"
                      >
                        <MessageCircle className="w-3 h-3" />
                        Gửi qua Zalo
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))
          )}
        </div>

        {/* Simulation / Test Trigger in footer */}
        <div className="p-3 bg-slate-50 border-t border-slate-200 flex items-center justify-between gap-2 text-xs">
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                playSound('arrival');
                onSendTestNotification();
              }}
              className="px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 font-semibold rounded-lg flex items-center gap-1.5 border border-blue-200 transition-colors"
            >
              <Sparkles className="w-3.5 h-3.5" />
              Gửi thử
            </button>

            {onShareToZalo && currentRole !== 'parent' && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onShareToZalo();
                }}
                className="px-3 py-1.5 bg-sky-600 hover:bg-sky-700 text-white font-semibold rounded-lg flex items-center gap-1.5 transition-colors"
              >
                <MessageCircle className="w-3.5 h-3.5" />
                Mở Zalo
              </button>
            )}
          </div>

          <button
            onClick={() => playSound('beep')}
            title="Thử âm thanh chuông"
            className="p-1.5 text-slate-500 hover:text-slate-800 rounded-lg hover:bg-slate-200"
          >
            <Volume2 className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};
