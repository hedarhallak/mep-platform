// §149 Batch C — Crews (list + member detail, read-only on mobile).
//   GET /api/crews        → { crews: [{id, name, foreman_name, trade_code, is_active, member_count}] }
//   GET /api/crews/:id    → { crew: { ...members } }
// (Create / deploy stay on the web for now — managed there.)

import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, ActivityIndicator, ScrollView, RefreshControl,
  TouchableOpacity, Modal,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { apiClient } from '../../api/client';
import Colors from '../../theme/colors';

interface Crew {
  id: number; name: string; foreman_name?: string; trade_code?: string;
  is_active?: boolean; member_count?: number;
}
interface Member { employee_id?: number; full_name?: string; name?: string; trade_code?: string; role?: string; }

export default function CrewsScreen() {
  const { t } = useTranslation();
  const [crews, setCrews] = useState<Crew[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [detail, setDetail] = useState<{ crew: Crew; members: Member[] } | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

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

  const openDetail = async (crew: Crew) => {
    setDetail({ crew, members: [] });
    setDetailLoading(true);
    try {
      const r = await apiClient.get(`/api/crews/${crew.id}`);
      const c = r.data?.crew || {};
      setDetail({ crew, members: c.members || [] });
    } catch {
      setDetail({ crew, members: [] });
    } finally { setDetailLoading(false); }
  };

  if (loading) return <View style={s.center}><ActivityIndicator size="large" color={Colors.primary} /></View>;

  return (
    <View style={s.wrapper}>
      <ScrollView contentContainerStyle={s.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchData(true); }} tintColor={Colors.primary} />}>
        {crews.length === 0 ? (
          <View style={s.emptyCard}>
            <Ionicons name="people-outline" size={40} color={Colors.textLight} />
            <Text style={s.emptyText}>{t('crews.empty')}</Text>
          </View>
        ) : crews.map((c) => (
          <TouchableOpacity key={c.id} style={s.card} onPress={() => openDetail(c)} activeOpacity={0.7}>
            <View style={s.cardHead}>
              <Text style={s.name}>{c.name}</Text>
              {c.is_active === false && <View style={s.inactiveBadge}><Text style={s.inactiveText}>{t('crews.inactive')}</Text></View>}
            </View>
            {!!c.foreman_name && (
              <View style={s.row}><Ionicons name="person-outline" size={14} color={Colors.textLight} /><Text style={s.meta}>{c.foreman_name}</Text></View>
            )}
            <View style={s.row}>
              <Ionicons name="people-outline" size={14} color={Colors.textLight} />
              <Text style={s.meta}>{t('crews.memberCount', { count: c.member_count ?? 0 })}</Text>
              {!!c.trade_code && <Text style={s.tradeTag}>{c.trade_code}</Text>}
            </View>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Crew detail (members) */}
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
    </View>
  );
}

const s = StyleSheet.create({
  wrapper: { flex: 1, backgroundColor: Colors.background },
  content: { padding: 16, gap: 12, paddingBottom: 40 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: Colors.background },
  emptyCard: { backgroundColor: Colors.white, borderRadius: 16, padding: 30, alignItems: 'center', gap: 10, marginTop: 8 },
  emptyText: { fontSize: 14, color: Colors.textLight },
  card: { backgroundColor: Colors.white, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: Colors.divider },
  cardHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  name: { fontSize: 16, fontWeight: '700', color: Colors.textPrimary, flex: 1 },
  inactiveBadge: { backgroundColor: Colors.background, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 2 },
  inactiveText: { fontSize: 10, color: Colors.textLight, fontWeight: '600' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 },
  meta: { fontSize: 13, color: Colors.textSecondary },
  tradeTag: { fontSize: 11, color: Colors.primary, fontWeight: '700', marginLeft: 6, backgroundColor: Colors.primaryPale, paddingHorizontal: 6, paddingVertical: 1, borderRadius: 6 },
  pickerHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, backgroundColor: Colors.white, borderBottomWidth: 1, borderBottomColor: Colors.divider },
  pickerTitle: { fontSize: 17, fontWeight: 'bold', color: Colors.primary },
  pickerSub: { fontSize: 12, color: Colors.textLight, marginTop: 2 },
  doneBtn: { backgroundColor: Colors.primary, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 7 },
  doneText: { fontSize: 14, fontWeight: '700', color: Colors.white },
  sectionTitle: { fontSize: 13, fontWeight: '700', color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 },
  memberRow: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: Colors.white, borderRadius: 12, padding: 12, marginBottom: 8, borderWidth: 1, borderColor: Colors.divider },
  avatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: Colors.primaryPale, justifyContent: 'center', alignItems: 'center' },
  avatarText: { fontSize: 14, fontWeight: '700', color: Colors.primary },
  memberName: { fontSize: 14, fontWeight: '600', color: Colors.textPrimary },
  memberMeta: { fontSize: 11, color: Colors.textLight, marginTop: 1 },
});
