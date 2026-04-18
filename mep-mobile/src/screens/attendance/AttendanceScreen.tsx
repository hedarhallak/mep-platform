import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  ScrollView,
  RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { apiClient } from '../../api/client';
import Colors from '../../theme/colors';

interface TodayAssignment {
  assignment_id: number;
  project_id: number;
  project_name: string;
  project_code: string;
  shift_start: string;
  shift_end: string;
  assignment_role: string;
  site_address: string;
}

interface AttendanceRecord {
  attendance_id: number;
  attendance_status: string;
  check_in_time: string | null;
  check_out_time: string | null;
  is_late: boolean;
  regular_hours: number | null;
  overtime_hours: number | null;
}

function fmtTime(t: string | null): string {
  if (!t) return '--:--';
  return String(t).substring(0, 5);
}

function fmtHours(h: number | null): string {
  if (h === null || h === undefined) return '0h 0m';
  const hrs = Math.floor(h);
  const mins = Math.round((h - hrs) * 60);
  return `${hrs}h ${mins}m`;
}

export default function AttendanceScreen() {
  const { t, i18n } = useTranslation();
  const dateLocale = i18n.language === 'fr' ? 'fr-CA' : 'en-CA';
  const [assignment, setAssignment] = useState<TodayAssignment | null>(null);
  const [attendance, setAttendance] = useState<AttendanceRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const fetchData = useCallback(async () => {
    try {
      const today = new Date().toISOString().split('T')[0];
      const [assignRes, attendRes] = await Promise.all([
        apiClient.get('/api/assignments/my-today'),
        apiClient.get(`/api/attendance?date=${today}`),
      ]);

      const asgn = assignRes.data?.assignment || null;
      setAssignment(asgn);

      const records = attendRes.data?.records || [];
      if (records.length > 0) {
        const myRecord = asgn
          ? records.find((r: any) => r.assignment_request_id === asgn.assignment_id) || records[0]
          : records[0];
        setAttendance(myRecord || null);
      } else {
        setAttendance(null);
      }
    } catch (err: any) {
      if (err.response?.status !== 404) {
        Alert.alert(t('common.error'), t('attendance.loadError'));
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchData();
  };

  const handleCheckin = async () => {
    if (!assignment) return;
    setActionLoading(true);
    try {
      await apiClient.post('/api/attendance/checkin', {
        assignment_request_id: assignment.assignment_id,
      });
      await fetchData();
    } catch (err: any) {
      const msg = err.response?.data?.message || err.response?.data?.error || t('attendance.checkinFailed');
      Alert.alert(t('attendance.checkIn'), msg);
    } finally {
      setActionLoading(false);
    }
  };

  const handleCheckout = async () => {
    if (!attendance?.attendance_id) {
      Alert.alert(t('common.error'), t('attendance.noRecord'));
      return;
    }
    Alert.alert(
      t('attendance.confirmCheckout'),
      t('attendance.confirmCheckoutMsg'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('attendance.checkOut'),
          style: 'destructive',
          onPress: async () => {
            setActionLoading(true);
            try {
              await apiClient.patch(`/api/attendance/${attendance.attendance_id}/checkout`);
              await fetchData();
            } catch (err: any) {
              const msg = err.response?.data?.message || err.response?.data?.error || t('attendance.checkoutFailed');
              Alert.alert(t('attendance.checkOut'), msg);
            } finally {
              setActionLoading(false);
            }
          },
        },
      ]
    );
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  const recordStatus = attendance?.attendance_status || '';
  const isCheckedIn = recordStatus === 'CHECKED_IN';
  const isCheckedOut = ['CHECKED_OUT', 'CONFIRMED', 'ADJUSTED'].includes(recordStatus);

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}
    >
      <View style={styles.timeCard}>
        <Text style={styles.timeText}>
          {now.toLocaleTimeString(dateLocale, { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })}
        </Text>
        <Text style={styles.dateText}>
          {now.toLocaleDateString(dateLocale, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
        </Text>
      </View>

      {assignment ? (
        <View style={styles.projectCard}>
          <View style={styles.projectHeader}>
            <Ionicons name="business-outline" size={20} color={Colors.primary} />
            <Text style={styles.projectLabel}>{t('attendance.todaysAssignment')}</Text>
          </View>
          <Text style={styles.projectName}>{assignment.project_name}</Text>
          <Text style={styles.projectNumber}>{assignment.project_code}</Text>
          {assignment.site_address ? (
            <View style={styles.infoRow}>
              <Ionicons name="location-outline" size={16} color={Colors.textMuted} />
              <Text style={styles.infoText}>{assignment.site_address}</Text>
            </View>
          ) : null}
          <View style={styles.infoRow}>
            <Ionicons name="time-outline" size={16} color={Colors.textMuted} />
            <Text style={styles.infoText}>
              {String(assignment.shift_start).substring(0, 5)} — {String(assignment.shift_end).substring(0, 5)}
            </Text>
          </View>
          <View style={styles.infoRow}>
            <Ionicons name="construct-outline" size={16} color={Colors.textMuted} />
            <Text style={styles.infoText}>{assignment.assignment_role}</Text>
          </View>
        </View>
      ) : (
        <View style={styles.noAssignmentCard}>
          <Ionicons name="calendar-outline" size={40} color="#d1d5db" />
          <Text style={styles.noAssignmentText}>{t('attendance.noActiveAssignment')}</Text>
        </View>
      )}

      <View style={styles.statusCard}>
        <View style={styles.statusRow}>
          <View style={styles.statusItem}>
            <Text style={styles.statusLabel}>{t('attendance.checkIn')}</Text>
            <Text style={styles.statusValue}>{fmtTime(attendance?.check_in_time || null)}</Text>
          </View>
          <View style={styles.statusDivider} />
          <View style={styles.statusItem}>
            <Text style={styles.statusLabel}>{t('attendance.checkOut')}</Text>
            <Text style={styles.statusValue}>{fmtTime(attendance?.check_out_time || null)}</Text>
          </View>
        </View>

        {isCheckedOut && (
          <View style={styles.hoursRow}>
            <View style={styles.hoursItem}>
              <Text style={styles.hoursLabel}>{t('attendance.regular')}</Text>
              <Text style={styles.hoursValue}>{fmtHours(attendance?.regular_hours || null)}</Text>
            </View>
            <View style={styles.hoursItem}>
              <Text style={styles.hoursLabel}>{t('attendance.overtime')}</Text>
              <Text style={[styles.hoursValue, { color: Colors.warning }]}>{fmtHours(attendance?.overtime_hours || null)}</Text>
            </View>
          </View>
        )}

        {attendance?.is_late && (
          <View style={styles.lateBadge}>
            <Ionicons name="warning-outline" size={14} color={Colors.danger} />
            <Text style={styles.lateText}>{t('attendance.markedLate')}</Text>
          </View>
        )}
      </View>

      {!isCheckedOut && (
        <TouchableOpacity
          style={[
            styles.actionButton,
            isCheckedIn ? styles.checkoutButton : styles.checkinButton,
            (!assignment || actionLoading) && styles.disabledButton,
          ]}
          onPress={isCheckedIn ? handleCheckout : handleCheckin}
          disabled={!assignment || actionLoading}
        >
          {actionLoading ? (
            <ActivityIndicator color={Colors.white} />
          ) : (
            <>
              <Ionicons
                name={isCheckedIn ? 'log-out-outline' : 'log-in-outline'}
                size={24}
                color={Colors.white}
              />
              <Text style={styles.actionButtonText}>
                {isCheckedIn ? t('attendance.checkOut') : t('attendance.checkIn')}
              </Text>
            </>
          )}
        </TouchableOpacity>
      )}

      {isCheckedOut && (
        <View style={styles.completedBadge}>
          <Ionicons name="checkmark-circle" size={24} color={Colors.success} />
          <Text style={styles.completedText}>
            {['CONFIRMED', 'ADJUSTED'].includes(recordStatus)
              ? t('attendance.shiftConfirmed')
              : t('attendance.shiftCompleted')}
          </Text>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  content: { padding: 16, gap: 16 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  timeCard: { backgroundColor: Colors.primary, borderRadius: 16, padding: 24, alignItems: 'center' },
  timeText: { fontSize: 42, fontWeight: 'bold', color: Colors.white, letterSpacing: 2 },
  dateText: { fontSize: 14, color: 'rgba(255,255,255,0.85)', marginTop: 4 },
  projectCard: {
    backgroundColor: Colors.cardBg, borderRadius: 16, padding: 20,
    shadowColor: Colors.shadowColor, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 3,
  },
  projectHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  projectLabel: { fontSize: 13, fontWeight: '600', color: Colors.primary, textTransform: 'uppercase', letterSpacing: 1 },
  projectName: { fontSize: 18, fontWeight: 'bold', color: Colors.textPrimary, marginBottom: 4 },
  projectNumber: { fontSize: 13, color: Colors.textMuted, marginBottom: 12 },
  infoRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 },
  infoText: { fontSize: 14, color: Colors.textSecondary, flex: 1 },
  noAssignmentCard: { backgroundColor: Colors.cardBg, borderRadius: 16, padding: 40, alignItems: 'center', gap: 12 },
  noAssignmentText: { fontSize: 15, color: Colors.textLight },
  statusCard: {
    backgroundColor: Colors.cardBg, borderRadius: 16, padding: 20,
    shadowColor: Colors.shadowColor, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 3,
  },
  statusRow: { flexDirection: 'row', alignItems: 'center' },
  statusItem: { flex: 1, alignItems: 'center' },
  statusDivider: { width: 1, height: 40, backgroundColor: Colors.divider },
  statusLabel: { fontSize: 12, color: Colors.textLight, marginBottom: 4 },
  statusValue: { fontSize: 22, fontWeight: 'bold', color: Colors.textPrimary },
  hoursRow: { flexDirection: 'row', marginTop: 16, paddingTop: 16, borderTopWidth: 1, borderTopColor: Colors.background },
  hoursItem: { flex: 1, alignItems: 'center' },
  hoursLabel: { fontSize: 12, color: Colors.textLight, marginBottom: 4 },
  hoursValue: { fontSize: 18, fontWeight: '600', color: Colors.textPrimary },
  lateBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 12, backgroundColor: Colors.dangerBg, borderRadius: 8, padding: 8 },
  lateText: { fontSize: 13, color: Colors.danger, fontWeight: '500' },
  actionButton: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12,
    borderRadius: 16, padding: 18,
    shadowColor: Colors.shadowColor, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.15, shadowRadius: 8, elevation: 5,
  },
  checkinButton: { backgroundColor: Colors.success },
  checkoutButton: { backgroundColor: Colors.danger },
  disabledButton: { opacity: 0.5 },
  actionButtonText: { fontSize: 18, fontWeight: 'bold', color: Colors.white },
  completedBadge: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: Colors.successBg, borderRadius: 16, padding: 18, borderWidth: 1, borderColor: Colors.successBorder,
  },
  completedText: { fontSize: 15, fontWeight: '600', color: Colors.success, textAlign: 'center' },
});
