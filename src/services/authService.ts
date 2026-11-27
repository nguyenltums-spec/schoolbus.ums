import { PermissionKey, RoleDefinition, UserAccount, UserRole } from '../types';

const STORAGE_KEYS = {
  ROLES: 'schoolbus_roles_v1',
  ACCOUNTS: 'schoolbus_accounts_v1',
  SESSION_USER_ID: 'schoolbus_session_user_v1',
};

const HASH_SALT = 'schoolbus_pro_auth_v1:';

/**
 * Pure TypeScript synchronous SHA-256 implementation.
 * Guarantees consistent password hashing across HTTPS and non-HTTPS iframe contexts.
 */
function sha256Hex(input: string): string {
  const utf8 = unescape(encodeURIComponent(input));
  const bytes: number[] = [];
  for (let i = 0; i < utf8.length; i++) {
    bytes.push(utf8.charCodeAt(i));
  }

  const K = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
  ];

  const H = [
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
    0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
  ];

  const bitLen = bytes.length * 8;
  bytes.push(0x80);
  while ((bytes.length % 64) !== 56) {
    bytes.push(0);
  }
  const highBits = Math.floor(bitLen / 0x100000000);
  const lowBits = bitLen >>> 0;
  bytes.push((highBits >>> 24) & 0xff, (highBits >>> 16) & 0xff, (highBits >>> 8) & 0xff, highBits & 0xff);
  bytes.push((lowBits >>> 24) & 0xff, (lowBits >>> 16) & 0xff, (lowBits >>> 8) & 0xff, lowBits & 0xff);

  const rotr = (x: number, n: number) => (x >>> n) | (x << (32 - n));

  for (let offset = 0; offset < bytes.length; offset += 64) {
    const w = new Array<number>(64);
    for (let i = 0; i < 16; i++) {
      const idx = offset + i * 4;
      w[i] = ((bytes[idx] << 24) | (bytes[idx + 1] << 16) | (bytes[idx + 2] << 8) | bytes[idx + 3]) >>> 0;
    }
    for (let i = 16; i < 64; i++) {
      const s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3);
      const s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
    }

    let [a, b, c, d, e, f, g, h] = H;
    for (let i = 0; i < 64; i++) {
      const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const ch = (e & f) ^ (~e & g);
      const temp1 = (h + S1 + ch + K[i] + w[i]) >>> 0;
      const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (S0 + maj) >>> 0;

      h = g;
      g = f;
      f = e;
      e = (d + temp1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) >>> 0;
    }

    H[0] = (H[0] + a) >>> 0;
    H[1] = (H[1] + b) >>> 0;
    H[2] = (H[2] + c) >>> 0;
    H[3] = (H[3] + d) >>> 0;
    H[4] = (H[4] + e) >>> 0;
    H[5] = (H[5] + f) >>> 0;
    H[6] = (H[6] + g) >>> 0;
    H[7] = (H[7] + h) >>> 0;
  }

  return H.map((v) => v.toString(16).padStart(8, '0')).join('');
}

export const hashPassword = (rawPassword: string): string => {
  return sha256Hex(`${HASH_SALT}${rawPassword}`);
};

export const verifyPassword = (rawPassword: string, expectedHash: string): boolean => {
  return hashPassword(rawPassword) === expectedHash;
};

export const ALL_PERMISSIONS: PermissionKey[] = [
  'view_driver',
  'view_supervisor',
  'view_parent',
  'view_admin_students',
  'view_admin_routes',
  'view_analytics',
  'manage_sheets',
  'manage_accounts',
];

export const PERMISSION_CATALOG: Array<{
  key: PermissionKey;
  label: string;
  description: string;
  category: 'operation' | 'admin';
}> = [
  {
    key: 'view_driver',
    label: 'Màn hình Lái xe / Phụ xe',
    description: 'Điểm danh đón/trả học sinh, quét QR, báo xe đến điểm, kiểm tra xe trống',
    category: 'operation',
  },
  {
    key: 'view_supervisor',
    label: 'Màn hình Giám sát trường',
    description: 'Kiểm soát học sinh vào/ra cổng trường, đối chiếu & chốt sổ sáng/chiều',
    category: 'operation',
  },
  {
    key: 'view_parent',
    label: 'Màn hình Phụ huynh',
    description: 'Theo dõi lộ trình xe buýt, báo nghỉ học, xem thẻ học sinh',
    category: 'operation',
  },
  {
    key: 'view_analytics',
    label: 'Biểu đồ Thống kê (Analytics)',
    description: 'Xem dashboard biểu đồ xu hướng đi học theo ngày, hiệu suất tuyến xe',
    category: 'operation',
  },
  {
    key: 'view_admin_students',
    label: 'Quản lý Học sinh & Nhập/Xuất Excel',
    description: 'Thêm, sửa, xóa học sinh, nhập Excel hàng loạt, xuất báo cáo CSV, in thẻ',
    category: 'admin',
  },
  {
    key: 'view_admin_routes',
    label: 'Quản lý Tuyến xe & Điểm đón',
    description: 'Thêm, sửa, xóa tuyến xe, gán lái xe/giám sát, cấu hình điểm đón/trả',
    category: 'admin',
  },
  {
    key: 'manage_sheets',
    label: 'Cấu hình & Đồng bộ Google Sheets',
    description: 'Kết nối Apps Script Webhook, đẩy dữ liệu điểm danh lên Google Sheet',
    category: 'admin',
  },
  {
    key: 'manage_accounts',
    label: 'Quản trị Tài khoản & Phân quyền',
    description: 'Toàn quyền tạo/sửa/xóa tài khoản, cấp lại mật khẩu, thêm/sửa/xóa nhóm quyền',
    category: 'admin',
  },
];

export const ROLE_COLORS = [
  { id: 'rose', label: 'Đỏ (Quản trị)', badgeClass: 'bg-rose-100 text-rose-800 border-rose-200' },
  { id: 'amber', label: 'Cam (Lái xe)', badgeClass: 'bg-amber-100 text-amber-800 border-amber-200' },
  { id: 'emerald', label: 'Xanh lá (Giám sát)', badgeClass: 'bg-emerald-100 text-emerald-800 border-emerald-200' },
  { id: 'blue', label: 'Xanh dương', badgeClass: 'bg-blue-100 text-blue-800 border-blue-200' },
  { id: 'indigo', label: 'Tím than', badgeClass: 'bg-indigo-100 text-indigo-800 border-indigo-200' },
  { id: 'purple', label: 'Tím', badgeClass: 'bg-purple-100 text-purple-800 border-purple-200' },
  { id: 'slate', label: 'Xám trung tính', badgeClass: 'bg-slate-100 text-slate-700 border-slate-200' },
];

export const getRoleBadgeClass = (color: string): string => {
  return ROLE_COLORS.find((c) => c.id === color)?.badgeClass || ROLE_COLORS[6].badgeClass;
};

export const INITIAL_ROLES: RoleDefinition[] = [
  {
    id: 'role-admin',
    name: 'Quản trị viên (Admin)',
    description: 'Toàn quyền điều hành hệ thống, quản lý học sinh, tuyến xe, tài khoản và phân quyền.',
    color: 'rose',
    isSystemAdmin: true,
    permissions: [...ALL_PERMISSIONS],
    createdAt: '2026-01-01',
  },
  {
    id: 'role-driver',
    name: 'Lái xe / Phụ xe',
    description: 'Điểm danh học sinh lên/xuống xe, quét mã QR, gửi thông báo xe sắp đến điểm.',
    color: 'amber',
    permissions: ['view_driver'],
    createdAt: '2026-01-01',
  },
  {
    id: 'role-supervisor',
    name: 'Giám sát nhà trường',
    description: 'Kiểm tra học sinh xuống xe tại cổng trường, chốt sổ sáng/chiều và xem biểu đồ thống kê.',
    color: 'emerald',
    permissions: ['view_supervisor', 'view_analytics', 'manage_sheets'],
    createdAt: '2026-01-01',
  },
  {
    id: 'role-parent',
    name: 'Phụ huynh học sinh',
    description: 'Theo dõi lộ trình xe tuyến theo thời gian thực và báo nghỉ phép cho con.',
    color: 'blue',
    permissions: ['view_parent'],
    createdAt: '2026-01-01',
  },
];

export const INITIAL_ACCOUNTS: UserAccount[] = [
  {
    id: 'acc-admin',
    username: 'admin',
    fullName: 'Quản trị viên Hệ thống',
    phone: '0901.000.999',
    email: 'admin@schoolbus.vn',
    passwordHash: hashPassword('admin123'),
    roleId: 'role-admin',
    assignedRouteId: 'all',
    isActive: true,
    mustChangePassword: false,
    createdAt: '2026-01-01',
  },
  {
    id: 'acc-driver-1',
    username: 'taixe1',
    fullName: 'Bác tài Nguyễn Văn Hùng',
    phone: '0912.345.678',
    passwordHash: hashPassword('123456'),
    roleId: 'role-driver',
    assignedRouteId: 'route-1',
    isActive: true,
    createdAt: '2026-01-01',
  },
  {
    id: 'acc-supervisor-1',
    username: 'giamsat1',
    fullName: 'Cô Trần Thu Hà (Giám sát)',
    phone: '0988.222.333',
    passwordHash: hashPassword('123456'),
    roleId: 'role-supervisor',
    assignedRouteId: 'all',
    isActive: true,
    createdAt: '2026-01-01',
  },
  {
    id: 'acc-parent-1',
    username: 'phuhuynh1',
    fullName: 'PH Phạm Minh Đức',
    phone: '0904.555.666',
    passwordHash: hashPassword('123456'),
    roleId: 'role-parent',
    isActive: true,
    createdAt: '2026-01-01',
  },
];

export const getStoredRoles = (): RoleDefinition[] => {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.ROLES);
    if (raw) {
      const parsed: RoleDefinition[] = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        // Ensure system admin role always keeps full permissions
        const hasAdmin = parsed.some((r) => r.isSystemAdmin);
        if (!hasAdmin) {
          return [INITIAL_ROLES[0], ...parsed];
        }
        return parsed.map((r) =>
          r.isSystemAdmin ? { ...r, permissions: [...ALL_PERMISSIONS] } : r
        );
      }
    }
  } catch (e) {
    console.error('Error loading roles', e);
  }
  return INITIAL_ROLES;
};

export const saveStoredRoles = (roles: RoleDefinition[]) => {
  try {
    localStorage.setItem(STORAGE_KEYS.ROLES, JSON.stringify(roles));
  } catch (e) {
    console.error('Error saving roles', e);
  }
};

export const getStoredAccounts = (): UserAccount[] => {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.ACCOUNTS);
    if (raw) {
      const parsed: UserAccount[] = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    }
  } catch (e) {
    console.error('Error loading accounts', e);
  }
  return INITIAL_ACCOUNTS;
};

export const saveStoredAccounts = (accounts: UserAccount[]) => {
  try {
    localStorage.setItem(STORAGE_KEYS.ACCOUNTS, JSON.stringify(accounts));
  } catch (e) {
    console.error('Error saving accounts', e);
  }
};

export const getStoredSessionUserId = (): string | null => {
  try {
    return localStorage.getItem(STORAGE_KEYS.SESSION_USER_ID);
  } catch {
    return null;
  }
};

export const saveStoredSessionUserId = (userId: string | null) => {
  try {
    if (userId) {
      localStorage.setItem(STORAGE_KEYS.SESSION_USER_ID, userId);
    } else {
      localStorage.removeItem(STORAGE_KEYS.SESSION_USER_ID);
    }
  } catch (e) {
    console.error('Error saving session user', e);
  }
};

export const authenticateUser = (
  username: string,
  password: string,
  accounts: UserAccount[]
): { ok: true; user: UserAccount } | { ok: false; error: string } => {
  const normalized = username.trim().toLowerCase();
  if (!normalized || !password) {
    return { ok: false, error: 'Vui lòng nhập đầy đủ tên đăng nhập và mật khẩu.' };
  }

  const user = accounts.find((a) => a.username.toLowerCase() === normalized);
  if (!user) {
    return { ok: false, error: 'Tên đăng nhập hoặc mật khẩu không chính xác.' };
  }

  if (!verifyPassword(password, user.passwordHash)) {
    return { ok: false, error: 'Tên đăng nhập hoặc mật khẩu không chính xác.' };
  }

  if (!user.isActive) {
    return {
      ok: false,
      error: 'Tài khoản này đang bị tạm khóa. Vui lòng liên hệ Quản trị viên (Admin) để mở khóa.',
    };
  }

  return { ok: true, user };
};

export const getAllowedViewsForPermissions = (permissions: PermissionKey[]): UserRole[] => {
  const allowed: UserRole[] = [];
  if (permissions.includes('view_driver')) allowed.push('driver');
  if (permissions.includes('view_supervisor')) allowed.push('supervisor');
  if (permissions.includes('view_parent')) allowed.push('parent');
  if (
    permissions.includes('view_admin_students') ||
    permissions.includes('view_admin_routes') ||
    permissions.includes('manage_accounts')
  ) {
    allowed.push('admin');
  }
  if (permissions.includes('view_analytics')) allowed.push('analytics');
  return allowed;
};

export const getDefaultViewForPermissions = (permissions: PermissionKey[]): UserRole => {
  if (permissions.includes('manage_accounts')) return 'admin';
  const allowed = getAllowedViewsForPermissions(permissions);
  return allowed[0] || 'driver';
};

export const generateRandomPassword = (length = 8): string => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
};
