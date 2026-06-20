// §147 / §149 Phase 1 — Foreman "Submit Request" (mobile).
// The foreman picks a project + a date + the team he needs; one PENDING
// assignment_request is created per worker. The available-workers list is
// trade-scoped by the backend (a foreman only sees his own trade).
//
// Backend contract (mirrors web ForemanRequestPage):
//   GET  /api/hub/my-projects              → { projects: [{id, project_code, project_name}] }
//   GET  /api/assignments/available?date=  → { workers:  [{id, first_name, last_name, trade_name}] }
//   POST /api/assignments/requests         → one PENDING row per worker

import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, ActivityIndicator, ScrollView,
  TouchableOpacity, Modal, TextInput, Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { apiClient } from '../../api/client';
import Colors from '../../theme/colors';

interface Worker { id: number; first_name: string; last_name: string; trade_name?: string; }
interface Project { id: number; project_code: string; project_name: string; }

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
const fmtDateShort = (d: Date) => d.toISOString().split('T')[0];
const fmtDateDisplay = (d: Date) => `${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
const getDaysInMonth = (y: number, m: number) => new Date(y, m + 1, 0).getDate();
const getFirstDay = (y: number, m: number) => new Date(y, m, 1).getDay();
function tomorrow() { const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(0, 0, 0, 0); return d; }
function today0() { const d = new Date(); d.setHours(0, 0, 0, 0); return d; }

function CalendarPicker({ value, onChange, minDate }: { value: Date; onChange: (d: Date) => void; minDate?: Date }) {
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
          const isDisabled = minDate ? date < minDate : false;
          return (
            <TouchableOpacity key={i} style={[cal.cell, isSelected && cal.selectedCell, isDisabled && cal.disabledCell]}
              onPress={() => !isDisabled && onChange(date)} disabled={isDisabled}>
              <Text style={[cal.dayNum, isSelected && cal.selectedNum, isDisabled && cal.disabledNum]}>{i + 1}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

export default function SubmitRequestScreen() {
  const { t } = useTranslation();
  const [projects, setProjects] = useState<Project[]>([]);
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [projectId, setProjectId] = useState('');
  const [date, setDate] = useState<Date>(tomorrow());
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingWorkers, setLoadingWorkers] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [showCalendar, setShowCalendar] = useState(false);
  const [showWorkerModal, setShowWorkerModal] = useState(false);
  const [search, setSearch] = useState('');

  useEffect(() => {
    apiClient.get('/api/hub/my-projects')
      .then((r) => {
        const p = r.data?.projects || [];
        setProjects(p);
        if (p.length > 0) setProjectId(String(p[0].id));
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  // Available workers depend on the date (and are trade-scoped by the backend).
  const loadWorkers = useCallback((d: Date) => {
    setLoadingWorkers(true);
    setSelectedIds([]); // the available list changes with the date — drop stale picks
    apiClient.get(`/api/assignments/available?date=${fmtDateShort(d)}`)
      .then((r) => setWorkers(r.data?.workers || []))
      .catch(() => setWorkers([]))
      .finally(() => setLoadingWorkers(false));
  }, []);

  useEffect(() => { loadWorkers(date); }, [date, loadWorkers]);

  const filtered = search.trim()
    ? workers.filter((w) => `${w.first_name} ${w.last_name} ${w.trade_name || ''}`.toLowerCase().includes(search.toLowerCase()))
    : workers;
  const toggle = (id: number) =>
    setSelectedIds((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  const selectAll = () => setSelectedIds(filtered.map((w) => w.id));
  const clearAll = () => setSelectedIds([]);
  const selected = workers.filter((w) => selectedIds.includes(w.id));
  const canSubmit = !!projectId && selectedIds.length > 0 && !submitting;

  const submit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    const iso = fmtDateShort(date);
    const outcomes = await Promise.allSettled(
      selectedIds.map((id) =>
        apiClient.post('/api/assignments/requests', {
          project_id: Number(projectId),
          employee_id: id,
          start_date: iso,
          end_date: iso,
          shift_start: '06:00',
          shift_end: '14:30',
          assignment_role: 'WORKER',
        })
      )
    );
    const created = outcomes.filter((o) => o.status === 'fulfilled').length;
    const skipped = outcomes.length - created;
    setSubmitting(false);
    if (created > 0) { setSelectedIds([]); loadWorkers(date); }
    Alert.alert(
      t('submitRequest.doneTitle'),
      t('submitRequest.doneBody', { created, skipped }),
    );
  };

  if (loading) return <View style={s.center}><ActivityIndicator size="large" color={Colors.primary} /></View>;

  return (
    <View style={s.wrapper}>
      <ScrollView style={s.container} contentContainerStyle={s.content}>
        <View style={s.formCard}>
          <Text style={s.formTitle}>{t('submitRequest.title')}</Text>
          <Text style={s.intro}>{t('submitRequest.intro')}</Text>

          {/* Project */}
          <Text style={s.label}>{t('attendance.project')}</Text>
          {projects.length === 0 ? (
            <Text style={s.muted}>{t('submitRequest.noProjects')}</Text>
          ) : (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 4 }}>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                {projects.map((p) => (
                  <TouchableOpacity key={p.id} style={[s.chip, projectId === String(p.id) && s.chipSel]}
                    onPress={() => setProjectId(String(p.id))}>
                    <Text style={[s.chipText, projectId === String(p.id) && s.chipTextSel]}>{p.project_name}</Text>
                    <Text style={[s.chipSub, projectId === String(p.id) && { color: Colors.primaryBright }]}>{p.project_code}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>
          )}

          {/* Date */}
          <Text style={s.label}>{t('submitRequest.date')}</Text>
          <TouchableOpacity style={s.dateButton} onPress={() => setShowCalendar(true)}>
            <Ionicons name="calendar-outline" size={16} color={Colors.primary} />
            <Text style={s.dateButtonText}>{fmtDateDisplay(date)}</Text>
          </TouchableOpacity>

          {/* Team */}
          <View style={s.workerHeader}>
            <Text style={s.label}>{t('submitRequest.team')} {selectedIds.length > 0 ? `(${selectedIds.length})` : ''}</Text>
            {selectedIds.length > 0 && (
              <TouchableOpacity onPress={clearAll} style={s.selectBtn}><Text style={s.selectBtnText}>{t('materials.clear')}</Text></TouchableOpacity>
            )}
          </View>
          {selected.length > 0 && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 8 }}>
              <View style={{ flexDirection: 'row', gap: 6 }}>
                {selected.map((w) => (
                  <TouchableOpacity key={w.id} style={s.selectedChip} onPress={() => toggle(w.id)}>
                    <Text style={s.selectedChipText}>{w.first_name} {w.last_name}</Text>
                    <Ionicons name="close-circle" size={14} color={Colors.white} />
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>
          )}
          <TouchableOpacity style={s.workerPickerBtn} onPress={() => { setSearch(''); setShowWorkerModal(true); }}>
            <Ionicons name="people-outline" size={18} color={Colors.primary} />
            <Text style={[s.workerPickerText, selectedIds.length === 0 && { color: Colors.textLight }]}>
              {loadingWorkers
                ? t('submitRequest.loadingWorkers')
                : selectedIds.length === 0
                  ? t('submitRequest.selectTeam')
                  : t('submitRequest.tapToEdit', { count: selectedIds.length })}
            </Text>
            <Ionicons name="chevron-forward" size={16} color="#9ca3af" />
          </TouchableOpacity>

          {/* Submit */}
          <TouchableOpacity style={[s.sendBtn, !canSubmit && { opacity: 0.5 }]} onPress={submit} disabled={!canSubmit}>
            {submitting ? <ActivityIndicator color={Colors.white} size="small" /> : <>
              <Ionicons name="send" size={16} color={Colors.white} />
              <Text style={s.sendBtnText}>{t('submitRequest.submit', { count: selectedIds.length })}</Text>
            </>}
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* Calendar Modal */}
      <Modal visible={showCalendar} transparent animationType="fade">
        <View style={s.calOverlay}>
          <View style={s.calCard}>
            <Text style={s.calTitle}>{t('submitRequest.date')}</Text>
            <CalendarPicker value={date} onChange={(d) => setDate(d)} minDate={today0()} />
            <TouchableOpacity style={s.calDone} onPress={() => setShowCalendar(false)}>
              <Text style={s.calDoneText}>{t('common.done')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Worker Picker Modal */}
      <Modal visible={showWorkerModal} animationType="slide" presentationStyle="pageSheet">
        <View style={s.wrapper}>
          <View style={s.pickerHeader}>
            <View>
              <Text style={s.pickerTitle}>{t('submitRequest.team')}</Text>
              <Text style={s.pickerSub}>{t('submitRequest.selectedCount', { count: selectedIds.length })}</Text>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <TouchableOpacity onPress={selectAll} style={s.selectBtn}><Text style={s.selectBtnText}>{t('materials.selectAll')}</Text></TouchableOpacity>
              <TouchableOpacity onPress={clearAll} style={s.selectBtn}><Text style={s.selectBtnText}>{t('materials.clear')}</Text></TouchableOpacity>
              <TouchableOpacity style={s.pickerDoneBtn} onPress={() => setShowWorkerModal(false)}>
                <Text style={s.pickerDoneText}>{t('common.done')}</Text>
              </TouchableOpacity>
            </View>
          </View>
          <View style={s.pickerSearch}>
            <Ionicons name="search-outline" size={18} color="#9ca3af" />
            <TextInput style={s.searchInput} placeholder={t('submitRequest.searchWorkers')} placeholderTextColor="#9ca3af"
              value={search} onChangeText={setSearch} autoFocus />
            {search.length > 0 && <TouchableOpacity onPress={() => setSearch('')}><Ionicons name="close-circle" size={18} color="#9ca3af" /></TouchableOpacity>}
          </View>
          <ScrollView style={{ flex: 1, paddingHorizontal: 16 }}>
            {filtered.length === 0 ? (
              <View style={s.emptyCard}><Text style={s.emptyText}>{t('submitRequest.noneAvailable')}</Text></View>
            ) : filtered.map((w) => {
              const sel = selectedIds.includes(w.id);
              return (
                <TouchableOpacity key={w.id} style={[s.workerRow, sel && s.workerRowSel]} onPress={() => toggle(w.id)}>
                  <View style={[s.workerAvatar, sel && { backgroundColor: Colors.primary }]}>
                    <Text style={[s.workerAvatarText, sel && { color: Colors.white }]}>{w.first_name?.[0]}{w.last_name?.[0]}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[s.workerName, sel && { color: Colors.primary, fontWeight: '700' }]}>{w.first_name} {w.last_name}</Text>
                    <Text style={s.workerRole}>{w.trade_name || t('submitRequest.general')}</Text>
                  </View>
                  {sel ? <Ionicons name="checkmark-circle" size={22} color={Colors.primary} /> : <View style={s.emptyCheck} />}
                </TouchableOpacity>
              );
            })}
          </ScrollView>
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
  disabledCell: { opacity: 0.3 },
  dayNum: { fontSize: 14, color: Colors.textPrimary },
  selectedNum: { color: Colors.white, fontWeight: '700' },
  disabledNum: { color: Colors.textLight },
});

const s = StyleSheet.create({
  wrapper: { flex: 1, backgroundColor: Colors.background },
  container: { flex: 1 },
  content: { padding: 16, paddingBottom: 40 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingVertical: 40, backgroundColor: Colors.background },
  formCard: { backgroundColor: Colors.white, borderRadius: 16, padding: 16, shadowColor: Colors.shadowColor, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 3 },
  formTitle: { fontSize: 17, fontWeight: 'bold', color: Colors.primary, marginBottom: 4 },
  intro: { fontSize: 13, color: Colors.textLight, marginBottom: 8, lineHeight: 18 },
  label: { fontSize: 13, fontWeight: '600', color: Colors.textSecondary, marginBottom: 6, marginTop: 12 },
  muted: { fontSize: 13, color: Colors.textLight, paddingVertical: 8 },
  chip: { backgroundColor: Colors.background, borderRadius: 12, borderWidth: 1, borderColor: Colors.divider, paddingHorizontal: 14, paddingVertical: 10, alignItems: 'center', minWidth: 100 },
  chipSel: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  chipText: { fontSize: 13, fontWeight: '600', color: Colors.textSecondary },
  chipTextSel: { color: Colors.white },
  chipSub: { fontSize: 11, color: Colors.textLight, marginTop: 2 },
  dateButton: { flexDirection: 'row', alignItems: 'center', gap: 8, height: 44, borderWidth: 1, borderColor: Colors.divider, borderRadius: 10, paddingHorizontal: 12, backgroundColor: Colors.inputBg },
  dateButtonText: { fontSize: 13, color: Colors.textPrimary, fontWeight: '500', flex: 1 },
  workerHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 12 },
  selectBtn: { paddingHorizontal: 10, paddingVertical: 4, backgroundColor: Colors.background, borderRadius: 8, borderWidth: 1, borderColor: Colors.divider },
  selectBtnText: { fontSize: 12, color: Colors.textSecondary, fontWeight: '600' },
  workerPickerBtn: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: Colors.inputBg, borderRadius: 10, borderWidth: 1, borderColor: Colors.divider, paddingHorizontal: 14, paddingVertical: 12, marginTop: 4 },
  workerPickerText: { flex: 1, fontSize: 14, color: Colors.textPrimary },
  selectedChip: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: Colors.primary, borderRadius: 20, paddingHorizontal: 10, paddingVertical: 5 },
  selectedChipText: { fontSize: 12, color: Colors.white, fontWeight: '600' },
  sendBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: Colors.primary, borderRadius: 12, padding: 14, marginTop: 20 },
  sendBtnText: { fontSize: 15, fontWeight: 'bold', color: Colors.white },
  emptyCard: { backgroundColor: Colors.white, borderRadius: 16, padding: 40, alignItems: 'center', marginTop: 8 },
  emptyText: { fontSize: 15, color: Colors.textLight },
  calOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 24 },
  calCard: { backgroundColor: Colors.white, borderRadius: 20, padding: 20, width: '100%' },
  calTitle: { fontSize: 16, fontWeight: '700', color: Colors.primary, marginBottom: 12, textAlign: 'center' },
  calDone: { backgroundColor: Colors.primary, borderRadius: 10, padding: 12, alignItems: 'center', marginTop: 12 },
  calDoneText: { color: Colors.white, fontWeight: '700', fontSize: 14 },
  pickerHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, backgroundColor: Colors.white, borderBottomWidth: 1, borderBottomColor: Colors.divider },
  pickerTitle: { fontSize: 17, fontWeight: 'bold', color: Colors.primary },
  pickerSub: { fontSize: 12, color: Colors.textLight, marginTop: 2 },
  pickerDoneBtn: { backgroundColor: Colors.primary, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 7 },
  pickerDoneText: { fontSize: 14, fontWeight: '700', color: Colors.white },
  pickerSearch: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: Colors.white, margin: 12, borderRadius: 12, borderWidth: 1, borderColor: Colors.divider, paddingHorizontal: 14, paddingVertical: 10 },
  searchInput: { flex: 1, fontSize: 15, color: Colors.textPrimary },
  workerRow: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: Colors.white, borderRadius: 14, padding: 12, marginBottom: 8, borderWidth: 1, borderColor: Colors.divider },
  workerRowSel: { borderColor: Colors.primary, backgroundColor: Colors.primaryPale },
  workerAvatar: { width: 38, height: 38, borderRadius: 19, backgroundColor: '#e8f0fe', justifyContent: 'center', alignItems: 'center' },
  workerAvatarText: { fontSize: 13, fontWeight: '700', color: Colors.primary },
  workerName: { fontSize: 14, fontWeight: '600', color: Colors.textPrimary },
  workerRole: { fontSize: 11, color: Colors.textLight, marginTop: 1 },
  emptyCheck: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: Colors.divider },
});
