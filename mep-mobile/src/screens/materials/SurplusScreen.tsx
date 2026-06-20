// §149 Batch B — Surplus / Material Returns (mobile).
//   GET  /api/hub/my-projects     → project picker
//   POST /api/materials/returns   → { project_id, items:[{item_name,quantity,unit}], note? }
//   GET  /api/materials/returns   → { returns: [...] }

import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, ActivityIndicator, ScrollView, RefreshControl,
  TouchableOpacity, TextInput, Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { apiClient } from '../../api/client';
import Colors from '../../theme/colors';

interface Project { id: number; project_code: string; project_name: string; }
interface Item { item_name: string; quantity: string; unit: string; }
interface Ret {
  id: number; note?: string; created_at: string; status?: string;
  project_code?: string; project_name?: string; items?: any[];
}

function fmtDate(iso?: string) { return iso ? new Date(iso).toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' }) : ''; }

export default function SurplusScreen() {
  const { t } = useTranslation();
  const [projects, setProjects] = useState<Project[]>([]);
  const [returns, setReturns] = useState<Ret[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);

  const [projectId, setProjectId] = useState('');
  const [items, setItems] = useState<Item[]>([{ item_name: '', quantity: '', unit: 'pcs' }]);
  const [note, setNote] = useState('');

  const fetchData = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const [pr, rt] = await Promise.all([
        apiClient.get('/api/hub/my-projects'),
        apiClient.get('/api/materials/returns'),
      ]);
      const p = pr.data?.projects || [];
      setProjects(p);
      if (p.length > 0 && !projectId) setProjectId(String(p[0].id));
      setReturns(rt.data?.returns || []);
    } catch {
      /* ignore */
    } finally { setLoading(false); setRefreshing(false); }
  }, [projectId]);

  useEffect(() => { fetchData(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const setItem = (i: number, k: keyof Item, v: string) =>
    setItems((prev) => prev.map((it, idx) => (idx === i ? { ...it, [k]: v } : it)));
  const addItem = () => setItems((prev) => [...prev, { item_name: '', quantity: '', unit: 'pcs' }]);
  const removeItem = (i: number) => setItems((prev) => prev.filter((_, idx) => idx !== i));
  const reset = () => { setItems([{ item_name: '', quantity: '', unit: 'pcs' }]); setNote(''); setShowForm(false); };

  const submit = async () => {
    if (!projectId) { Alert.alert(t('common.error'), t('surplus.selectProject')); return; }
    const valid = items.filter((it) => it.item_name.trim() && Number(it.quantity) > 0);
    if (!valid.length) { Alert.alert(t('common.error'), t('surplus.addItem')); return; }
    setSaving(true);
    try {
      await apiClient.post('/api/materials/returns', {
        project_id: Number(projectId),
        items: valid.map((it) => ({ item_name: it.item_name.trim(), quantity: Number(it.quantity), unit: it.unit })),
        note: note.trim() || undefined,
      });
      reset();
      fetchData(true);
      Alert.alert(t('common.success'), t('surplus.submitted'));
    } catch (e: any) {
      Alert.alert(t('common.error'), e.response?.data?.error || t('surplus.submitFailed'));
    } finally { setSaving(false); }
  };

  if (loading) return <View style={s.center}><ActivityIndicator size="large" color={Colors.primary} /></View>;

  return (
    <ScrollView style={s.wrapper} contentContainerStyle={s.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchData(true); }} tintColor={Colors.primary} />}>

      {!showForm && (
        <TouchableOpacity style={s.newBtn} onPress={() => setShowForm(true)}>
          <Ionicons name="add-circle-outline" size={20} color={Colors.white} />
          <Text style={s.newBtnText}>{t('surplus.declare')}</Text>
        </TouchableOpacity>
      )}

      {showForm && (
        <View style={s.formCard}>
          <Text style={s.formTitle}>{t('surplus.declare')}</Text>

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

          <Text style={s.label}>{t('surplus.items')}</Text>
          {items.map((it, i) => (
            <View key={i} style={s.itemRow}>
              <TextInput style={[s.input, { flex: 3 }]} placeholder={t('surplus.itemName')} placeholderTextColor="#9ca3af"
                value={it.item_name} onChangeText={(v) => setItem(i, 'item_name', v)} />
              <TextInput style={[s.input, { flex: 1 }]} placeholder={t('surplus.qty')} placeholderTextColor="#9ca3af"
                value={it.quantity} onChangeText={(v) => setItem(i, 'quantity', v)} keyboardType="number-pad" />
              {items.length > 1 && (
                <TouchableOpacity onPress={() => removeItem(i)} style={s.removeBtn}>
                  <Ionicons name="close-circle" size={22} color={Colors.danger} />
                </TouchableOpacity>
              )}
            </View>
          ))}
          <TouchableOpacity style={s.addItemBtn} onPress={addItem}>
            <Ionicons name="add" size={16} color={Colors.primary} />
            <Text style={s.addItemText}>{t('surplus.addItemBtn')}</Text>
          </TouchableOpacity>

          <Text style={s.label}>{t('surplus.note')}</Text>
          <TextInput style={[s.input, s.textArea]} placeholder={t('surplus.notePlaceholder')} placeholderTextColor="#9ca3af" value={note} onChangeText={setNote} multiline />

          <View style={s.actions}>
            <TouchableOpacity style={s.cancelBtn} onPress={reset}><Text style={s.cancelText}>{t('common.cancel')}</Text></TouchableOpacity>
            <TouchableOpacity style={[s.submitBtn, saving && { opacity: 0.6 }]} onPress={submit} disabled={saving}>
              {saving ? <ActivityIndicator color={Colors.white} size="small" /> : <Text style={s.submitText}>{t('surplus.submit')}</Text>}
            </TouchableOpacity>
          </View>
        </View>
      )}

      <Text style={s.sectionTitle}>{t('surplus.myReturns')}</Text>
      {returns.length === 0 ? (
        <View style={s.emptyCard}><Text style={s.emptyText}>{t('surplus.empty')}</Text></View>
      ) : returns.map((r) => (
        <View key={r.id} style={s.card}>
          <Text style={s.project}>{r.project_name || '—'}</Text>
          <Text style={s.itemsLine}>{t('surplus.itemsCount', { count: Array.isArray(r.items) ? r.items.length : 0 })}</Text>
          {!!r.note && <Text style={s.cardMeta}>{r.note}</Text>}
          <Text style={s.cardDate}>{fmtDate(r.created_at)}</Text>
        </View>
      ))}
    </ScrollView>
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
  itemRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  removeBtn: { padding: 2 },
  addItemBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', paddingVertical: 6 },
  addItemText: { fontSize: 13, fontWeight: '600', color: Colors.primary },
  actions: { flexDirection: 'row', gap: 10, marginTop: 16 },
  cancelBtn: { flex: 1, padding: 14, borderRadius: 12, backgroundColor: Colors.background, alignItems: 'center' },
  cancelText: { fontSize: 14, fontWeight: '600', color: Colors.textSecondary },
  submitBtn: { flex: 2, backgroundColor: Colors.primary, borderRadius: 12, padding: 14, alignItems: 'center' },
  submitText: { fontSize: 14, fontWeight: 'bold', color: Colors.white },
  sectionTitle: { fontSize: 13, fontWeight: '700', color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 1, marginTop: 8 },
  emptyCard: { backgroundColor: Colors.white, borderRadius: 14, padding: 30, alignItems: 'center' },
  emptyText: { fontSize: 14, color: Colors.textLight },
  card: { backgroundColor: Colors.white, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: Colors.divider },
  project: { fontSize: 15, fontWeight: '600', color: Colors.textPrimary },
  itemsLine: { fontSize: 13, color: Colors.textSecondary, marginTop: 2 },
  cardMeta: { fontSize: 12, color: Colors.textSecondary, marginTop: 2 },
  cardDate: { fontSize: 11, color: Colors.textLight, marginTop: 2 },
});
