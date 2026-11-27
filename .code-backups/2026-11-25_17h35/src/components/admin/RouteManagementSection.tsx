import React, { useState } from 'react';
import {
  Bus,
  Plus,
  Edit2,
  Trash2,
  MapPin,
  Clock,
  Phone,
  User,
  Users,
  ArrowUp,
  ArrowDown,
  X,
  Save,
  ShieldCheck,
  AlertTriangle,
  CheckCircle2
} from 'lucide-react';
import { Route, BusStop, Student } from '../../types';
import { playSound } from '../../services/notificationAudio';

interface Props {
  routes: Route[];
  students: Student[];
  onAddRoute: (route: Route) => void;
  onUpdateRoute: (route: Route) => void;
  onDeleteRoute: (routeId: string, studentAction?: string) => void;
}

const ROUTE_COLORS = [
  { label: 'Xanh dương', value: '#2563eb' },
  { label: 'Xanh ngọc', value: '#059669' },
  { label: 'Vàng cam', value: '#d97706' },
  { label: 'Tím chàm', value: '#4f46e5' },
  { label: 'Đỏ hồng', value: '#e11d48' },
  { label: 'Xanh lơ', value: '#0891b2' },
];

export const RouteManagementSection: React.FC<Props> = ({
  routes,
  students,
  onAddRoute,
  onUpdateRoute,
  onDeleteRoute,
}) => {
  const [showRouteModal, setShowRouteModal] = useState(false);
  const [editingRoute, setEditingRoute] = useState<Route | null>(null);
  const [routeToDelete, setRouteToDelete] = useState<Route | null>(null);
  const [deleteStudentMode, setDeleteStudentMode] = useState<'move' | 'delete'>('move');
  const [moveTargetRouteId, setMoveTargetRouteId] = useState<string>('');
  const [stopError, setStopError] = useState<string | null>(null);
  const [feedbackMsg, setFeedbackMsg] = useState<string | null>(null);

  // Route form state
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [color, setColor] = useState('#2563eb');
  const [plateNumber, setPlateNumber] = useState('');
  const [busModel, setBusModel] = useState('Hyundai County 29 chỗ');
  const [capacity, setCapacity] = useState(29);
  const [driverName, setDriverName] = useState('');
  const [driverPhone, setDriverPhone] = useState('');
  const [supervisorName, setSupervisorName] = useState('');
  const [supervisorPhone, setSupervisorPhone] = useState('');
  const [stops, setStops] = useState<BusStop[]>([]);

  const showSuccessBanner = (msg: string) => {
    setFeedbackMsg(msg);
    setTimeout(() => setFeedbackMsg(null), 5000);
  };

  const openAddModal = () => {
    const nextNum = routes.length + 1;
    const padded = String(nextNum).padStart(2, '0');
    setEditingRoute(null);
    setCode(`TB-${padded}`);
    setName(`Tuyến ${padded}: `);
    setColor(ROUTE_COLORS[(nextNum - 1) % ROUTE_COLORS.length].value);
    setPlateNumber('29B-');
    setBusModel('Hyundai County 29 chỗ');
    setCapacity(29);
    setDriverName('');
    setDriverPhone('');
    setSupervisorName('');
    setSupervisorPhone('');
    setStops([
      {
        id: `stop-${Date.now()}-1`,
        name: 'Điểm đón số 1',
        address: '',
        morningTime: '06:30',
        afternoonTime: '17:00',
        landmark: '',
        order: 1,
      },
      {
        id: `stop-${Date.now()}-school`,
        name: 'Cổng Trường Học (Điểm cuối)',
        address: 'Cổng đón trả học sinh',
        morningTime: '07:30',
        afternoonTime: '16:15',
        landmark: 'Cổng chính nhà trường',
        order: 2,
      },
    ]);
    setStopError(null);
    setShowRouteModal(true);
  };

  const openEditModal = (route: Route) => {
    setEditingRoute(route);
    setCode(route.code);
    setName(route.name);
    setColor(route.color || '#2563eb');
    setPlateNumber(route.plateNumber);
    setBusModel(route.busModel);
    setCapacity(route.capacity);
    setDriverName(route.driverName);
    setDriverPhone(route.driverPhone);
    setSupervisorName(route.supervisorName);
    setSupervisorPhone(route.supervisorPhone);
    setStops(route.stops.map((s) => ({ ...s })));
    setStopError(null);
    setShowRouteModal(true);
  };

  const openDeleteModal = (route: Route) => {
    const otherRoutes = routes.filter((r) => r.id !== route.id);
    if (otherRoutes.length === 0) return;
    setMoveTargetRouteId(otherRoutes[0].id);
    setDeleteStudentMode('move');
    setRouteToDelete(route);
  };

  const handleConfirmDeleteRoute = () => {
    if (!routeToDelete) return;
    const action = deleteStudentMode === 'delete' ? '__delete_students__' : moveTargetRouteId;
    onDeleteRoute(routeToDelete.id, action);
    playSound('beep');
    showSuccessBanner(`Đã xóa tuyến "${routeToDelete.code} - ${routeToDelete.name}" khỏi hệ thống.`);
    setRouteToDelete(null);
  };

  const handleAddStop = () => {
    const newOrder = stops.length + 1;
    const newStop: BusStop = {
      id: `stop-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      name: `Điểm đón số ${newOrder}`,
      address: '',
      morningTime: '06:45',
      afternoonTime: '16:45',
      landmark: '',
      order: newOrder,
    };
    setStops((prev) => [...prev, newStop]);
  };

  const handleUpdateStop = (idx: number, field: keyof BusStop, value: string | number) => {
    setStops((prev) =>
      prev.map((st, i) => (i === idx ? { ...st, [field]: value } : st))
    );
  };

  const handleMoveStop = (idx: number, direction: -1 | 1) => {
    const targetIdx = idx + direction;
    if (targetIdx < 0 || targetIdx >= stops.length) return;
    const updated = [...stops];
    const temp = updated[idx];
    updated[idx] = updated[targetIdx];
    updated[targetIdx] = temp;
    setStops(updated.map((st, i) => ({ ...st, order: i + 1 })));
  };

  const handleRemoveStop = (idx: number) => {
    if (stops.length <= 1) {
      setStopError('Mỗi tuyến xe cần giữ lại ít nhất 1 điểm dừng.');
      return;
    }
    setStopError(null);
    setStops((prev) =>
      prev.filter((_, i) => i !== idx).map((st, i) => ({ ...st, order: i + 1 }))
    );
  };

  const handleSaveRoute = (e: React.FormEvent) => {
    e.preventDefault();
    if (!code.trim() || !name.trim() || !plateNumber.trim()) return;

    const normalizedStops = stops.map((st, idx) => ({
      ...st,
      name: st.name.trim() || `Điểm dừng ${idx + 1}`,
      order: idx + 1,
    }));

    if (editingRoute) {
      onUpdateRoute({
        ...editingRoute,
        code: code.trim(),
        name: name.trim(),
        color,
        plateNumber: plateNumber.trim(),
        busModel: busModel.trim() || 'Xe tuyến trường học',
        capacity: Number(capacity) || 29,
        driverName: driverName.trim() || 'Chưa cập nhật',
        driverPhone: driverPhone.trim() || '',
        supervisorName: supervisorName.trim() || 'Chưa cập nhật',
        supervisorPhone: supervisorPhone.trim() || '',
        stops: normalizedStops,
        currentStopIndex: Math.min(editingRoute.currentStopIndex, Math.max(0, normalizedStops.length - 1)),
      });
    } else {
      const newRoute: Route = {
        id: `route-${Date.now()}`,
        code: code.trim(),
        name: name.trim(),
        color,
        plateNumber: plateNumber.trim(),
        busModel: busModel.trim() || 'Xe tuyến trường học',
        capacity: Number(capacity) || 29,
        driverName: driverName.trim() || 'Chưa cập nhật',
        driverPhone: driverPhone.trim() || '',
        supervisorName: supervisorName.trim() || 'Chưa cập nhật',
        supervisorPhone: supervisorPhone.trim() || '',
        stops: normalizedStops,
        currentStopIndex: 0,
        isMoving: false,
        morningStatus: 'not_started',
        afternoonStatus: 'not_started',
      };
      onAddRoute(newRoute);
    }

    playSound('success');
    setShowRouteModal(false);
    showSuccessBanner(
      editingRoute
        ? `Đã cập nhật tuyến "${code.trim()} - ${name.trim()}".`
        : `Đã tạo tuyến xe mới "${code.trim()} - ${name.trim()}".`
    );
  };

  return (
    <div className="space-y-4">
      {/* Top Action Header */}
      <div className="bg-white rounded-2xl p-4 shadow-xs border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h3 className="font-extrabold text-slate-900 text-base flex items-center gap-2">
            <Bus className="w-5 h-5 text-blue-600" />
            <span>Quản Lý Tuyến Xe & Điểm Đón/Trả Thực Tế</span>
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Thêm mới, chỉnh sửa biển số, lái xe, giám sát xe và xóa bớt các tuyến xe thừa không sử dụng.
          </p>
        </div>

        <button
          onClick={openAddModal}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 shadow-md shadow-blue-600/20 transition-colors shrink-0"
        >
          <Plus className="w-4 h-4" />
          <span>Thêm Tuyến Xe Mới</span>
        </button>
      </div>

      {feedbackMsg && (
        <div className="p-3.5 bg-emerald-50 border border-emerald-300 text-emerald-900 rounded-2xl flex items-center justify-between gap-3 text-xs font-bold shadow-xs animate-in fade-in">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
            <span>{feedbackMsg}</span>
          </div>
          <button
            onClick={() => setFeedbackMsg(null)}
            className="p-1 rounded-lg text-emerald-700 hover:bg-emerald-100"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Routes Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {routes.map((route) => {
          const assignedStudents = students.filter((s) => s.routeId === route.id);

          return (
            <div
              key={route.id}
              className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden flex flex-col justify-between"
            >
              <div>
                {/* Route Card Header */}
                <div className="p-4 border-b border-slate-100 flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <div
                      className="w-11 h-11 rounded-2xl text-white flex items-center justify-center font-extrabold text-xs shrink-0 shadow-sm"
                      style={{ backgroundColor: route.color || '#2563eb' }}
                    >
                      {route.code}
                    </div>
                    <div>
                      <h4 className="font-extrabold text-slate-900 text-sm sm:text-base leading-snug">
                        {route.name}
                      </h4>
                      <div className="flex flex-wrap items-center gap-2 mt-1 text-xs text-slate-500">
                        <span className="font-mono font-bold text-slate-800 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                          {route.plateNumber}
                        </span>
                        <span>{route.busModel}</span>
                        <span>•</span>
                        <span className="font-semibold text-blue-700">
                          {assignedStudents.length}/{route.capacity} ghế
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Edit / Delete Buttons */}
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => openEditModal(route)}
                      className="px-2.5 py-1.5 bg-amber-50 hover:bg-amber-100 text-amber-800 rounded-xl text-xs font-bold flex items-center gap-1 border border-amber-200 transition-colors"
                      title="Sửa tuyến xe & điểm đón"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                      <span>Sửa</span>
                    </button>
                    {routes.length > 1 && (
                      <button
                        type="button"
                        onClick={() => openDeleteModal(route)}
                        className="px-2.5 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 rounded-xl text-xs font-bold flex items-center gap-1 border border-rose-200 transition-colors"
                        title="Xóa tuyến xe thừa"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Xóa</span>
                      </button>
                    )}
                  </div>
                </div>

                {/* Driver & Supervisor Info */}
                <div className="px-4 py-3 bg-slate-50/70 border-b border-slate-100 grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                  <div className="flex items-center gap-2 text-slate-700">
                    <User className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                    <div className="min-w-0">
                      <span className="text-slate-400">Lái xe: </span>
                      <strong className="text-slate-900">{route.driverName}</strong>
                      {route.driverPhone && (
                        <span className="block font-mono text-[11px] text-slate-500">{route.driverPhone}</span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 text-slate-700">
                    <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                    <div className="min-w-0">
                      <span className="text-slate-400">Giám sát: </span>
                      <strong className="text-slate-900">{route.supervisorName}</strong>
                      {route.supervisorPhone && (
                        <span className="block font-mono text-[11px] text-slate-500">{route.supervisorPhone}</span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Stops List */}
                <div className="p-4 space-y-2">
                  <div className="flex items-center justify-between text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">
                    <span className="flex items-center gap-1">
                      <MapPin className="w-3.5 h-3.5 text-rose-500" />
                      Lộ trình ({route.stops.length} điểm đón/trả)
                    </span>
                    <span className="text-[11px] normal-case font-medium">Sáng / Chiều</span>
                  </div>

                  <div className="space-y-1.5">
                    {route.stops.map((st, idx) => {
                      const stopCount = assignedStudents.filter((s) => s.stopId === st.id).length;
                      return (
                        <div
                          key={st.id}
                          className="flex items-center justify-between gap-2 p-2 rounded-xl bg-slate-50 border border-slate-100 text-xs"
                        >
                          <div className="flex items-start gap-2 min-w-0">
                            <span className="w-5 h-5 rounded-full bg-slate-200 text-slate-700 font-bold text-[10px] flex items-center justify-center shrink-0 mt-0.5">
                              {idx + 1}
                            </span>
                            <div className="min-w-0">
                              <p className="font-bold text-slate-800 truncate">{st.name}</p>
                              {(st.address || st.landmark) && (
                                <p className="text-[11px] text-slate-500 truncate">
                                  {st.address} {st.landmark ? `(${st.landmark})` : ''}
                                </p>
                              )}
                            </div>
                          </div>

                          <div className="text-right shrink-0">
                            <span className="font-mono font-bold text-slate-700 block">
                              {st.morningTime} / {st.afternoonTime}
                            </span>
                            <span className="text-[10px] text-slate-400">{stopCount} HS</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Modal: Add / Edit Route & Stops */}
      {showRouteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl shadow-2xl max-w-3xl w-full max-h-[92vh] flex flex-col overflow-hidden border border-slate-200">
            {/* Modal Header */}
            <div className="p-4 bg-slate-900 text-white flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-blue-600 rounded-xl">
                  <Bus className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-extrabold text-base">
                    {editingRoute ? `Chỉnh Sửa Tuyến Xe: ${editingRoute.code}` : 'Thêm Tuyến Xe Mới'}
                  </h3>
                  <p className="text-xs text-slate-300">
                    Thiết lập thông tin xe, tài xế và thứ tự các điểm đón/trả học sinh
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowRouteModal(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Form Body */}
            <form onSubmit={handleSaveRoute} className="flex-1 overflow-y-auto p-5 space-y-5">
              {/* Basic Route Information */}
              <div className="space-y-3">
                <h4 className="text-xs font-extrabold text-slate-700 uppercase tracking-wider border-b border-slate-200 pb-1.5">
                  1. Thông Tin Chung & Xe Buýt
                </h4>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Mã tuyến *</label>
                    <input
                      type="text"
                      required
                      placeholder="VD: TB-04"
                      value={code}
                      onChange={(e) => setCode(e.target.value)}
                      className="w-full p-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-mono font-bold focus:bg-white"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-bold text-slate-700 mb-1">Tên tuyến xe *</label>
                    <input
                      type="text"
                      required
                      placeholder="VD: Tuyến 04: Long Biên - Hoàn Kiếm"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="w-full p-2 bg-slate-50 border border-slate-300 rounded-xl text-xs focus:bg-white"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Biển số xe *</label>
                    <input
                      type="text"
                      required
                      placeholder="29B-123.45"
                      value={plateNumber}
                      onChange={(e) => setPlateNumber(e.target.value)}
                      className="w-full p-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-mono focus:bg-white"
                    />
                  </div>
                  <div className="col-span-2 sm:col-span-1">
                    <label className="block text-xs font-bold text-slate-700 mb-1">Số ghế</label>
                    <input
                      type="number"
                      min={4}
                      max={60}
                      value={capacity}
                      onChange={(e) => setCapacity(Number(e.target.value))}
                      className="w-full p-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-mono focus:bg-white"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Loại xe</label>
                    <input
                      type="text"
                      placeholder="Hyundai 29 chỗ"
                      value={busModel}
                      onChange={(e) => setBusModel(e.target.value)}
                      className="w-full p-2 bg-slate-50 border border-slate-300 rounded-xl text-xs focus:bg-white"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Màu hiển thị</label>
                    <select
                      value={color}
                      onChange={(e) => setColor(e.target.value)}
                      className="w-full p-2 bg-slate-50 border border-slate-300 rounded-xl text-xs focus:bg-white"
                    >
                      {ROUTE_COLORS.map((c) => (
                        <option key={c.value} value={c.value}>
                          {c.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                  <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
                    <p className="text-[11px] font-bold text-slate-500 uppercase">Thông tin Lái xe</p>
                    <input
                      type="text"
                      placeholder="Họ tên lái xe"
                      value={driverName}
                      onChange={(e) => setDriverName(e.target.value)}
                      className="w-full p-2 bg-white border border-slate-300 rounded-lg text-xs"
                    />
                    <input
                      type="tel"
                      placeholder="Số điện thoại lái xe"
                      value={driverPhone}
                      onChange={(e) => setDriverPhone(e.target.value)}
                      className="w-full p-2 bg-white border border-slate-300 rounded-lg text-xs font-mono"
                    />
                  </div>

                  <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
                    <p className="text-[11px] font-bold text-slate-500 uppercase">Giám sát / Phụ xe</p>
                    <input
                      type="text"
                      placeholder="Họ tên cô/thầy quản xe"
                      value={supervisorName}
                      onChange={(e) => setSupervisorName(e.target.value)}
                      className="w-full p-2 bg-white border border-slate-300 rounded-lg text-xs"
                    />
                    <input
                      type="tel"
                      placeholder="Số điện thoại giám sát"
                      value={supervisorPhone}
                      onChange={(e) => setSupervisorPhone(e.target.value)}
                      className="w-full p-2 bg-white border border-slate-300 rounded-lg text-xs font-mono"
                    />
                  </div>
                </div>
              </div>

              {/* Bus Stops Editor */}
              <div className="space-y-3">
                <div className="flex items-center justify-between border-b border-slate-200 pb-1.5">
                  <h4 className="text-xs font-extrabold text-slate-700 uppercase tracking-wider">
                    2. Danh Sách Điểm Đón / Trả ({stops.length} điểm)
                  </h4>
                  <button
                    type="button"
                    onClick={handleAddStop}
                    className="px-2.5 py-1 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 rounded-lg text-xs font-bold flex items-center gap-1 transition-colors"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Thêm Điểm Dừng</span>
                  </button>
                </div>

                {stopError && (
                  <div className="p-2.5 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 font-medium">
                    {stopError}
                  </div>
                )}

                <div className="space-y-2.5">
                  {stops.map((st, idx) => (
                    <div
                      key={st.id}
                      className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-2"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-extrabold text-blue-700">
                          Điểm #{idx + 1} {idx === stops.length - 1 && '(Thường là cổng trường)'}
                        </span>

                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            disabled={idx === 0}
                            onClick={() => handleMoveStop(idx, -1)}
                            className="p-1 rounded bg-white border border-slate-200 text-slate-600 hover:bg-slate-100 disabled:opacity-40"
                            title="Di chuyển lên"
                          >
                            <ArrowUp className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            disabled={idx === stops.length - 1}
                            onClick={() => handleMoveStop(idx, 1)}
                            className="p-1 rounded bg-white border border-slate-200 text-slate-600 hover:bg-slate-100 disabled:opacity-40"
                            title="Di chuyển xuống"
                          >
                            <ArrowDown className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleRemoveStop(idx)}
                            className="p-1 rounded bg-white border border-rose-200 text-rose-600 hover:bg-rose-50"
                            title="Xóa điểm dừng này"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
                        <div className="sm:col-span-2">
                          <input
                            type="text"
                            required
                            placeholder="Tên điểm đón (VD: KĐT Times City)"
                            value={st.name}
                            onChange={(e) => handleUpdateStop(idx, 'name', e.target.value)}
                            className="w-full p-2 bg-white border border-slate-300 rounded-lg text-xs font-semibold"
                          />
                        </div>
                        <div>
                          <input
                            type="text"
                            placeholder="Giờ đón sáng (06:45)"
                            value={st.morningTime}
                            onChange={(e) => handleUpdateStop(idx, 'morningTime', e.target.value)}
                            className="w-full p-2 bg-white border border-slate-300 rounded-lg text-xs font-mono"
                          />
                        </div>
                        <div>
                          <input
                            type="text"
                            placeholder="Giờ trả chiều (16:55)"
                            value={st.afternoonTime}
                            onChange={(e) => handleUpdateStop(idx, 'afternoonTime', e.target.value)}
                            className="w-full p-2 bg-white border border-slate-300 rounded-lg text-xs font-mono"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <input
                          type="text"
                          placeholder="Địa chỉ cụ thể"
                          value={st.address}
                          onChange={(e) => handleUpdateStop(idx, 'address', e.target.value)}
                          className="w-full p-2 bg-white border border-slate-300 rounded-lg text-xs"
                        />
                        <input
                          type="text"
                          placeholder="Mốc nhận diện (VD: Cổng T1)"
                          value={st.landmark || ''}
                          onChange={(e) => handleUpdateStop(idx, 'landmark', e.target.value)}
                          className="w-full p-2 bg-white border border-slate-300 rounded-lg text-xs"
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Footer Save Actions inside Form */}
              <div className="pt-3 border-t border-slate-200 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowRouteModal(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-md flex items-center gap-1.5"
                >
                  <Save className="w-4 h-4" />
                  <span>{editingRoute ? 'Lưu Thay Đổi Tuyến Xe' : 'Tạo Tuyến Xe Mới'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Confirm Delete Route */}
      {routeToDelete && (() => {
        const affectedCount = students.filter((s) => s.routeId === routeToDelete.id).length;
        const otherRoutes = routes.filter((r) => r.id !== routeToDelete.id);

        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
            <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 space-y-4">
              <div className="flex items-start gap-3">
                <div className="w-11 h-11 rounded-2xl bg-rose-100 text-rose-600 flex items-center justify-center shrink-0">
                  <AlertTriangle className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="font-extrabold text-slate-900 text-base">
                    Xóa tuyến xe {routeToDelete.code}?
                  </h3>
                  <p className="text-xs text-slate-600 mt-0.5">
                    Tuyến: <strong>{routeToDelete.name}</strong> ({routeToDelete.plateNumber})
                  </p>
                </div>
              </div>

              {affectedCount > 0 ? (
                <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-xl space-y-3 text-xs">
                  <p className="font-bold text-amber-900">
                    Tuyến này hiện đang có {affectedCount} học sinh. Bạn muốn xử lý các học sinh này như thế nào?
                  </p>

                  <label className="flex items-start gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="deleteRouteStudentAction"
                      checked={deleteStudentMode === 'move'}
                      onChange={() => setDeleteStudentMode('move')}
                      className="mt-0.5 text-blue-600"
                    />
                    <div className="flex-1 space-y-1.5">
                      <span className="font-semibold text-slate-800 block">
                        Chuyển {affectedCount} học sinh sang tuyến khác:
                      </span>
                      <select
                        disabled={deleteStudentMode !== 'move'}
                        value={moveTargetRouteId}
                        onChange={(e) => setMoveTargetRouteId(e.target.value)}
                        className="w-full p-2 bg-white border border-slate-300 rounded-lg text-xs font-semibold disabled:opacity-50"
                      >
                        {otherRoutes.map((r) => (
                          <option key={r.id} value={r.id}>
                            {r.code} - {r.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  </label>

                  <label className="flex items-center gap-2 cursor-pointer pt-1 border-t border-amber-200/70">
                    <input
                      type="radio"
                      name="deleteRouteStudentAction"
                      checked={deleteStudentMode === 'delete'}
                      onChange={() => setDeleteStudentMode('delete')}
                      className="text-rose-600"
                    />
                    <span className="font-semibold text-rose-700">
                      Xóa luôn cả {affectedCount} học sinh cũ thuộc tuyến này
                    </span>
                  </label>
                </div>
              ) : (
                <p className="text-xs text-slate-600 bg-slate-50 p-3 rounded-xl border border-slate-200">
                  Tuyến xe này hiện không có học sinh nào. Bạn có chắc chắn muốn xóa khỏi hệ thống?
                </p>
              )}

              <div className="flex gap-3 pt-1">
                <button
                  type="button"
                  onClick={() => setRouteToDelete(null)}
                  className="flex-1 py-2.5 bg-slate-100 text-slate-700 rounded-xl text-xs font-bold hover:bg-slate-200"
                >
                  Hủy bỏ
                </button>
                <button
                  type="button"
                  onClick={handleConfirmDeleteRoute}
                  className="flex-1 py-2.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold shadow-md flex items-center justify-center gap-1.5"
                >
                  <Trash2 className="w-4 h-4" />
                  Xác Nhận Xóa Tuyến
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
};
