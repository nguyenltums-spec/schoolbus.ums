import { Route, Student, CheckinRecord, RouteSessionState, AppNotification } from '../types';

export const getTodayDateString = (): string => {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export const INITIAL_ROUTES: Route[] = [
  {
    id: 'route-1',
    code: 'TX-01',
    name: 'Tuyến Xe 01 (Mặc định)',
    color: '#2563eb',
    plateNumber: '29B-000.01',
    busModel: 'Ford Transit 16 chỗ',
    capacity: 16,
    driverName: 'Lái xe Tuyến 01',
    driverPhone: '0900.000.001',
    supervisorName: 'Giám sát Tuyến 01',
    supervisorPhone: '0900.000.002',
    currentStopIndex: 0,
    isMoving: false,
    morningStatus: 'not_started',
    afternoonStatus: 'not_started',
    stops: [
      {
        id: 'stop-1-1',
        name: 'Điểm đón số 1',
        address: 'Cập nhật địa chỉ điểm đón trong Quản lý Tuyến xe',
        morningTime: '06:45',
        afternoonTime: '17:00',
        order: 1,
      },
      {
        id: 'stop-1-school',
        name: 'Cổng Trường',
        address: 'Khu vực đón trả xe tuyến tại trường',
        morningTime: '07:30',
        afternoonTime: '16:15',
        order: 2,
      },
    ],
  },
];

export const INITIAL_STUDENTS: Student[] = [];

export const createInitialRecords = (students: Student[]): Record<string, CheckinRecord> => {
  const today = getTodayDateString();
  const records: Record<string, CheckinRecord> = {};
  students.forEach((s) => {
    records[s.id] = {
      studentId: s.id,
      date: today,
      morningPickupStatus: 'pending',
      morningSchoolStatus: 'pending',
      afternoonBoardStatus: 'pending',
      afternoonDropoffStatus: 'pending',
      updatedAt: '06:00',
    };
  });
  return records;
};

export const INITIAL_ROUTE_SESSIONS: Record<string, RouteSessionState> = {};

export const INITIAL_NOTIFICATIONS: AppNotification[] = [];
