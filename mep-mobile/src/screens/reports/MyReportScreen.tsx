import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  Modal,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRoute } from '@react-navigation/native';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { apiClient } from '../../api/client';
import { useAuthStore } from '../../store/useAuthStore';
import Colors from '../../theme/colors';

interface ReportRecord {
  attendance_date: string;
  project_name: string;
  project_code: string;
  check_in_time: string | null;
  check_out_time: string | null;
  regular_hours: number;
  overtime_hours: number;
  late_minutes: number;
  status: string;
  distance_km: number;
  daily_allowance: number;
  zone_label: string;
  needs_t2200: boolean;
  needs_allowance: boolean;
}

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const DAYS = ['Su','Mo','Tu','We','Th','Fr','Sa'];

function fmtTime(t: string | null): string {
  if (!t) return '--:--';
  return String(t).substring(0, 5);
}

function fmtHours(h: number): string {
  if (!h) return '0h 0m';
  const hrs = Math.floor(h);
  const mins = Math.round((h - hrs) * 60);
  return `${hrs}h ${mins}m`;
}

function fmtDate(d: string): string {
  const date = new Date(d + 'T00:00:00');
  return date.toLocaleDateString('en-CA', { weekday: 'short', month: 'short', day: 'numeric' });
}

function fmtDateShort(d: Date): string {
  return d.toISOString().split('T')[0];
}

function fmtDateDisplay(d: Date): string {
  return `${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

function getStatusColor(status: string): string {
  switch (status) {
    case 'CONFIRMED': return Colors.success;
    case 'ADJUSTED': return '#7c3aed';
    case 'CHECKED_OUT': return '#2563eb';
    case 'CHECKED_IN': return '#d97706';
    default: return Colors.textMuted;
  }
}

function getWeekRange(offset: number = 0) {
  const now = new Date();
  const day = now.getDay() || 7;
  const monday = new Date(now);
  monday.setDate(now.getDate() - day + 1 + offset * 7);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  return { from: monday, to: sunday };
}

function getDaysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate();
}

function getFirstDayOfMonth(year: number, month: number) {
  return new Date(year, month, 1).getDay();
}

function CalendarPicker({ value, onChange, maxDate }: {
  value: Date;
  onChange: (d: Date) => void;
  maxDate: Date;
}) {
  const [viewYear, setViewYear] = useState(value.getFullYear());
  const [viewMonth, setViewMonth] = useState(value.getMonth());

  const daysInMonth = getDaysInMonth(viewYear, viewMonth);
  const firstDay = getFirstDayOfMonth(viewYear, viewMonth);

  const prevMonth = () => {
    if (viewMonth === 0) { setViewMonth(11); setViewYear(y => y - 1); }
    else setViewMonth(m => m - 1);
  };
  const nextMonth = () => {
    const next = new Date(viewYear, viewMonth + 1, 1);
    if (next <= maxDate) {
      if (viewMonth === 11) { setViewMonth(0); setViewYear(y => y + 1); }
      else setViewMonth(m => m + 1);
    }
  };

  const cells = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  return (
    <View style={cal.container}>
      <View style={cal.header}>
        <TouchableOpacity onPress={prevMonth} style={cal.navBtn}>
          <Ionicons name="chevron-back" size={20} color={Colors.primary} />
        </TouchableOpacity>
        <Text style={cal.title}>{MONTHS[viewMonth]} {viewYear}</Text>
        <TouchableOpacity onPress={nextMonth} style={cal.navBtn}>
          <Ionicons name="chevron-forward" size={20} color={Colors.primary} />
        </TouchableOpacity>
      </View>
      <View style={cal.daysRow}>
        {DAYS.map(d => <Text key={d} style={cal.dayLabel}>{d}</Text>)}
      </View>
      <View style={cal.grid}>
        {cells.map((day, i) => {
          if (!day) return <View key={`e-${i}`} style={cal.cell} />;
          const thisDate = new Date(viewYear, viewMonth, day);
          const isSelected = fmtDateShort(thisDate) === fmtDateShort(value);
          const isDisabled = thisDate > maxDate;
          return (
            <TouchableOpacity
              key={day}
              style={[cal.cell, isSelected && cal.selectedCell, isDisabled && cal.disabledCell]}
              onPress={() => !isDisabled && onChange(thisDate)}
              disabled={isDisabled}
            >
              <Text style={[cal.dayNum, isSelected && cal.selectedNum, isDisabled && cal.disabledNum]}>
                {day}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

const QUICK_RANGES = [
  { label: 'This Week', type: 'week', offset: 0 },
  { label: 'Last Week', type: 'week', offset: -1 },
  { label: 'Custom', type: 'custom', offset: 0 },
];

function generatePdfHtml(records: ReportRecord[], from: string, to: string, employeeName: string): string {
  const totalRegular = records.reduce((s, r) => s + Number(r.regular_hours || 0), 0);
  const totalOvertime = records.reduce((s, r) => s + Number(r.overtime_hours || 0), 0);
  const totalAllowance = records.reduce((s, r) => s + Number(r.daily_allowance || 0), 0);
  const totalDays = records.length;
  const rows = records.map(r => `
    <tr>
      <td>${fmtDate(r.attendance_date)}</td><td>${r.project_name}</td>
      <td>${fmtTime(r.check_in_time)}</td><td>${fmtTime(r.check_out_time)}</td>
      <td>${fmtHours(r.regular_hours)}</td>
      <td>${Number(r.overtime_hours) > 0 ? fmtHours(r.overtime_hours) : 'â€"'}</td>
      <td>${Number(r.distance_km) >= 41 ? `${r.distance_km} km` : 'â€"'}</td>
      <td>${Number(r.daily_allowance) > 0 ? `$${Number(r.daily_allowance).toFixed(2)}` : r.needs_t2200 ? 'T2200' : 'â€"'}</td>
      <td style="color:${getStatusColor(r.status)};font-weight:600">${r.status}</td>
    </tr>`).join('');
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
    body{font-family:Arial,sans-serif;margin:30px;color:#111}
    .header{display:flex;justify-content:space-between;margin-bottom:24px;border-bottom:2px solid #1e3a5f;padding-bottom:16px}
    .brand{font-size:24px;font-weight:bold;color:#1e3a5f;letter-spacing:2px}
    .summary{display:flex;gap:16px;margin-bottom:24px}
    .summary-item{flex:1;background:#f3f4f6;border-radius:8px;padding:12px;text-align:center}
    .summary-label{font-size:11px;color:#9ca3af;text-transform:uppercase}
    .summary-value{font-size:18px;font-weight:bold}
    table{width:100%;border-collapse:collapse;font-size:12px}
    th{background:#1e3a5f;color:white;padding:10px 8px;text-align:left;font-size:11px}
    td{padding:8px;border-bottom:1px solid #e5e7eb}
    tr:nth-child(even){background:#f9fafb}
    .footer{margin-top:24px;text-align:center;font-size:11px;color:#9ca3af}
  </style></head><body>
  <div class="header"><div><div class="brand">CONSTRAI</div><div style="font-size:14px;color:#6b7280">MEP Platform â€" Attendance Report</div></div>
  <div style="text-align:right;font-size:13px"><div><strong>${employeeName}</strong></div><div>Period: ${from} to ${to}</div><div>Generated: ${new Date().toLocaleDateString('en-CA')}</div></div></div>
  <div class="summary">
    <div class="summary-item"><div class="summary-label">Days Worked</div><div class="summary-value">${totalDays}</div></div>
    <div class="summary-item"><div class="summary-label">Regular Hours</div><div class="summary-value">${fmtHours(totalRegular)}</div></div>
    <div class="summary-item"><div class="summary-label">Overtime</div><div class="summary-value">${fmtHours(totalOvertime)}</div></div>
    <div class="summary-item"><div class="summary-label">Travel Allowance</div><div class="summary-value">$${totalAllowance.toFixed(2)}</div></div>
  </div>
  <table><thead><tr><th>Date</th><th>Project</th><th>In</th><th>Out</th><th>Regular</th><th>OT</th><th>Distance</th><th>Allowance</th><th>Status</th></tr></thead>
  <tbody>${rows}</tbody></table>
  <div class="footer">CONSTRAI MEP Platform â€" Confidential</div>
  </body></html>`;
}

export default function MyReportScreen() {
  const { user } = useAuthStore();
  const route = useRoute<any>();
  const period = route.params?.period || 'this_week';
  const [records, setRecords] = useState<ReportRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [pdfLoading, setPdfLoading] = useState(false);
  const initialIndex = period === 'last_week' ? 1 : period === 'custom' ? 2 : 0;
  const [rangeIndex, setRangeIndex] = useState(initialIndex);
  const [customFrom, setCustomFrom] = useState<Date>(new Date());
  const [customTo, setCustomTo] = useState<Date>(new Date());
  const [showFromCal, setShowFromCal] = useState(false);
  const [showToCal, setShowToCal] = useState(false);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  const computeRange = useCallback(() => {
    const r = QUICK_RANGES[rangeIndex];
    if (r.type === 'custom') return { from: fmtDateShort(customFrom), to: fmtDateShort(customTo) };
    const range = getWeekRange(r.offset);
    return { from: fmtDateShort(range.from), to: fmtDateShort(range.to) };
  }, [rangeIndex, customFrom, customTo]);

  const fetchReport = useCallback(async () => {
    const range = computeRange();
    if (!range.from || !range.to) { setLoading(false); setRefreshing(false); return; }
    setFrom(range.from); setTo(range.to);
    try {
      const res = await apiClient.get(`/api/reports/my-daily?from=${range.from}&to=${range.to}`);
      setRecords(res.data?.records || []);
    } catch { setRecords([]); }
    finally { setLoading(false); setRefreshing(false); }
  }, [computeRange]);

  useEffect(() => { setLoading(true); fetchReport(); }, [rangeIndex]);

  const onRefresh = () => { setRefreshing(true); fetchReport(); };

  const handleExportPdf = async () => {
    if (!records.length) { Alert.alert('No Data', 'No records to export.'); return; }
    setPdfLoading(true);
    try {
      const html = generatePdfHtml(records, from, to, user?.name || 'Employee');
      const { uri } = await Print.printToFileAsync({ html, base64: false });
      setPdfLoading(false);
      await Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: 'Attendance Report', UTI: 'com.adobe.pdf' });
    } catch { setPdfLoading(false); Alert.alert('Error', 'Could not generate PDF.'); }
  };

  const totalRegular = records.reduce((s, r) => s + Number(r.regular_hours || 0), 0);
  const totalOvertime = records.reduce((s, r) => s + Number(r.overtime_hours || 0), 0);
  const totalAllowance = records.reduce((s, r) => s + Number(r.daily_allowance || 0), 0);

  if (loading) return <View style={styles.center}><ActivityIndicator size="large" color={Colors.primary} /></View>;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}>

      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View style={styles.rangeRow}>
          {QUICK_RANGES.map((r, i) => (
            <TouchableOpacity key={i} style={[styles.rangeButton, rangeIndex === i && styles.rangeButtonActive]} onPress={() => setRangeIndex(i)}>
              <Text style={[styles.rangeText, rangeIndex === i && styles.rangeTextActive]}>{r.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>

      {rangeIndex === 2 && (
        <View style={styles.customCard}>
          <View style={styles.customRow}>
            <View style={styles.customField}>
              <Text style={styles.customLabel}>From</Text>
              <TouchableOpacity style={styles.dateButton} onPress={() => setShowFromCal(true)}>
                <Ionicons name="calendar-outline" size={16} color={Colors.primary} />
                <Text style={styles.dateButtonText}>{fmtDateDisplay(customFrom)}</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.customField}>
              <Text style={styles.customLabel}>To</Text>
              <TouchableOpacity style={styles.dateButton} onPress={() => setShowToCal(true)}>
                <Ionicons name="calendar-outline" size={16} color={Colors.primary} />
                <Text style={styles.dateButtonText}>{fmtDateDisplay(customTo)}</Text>
              </TouchableOpacity>
            </View>
          </View>
          <TouchableOpacity style={styles.applyButton} onPress={fetchReport}>
            <Text style={styles.applyText}>Apply</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* From Calendar Modal */}
      <Modal visible={showFromCal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Select From Date</Text>
            <CalendarPicker value={customFrom} onChange={d => setCustomFrom(d)} maxDate={new Date()} />
            <TouchableOpacity style={styles.modalDone} onPress={() => setShowFromCal(false)}>
              <Text style={styles.modalDoneText}>Done</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* To Calendar Modal */}
      <Modal visible={showToCal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Select To Date</Text>
            <CalendarPicker value={customTo} onChange={d => setCustomTo(d)} maxDate={new Date()} />
            <TouchableOpacity style={styles.modalDone} onPress={() => setShowToCal(false)}>
              <Text style={styles.modalDoneText}>Done</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <View style={styles.summaryRow}>
        <View style={styles.summaryItem}><Text style={styles.summaryLabel}>Days</Text><Text style={styles.summaryValue}>{records.length}</Text></View>
        <View style={styles.summaryDivider} />
        <View style={styles.summaryItem}><Text style={styles.summaryLabel}>Regular</Text><Text style={styles.summaryValue}>{fmtHours(totalRegular)}</Text></View>
        <View style={styles.summaryDivider} />
        <View style={styles.summaryItem}><Text style={styles.summaryLabel}>OT</Text><Text style={[styles.summaryValue, { color: Colors.warning }]}>{fmtHours(totalOvertime)}</Text></View>
        <View style={styles.summaryDivider} />
        <View style={styles.summaryItem}><Text style={styles.summaryLabel}>Allowance</Text><Text style={[styles.summaryValue, { color: Colors.success, fontSize: 14 }]}>${totalAllowance.toFixed(2)}</Text></View>
      </View>

      {records.length > 0 && (
        <TouchableOpacity style={[styles.pdfButton, pdfLoading && styles.disabledButton]} onPress={handleExportPdf} disabled={pdfLoading}>
          {pdfLoading ? <ActivityIndicator color="#ffffff" size="small" /> : (
            <><Ionicons name="document-text-outline" size={18} color="#ffffff" /><Text style={styles.pdfText}>Export PDF / Print</Text></>
          )}
        </TouchableOpacity>
      )}

      {records.length === 0 ? (
        <View style={styles.emptyCard}>
          <Ionicons name="document-outline" size={40} color="#d1d5db" />
          <Text style={styles.emptyText}>No records for this period</Text>
        </View>
      ) : (
        records.map((r, i) => (
          <View key={i} style={styles.recordCard}>
            <View style={styles.recordHeader}>
              <View>
                <Text style={styles.recordDate}>{fmtDate(r.attendance_date)}</Text>
                <Text style={styles.recordProject}>{r.project_name}</Text>
              </View>
              <View style={[styles.statusBadge, { backgroundColor: getStatusColor(r.status) + '20' }]}>
                <Text style={[styles.statusText, { color: getStatusColor(r.status) }]}>{r.status}</Text>
              </View>
            </View>
            <View style={styles.recordRow}>
              <View style={styles.recordItem}><Ionicons name="log-in-outline" size={14} color="#6b7280" /><Text style={styles.recordLabel}>In</Text><Text style={styles.recordVal}>{fmtTime(r.check_in_time)}</Text></View>
              <View style={styles.recordItem}><Ionicons name="log-out-outline" size={14} color="#6b7280" /><Text style={styles.recordLabel}>Out</Text><Text style={styles.recordVal}>{fmtTime(r.check_out_time)}</Text></View>
              <View style={styles.recordItem}><Ionicons name="time-outline" size={14} color="#6b7280" /><Text style={styles.recordLabel}>Reg</Text><Text style={styles.recordVal}>{fmtHours(r.regular_hours)}</Text></View>
              {Number(r.overtime_hours) > 0 && (
                <View style={styles.recordItem}><Ionicons name="flash-outline" size={14} color={Colors.warning} /><Text style={styles.recordLabel}>OT</Text><Text style={[styles.recordVal, { color: Colors.warning }]}>{fmtHours(r.overtime_hours)}</Text></View>
              )}
            </View>
            {r.late_minutes > 0 && (
              <View style={styles.lateRow}><Ionicons name="warning-outline" size={13} color={Colors.danger} /><Text style={styles.lateText}>Late by {r.late_minutes} min</Text></View>
            )}
            {Number(r.distance_km) >= 41 && (
              <View style={styles.travelRow}>
                <Ionicons name="car-outline" size={14} color={Colors.primary} />
                <Text style={styles.travelText}>{r.distance_km} km{r.needs_t2200 ? ' — T2200 / TP-64.3' : ''}{r.needs_allowance && r.daily_allowance > 0 ? ` — $${Number(r.daily_allowance).toFixed(2)}` : ''}</Text>
              </View>
            )}
          </View>
        ))
      )}
    </ScrollView>
  );
}

const cal = StyleSheet.create({
  container: { paddingVertical: 8 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  navBtn: { padding: 8 },
  title: { fontSize: 16, fontWeight: '700', color: Colors.primary },
  daysRow: { flexDirection: 'row', marginBottom: 4 },
  dayLabel: { width: '14.28%', textAlign: 'center', fontSize: 11, color: Colors.textLight, fontWeight: '600' },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: { width: '14.28%', aspectRatio: 1, alignItems: 'center', justifyContent: 'center' },
  selectedCell: { backgroundColor: Colors.primary, borderRadius: 20 },
  disabledCell: { opacity: 0.3 },
  dayNum: { fontSize: 14, color: Colors.textPrimary },
  selectedNum: { color: Colors.white, fontWeight: '700' },
  disabledNum: { color: Colors.textLight },
});

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  content: { padding: 16, gap: 16, paddingBottom: 40 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  rangeRow: { flexDirection: 'row', gap: 8 },
  rangeButton: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, backgroundColor: Colors.cardBg, borderWidth: 1, borderColor: Colors.divider },
  rangeButtonActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  rangeText: { fontSize: 13, color: Colors.textMuted, fontWeight: '500' },
  rangeTextActive: { color: Colors.white, fontWeight: '700' },
  customCard: { backgroundColor: Colors.cardBg, borderRadius: 16, padding: 16, shadowColor: Colors.shadowColor, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 3 },
  customRow: { flexDirection: 'row', gap: 12, marginBottom: 12 },
  customField: { flex: 1 },
  customLabel: { fontSize: 12, fontWeight: '600', color: Colors.textSecondary, marginBottom: 6 },
  dateButton: { flexDirection: 'row', alignItems: 'center', gap: 8, height: 44, borderWidth: 1, borderColor: Colors.divider, borderRadius: 10, paddingHorizontal: 12, backgroundColor: Colors.inputBg },
  dateButtonText: { fontSize: 12, color: Colors.textPrimary, fontWeight: '500', flex: 1 },
  applyButton: { backgroundColor: Colors.primary, borderRadius: 10, padding: 12, alignItems: 'center' },
  applyText: { color: Colors.white, fontWeight: '700', fontSize: 14 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 24 },
  modalCard: { backgroundColor: Colors.cardBg, borderRadius: 20, padding: 20, width: '100%' },
  modalTitle: { fontSize: 16, fontWeight: '700', color: Colors.primary, marginBottom: 12, textAlign: 'center' },
  modalDone: { backgroundColor: Colors.primary, borderRadius: 10, padding: 12, alignItems: 'center', marginTop: 12 },
  modalDoneText: { color: Colors.white, fontWeight: '700', fontSize: 14 },
  summaryRow: { flexDirection: 'row', backgroundColor: Colors.cardBg, borderRadius: 16, padding: 16, shadowColor: Colors.shadowColor, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 3 },
  summaryItem: { flex: 1, alignItems: 'center' },
  summaryDivider: { width: 1, backgroundColor: Colors.divider },
  summaryLabel: { fontSize: 11, color: Colors.textLight, marginBottom: 4 },
  summaryValue: { fontSize: 16, fontWeight: 'bold', color: Colors.textPrimary },
  pdfButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: Colors.primary, borderRadius: 12, padding: 14 },
  disabledButton: { opacity: 0.5 },
  pdfText: { fontSize: 15, fontWeight: '600', color: Colors.white },
  emptyCard: { backgroundColor: Colors.cardBg, borderRadius: 16, padding: 40, alignItems: 'center', gap: 12 },
  emptyText: { fontSize: 15, color: Colors.textLight },
  recordCard: { backgroundColor: Colors.cardBg, borderRadius: 16, padding: 16, shadowColor: Colors.shadowColor, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 3 },
  recordHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 },
  recordDate: { fontSize: 15, fontWeight: 'bold', color: Colors.textPrimary },
  recordProject: { fontSize: 13, color: Colors.textMuted, marginTop: 2 },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  statusText: { fontSize: 11, fontWeight: '700' },
  recordRow: { flexDirection: 'row', gap: 12 },
  recordItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  recordLabel: { fontSize: 12, color: Colors.textLight },
  recordVal: { fontSize: 13, fontWeight: '600', color: Colors.textPrimary },
  lateRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 8 },
  lateText: { fontSize: 12, color: Colors.danger },
  travelRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8, backgroundColor: Colors.primaryPale, borderRadius: 8, padding: 8 },
  travelText: { fontSize: 13, color: Colors.primary, fontWeight: '500' },
});
