import React, { useState, useMemo } from 'react';
import {
  Users,
  Bus,
  Plus,
  Search,
  Download,
  Upload,
  FileSpreadsheet,
  Trash2,
  Edit2,
  Printer,
  Sparkles,
  CheckCircle2,
  TrendingUp,
  MapPin,
  RefreshCw,
  Phone,
  UserCheck,
  AlertCircle,
  FileUp,
  X,
  Shield,
  Database,
  ArrowRightLeft,
  Eye,
  EyeOff,
} from 'lucide-react';
import {
  Student,
  Route,
  CheckinRecord,
  GoogleSheetsConfig,
  PermissionKey,
  UserAccount,
  RoleDefinition,
  RouteSessionState,
  SessionType,
  DatabaseSaveLog,
} from '../../types';
import { exportRecordsToCSV, LocalSafetySnapshot } from '../../services/storageService';
import { playSound } from '../../services/notificationAudio';
import { RouteManagementSection } from './RouteManagementSection';
import { AccountRoleManagement } from './AccountRoleManagement';
import { RouteAttendanceOverview } from '../common/RouteAttendanceOverview';
import { getSessionTransfer } from '../../utils/transferHelpers';
import { ServerStatePayload } from '../../services/syncService';

interface Props {
  students: Student[];
  routes: Route[];
  records: Record<string, CheckinRecord>;
  onAddStudent: (student: Student) => void;
  onUpdateStudent: (student: Student) => void;
  onDeleteStudent: (studentId: string) => void;
  onDeleteStudentsBulk: (studentIds: string[]) => void;
  onImportStudents: (newStudents: Student[]) => void;
  onAddRoute: (route: Route) => void;
  onUpdateRoute: (route: Route) => void;
  onDeleteRoute: (routeId: string, studentAction?: string) => void;
  onResetData: () => void;
  onViewStudentCard: (student: Student) => void;
  onOpenSheetsModal: () => void;
  sheetsConfig: GoogleSheetsConfig;
  todayDate: string;
  onNavigateToAnalytics?: () => void;
  userPermissions: PermissionKey[];
  currentUser: UserAccount;
  accounts: UserAccount[];
  roleDefinitions: RoleDefinition[];
  onAddAccount: (account: UserAccount) => void;
  onUpdateAccount: (account: UserAccount) => void;
  onDeleteAccount: (accountId: string) => void;
  onResetAccountPassword: (accountId: string, newPassword: string, mustChangePassword: boolean) => void;
  onAddRoleDef: (role: RoleDefinition) => void;
  onUpdateRoleDef: (role: RoleDefinition) => void;
  onDeleteRoleDef: (roleId: string, migrateToRoleId: string) => void;
  sessionStates: Record<string, RouteSessionState>;
  activeSessionType: SessionType;
  dbLogs: DatabaseSaveLog[];
  onImportFullBackup?: (snapshot: Partial<ServerStatePayload>) => Promise<void>;
  localSafetySnapshot?: LocalSafetySnapshot | null;
  onRestoreLocalSafetySnapshot?: () => Promise<void>;
  onDismissLocalSafetySnapshot?: () => void;
}

export const AdminView: React.FC<Props> = ({
  students,
  routes,
  records,
  onAddStudent,
  onUpdateStudent,
  onDeleteStudent,
  onDeleteStudentsBulk,
  onImportStudents,
  onAddRoute,
  onUpdateRoute,
  onDeleteRoute,
  onResetData,
  onViewStudentCard,
  onOpenSheetsModal,
  sheetsConfig,
  todayDate,
  onNavigateToAnalytics,
  userPermissions,
  currentUser,
  accounts,
  roleDefinitions,
  onAddAccount,
  onUpdateAccount,
  onDeleteAccount,
  onResetAccountPassword,
  onAddRoleDef,
  onUpdateRoleDef,
  onDeleteRoleDef,
  sessionStates,
  activeSessionType,
  dbLogs,
  onImportFullBackup,
  localSafetySnapshot,
  onRestoreLocalSafetySnapshot,
  onDismissLocalSafetySnapshot,
}) => {
  const canStudents = userPermissions.includes('view_admin_students');
  const canRoutes = userPermissions.includes('view_admin_routes');
  const canAccounts = userPermissions.includes('manage_accounts');
  const canAnalytics = userPermissions.includes('view_analytics');
  const canSheets = userPermissions.includes('manage_sheets');

  const initialTab: 'students' | 'routes' | 'accounts' = canStudents
    ? 'students'
    : canRoutes
    ? 'routes'
    : 'accounts';

  const [adminTab, setAdminTab] = useState<'students' | 'routes' | 'accounts'>(initialTab);
  const activeAdminTab: 'students' | 'routes' | 'accounts' =
    (adminTab === 'students' && canStudents) ||
    (adminTab === 'routes' && canRoutes) ||
    (adminTab === 'accounts' && canAccounts)
      ? adminTab
      : canStudents
      ? 'students'
      : canRoutes
      ? 'routes'
      : 'accounts';
  const [isStudentListVisible, setIsStudentListVisible] = useState(true);
  const [showFleetOverview, setShowFleetOverview] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedRouteFilter, setSelectedRouteFilter] = useState<string>('all');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [deleteConfirmTarget, setDeleteConfirmTarget] = useState<
    | { type: 'single'; student: Student }
    | { type: 'bulk'; ids: string[]; title: string; description: string }
    | { type: 'reset' }
    | null
  >(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [importCsvText, setImportCsvText] = useState('');
  const [importDefaultRouteId, setImportDefaultRouteId] = useState<string>(routes[0]?.id || '');
  const [importDefaultStopId, setImportDefaultStopId] = useState<string>(routes[0]?.stops[0]?.id || '');
  const [importError, setImportError] = useState<string | null>(null);
  const [importSuccessMsg, setImportSuccessMsg] = useState<string | null>(null);
  const [editingStudent, setEditingStudent] = useState<Student | null>(null);

  // Form states for Add / Edit
  const [formData, setFormData] = useState<Partial<Student>>({
    code: `HS-${1000 + students.length + 1}`,
    name: '',
    class: '1A1',
    gender: 'M',
    parentName: '',
    parentPhone: '',
    routeId: routes[0]?.id || '',
    stopId: routes[0]?.stops[0]?.id || '',
    notes: '',
  });

  // Calculate statistics strictly for activeSessionType
  const totalStudents = students.length;
  const presentCount =
    activeSessionType === 'morning'
      ? students.filter(
          (s) =>
            records[s.id]?.morningPickupStatus !== 'absent' &&
            records[s.id]?.morningSchoolStatus === 'dropped_at_school'
        ).length
      : students.filter((s) => records[s.id]?.afternoonDropoffStatus === 'dropped_off').length;
  const attendanceRate = totalStudents > 0 ? Math.round((presentCount / totalStudents) * 100) : 0;

  const handleExportCsv = () => {
    playSound('beep');
    const csv = exportRecordsToCSV(students, routes, records, todayDate);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `BaoCao_DiemDanh_XeTuyen_${todayDate}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleExportFullBackup = () => {
    playSound('beep');
    const snapshot: Partial<ServerStatePayload> = {
      routes,
      students,
      records,
      sessionStates,
      sheetsConfig,
      dbLogs,
      accounts,
      roleDefinitions,
    };
    const blob = new Blob([JSON.stringify(snapshot, null, 2)], {
      type: 'application/json;charset=utf-8;',
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `DongBo_SchoolBus_${todayDate}.json`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    setImportSuccessMsg(
      `Đã tải xuống gói dữ liệu hệ thống (${routes.length} tuyến, ${students.length} học sinh, ${accounts.length} tài khoản).`
    );
    setTimeout(() => setImportSuccessMsg(null), 5000);
  };

  const handleImportBackupFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !onImportFullBackup) return;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as Partial<ServerStatePayload>;
      if (!Array.isArray(parsed.routes) || !Array.isArray(parsed.students)) {
        setImportError('Tệp JSON không đúng định dạng gói đồng bộ SchoolBus Pro.');
        return;
      }
      await onImportFullBackup(parsed);
      playSound('success');
      setImportError(null);
      setImportSuccessMsg(
        `Đã nạp & đồng bộ tức thì lên máy chủ (${parsed.routes.length} tuyến, ${parsed.students.length} học sinh) cho tất cả thiết bị!`
      );
      setTimeout(() => setImportSuccessMsg(null), 6000);
    } catch {
      setImportError('Không thể đọc tệp đồng bộ JSON. Vui lòng kiểm tra lại tệp.');
    }
  };

  const handleDownloadTemplate = () => {
    const firstRouteCode = routes[0]?.code || 'TB-01';
    const secondRouteCode = routes[1]?.code || firstRouteCode;
    const firstStopName = routes[0]?.stops[0]?.name || '';
    const template = `\uFEFFMã học sinh,Họ và tên,Lớp,Giới tính,Tên phụ huynh,SĐT Phụ huynh,Mã tuyến,Điểm đón,Ghi chú
HS-9001,Nguyễn Gia Huy,1A1,Nam,Nguyễn Văn An,0912345678,${firstRouteCode},${firstStopName},Say xe nhẹ
HS-9002,Trần Thảo Ly,3A2,Nữ,Trần Đức Bình,0987654321,${firstRouteCode},,
HS-9003,Lê Hoàng Quân,5B,Nam,Lê Minh Trí,0903112233,${secondRouteCode},,`;
    const blob = new Blob([template], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', 'Mau_Nhap_HocSinh_XeTuyen.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Parse a single line supporting Tab (Excel copy-paste), semicolon (;), or comma (,) with quotes
  const splitImportRow = (line: string, delimiter: '\t' | ';' | ','): string[] => {
    if (delimiter === '\t') {
      return line.split('\t').map((cell) => cell.trim().replace(/^"|"$/g, ''));
    }
    const cells: string[] = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (ch === delimiter && !inQuotes) {
        cells.push(current.trim());
        current = '';
      } else {
        current += ch;
      }
    }
    cells.push(current.trim());
    return cells;
  };

  // Live parsed preview for Excel / CSV import
  const parsedImportPreview = useMemo(() => {
    const cleaned = importCsvText.replace(/^\uFEFF/, '').trim();
    if (!cleaned) {
      return { students: [] as Student[], delimiterLabel: '', skippedRows: 0 };
    }

    const lines = cleaned.split(/\r?\n/).filter((l) => l.trim().length > 0);
    if (lines.length === 0) {
      return { students: [] as Student[], delimiterLabel: '', skippedRows: 0 };
    }

    // Detect delimiter globally from sample lines
    const sample = lines.slice(0, 5).join('\n');
    let delimiter: '\t' | ';' | ',' = ',';
    let delimiterLabel = 'Dấu phẩy (CSV)';
    if (sample.includes('\t')) {
      delimiter = '\t';
      delimiterLabel = 'Bảng Excel / Google Sheets (Tab)';
    } else if (sample.includes(';') && !sample.includes(',')) {
      delimiter = ';';
      delimiterLabel = 'CSV phân tách chấm phẩy (;)';
    }

    const firstRowCells = splitImportRow(lines[0], delimiter).map((c) => c.toLowerCase());
    const looksLikeHeader = firstRowCells.some(
      (c) =>
        c.includes('họ và tên') ||
        c.includes('họ tên') ||
        c.includes('tên học sinh') ||
        c.includes('mã hs') ||
        c.includes('mã học sinh') ||
        c === 'lớp' ||
        c === 'name'
    );

    const startIdx = looksLikeHeader ? 1 : 0;
    const defaultRoute = routes.find((r) => r.id === importDefaultRouteId) || routes[0];
    const parsed: Student[] = [];
    let skippedRows = 0;
    const baseTimestamp = Date.now();

    for (let i = startIdx; i < lines.length; i++) {
      const parts = splitImportRow(lines[i], delimiter);
      if (parts.every((p) => !p)) continue;

      let code = '';
      let name = '';
      let className = '';
      let genderRaw = '';
      let parentName = '';
      let parentPhone = '';
      let routeInput = '';
      let stopOrNote = '';
      let extraNote = '';

      if (parts.length >= 3) {
        code = parts[0];
        name = parts[1];
        className = parts[2];
        genderRaw = parts[3] || '';
        parentName = parts[4] || '';
        parentPhone = parts[5] || '';
        routeInput = parts[6] || '';
        stopOrNote = parts[7] || '';
        extraNote = parts[8] || '';
      } else if (parts.length === 2) {
        // Flexible 2-column paste: either (Họ tên, Lớp) or (Mã HS, Họ tên)
        if (/^(hs[-_ ]?\d+|\d+)$/i.test(parts[0])) {
          code = parts[0];
          name = parts[1];
        } else {
          name = parts[0];
          className = parts[1];
        }
      } else {
        skippedRows++;
        continue;
      }

      if (!name) {
        skippedRows++;
        continue;
      }

      const normGender = genderRaw.trim().toLowerCase();
      const gender: 'M' | 'F' =
        normGender === 'f' ||
        normGender === 'nữ' ||
        normGender === 'nu' ||
        normGender === 'female' ||
        normGender === 'gái'
          ? 'F'
          : 'M';

      const normRoute = routeInput.trim().toLowerCase();
      const normRouteCompact = normRoute.replace(/[-_\s]/g, '');
      const matchedRoute = normRoute
        ? routes.find((r) => {
            const rCode = r.code.toLowerCase();
            const rCodeCompact = rCode.replace(/[-_\s]/g, '');
            return (
              r.id.toLowerCase() === normRoute ||
              rCode === normRoute ||
              rCodeCompact === normRouteCompact ||
              r.plateNumber.toLowerCase() === normRoute ||
              r.name.toLowerCase().includes(normRoute)
            );
          }) || defaultRoute
        : defaultRoute;

      let matchedStopId =
        matchedRoute.id === defaultRoute?.id &&
        matchedRoute.stops.some((st) => st.id === importDefaultStopId)
          ? importDefaultStopId
          : matchedRoute.stops[0]?.id || '';

      let finalNotes = extraNote;
      if (stopOrNote) {
        const stopNorm = stopOrNote.trim().toLowerCase();
        const foundStop = matchedRoute.stops.find(
          (st) => st.name.toLowerCase().includes(stopNorm) || stopNorm.includes(st.name.toLowerCase())
        );
        if (foundStop) {
          matchedStopId = foundStop.id;
        } else if (parts.length <= 8) {
          finalNotes = stopOrNote;
        }
      }

      const autoNum = 1000 + students.length + parsed.length + 1;
      parsed.push({
        id: `hs-import-${baseTimestamp}-${i}`,
        code: code || `HS-${autoNum}`,
        name,
        class: className || 'Chưa xếp lớp',
        gender,
        parentName: parentName || 'Phụ huynh',
        parentPhone: parentPhone || '0900.000.000',
        routeId: matchedRoute?.id || '',
        stopId: matchedStopId,
        notes: finalNotes,
        avatar:
          gender === 'F'
            ? 'https://images.unsplash.com/photo-1517841905240-472988babdf9?w=120&auto=format&fit=crop&q=80'
            : 'https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?w=120&auto=format&fit=crop&q=80',
      });
    }

    return { students: parsed, delimiterLabel, skippedRows };
  }, [importCsvText, routes, importDefaultRouteId, importDefaultStopId, students.length]);

  const handleImportFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const content = String(ev.target?.result || '');
      setImportCsvText(content);
      setImportError(null);
    };
    reader.readAsText(file, 'UTF-8');
    e.target.value = '';
  };

  const handleOpenImportModal = () => {
    const targetRouteId =
      selectedRouteFilter !== 'all' && routes.some((r) => r.id === selectedRouteFilter)
        ? selectedRouteFilter
        : routes[0]?.id || '';
    const targetRoute = routes.find((r) => r.id === targetRouteId) || routes[0];
    setImportDefaultRouteId(targetRoute?.id || '');
    setImportDefaultStopId(targetRoute?.stops[0]?.id || '');
    setImportError(null);
    setShowImportModal(true);
  };

  const handleProcessImport = () => {
    if (!importCsvText.trim()) {
      setImportError('Vui lòng dán dữ liệu từ Excel/Google Sheets hoặc tải lên file .csv trước khi xác nhận.');
      return;
    }

    if (parsedImportPreview.students.length === 0) {
      setImportError(
        'Không nhận diện được dòng học sinh hợp lệ nào. Hãy đảm bảo mỗi dòng có ít nhất Họ tên và Lớp (cách nhau bằng cột Excel/Tab hoặc dấu phẩy).'
      );
      return;
    }

    playSound('success');
    const count = parsedImportPreview.students.length;
    onImportStudents(parsedImportPreview.students);
    setSelectedRouteFilter('all');
    setSearchTerm('');
    setShowImportModal(false);
    setImportCsvText('');
    setImportError(null);
    setImportSuccessMsg(`Đã nhập thành công ${count} học sinh vào danh sách và phân tuyến xe!`);
    setTimeout(() => setImportSuccessMsg(null), 6000);
  };

  const handleSaveStudent = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name || !formData.class) return;

    if (editingStudent) {
      onUpdateStudent({
        ...editingStudent,
        ...formData,
      } as Student);
      setEditingStudent(null);
      setShowAddModal(false);
    } else {
      const selectedRoute = routes.find((r) => r.id === formData.routeId) || routes[0];
      const newStudent: Student = {
        id: `hs-${Date.now()}`,
        code: formData.code || `HS-${1000 + students.length + 1}`,
        name: formData.name,
        class: formData.class,
        gender: formData.gender as 'M' | 'F',
        parentName: formData.parentName || 'Phụ huynh',
        parentPhone: formData.parentPhone || '0900.000.000',
        routeId: formData.routeId || selectedRoute.id,
        stopId: formData.stopId || selectedRoute.stops[0]?.id || '',
        notes: formData.notes,
        avatar:
          formData.gender === 'F'
            ? 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=120&auto=format&fit=crop&q=80'
            : 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=120&auto=format&fit=crop&q=80',
      };
      onAddStudent(newStudent);
      setShowAddModal(false);
    }

    playSound('success');
  };

  const handleStartEdit = (s: Student) => {
    setEditingStudent(s);
    setFormData({
      code: s.code,
      name: s.name,
      class: s.class,
      gender: s.gender,
      parentName: s.parentName,
      parentPhone: s.parentPhone,
      routeId: s.routeId,
      stopId: s.stopId,
      notes: s.notes,
    });
    setShowAddModal(true);
  };

  const filteredStudents = students.filter((s) => {
    const matchRoute = selectedRouteFilter === 'all' || s.routeId === selectedRouteFilter;
    const matchSearch =
      s.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      s.code.toLowerCase().includes(searchTerm.toLowerCase()) ||
      s.class.toLowerCase().includes(searchTerm.toLowerCase()) ||
      s.parentName.toLowerCase().includes(searchTerm.toLowerCase());
    return matchRoute && matchSearch;
  });

  const filteredIds = filteredStudents.map((s) => s.id);
  const selectedInFilteredCount = filteredIds.filter((id) => selectedIds.has(id)).length;
  const allFilteredSelected = filteredIds.length > 0 && selectedInFilteredCount === filteredIds.length;
  const activeRouteObj = routes.find((r) => r.id === selectedRouteFilter);

  const toggleSelectAllFiltered = () => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allFilteredSelected) {
        filteredIds.forEach((id) => next.delete(id));
      } else {
        filteredIds.forEach((id) => next.add(id));
      }
      return next;
    });
  };

  const toggleSelectOne = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleConfirmDeleteAction = () => {
    if (!deleteConfirmTarget) return;
    if (deleteConfirmTarget.type === 'single') {
      const target = deleteConfirmTarget.student;
      onDeleteStudent(target.id);
      setSelectedIds((prev) => {
        const next = new Set(prev);
        next.delete(target.id);
        return next;
      });
      setImportSuccessMsg(`Đã xóa học sinh "${target.name}" khỏi danh sách.`);
    } else if (deleteConfirmTarget.type === 'bulk') {
      const ids = deleteConfirmTarget.ids;
      onDeleteStudentsBulk(ids);
      setSelectedIds((prev) => {
        const next = new Set(prev);
        ids.forEach((id) => next.delete(id));
        return next;
      });
      setImportSuccessMsg(`Đã xóa thành công ${ids.length} học sinh khỏi danh sách!`);
    } else if (deleteConfirmTarget.type === 'reset') {
      onResetData();
    }
    playSound('beep');
    setDeleteConfirmTarget(null);
    setTimeout(() => setImportSuccessMsg(null), 5000);
  };

  return (
    <div className="space-y-3">
      {/* Compact Top KPI Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 tabular-nums">
        <div className="bg-white px-3.5 py-2.5 rounded-xl border border-slate-200 flex items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold text-slate-500 truncate">Tổng học sinh đi xe</p>
            <p className="text-xl font-extrabold text-slate-900">{totalStudents}</p>
          </div>
          <Users className="w-5 h-5 text-blue-600 shrink-0" />
        </div>

        <div className="bg-white px-3.5 py-2.5 rounded-xl border border-slate-200 flex items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold text-slate-500 truncate">Tuyến xe hoạt động</p>
            <p className="text-xl font-extrabold text-slate-900">{routes.length}</p>
          </div>
          <Bus className="w-5 h-5 text-amber-600 shrink-0" />
        </div>

        <div className="bg-white px-3.5 py-2.5 rounded-xl border border-slate-200 flex items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold text-slate-500 truncate">
              {activeSessionType === 'morning' ? 'Đã vào trường (Sáng)' : 'Đã trả điểm (Chiều)'}
            </p>
            <p className="text-xl font-extrabold text-emerald-600">{presentCount}</p>
          </div>
          <UserCheck className="w-5 h-5 text-emerald-600 shrink-0" />
        </div>

        <div
          onClick={canAnalytics ? onNavigateToAnalytics : undefined}
          className={`bg-white px-3.5 py-2.5 rounded-xl border border-indigo-200 flex items-center justify-between gap-2 transition-colors ${
            canAnalytics ? 'hover:border-indigo-400 cursor-pointer group' : ''
          }`}
          title={canAnalytics ? 'Bấm để xem Dashboard biểu đồ xu hướng chi tiết' : undefined}
        >
          <div className="min-w-0">
            <p className="text-[11px] font-semibold text-slate-500 truncate">
              {activeSessionType === 'morning' ? 'Tỷ lệ đến trường' : 'Tỷ lệ đã trả'}
              {canAnalytics && (
                <span className="ml-1 text-indigo-600 font-bold group-hover:underline">&rarr; Biểu đồ</span>
              )}
            </p>
            <p className="text-xl font-extrabold text-indigo-600">{attendanceRate}%</p>
          </div>
          <TrendingUp className="w-5 h-5 text-indigo-600 shrink-0" />
        </div>
      </div>

      {/* Collapsible Live Fleet Report for Admin */}
      {(canStudents || canRoutes) && (
        <div className="space-y-1">
          {showFleetOverview ? (
            <div>
              <RouteAttendanceOverview
                routes={routes}
                students={students}
                records={records}
                sessionStates={sessionStates}
                activeSessionType={activeSessionType}
                title="Báo Cáo Các Tuyến Xe & Tình Trạng Lưu CSDL"
              />
              <button
                type="button"
                onClick={() => setShowFleetOverview(false)}
                className="mt-1 text-[11px] font-semibold text-slate-500 hover:text-slate-800 underline"
              >
                Thu gọn bảng báo cáo các tuyến xe
              </button>
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-slate-200 px-3.5 py-2 flex items-center justify-between gap-2 text-xs">
              <span className="font-semibold text-slate-700">
                Bảng báo cáo {routes.length} tuyến xe đang thu gọn
              </span>
              <button
                type="button"
                onClick={() => setShowFleetOverview(true)}
                className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-lg font-bold whitespace-nowrap"
              >
                Hiện bảng các tuyến ({routes.length})
              </button>
            </div>
          )}
        </div>
      )}

      {dbLogs.filter((l) => l.date === todayDate && l.sessionType === activeSessionType).length > 0 && (
        <div className="bg-emerald-50/70 border border-emerald-200 rounded-xl px-3.5 py-2 flex flex-wrap items-center justify-between gap-2 text-[11px]">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 min-w-0">
            <span className="inline-flex items-center gap-1.5 text-emerald-950 font-bold shrink-0">
              <Database className="w-3.5 h-3.5 text-emerald-600" />
              Nhật ký chốt ({activeSessionType === 'morning' ? 'Sáng' : 'Chiều'} · {todayDate}):
            </span>
            {dbLogs
              .filter((l) => l.date === todayDate && l.sessionType === activeSessionType)
              .slice(0, 6)
              .map((log) => (
                <span key={log.id} className="text-slate-700 whitespace-nowrap tabular-nums">
                  <strong className="text-emerald-800">{log.routeCode}</strong>: {log.supervisorVerifiedCount} đi,{' '}
                  <span className="text-rose-600 font-semibold">{log.absentCount} vắng</span> ({log.savedAt})
                  {log.syncedToGoogleSheet ? ' · Sheet ✓' : ' · Chưa Sheet'}
                </span>
              ))}
          </div>
          <button
            onClick={onOpenSheetsModal}
            className="px-2.5 py-1 bg-white hover:bg-emerald-100 text-emerald-800 border border-emerald-300 rounded-lg font-bold whitespace-nowrap shrink-0 transition-colors"
          >
            {sheetsConfig.webhookUrl ? 'Kiểm tra Google Sheet' : 'Kết nối Google Sheet'}
          </button>
        </div>
      )}

      {/* Sub-navigation Tabs */}
      <div className="flex flex-wrap items-center justify-between gap-2 bg-white px-2.5 py-1.5 rounded-xl border border-slate-200">
        <div className="inline-flex flex-wrap p-0.5 bg-slate-100 rounded-lg gap-1">
          {canStudents && (
            <button
              onClick={() => setAdminTab('students')}
              className={`px-3 py-1.5 rounded-md text-xs font-bold flex items-center gap-1.5 whitespace-nowrap transition-colors ${
                activeAdminTab === 'students'
                  ? 'bg-slate-900 text-white'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Users className="w-3.5 h-3.5" />
              <span>Học Sinh ({students.length})</span>
            </button>
          )}
          {canRoutes && (
            <button
              onClick={() => setAdminTab('routes')}
              className={`px-3 py-1.5 rounded-md text-xs font-bold flex items-center gap-1.5 whitespace-nowrap transition-colors ${
                activeAdminTab === 'routes'
                  ? 'bg-blue-600 text-white'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Bus className="w-3.5 h-3.5" />
              <span>Tuyến Xe &amp; Điểm Đón ({routes.length})</span>
            </button>
          )}
          {canAccounts && (
            <button
              onClick={() => setAdminTab('accounts')}
              className={`px-3 py-1.5 rounded-md text-xs font-bold flex items-center gap-1.5 whitespace-nowrap transition-colors ${
                activeAdminTab === 'accounts'
                  ? 'bg-rose-600 text-white'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Shield className="w-3.5 h-3.5" />
              <span>Tài Khoản &amp; Phân Quyền ({accounts.length})</span>
            </button>
          )}
        </div>

        <span className="text-[11px] text-slate-500 px-1 hidden lg:inline">
          Đồng bộ tức thì tới Lái xe, Giám sát &amp; Phụ huynh
        </span>
      </div>

      {localSafetySnapshot &&
        (localSafetySnapshot.students.length > students.length ||
          localSafetySnapshot.routes.length > routes.length) &&
        onRestoreLocalSafetySnapshot && (
          <div className="p-4 bg-amber-50 border-2 border-amber-300 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs shadow-xs">
            <div className="flex items-start gap-2.5 text-amber-950">
              <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-extrabold text-sm">
                  Phát hiện bản dữ liệu thực tế lớn hơn được lưu trên trình duyệt này (
                  {localSafetySnapshot.routes.length} tuyến xe • {localSafetySnapshot.students.length} học sinh)
                </p>
                <p className="text-amber-800 mt-0.5">
                  Máy chủ vừa đồng bộ dữ liệu khác ({routes.length} tuyến • {students.length} học sinh). Bạn có thể bấm nút bên cạnh để khôi phục và đẩy bản dữ liệu đầy đủ lên máy chủ cho tất cả thiết bị.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={onRestoreLocalSafetySnapshot}
                className="px-3.5 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl font-extrabold shadow-xs transition-colors"
              >
                Khôi Phục & Đồng Bộ Lên Máy Chủ
              </button>
              {onDismissLocalSafetySnapshot && (
                <button
                  type="button"
                  onClick={onDismissLocalSafetySnapshot}
                  className="px-3 py-2 bg-white hover:bg-amber-100 text-amber-900 border border-amber-300 rounded-xl font-bold"
                >
                  Bỏ qua
                </button>
              )}
            </div>
          </div>
        )}

      {importSuccessMsg && (
        <div className="p-3.5 bg-emerald-50 border border-emerald-300 text-emerald-900 rounded-2xl flex items-center justify-between gap-3 text-xs font-bold shadow-xs animate-in fade-in">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
            <span>{importSuccessMsg}</span>
          </div>
          <button
            onClick={() => setImportSuccessMsg(null)}
            className="p-1 rounded-lg text-emerald-700 hover:bg-emerald-100"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {activeAdminTab === 'accounts' && canAccounts ? (
        <AccountRoleManagement
          currentUser={currentUser}
          accounts={accounts}
          roles={roleDefinitions}
          routes={routes}
          students={students}
          onAddAccount={onAddAccount}
          onUpdateAccount={onUpdateAccount}
          onDeleteAccount={onDeleteAccount}
          onResetPassword={onResetAccountPassword}
          onAddRole={onAddRoleDef}
          onUpdateRole={onUpdateRoleDef}
          onDeleteRole={onDeleteRoleDef}
        />
      ) : activeAdminTab === 'routes' && canRoutes ? (
        <RouteManagementSection
          routes={routes}
          students={students}
          onAddRoute={onAddRoute}
          onUpdateRoute={onUpdateRoute}
          onDeleteRoute={onDeleteRoute}
        />
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        {/* Compact Action Header */}
        <div className="px-3.5 py-2.5 bg-slate-50 border-b border-slate-200 flex flex-col xl:flex-row xl:items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setIsStudentListVisible((prev) => !prev)}
              className={`px-2.5 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 border transition-colors whitespace-nowrap ${
                isStudentListVisible
                  ? 'bg-slate-900 text-white border-slate-900 hover:bg-slate-800'
                  : 'bg-blue-600 text-white border-blue-600 hover:bg-blue-700'
              }`}
            >
              {isStudentListVisible ? (
                <EyeOff className="w-3.5 h-3.5" />
              ) : (
                <Eye className="w-3.5 h-3.5" />
              )}
              <span>
                {isStudentListVisible
                  ? 'Thu gọn DS'
                  : `Xem DS (${filteredStudents.length})`}
              </span>
            </button>

            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Tìm tên, lớp, mã thẻ..."
                value={searchTerm}
                onChange={(e) => {
                  const val = e.target.value;
                  setSearchTerm(val);
                  if (val.trim()) setIsStudentListVisible(true);
                }}
                className="pl-8 pr-2.5 py-1.5 bg-white rounded-lg border border-slate-300 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 w-44 sm:w-52"
              />
            </div>

            <select
              value={selectedRouteFilter}
              onChange={(e) => setSelectedRouteFilter(e.target.value)}
              className="py-1.5 px-2.5 bg-white border border-slate-300 rounded-lg text-xs font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">Tất cả tuyến ({routes.length})</option>
              {routes.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.code} - {r.name}
                </option>
              ))}
            </select>
          </div>

          {/* Single-line Import / Export & Add Buttons */}
          <div className="flex flex-wrap items-center gap-1.5">
            {canAnalytics && (
              <button
                onClick={onNavigateToAnalytics}
                className="px-2.5 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-800 border border-indigo-200 rounded-lg text-xs font-bold flex items-center gap-1 transition-colors whitespace-nowrap"
              >
                <TrendingUp className="w-3.5 h-3.5 text-indigo-600" />
                <span>Biểu đồ</span>
              </button>
            )}

            <button
              onClick={handleExportCsv}
              className="px-2.5 py-1.5 bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 rounded-lg text-xs font-bold flex items-center gap-1 transition-colors whitespace-nowrap"
            >
              <Download className="w-3.5 h-3.5 text-emerald-600" />
              <span>Xuất CSV</span>
            </button>

            <button
              type="button"
              onClick={handleExportFullBackup}
              className="px-2.5 py-1.5 bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 rounded-lg text-xs font-bold flex items-center gap-1 transition-colors whitespace-nowrap"
              title="Tải xuống toàn bộ tuyến xe, học sinh, tài khoản (.json)"
            >
              <Database className="w-3.5 h-3.5 text-purple-600" />
              <span>Sao lưu</span>
            </button>

            {onImportFullBackup && (
              <label
                className="px-2.5 py-1.5 bg-purple-50 hover:bg-purple-100 text-purple-800 border border-purple-200 rounded-lg text-xs font-bold flex items-center gap-1 transition-colors cursor-pointer whitespace-nowrap"
                title="Nạp tệp .json lên máy chủ"
              >
                <FileUp className="w-3.5 h-3.5 text-purple-600" />
                <span>Nạp JSON</span>
                <input
                  type="file"
                  accept="application/json,.json"
                  onChange={handleImportBackupFile}
                  className="hidden"
                />
              </label>
            )}

            <button
              onClick={handleOpenImportModal}
              className="px-2.5 py-1.5 bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 rounded-lg text-xs font-bold flex items-center gap-1 transition-colors whitespace-nowrap"
            >
              <Upload className="w-3.5 h-3.5 text-blue-600" />
              <span>Nhập Excel</span>
            </button>

            {canSheets && (
              <button
                onClick={onOpenSheetsModal}
                className="px-2.5 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 rounded-lg text-xs font-bold flex items-center gap-1 transition-colors whitespace-nowrap"
              >
                <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
                <span>Google Sheet</span>
              </button>
            )}

            <button
              onClick={() => {
                setEditingStudent(null);
                setFormData({
                  code: `HS-${1000 + students.length + 1}`,
                  name: '',
                  class: '1A1',
                  gender: 'M',
                  parentName: '',
                  parentPhone: '',
                  routeId:
                    selectedRouteFilter !== 'all' ? selectedRouteFilter : routes[0]?.id || '',
                  stopId:
                    (selectedRouteFilter !== 'all'
                      ? routes.find((r) => r.id === selectedRouteFilter)?.stops[0]?.id
                      : routes[0]?.stops[0]?.id) || '',
                  notes: '',
                });
                setShowAddModal(true);
              }}
              className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold flex items-center gap-1 transition-colors whitespace-nowrap"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Thêm HS</span>
            </button>
          </div>
        </div>

        {!isStudentListVisible ? (
          <div className="px-4 py-3 bg-slate-50/40 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs">
            <span className="font-semibold text-slate-700">
              Danh sách đang thu gọn ({filteredStudents.length} học sinh
              {selectedRouteFilter !== 'all' && activeRouteObj ? ` · ${activeRouteObj.code}` : ''})
            </span>
            <button
              type="button"
              onClick={() => setIsStudentListVisible(true)}
              className="px-3 py-1.5 bg-white hover:bg-blue-50 text-blue-700 border border-blue-200 rounded-lg font-bold flex items-center gap-1.5 shrink-0"
            >
              <Eye className="w-3.5 h-3.5" />
              <span>Mở danh sách ({filteredStudents.length})</span>
            </button>
          </div>
        ) : (
        <>
        {/* Compact Bulk Selection Toolbar */}
        {(selectedIds.size > 0 || filteredStudents.length > 0) && (
          <div
            className={`px-3.5 py-1.5 border-b flex flex-wrap items-center justify-between gap-2 text-xs transition-colors ${
              selectedIds.size > 0
                ? 'bg-rose-50/90 border-rose-200 text-rose-900'
                : 'bg-white border-slate-200 text-slate-600'
            }`}
          >
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={toggleSelectAllFiltered}
                className="px-2 py-1 bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 rounded-md font-semibold transition-colors text-[11px]"
              >
                {allFilteredSelected
                  ? `Bỏ chọn tất cả (${filteredIds.length})`
                  : selectedRouteFilter !== 'all' && activeRouteObj
                  ? `Chọn tuyến ${activeRouteObj.code} (${filteredIds.length})`
                  : `Chọn tất cả (${filteredIds.length})`}
              </button>

              {selectedIds.size > 0 && (
                <>
                  <span className="font-bold text-rose-700">
                    Đã chọn: {selectedIds.size} HS
                  </span>
                  <button
                    type="button"
                    onClick={() => setSelectedIds(new Set())}
                    className="text-slate-600 hover:text-slate-900 underline font-medium"
                  >
                    Bỏ chọn
                  </button>
                </>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              {selectedIds.size > 0 && (
                <button
                  type="button"
                  onClick={() =>
                    setDeleteConfirmTarget({
                      type: 'bulk',
                      ids: Array.from(selectedIds),
                      title: `Xóa ${selectedIds.size} học sinh đã chọn?`,
                      description: `Hệ thống sẽ xóa vĩnh viễn ${selectedIds.size} học sinh đang được đánh dấu cùng dữ liệu điểm danh hôm nay của các em.`,
                    })
                  }
                  className="px-2.5 py-1 bg-rose-600 hover:bg-rose-700 text-white rounded-md font-bold flex items-center gap-1 text-[11px] transition-colors"
                >
                  <Trash2 className="w-3 h-3" />
                  <span>Xóa ({selectedIds.size})</span>
                </button>
              )}

              {filteredStudents.length > 0 && (
                <button
                  type="button"
                  onClick={() =>
                    setDeleteConfirmTarget({
                      type: 'bulk',
                      ids: filteredIds,
                      title:
                        selectedRouteFilter !== 'all' && activeRouteObj
                          ? `Xóa toàn bộ ${filteredIds.length} học sinh của tuyến ${activeRouteObj.code}?`
                          : `Xóa toàn bộ ${filteredIds.length} học sinh đang hiển thị?`,
                      description:
                        selectedRouteFilter !== 'all' && activeRouteObj
                          ? `Tất cả học sinh cũ thuộc tuyến "${activeRouteObj.name}" sẽ bị xóa sạch để bạn nhập danh sách thực tế mới.`
                          : 'Tất cả học sinh trong danh sách hiện tại sẽ bị xóa sạch để bạn nhập lại danh sách thực tế của trường.',
                    })
                  }
                  className="px-2.5 py-1 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-md font-bold flex items-center gap-1 text-[11px] transition-colors"
                >
                  <Trash2 className="w-3 h-3" />
                  <span>
                    {selectedRouteFilter !== 'all' && activeRouteObj
                      ? `Xóa hết ${activeRouteObj.code} (${filteredIds.length})`
                      : `Xóa hết DS (${filteredIds.length})`}
                  </span>
                </button>
              )}
            </div>
          </div>
        )}

        {/* High-Density Single-Row Student Table with Sticky Header */}
        <div className="overflow-auto max-h-[52vh] min-h-[260px]">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-100 text-slate-600 font-semibold text-[11px]">
                <th className="sticky top-0 z-10 bg-slate-100 shadow-[inset_0_-1px_0_0_#cbd5e1] py-2 pl-3.5 pr-1.5 w-8">
                  <input
                    type="checkbox"
                    checked={allFilteredSelected}
                    onChange={toggleSelectAllFiltered}
                    disabled={filteredStudents.length === 0}
                    title="Chọn / bỏ chọn tất cả"
                    className="w-3.5 h-3.5 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                  />
                </th>
                <th className="sticky top-0 z-10 bg-slate-100 shadow-[inset_0_-1px_0_0_#cbd5e1] py-2 px-1.5 w-10 text-right">STT</th>
                <th className="sticky top-0 z-10 bg-slate-100 shadow-[inset_0_-1px_0_0_#cbd5e1] py-2 px-2 hidden xl:table-cell">Mã HS</th>
                <th className="sticky top-0 z-10 bg-slate-100 shadow-[inset_0_-1px_0_0_#cbd5e1] py-2 px-2">Họ và tên</th>
                <th className="sticky top-0 z-10 bg-slate-100 shadow-[inset_0_-1px_0_0_#cbd5e1] py-2 px-2 text-center">Lớp</th>
                <th className="sticky top-0 z-10 bg-slate-100 shadow-[inset_0_-1px_0_0_#cbd5e1] py-2 px-2">Tuyến</th>
                <th className="sticky top-0 z-10 bg-slate-100 shadow-[inset_0_-1px_0_0_#cbd5e1] py-2 px-2 hidden md:table-cell">Điểm đón</th>
                <th className="sticky top-0 z-10 bg-slate-100 shadow-[inset_0_-1px_0_0_#cbd5e1] py-2 px-2 hidden lg:table-cell">Phụ huynh</th>
                <th className="sticky top-0 z-10 bg-slate-100 shadow-[inset_0_-1px_0_0_#cbd5e1] py-2 px-2">SĐT PH</th>
                <th className="sticky top-0 z-10 bg-slate-100 shadow-[inset_0_-1px_0_0_#cbd5e1] py-2 px-2">Điểm danh</th>
                <th className="sticky top-0 z-10 bg-slate-100 shadow-[inset_0_-1px_0_0_#cbd5e1] py-2 pl-2 pr-3.5 text-right">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 tabular-nums">
              {filteredStudents.length === 0 ? (
                <tr>
                  <td colSpan={11} className="text-center py-8 text-slate-400">
                    Chưa có học sinh nào trong danh sách này. Hãy bấm &quot;Nhập Excel&quot; hoặc &quot;Thêm HS&quot;.
                  </td>
                </tr>
              ) : (
                filteredStudents.map((s, idx) => {
                  const route = routes.find((r) => r.id === s.routeId);
                  const stop = route?.stops.find((st) => st.id === s.stopId);
                  const rec = records[s.id];

                  const morningStatus = rec?.morningPickupStatus;
                  const schoolStatus = rec?.morningSchoolStatus;
                  const afternoonBoard = rec?.afternoonBoardStatus;
                  const afternoonDropoff = rec?.afternoonDropoffStatus;
                  const sessionTransfer = getSessionTransfer(rec, activeSessionType);
                  const isSelected = selectedIds.has(s.id);

                  return (
                    <tr
                      key={s.id}
                      className={`transition-colors ${
                        isSelected ? 'bg-blue-50/70' : 'hover:bg-slate-50'
                      }`}
                    >
                      <td className="py-1.5 pl-3.5 pr-1.5">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleSelectOne(s.id)}
                          aria-label={`Chọn ${s.name}`}
                          className="w-3.5 h-3.5 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                        />
                      </td>

                      <td className="py-1.5 px-1.5 text-right font-mono text-slate-400 font-semibold">
                        {idx + 1}
                      </td>

                      <td className="py-1.5 px-2 font-mono text-slate-400 whitespace-nowrap hidden xl:table-cell">
                        {s.code}
                      </td>

                      <td className="py-1.5 px-2 whitespace-nowrap">
                        <span
                          className="font-bold text-slate-900 truncate max-w-[160px] sm:max-w-[200px] inline-block align-middle"
                          title={`${s.name} (${s.code})${s.notes ? ` · Ghi chú: ${s.notes}` : ''}`}
                        >
                          {s.name}
                        </span>
                        {s.notes && (
                          <span
                            className="ml-1.5 text-[10px] text-amber-700 font-medium hidden 2xl:inline"
                            title={s.notes}
                          >
                            · {s.notes}
                          </span>
                        )}
                      </td>

                      <td className="py-1.5 px-2 text-center font-mono font-semibold text-slate-700 whitespace-nowrap">
                        {s.class}
                      </td>

                      <td className="py-1.5 px-2 whitespace-nowrap">
                        <div className="inline-flex items-center gap-1">
                          <span
                            className="font-bold text-blue-700"
                            title={`${route?.code || ''} - ${route?.name || ''}`}
                          >
                            {route?.code || '—'}
                          </span>
                          {sessionTransfer && (
                            <span
                              className="text-[10px] font-bold text-purple-700 inline-flex items-center gap-0.5"
                              title={`Đi nhờ (${activeSessionType === 'morning' ? 'Sáng' : 'Chiều'}) -> ${routes.find((r) => r.id === sessionTransfer.toRouteId)?.code || ''}`}
                            >
                              <ArrowRightLeft className="w-3 h-3" />
                              {routes.find((r) => r.id === sessionTransfer.toRouteId)?.code}
                            </span>
                          )}
                        </div>
                      </td>

                      <td
                        className="py-1.5 px-2 text-slate-600 whitespace-nowrap hidden md:table-cell max-w-[170px] truncate"
                        title={stop?.name || 'Chưa gán điểm'}
                      >
                        {stop?.name || 'Chưa gán điểm'}
                      </td>

                      <td
                        className="py-1.5 px-2 text-slate-700 whitespace-nowrap hidden lg:table-cell max-w-[140px] truncate"
                        title={s.parentName}
                      >
                        {s.parentName}
                      </td>

                      <td className="py-1.5 px-2 whitespace-nowrap">
                        <a
                          href={`tel:${s.parentPhone}`}
                          className="text-blue-600 hover:underline font-mono text-[11px] inline-flex items-center gap-1"
                          title={`Gọi PH ${s.parentName}: ${s.parentPhone}`}
                        >
                          <Phone className="w-3 h-3 shrink-0" />
                          <span className="hidden sm:inline">{s.parentPhone}</span>
                        </a>
                      </td>

                      <td className="py-1.5 px-2 whitespace-nowrap text-[11px] font-semibold">
                        {activeSessionType === 'morning' ? (
                          morningStatus !== 'absent' && schoolStatus === 'dropped_at_school' ? (
                            <span className="text-emerald-700">
                              Đã vào trường ({rec?.morningSchoolTime})
                            </span>
                          ) : morningStatus === 'boarded' ? (
                            <span className="text-blue-700">
                              Đã lên xe ({rec?.morningPickupTime})
                            </span>
                          ) : morningStatus === 'absent' ? (
                            <span className="text-rose-600">Vắng sáng</span>
                          ) : (
                            <span className="text-slate-400 font-normal">Chưa điểm danh</span>
                          )
                        ) : afternoonDropoff === 'dropped_off' ? (
                          <span className="text-emerald-700">
                            Đã trả ({rec?.afternoonDropoffTime})
                          </span>
                        ) : afternoonBoard === 'boarded' ? (
                          <span className="text-indigo-700">
                            Đã lên xe ({rec?.afternoonBoardTime || ''})
                          </span>
                        ) : afternoonBoard === 'absent' ? (
                          <span className="text-rose-600">PH đón / Vắng</span>
                        ) : (
                          <span className="text-slate-400 font-normal">Chờ lên xe</span>
                        )}
                      </td>

                      <td className="py-1.5 pl-2 pr-3.5 text-right whitespace-nowrap">
                        <div className="inline-flex items-center justify-end gap-0.5">
                          <button
                            onClick={() => onViewStudentCard(s)}
                            className="p-1 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
                            title="Xem & in thẻ học sinh"
                          >
                            <Printer className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleStartEdit(s)}
                            className="p-1 text-slate-500 hover:text-amber-600 hover:bg-amber-50 rounded transition-colors"
                            title="Chỉnh sửa thông tin"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => setDeleteConfirmTarget({ type: 'single', student: s })}
                            className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded transition-colors"
                            title="Xóa học sinh"
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
        </>
        )}

        {/* Footer with Reset option */}
        <div className="px-3.5 py-2 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-xs tabular-nums">
          <span className="text-slate-500">
            Hiển thị <strong>{filteredStudents.length}</strong> / {students.length} học sinh
          </span>
          <button
            onClick={() => setDeleteConfirmTarget({ type: 'reset' })}
            className="text-slate-500 hover:text-rose-600 flex items-center gap-1 transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Khôi phục dữ liệu mẫu</span>
          </button>
        </div>
      </div>
      )}

      {/* Modal: Add / Edit Student */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full p-6 space-y-4">
            <h3 className="font-extrabold text-slate-900 text-base">
              {editingStudent ? 'Chỉnh Sửa Thông Tin Học Sinh' : 'Thêm Học Sinh Đi Xe Tuyến'}
            </h3>

            <form onSubmit={handleSaveStudent} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Mã học sinh</label>
                  <input
                    type="text"
                    required
                    value={formData.code}
                    onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                    className="w-full p-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Lớp</label>
                  <input
                    type="text"
                    required
                    placeholder="VD: 3A1"
                    value={formData.class}
                    onChange={(e) => setFormData({ ...formData, class: e.target.value })}
                    className="w-full p-2 bg-slate-50 border border-slate-300 rounded-xl text-xs"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Họ và tên học sinh</label>
                <input
                  type="text"
                  required
                  placeholder="VD: Nguyễn Văn Anh"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full p-2 bg-slate-50 border border-slate-300 rounded-xl text-xs"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Tên phụ huynh</label>
                  <input
                    type="text"
                    required
                    placeholder="VD: Nguyễn Văn Bố"
                    value={formData.parentName}
                    onChange={(e) => setFormData({ ...formData, parentName: e.target.value })}
                    className="w-full p-2 bg-slate-50 border border-slate-300 rounded-xl text-xs"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1">SĐT phụ huynh</label>
                  <input
                    type="tel"
                    required
                    placeholder="VD: 0912.345.678"
                    value={formData.parentPhone}
                    onChange={(e) => setFormData({ ...formData, parentPhone: e.target.value })}
                    className="w-full p-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Tuyến xe</label>
                  <select
                    value={formData.routeId}
                    onChange={(e) => {
                      const newRouteId = e.target.value;
                      const r = routes.find((x) => x.id === newRouteId);
                      setFormData({
                        ...formData,
                        routeId: newRouteId,
                        stopId: r?.stops[0]?.id || '',
                      });
                    }}
                    className="w-full p-2 bg-slate-50 border border-slate-300 rounded-xl text-xs"
                  >
                    {routes.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.code} - {r.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Điểm đón / trả</label>
                  <select
                    value={formData.stopId}
                    onChange={(e) => setFormData({ ...formData, stopId: e.target.value })}
                    className="w-full p-2 bg-slate-50 border border-slate-300 rounded-xl text-xs"
                  >
                    {routes
                      .find((r) => r.id === formData.routeId)
                      ?.stops.map((st) => (
                        <option key={st.id} value={st.id}>
                          {st.name} ({st.morningTime})
                        </option>
                      ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Lưu ý sức khỏe / say xe</label>
                <input
                  type="text"
                  placeholder="VD: Say xe nhẹ, cần ngồi ghế đầu..."
                  value={formData.notes || ''}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  className="w-full p-2 bg-slate-50 border border-slate-300 rounded-xl text-xs"
                />
              </div>

              <div className="flex gap-2 pt-3">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="flex-1 py-2 bg-slate-100 text-slate-700 rounded-xl text-xs font-bold hover:bg-slate-200"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-md"
                >
                  {editingStudent ? 'Cập Nhật' : 'Thêm Vào Tuyến'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Import CSV / Excel */}
      {showImportModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full p-5 sm:p-6 space-y-4 max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between gap-2">
              <div>
                <h3 className="font-extrabold text-slate-900 text-base">
                  Nhập Danh Sách Học Sinh từ Excel / Google Sheets
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Hỗ trợ copy-paste trực tiếp các ô từ Excel/Sheets (Tab) hoặc tải file .CSV
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={handleDownloadTemplate}
                  className="px-2.5 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-lg text-xs flex items-center gap-1 font-semibold"
                >
                  <Download className="w-3.5 h-3.5" />
                  Tải file mẫu
                </button>
                <button
                  type="button"
                  onClick={() => setShowImportModal(false)}
                  className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Default Route & Stop Fallback Selector */}
            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-bold text-slate-600 uppercase mb-1">
                  Tuyến xe mặc định (nếu cột tuyến để trống)
                </label>
                <select
                  value={importDefaultRouteId}
                  onChange={(e) => {
                    const nextId = e.target.value;
                    const r = routes.find((x) => x.id === nextId);
                    setImportDefaultRouteId(nextId);
                    setImportDefaultStopId(r?.stops[0]?.id || '');
                  }}
                  className="w-full p-2 bg-white border border-slate-300 rounded-lg text-xs font-semibold"
                >
                  {routes.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.code} - {r.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-bold text-slate-600 uppercase mb-1">
                  Điểm đón mặc định
                </label>
                <select
                  value={importDefaultStopId}
                  onChange={(e) => setImportDefaultStopId(e.target.value)}
                  className="w-full p-2 bg-white border border-slate-300 rounded-lg text-xs"
                >
                  {routes
                    .find((r) => r.id === importDefaultRouteId)
                    ?.stops.map((st) => (
                      <option key={st.id} value={st.id}>
                        {st.name} ({st.morningTime})
                      </option>
                    ))}
                </select>
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                <p className="text-slate-600">
                  Thứ tự cột: <strong>Mã HS</strong> | <strong>Họ tên</strong> | <strong>Lớp</strong> | Giới tính (Nam/Nữ) | Tên PH | SĐT PH | Mã tuyến ({routes.map((r) => r.code).join(', ')}) | Điểm đón / Ghi chú
                </p>
                <label className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-lg font-semibold cursor-pointer flex items-center gap-1 border border-slate-300">
                  <FileUp className="w-3.5 h-3.5 text-blue-600" />
                  <span>Chọn file .CSV</span>
                  <input
                    type="file"
                    accept=".csv,.tsv,.txt"
                    onChange={handleImportFileUpload}
                    className="hidden"
                  />
                </label>
              </div>

              <textarea
                rows={5}
                placeholder={`Copy trực tiếp từ Excel và Ctrl+V vào đây, hoặc nhập:\nHS-5001\tTrần Bảo Nam\t2A1\tNam\tTrần Văn An\t0912345678\t${routes[0]?.code || 'TB-01'}\tSay xe`}
                value={importCsvText}
                onChange={(e) => {
                  setImportCsvText(e.target.value);
                  setImportError(null);
                }}
                className="w-full p-3 bg-slate-50 border border-slate-300 rounded-xl text-xs font-mono focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>

            {/* Live Parse Preview */}
            {importCsvText.trim() && (
              <div className="rounded-xl border border-slate-200 overflow-hidden">
                <div className="px-3 py-2 bg-slate-100 border-b border-slate-200 flex items-center justify-between text-xs">
                  <span className="font-bold text-slate-800">
                    Xem trước: <span className="text-emerald-700">{parsedImportPreview.students.length} học sinh hợp lệ</span>
                    {parsedImportPreview.skippedRows > 0 && (
                      <span className="text-amber-700 ml-2">({parsedImportPreview.skippedRows} dòng bỏ qua)</span>
                    )}
                  </span>
                  {parsedImportPreview.delimiterLabel && (
                    <span className="text-[11px] text-slate-500 font-medium">
                      Định dạng: {parsedImportPreview.delimiterLabel}
                    </span>
                  )}
                </div>

                {parsedImportPreview.students.length > 0 && (
                  <div className="max-h-40 overflow-y-auto divide-y divide-slate-100 text-xs">
                    {parsedImportPreview.students.slice(0, 8).map((st, idx) => {
                      const r = routes.find((x) => x.id === st.routeId);
                      const stop = r?.stops.find((sp) => sp.id === st.stopId);
                      return (
                        <div key={idx} className="px-3 py-2 flex items-center justify-between gap-2 bg-white">
                          <div className="min-w-0">
                            <span className="font-mono text-slate-400 mr-1.5">{st.code}</span>
                            <strong className="text-slate-900">{st.name}</strong>
                            <span className="ml-1.5 px-1.5 py-0.5 bg-slate-100 rounded font-mono text-[10px]">
                              {st.class}
                            </span>
                          </div>
                          <div className="text-right text-[11px] text-slate-600 truncate max-w-[220px]">
                            <strong className="text-blue-700">{r?.code}</strong> • {stop?.name || 'Chưa gán điểm'}
                          </div>
                        </div>
                      );
                    })}
                    {parsedImportPreview.students.length > 8 && (
                      <div className="px-3 py-1.5 text-center text-[11px] text-slate-500 bg-slate-50">
                        ... và {parsedImportPreview.students.length - 8} học sinh khác
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {importError && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800 flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                <span>{importError}</span>
              </div>
            )}

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowImportModal(false)}
                className="flex-1 py-2.5 bg-slate-100 text-slate-700 rounded-xl text-xs font-bold hover:bg-slate-200"
              >
                Đóng
              </button>
              <button
                type="button"
                onClick={handleProcessImport}
                className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-md flex items-center justify-center gap-1.5"
              >
                <Upload className="w-4 h-4" />
                Xác Nhận Nhập ({parsedImportPreview.students.length} HS)
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Confirm Single / Bulk Student Deletion or Demo Reset */}
      {deleteConfirmTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 text-center space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-rose-100 text-rose-600 flex items-center justify-center mx-auto">
              <Trash2 className="w-6 h-6" />
            </div>

            {deleteConfirmTarget.type === 'single' && (
              <div>
                <h3 className="font-extrabold text-slate-900 text-base">
                  Xóa học sinh {deleteConfirmTarget.student.name}?
                </h3>
                <p className="text-xs text-slate-600 mt-1">
                  Học sinh <strong>{deleteConfirmTarget.student.name}</strong> ({deleteConfirmTarget.student.code} - Lớp{' '}
                  {deleteConfirmTarget.student.class}) sẽ bị xóa khỏi tuyến xe.
                </p>
              </div>
            )}

            {deleteConfirmTarget.type === 'bulk' && (
              <div>
                <h3 className="font-extrabold text-slate-900 text-base">{deleteConfirmTarget.title}</h3>
                <p className="text-xs text-slate-600 mt-1 leading-relaxed">{deleteConfirmTarget.description}</p>
              </div>
            )}

            {deleteConfirmTarget.type === 'reset' && (
              <div>
                <h3 className="font-extrabold text-slate-900 text-base">Khôi phục dữ liệu demo ban đầu?</h3>
                <p className="text-xs text-slate-600 mt-1">
                  Toàn bộ tuyến xe và danh sách học sinh hiện tại sẽ quay về dữ liệu mẫu ban đầu.
                </p>
              </div>
            )}

            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={() => setDeleteConfirmTarget(null)}
                className="flex-1 py-2.5 bg-slate-100 text-slate-700 rounded-xl text-xs font-bold hover:bg-slate-200"
              >
                Hủy bỏ
              </button>
              <button
                type="button"
                onClick={handleConfirmDeleteAction}
                className="flex-1 py-2.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold shadow-md"
              >
                {deleteConfirmTarget.type === 'reset' ? 'Khôi Phục' : 'Xác Nhận Xóa'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
