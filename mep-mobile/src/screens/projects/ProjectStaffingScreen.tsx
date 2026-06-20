// §149 Batch D — Project Staffing / coverage (read, mobile).
// Mirrors the web ProjectStaffingPage (read side): pick a project + date,
// see required vs assigned vs gap per trade, plus the planned requirement rows.
//   GET /api/projects                          → { projects: [{id, project_code, project_name}] }
//   GET /api/projects/:id/coverage?date=ISO     → { coverage: [{trade_code, required, assigned, gap}], totals }
//   GET /api/projects/:id/requirements          → { requirements: [{id, trade_code, required_count, start_date, end_date, note}] }
// All three are trade-scoped by the backend (a trade-level user sees only their specialty).

import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, ActivityIndicator, ScrollView, RefreshControl,
  TouchableOpacity, Modal,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { apiClient } from '../../api/client';
import Colors from '../../theme/colors';

interface Project { id: number; project_code: string; project_name: string; }
interface CoverageRow { trade_code: string; required: number; assigned: number; gap: number; }
interface Totals { required: number; assigned: number; gap: number; }
interface Requirement {
  id: number; trade_code: string; required_count: number;
  start_date: string; end_date: string; note: string | null;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
const fmtDateShort = (d: Date) => d.toISOString().split('T')[0];
const fmtDateDisplay = (d: Date) => `${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
const fmtDayShort = (iso: string) => { const d = new Date(iso); return `${MONTHS[d.getMonth()]} ${d.getDate()}`; };
const getDaysInMonth = (y: number, m: number) => new Date(y, m + 1, 0).getDate();
const getFirstDay = (y: number, m: number) => new Date(y, m, 1).getDay();

function CalendarPicker({ value, onChange }: { value: Date; onChange: (d: Date) => void }) {
  const [view, setView] = useState({ year: value.getFullYear(), month: value.getMonth() });
  const days = getDaysInMonth(view.year, view.month);
  const firstDay = getFirstDay(view.year, view.month);
  const prev = () => { const d = new Date(view.year, view.month - 1); setView({ year: d.getFullYear(), month: d.getMonth() }); };
  const next = () => { const d = new Date(view.year, view.month + 1); setView({ year: d.getFullYear(), month: d.getMonth() }); };
  return (
    <View style={cal.container}>
      <View style={cal.header}>
        <TouchableOpacity onPress={prev} style={cal.navBtn}><Ionicons name="chevron-back" size={20} color={Colors.primary} /></TouchableOpacity>
        <Text style={cal.title}>{MONTHS[view.month]} {view.year}</Text>
        <TouchableOpacity onPress={next} style={cal.navBtn}><Ionicons name="chevron-forward" size={20} color={Colors.primary} /></TouchableOpacity>
      </View>
      <View style={cal.daysRow}>{DAYS.map((d) => <Text key={d} style={cal.dayLabel}>{d}</Text>)}</View>
      <View style={cal.grid}>
        {Array(firstDay).fill(null).map((_, i) => <View key={`e${i}`} style={cal.cell} />)}
        {Array(days).fill(null).map((_, i) => {
          const date = new Date(view.year, view.month, i + 1);
          const isSelected = date.toDateString() === value.toDateString();
          return (
            <TouchableOpacity key={i} style={[cal.cell, isSelected && cal.selectedCell]} onPress={() => onChange(date)}>
              <Text style={[cal.dayNum, isSelected && cal.selectedNum]}>{i + 1}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

export default function ProjectStaffingScreen() {
  const { t } = useTranslation();
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectId, setProjectId] = useState('');
  const [date, setDate] = useState<Date>(new Date());
  const [coverage, setCoverage] = useState<CoverageRow[]>([]);
  const [totals, setTotals] = useState<Totals>({ required: 0, assigned: 0, gap: 0 });
  const [requirements, setRequirements] = useState<Requirement[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingCov, setLoadingCov] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [showCalendar, setShowCalendar] = useState(false);

  useEffect(() => {
    apiClient.get('/api/projects')
      .then((r) => {
        const p = r.data?.projects || [];
        setProjects(p);
        if (p.length > 0) setProjectId(String(p[0].id));
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const loadCoverage = useCallback((pid: string, d: Date, silent = false) => {
    if (!pid) { setCoverage([]); setRequirements([]); return; }
    if (!silent) setLoadingCov(true);
    const iso = fmtDateShort(d);
    Promise.all([
      apiClient.get(`/api/projects/${pid}/coverage?date=${iso}`),
      apiClient.get(`/api/projects/${pid}/requirements`),
    ])
      .then(([cov, reqs]) => {
        setCoverage(cov.data?.coverage || []);
        setTotals(cov.data?.totals || { required: 0, assigned: 0, gap: 0 });
        setRequirements(reqs.data?.requirements || []);
      })
      .catch(() => { setCoverage([]); setRequirements([]); })
      .finally(() => { setLoadingCov(false); setRefreshing(false); });
  }, []);

  useEffect(() => { loadCoverage(projectId, date); }, [projectId, date, loadCoverage]);

  if (loading) return <View style={s.center}><ActivityIndicator size="large" color={Colors.primary} /></View>;

  return (
    <View style={s.wrapper}>
      <ScrollView
        style={s.container} contentContainerStyle={s.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadCoverage(projectId, date, true); }} tintColor={Colors.primary} />}
      >
        {projects.length === 0 ? (
          <View style={s.emptyCard}>
            <Ionicons name="folder-open-outline" size={40} color={Colors.textLight} />
            <Text style={s.emptyText}>{t('submitRequest.noProjects')}</Text>
          </View>
        ) : (
          <>
            {/* Project picker */}
            <Text style={s.label}>{t('attendance.project')}</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 4 }}>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                {projects.map((p) => (
                  <TouchableOpacity key={p.id} style={[s.chip, projectId === String(p.id) && s.chipSel]} onPress={() => setProjectId(String(p.id))}>
                    <Text style={[s.chipText, projectId === String(p.id) && s.chipTextSel]}>{p.project_name}</Text>
                    <Text style={[s.chipSub, projectId === String(p.id) && { color: Colors.primaryBright }]}>{p.project_code}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>

            {/* Date */}
            <Text style={s.label}>{t('submitRequest.date')}</Text>
            <TouchableOpacity style={s.dateButton} onPress={() => setShowCalendar(true)}>
              <Ionicons name="calendar-outline" size={16} color={Colors.primary} />
              <Text style={s.dateButtonText}>{fmtDateDisplay(date)}</Text>
            </TouchableOpacity>

            {/* Coverage */}
            <Text style={[s.label, { marginTop: 18 }]}>{t('projectStaffing.coverage')}</Text>
            {loadingCov ? (
              <ActivityIndicator color={Colors.primary} style={{ marginTop: 16 }} />
            ) : coverage.length === 0 ? (
              <View style={s.emptyCard}><Text style={s.emptyText}>{t('projectStaffing.noRequirements')}</Text></View>
            ) : (
              <View style={s.tableCard}>
                <View style={[s.row, s.headRow]}>
                  <Text style={[s.cell, s.tradeCell, s.headText]}>{t('projectStaffing.trade')}</Text>
                  <Text style={[s.cell, s.headText]}>{t('projectStaffing.required')}</Text>
                  <Text style={[s.cell, s.headText]}>{t('projectStaffing.assigned')}</Text>
                  <Text style={[s.cell, s.headText]}>{t('projectStaffing.gap')}</Text>
                </View>
                {coverage.map((c, i) => {
                  const short = c.gap > 0;
                  return (
                    <View key={c.trade_code} style={[s.row, i > 0 && s.rowBorder]}>
                      <Text style={[s.cell, s.tradeCell, s.tradeText]}>{c.trade_code}</Text>
                      <Text style={s.cell}>{c.required}</Text>
                      <Text style={s.cell}>{c.assigned}</Text>
                      <Text style={[s.cell, s.gapText, short ? s.gapShort : s.gapOk]}>
                        {short ? `-${c.gap}` : '✓'}
                      </Text>
                    </View>
                  );
                })}
                {/* Totals */}
                <View style={[s.row, s.totalRow]}>
                  <Text style={[s.cell, s.tradeCell, s.totalText]}>{t('projectStaffing.total')}</Text>
                  <Text style={[s.cell, s.totalText]}>{totals.required}</Text>
                  <Text style={[s.cell, s.totalText]}>{totals.assigned}</Text>
                  <Text style={[s.cell, s.totalText, totals.gap > 0 ? s.gapShort : s.gapOk]}>
                    {totals.gap > 0 ? `-${totals.gap}` : '✓'}
                  </Text>
                </View>
              </View>
            )}
            {!loadingCov && coverage.length > 0 && totals.gap === 0 && (
              <View style={s.coveredBanner}>
                <Ionicons name="checkmark-circle" size={16} color={Colors.success} />
                <Text style={s.coveredText}>{t('projectStaffing.fullyCovered')}</Text>
              </View>
            )}

            {/* Planned requirement phases */}
            {requirements.length > 0 && (
              <>
                <Text style={[s.label, { marginTop: 18 }]}>{t('projectStaffing.phases')}</Text>
                {requirements.map((r) => (
                  <View key={r.id} style={s.phaseCard}>
                    <View style={s.phaseHeader}>
                      <Text style={s.phaseTrade}>{r.trade_code}</Text>
                      <View style={s.phaseBadge}><Text style={s.phaseBadgeText}>×{r.required_count}</Text></View>
                    </View>
                    <View style={s.metaRow}>
                      <Ionicons name="calendar-outline" size={13} color={Colors.textLight} />
                      <Text style={s.meta}>{fmtDayShort(r.start_date)} → {fmtDayShort(r.end_date)}</Text>
                    </View>
                    {!!r.note && <Text style={s.phaseNote}>{r.note}</Text>}
                  </View>
                ))}
              </>
            )}
          </>
        )}
      </ScrollView>

      {/* Calendar modal */}
      <Modal visible={showCalendar} transparent animationType="fade">
        <View style={s.calOverlay}>
          <View style={s.calCard}>
            <Text style={s.calTitle}>{t('submitRequest.date')}</Text>
            <CalendarPicker value={date} onChange={(d) => setDate(d)} />
            <TouchableOpacity style={s.calDone} onPress={() => setShowCalendar(false)}>
              <Text style={s.calDoneText}>{t('common.done')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
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
  dayNum: { fontSize: 14, color: Colors.textPrimary },
  selectedNum: { color: Colors.white, fontWeight: '700' },
});

const s = StyleSheet.create({
  wrapper: { flex: 1, backgroundColor: Colors.background },
  container: { flex: 1 },
  content: { padding: 16, paddingBottom: 40 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: Colors.background },
  emptyCard: { backgroundColor: Colors.white, borderRadius: 16, padding: 32, alignItems: 'center', gap: 12, marginTop: 8 },
  emptyText: { fontSize: 14, color: Colors.textLight, textAlign: 'center' },
  label: { fontSize: 13, fontWeight: '600', color: Colors.textSecondary, marginBottom: 6, marginTop: 12 },
  chip: { backgroundColor: Colors.white, borderRadius: 12, borderWidth: 1, borderColor: Colors.divider, paddingHorizontal: 14, paddingVertical: 10, alignItems: 'center', minWidth: 100 },
  chipSel: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  chipText: { fontSize: 13, fontWeight: '600', color: Colors.textSecondary },
  chipTextSel: { color: Colors.white },
  chipSub: { fontSize: 11, color: Colors.textLight, marginTop: 2 },
  dateButton: { flexDirection: 'row', alignItems: 'center', gap: 8, height: 44, borderWidth: 1, borderColor: Colors.divider, borderRadius: 10, paddingHorizontal: 12, backgroundColor: Colors.inputBg },
  dateButtonText: { fontSize: 13, color: Colors.textPrimary, fontWeight: '500', flex: 1 },

  tableCard: { backgroundColor: Colors.white, borderRadius: 14, overflow: 'hidden', shadowColor: Colors.shadowColor, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 6, elevation: 2 },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 12 },
  headRow: { backgroundColor: Colors.primaryPale },
  rowBorder: { borderTopWidth: 1, borderTopColor: Colors.background },
  cell: { flex: 1, fontSize: 14, color: Colors.textPrimary, textAlign: 'center' },
  tradeCell: { flex: 1.6, textAlign: 'left' },
  headText: { fontSize: 11, fontWeight: '700', color: Colors.primary, textTransform: 'uppercase' },
  tradeText: { fontWeight: '600' },
  gapText: { fontWeight: '700' },
  gapShort: { color: Colors.danger },
  gapOk: { color: Colors.success },
  totalRow: { backgroundColor: Colors.background, borderTopWidth: 1, borderTopColor: Colors.divider },
  totalText: { fontWeight: '700', color: Colors.textPrimary },
  coveredBanner: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10, backgroundColor: Colors.successBg, borderRadius: 10, padding: 10 },
  coveredText: { fontSize: 13, color: Colors.success, fontWeight: '600' },

  phaseCard: { backgroundColor: Colors.white, borderRadius: 12, padding: 12, borderWidth: 1, borderColor: Colors.divider, marginTop: 8 },
  phaseHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  phaseTrade: { fontSize: 14, fontWeight: '700', color: Colors.textPrimary },
  phaseBadge: { backgroundColor: Colors.primaryPale, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2 },
  phaseBadgeText: { fontSize: 12, fontWeight: '700', color: Colors.primary },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6 },
  meta: { fontSize: 13, color: Colors.textSecondary },
  phaseNote: { fontSize: 12, color: Colors.textLight, marginTop: 6, fontStyle: 'italic' },

  calOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 24 },
  calCard: { backgroundColor: Colors.white, borderRadius: 20, padding: 20, width: '100%' },
  calTitle: { fontSize: 16, fontWeight: '700', color: Colors.primary, marginBottom: 12, textAlign: 'center' },
  calDone: { backgroundColor: Colors.primary, borderRadius: 10, padding: 12, alignItems: 'center', marginTop: 12 },
  calDoneText: { color: Colors.white, fontWeight: '700', fontSize: 14 },
});
