import React, { useState, useEffect } from 'react';
import {
  Users,
  Bus,
  CheckCircle2,
  Clock,
  MapPin,
  Phone,
  AlertCircle,
  QrCode,
  Calendar,
  Send,
  HeartHandshake,
  ShieldCheck,
  Navigation
} from 'lucide-react';
import { Student, Route, CheckinRecord, AppNotification } from '../../types';
import { playSound } from '../../services/notificationAudio';

interface Props {
  students: Student[];
  routes: Route[];
  records: Record<string, CheckinRecord>;
  onUpdateRecord: (studentId: string, updates: Partial<CheckinRecord>) => void;
  onSendNotification: (title: string, message: string, type: 'absence' | 'alert') => void;
  onViewStudentCard: (student: Student) => void;
  initialStudentId?: string;
}

export const ParentView: React.FC<Props> = ({
  students,
  routes,
  records,
  onUpdateRecord,
  onSendNotification,
  onViewStudentCard,
  initialStudentId,
}) => {
  const [selectedStudentId, setSelectedStudentId] = useState<string>(
    initialStudentId && students.some((s) => s.id === initialStudentId)
      ? initialStudentId
      : students[0]?.id || ''
  );

  useEffect(() => {
    if (initialStudentId && students.some((s) => s.id === initialStudentId)) {
      setSelectedStudentId(initialStudentId);
    }
  }, [initialStudentId, students]);
  const [showAbsenceForm, setShowAbsenceForm] = useState(false);
  const [absenceReason, setAbsenceReason] = useState('Bị sốt / ốm nhẹ');
  const [customAbsenceNote, setCustomAbsenceNote] = useState('');

  const currentStudent = students.find((s) => s.id === selectedStudentId) || students[0];
  const currentRoute = routes.find((r) => r.id === currentStudent?.routeId);
  const currentStop = currentRoute?.stops.find((st) => st.id === currentStudent?.stopId);
  const record = records[currentStudent?.id];

  const handleReportAbsence = () => {
    if (!currentStudent) return;
    playSound('alert');
    const finalReason = customAbsenceNote.trim() ? `${absenceReason}: ${customAbsenceNote.trim()}` : absenceReason;

    onUpdateRecord(currentStudent.id, {
      morningPickupStatus: 'absent',
      morningPickupNote: `Phụ huynh báo nghỉ: ${finalReason}`,
      afternoonBoardStatus: 'absent',
      parentExcusedReason: finalReason,
    });

    onSendNotification(
      `Phụ huynh báo nghỉ: ${currentStudent.name}`,
      `Phụ huynh em ${currentStudent.name} (${currentStudent.class}) báo nghỉ học hôm nay. Lý do: ${finalReason}`,
      'absence'
    );

    setShowAbsenceForm(false);
    setCustomAbsenceNote('');
  };

  const handleCancelAbsence = () => {
    if (!currentStudent) return;
    playSound('beep');
    onUpdateRecord(currentStudent.id, {
      morningPickupStatus: 'pending',
      morningPickupNote: undefined,
      parentExcusedReason: undefined,
    });
  };

  if (!currentStudent || !currentRoute) {
    return <div className="p-8 text-center text-slate-500">Đang tải dữ liệu học sinh...</div>;
  }

  // Calculate live timeline stages
  const isMorningBoarded = record?.morningPickupStatus === 'boarded';
  const isMorningAbsent = record?.morningPickupStatus === 'absent';
  const isAtSchool = record?.morningSchoolStatus === 'dropped_at_school';

  const isAfternoonBoarded = record?.afternoonBoardStatus === 'boarded';
  const isAfternoonDropped = record?.afternoonDropoffStatus === 'dropped_off';

  return (
    <div className="space-y-4 max-w-4xl mx-auto">
      {/* Student Selector (for parents with 1 or multiple children) */}
      <div className="bg-white rounded-2xl p-4 shadow-xs border border-slate-200">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-14 h-14 rounded-2xl overflow-hidden bg-slate-100 border-2 border-blue-500 shrink-0 shadow-xs">
              <img src={currentStudent.avatar} alt={currentStudent.name} className="w-full h-full object-cover" />
            </div>

            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-blue-600 uppercase tracking-wider">Cổng Phụ Huynh</span>
                <span className="px-2 py-0.5 bg-blue-100 text-blue-800 rounded text-xs font-bold font-mono">
                  Lớp {currentStudent.class}
                </span>
              </div>

              {/* Quick switch between students */}
              <div className="flex items-center gap-2 mt-0.5">
                <select
                  value={selectedStudentId}
                  onChange={(e) => setSelectedStudentId(e.target.value)}
                  className="font-extrabold text-slate-900 text-base sm:text-lg bg-transparent border-b border-dashed border-slate-300 focus:outline-none focus:border-blue-600 cursor-pointer"
                >
                  {students.slice(0, 10).map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.code} - Lớp {s.class})
                    </option>
                  ))}
                </select>
              </div>

              <p className="text-xs text-slate-500 mt-0.5">
                Phụ huynh: <strong className="text-slate-800">{currentStudent.parentName}</strong> ({currentStudent.parentPhone})
              </p>
            </div>
          </div>

          {/* Quick Actions: Bus Pass Card & Report Absence */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => onViewStudentCard(currentStudent)}
              className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors"
            >
              <QrCode className="w-4 h-4 text-blue-600" />
              <span>Xem Thẻ Xe</span>
            </button>

            {!isMorningAbsent ? (
              <button
                onClick={() => setShowAbsenceForm(true)}
                className="px-3.5 py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors"
              >
                <AlertCircle className="w-4 h-4 text-rose-500" />
                <span>Báo Nghỉ Đi Xe Hôm Nay</span>
              </button>
            ) : (
              <button
                onClick={handleCancelAbsence}
                className="px-3.5 py-2 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-300 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors"
              >
                <span>Hủy Báo Nghỉ (Con Đi Học)</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Real-time Status Card (Hero) */}
      <div className="bg-gradient-to-br from-blue-600 via-indigo-600 to-slate-900 rounded-2xl p-5 text-white shadow-xl">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-white/15 rounded-xl backdrop-blur-sm">
              <Bus className="w-5 h-5 text-amber-400" />
            </div>
            <div>
              <p className="text-xs text-blue-200 font-semibold uppercase tracking-wider">{currentRoute.name}</p>
              <h3 className="font-extrabold text-lg text-white">Biển số: {currentRoute.plateNumber}</h3>
            </div>
          </div>

          <div className="text-right">
            <span className="inline-block px-2.5 py-1 bg-white/20 backdrop-blur-sm rounded-full text-xs font-bold text-amber-300">
              {currentRoute.busModel}
            </span>
          </div>
        </div>

        {/* Live Journey Timeline */}
        <div className="mt-4 pt-4 border-t border-white/10 space-y-4">
          <p className="text-xs font-bold text-blue-200 uppercase tracking-wider flex items-center gap-1.5">
            <Navigation className="w-3.5 h-3.5 text-cyan-300" />
            Hành Trình Hôm Nay Của Con
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {/* Step 1: Pickup */}
            <div
              className={`p-3.5 rounded-xl border transition-all ${
                isMorningBoarded
                  ? 'bg-emerald-500/20 border-emerald-400/50 text-white'
                  : isMorningAbsent
                  ? 'bg-rose-500/20 border-rose-400/40 text-rose-200'
                  : 'bg-white/10 border-white/10 text-white/80'
              }`}
            >
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs font-bold">1. Đón Tại Điểm</span>
                {isMorningBoarded ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                ) : (
                  <Clock className="w-4 h-4 text-slate-300" />
                )}
              </div>
              <p className="text-xs text-white/90 font-medium line-clamp-1">{currentStop?.name}</p>
              <p className="text-[11px] text-blue-200 mt-1 font-mono">
                {isMorningBoarded
                  ? `Đã lên xe lúc ${record?.morningPickupTime}`
                  : isMorningAbsent
                  ? `Báo nghỉ: ${record?.parentExcusedReason || 'Vắng'}`
                  : `Dự kiến: ${currentStop?.morningTime}`}
              </p>
            </div>

            {/* Step 2: Transit */}
            <div
              className={`p-3.5 rounded-xl border transition-all ${
                isAtSchool
                  ? 'bg-emerald-500/20 border-emerald-400/50 text-white'
                  : isMorningBoarded
                  ? 'bg-blue-500/30 border-blue-400 text-white'
                  : 'bg-white/10 border-white/10 text-white/80'
              }`}
            >
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs font-bold">2. Di Chuyển Tuyến</span>
                <Bus className="w-4 h-4 text-cyan-300" />
              </div>
              <p className="text-xs text-white/90 font-medium">Lái xe: {currentRoute.driverName}</p>
              <p className="text-[11px] text-blue-200 mt-1">
                {isAtSchool
                  ? 'Đã hoàn thành lượt đi'
                  : isMorningBoarded
                  ? 'Đang trên đường đến trường'
                  : 'Chưa lên xe'}
              </p>
            </div>

            {/* Step 3: School Arrival & Lock */}
            <div
              className={`p-3.5 rounded-xl border transition-all ${
                isAtSchool
                  ? 'bg-emerald-500/30 border-emerald-400 text-white'
                  : 'bg-white/10 border-white/10 text-white/80'
              }`}
            >
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs font-bold">3. Vào Trường An Toàn</span>
                {isAtSchool ? (
                  <ShieldCheck className="w-4 h-4 text-emerald-400" />
                ) : (
                  <Clock className="w-4 h-4 text-slate-300" />
                )}
              </div>
              <p className="text-xs text-white/90 font-medium">Cổng trường Olympia</p>
              <p className="text-[11px] text-blue-200 mt-1 font-mono">
                {isAtSchool ? `Trường đã chốt lúc ${record?.morningSchoolTime}` : 'Đang chờ xe đến trường'}
              </p>
            </div>
          </div>
        </div>

        {/* Driver Contact & Hotline */}
        <div className="mt-4 pt-4 border-t border-white/10 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2">
            <span className="text-blue-200">Liên hệ khẩn cấp:</span>
            <a
              href={`tel:${currentRoute.driverPhone}`}
              className="px-2.5 py-1 bg-white/15 hover:bg-white/25 rounded-lg font-mono font-bold flex items-center gap-1.5 transition-colors"
            >
              <Phone className="w-3.5 h-3.5 text-emerald-300" />
              Lái xe: {currentRoute.driverPhone}
            </a>
            <a
              href={`tel:${currentRoute.supervisorPhone}`}
              className="px-2.5 py-1 bg-white/15 hover:bg-white/25 rounded-lg font-mono font-bold flex items-center gap-1.5 transition-colors hidden sm:flex"
            >
              <Phone className="w-3.5 h-3.5 text-amber-300" />
              Giám sát xe: {currentRoute.supervisorPhone}
            </a>
          </div>

          <div className="text-[11px] text-blue-200">
            Điểm đón con: <strong>{currentStop?.name}</strong>
          </div>
        </div>
      </div>

      {/* Route Stops Map Simulation */}
      <div className="bg-white rounded-2xl p-4 shadow-xs border border-slate-200">
        <h4 className="font-bold text-slate-800 text-sm mb-3 flex items-center gap-2">
          <MapPin className="w-4 h-4 text-rose-500" />
          <span>Lộ Trình Tuyến Xe Đón/Trả ({currentRoute.code})</span>
        </h4>

        <div className="space-y-3 relative before:absolute before:left-3 before:top-3 before:bottom-3 before:w-0.5 before:bg-slate-200">
          {currentRoute.stops.map((stop, idx) => {
            const isMyStop = stop.id === currentStudent.stopId;
            const isPassed = idx <= currentRoute.currentStopIndex;

            return (
              <div key={stop.id} className="relative flex items-start gap-4 pl-8">
                <div
                  className={`absolute left-1.5 top-1 w-3.5 h-3.5 rounded-full border-2 bg-white transition-all ${
                    isMyStop
                      ? 'border-blue-600 bg-blue-600 ring-4 ring-blue-100 scale-125'
                      : isPassed
                      ? 'border-emerald-500 bg-emerald-500'
                      : 'border-slate-300'
                  }`}
                />

                <div className="flex-1 bg-slate-50 p-3 rounded-xl border border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-slate-800 text-xs sm:text-sm">{stop.name}</span>
                      {isMyStop && (
                        <span className="px-2 py-0.5 bg-blue-600 text-white rounded text-[10px] font-extrabold uppercase">
                          Điểm đón của con
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5">{stop.address}</p>
                  </div>

                  <div className="text-right text-xs shrink-0">
                    <span className="font-mono text-slate-600">Đón sáng: <strong>{stop.morningTime}</strong></span>
                    <span className="block text-[11px] text-slate-400 font-mono">Trả chiều: {stop.afternoonTime}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Modal: Báo Nghỉ Học */}
      {showAbsenceForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-rose-100 text-rose-600 rounded-xl">
                <AlertCircle className="w-6 h-6" />
              </div>
              <div>
                <h3 className="font-extrabold text-slate-900 text-base">Báo Nghỉ Đi Xe Hôm Nay</h3>
                <p className="text-xs text-slate-500">Học sinh: {currentStudent.name} (Lớp {currentStudent.class})</p>
              </div>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  Lý do vắng mặt
                </label>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  {['Bị sốt / ốm nhẹ', 'Gia đình tự đưa đón', 'Bận việc riêng', 'Nghỉ có phép'].map((reason) => (
                    <button
                      key={reason}
                      type="button"
                      onClick={() => setAbsenceReason(reason)}
                      className={`p-2.5 rounded-xl border text-left font-medium transition-colors ${
                        absenceReason === reason
                          ? 'border-rose-500 bg-rose-50 text-rose-800 font-bold'
                          : 'border-slate-200 hover:bg-slate-50 text-slate-700'
                      }`}
                    >
                      {reason}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  Ghi chú thêm cho Lái xe & Trường (nếu có)
                </label>
                <textarea
                  rows={2}
                  placeholder="Ví dụ: Chiều bố sẽ đón con lúc 16h..."
                  value={customAbsenceNote}
                  onChange={(e) => setCustomAbsenceNote(e.target.value)}
                  className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs focus:bg-white focus:outline-none focus:ring-2 focus:ring-rose-500"
                />
              </div>
            </div>

            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowAbsenceForm(false)}
                className="flex-1 py-2.5 bg-slate-100 text-slate-700 rounded-xl text-xs font-bold hover:bg-slate-200"
              >
                Hủy
              </button>
              <button
                type="button"
                onClick={handleReportAbsence}
                className="flex-1 py-2.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold shadow-md transition-colors flex items-center justify-center gap-1.5"
              >
                <Send className="w-4 h-4" />
                Gửi Báo Nghỉ
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
