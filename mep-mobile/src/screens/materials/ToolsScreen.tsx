// §149 Batch C — Tools (request a tool + my requests, mobile).
//   GET  /api/hub/my-projects        → project picker
//   GET  /api/tools/catalog?trade=   → { catalog: [{id, name, trade}] }
//   POST /api/tools/requests         → { project_id, catalog_id, quantity, note? }
//   GET  /api/tools/requests         → { requests: [{...tr.*, tool_name, trade}] }

import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, ActivityIndicator, ScrollView, RefreshControl,
  TouchableOpacity, TextInput, Modal, Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { apiClient } from '../../api/client';
import Colors from '../../theme/colors';

interface Project { id: number; project_code: string; project_name: string; }
interface Tool { id: number; name: string; trade?: string; }
interface ToolReq { id: number; tool_name?: string; trade?: string; quantity: number; status?: string; note?: string; created_at: string; }

function fmtDate(iso?: string) { return iso ? new Date(iso).toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' }) : ''; }

export default function ToolsScreen() {
  const { t } = useTranslation();
  const [projects, setProjects] = useState<Project[]>([]);
  const [catalog, setCatalog] = useState<Tool[]>([]);
  const [requests, setRequests] = useState<ToolReq[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showToolModal, setShowToolModal] = useState(false);
  const [search, setSearch] = useState('');

  const [projectId, setProjectId] = useState('');
  const [tool, setTool] = useState<Tool | null>(null);
  const [quantity, setQuantity] = useState('1');
  const [note, setNote] = useState('');

  const fetchData = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const [pr, cat, rq] = await Promise.all([
        apiClient.get('/api/hub/my-projects'),
        apiClient.get('/api/tools/catalog'),
        apiClient.get('/api/tools/requests'),
      ]);
      const p = pr.data?.projects || [];
      setProjects(p);
      if (p.length > 0 && !projectId) setProjectId(String(p[0].id));
      setCatalog(cat.data?.catalog || []);
      setRequests(rq.data?.requests || []);
    } catch {
      /* ignore */
    } finally { setLoading(false); setRefreshing(false); }
  }, [projectId]);

  useEffect(() => { fetchData(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const filtered = search.trim()
    ? catalog.filter((c) => `${c.name} ${c.trade || ''}`.toLowerCase().includes(search.toLowerCase()))
    : catalog;
  const reset = () => { setTool(null); setQuantity('1'); setNote(''); setShowForm(false); };

  const submit = async () => {
    if (!projectId) { Alert.alert(t('common.error'), t('tools.selectProject')); return; }
    if (!tool) { Alert.alert(t('common.error'), t('tools.selectTool')); return; }
    const qty = parseInt(quantity, 10);
    if (!Number.isFinite(qty) || qty <= 0) { Alert.alert(t('common.error'), t('tools.qtyRequired')); return; }
    setSaving(true);
    try {
      await apiClient.post('/api/tools/requests', {
        project_id: Number(projectId), catalog_id: tool.id, quantity: qty, note: note.trim() || undefined,
      });
      reset();
      fetchData(true);
      Alert.alert(t('common.success'), t('tools.submitted'));
    } catch (e: any) {
      Alert.alert(t('common.error'), e.response?.data?.error || t('tools.submitFailed'));
    } finally { setSaving(false); }
  };

  if (loading) return <View style={s.center}><ActivityIndicator size="large" color={Colors.primary} /></View>;

  return (
    <View style={s.wrapper}>
      <ScrollView contentContainerStyle={s.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchData(true); }} tintColor={Colors.primary} />}>

        {!showForm && (
          <TouchableOpacity style={s.newBtn} onPress={() => setShowForm(true)}>
            <Ionicons name="add-circle-outline" size={20} color={Colors.white} />
            <Text style={s.newBtnText}>{t('tools.newRequest')}</Text>
          </TouchableOpacity>
        )}

        {showForm && (
          <View style={s.formCard}>
            <Text style={s.formTitle}>{t('tools.newRequest')}</Text>

            <Text style={s.label}>{t('attendance.project')}</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 4 }}>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                {projects.map((p) => (
                  <TouchableOpacity key={p.id} style={[s.chip, projectId === String(p.id) && s.chipSel]} onPress={() => setProjectId(String(p.id))}>
                    <Text style={[s.chipText, projectId === String(p.id) && s.chipTextSel]}>{p.project_name}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>

            <Text style={s.label}>{t('tools.tool')}</Text>
            <TouchableOpacity style={s.pickerBtn} onPress={() => { setSearch(''); setShowToolModal(true); }}>
              <Ionicons name="construct-outline" size={18} color={Colors.primary} />
              <Text style={[s.pickerText, !tool && { color: Colors.textLight }]}>{tool ? tool.name : t('tools.selectTool')}</Text>
              <Ionicons name="chevron-forward" size={16} color="#9ca3af" />
            </TouchableOpacity>

            <Text style={s.label}>{t('tools.qty')}</Text>
            <TextInput style={[s.input, { width: 100 }]} value={quantity} onChangeText={setQuantity} keyboardType="number-pad" />

            <Text style={s.label}>{t('tools.note')}</Text>
            <TextInput style={[s.input, s.textArea]} placeholder={t('tools.notePlaceholder')} placeholderTextColor="#9ca3af" value={note} onChangeText={setNote} multiline />

            <View style={s.actions}>
              <TouchableOpacity style={s.cancelBtn} onPress={reset}><Text style={s.cancelText}>{t('common.cancel')}</Text></TouchableOpacity>
              <TouchableOpacity style={[s.submitBtn, saving && { opacity: 0.6 }]} onPress={submit} disabled={saving}>
                {saving ? <ActivityIndicator color={Colors.white} size="small" /> : <Text style={s.submitText}>{t('tools.submit')}</Text>}
              </TouchableOpacity>
            </View>
          </View>
        )}

        <Text style={s.sectionTitle}>{t('tools.myRequests')}</Text>
        {requests.length === 0 ? (
          <View style={s.emptyCard}><Text style={s.emptyText}>{t('tools.empty')}</Text></View>
        ) : requests.map((r) => (
          <View key={r.id} style={s.card}>
            <Text style={s.toolName}>{r.tool_name || '—'} × {r.quantity}</Text>
            {!!r.trade && <Text style={s.cardMeta}>{r.trade}</Text>}
            {!!r.note && <Text style={s.cardMeta}>{r.note}</Text>}
            <Text style={s.cardDate}>{fmtDate(r.created_at)}</Text>
          </View>
        ))}
      </ScrollView>

      {/* Tool picker modal */}
      <Modal visible={showToolModal} animationType="slide" presentationStyle="pageSheet">
        <View style={s.wrapper}>
          <View style={s.pickerHeader}>
            <Text style={s.pickerTitle}>{t('tools.tool')}</Text>
            <TouchableOpacity style={s.doneBtn} onPress={() => setShowToolModal(false)}><Text style={s.doneText}>{t('common.done')}</Text></TouchableOpacity>
          </View>
          <View style={s.searchBox}>
            <Ionicons name="search-outline" size={18} color="#9ca3af" />
            <TextInput style={s.searchInput} placeholder={t('tools.searchTools')} placeholderTextColor="#9ca3af" value={search} onChangeText={setSearch} autoFocus />
          </View>
          <ScrollView style={{ flex: 1, paddingHorizontal: 16 }}>
            {filtered.length === 0 ? (
              <View style={s.emptyCard}><Text style={s.emptyText}>{t('tools.noTools')}</Text></View>
            ) : filtered.map((c) => (
              <TouchableOpacity key={c.id} style={[s.toolRow, tool?.id === c.id && s.toolRowSel]}
                onPress={() => { setTool(c); setShowToolModal(false); }}>
                <View style={{ flex: 1 }}>
                  <Text style={s.toolRowName}>{c.name}</Text>
                  {!!c.trade && <Text style={s.toolRowTrade}>{c.trade}</Text>}
                </View>
                {tool?.id === c.id && <Ionicons name="checkmark-circle" size={22} color={Colors.primary} />}
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  wrapper: { flex: 1, backgroundColor: Colors.background },
  content: { padding: 16, gap: 12, paddingBottom: 40 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: Colors.background },
  newBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: Colors.primary, borderRadius: 14, padding: 14 },
  newBtnText: { fontSize: 15, fontWeight: 'bold', color: Colors.white },
  formCard: { backgroundColor: Colors.white, borderRadius: 16, padding: 16, shadowColor: Colors.shadowColor, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 3 },
  formTitle: { fontSize: 17, fontWeight: 'bold', color: Colors.primary, marginBottom: 4 },
  label: { fontSize: 13, fontWeight: '600', color: Colors.textSecondary, marginBottom: 6, marginTop: 12 },
  input: { backgroundColor: Colors.inputBg, borderRadius: 10, borderWidth: 1, borderColor: Colors.divider, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: Colors.textPrimary },
  textArea: { height: 60, textAlignVertical: 'top' },
  chip: { backgroundColor: Colors.background, borderRadius: 12, borderWidth: 1, borderColor: Colors.divider, paddingHorizontal: 14, paddingVertical: 10, minWidth: 100, alignItems: 'center' },
  chipSel: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  chipText: { fontSize: 13, fontWeight: '600', color: Colors.textSecondary },
  chipTextSel: { color: Colors.white },
  pickerBtn: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: Colors.inputBg, borderRadius: 10, borderWidth: 1, borderColor: Colors.divider, paddingHorizontal: 14, paddingVertical: 12 },
  pickerText: { flex: 1, fontSize: 14, color: Colors.textPrimary },
  actions: { flexDirection: 'row', gap: 10, marginTop: 16 },
  cancelBtn: { flex: 1, padding: 14, borderRadius: 12, backgroundColor: Colors.background, alignItems: 'center' },
  cancelText: { fontSize: 14, fontWeight: '600', color: Colors.textSecondary },
  submitBtn: { flex: 2, backgroundColor: Colors.primary, borderRadius: 12, padding: 14, alignItems: 'center' },
  submitText: { fontSize: 14, fontWeight: 'bold', color: Colors.white },
  sectionTitle: { fontSize: 13, fontWeight: '700', color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 1, marginTop: 8 },
  emptyCard: { backgroundColor: Colors.white, borderRadius: 14, padding: 30, alignItems: 'center', marginTop: 8 },
  emptyText: { fontSize: 14, color: Colors.textLight },
  card: { backgroundColor: Colors.white, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: Colors.divider },
  toolName: { fontSize: 15, fontWeight: '600', color: Colors.textPrimary },
  cardMeta: { fontSize: 12, color: Colors.textSecondary, marginTop: 2 },
  cardDate: { fontSize: 11, color: Colors.textLight, marginTop: 2 },
  pickerHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, backgroundColor: Colors.white, borderBottomWidth: 1, borderBottomColor: Colors.divider },
  pickerTitle: { fontSize: 17, fontWeight: 'bold', color: Colors.primary },
  doneBtn: { backgroundColor: Colors.primary, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 7 },
  doneText: { fontSize: 14, fontWeight: '700', color: Colors.white },
  searchBox: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: Colors.white, margin: 12, borderRadius: 12, borderWidth: 1, borderColor: Colors.divider, paddingHorizontal: 14, paddingVertical: 10 },
  searchInput: { flex: 1, fontSize: 15, color: Colors.textPrimary },
  toolRow: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: Colors.white, borderRadius: 14, padding: 14, marginBottom: 8, borderWidth: 1, borderColor: Colors.divider },
  toolRowSel: { borderColor: Colors.primary, backgroundColor: Colors.primaryPale },
  toolRowName: { fontSize: 14, fontWeight: '600', color: Colors.textPrimary },
  toolRowTrade: { fontSize: 11, color: Colors.textLight, marginTop: 1 },
});
