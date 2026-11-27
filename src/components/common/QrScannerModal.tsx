import React, { useState } from 'react';
import { QrCode, X, CheckCircle2, User, Search, Sparkles } from 'lucide-react';
import { Student } from '../../types';
import { playSound } from '../../services/notificationAudio';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  students: Student[];
  onScanSuccess: (student: Student) => void;
  title?: string;
  actionLabel?: string;
}

export const QrScannerModal: React.FC<Props> = ({
  isOpen,
  onClose,
  students,
  onScanSuccess,
  title = 'Quét Thẻ Xe Buýt Học Sinh (QR / Barcode)',
  actionLabel = 'Điểm danh',
}) => {
  const [searchCode, setSearchCode] = useState('');
  const [lastScanned, setLastScanned] = useState<Student | null>(null);

  if (!isOpen) return null;

  const handleSelect = (s: Student) => {
    playSound('beep');
    setLastScanned(s);
    onScanSuccess(s);
    setTimeout(() => {
      setLastScanned(null);
    }, 1800);
  };

  const filtered = students.filter(
    (s) =>
      s.code.toLowerCase().includes(searchCode.toLowerCase()) ||
      s.name.toLowerCase().includes(searchCode.toLowerCase()) ||
      s.class.toLowerCase().includes(searchCode.toLowerCase())
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden border border-slate-100 flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="p-4 bg-gradient-to-r from-blue-600 to-indigo-700 text-white flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-white/15 rounded-xl backdrop-blur-sm">
              <QrCode className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-base">{title}</h3>
              <p className="text-xs text-blue-100">Mô phỏng máy quét mã thẻ thông minh học sinh</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-white/80 hover:text-white hover:bg-white/10 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scanner Simulation Viewport */}
        <div className="p-6 bg-slate-950 flex flex-col items-center justify-center relative overflow-hidden text-center text-white min-h-[220px]">
          {/* Animated Laser Scanning Line */}
          <div className="absolute inset-x-8 top-12 bottom-12 border-2 border-dashed border-blue-400/60 rounded-2xl pointer-events-none flex items-center justify-center">
            <div className="w-full h-0.5 bg-gradient-to-r from-transparent via-cyan-400 to-transparent shadow-[0_0_12px_#38bdf8] animate-bounce" />
          </div>

          {lastScanned ? (
            <div className="z-10 bg-emerald-950/90 border border-emerald-500/50 rounded-xl p-4 flex items-center gap-3 animate-in zoom-in-95">
              <CheckCircle2 className="w-8 h-8 text-emerald-400 shrink-0" />
              <div className="text-left">
                <p className="text-xs text-emerald-300 font-medium">ĐÃ QUÉT THÀNH CÔNG</p>
                <p className="font-bold text-white text-base">{lastScanned.name}</p>
                <p className="text-xs text-emerald-200">
                  {lastScanned.code} • Lớp {lastScanned.class}
                </p>
              </div>
            </div>
          ) : (
            <div className="z-10 flex flex-col items-center">
              <div className="w-16 h-16 rounded-2xl bg-blue-500/10 border border-blue-400/30 flex items-center justify-center mb-3">
                <QrCode className="w-8 h-8 text-blue-400" />
              </div>
              <p className="text-sm font-medium text-slate-200">Hướng mã QR trên thẻ học sinh vào khung</p>
              <p className="text-xs text-slate-400 mt-1 max-w-xs">
                Hoặc chọn nhanh học sinh trong danh sách bên dưới để mô phỏng quét 1-chạm
              </p>
            </div>
          )}
        </div>

        {/* Quick Search & 1-Tap Simulation */}
        <div className="p-4 bg-slate-50 border-b border-slate-200">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Nhập mã thẻ (VD: HS-1001) hoặc tên học sinh..."
              value={searchCode}
              onChange={(e) => setSearchCode(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-white rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        {/* Student Quick List */}
        <div className="p-4 overflow-y-auto flex-1 divide-y divide-slate-100">
          <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2 flex items-center justify-between">
            <span>Danh sách học sinh trên tuyến ({filtered.length})</span>
            <span className="text-blue-600 flex items-center gap-1 font-normal">
              <Sparkles className="w-3.5 h-3.5" /> Bấm để quét giả lập
            </span>
          </div>

          {filtered.length === 0 ? (
            <p className="text-sm text-center text-slate-400 py-6">Không tìm thấy học sinh phù hợp</p>
          ) : (
            filtered.map((s) => (
              <div
                key={s.id}
                onClick={() => handleSelect(s)}
                className="py-2.5 px-3 -mx-2 rounded-xl flex items-center justify-between hover:bg-blue-50 cursor-pointer transition-colors group"
              >
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full overflow-hidden bg-slate-200 shrink-0 border border-slate-200">
                    {s.avatar ? (
                      <img src={s.avatar} alt={s.name} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-slate-500">
                        <User className="w-4 h-4" />
                      </div>
                    )}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-slate-800 text-sm group-hover:text-blue-600">
                        {s.name}
                      </span>
                      <span className="text-xs bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded font-mono">
                        {s.class}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 font-mono">{s.code}</p>
                  </div>
                </div>

                <button
                  type="button"
                  className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-medium shadow-sm hover:bg-blue-700 transition-colors flex items-center gap-1"
                >
                  <QrCode className="w-3.5 h-3.5" />
                  {actionLabel}
                </button>
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="p-3 bg-slate-50 border-t border-slate-200 text-right">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-800 transition-colors"
          >
            Đóng
          </button>
        </div>
      </div>
    </div>
  );
};
