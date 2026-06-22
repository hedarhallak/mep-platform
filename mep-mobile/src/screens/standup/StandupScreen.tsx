// §149 Batch D — Standup (foreman, mobile).
// Tomorrow's projects with the approved WORKER roster, the tomorrow material
// request (read), and a "mark standup done" action. Mirrors web StandupPage.
//   GET  /api/standup/tomorrow                  → { date, projects: [{id, project_code, project_name, site_address, team, material_request, session}] }
//   POST /api/standup/session                   { project_id }      → { session: { id, ... } }
//   POST /api/standup/session/:id/complete      { note? }           → { session: { status: 'COMPLETED', ... } }
// All gated by standup.manage; backend scopes projects to the foreman.

import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, ActivityIndicator, ScrollView, RefreshControl,
  TouchableOpacity, Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { apiClient } from '../../api/client';
import Colors from '../../theme/colors';

interface TeamMember {
  employee_id: number; first_name: string; last_name: string;
  employee_code: string; trade_code: string | null; trade_name: string | null; shift: string | null;
}
interface MatItem { id: number; item_name: string; quantity: number; unit: string; note: string | null; }
interface MaterialRequest { id: number; status: string; note: string | null; items: MatItem[] | null; }
interface Session { id: number; status: string; note: string | null; completed_at: string | null; }
interface StandupProject {
  id: number; project_code: string; project_name: string; site_address: string | null;
  standup_date: string; team: TeamMember[]; material_request: MaterialRequest | null; session: Session | null;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function fmtLongDate(iso: string) {
  const d = new Date(iso + 'T00:00:00');
  return `${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

export default function StandupScreen() {
  const { t } = useTranslation();
  const [date, setDate] = useState('');
  const [projects, setProjects] = useState<StandupProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);

  const fetchData = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const r = await apiClient.get('/api/standup/tomorrow');
      setDate(r.data?.date || '');
      setProjects(r.data?.projects || []);
    } catch {
      setProjects([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const complete = async (proj: StandupProject) => {
    setBusyId(proj.id);
    try {
      let sessionId = proj.session?.id;
      if (!sessionId) {
        const r = await apiClient.post('/api/standup/session', { project_id: proj.id });
        sessionId = r.data?.session?.id;
      }
      if (!sessionId) throw new Error('no session');
      await apiClient.post(`/api/standup/session/${sessionId}/complete`, { note: null });
      setProjects((p) => p.map((x) => x.id === proj.id
        ? { ...x, session: { id: sessionId!, status: 'COMPLETED', note: null, completed_at: new Date().toISOString() } }
        : x));
    } catch (e: any) {
      Alert.alert(t('common.error'), e.response?.data?.error || t('standup.completeFailed'));
    } finally {
      setBusyId(null);
    }
  };

  if (loading) return <View style={s.center}><ActivityIndicator size="large" color={Colors.primary} /></View>;

  return (
    <View style={s.wrapper}>
      <ScrollView
        contentContainerStyle={s.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchData(true); }} tintColor={Colors.primary} />}
      >
        {/* Tomorrow banner */}
        <View style={s.dateBanner}>
          <Ionicons name="sunny-outline" size={18} color={Colors.primary} />
          <Text style={s.dateBannerText}>{t('standup.tomorrow')}{date ? ` · ${fmtLongDate(date)}` : ''}</Text>
        </View>

        {projects.length === 0 ? (
          <View style={s.emptyCard}>
            <Ionicons name="cafe-outline" size={40} color={Colors.textLight} />
            <Text style={s.emptyText}>{t('standup.empty')}</Text>
          </View>
        ) : (
          projects.map((proj) => {
            const busy = busyId === proj.id;
            const done = proj.session?.status === 'COMPLETED';
            const items = proj.material_request?.items || [];
            return (
              <View key={proj.id} style={s.card}>
                {/* Header */}
                <View style={s.cardHeader}>
                  <View style={{ flex: 1 }}>
                    <Text style={s.projName}>{proj.project_name}</Text>
                    <Text style={s.projCode}>{proj.project_code}</Text>
                  </View>
                  {done && (
                    <View style={s.doneBadge}>
                      <Ionicons name="checkmark-done" size={13} color={Colors.success} />
                      <Text style={s.doneBadgeText}>{t('standup.completed')}</Text>
                    </View>
                  )}
                </View>
                {!!proj.site_address && (
                  <View style={s.metaRow}>
                    <Ionicons name="location-outline" size={13} color={Colors.textLight} />
                    <Text style={s.meta}>{proj.site_address}</Text>
                  </View>
                )}

                {/* Team */}
                <Text style={s.sectionLabel}>{t('standup.team')} ({proj.team.length})</Text>
                {proj.team.length === 0 ? (
                  <Text style={s.muted}>{t('standup.noTeam')}</Text>
                ) : (
                  proj.team.map((m) => (
                    <View key={m.employee_id} style={s.memberRow}>
                      <View style={s.avatar}><Text style={s.avatarText}>{m.first_name?.[0]}{m.last_name?.[0]}</Text></View>
                      <View style={{ flex: 1 }}>
                        <Text style={s.memberName}>{m.first_name} {m.last_name}</Text>
                        <Text style={s.memberTrade}>{m.trade_name || m.trade_code || t('submitRequest.general')}</Text>
                      </View>
                      {!!m.shift && m.shift !== '-' && <Text style={s.shift}>{m.shift}</Text>}
                    </View>
                  ))
                )}

                {/* Materials */}
                <Text style={s.sectionLabel}>{t('standup.materials')}</Text>
                {items.length === 0 ? (
                  <Text style={s.muted}>{t('standup.noMaterials')}</Text>
                ) : (
                  <View style={s.matBox}>
                    {items.map((it) => (
                      <View key={it.id} style={s.matRow}>
                        <View style={s.matDot} />
                        <Text style={s.matName}>{it.item_name}</Text>
                        <Text style={s.matQty}>{it.quantity} {it.unit}</Text>
                      </View>
                    ))}
                  </View>
                )}

                {/* Complete */}
                {!done && (
                  <TouchableOpacity style={[s.completeBtn, busy && { opacity: 0.6 }]} disabled={busy} onPress={() => complete(proj)}>
                    {busy ? <ActivityIndicator color={Colors.white} size="small" /> : <>
                      <Ionicons name="checkmark-done-outline" size={18} color={Colors.white} />
                      <Text style={s.completeText}>{t('standup.markComplete')}</Text>
                    </>}
                  </TouchableOpacity>
                )}
              </View>
            );
          })
        )}
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  wrapper: { flex: 1, backgroundColor: Colors.background },
  content: { padding: 16, gap: 12, paddingBottom: 40 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: Colors.background },
  dateBanner: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: Colors.primaryPale, borderRadius: 12, padding: 12 },
  dateBannerText: { fontSize: 14, fontWeight: '700', color: Colors.primary },
  emptyCard: { backgroundColor: Colors.white, borderRadius: 16, padding: 40, alignItems: 'center', gap: 12, marginTop: 8 },
  emptyText: { fontSize: 15, color: Colors.textLight, textAlign: 'center' },
  card: { backgroundColor: Colors.white, borderRadius: 14, padding: 14, shadowColor: Colors.shadowColor, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 6, elevation: 2 },
  cardHeader: { flexDirection: 'row', alignItems: 'center' },
  projName: { fontSize: 16, fontWeight: '700', color: Colors.textPrimary },
  projCode: { fontSize: 12, color: Colors.textLight, marginTop: 1 },
  doneBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: Colors.successBg, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3 },
  doneBadgeText: { fontSize: 11, fontWeight: '700', color: Colors.success },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 },
  meta: { fontSize: 13, color: Colors.textSecondary, flex: 1 },
  sectionLabel: { fontSize: 12, fontWeight: '700', color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 14, marginBottom: 6 },
  muted: { fontSize: 13, color: Colors.textLight, fontStyle: 'italic' },
  memberRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6 },
  avatar: { width: 34, height: 34, borderRadius: 17, backgroundColor: '#e8f0fe', justifyContent: 'center', alignItems: 'center' },
  avatarText: { fontSize: 12, fontWeight: '700', color: Colors.primary },
  memberName: { fontSize: 14, fontWeight: '600', color: Colors.textPrimary },
  memberTrade: { fontSize: 11, color: Colors.textLight, marginTop: 1 },
  shift: { fontSize: 12, color: Colors.textSecondary, fontWeight: '600' },
  matBox: { backgroundColor: Colors.inputBg, borderRadius: 10, padding: 10, gap: 6 },
  matRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  matDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: Colors.primary },
  matName: { flex: 1, fontSize: 13, color: Colors.textSecondary },
  matQty: { fontSize: 13, color: Colors.textMuted, fontWeight: '600' },
  completeBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: Colors.success, borderRadius: 12, padding: 14, marginTop: 14 },
  completeText: { fontSize: 15, fontWeight: 'bold', color: Colors.white },
});
