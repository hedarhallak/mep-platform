// §149 Batch A — Pending Requests (dispatcher review, mobile).
// GET   /api/assignments/requests?status=PENDING  → { requests: [...] }
// PATCH /api/assignments/requests/:id/approve
// PATCH /api/assignments/requests/:id/reject  { reason }
// Trade-scoped by the backend (a trade reviewer sees only their specialty).

import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, ActivityIndicator, ScrollView, RefreshControl,
  TouchableOpacity, Modal, TextInput, Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { apiClient } from '../../api/client';
import Colors from '../../theme/colors';

interface Req {
  id: number;
  start_date: string;
  end_date: string;
  shift_start?: string;
  shift_end?: string;
  project_code: string;
  project_name: string;
  employee_name: string;
  employee_trade?: string;
  requested_by_name?: string;
}

function fmtDate(iso?: string) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('en-CA', { month: 'short', day: 'numeric' });
}

export default function PendingRequestsScreen() {
  const { t } = useTranslation();
  const [reqs, setReqs] = useState<Req[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [rejectFor, setRejectFor] = useState<Req | null>(null);
  const [reason, setReason] = useState('');

  const fetchData = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const r = await apiClient.get('/api/assignments/requests?status=PENDING');
      setReqs(r.data?.requests || []);
    } catch {
      setReqs([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const approve = async (id: number) => {
    setBusyId(id);
    try {
      await apiClient.patch(`/api/assignments/requests/${id}/approve`);
      setReqs((p) => p.filter((r) => r.id !== id));
    } catch (e: any) {
      Alert.alert(t('common.error'), e.response?.data?.error || t('pendingRequests.actionFailed'));
    } finally { setBusyId(null); }
  };

  const doReject = async () => {
    if (!rejectFor) return;
    const id = rejectFor.id;
    setBusyId(id);
    try {
      await apiClient.patch(`/api/assignments/requests/${id}/reject`, { reason: reason.trim() || null });
      setReqs((p) => p.filter((r) => r.id !== id));
      setRejectFor(null);
      setReason('');
    } catch (e: any) {
      Alert.alert(t('common.error'), e.response?.data?.error || t('pendingRequests.actionFailed'));
    } finally { setBusyId(null); }
  };

  if (loading) return <View style={s.center}><ActivityIndicator size="large" color={Colors.primary} /></View>;

  return (
    <View style={s.wrapper}>
      <ScrollView
        contentContainerStyle={s.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchData(true); }} tintColor={Colors.primary} />}
      >
        {reqs.length === 0 ? (
          <View style={s.emptyCard}>
            <Ionicons name="checkmark-done-outline" size={40} color={Colors.textLight} />
            <Text style={s.emptyText}>{t('pendingRequests.empty')}</Text>
          </View>
        ) : (
          reqs.map((r) => {
            const busy = busyId === r.id;
            return (
              <View key={r.id} style={s.card}>
                <Text style={s.name}>{r.employee_name}</Text>
                <Text style={s.trade}>{r.employee_trade || ''}</Text>
                <View style={s.metaRow}>
                  <Ionicons name="briefcase-outline" size={14} color={Colors.textLight} />
                  <Text style={s.meta}>{r.project_name} · {r.project_code}</Text>
                </View>
                <View style={s.metaRow}>
                  <Ionicons name="calendar-outline" size={14} color={Colors.textLight} />
                  <Text style={s.meta}>{fmtDate(r.start_date)}{r.end_date && r.end_date !== r.start_date ? ` → ${fmtDate(r.end_date)}` : ''}</Text>
                </View>
                {!!r.requested_by_name && (
                  <Text style={s.requestedBy}>{t('pendingRequests.requestedBy', { name: r.requested_by_name })}</Text>
                )}
                <View style={s.actions}>
                  <TouchableOpacity style={[s.rejectBtn, busy && { opacity: 0.5 }]} disabled={busy}
                    onPress={() => { setReason(''); setRejectFor(r); }}>
                    <Ionicons name="close" size={16} color={Colors.danger} />
                    <Text style={s.rejectText}>{t('pendingRequests.reject')}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[s.approveBtn, busy && { opacity: 0.5 }]} disabled={busy} onPress={() => approve(r.id)}>
                    {busy ? <ActivityIndicator color={Colors.white} size="small" /> : <>
                      <Ionicons name="checkmark" size={16} color={Colors.white} />
                      <Text style={s.approveText}>{t('pendingRequests.approve')}</Text>
                    </>}
                  </TouchableOpacity>
                </View>
              </View>
            );
          })
        )}
      </ScrollView>

      {/* Reject reason modal */}
      <Modal visible={!!rejectFor} transparent animationType="fade">
        <View style={s.overlay}>
          <View style={s.modalCard}>
            <Text style={s.modalTitle}>{t('pendingRequests.rejectTitle')}</Text>
            <Text style={s.modalSub}>{rejectFor?.employee_name}</Text>
            <TextInput
              style={s.input}
              placeholder={t('pendingRequests.reasonPlaceholder')}
              placeholderTextColor="#9ca3af"
              value={reason}
              onChangeText={setReason}
              multiline
            />
            <View style={s.modalActions}>
              <TouchableOpacity style={s.cancelBtn} onPress={() => setRejectFor(null)}>
                <Text style={s.cancelText}>{t('common.cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.confirmReject} onPress={doReject}>
                <Text style={s.confirmRejectText}>{t('pendingRequests.reject')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  wrapper: { flex: 1, backgroundColor: Colors.background },
  content: { padding: 16, gap: 12, paddingBottom: 40 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: Colors.background },
  emptyCard: { backgroundColor: Colors.white, borderRadius: 16, padding: 40, alignItems: 'center', gap: 12, marginTop: 8 },
  emptyText: { fontSize: 15, color: Colors.textLight },
  card: { backgroundColor: Colors.white, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: Colors.divider },
  name: { fontSize: 16, fontWeight: '700', color: Colors.textPrimary },
  trade: { fontSize: 12, color: Colors.textLight, marginBottom: 6 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 },
  meta: { fontSize: 13, color: Colors.textSecondary },
  requestedBy: { fontSize: 12, color: Colors.textLight, marginTop: 6, fontStyle: 'italic' },
  actions: { flexDirection: 'row', gap: 10, marginTop: 12 },
  rejectBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 11, borderRadius: 10, borderWidth: 1, borderColor: Colors.danger },
  rejectText: { fontSize: 14, fontWeight: '600', color: Colors.danger },
  approveBtn: { flex: 2, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 11, borderRadius: 10, backgroundColor: Colors.primary },
  approveText: { fontSize: 14, fontWeight: 'bold', color: Colors.white },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 24 },
  modalCard: { backgroundColor: Colors.white, borderRadius: 18, padding: 20 },
  modalTitle: { fontSize: 16, fontWeight: '700', color: Colors.primary },
  modalSub: { fontSize: 13, color: Colors.textLight, marginTop: 2, marginBottom: 12 },
  input: { backgroundColor: Colors.inputBg, borderRadius: 10, borderWidth: 1, borderColor: Colors.divider, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: Colors.textPrimary, height: 80, textAlignVertical: 'top' },
  modalActions: { flexDirection: 'row', gap: 10, marginTop: 16 },
  cancelBtn: { flex: 1, paddingVertical: 12, borderRadius: 10, backgroundColor: Colors.background, alignItems: 'center' },
  cancelText: { fontSize: 14, fontWeight: '600', color: Colors.textSecondary },
  confirmReject: { flex: 1, paddingVertical: 12, borderRadius: 10, backgroundColor: Colors.danger, alignItems: 'center' },
  confirmRejectText: { fontSize: 14, fontWeight: 'bold', color: Colors.white },
});
