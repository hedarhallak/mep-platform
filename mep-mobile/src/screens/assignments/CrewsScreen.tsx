// §149 Batch D — Crews CRUD (mobile). Mirrors the web CrewsPage (create / edit /
// delete + list + member detail). The web crews page does NOT expose deploy/plan,
// so neither does mobile — this matches it exactly.
//   GET    /api/crews          → { crews: [{id, name, foreman_name, trade_code, is_active, member_count}] }
//   GET    /api/crews/:id      → { crew: { ..., members: [{employee_id, full_name, employee_code}] } }
//   POST   /api/crews          { name, foreman_employee_id|null, trade_code|null, member_ids:[] }
//   PATCH  /api/crews/:id      same payload
//   DELETE /api/crews/:id
//   GET    /api/hub/workers    → workers (normalized so id === employee_id, like the web)
// List/detail gated by assignments.view; create by assignments.create; edit/delete by assignments.edit.

import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, ActivityIndicator, ScrollView, RefreshControl,
  TouchableOpacity, Modal, TextInput, Alert, KeyboardAvoidingView, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { apiClient } from '../../api/client';
import { usePermsStore } from '../../store/usePermsStore';
import Colors from '../../theme/colors';

interface Crew {
  id: number; name: string; foreman_name?: string; trade_code?: string | null;
  is_active?: boolean; member_count?: number;
}
interface Member { employee_id?: number; full_name?: string; name?: string; trade_code?: string; role?: string; }
interface Worker { id: number; employee_id: number; first_name: string; last_name: string; trade_name?: string; }
interface TradeType { id: number; code: string; name: string; }

export default function CrewsScreen() {
  const { t } = useTranslation();
  const canCreate = usePermsStore((s) => s.can('assignments', 'create'));
  const canEdit = usePermsStore((s) => s.can('assignments', 'edit'));

  const [crews, setCrews] = useState<Crew[]>([]);
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [trades, setTrades] = useState<TradeType[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [busyId, setBusyId] = useState<number | null>(null);

  // read-only member detail
  const [detail, setDetail] = useState<{ crew: Crew; members: Member[] } | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // create / edit form
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Crew | null>(null);
  const [name, setName] = useState('');
  const [tradeCode, setTradeCode] = useState('ALL');
  const [foremanId, setForemanId] = useState<number | null>(null);
  const [memberIds, setMemberIds] = useState<number[]>([]);
  const [saving, setSaving] = useState(false);
  const [formLoading, setFormLoading] = useState(false);

  // worker picker (shared: 'foreman' single, 'members' multi)
  const [pickerMode, setPickerMode] = useState<'foreman' | 'members' | null>(null);
  const [pickerSearch, setPickerSearch] = useState('');

  const fetchData = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const r = await apiClient.get('/api/crews');
      setCrews(r.data?.crews || []);
    } catch {
      setCrews([]);
    } finally { setLoading(false); setRefreshing(false); }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);
  useEffect(() => {
    // /hub/workers returns id = app_user id; crews need employee_id → normalize so id IS employee_id.
    apiClient.get('/api/hub/workers')
      .then((r) => setWorkers((r.data?.workers || []).map((w: any) => ({ ...w, id: w.employee_id }))))
      .catch(() => {});
    apiClient.get('/api/projects/meta').then((r) => setTrades(r.data?.trade_types || [])).catch(() => {});
  }, []);

  const workerById = (id: number) => workers.find((w) => Number(w.id) === Number(id)) || null;
  const workerName = (id: number) => { const w = workerById(id); return w ? `${w.first_name} ${w.last_name}` : '—'; };

  const openDetail = async (crew: Crew) => {
    setDetail({ crew, members: [] });
    setDetailLoading(true);
    try {
      const r = await apiClient.get(`/api/crews/${crew.id}`);
      setDetail({ crew, members: r.data?.crew?.members || [] });
    } catch {
      setDetail({ crew, members: [] });
    } finally { setDetailLoading(false); }
  };

  const openCreate = () => {
    setEditing(null);
    setName(''); setTradeCode('ALL'); setForemanId(null); setMemberIds([]);
    setFormOpen(true);
  };

  const openEdit = async (crew: Crew) => {
    setEditing(crew);
    setName(crew.name); setTradeCode(crew.trade_code || 'ALL'); setForemanId(null); setMemberIds([]);
    setFormOpen(true);
    setFormLoading(true);
    try {
      const r = await apiClient.get(`/api/crews/${crew.id}`);
      const c = r.data?.crew || {};
      setForemanId(c.foreman_employee_id ?? null);
      setMemberIds((c.members || []).map((m: Member) => m.employee_id).filter(Boolean) as number[]);
    } catch {
      // leave roster empty on failure
    } finally { setFormLoading(false); }
  };

  const save = async () => {
    if (!name.trim()) return Alert.alert(t('common.error'), t('crews.nameRequired'));
    setSaving(true);
    const payload = {
      name: name.trim(),
      foreman_employee_id: foremanId || null,
      trade_code: tradeCode === 'ALL' ? null : tradeCode,
      member_ids: memberIds,
    };
    try {
      if (editing) await apiClient.patch(`/api/crews/${editing.id}`, payload);
      else await apiClient.post('/api/crews', payload);
      setFormOpen(false);
      fetchData(true);
      Alert.alert(t('common.success'), editing ? t('crews.updated') : t('crews.created'));
    } catch (e: any) {
      const code = e.response?.data?.error;
      Alert.alert(t('common.error'), code === 'NAME_TAKEN' ? t('crews.nameTaken') : (e.response?.data?.message || t('crews.saveFailed')));
    } finally { setSaving(false); }
  };

  const remove = (crew: Crew) => {
    Alert.alert(t('crews.confirmDelete'), crew.name, [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.delete'), style: 'destructive',
        onPress: async () => {
          setBusyId(crew.id);
          try {
            await apiClient.delete(`/api/crews/${crew.id}`);
            setCrews((p) => p.filter((c) => c.id !== crew.id));
          } catch (e: any) {
            Alert.alert(t('common.error'), e.response?.data?.message || t('crews.deleteFailed'));
          } finally { setBusyId(null); }
        },
      },
    ]);
  };

  const toggleMember = (id: number) => setMemberIds((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  const pickWorker = (id: number) => {
    if (pickerMode === 'foreman') { setForemanId(id); setPickerMode(null); }
    else toggleMember(id);
  };

  const filteredCrews = search.trim() ? crews.filter((c) => c.name.toLowerCase().includes(search.toLowerCase())) : crews;
  const filteredWorkers = pickerSearch.trim()
    ? workers.filter((w) => `${w.first_name} ${w.last_name} ${w.trade_name || ''}`.toLowerCase().includes(pickerSearch.toLowerCase()))
    : workers;

  if (loading) return <View style={s.center}><ActivityIndicator size="large" color={Colors.primary} /></View>;

  return (
    <View style={s.wrapper}>
      <View style={s.searchBar}>
        <Ionicons name="search-outline" size={18} color="#9ca3af" />
        <TextInput style={s.searchInput} placeholder={t('common.search')} placeholderTextColor="#9ca3af" value={search} onChangeText={setSearch} />
        {search.length > 0 && <TouchableOpacity onPress={() => setSearch('')}><Ionicons name="close-circle" size={18} color="#9ca3af" /></TouchableOpacity>}
      </View>

      <ScrollView contentContainerStyle={s.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchData(true); }} tintColor={Colors.primary} />}>
        {filteredCrews.length === 0 ? (
          <View style={s.emptyCard}>
            <Ionicons name="people-outline" size={40} color={Colors.textLight} />
            <Text style={s.emptyText}>{t('crews.empty')}</Text>
          </View>
        ) : filteredCrews.map((c) => (
          <View key={c.id} style={s.card}>
            <TouchableOpacity style={{ flex: 1 }} onPress={() => openDetail(c)} activeOpacity={0.7}>
              <View style={s.cardHead}>
                <Text style={s.name}>{c.name}</Text>
                {!!c.trade_code && <Text style={s.tradeTag}>{c.trade_code}</Text>}
                {c.is_active === false && <View style={s.inactiveBadge}><Text style={s.inactiveText}>{t('crews.inactive')}</Text></View>}
              </View>
              {!!c.foreman_name && (
                <View style={s.row}><Ionicons name="person-outline" size={14} color={Colors.textLight} /><Text style={s.meta}>{c.foreman_name}</Text></View>
              )}
              <View style={s.row}>
                <Ionicons name="people-outline" size={14} color={Colors.textLight} />
                <Text style={s.meta}>{t('crews.memberCount', { count: c.member_count ?? 0 })}</Text>
              </View>
            </TouchableOpacity>
            {canEdit && (
              <View style={s.cardActions}>
                <TouchableOpacity style={s.iconBtn} onPress={() => openEdit(c)}>
                  <Ionicons name="create-outline" size={20} color={Colors.primary} />
                </TouchableOpacity>
                <TouchableOpacity style={s.iconBtn} disabled={busyId === c.id} onPress={() => remove(c)}>
                  {busyId === c.id ? <ActivityIndicator size="small" color={Colors.danger} /> : <Ionicons name="trash-outline" size={19} color={Colors.danger} />}
                </TouchableOpacity>
              </View>
            )}
          </View>
        ))}
      </ScrollView>

      {canCreate && (
        <TouchableOpacity style={s.fab} onPress={openCreate} activeOpacity={0.85}>
          <Ionicons name="add" size={28} color={Colors.white} />
        </TouchableOpacity>
      )}

      {/* Crew detail (members, read-only) */}
      <Modal visible={!!detail} animationType="slide" presentationStyle="pageSheet">
        <View style={s.wrapper}>
          <View style={s.pickerHeader}>
            <View>
              <Text style={s.pickerTitle}>{detail?.crew.name}</Text>
              {!!detail?.crew.foreman_name && <Text style={s.pickerSub}>{detail.crew.foreman_name}</Text>}
            </View>
            <TouchableOpacity style={s.doneBtn} onPress={() => setDetail(null)}><Text style={s.doneText}>{t('common.done')}</Text></TouchableOpacity>
          </View>
          {detailLoading ? (
            <ActivityIndicator color={Colors.primary} style={{ marginTop: 40 }} />
          ) : (
            <ScrollView style={{ flex: 1, paddingHorizontal: 16, paddingTop: 12 }}>
              <Text style={s.sectionTitle}>{t('crews.members')}</Text>
              {(detail?.members || []).length === 0 ? (
                <View style={s.emptyCard}><Text style={s.emptyText}>{t('crews.noMembers')}</Text></View>
              ) : detail!.members.map((m, i) => {
                const nm = m.full_name || m.name || '—';
                return (
                  <View key={m.employee_id ?? i} style={s.memberRow}>
                    <View style={s.avatar}><Text style={s.avatarText}>{nm.charAt(0)}</Text></View>
                    <View style={{ flex: 1 }}>
                      <Text style={s.memberName}>{nm}</Text>
                      {!!(m.trade_code || m.role) && <Text style={s.memberMeta}>{m.role || ''}{m.trade_code ? ` · ${m.trade_code}` : ''}</Text>}
                    </View>
                  </View>
                );
              })}
            </ScrollView>
          )}
        </View>
      </Modal>

      {/* Create / edit form */}
      <Modal visible={formOpen} animationType="slide" presentationStyle="pageSheet">
        <KeyboardAvoidingView style={s.wrapper} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={s.modalHeader}>
            <Text style={s.modalTitle}>{editing ? t('crews.editCrew') : t('crews.addCrew')}</Text>
            <TouchableOpacity onPress={() => setFormOpen(false)}><Ionicons name="close" size={24} color={Colors.textSecondary} /></TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={s.formContent} keyboardShouldPersistTaps="handled">
            <Text style={s.label}>{t('crews.name')} *</Text>
            <TextInput style={s.input} value={name} onChangeText={setName} placeholder={t('crews.namePlaceholder')} placeholderTextColor="#9ca3af" />

            <Text style={s.label}>{t('projectStaffing.trade')}</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 4 }}>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <TouchableOpacity style={[s.tChip, tradeCode === 'ALL' && s.tChipSel]} onPress={() => setTradeCode('ALL')}>
                  <Text style={[s.tChipText, tradeCode === 'ALL' && s.tChipTextSel]}>{t('common.all')}</Text>
                </TouchableOpacity>
                {trades.map((tr) => (
                  <TouchableOpacity key={tr.id} style={[s.tChip, tradeCode === tr.code && s.tChipSel]} onPress={() => setTradeCode(tr.code)}>
                    <Text style={[s.tChipText, tradeCode === tr.code && s.tChipTextSel]}>{tr.name}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>

            {formLoading ? (
              <ActivityIndicator color={Colors.primary} style={{ marginTop: 20 }} />
            ) : (
              <>
                {/* Foreman */}
                <Text style={s.label}>{t('crews.foreman')}</Text>
                <TouchableOpacity style={s.pickBtn} onPress={() => { setPickerSearch(''); setPickerMode('foreman'); }}>
                  <Ionicons name="person-outline" size={18} color={Colors.primary} />
                  <Text style={[s.pickBtnText, foremanId === null && { color: Colors.textLight }]}>
                    {foremanId !== null ? workerName(foremanId) : t('crews.selectForeman')}
                  </Text>
                  {foremanId !== null && <TouchableOpacity onPress={() => setForemanId(null)}><Ionicons name="close-circle" size={18} color={Colors.textLight} /></TouchableOpacity>}
                  <Ionicons name="chevron-forward" size={16} color="#9ca3af" />
                </TouchableOpacity>

                {/* Members */}
                <Text style={s.label}>{t('crews.members')} {memberIds.length > 0 ? `(${memberIds.length})` : ''}</Text>
                <TouchableOpacity style={s.pickBtn} onPress={() => { setPickerSearch(''); setPickerMode('members'); }}>
                  <Ionicons name="people-outline" size={18} color={Colors.primary} />
                  <Text style={[s.pickBtnText, memberIds.length === 0 && { color: Colors.textLight }]}>
                    {memberIds.length === 0 ? t('submitRequest.selectTeam') : t('submitRequest.tapToEdit', { count: memberIds.length })}
                  </Text>
                  <Ionicons name="chevron-forward" size={16} color="#9ca3af" />
                </TouchableOpacity>
                {memberIds.length > 0 && (
                  <View style={s.chipWrap}>
                    {memberIds.map((id) => (
                      <TouchableOpacity key={id} style={s.selChip} onPress={() => toggleMember(id)}>
                        <Text style={s.selChipText}>{workerName(id)}</Text>
                        <Ionicons name="close-circle" size={14} color={Colors.white} />
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
              </>
            )}

            <TouchableOpacity style={[s.submitBtn, (saving || formLoading) && { opacity: 0.6 }]} onPress={save} disabled={saving || formLoading}>
              {saving ? <ActivityIndicator color={Colors.white} /> : <Text style={s.submitText}>{t('common.save')}</Text>}
            </TouchableOpacity>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>

      {/* Worker picker (foreman single / members multi) */}
      <Modal visible={pickerMode !== null} animationType="slide" presentationStyle="pageSheet">
        <View style={s.wrapper}>
          <View style={s.pickerHeader}>
            <Text style={s.pickerTitle}>{pickerMode === 'foreman' ? t('crews.foreman') : t('crews.members')}</Text>
            <TouchableOpacity style={s.doneBtn} onPress={() => setPickerMode(null)}><Text style={s.doneText}>{t('common.done')}</Text></TouchableOpacity>
          </View>
          <View style={s.pickerSearch}>
            <Ionicons name="search-outline" size={18} color="#9ca3af" />
            <TextInput style={s.searchInputFlex} placeholder={t('submitRequest.searchWorkers')} placeholderTextColor="#9ca3af" value={pickerSearch} onChangeText={setPickerSearch} autoFocus />
            {pickerSearch.length > 0 && <TouchableOpacity onPress={() => setPickerSearch('')}><Ionicons name="close-circle" size={18} color="#9ca3af" /></TouchableOpacity>}
          </View>
          <ScrollView style={{ flex: 1, paddingHorizontal: 16 }}>
            {filteredWorkers.length === 0 ? (
              <View style={s.emptyCard}><Text style={s.emptyText}>{t('common.noResults')}</Text></View>
            ) : filteredWorkers.map((w) => {
              const sel = pickerMode === 'foreman' ? foremanId === w.id : memberIds.includes(w.id);
              return (
                <TouchableOpacity key={w.id} style={[s.workerRow, sel && s.workerRowSel]} onPress={() => pickWorker(w.id)}>
                  <View style={[s.avatar, sel && { backgroundColor: Colors.primary }]}>
                    <Text style={[s.avatarText, sel && { color: Colors.white }]}>{w.first_name?.[0]}{w.last_name?.[0]}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[s.memberName, sel && { color: Colors.primary, fontWeight: '700' }]}>{w.first_name} {w.last_name}</Text>
                    <Text style={s.memberMeta}>{w.trade_name || t('submitRequest.general')}</Text>
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

const s = StyleSheet.create({
  wrapper: { flex: 1, backgroundColor: Colors.background },
  content: { padding: 12, gap: 10, paddingBottom: 90 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: Colors.background },
  searchBar: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: Colors.white, margin: 12, marginBottom: 0, borderRadius: 12, borderWidth: 1, borderColor: Colors.divider, paddingHorizontal: 14, paddingVertical: 10 },
  searchInput: { flex: 1, fontSize: 15, color: Colors.textPrimary },
  emptyCard: { backgroundColor: Colors.white, borderRadius: 16, padding: 30, alignItems: 'center', gap: 10, marginTop: 8 },
  emptyText: { fontSize: 14, color: Colors.textLight },
  card: { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.white, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: Colors.divider },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  name: { fontSize: 16, fontWeight: '700', color: Colors.textPrimary },
  inactiveBadge: { backgroundColor: Colors.background, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 2 },
  inactiveText: { fontSize: 10, color: Colors.textLight, fontWeight: '600' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 },
  meta: { fontSize: 13, color: Colors.textSecondary },
  tradeTag: { fontSize: 11, color: Colors.primary, fontWeight: '700', backgroundColor: Colors.primaryPale, paddingHorizontal: 6, paddingVertical: 1, borderRadius: 6 },
  cardActions: { flexDirection: 'row', alignItems: 'center', gap: 2, marginLeft: 8 },
  iconBtn: { padding: 8 },
  fab: { position: 'absolute', right: 20, bottom: 24, width: 56, height: 56, borderRadius: 28, backgroundColor: Colors.primary, justifyContent: 'center', alignItems: 'center', shadowColor: Colors.primary, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 6 },
  pickerHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, backgroundColor: Colors.white, borderBottomWidth: 1, borderBottomColor: Colors.divider },
  pickerTitle: { fontSize: 17, fontWeight: 'bold', color: Colors.primary },
  pickerSub: { fontSize: 12, color: Colors.textLight, marginTop: 2 },
  doneBtn: { backgroundColor: Colors.primary, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 7 },
  doneText: { fontSize: 14, fontWeight: '700', color: Colors.white },
  sectionTitle: { fontSize: 13, fontWeight: '700', color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 },
  memberRow: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: Colors.white, borderRadius: 12, padding: 12, marginBottom: 8, borderWidth: 1, borderColor: Colors.divider },
  workerRow: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: Colors.white, borderRadius: 12, padding: 12, marginBottom: 8, borderWidth: 1, borderColor: Colors.divider },
  workerRowSel: { borderColor: Colors.primary, backgroundColor: Colors.primaryPale },
  avatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: Colors.primaryPale, justifyContent: 'center', alignItems: 'center' },
  avatarText: { fontSize: 14, fontWeight: '700', color: Colors.primary },
  memberName: { fontSize: 14, fontWeight: '600', color: Colors.textPrimary },
  memberMeta: { fontSize: 11, color: Colors.textLight, marginTop: 1 },
  emptyCheck: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: Colors.divider },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, borderBottomWidth: 1, borderBottomColor: Colors.divider, backgroundColor: Colors.white },
  modalTitle: { fontSize: 18, fontWeight: 'bold', color: Colors.primary },
  formContent: { padding: 16, paddingBottom: 40 },
  label: { fontSize: 13, fontWeight: '600', color: Colors.textSecondary, marginBottom: 6, marginTop: 14 },
  input: { backgroundColor: Colors.inputBg, borderRadius: 10, borderWidth: 1, borderColor: Colors.divider, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: Colors.textPrimary },
  tChip: { backgroundColor: Colors.white, borderRadius: 12, borderWidth: 1, borderColor: Colors.divider, paddingHorizontal: 14, paddingVertical: 8 },
  tChipSel: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  tChipText: { fontSize: 13, fontWeight: '600', color: Colors.textSecondary },
  tChipTextSel: { color: Colors.white },
  pickBtn: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: Colors.inputBg, borderRadius: 10, borderWidth: 1, borderColor: Colors.divider, paddingHorizontal: 14, paddingVertical: 12 },
  pickBtnText: { flex: 1, fontSize: 14, color: Colors.textPrimary },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  selChip: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: Colors.primary, borderRadius: 20, paddingHorizontal: 10, paddingVertical: 5 },
  selChipText: { fontSize: 12, color: Colors.white, fontWeight: '600' },
  pickerSearch: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: Colors.white, margin: 12, borderRadius: 12, borderWidth: 1, borderColor: Colors.divider, paddingHorizontal: 14, paddingVertical: 10 },
  searchInputFlex: { flex: 1, fontSize: 15, color: Colors.textPrimary },
  submitBtn: { backgroundColor: Colors.primary, borderRadius: 12, padding: 16, alignItems: 'center', marginTop: 24 },
  submitText: { fontSize: 16, fontWeight: 'bold', color: Colors.white },
});
