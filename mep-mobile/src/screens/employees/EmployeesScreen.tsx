// §149 Batch D — Employees (list + invite, mobile). Mirrors web EmployeesPage.
//   GET  /api/employees                 → { employees: [{id, first_name, last_name, email, role, trade_name, is_active, employee_code}] }
//   POST /api/invite-employee  { first_name, last_name, email, role, trade_type_id? } → { ok, invite_url, email_sent }
//   GET  /api/projects/meta             → { trade_types: [{id,code,name}] }
// View gated by employees.view; the invite button by employees.invite.

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

interface Employee {
  id: number; employee_code: string; first_name: string; last_name: string;
  email: string | null; role: string; trade_name: string | null; is_active: boolean;
}
interface TradeType { id: number; code: string; name: string; }

const INVITE_ROLES = ['WORKER', 'FOREMAN', 'JOURNEYMAN', 'TRADE_ADMIN', 'TRADE_PROJECT_MANAGER'];

export default function EmployeesScreen() {
  const { t } = useTranslation();
  const canInvite = usePermsStore((s) => s.can('employees', 'invite'));
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [trades, setTrades] = useState<TradeType[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ first_name: '', last_name: '', email: '', role: 'WORKER', trade_type_id: '' });

  const fetchData = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const r = await apiClient.get('/api/employees');
      setEmployees(r.data?.employees || []);
    } catch {
      setEmployees([]);
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
    setForm({ first_name: '', last_name: '', email: '', role: 'WORKER', trade_type_id: '' });
    setShowForm(true);
  };

  const submit = async () => {
    if (!form.first_name.trim()) return Alert.alert(t('common.error'), t('employees.firstNameRequired'));
    if (!form.last_name.trim()) return Alert.alert(t('common.error'), t('employees.lastNameRequired'));
    if (!form.email.trim()) return Alert.alert(t('common.error'), t('employees.emailRequired'));
    setSaving(true);
    try {
      const r = await apiClient.post('/api/invite-employee', {
        first_name: form.first_name.trim(),
        last_name: form.last_name.trim(),
        email: form.email.trim(),
        role: form.role,
        trade_type_id: form.trade_type_id ? Number(form.trade_type_id) : undefined,
      });
      setShowForm(false);
      fetchData(true);
      if (r.data?.email_sent) {
        Alert.alert(t('common.success'), t('employees.invited'));
      } else {
        Alert.alert(t('employees.invited'), t('employees.inviteNoEmail', { url: r.data?.invite_url || '' }));
      }
    } catch (e: any) {
      Alert.alert(t('common.error'), e.response?.data?.error || t('employees.saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  const filtered = search.trim()
    ? employees.filter((e) => `${e.first_name} ${e.last_name} ${e.email || ''}`.toLowerCase().includes(search.toLowerCase()))
    : employees;

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
            <Ionicons name="people-outline" size={40} color={Colors.textLight} />
            <Text style={s.emptyText}>{t('employees.empty')}</Text>
          </View>
        ) : (
          filtered.map((e) => (
            <View key={e.id} style={s.card}>
              <View style={s.avatar}><Text style={s.avatarText}>{e.first_name?.[0]}{e.last_name?.[0]}</Text></View>
              <View style={{ flex: 1 }}>
                <Text style={s.name}>{e.first_name} {e.last_name}</Text>
                <View style={s.subRow}>
                  <View style={s.roleBadge}><Text style={s.roleBadgeText}>{t(`roles.${e.role}`, { defaultValue: e.role })}</Text></View>
                  {!!e.trade_name && <Text style={s.trade}>{e.trade_name}</Text>}
                </View>
                {!!e.email && <Text style={s.email}>{e.email}</Text>}
              </View>
              {!e.is_active && <View style={s.inactiveBadge}><Text style={s.inactiveText}>{t('crews.inactive')}</Text></View>}
            </View>
          ))
        )}
      </ScrollView>

      {canInvite && (
        <TouchableOpacity style={s.fab} onPress={openForm} activeOpacity={0.85}>
          <Ionicons name="person-add" size={24} color={Colors.white} />
        </TouchableOpacity>
      )}

      {/* Invite modal */}
      <Modal visible={showForm} animationType="slide" presentationStyle="pageSheet">
        <KeyboardAvoidingView style={s.wrapper} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={s.modalHeader}>
            <Text style={s.modalTitle}>{t('employees.invite')}</Text>
            <TouchableOpacity onPress={() => setShowForm(false)}><Ionicons name="close" size={24} color={Colors.textSecondary} /></TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={s.formContent} keyboardShouldPersistTaps="handled">
            <Text style={s.label}>{t('employees.firstName')} *</Text>
            <TextInput style={s.input} value={form.first_name} onChangeText={(v) => set('first_name', v)} placeholder={t('employees.firstName')} placeholderTextColor="#9ca3af" />
            <Text style={s.label}>{t('employees.lastName')} *</Text>
            <TextInput style={s.input} value={form.last_name} onChangeText={(v) => set('last_name', v)} placeholder={t('employees.lastName')} placeholderTextColor="#9ca3af" />
            <Text style={s.label}>{t('profile.email')} *</Text>
            <TextInput style={s.input} value={form.email} onChangeText={(v) => set('email', v)} placeholder={t('profile.email')} placeholderTextColor="#9ca3af" keyboardType="email-address" autoCapitalize="none" />

            <Text style={s.label}>{t('profile.role')}</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 4 }}>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                {INVITE_ROLES.map((r) => (
                  <TouchableOpacity key={r} style={[s.tChip, form.role === r && s.tChipSel]} onPress={() => set('role', r)}>
                    <Text style={[s.tChipText, form.role === r && s.tChipTextSel]}>{t(`roles.${r}`, { defaultValue: r })}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>

            <Text style={s.label}>{t('projectStaffing.trade')}</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 4 }}>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <TouchableOpacity style={[s.tChip, form.trade_type_id === '' && s.tChipSel]} onPress={() => set('trade_type_id', '')}>
                  <Text style={[s.tChipText, form.trade_type_id === '' && s.tChipTextSel]}>{t('submitRequest.general')}</Text>
                </TouchableOpacity>
                {trades.map((tr) => (
                  <TouchableOpacity key={tr.id} style={[s.tChip, form.trade_type_id === String(tr.id) && s.tChipSel]} onPress={() => set('trade_type_id', String(tr.id))}>
                    <Text style={[s.tChipText, form.trade_type_id === String(tr.id) && s.tChipTextSel]}>{tr.name}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>

            <Text style={s.hint}>{t('employees.inviteHint')}</Text>

            <TouchableOpacity style={[s.submitBtn, saving && { opacity: 0.6 }]} onPress={submit} disabled={saving}>
              {saving ? <ActivityIndicator color={Colors.white} /> : <Text style={s.submitText}>{t('employees.sendInvite')}</Text>}
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
  card: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: Colors.white, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: Colors.divider },
  avatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#e8f0fe', justifyContent: 'center', alignItems: 'center' },
  avatarText: { fontSize: 15, fontWeight: '700', color: Colors.primary },
  name: { fontSize: 15, fontWeight: '700', color: Colors.textPrimary },
  subRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 3 },
  roleBadge: { backgroundColor: Colors.primaryPale, borderRadius: 8, paddingHorizontal: 7, paddingVertical: 2 },
  roleBadgeText: { fontSize: 11, fontWeight: '700', color: Colors.primary },
  trade: { fontSize: 12, color: Colors.textLight },
  email: { fontSize: 12, color: Colors.textSecondary, marginTop: 3 },
  inactiveBadge: { backgroundColor: Colors.dangerBg, borderRadius: 8, paddingHorizontal: 7, paddingVertical: 2 },
  inactiveText: { fontSize: 10, fontWeight: '700', color: Colors.danger },
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
  hint: { fontSize: 12, color: Colors.textLight, marginTop: 16, lineHeight: 17 },
  submitBtn: { flexDirection: 'row', justifyContent: 'center', backgroundColor: Colors.primary, borderRadius: 12, padding: 16, alignItems: 'center', marginTop: 16 },
  submitText: { fontSize: 16, fontWeight: 'bold', color: Colors.white },
});
