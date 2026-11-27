import React from 'react';
import { X, Printer, Bus, ShieldCheck, Phone, MapPin, User } from 'lucide-react';
import { Student, Route } from '../../types';

interface Props {
  student: Student | null;
  route?: Route;
  onClose: () => void;
}

export const StudentIdCardModal: React.FC<Props> = ({ student, route, onClose }) => {
  if (!student) return null;

  const stop = route?.stops.find((s) => s.id === student.stopId);

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden border border-slate-200">
        {/* Header */}
        <div className="p-4 bg-slate-900 text-white flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Bus className="w-5 h-5 text-amber-400" />
            <h3 className="font-bold text-sm">Thẻ Học Sinh Đi Xe Tuyến (Bus Pass)</h3>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Printable Bus ID Card */}
        <div className="p-6 bg-slate-100 flex justify-center">
          <div
            id="printable-bus-card"
            className="w-full bg-white rounded-2xl shadow-lg border-2 border-blue-500 overflow-hidden relative"
          >
            {/* Card Top Banner */}
            <div className="bg-gradient-to-r from-blue-700 via-blue-600 to-indigo-700 p-4 text-white text-center relative">
              <div className="flex items-center justify-between text-[10px] tracking-wider uppercase font-semibold text-blue-200 mb-1">
                <span>HỆ THỐNG XE TUYẾN TRƯỜNG HỌC</span>
                <span className="flex items-center gap-1 text-emerald-300">
                  <ShieldCheck className="w-3.5 h-3.5" /> XÁC THỰC
                </span>
              </div>
              <h2 className="font-extrabold text-base tracking-wide uppercase">THẺ XE TUYẾN HỌC ĐƯỜNG</h2>
              <p className="text-xs text-blue-100 font-mono mt-0.5">NĂM HỌC 2026 - 2027</p>
            </div>

            {/* Student Info Body */}
            <div className="p-5 space-y-4">
              <div className="flex items-start gap-4">
                <div className="w-20 h-24 rounded-xl overflow-hidden border-2 border-slate-200 shrink-0 shadow-xs bg-slate-100">
                  {student.avatar ? (
                    <img src={student.avatar} alt={student.name} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-slate-400">
                      <User className="w-8 h-8" />
                    </div>
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <span className="inline-block px-2 py-0.5 bg-blue-100 text-blue-800 text-[11px] font-bold rounded">
                    Lớp: {student.class}
                  </span>
                  <h3 className="font-bold text-slate-900 text-lg leading-tight mt-1">{student.name}</h3>
                  <p className="text-xs font-mono font-semibold text-slate-500 mt-0.5">Mã: {student.code}</p>

                  <div className="mt-2 text-xs text-slate-600 space-y-0.5">
                    <p className="truncate">
                      <span className="font-medium text-slate-800">Phụ huynh:</span> {student.parentName}
                    </p>
                    <p className="flex items-center gap-1 text-slate-700 font-mono">
                      <Phone className="w-3 h-3 text-emerald-600" /> {student.parentPhone}
                    </p>
                  </div>
                </div>
              </div>

              {/* Route & Stop details badge */}
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 text-xs space-y-1.5">
                <div className="flex items-center justify-between font-bold text-blue-900">
                  <span className="flex items-center gap-1.5">
                    <Bus className="w-3.5 h-3.5 text-blue-600" />
                    {route ? route.name : 'Tuyến chưa phân'}
                  </span>
                  <span className="font-mono bg-white px-1.5 py-0.5 rounded border border-blue-200">
                    {route?.plateNumber}
                  </span>
                </div>
                <div className="flex items-start gap-1 text-slate-700">
                  <MapPin className="w-3.5 h-3.5 text-rose-500 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-semibold text-slate-900">Điểm đón: </span>
                    {stop?.name || 'Chưa gán điểm'}
                    {stop && <span className="block text-[11px] text-slate-500">Giờ đón sáng: {stop.morningTime}</span>}
                  </div>
                </div>
              </div>

              {/* QR Code Container */}
              <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                <div className="text-[11px] text-slate-500">
                  <p className="font-semibold text-slate-700">Quét mã để điểm danh</p>
                  <p>Khi lên/xuống xe tuyến</p>
                  <p className="text-[10px] text-slate-400 mt-1">Hotline xe: {route?.driverPhone}</p>
                </div>
                {/* Visual QR Code render using SVG */}
                <div className="p-1.5 bg-white border border-slate-300 rounded-xl shadow-xs">
                  <svg width="72" height="72" viewBox="0 0 100 100" className="text-slate-900 fill-current">
                    {/* Corner 1 */}
                    <rect x="5" y="5" width="30" height="30" fill="currentColor" rx="4" />
                    <rect x="11" y="11" width="18" height="18" fill="white" rx="2" />
                    <rect x="15" y="15" width="10" height="10" fill="currentColor" />
                    {/* Corner 2 */}
                    <rect x="65" y="5" width="30" height="30" fill="currentColor" rx="4" />
                    <rect x="71" y="11" width="18" height="18" fill="white" rx="2" />
                    <rect x="75" y="15" width="10" height="10" fill="currentColor" />
                    {/* Corner 3 */}
                    <rect x="5" y="65" width="30" height="30" fill="currentColor" rx="4" />
                    <rect x="11" y="71" width="18" height="18" fill="white" rx="2" />
                    <rect x="15" y="75" width="10" height="10" fill="currentColor" />
                    {/* Data Pixels */}
                    <rect x="42" y="10" width="8" height="8" />
                    <rect x="52" y="20" width="8" height="8" />
                    <rect x="42" y="30" width="8" height="8" />
                    <rect x="10" y="45" width="8" height="8" />
                    <rect x="25" y="45" width="8" height="8" />
                    <rect x="45" y="45" width="12" height="12" rx="2" fill="#2563eb" />
                    <rect x="65" y="45" width="8" height="8" />
                    <rect x="80" y="45" width="8" height="8" />
                    <rect x="42" y="65" width="8" height="8" />
                    <rect x="54" y="75" width="8" height="8" />
                    <rect x="70" y="65" width="8" height="8" />
                    <rect x="80" y="75" width="12" height="8" />
                  </svg>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800"
          >
            Đóng
          </button>
          <button
            onClick={handlePrint}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-sm transition-colors"
          >
            <Printer className="w-4 h-4" />
            In Thẻ Này
          </button>
        </div>
      </div>
    </div>
  );
};
