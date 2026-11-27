import React, { useState } from 'react';
import {
  Bus,
  Lock,
  User,
  Eye,
  EyeOff,
  LogIn,
  ShieldCheck,
  AlertCircle,
  KeyRound,
  Sparkles,
} from 'lucide-react';
import { UserAccount } from '../../types';
import { authenticateUser } from '../../services/authService';
import { playSound } from '../../services/notificationAudio';
import umsLogo from '../../assets/ums-logo.png';

interface Props {
  accounts: UserAccount[];
  onLoginSuccess: (user: UserAccount) => void;
}

export const LoginScreen: React.FC<Props> = ({ accounts, onLoginSuccess }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const res = authenticateUser(username, password, accounts);
    if (!res.ok) {
      playSound('alert');
      setErrorMsg(res.error);
      return;
    }

    playSound('success');
    setErrorMsg(null);
    onLoginSuccess(res.user);
  };

  const handleQuickLogin = (demoUsername: string, demoPassword: string) => {
    setUsername(demoUsername);
    setPassword(demoPassword);
    setErrorMsg(null);
    const res = authenticateUser(demoUsername, demoPassword, accounts);
    if (res.ok) {
      playSound('success');
      onLoginSuccess(res.user);
    } else {
      setErrorMsg(res.error);
    }
  };

  const demoShortcuts = [
    {
      username: 'admin',
      password: 'admin123',
      label: 'Quản trị Admin',
      sub: 'Toàn quyền hệ thống',
      badge: 'bg-rose-50 border-rose-200 text-rose-800 hover:bg-rose-100',
    },
    {
      username: 'taixe1',
      password: '123456',
      label: 'Lái xe TB-01',
      sub: 'Điểm danh đón/trả',
      badge: 'bg-amber-50 border-amber-200 text-amber-800 hover:bg-amber-100',
    },
    {
      username: 'giamsat1',
      password: '123456',
      label: 'Giám sát trường',
      sub: 'Chốt sổ & thống kê',
      badge: 'bg-emerald-50 border-emerald-200 text-emerald-800 hover:bg-emerald-100',
    },
    {
      username: 'phuhuynh1',
      password: '123456',
      label: 'Phụ huynh',
      sub: 'Theo dõi hành trình',
      badge: 'bg-blue-50 border-blue-200 text-blue-800 hover:bg-blue-100',
    },
  ];

  const [logoFailed, setLogoFailed] = useState(false);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-indigo-950 flex items-center justify-center p-4">
      <div className="w-full max-w-4xl grid grid-cols-1 lg:grid-cols-12 bg-white rounded-3xl shadow-2xl overflow-hidden border border-slate-200/20">
        {/* Left Branding & Info Panel */}
        <div className="lg:col-span-5 bg-gradient-to-br from-amber-500 via-orange-500 to-amber-600 p-7 sm:p-8 text-white flex flex-col justify-between relative overflow-hidden">
          <div className="relative z-10 space-y-6">
            <div className="flex items-center gap-3.5">
              <div className="w-16 h-16 rounded-2xl bg-white p-1.5 flex items-center justify-center shadow-lg shrink-0 border border-white/60">
                {!logoFailed ? (
                  <img
                    src={umsLogo}
                    alt="Logo Trường THCS Ngoại Ngữ"
                    className="w-full h-full object-contain"
                    onError={() => setLogoFailed(true)}
                  />
                ) : (
                  <Bus className="w-8 h-8 text-rose-800" />
                )}
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-wider font-bold text-amber-100">
                  Hệ thống Quản lý Xe Tuyến
                </p>
                <h1 className="text-lg sm:text-xl font-black tracking-tight leading-tight text-white">
                  Trường THCS Ngoại Ngữ
                </h1>
                <p className="text-xs text-amber-50 font-semibold mt-0.5">SchoolBus Pro</p>
              </div>
            </div>

            <div className="space-y-3 pt-2">
              <h2 className="text-2xl font-black leading-snug">
                Đăng nhập hệ thống điều hành & phân quyền
              </h2>
              <p className="text-xs sm:text-sm text-amber-50 leading-relaxed">
                Phân tách rõ vai trò Lái xe, Giám sát nhà trường, Phụ huynh và Quản trị viên (Admin) với kiểm soát quyền hạn chặt chẽ.
              </p>
            </div>

            <div className="space-y-2.5 pt-2 text-xs">
              <div className="flex items-start gap-2.5 bg-white/15 backdrop-blur-xs rounded-2xl p-3 border border-white/20">
                <ShieldCheck className="w-4 h-4 shrink-0 mt-0.5" />
                <div>
                  <p className="font-bold">Toàn quyền Quản trị (Admin)</p>
                  <p className="text-amber-100 text-[11px] mt-0.5">
                    Tạo/sửa/xóa tài khoản, cấp lại mật khẩu và tùy chỉnh nhóm phân quyền linh hoạt.
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-2.5 bg-white/15 backdrop-blur-xs rounded-2xl p-3 border border-white/20">
                <Sparkles className="w-4 h-4 shrink-0 mt-0.5" />
                <div>
                  <p className="font-bold">Đồng bộ tức thời trên mọi thiết bị</p>
                  <p className="text-amber-100 text-[11px] mt-0.5">
                    Hỗ trợ điện thoại, iPad, máy tính bảng và PC văn phòng.
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="relative z-10 pt-5 mt-6 border-t border-white/20 text-[11px] text-amber-50 font-semibold">
            Trường THCS Ngoại Ngữ (UMS) • Đại học Ngoại ngữ - ĐHQGHN
          </div>
        </div>

        {/* Right Login Form Panel */}
        <div className="lg:col-span-7 p-6 sm:p-9 flex flex-col justify-center bg-white">
          <div className="max-w-md w-full mx-auto space-y-6">
            <div>
              <div className="flex items-center gap-2.5">
                {!logoFailed && (
                  <img
                    src={umsLogo}
                    alt="UMS"
                    className="w-8 h-8 object-contain"
                  />
                )}
                <span className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-blue-700 bg-blue-50 px-2.5 py-1 rounded-lg border border-blue-200">
                  <KeyRound className="w-3.5 h-3.5" />
                  Cổng Đăng Nhập • Trường THCS Ngoại Ngữ
                </span>
              </div>
              <h3 className="text-2xl font-black text-slate-900 mt-3">Xin chào!</h3>
              <p className="text-xs text-slate-500 mt-1">
                Nhập tên đăng nhập và mật khẩu được cấp để truy cập màn hình làm việc của bạn.
              </p>
            </div>

            {errorMsg && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-2xl text-xs text-rose-800 flex items-start gap-2.5">
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                <span className="font-medium leading-relaxed">{errorMsg}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1.5">
                  Tên đăng nhập
                </label>
                <div className="relative">
                  <User className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    required
                    autoFocus
                    autoComplete="username"
                    placeholder="VD: admin, taixe1, giamsat1..."
                    value={username}
                    onChange={(e) => {
                      setUsername(e.target.value);
                      setErrorMsg(null);
                    }}
                    className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1.5">
                  Mật khẩu
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    autoComplete="current-password"
                    placeholder="Nhập mật khẩu..."
                    value={password}
                    onChange={(e) => {
                      setPassword(e.target.value);
                      setErrorMsg(null);
                    }}
                    className="w-full pl-10 pr-11 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((prev) => !prev)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-700"
                    title={showPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                className="w-full py-3 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-sm font-bold shadow-lg shadow-slate-900/15 flex items-center justify-center gap-2 transition-all active:scale-[0.99]"
              >
                <LogIn className="w-4 h-4 text-amber-400" />
                <span>Đăng Nhập Hệ Thống</span>
              </button>
            </form>

            {/* Quick Login Demo Shortcuts */}
            <div className="pt-4 border-t border-slate-100 space-y-2.5">
              <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                Đăng nhập nhanh theo vai trò mẫu
              </p>
              <div className="grid grid-cols-2 gap-2">
                {demoShortcuts.map((item) => {
                  const accountExists = accounts.some(
                    (a) => a.username.toLowerCase() === item.username.toLowerCase()
                  );
                  if (!accountExists) return null;
                  return (
                    <button
                      key={item.username}
                      type="button"
                      onClick={() => handleQuickLogin(item.username, item.password)}
                      className={`p-2.5 rounded-xl border text-left transition-all ${item.badge}`}
                    >
                      <div className="flex items-center justify-between gap-1">
                        <span className="text-xs font-extrabold">{item.label}</span>
                        <span className="text-[10px] font-mono opacity-75">{item.username}</span>
                      </div>
                      <p className="text-[10px] opacity-80 mt-0.5">{item.sub}</p>
                    </button>
                  );
                })}
              </div>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                Lưu ý: Nếu Admin đã đổi mật khẩu hoặc xóa tài khoản mẫu, hãy đăng nhập bằng mật khẩu mới được cấp.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
