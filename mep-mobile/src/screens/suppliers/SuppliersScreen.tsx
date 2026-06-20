// §149 Batch D — Suppliers (list + create, mobile). Mirrors web SuppliersPage.
//   GET  /api/suppliers                 → { suppliers: [{id,name,email,phone,address,trade_code,note}] }
//   POST /api/suppliers  { name, email, phone, address?, trade_code?, note? }  → 201 { supplier }
//   GET  /api/projects/meta             → { trade_types: [{id,code,name}] }   (for the trade picker)
// View gated by suppliers.view; the create button by suppliers.create.

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

interface Supplier {
  id: number; name: string; email: string; phone: string;
  address: string | null; trade_code: string | null; note: string | null;
}
interface TradeType { id: number; code: string; name: string; }

export default function SuppliersScreen() {
  const { t } = useTranslation();
  const canCreate = usePermsStore((s) => s.can('suppliers', 'create'));
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [trades, setTrades] = useState<TradeType[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', phone: '', address: '', trade_code: 'ALL', note: '' });

  const fetchData = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const r = await apiClient.get('/api/suppliers');
      setSuppliers(r.data?.suppliers || []);
    } catch {
      setSuppliers([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);
  useEffect(() => {
    apiClient.get('/api/projects/meta').then((r) => setTrades(r.data?.trade_types || [])).catch(() => {});
  }, []);

  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const openForm = () => {
    setForm({ name: '', email: '', phone: '', address: '', trade_code: 'ALL', note: '' });
    setShowForm(true);
  };

  const submit = async () => {
    if (!form.name.trim()) return Alert.alert(t('common.error'), t('suppliers.nameRequired'));
    if (!form.email.trim()) return Alert.alert(t('common.error'), t('suppliers.emailRequired'));
    if (!form.phone.trim()) return Alert.alert(t('common.error'), t('suppliers.phoneRequired'));
    setSaving(true);
    try {
      await apiClient.post('/api/suppliers', {
        name: form.name.trim(),
        email: form.email.trim(),
        phone: form.phone.trim(),
        address: form.address.trim() || null,
        trade_code: form.trade_code || 'ALL',
        note: form.note.trim() || null,
      });
      setShowForm(false);
      fetchData(true);
      Alert.alert(t('common.success'), t('suppliers.created'));
    } catch (e: any) {
      const code = e.response?.data?.error;
      Alert.alert(t('common.error'), code === 'SUPPLIER_EXISTS' ? t('suppliers.exists') : (e.response?.data?.error || t('suppliers.saveFailed')));
    } finally {
      setSaving(false);
    }
  };

  const filtered = search.trim()
    ? suppliers.filter((s) => `${s.name} ${s.email}`.toLowerCase().includes(search.toLowerCase()))
    : suppliers;

  if (loading) return <View style={s.center}><ActivityIndicator size="large" color={Colors.primary} /></View>;

  return (
    <View style={s.wrapper}>
      {/* Search */}
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
            <Ionicons name="business-outline" size={40} color={Colors.textLight} />
            <Text style={s.emptyText}>{t('suppliers.empty')}</Text>
          </View>
        ) : (
          filtered.map((sup) => (
            <View key={sup.id} style={s.card}>
              <View style={s.cardHead}>
                <Text style={s.name}>{sup.name}</Text>
                {!!sup.trade_code && <View style={s.tradeBadge}><Text style={s.tradeBadgeText}>{sup.trade_code}</Text></View>}
              </View>
              {!!sup.email && <View style={s.metaRow}><Ionicons name="mail-outline" size={13} color={Colors.textLight} /><Text style={s.meta}>{sup.email}</Text></View>}
              {!!sup.phone && <View style={s.metaRow}><Ionicons name="call-outline" size={13} color={Colors.textLight} /><Text style={s.meta}>{sup.phone}</Text></View>}
              {!!sup.address && <View style={s.metaRow}><Ionicons name="location-outline" size={13} color={Colors.textLight} /><Text style={s.meta}>{sup.address}</Text></View>}
              {!!sup.note && <Text style={s.note}>{sup.note}</Text>}
            </View>
          ))
        )}
      </ScrollView>

      {/* FAB */}
      {canCreate && (
        <TouchableOpacity style={s.fab} onPress={openForm} activeOpacity={0.85}>
          <Ionicons name="add" size={28} color={Colors.white} />
        </TouchableOpacity>
      )}

      {/* Create modal */}
      <Modal visible={showForm} animationType="slide" presentationStyle="pageSheet">
        <KeyboardAvoidingView style={s.wrapper} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={s.modalHeader}>
            <Text style={s.modalTitle}>{t('suppliers.newSupplier')}</Text>
            <TouchableOpacity onPress={() => setShowForm(false)}><Ionicons name="close" size={24} color={Colors.textSecondary} /></TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={s.formContent} keyboardShouldPersistTaps="handled">
            <Text style={s.label}>{t('suppliers.name')} *</Text>
            <TextInput style={s.input} value={form.name} onChangeText={(v) => set('name', v)} placeholder={t('suppliers.name')} placeholderTextColor="#9ca3af" />
            <Text style={s.label}>{t('profile.email')} *</Text>
            <TextInput style={s.input} value={form.email} onChangeText={(v) => set('email', v)} placeholder={t('profile.email')} placeholderTextColor="#9ca3af" keyboardType="email-address" autoCapitalize="none" />
            <Text style={s.label}>{t('profile.phone')} *</Text>
            <TextInput style={s.input} value={form.phone} onChangeText={(v) => set('phone', v)} placeholder={t('profile.phone')} placeholderTextColor="#9ca3af" keyboardType="phone-pad" />
            <Text style={s.label}>{t('profile.address')}</Text>
            <TextInput style={s.input} value={form.address} onChangeText={(v) => set('address', v)} placeholder={t('profile.address')} placeholderTextColor="#9ca3af" />
            <Text style={s.label}>{t('projectStaffing.trade')}</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 4 }}>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <TouchableOpacity style={[s.tChip, form.trade_code === 'ALL' && s.tChipSel]} onPress={() => set('trade_code', 'ALL')}>
                  <Text style={[s.tChipText, form.trade_code === 'ALL' && s.tChipTextSel]}>{t('common.all')}</Text>
                </TouchableOpacity>
                {trades.map((tr) => (
                  <TouchableOpacity key={tr.id} style={[s.tChip, form.trade_code === tr.code && s.tChipSel]} onPress={() => set('trade_code', tr.code)}>
                    <Text style={[s.tChipText, form.trade_code === tr.code && s.tChipTextSel]}>{tr.name}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>
            <Text style={s.label}>{t('tools.note')}</Text>
            <TextInput style={[s.input, s.textArea]} value={form.note} onChangeText={(v) => set('note', v)} placeholder={t('tools.notePlaceholder')} placeholderTextColor="#9ca3af" multiline />

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
  cardHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  name: { fontSize: 16, fontWeight: '700', color: Colors.textPrimary, flex: 1 },
  tradeBadge: { backgroundColor: Colors.primaryPale, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3 },
  tradeBadgeText: { fontSize: 11, fontWeight: '700', color: Colors.primary },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 5 },
  meta: { fontSize: 13, color: Colors.textSecondary, flex: 1 },
  note: { fontSize: 12, color: Colors.textLight, marginTop: 8, fontStyle: 'italic' },
  fab: { position: 'absolute', right: 20, bottom: 24, width: 56, height: 56, borderRadius: 28, backgroundColor: Colors.primary, justifyContent: 'center', alignItems: 'center', shadowColor: Colors.primary, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 6 },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, borderBottomWidth: 1, borderBottomColor: Colors.divider, backgroundColor: Colors.white },
  modalTitle: { fontSize: 18, fontWeight: 'bold', color: Colors.primary },
  formContent: { padding: 16, paddingBottom: 40 },
  label: { fontSize: 13, fontWeight: '600', color: Colors.textSecondary, marginBottom: 6, marginTop: 14 },
  input: { backgroundColor: Colors.inputBg, borderRadius: 10, borderWidth: 1, borderColor: Colors.divider, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: Colors.textPrimary },
  textArea: { height: 70, textAlignVertical: 'top' },
  tChip: { backgroundColor: Colors.white, borderRadius: 12, borderWidth: 1, borderColor: Colors.divider, paddingHorizontal: 14, paddingVertical: 8 },
  tChipSel: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  tChipText: { fontSize: 13, fontWeight: '600', color: Colors.textSecondary },
  tChipTextSel: { color: Colors.white },
  submitBtn: { backgroundColor: Colors.primary, borderRadius: 12, padding: 16, alignItems: 'center', marginTop: 24 },
  submitText: { fontSize: 16, fontWeight: 'bold', color: Colors.white },
});
