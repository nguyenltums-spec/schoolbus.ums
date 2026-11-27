import { BusTransferInfo, CheckinRecord, SessionType } from '../types';

/**
 * Resolve cross-bus transfer info strictly for the requested session ('morning' or 'afternoon').
 * Falls back to legacy single-object transfer fields only if `transferSession` matches
 * (or defaults to 'morning' if `transferSession` was omitted in older records).
 */
export function getSessionTransfer(
  rec: CheckinRecord | undefined,
  session: SessionType
): BusTransferInfo | null {
  if (!rec) return null;

  if (session === 'morning') {
    if (rec.morningTransfer !== undefined) {
      return rec.morningTransfer;
    }
    if (
      rec.transferFromRouteId &&
      rec.transferToRouteId &&
      rec.transferStatus &&
      (!rec.transferSession || rec.transferSession === 'morning')
    ) {
      return {
        fromRouteId: rec.transferFromRouteId,
        toRouteId: rec.transferToRouteId,
        status: rec.transferStatus,
        note: rec.transferNote,
        requestedBy: rec.transferRequestedBy,
        requestedAt: rec.transferRequestedAt,
        acceptedBy: rec.transferAcceptedBy,
        acceptedAt: rec.transferAcceptedAt,
      };
    }
    return null;
  }

  if (rec.afternoonTransfer !== undefined) {
    return rec.afternoonTransfer;
  }
  if (
    rec.transferFromRouteId &&
    rec.transferToRouteId &&
    rec.transferStatus &&
    rec.transferSession === 'afternoon'
  ) {
    return {
      fromRouteId: rec.transferFromRouteId,
      toRouteId: rec.transferToRouteId,
      status: rec.transferStatus,
      note: rec.transferNote,
      requestedBy: rec.transferRequestedBy,
      requestedAt: rec.transferRequestedAt,
      acceptedBy: rec.transferAcceptedBy,
      acceptedAt: rec.transferAcceptedAt,
    };
  }
  return null;
}

export function isTransferredOutAcceptedForSession(
  rec: CheckinRecord | undefined,
  routeId: string,
  session: SessionType
): boolean {
  const t = getSessionTransfer(rec, session);
  return Boolean(t && t.fromRouteId === routeId && t.status === 'accepted');
}

export function isTransferredInAcceptedForSession(
  rec: CheckinRecord | undefined,
  routeId: string,
  session: SessionType
): boolean {
  const t = getSessionTransfer(rec, session);
  return Boolean(t && t.toRouteId === routeId && t.status === 'accepted');
}
