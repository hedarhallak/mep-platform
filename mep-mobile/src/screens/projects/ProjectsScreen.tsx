// §149 Batch D — Projects (list + create, mobile). Mirrors web ProjectsPage.
//   GET  /api/projects        → { projects: [{id, project_code, project_name, site_address, status_name, trade_name, client_name, assignment_count}] }
//   GET  /api/projects/meta   → { trade_types: [{id,code,name}], statuses: [{id,code,name}], clients: [{id,client_name}] }
//   POST /api/projects { project_name, trade_type_id, status_id?, site_address?, client_id?, ccq_sector? } → 201 { project }
// View gated by projects.view; the create button by projects.create.
// (Mobile create omits the map/geocode step — address is plain text, no lat/lng.)

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

interface Project {
  id: number; project_code: string; project_name: string; site_address: string | null;
  status_name: string | null; trade_name: string | null; client_name: string | null;
  assignment_count: number;
}
interface TradeType { id: number; code: string; name: string; }
interface Status { id: number; code: string; name: string; }
interface Client { id: number; client_name: string; }

const SECTORS = ['IC', 'INDUSTRIAL', 'RESIDENTIAL'];

export default function ProjectsScreen() {
  const { t } = useTranslation();
  const canCreate = usePermsStore((s) => s.can('projects', 'create'));
  const [projects, setProjects] = useState<Project[]>([]);
  const [trades, setTrades] = useState<TradeType[]>([]);
  const [statuses, setStatuses] = useState<Status[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ project_name: '', trade_type_id: '', status_id: '', site_address: '', client_id: '', ccq_sector: '' });

  const fetchData = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const r = await apiClient.get('/api/projects');
      setProjects(r.data?.projects || []);
    } catch {
      setProjects([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);
  useEffect(() => {
    apiClient.get('/api/projects/meta')
      .then((r) => {
        setTrades(r.data?.trade_types || []);
        setStatuses(r.data?.statuses || []);
        setClients(r.data?.clients || []);
      })
      .catch(() => {});
  }, []);

  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const openForm = () => {
    setForm({ project_name: '', trade_type_id: '', status_id: '', site_address: '', client_id: '', ccq_sector: '' });
    setShowForm(true);
  };

  const submit = async () => {
    if (!form.project_name.trim()) return Alert.alert(t('common.error'), t('projects.nameRequired'));
    if (!form.trade_type_id) return Alert.alert(t('common.error'), t('projects.tradeRequired'));
    setSaving(true);
    try {
      await apiClient.post('/api/projects', {
        project_name: form.project_name.trim(),
        trade_type_id: Number(form.trade_type_id),
        status_id: form.status_id ? Number(form.status_id) : undefined,
        site_address: form.site_address.trim() || undefined,
        client_id: form.client_id ? Number(form.client_id) : undefined,
        ccq_sector: form.ccq_sector || undefined,
      });
      setShowForm(false);
      fetchData(true);
      Alert.alert(t('common.success'), t('projects.created'));
    } catch (e: any) {
      Alert.alert(t('common.error'), e.response?.data?.error || t('projects.saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  const filtered = search.trim()
    ? projects.filter((p) => `${p.project_name} ${p.project_code}`.toLowerCase().includes(search.toLowerCase()))
    : projects;

  if (loading) return <View style={s.center}><ActivityIndicator size="large" color={Colors.primary} /></View>;

  return (
    <View style={s.wrapper}>
      <View style={s.searchBar}>
        <Ionicons name="search-outline" size={18} color="#9ca3af" />
        <TextInput style={s.searchInput} placeholder={t('common.search')} placeholderTextColor="#9ca3af" value={search} onChangeText={setSearch} />
        {search.length > 0 && <TouchableOpacity onPress={() => setSearch('')}><Ionicons name="close-circle" size={18} color="#9ca3af" /></TouchableOpacity>}
      </View>

      <ScrollView
        contentContainerStyle={s.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchData(true); }} tintColor={Colors.primary} />}
      >
        {filtered.length === 0 ? (
          <View style={s.emptyCard}>
            <Ionicons name="folder-open-outline" size={40} color={Colors.textLight} />
            <Text style={s.emptyText}>{t('projects.empty')}</Text>
          </View>
        ) : (
          filtered.map((p) => (
            <View key={p.id} style={s.card}>
              <View style={s.cardHead}>
                <View style={{ flex: 1 }}>
                  <Text style={s.name}>{p.project_name}</Text>
                  <Text style={s.code}>{p.project_code}</Text>
                </View>
                {!!p.status_name && <View style={s.statusBadge}><Text style={s.statusText}>{p.status_name}</Text></View>}
              </View>
              {!!p.site_address && <View style={s.metaRow}><Ionicons name="location-outline" size={13} color={Colors.textLight} /><Text style={s.meta}>{p.site_address}</Text></View>}
              <View style={s.metaRow}>
                {!!p.trade_name && <><Ionicons name="construct-outline" size={13} color={Colors.textLight} /><Text style={s.meta}>{p.trade_name}</Text></>}
                {!!p.client_name && <Text style={s.meta}>· {p.client_name}</Text>}
              </View>
              <View style={s.metaRow}>
                <Ionicons name="people-outline" size={13} color={Colors.textLight} />
                <Text style={s.meta}>{t('projects.assignedCount', { count: p.assignment_count || 0 })}</Text>
              </View>
            </View>
          ))
        )}
      </ScrollView>

      {canCreate && (
        <TouchableOpacity style={s.fab} onPress={openForm} activeOpacity={0.85}>
          <Ionicons name="add" size={28} color={Colors.white} />
        </TouchableOpacity>
      )}

      {/* Create modal */}
      <Modal visible={showForm} animationType="slide" presentationStyle="pageSheet">
        <KeyboardAvoidingView style={s.wrapper} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={s.modalHeader}>
            <Text style={s.modalTitle}>{t('projects.newProject')}</Text>
            <TouchableOpacity onPress={() => setShowForm(false)}><Ionicons name="close" size={24} color={Colors.textSecondary} /></TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={s.formContent} keyboardShouldPersistTaps="handled">
            <Text style={s.label}>{t('projects.name')} *</Text>
            <TextInput style={s.input} value={form.project_name} onChangeText={(v) => set('project_name', v)} placeholder={t('projects.name')} placeholderTextColor="#9ca3af" />

            <Text style={s.label}>{t('projectStaffing.trade')} *</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 4 }}>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                {trades.map((tr) => (
                  <TouchableOpacity key={tr.id} style={[s.tChip, form.trade_type_id === String(tr.id) && s.tChipSel]} onPress={() => set('trade_type_id', String(tr.id))}>
                    <Text style={[s.tChipText, form.trade_type_id === String(tr.id) && s.tChipTextSel]}>{tr.name}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>

            {statuses.length > 0 && (
              <>
                <Text style={s.label}>{t('projects.status')}</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 4 }}>
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    {statuses.map((st) => (
                      <TouchableOpacity key={st.id} style={[s.tChip, form.status_id === String(st.id) && s.tChipSel]} onPress={() => set('status_id', String(st.id))}>
                        <Text style={[s.tChipText, form.status_id === String(st.id) && s.tChipTextSel]}>{st.name}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </ScrollView>
              </>
            )}

            <Text style={s.label}>{t('profile.address')}</Text>
            <TextInput style={s.input} value={form.site_address} onChangeText={(v) => set('site_address', v)} placeholder={t('profile.address')} placeholderTextColor="#9ca3af" />

            {clients.length > 0 && (
              <>
                <Text style={s.label}>{t('projects.client')}</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 4 }}>
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    <TouchableOpacity style={[s.tChip, form.client_id === '' && s.tChipSel]} onPress={() => set('client_id', '')}>
                      <Text style={[s.tChipText, form.client_id === '' && s.tChipTextSel]}>{t('common.optional')}</Text>
                    </TouchableOpacity>
                    {clients.map((c) => (
                      <TouchableOpacity key={c.id} style={[s.tChip, form.client_id === String(c.id) && s.tChipSel]} onPress={() => set('client_id', String(c.id))}>
                        <Text style={[s.tChipText, form.client_id === String(c.id) && s.tChipTextSel]}>{c.client_name}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </ScrollView>
              </>
            )}

            <Text style={s.label}>{t('projects.sector')}</Text>
            <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
              {SECTORS.map((sec) => (
                <TouchableOpacity key={sec} style={[s.tChip, form.ccq_sector === sec && s.tChipSel]} onPress={() => set('ccq_sector', form.ccq_sector === sec ? '' : sec)}>
                  <Text style={[s.tChipText, form.ccq_sector === sec && s.tChipTextSel]}>{t(`projects.sectors.${sec}`, { defaultValue: sec })}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <TouchableOpacity style={[s.submitBtn, saving && { opacity: 0.6 }]} onPress={submit} disabled={saving}>
              {saving ? <ActivityIndicator color={Colors.white} /> : <Text style={s.submitText}>{t('common.save')}</Text>}
            </TouchableOpacity>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  wrapper: { flex: 1, backgroundColor: Colors.background },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: Colors.background },
  searchBar: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: Colors.white, margin: 12, marginBottom: 0, borderRadius: 12, borderWidth: 1, borderColor: Colors.divider, paddingHorizontal: 14, paddingVertical: 10 },
  searchInput: { flex: 1, fontSize: 15, color: Colors.textPrimary },
  content: { padding: 12, gap: 10, paddingBottom: 90 },
  emptyCard: { backgroundColor: Colors.white, borderRadius: 16, padding: 40, alignItems: 'center', gap: 12, marginTop: 20 },
  emptyText: { fontSize: 15, color: Colors.textLight },
  card: { backgroundColor: Colors.white, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: Colors.divider },
  cardHead: { flexDirection: 'row', alignItems: 'flex-start' },
  name: { fontSize: 16, fontWeight: '700', color: Colors.textPrimary },
  code: { fontSize: 12, color: Colors.textLight, marginTop: 1 },
  statusBadge: { backgroundColor: Colors.primaryPale, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3 },
  statusText: { fontSize: 11, fontWeight: '700', color: Colors.primary },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 5 },
  meta: { fontSize: 13, color: Colors.textSecondary },
  fab: { position: 'absolute', right: 20, bottom: 24, width: 56, height: 56, borderRadius: 28, backgroundColor: Colors.primary, justifyContent: 'center', alignItems: 'center', shadowColor: Colors.primary, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 6 },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, borderBottomWidth: 1, borderBottomColor: Colors.divider, backgroundColor: Colors.white },
  modalTitle: { fontSize: 18, fontWeight: 'bold', color: Colors.primary },
  formContent: { padding: 16, paddingBottom: 40 },
  label: { fontSize: 13, fontWeight: '600', color: Colors.textSecondary, marginBottom: 6, marginTop: 14 },
  input: { backgroundColor: Colors.inputBg, borderRadius: 10, borderWidth: 1, borderColor: Colors.divider, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: Colors.textPrimary },
  tChip: { backgroundColor: Colors.white, borderRadius: 12, borderWidth: 1, borderColor: Colors.divider, paddingHorizontal: 14, paddingVertical: 8 },
  tChipSel: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  tChipText: { fontSize: 13, fontWeight: '600', color: Colors.textSecondary },
  tChipTextSel: { color: Colors.white },
  submitBtn: { backgroundColor: Colors.primary, borderRadius: 12, padding: 16, alignItems: 'center', marginTop: 24 },
  submitText: { fontSize: 16, fontWeight: 'bold', color: Colors.white },
});
