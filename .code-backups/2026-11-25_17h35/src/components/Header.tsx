import React from 'react';
import {
  Bus,
  ShieldCheck,
  Users,
  Settings,
  Bell,
  FileSpreadsheet,
  CheckCircle,
  TrendingUp,
  Clock,
  KeyRound,
  LogOut,
  Shield,
} from 'lucide-react';
import { UserRole, GoogleSheetsConfig, UserAccount, RoleDefinition, PermissionKey } from '../types';
import { getAllowedViewsForPermissions, getRoleBadgeClass } from '../services/authService';

interface Props {
  currentRole: UserRole;
  onSelectRole: (role: UserRole) => void;
  unreadNotifCount: number;
  onOpenNotifications: () => void;
  onOpenSheetsModal: () => void;
  sheetsConfig: GoogleSheetsConfig;
  activeSessionType: 'morning' | 'afternoon';
  onToggleSessionType: (type: 'morning' | 'afternoon') => void;
  currentUser: UserAccount;
  currentRoleDef: RoleDefinition;
  userPermissions: PermissionKey[];
  onOpenChangePassword: () => void;
  onLogout: () => void;
}

export const Header: React.FC<Props> = ({
  currentRole,
  onSelectRole,
  unreadNotifCount,
  onOpenNotifications,
  onOpenSheetsModal,
  sheetsConfig,
  activeSessionType,
  onToggleSessionType,
  currentUser,
  currentRoleDef,
  userPermissions,
  onOpenChangePassword,
  onLogout,
}) => {
  const allowedViews = getAllowedViewsForPermissions(userPermissions);
  const canManageSheets = userPermissions.includes('manage_sheets');

  const allRoles: Array<{ id: UserRole; label: string; icon: React.ReactNode; desc: string }> = [
    {
      id: 'driver',
      label: 'Lái xe / Phụ xe',
      icon: <Bus className="w-4 h-4" />,
      desc: 'Đón học sinh, báo đến điểm, kiểm tra xe',
    },
    {
      id: 'supervisor',
      label: 'Giám sát trường',
      icon: <ShieldCheck className="w-4 h-4" />,
      desc: 'Kiểm soát vào/ra cổng, chốt sổ sáng/chiều',
    },
    {
      id: 'parent',
      label: 'Phụ huynh',
      icon: <Users className="w-4 h-4" />,
      desc: 'Theo dõi lộ trình, báo nghỉ học, nhận tin',
    },
    {
      id: 'admin',
      label: 'Quản trị hệ thống',
      icon: <Settings className="w-4 h-4" />,
      desc: 'Học sinh, tuyến xe, tài khoản & phân quyền',
    },
    {
      id: 'analytics',
      label: 'Biểu Đồ Thống Kê',
      icon: <TrendingUp className="w-4 h-4" />,
      desc: 'Biểu đồ Recharts xu hướng đi xe theo ngày',
    },
  ];

  const visibleRoles = allRoles.filter((r) => allowedViews.includes(r.id));

  return (
    <header className="bg-white border-b border-slate-200 sticky top-0 z-30 shadow-xs">
      {/* Top Banner with branding & meta */}
      <div className="max-w-7xl mx-auto px-3 sm:px-6 py-2.5 flex items-center justify-between border-b border-slate-100 gap-2">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center text-white shadow-md shadow-amber-500/20 shrink-0">
            <Bus className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <h1 className="font-extrabold text-base sm:text-lg text-slate-900 tracking-tight truncate">
                SchoolBus Pro
              </h1>
              <span className="text-[10px] font-bold bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded-full uppercase tracking-wider hidden sm:inline">
                Bảo Vệ Học Sinh
              </span>
            </div>
            <p className="text-[11px] text-slate-500 hidden lg:block">
              Hệ thống kiểm soát xe tuyến 2 chiều & thông báo phụ huynh tức thời
            </p>
          </div>
        </div>

        {/* Global actions: Session Switcher + Sheets Sync + Notifications + User Menu */}
        <div className="flex items-center gap-1.5 sm:gap-2.5 shrink-0">
          {/* Morning / Afternoon Mode Toggle */}
          <div className="inline-flex p-1 bg-slate-100 rounded-xl border border-slate-200 text-xs font-semibold">
            <button
              onClick={() => onToggleSessionType('morning')}
              className={`px-2 sm:px-3 py-1 rounded-lg transition-all flex items-center gap-1 ${
                activeSessionType === 'morning'
                  ? 'bg-amber-500 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Clock className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Sáng đi đón</span>
              <span className="sm:hidden">Sáng</span>
            </button>
            <button
              onClick={() => onToggleSessionType('afternoon')}
              className={`px-2 sm:px-3 py-1 rounded-lg transition-all flex items-center gap-1 ${
                activeSessionType === 'afternoon'
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Clock className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Chiều về trả</span>
              <span className="sm:hidden">Chiều</span>
            </button>
          </div>

          {/* Google Sheets Sync Indicator button */}
          {canManageSheets && (
            <button
              onClick={onOpenSheetsModal}
              className={`hidden md:flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-semibold border transition-all ${
                sheetsConfig.webhookUrl
                  ? 'bg-emerald-50 text-emerald-800 border-emerald-300 hover:bg-emerald-100'
                  : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
              }`}
            >
              <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
              <span>{sheetsConfig.webhookUrl ? 'Google Sheet: Đã kết nối' : 'Kết nối Google Sheets'}</span>
              {sheetsConfig.webhookUrl && <CheckCircle className="w-3.5 h-3.5 text-emerald-600" />}
            </button>
          )}

          {/* Notification Bell Button */}
          <button
            onClick={onOpenNotifications}
            className="relative p-2 rounded-xl text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors"
            title="Thông báo đẩy thời gian thực"
          >
            <Bell className="w-5 h-5" />
            {unreadNotifCount > 0 && (
              <>
                <span className="absolute top-1.5 right-1.5 w-2.5 h-2.5 bg-rose-500 rounded-full animate-pulse-ring" />
                <span className="absolute -top-1 -right-1 bg-rose-600 text-white text-[10px] font-bold rounded-full h-5 min-w-[20px] px-1 flex items-center justify-center border-2 border-white shadow-xs">
                  {unreadNotifCount}
                </span>
              </>
            )}
          </button>

          {/* Logged-in User Account Controls */}
          <div className="flex items-center gap-1.5 pl-2 border-l border-slate-200">
            <div className="hidden xl:flex flex-col items-end leading-tight mr-1">
              <span className="text-xs font-extrabold text-slate-900">{currentUser.fullName}</span>
              <span
                className={`inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded border mt-0.5 ${getRoleBadgeClass(
                  currentRoleDef.color
                )}`}
              >
                <Shield className="w-2.5 h-2.5" />
                {currentRoleDef.name}
              </span>
            </div>

            <button
              type="button"
              onClick={onOpenChangePassword}
              className="px-2 sm:px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold flex items-center gap-1 transition-colors"
              title="Đổi mật khẩu cá nhân"
            >
              <KeyRound className="w-3.5 h-3.5 text-blue-600" />
              <span className="hidden sm:inline">Đổi MK</span>
            </button>

            <button
              type="button"
              onClick={onLogout}
              className="px-2 sm:px-2.5 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-xl text-xs font-bold flex items-center gap-1 transition-colors"
              title="Đăng xuất tài khoản"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Đăng xuất</span>
            </button>
          </div>
        </div>
      </div>

      {/* Role Navigation Bar (Filtered by RBAC Permissions) */}
      <div className="max-w-7xl mx-auto px-3 sm:px-6 py-2 overflow-x-auto">
        <div className="flex items-center justify-between min-w-max gap-3">
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mr-1 hidden sm:inline">
              Khu vực được cấp quyền:
            </span>
            {visibleRoles.map((r) => {
              const active = currentRole === r.id;
              return (
                <button
                  key={r.id}
                  onClick={() => onSelectRole(r.id)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${
                    active
                      ? 'bg-slate-900 text-white shadow-sm ring-2 ring-slate-900/10'
                      : 'bg-slate-100/80 text-slate-600 hover:bg-slate-200 hover:text-slate-900'
                  }`}
                >
                  <span className={active ? 'text-amber-400' : 'text-slate-500'}>{r.icon}</span>
                  <span>{r.label}</span>
                </button>
              );
            })}
          </div>

          <div className="text-[11px] text-slate-500 flex items-center gap-1.5 font-medium xl:hidden">
            <span className="font-bold text-slate-800">{currentUser.fullName}</span>
            <span
              className={`px-1.5 py-0.5 rounded border text-[10px] font-bold ${getRoleBadgeClass(
                currentRoleDef.color
              )}`}
            >
              {currentRoleDef.name}
            </span>
          </div>
        </div>
      </div>
    </header>
  );
};
