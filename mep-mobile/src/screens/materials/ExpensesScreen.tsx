// §149 Batch B — Expenses / emergency purchases (mobile).
//   GET  /api/hub/my-projects            → project picker
//   POST /api/expense-claims/receipt     → { receipt_url }  (FormData field `receipt`)
//   POST /api/expense-claims             → { project_id, vendor, amount_cents, description?, receipt_url? }
//   GET  /api/expense-claims             → { claims: [...] }

import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, ActivityIndicator, ScrollView, RefreshControl,
  TouchableOpacity, TextInput, Alert, Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import * as ImagePicker from 'expo-image-picker';
import { apiClient } from '../../api/client';
import Colors from '../../theme/colors';

interface Project { id: number; project_code: string; project_name: string; }
interface Claim {
  id: number; vendor: string; amount_cents: number; currency: string;
  status: string; description?: string; created_at: string;
  project_code?: string; project_name?: string;
}

const STATUS_COLOR: Record<string, string> = {
  PENDING: Colors.warning, APPROVED: Colors.info, PAID: Colors.success, REJECTED: Colors.danger,
};
function money(cents: number, ccy = 'CAD') { return `${(cents / 100).toFixed(2)} ${ccy}`; }
function fmtDate(iso?: string) { return iso ? new Date(iso).toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' }) : ''; }

export default function ExpensesScreen() {
  const { t } = useTranslation();
  const [projects, setProjects] = useState<Project[]>([]);
  const [claims, setClaims] = useState<Claim[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);

  const [projectId, setProjectId] = useState('');
  const [vendor, setVendor] = useState('');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [photo, setPhoto] = useState<{ uri: string; name: string; type: string } | null>(null);

  const fetchData = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const [pr, cl] = await Promise.all([
        apiClient.get('/api/hub/my-projects'),
        apiClient.get('/api/expense-claims'),
      ]);
      const p = pr.data?.projects || [];
      setProjects(p);
      if (p.length > 0 && !projectId) setProjectId(String(p[0].id));
      setClaims(cl.data?.claims || []);
    } catch {
      /* ignore */
    } finally { setLoading(false); setRefreshing(false); }
  }, [projectId]);

  useEffect(() => { fetchData(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const pickPhoto = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') { Alert.alert(t('common.error'), t('expenses.photoPermission')); return; }
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.6 });
    if (!res.canceled && res.assets[0]) {
      const a = res.assets[0];
      setPhoto({ uri: a.uri, name: a.uri.split('/').pop() || 'receipt.jpg', type: 'image/jpeg' });
    }
  };

  const reset = () => { setVendor(''); setAmount(''); setDescription(''); setPhoto(null); setShowForm(false); };

  const submit = async () => {
    if (!projectId) { Alert.alert(t('common.error'), t('expenses.selectProject')); return; }
    if (!vendor.trim()) { Alert.alert(t('common.error'), t('expenses.vendorRequired')); return; }
    const dollars = parseFloat(amount);
    if (!Number.isFinite(dollars) || dollars <= 0) { Alert.alert(t('common.error'), t('expenses.amountRequired')); return; }
    setSaving(true);
    try {
      let receiptUrl: string | undefined;
      if (photo) {
        const fd = new FormData();
        fd.append('receipt', { uri: photo.uri, name: photo.name, type: photo.type } as any);
        const up = await apiClient.post('/api/expense-claims/receipt', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
        receiptUrl = up.data?.receipt_url;
      }
      await apiClient.post('/api/expense-claims', {
        project_id: Number(projectId),
        vendor: vendor.trim(),
        amount_cents: Math.round(dollars * 100),
        description: description.trim() || undefined,
        receipt_url: receiptUrl,
      });
      reset();
      fetchData(true);
      Alert.alert(t('common.success'), t('expenses.submitted'));
    } catch (e: any) {
      Alert.alert(t('common.error'), e.response?.data?.error || t('expenses.submitFailed'));
    } finally { setSaving(false); }
  };

  if (loading) return <View style={s.center}><ActivityIndicator size="large" color={Colors.primary} /></View>;

  return (
    <ScrollView style={s.wrapper} contentContainerStyle={s.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchData(true); }} tintColor={Colors.primary} />}>

      {!showForm && (
        <TouchableOpacity style={s.newBtn} onPress={() => setShowForm(true)}>
          <Ionicons name="add-circle-outline" size={20} color={Colors.white} />
          <Text style={s.newBtnText}>{t('expenses.newClaim')}</Text>
        </TouchableOpacity>
      )}

      {showForm && (
        <View style={s.formCard}>
          <Text style={s.formTitle}>{t('expenses.newClaim')}</Text>

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

          <Text style={s.label}>{t('expenses.vendor')}</Text>
          <TextInput style={s.input} placeholder={t('expenses.vendorPlaceholder')} placeholderTextColor="#9ca3af" value={vendor} onChangeText={setVendor} />

          <Text style={s.label}>{t('expenses.amount')}</Text>
          <TextInput style={s.input} placeholder="0.00" placeholderTextColor="#9ca3af" value={amount} onChangeText={setAmount} keyboardType="decimal-pad" />

          <Text style={s.label}>{t('expenses.description')}</Text>
          <TextInput style={[s.input, s.textArea]} placeholder={t('expenses.descriptionPlaceholder')} placeholderTextColor="#9ca3af" value={description} onChangeText={setDescription} multiline />

          <Text style={s.label}>{t('expenses.receipt')}</Text>
          <TouchableOpacity style={s.attachBtn} onPress={pickPhoto}>
            <Ionicons name="camera-outline" size={18} color={Colors.primary} />
            <Text style={[s.attachText, !photo && { color: Colors.textLight }]}>{photo ? photo.name : t('expenses.addPhoto')}</Text>
            {photo && <TouchableOpacity onPress={() => setPhoto(null)}><Ionicons name="close-circle" size={18} color={Colors.danger} /></TouchableOpacity>}
          </TouchableOpacity>
          {photo && <Image source={{ uri: photo.uri }} style={s.preview} resizeMode="cover" />}

          <View style={s.actions}>
            <TouchableOpacity style={s.cancelBtn} onPress={reset}><Text style={s.cancelText}>{t('common.cancel')}</Text></TouchableOpacity>
            <TouchableOpacity style={[s.submitBtn, saving && { opacity: 0.6 }]} onPress={submit} disabled={saving}>
              {saving ? <ActivityIndicator color={Colors.white} size="small" /> : <Text style={s.submitText}>{t('expenses.submit')}</Text>}
            </TouchableOpacity>
          </View>
        </View>
      )}

      <Text style={s.sectionTitle}>{t('expenses.myClaims')}</Text>
      {claims.length === 0 ? (
        <View style={s.emptyCard}><Text style={s.emptyText}>{t('expenses.empty')}</Text></View>
      ) : claims.map((c) => (
        <View key={c.id} style={s.card}>
          <View style={s.cardHead}>
            <Text style={s.vendor}>{c.vendor}</Text>
            <View style={[s.statusBadge, { backgroundColor: (STATUS_COLOR[c.status] || Colors.textLight) + '22' }]}>
              <Text style={[s.statusText, { color: STATUS_COLOR[c.status] || Colors.textLight }]}>{t(`expenses.status.${c.status}`, { defaultValue: c.status })}</Text>
            </View>
          </View>
          <Text style={s.amount}>{money(c.amount_cents, c.currency)}</Text>
          {!!c.project_name && <Text style={s.cardMeta}>{c.project_name}</Text>}
          <Text style={s.cardDate}>{fmtDate(c.created_at)}</Text>
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
  input: { backgroundColor: Colors.inputBg, borderRadius: 10, borderWidth: 1, borderColor: Colors.divider, paddingHorizontal: 14, paddingVertical: 10, fontSize: 14, color: Colors.textPrimary },
  textArea: { height: 70, textAlignVertical: 'top' },
  chip: { backgroundColor: Colors.background, borderRadius: 12, borderWidth: 1, borderColor: Colors.divider, paddingHorizontal: 14, paddingVertical: 10, minWidth: 100, alignItems: 'center' },
  chipSel: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  chipText: { fontSize: 13, fontWeight: '600', color: Colors.textSecondary },
  chipTextSel: { color: Colors.white },
  attachBtn: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: Colors.inputBg, borderRadius: 10, borderWidth: 1, borderColor: Colors.divider, paddingHorizontal: 14, paddingVertical: 12 },
  attachText: { flex: 1, fontSize: 14, color: Colors.textPrimary },
  preview: { width: '100%', height: 160, borderRadius: 12, marginTop: 8 },
  actions: { flexDirection: 'row', gap: 10, marginTop: 16 },
  cancelBtn: { flex: 1, padding: 14, borderRadius: 12, backgroundColor: Colors.background, alignItems: 'center' },
  cancelText: { fontSize: 14, fontWeight: '600', color: Colors.textSecondary },
  submitBtn: { flex: 2, backgroundColor: Colors.primary, borderRadius: 12, padding: 14, alignItems: 'center' },
  submitText: { fontSize: 14, fontWeight: 'bold', color: Colors.white },
  sectionTitle: { fontSize: 13, fontWeight: '700', color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 1, marginTop: 8 },
  emptyCard: { backgroundColor: Colors.white, borderRadius: 14, padding: 30, alignItems: 'center' },
  emptyText: { fontSize: 14, color: Colors.textLight },
  card: { backgroundColor: Colors.white, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: Colors.divider },
  cardHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  vendor: { fontSize: 15, fontWeight: '600', color: Colors.textPrimary, flex: 1 },
  statusBadge: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  statusText: { fontSize: 11, fontWeight: '700' },
  amount: { fontSize: 18, fontWeight: 'bold', color: Colors.primary, marginTop: 4 },
  cardMeta: { fontSize: 12, color: Colors.textSecondary, marginTop: 2 },
  cardDate: { fontSize: 11, color: Colors.textLight, marginTop: 2 },
});
