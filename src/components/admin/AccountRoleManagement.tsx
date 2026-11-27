import React, { useState } from 'react';
import {
  Users,
  Shield,
  Plus,
  Search,
  Edit2,
  Trash2,
  KeyRound,
  Lock,
  Unlock,
  CheckCircle2,
  AlertCircle,
  Copy,
  RefreshCw,
  X,
  Phone,
  Mail,
  Bus,
  Check,
  ShieldCheck,
} from 'lucide-react';
import { PermissionKey, RoleDefinition, Route, Student, UserAccount } from '../../types';
import {
  ALL_PERMISSIONS,
  PERMISSION_CATALOG,
  ROLE_COLORS,
  generateRandomPassword,
  getRoleBadgeClass,
  hashPassword,
} from '../../services/authService';
import { playSound } from '../../services/notificationAudio';

interface Props {
  currentUser: UserAccount;
  accounts: UserAccount[];
  roles: RoleDefinition[];
  routes: Route[];
  students: Student[];
  onAddAccount: (account: UserAccount) => void;
  onUpdateAccount: (account: UserAccount) => void;
  onDeleteAccount: (accountId: string) => void;
  onResetPassword: (accountId: string, newPassword: string, mustChangePassword: boolean) => void;
  onAddRole: (role: RoleDefinition) => void;
  onUpdateRole: (role: RoleDefinition) => void;
  onDeleteRole: (roleId: string, migrateToRoleId: string) => void;
}

export const AccountRoleManagement: React.FC<Props> = ({
  currentUser,
  accounts,
  roles,
  routes,
  students,
  onAddAccount,
  onUpdateAccount,
  onDeleteAccount,
  onResetPassword,
  onAddRole,
  onUpdateRole,
  onDeleteRole,
}) => {
  const [subTab, setSubTab] = useState<'accounts' | 'roles'>('accounts');
  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('all');
  const [bannerMsg, setBannerMsg] = useState<string | null>(null);

  // Account Add/Edit Modal
  const [showAccountModal, setShowAccountModal] = useState(false);
  const [editingAccount, setEditingAccount] = useState<UserAccount | null>(null);
  const [accountFormError, setAccountFormError] = useState<string | null>(null);
  const [accountForm, setAccountForm] = useState<{
    username: string;
    fullName: string;
    phone: string;
    email: string;
    password: string;
    roleId: string;
    assignedRouteId: string;
    assignedStudentId: string;
    isActive: boolean;
    mustChangePassword: boolean;
  }>({
    username: '',
    fullName: '',
    phone: '',
    email: '',
    password: '',
    roleId: roles[1]?.id || roles[0]?.id || '',
    assignedRouteId: 'all',
    assignedStudentId: '',
    isActive: true,
    mustChangePassword: false,
  });

  // Reset Password Modal
  const [resetTarget, setResetTarget] = useState<UserAccount | null>(null);
  const [resetNewPass, setResetNewPass] = useState('');
  const [resetForceChange, setResetForceChange] = useState(true);
  const [resetCopied, setResetCopied] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);

  // Delete Account Confirm Modal
  const [deleteAccountTarget, setDeleteAccountTarget] = useState<UserAccount | null>(null);

  // Role Add/Edit Modal
  const [showRoleModal, setShowRoleModal] = useState(false);
  const [editingRole, setEditingRole] = useState<RoleDefinition | null>(null);
  const [roleFormError, setRoleFormError] = useState<string | null>(null);
  const [roleForm, setRoleForm] = useState<{
    name: string;
    description: string;
    color: string;
    permissions: PermissionKey[];
  }>({
    name: '',
    description: '',
    color: 'blue',
    permissions: ['view_driver'],
  });

  // Delete Role Confirm Modal
  const [deleteRoleTarget, setDeleteRoleTarget] = useState<RoleDefinition | null>(null);
  const [migrateRoleId, setMigrateRoleId] = useState<string>('');

  const showSuccess = (msg: string) => {
    setBannerMsg(msg);
    setTimeout(() => setBannerMsg(null), 5000);
  };

  const filteredAccounts = accounts.filter((acc) => {
    const matchRole = roleFilter === 'all' || acc.roleId === roleFilter;
    const q = searchTerm.trim().toLowerCase();
    const matchSearch =
      !q ||
      acc.username.toLowerCase().includes(q) ||
      acc.fullName.toLowerCase().includes(q) ||
      (acc.phone || '').toLowerCase().includes(q) ||
      (acc.email || '').toLowerCase().includes(q);
    return matchRole && matchSearch;
  });

  const activeAccountCount = accounts.filter((a) => a.isActive).length;
  const lockedAccountCount = accounts.length - activeAccountCount;

  // --- Account CRUD Handlers ---
  const openAddAccountModal = () => {
    setEditingAccount(null);
    setAccountFormError(null);
    setAccountForm({
      username: '',
      fullName: '',
      phone: '',
      email: '',
      password: '',
      roleId: roles.find((r) => !r.isSystemAdmin)?.id || roles[0]?.id || '',
      assignedRouteId: 'all',
      assignedStudentId: '',
      isActive: true,
      mustChangePassword: false,
    });
    setShowAccountModal(true);
  };

  const openEditAccountModal = (acc: UserAccount) => {
    setEditingAccount(acc);
    setAccountFormError(null);
    setAccountForm({
      username: acc.username,
      fullName: acc.fullName,
      phone: acc.phone || '',
      email: acc.email || '',
      password: '',
      roleId: acc.roleId,
      assignedRouteId: acc.assignedRouteId || 'all',
      assignedStudentId: acc.assignedStudentId || '',
      isActive: acc.isActive,
      mustChangePassword: !!acc.mustChangePassword,
    });
    setShowAccountModal(true);
  };

  const handleSaveAccount = (e: React.FormEvent) => {
    e.preventDefault();
    setAccountFormError(null);

    const cleanUsername = accountForm.username.trim().toLowerCase();
    const cleanName = accountForm.fullName.trim();

    if (!cleanUsername || cleanUsername.length < 3 || /\s/.test(cleanUsername)) {
      setAccountFormError('Tên đăng nhập phải từ 3 ký tự trở lên và không chứa khoảng trắng.');
      return;
    }

    if (!cleanName) {
      setAccountFormError('Vui lòng nhập họ và tên người dùng.');
      return;
    }

    const duplicate = accounts.find(
      (a) => a.username.toLowerCase() === cleanUsername && a.id !== editingAccount?.id
    );
    if (duplicate) {
      setAccountFormError(`Tên đăng nhập "${cleanUsername}" đã tồn tại. Vui lòng chọn tên khác.`);
      return;
    }

    if (editingAccount) {
      // Prevent admin from locking themselves or downgrading themselves out of manage_accounts
      const targetRole = roles.find((r) => r.id === accountForm.roleId);
      if (editingAccount.id === currentUser.id) {
        if (!accountForm.isActive) {
          setAccountFormError('Không thể tự khóa tài khoản Admin đang đăng nhập.');
          return;
        }
        if (!targetRole?.permissions.includes('manage_accounts')) {
          setAccountFormError('Không thể tự gỡ quyền Quản trị tài khoản của chính mình.');
          return;
        }
      }

      onUpdateAccount({
        ...editingAccount,
        username: cleanUsername,
        fullName: cleanName,
        phone: accountForm.phone.trim() || undefined,
        email: accountForm.email.trim() || undefined,
        roleId: accountForm.roleId,
        assignedRouteId: accountForm.assignedRouteId || 'all',
        assignedStudentId: accountForm.assignedStudentId || undefined,
        isActive: accountForm.isActive,
        mustChangePassword: accountForm.mustChangePassword,
      });
      playSound('success');
      setShowAccountModal(false);
      showSuccess(`Đã cập nhật thông tin tài khoản "${cleanUsername}".`);
    } else {
      if (accountForm.password.length < 6) {
        setAccountFormError('Mật khẩu khởi tạo phải có ít nhất 6 ký tự.');
        return;
      }

      const newAcc: UserAccount = {
        id: `acc-${Date.now()}`,
        username: cleanUsername,
        fullName: cleanName,
        phone: accountForm.phone.trim() || undefined,
        email: accountForm.email.trim() || undefined,
        passwordHash: hashPassword(accountForm.password),
        roleId: accountForm.roleId,
        assignedRouteId: accountForm.assignedRouteId || 'all',
        assignedStudentId: accountForm.assignedStudentId || undefined,
        isActive: accountForm.isActive,
        mustChangePassword: accountForm.mustChangePassword,
        createdAt: new Date().toISOString().split('T')[0],
      };

      onAddAccount(newAcc);
      playSound('success');
      setShowAccountModal(false);
      showSuccess(`Đã tạo tài khoản mới "${cleanUsername}" thành công!`);
    }
  };

  // --- Reset Password Handlers ---
  const openResetPasswordModal = (acc: UserAccount) => {
    setResetTarget(acc);
    setResetNewPass(generateRandomPassword(8));
    setResetForceChange(true);
    setResetCopied(false);
    setResetError(null);
  };

  const handleCopyResetPass = async () => {
    if (!resetNewPass) return;
    try {
      await navigator.clipboard.writeText(resetNewPass);
      setResetCopied(true);
      setTimeout(() => setResetCopied(false), 2000);
    } catch {
      // Clipboard fallback ignored
    }
  };

  const handleConfirmResetPassword = (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetTarget) return;
    if (resetNewPass.trim().length < 6) {
      setResetError('Mật khẩu cấp lại phải có ít nhất 6 ký tự.');
      return;
    }

    onResetPassword(resetTarget.id, resetNewPass.trim(), resetForceChange);
    playSound('success');
    const uname = resetTarget.username;
    setResetTarget(null);
    showSuccess(`Đã cấp lại mật khẩu mới cho tài khoản "${uname}".`);
  };

  // --- Role CRUD Handlers ---
  const openAddRoleModal = () => {
    setEditingRole(null);
    setRoleFormError(null);
    setRoleForm({
      name: '',
      description: '',
      color: 'indigo',
      permissions: ['view_driver'],
    });
    setShowRoleModal(true);
  };

  const openEditRoleModal = (role: RoleDefinition) => {
    setEditingRole(role);
    setRoleFormError(null);
    setRoleForm({
      name: role.name,
      description: role.description,
      color: role.color,
      permissions: [...role.permissions],
    });
    setShowRoleModal(true);
  };

  const toggleRolePermission = (perm: PermissionKey) => {
    if (editingRole?.isSystemAdmin) return;
    setRoleForm((prev) => {
      const exists = prev.permissions.includes(perm);
      return {
        ...prev,
        permissions: exists
          ? prev.permissions.filter((p) => p !== perm)
          : [...prev.permissions, perm],
      };
    });
  };

  const handleSaveRole = (e: React.FormEvent) => {
    e.preventDefault();
    setRoleFormError(null);
    const cleanName = roleForm.name.trim();
    if (!cleanName) {
      setRoleFormError('Vui lòng nhập tên nhóm quyền.');
      return;
    }

    const finalPerms = editingRole?.isSystemAdmin
      ? [...ALL_PERMISSIONS]
      : roleForm.permissions;

    if (finalPerms.length === 0) {
      setRoleFormError('Vui lòng chọn ít nhất 1 quyền hạn cho nhóm quyền này.');
      return;
    }

    if (editingRole) {
      onUpdateRole({
        ...editingRole,
        name: cleanName,
        description: roleForm.description.trim() || 'Nhóm quyền tùy chỉnh',
        color: roleForm.color,
        permissions: finalPerms,
      });
      playSound('success');
      setShowRoleModal(false);
      showSuccess(`Đã cập nhật nhóm quyền "${cleanName}".`);
    } else {
      const newRole: RoleDefinition = {
        id: `role-${Date.now()}`,
        name: cleanName,
        description: roleForm.description.trim() || 'Nhóm quyền tùy chỉnh',
        color: roleForm.color,
        permissions: finalPerms,
        createdAt: new Date().toISOString().split('T')[0],
      };
      onAddRole(newRole);
      playSound('success');
      setShowRoleModal(false);
      showSuccess(`Đã thêm nhóm quyền mới "${cleanName}"!`);
    }
  };

  const openDeleteRoleModal = (role: RoleDefinition) => {
    const fallbackRole = roles.find((r) => r.id !== role.id && !r.isSystemAdmin) || roles.find((r) => r.id !== role.id);
    setMigrateRoleId(fallbackRole?.id || '');
    setDeleteRoleTarget(role);
  };

  const handleConfirmDeleteRole = () => {
    if (!deleteRoleTarget || deleteRoleTarget.isSystemAdmin) return;
    onDeleteRole(deleteRoleTarget.id, migrateRoleId);
    playSound('beep');
    const deletedName = deleteRoleTarget.name;
    setDeleteRoleTarget(null);
    showSuccess(`Đã xóa nhóm quyền "${deletedName}".`);
  };

  return (
    <div className="space-y-4">
      {/* Header & Summary Banner */}
      <div className="bg-white rounded-xl border border-slate-200 px-3.5 py-2.5 flex flex-wrap items-center justify-between gap-2.5">
        <div className="flex items-center gap-2.5 min-w-0">
          <ShieldCheck className="w-4 h-4 text-rose-600 shrink-0" />
          <h2 className="font-bold text-slate-900 text-sm truncate">
            Quản Trị Tài Khoản & Phân Quyền
          </h2>
          <span className="hidden md:inline text-xs text-slate-500 tabular-nums whitespace-nowrap">
            ({activeAccountCount} hoạt động{lockedAccountCount > 0 ? ` · ${lockedAccountCount} khóa` : ''})
          </span>
        </div>

        <div className="inline-flex p-0.5 bg-slate-100 rounded-lg border border-slate-200 gap-0.5 shrink-0">
          <button
            type="button"
            onClick={() => setSubTab('accounts')}
            className={`px-3 py-1.5 rounded-md text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap transition-colors ${
              subTab === 'accounts'
                ? 'bg-slate-900 text-white'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            <span>Tài Khoản ({accounts.length})</span>
          </button>
          <button
            type="button"
            onClick={() => setSubTab('roles')}
            className={`px-3 py-1.5 rounded-md text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap transition-colors ${
              subTab === 'roles'
                ? 'bg-rose-600 text-white'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Shield className="w-3.5 h-3.5" />
            <span>Phân Quyền ({roles.length})</span>
          </button>
        </div>
      </div>

      {bannerMsg && (
        <div className="px-3.5 py-2 bg-emerald-50 border border-emerald-200 text-emerald-900 rounded-xl flex items-center justify-between gap-3 text-xs font-semibold">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{bannerMsg}</span>
          </div>
          <button
            type="button"
            onClick={() => setBannerMsg(null)}
            className="p-1 rounded text-emerald-700 hover:bg-emerald-100"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* SUB-TAB 1: ACCOUNTS MANAGEMENT */}
      {subTab === 'accounts' && (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          {/* Toolbar */}
          <div className="px-3.5 py-2.5 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Tìm tên, username, SĐT..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-8 pr-3 py-1.5 bg-white rounded-lg border border-slate-300 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 w-48 sm:w-60"
                />
              </div>

              <select
                value={roleFilter}
                onChange={(e) => setRoleFilter(e.target.value)}
                className="py-1.5 px-2.5 bg-white border border-slate-300 rounded-lg text-xs font-semibold text-slate-700"
              >
                <option value="all">Tất cả nhóm quyền ({accounts.length})</option>
                {roles.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
            </div>

            <button
              type="button"
              onClick={openAddAccountModal}
              className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 whitespace-nowrap transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Tạo tài khoản mới</span>
            </button>
          </div>

          {/* Compact Single-Row Accounts Table */}
          <div className="overflow-auto max-h-[55vh] min-h-[240px]">
            <table className="w-full text-left border-collapse text-xs">
              <thead className="text-slate-600 font-bold uppercase tracking-wider text-[11px]">
                <tr>
                  <th className="sticky top-0 z-10 bg-slate-100 shadow-[inset_0_-1px_0_0_#cbd5e1] py-2 px-3 w-10 text-center">STT</th>
                  <th className="sticky top-0 z-10 bg-slate-100 shadow-[inset_0_-1px_0_0_#cbd5e1] py-2 px-2.5">Họ và tên</th>
                  <th className="sticky top-0 z-10 bg-slate-100 shadow-[inset_0_-1px_0_0_#cbd5e1] py-2 px-2.5 whitespace-nowrap">Tài khoản</th>
                  <th className="sticky top-0 z-10 bg-slate-100 shadow-[inset_0_-1px_0_0_#cbd5e1] py-2 px-2.5 whitespace-nowrap">Nhóm quyền</th>
                  <th className="sticky top-0 z-10 bg-slate-100 shadow-[inset_0_-1px_0_0_#cbd5e1] py-2 px-2.5 whitespace-nowrap">Tuyến phụ trách</th>
                  <th className="sticky top-0 z-10 bg-slate-100 shadow-[inset_0_-1px_0_0_#cbd5e1] py-2 px-2.5 whitespace-nowrap">SĐT</th>
                  <th className="sticky top-0 z-10 bg-slate-100 shadow-[inset_0_-1px_0_0_#cbd5e1] py-2 px-2.5 whitespace-nowrap">Trạng thái</th>
                  <th className="sticky top-0 z-10 bg-slate-100 shadow-[inset_0_-1px_0_0_#cbd5e1] py-2 px-3 text-right whitespace-nowrap">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredAccounts.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="text-center py-8 text-slate-400">
                      Không tìm thấy tài khoản nào khớp bộ lọc.
                    </td>
                  </tr>
                ) : (
                  filteredAccounts.map((acc, idx) => {
                    const roleDef = roles.find((r) => r.id === acc.roleId);
                    const assignedRoute = routes.find((r) => r.id === acc.assignedRouteId);
                    const isSelf = acc.id === currentUser.id;

                    return (
                      <tr key={acc.id} className="hover:bg-slate-50 transition-colors">
                        <td className="py-1.5 px-3 text-center text-slate-400 font-mono tabular-nums">
                          {idx + 1}
                        </td>
                        <td className="py-1.5 px-2.5 whitespace-nowrap">
                          <span className="font-semibold text-slate-900">{acc.fullName}</span>
                          {isSelf && (
                            <span className="ml-1.5 text-[10px] font-bold text-blue-700">
                              (Bạn)
                            </span>
                          )}
                        </td>
                        <td className="py-1.5 px-2.5 font-mono text-slate-600 whitespace-nowrap">
                          @{acc.username}
                        </td>
                        <td className="py-1.5 px-2.5 whitespace-nowrap">
                          <span
                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded border text-[11px] font-semibold ${getRoleBadgeClass(
                              roleDef?.color || 'slate'
                            )}`}
                          >
                            {roleDef?.name || 'Chưa phân quyền'}
                          </span>
                        </td>
                        <td className="py-1.5 px-2.5 whitespace-nowrap">
                          {assignedRoute ? (
                            <span className="font-mono font-bold text-blue-700">
                              {assignedRoute.code}
                            </span>
                          ) : (
                            <span className="text-slate-400">Tất cả</span>
                          )}
                        </td>
                        <td className="py-1.5 px-2.5 font-mono text-slate-700 whitespace-nowrap tabular-nums">
                          {acc.phone || '—'}
                        </td>
                        <td className="py-1.5 px-2.5 whitespace-nowrap">
                          <span className={`font-semibold ${acc.isActive ? 'text-emerald-700' : 'text-rose-600'}`}>
                            {acc.isActive ? 'Hoạt động' : 'Đã khóa'}
                          </span>
                          {acc.mustChangePassword && (
                            <span className="ml-1.5 text-[10px] font-semibold text-amber-700">
                              · Chờ đổi MK
                            </span>
                          )}
                        </td>
                        <td className="py-1.5 px-3 text-right whitespace-nowrap">
                          <div className="inline-flex items-center justify-end gap-1">
                            <button
                              type="button"
                              onClick={() => openResetPasswordModal(acc)}
                              className="px-2 py-1 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 rounded text-[11px] font-semibold inline-flex items-center gap-1 transition-colors"
                              title="Cấp lại mật khẩu mới"
                            >
                              <KeyRound className="w-3 h-3" />
                              <span className="hidden sm:inline">Cấp MK</span>
                            </button>

                            <button
                              type="button"
                              onClick={() => openEditAccountModal(acc)}
                              className="p-1 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
                              title="Chỉnh sửa tài khoản"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>

                            <button
                              type="button"
                              disabled={isSelf}
                              onClick={() => {
                                onUpdateAccount({ ...acc, isActive: !acc.isActive });
                                playSound('beep');
                                showSuccess(
                                  acc.isActive
                                    ? `Đã khóa tài khoản "${acc.username}".`
                                    : `Đã mở khóa tài khoản "${acc.username}".`
                                );
                              }}
                              className={`p-1 rounded transition-colors ${
                                isSelf
                                  ? 'text-slate-300 cursor-not-allowed'
                                  : acc.isActive
                                  ? 'text-slate-500 hover:text-amber-600 hover:bg-amber-50'
                                  : 'text-emerald-600 hover:bg-emerald-50'
                              }`}
                              title={
                                isSelf
                                  ? 'Không thể tự khóa tài khoản đang đăng nhập'
                                  : acc.isActive
                                  ? 'Tạm khóa tài khoản'
                                  : 'Mở khóa tài khoản'
                              }
                            >
                              {acc.isActive ? <Lock className="w-3.5 h-3.5" /> : <Unlock className="w-3.5 h-3.5" />}
                            </button>

                            <button
                              type="button"
                              disabled={isSelf}
                              onClick={() => setDeleteAccountTarget(acc)}
                              className={`p-1 rounded transition-colors ${
                                isSelf
                                  ? 'text-slate-300 cursor-not-allowed'
                                  : 'text-slate-400 hover:text-rose-600 hover:bg-rose-50'
                              }`}
                              title={isSelf ? 'Không thể tự xóa tài khoản đang đăng nhập' : 'Xóa tài khoản'}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* SUB-TAB 2: ROLES & PERMISSIONS MATRIX */}
      {subTab === 'roles' && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
            <div>
              <h3 className="font-extrabold text-slate-900 text-sm">
                Danh sách Nhóm Quyền & Ma Trận Chức Năng
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Thêm nhóm quyền tùy biến (VD: Tổ trưởng xe, Điều phối viên, Kế toán) hoặc điều chỉnh quyền hạn chi tiết cho từng vai trò.
              </p>
            </div>
            <button
              type="button"
              onClick={openAddRoleModal}
              className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-md shadow-rose-600/20 transition-colors"
            >
              <Plus className="w-4 h-4" />
              <span>Thêm Nhóm Quyền Mới</span>
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {roles.map((role) => {
              const memberCount = accounts.filter((a) => a.roleId === role.id).length;
              return (
                <div
                  key={role.id}
                  className="bg-white rounded-2xl border border-slate-200 shadow-xs p-5 flex flex-col justify-between gap-4"
                >
                  <div className="space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <span
                            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs font-extrabold ${getRoleBadgeClass(
                              role.color
                            )}`}
                          >
                            <Shield className="w-3.5 h-3.5" />
                            {role.name}
                          </span>
                          {role.isSystemAdmin && (
                            <span className="px-2 py-0.5 bg-slate-900 text-amber-400 rounded-md text-[10px] font-bold">
                              Toàn quyền hệ thống
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-slate-600 mt-2 leading-relaxed">{role.description}</p>
                      </div>

                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={() => openEditRoleModal(role)}
                          className="p-1.5 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                          title="Chỉnh sửa tên và quyền hạn"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        {!role.isSystemAdmin && (
                          <button
                            type="button"
                            onClick={() => openDeleteRoleModal(role)}
                            className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                            title="Xóa nhóm quyền"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="pt-2 border-t border-slate-100">
                      <p className="text-[11px] font-bold text-slate-400 uppercase mb-2">
                        Quyền hạn được cấp ({role.permissions.length}/{ALL_PERMISSIONS.length})
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {PERMISSION_CATALOG.map((perm) => {
                          const granted = role.permissions.includes(perm.key);
                          if (!granted) return null;
                          return (
                            <span
                              key={perm.key}
                              className="inline-flex items-center gap-1 px-2 py-1 bg-slate-100 text-slate-800 rounded-lg text-[11px] font-semibold"
                            >
                              <Check className="w-3 h-3 text-emerald-600" />
                              {perm.label}
                            </span>
                          );
                        })}
                      </div>
                    </div>
                  </div>

                  <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
                    <span>
                      Đang gán cho: <strong className="text-slate-900">{memberCount} tài khoản</strong>
                    </span>
                    <button
                      type="button"
                      onClick={() => openEditRoleModal(role)}
                      className="text-blue-600 hover:underline font-bold"
                    >
                      {role.isSystemAdmin ? 'Xem chi tiết quyền' : 'Sửa phân quyền →'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* MODAL: ADD / EDIT ACCOUNT */}
      {showAccountModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/65 backdrop-blur-xs">
          <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full p-6 space-y-4 max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h3 className="font-extrabold text-slate-900 text-base">
                {editingAccount ? `Chỉnh Sửa Tài Khoản: @${editingAccount.username}` : 'Tạo Tài Khoản Mới'}
              </h3>
              <button
                type="button"
                onClick={() => setShowAccountModal(false)}
                className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {accountFormError && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800 flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                <span>{accountFormError}</span>
              </div>
            )}

            <form onSubmit={handleSaveAccount} className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                    Tên đăng nhập *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="VD: taixe2, giamsat2..."
                    value={accountForm.username}
                    onChange={(e) => setAccountForm({ ...accountForm, username: e.target.value })}
                    className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                    Họ và tên *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="VD: Lê Minh Tuấn"
                    value={accountForm.fullName}
                    onChange={(e) => setAccountForm({ ...accountForm, fullName: e.target.value })}
                    className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs"
                  />
                </div>
              </div>

              {!editingAccount && (
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                    Mật khẩu khởi tạo * (tối thiểu 6 ký tự)
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      required
                      minLength={6}
                      placeholder="Nhập mật khẩu ban đầu..."
                      value={accountForm.password}
                      onChange={(e) => setAccountForm({ ...accountForm, password: e.target.value })}
                      className="flex-1 p-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-mono"
                    />
                    <button
                      type="button"
                      onClick={() =>
                        setAccountForm({ ...accountForm, password: generateRandomPassword(8) })
                      }
                      className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold flex items-center gap-1 shrink-0"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                      Tạo ngẫu nhiên
                    </button>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                    Nhóm phân quyền *
                  </label>
                  <select
                    value={accountForm.roleId}
                    onChange={(e) => setAccountForm({ ...accountForm, roleId: e.target.value })}
                    className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-semibold"
                  >
                    {roles.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                    Phụ trách tuyến xe
                  </label>
                  <select
                    value={accountForm.assignedRouteId}
                    onChange={(e) => setAccountForm({ ...accountForm, assignedRouteId: e.target.value })}
                    className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs"
                  >
                    <option value="all">Tất cả tuyến xe</option>
                    {routes.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.code} - {r.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                    Số điện thoại
                  </label>
                  <input
                    type="tel"
                    placeholder="VD: 0912.345.678"
                    value={accountForm.phone}
                    onChange={(e) => setAccountForm({ ...accountForm, phone: e.target.value })}
                    className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                    Email
                  </label>
                  <input
                    type="email"
                    placeholder="VD: user@schoolbus.vn"
                    value={accountForm.email}
                    onChange={(e) => setAccountForm({ ...accountForm, email: e.target.value })}
                    className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs"
                  />
                </div>
              </div>

              {students.length > 0 && (
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                    Liên kết học sinh (Dành cho tài khoản Phụ huynh - tùy chọn)
                  </label>
                  <select
                    value={accountForm.assignedStudentId}
                    onChange={(e) => setAccountForm({ ...accountForm, assignedStudentId: e.target.value })}
                    className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs"
                  >
                    <option value="">-- Xem toàn bộ danh sách học sinh --</option>
                    {students.map((st) => (
                      <option key={st.id} value={st.id}>
                        {st.code} - {st.name} (Lớp {st.class})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
                <label className="flex items-center gap-2 text-xs font-semibold text-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={accountForm.isActive}
                    onChange={(e) => setAccountForm({ ...accountForm, isActive: e.target.checked })}
                    className="w-4 h-4 rounded border-slate-300 text-blue-600"
                  />
                  <span>Cho phép tài khoản đăng nhập (Đang hoạt động)</span>
                </label>

                <label className="flex items-center gap-2 text-xs font-semibold text-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={accountForm.mustChangePassword}
                    onChange={(e) =>
                      setAccountForm({ ...accountForm, mustChangePassword: e.target.checked })
                    }
                    className="w-4 h-4 rounded border-slate-300 text-amber-600"
                  />
                  <span>Yêu cầu người dùng đổi mật khẩu ở lần đăng nhập kế tiếp</span>
                </label>
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAccountModal(false)}
                  className="flex-1 py-2.5 bg-slate-100 text-slate-700 rounded-xl text-xs font-bold hover:bg-slate-200"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-md"
                >
                  {editingAccount ? 'Lưu Thay Đổi' : 'Tạo Tài Khoản'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: RESET PASSWORD ("Cấp lại mật khẩu") */}
      {resetTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/65 backdrop-blur-xs">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 space-y-4">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center">
                  <KeyRound className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-extrabold text-slate-900 text-base">Cấp Lại Mật Khẩu</h3>
                  <p className="text-xs text-slate-500">
                    {resetTarget.fullName} (<span className="font-mono">@{resetTarget.username}</span>)
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setResetTarget(null)}
                className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {resetError && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800 flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                <span>{resetError}</span>
              </div>
            )}

            <form onSubmit={handleConfirmResetPassword} className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                  Mật khẩu mới cấp cho người dùng
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    required
                    minLength={6}
                    value={resetNewPass}
                    onChange={(e) => {
                      setResetNewPass(e.target.value);
                      setResetError(null);
                    }}
                    className="flex-1 p-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm font-mono font-bold text-slate-900"
                  />
                  <button
                    type="button"
                    onClick={() => setResetNewPass(generateRandomPassword(8))}
                    className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold flex items-center gap-1"
                    title="Tạo mật khẩu ngẫu nhiên"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    Tạo mới
                  </button>
                  <button
                    type="button"
                    onClick={handleCopyResetPass}
                    className="px-3 py-2 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-xl text-xs font-bold flex items-center gap-1"
                    title="Sao chép mật khẩu"
                  >
                    <Copy className="w-3.5 h-3.5" />
                    {resetCopied ? 'Đã chép' : 'Chép'}
                  </button>
                </div>
              </div>

              <label className="flex items-start gap-2 p-3 bg-amber-50/70 border border-amber-200 rounded-xl text-xs text-amber-900 cursor-pointer">
                <input
                  type="checkbox"
                  checked={resetForceChange}
                  onChange={(e) => setResetForceChange(e.target.checked)}
                  className="w-4 h-4 rounded border-amber-400 text-amber-600 mt-0.5"
                />
                <span>
                  Bắt buộc người dùng tự đổi lại mật khẩu cá nhân ngay khi đăng nhập bằng mật khẩu tạm này.
                </span>
              </label>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setResetTarget(null)}
                  className="flex-1 py-2.5 bg-slate-100 text-slate-700 rounded-xl text-xs font-bold hover:bg-slate-200"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 bg-amber-500 hover:bg-amber-600 text-white rounded-xl text-xs font-bold shadow-md"
                >
                  Xác Nhận Cấp Lại Mật Khẩu
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: DELETE ACCOUNT CONFIRM */}
      {deleteAccountTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/65 backdrop-blur-xs">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 text-center space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-rose-100 text-rose-600 flex items-center justify-center mx-auto">
              <Trash2 className="w-6 h-6" />
            </div>
            <div>
              <h3 className="font-extrabold text-slate-900 text-base">
                Xóa tài khoản @{deleteAccountTarget.username}?
              </h3>
              <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                Tài khoản của <strong>{deleteAccountTarget.fullName}</strong> sẽ bị xóa vĩnh viễn và không thể đăng nhập vào hệ thống nữa.
              </p>
            </div>
            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={() => setDeleteAccountTarget(null)}
                className="flex-1 py-2.5 bg-slate-100 text-slate-700 rounded-xl text-xs font-bold hover:bg-slate-200"
              >
                Hủy bỏ
              </button>
              <button
                type="button"
                onClick={() => {
                  onDeleteAccount(deleteAccountTarget.id);
                  playSound('beep');
                  showSuccess(`Đã xóa tài khoản "@${deleteAccountTarget.username}".`);
                  setDeleteAccountTarget(null);
                }}
                className="flex-1 py-2.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold shadow-md"
              >
                Xác Nhận Xóa
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: ADD / EDIT ROLE & PERMISSIONS */}
      {showRoleModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/65 backdrop-blur-xs">
          <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full p-6 space-y-4 max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-extrabold text-slate-900 text-base">
                  {editingRole ? `Chỉnh Sửa Nhóm Quyền: ${editingRole.name}` : 'Thêm Nhóm Phân Quyền Mới'}
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Chọn các màn hình và chức năng mà tài khoản thuộc nhóm quyền này được phép truy cập.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowRoleModal(false)}
                className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {editingRole?.isSystemAdmin && (
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-900 flex items-start gap-2">
                <ShieldCheck className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <span>
                  Đây là nhóm quyền Quản trị viên tối cao (System Admin). Toàn bộ quyền hạn được giữ cố định để đảm bảo hệ thống luôn có người quản trị toàn quyền.
                </span>
              </div>
            )}

            {roleFormError && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800 flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                <span>{roleFormError}</span>
              </div>
            )}

            <form onSubmit={handleSaveRole} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="sm:col-span-2">
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                    Tên nhóm quyền *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="VD: Điều phối viên xe tuyến, Tổ trưởng giám sát..."
                    value={roleForm.name}
                    onChange={(e) => setRoleForm({ ...roleForm, name: e.target.value })}
                    className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                    Màu thẻ hiển thị
                  </label>
                  <select
                    value={roleForm.color}
                    onChange={(e) => setRoleForm({ ...roleForm, color: e.target.value })}
                    className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-semibold"
                  >
                    {ROLE_COLORS.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                  Mô tả vai trò
                </label>
                <input
                  type="text"
                  placeholder="Mô tả ngắn gọn trách nhiệm của nhóm quyền này..."
                  value={roleForm.description}
                  onChange={(e) => setRoleForm({ ...roleForm, description: e.target.value })}
                  className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs"
                />
              </div>

              {/* Permission Checkboxes */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-700 uppercase">
                    Chi tiết quyền hạn ({editingRole?.isSystemAdmin ? ALL_PERMISSIONS.length : roleForm.permissions.length}/{ALL_PERMISSIONS.length})
                  </label>
                  {!editingRole?.isSystemAdmin && (
                    <div className="flex items-center gap-2 text-xs">
                      <button
                        type="button"
                        onClick={() => setRoleForm({ ...roleForm, permissions: [...ALL_PERMISSIONS] })}
                        className="text-blue-600 hover:underline font-bold"
                      >
                        Chọn tất cả
                      </button>
                      <span className="text-slate-300">|</span>
                      <button
                        type="button"
                        onClick={() => setRoleForm({ ...roleForm, permissions: [] })}
                        className="text-slate-500 hover:underline font-semibold"
                      >
                        Bỏ chọn
                      </button>
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {PERMISSION_CATALOG.map((perm) => {
                    const checked = editingRole?.isSystemAdmin
                      ? true
                      : roleForm.permissions.includes(perm.key);
                    return (
                      <label
                        key={perm.key}
                        className={`p-3 rounded-xl border text-left transition-all flex items-start gap-2.5 ${
                          editingRole?.isSystemAdmin ? 'cursor-not-allowed opacity-85' : 'cursor-pointer'
                        } ${
                          checked
                            ? 'bg-blue-50/70 border-blue-300 text-slate-900'
                            : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={!!editingRole?.isSystemAdmin}
                          onChange={() => toggleRolePermission(perm.key)}
                          className="w-4 h-4 rounded border-slate-300 text-blue-600 mt-0.5 shrink-0"
                        />
                        <div>
                          <p className="text-xs font-bold leading-snug">{perm.label}</p>
                          <p className="text-[11px] text-slate-500 mt-0.5 leading-relaxed">
                            {perm.description}
                          </p>
                        </div>
                      </label>
                    );
                  })}
                </div>
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowRoleModal(false)}
                  className="flex-1 py-2.5 bg-slate-100 text-slate-700 rounded-xl text-xs font-bold hover:bg-slate-200"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold shadow-md"
                >
                  {editingRole ? 'Lưu Cập Nhật Quyền' : 'Tạo Nhóm Quyền'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: DELETE ROLE CONFIRM */}
      {deleteRoleTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/65 backdrop-blur-xs">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-rose-100 text-rose-600 flex items-center justify-center mx-auto">
              <Trash2 className="w-6 h-6" />
            </div>

            <div className="text-center">
              <h3 className="font-extrabold text-slate-900 text-base">
                Xóa nhóm quyền &quot;{deleteRoleTarget.name}&quot;?
              </h3>
              <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                {accounts.filter((a) => a.roleId === deleteRoleTarget.id).length > 0
                  ? `Hiện có ${
                      accounts.filter((a) => a.roleId === deleteRoleTarget.id).length
                    } tài khoản đang dùng nhóm quyền này. Hãy chọn nhóm quyền mới để chuyển đổi trước khi xóa.`
                  : 'Nhóm quyền này chưa có tài khoản nào sử dụng và sẽ bị xóa khỏi hệ thống.'}
              </p>
            </div>

            {accounts.filter((a) => a.roleId === deleteRoleTarget.id).length > 0 && (
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                  Chuyển các tài khoản sang nhóm quyền:
                </label>
                <select
                  value={migrateRoleId}
                  onChange={(e) => setMigrateRoleId(e.target.value)}
                  className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-semibold"
                >
                  {roles
                    .filter((r) => r.id !== deleteRoleTarget.id)
                    .map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name}
                      </option>
                    ))}
                </select>
              </div>
            )}

            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={() => setDeleteRoleTarget(null)}
                className="flex-1 py-2.5 bg-slate-100 text-slate-700 rounded-xl text-xs font-bold hover:bg-slate-200"
              >
                Hủy bỏ
              </button>
              <button
                type="button"
                onClick={handleConfirmDeleteRole}
                className="flex-1 py-2.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold shadow-md"
              >
                Xác Nhận Xóa
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
