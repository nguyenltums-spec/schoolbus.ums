export type UserRole = 'driver' | 'supervisor' | 'parent' | 'admin' | 'analytics';

export interface DailyTrendData {
  date: string;
  displayDate: string; // e.g. "T2 30/10"
  dayOfWeek: string;
  total: number;
  present: number;
  absent: number;
  late: number;
  attendanceRate: number; // in %
  route1Rate: number;
  route2Rate: number;
  route3Rate: number;
  onTimeArrivalMins: number; // arrival before 07:30
}

export interface RoutePerformanceData {
  routeId: string;
  code: string;
  name: string;
  plateNumber: string;
  capacity: number;
  assignedStudents: number;
  presentToday: number;
  occupancyRate: number; // %
  attendanceRate: number; // %
  punctualityScore: number; // %
  driverName: string;
}

export interface AbsenceReasonStat {
  name: string;
  count: number;
  percentage: number;
  color: string;
}

export type SessionType = 'morning' | 'afternoon';

export type PickupStatus = 'pending' | 'boarded' | 'absent' | 'late';
export type SchoolArrivalStatus = 'pending' | 'dropped_at_school' | 'missing';

export type AfternoonBoardStatus = 'pending' | 'boarded' | 'absent' | 'missing';
export type AfternoonDropoffStatus = 'pending' | 'dropped_off';

export interface BusStop {
  id: string;
  name: string;
  address: string;
  morningTime: string; // e.g. "06:45"
  afternoonTime: string; // e.g. "17:15"
  landmark?: string;
  order: number;
}

export interface Route {
  id: string;
  code: string; // e.g. "TB-01"
  name: string; // e.g. "Tuyến 01: Cầu Giấy - Mỹ Đình"
  color: string;
  plateNumber: string; // e.g. "29B-188.45"
  busModel: string; // e.g. "Hyundai County 29 chỗ"
  capacity: number;
  driverName: string;
  driverPhone: string;
  driverAvatar?: string;
  supervisorName: string;
  supervisorPhone: string;
  stops: BusStop[];
  currentStopIndex: number; // 0 to stops.length - 1
  isMoving: boolean;
  morningStatus: 'not_started' | 'picking_up' | 'arrived_school' | 'completed';
  afternoonStatus: 'not_started' | 'boarding_school' | 'departed' | 'completed';
}

export interface Student {
  id: string;
  code: string; // e.g. "HS-101"
  name: string;
  class: string; // e.g. "4A1"
  avatar: string;
  gender: 'M' | 'F';
  parentName: string;
  parentPhone: string;
  routeId: string;
  stopId: string;
  notes?: string;
  hasMedicalNote?: boolean;
}

export interface BusTransferInfo {
  fromRouteId: string;
  toRouteId: string;
  status: 'pending_accept' | 'accepted' | 'rejected';
  note?: string;
  requestedBy?: string;
  requestedAt?: string;
  acceptedBy?: string;
  acceptedAt?: string;
}

export interface CheckinRecord {
  studentId: string;
  date: string; // YYYY-MM-DD
  
  // Morning cycle
  morningPickupStatus: PickupStatus;
  morningPickupTime?: string;
  morningPickupNote?: string;
  morningSchoolStatus: SchoolArrivalStatus;
  morningSchoolTime?: string;
  morningSchoolVerifier?: string;

  // Afternoon cycle
  afternoonBoardStatus: AfternoonBoardStatus;
  afternoonBoardTime?: string;
  afternoonDropoffStatus: AfternoonDropoffStatus;
  afternoonDropoffTime?: string;
  afternoonNote?: string;

  parentExcusedReason?: string; // e.g. "Bố mẹ đưa đón", "Nghỉ ốm"
  updatedAt: string;

  // Session-scoped cross-bus ride transfers ("Đi nhờ xe khác")
  morningTransfer?: BusTransferInfo | null;
  afternoonTransfer?: BusTransferInfo | null;

  // Legacy cross-bus ride transfer fields (kept for backward compatibility)
  transferFromRouteId?: string;
  transferToRouteId?: string;
  transferStatus?: 'pending_accept' | 'accepted' | 'rejected';
  transferSession?: SessionType;
  transferNote?: string;
  transferRequestedBy?: string;
  transferRequestedAt?: string;
  transferAcceptedBy?: string;
  transferAcceptedAt?: string;
}

export interface RouteSessionState {
  date: string;
  routeId: string;
  morningLocked: boolean;
  morningLockedBy?: string;
  morningLockedAt?: string;
  morningEmptyBusChecked: boolean; // Driver verified no child left behind
  morningEmptyBusCheckedAt?: string;

  // Driver morning pickup report submission
  morningReportSubmitted?: boolean;
  morningReportSubmittedAt?: string;
  morningReportSubmittedBy?: string;
  morningReportedTotal?: number;
  morningReportedBoarded?: number;
  morningReportedAbsent?: number;
  morningReportedTransferredOut?: number;
  morningReportedTransferredIn?: number;
  morningDbSavedAt?: string;

  afternoonLocked: boolean;
  afternoonLockedBy?: string;
  afternoonLockedAt?: string;
  afternoonEmptyBusChecked: boolean;
  afternoonEmptyBusCheckedAt?: string;

  // Driver afternoon boarding & dropoff confirmation
  afternoonReportSubmitted?: boolean;
  afternoonReportSubmittedAt?: string;
  afternoonReportSubmittedBy?: string;
  afternoonReportedBoarded?: number;
  afternoonReportedAbsent?: number;
  afternoonDropoffConfirmed?: boolean;
  afternoonDropoffConfirmedAt?: string;
  afternoonDropoffConfirmedBy?: string;
  afternoonDbSavedAt?: string;
}

export interface DatabaseSaveLog {
  id: string;
  date: string;
  sessionType: SessionType;
  routeId: string;
  routeCode: string;
  routeName: string;
  totalRoster: number;
  driverReportedPresent: number;
  supervisorVerifiedCount: number;
  absentCount: number;
  transferredInCount: number;
  transferredOutCount: number;
  afternoonDropoffCount?: number;
  savedBy: string;
  savedAt: string;
  syncedToGoogleSheet: boolean;
}

export interface AppNotification {
  id: string;
  title: string;
  message: string;
  timestamp: string;
  type: 'arrival' | 'boarded' | 'school_arrival' | 'alert' | 'lock' | 'absence' | 'transfer';
  routeId?: string;
  studentId?: string;
  isRead: boolean;
  roleTarget?: UserRole | 'all';
}

export interface GoogleSheetsConfig {
  webhookUrl: string; // Google Apps Script Web App URL
  sheetName: string;
  autoSync: boolean;
  lastSyncedAt?: string;
}

export interface ZaloConfig {
  enabled: boolean;
  deliveryMode: 'zalo_oa' | 'webhook';
  webhookUrl: string;
  defaultRecipientIds: string;
  routeRecipientIds: Record<string, string>;
  notifyOnStopArrival: boolean;
  notifyOnDriverReport: boolean;
  notifyOnSupervisorLock: boolean;
  notifyOnParentAbsence: boolean;
  notifyOnEmptyBus: boolean;
  lastSentAt?: string;
  lastStatus?: string;
}

export interface ZaloDeliveryLog {
  id: string;
  timestamp: string;
  title: string;
  message: string;
  mode: 'zalo_oa' | 'webhook' | 'manual_share';
  recipientSummary: string;
  ok: boolean;
  detail: string;
}

export type PermissionKey =
  | 'view_driver'
  | 'view_supervisor'
  | 'view_parent'
  | 'view_admin_students'
  | 'view_admin_routes'
  | 'view_analytics'
  | 'manage_sheets'
  | 'manage_accounts';

export interface RoleDefinition {
  id: string;
  name: string;
  description: string;
  color: string;
  isSystemAdmin?: boolean;
  permissions: PermissionKey[];
  createdAt: string;
}

export interface UserAccount {
  id: string;
  username: string;
  fullName: string;
  phone?: string;
  email?: string;
  passwordHash: string;
  roleId: string;
  assignedRouteId?: string; // 'all' or specific routeId
  assignedStudentId?: string;
  isActive: boolean;
  mustChangePassword?: boolean;
  createdAt: string;
  lastLoginAt?: string;
}

