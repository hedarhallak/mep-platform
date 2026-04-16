import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { apiClient } from '../../api/client';
import Colors from '../../theme/colors';

interface RequestItem {
  id: number;
  item_name: string;
  quantity: number;
  unit: string;
  note: string | null;
}

interface MaterialRequest {
  id: number;
  status: string;
  note: string | null;
  created_at: string;
  project_name: string;
  project_code: string;
  items: RequestItem[];
}

function fmtDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' }) +
    ' ' + d.toLocaleTimeString('en-CA', { hour: '2-digit', minute: '2-digit', hour12: false });
}

function getDisplayStatus(status: string): { label: string; color: string; icon: any } {
  switch (status) {
    case 'PENDING':
      return { label: 'Pending', color: '#f59e0b', icon: 'time-outline' };
    case 'REVIEWED':
    case 'MERGED':
    case 'SENT':
      return { label: 'Viewed', color: '#16a34a', icon: 'eye-outline' };
    default:
      return { label: status, color: '#6b7280', icon: 'ellipse-outline' };
  }
}

const TABS = [
  { key: 'ALL', label: 'Sent' },
  { key: 'PENDING', label: 'Pending' },
  { key: 'VIEWED', label: 'Viewed' },
];

export default function MyRequestsScreen() {
  const { t } = useTranslation();
  const [requests, setRequests] = useState<MaterialRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState('ALL');
  const [expanded, setExpanded] = useState<number | null>(null);

  const fetchRequests = useCallback(async () => {
    try {
      const res = await apiClient.get('/api/materials/requests');
      setRequests(res.data?.requests || []);
    } catch {
      setRequests([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchRequests();
  }, [fetchRequests]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchRequests();
  };

  const isViewed = (status: string) => ['REVIEWED', 'MERGED', 'SENT'].includes(status);

  const filtered = requests.filter(r => {
    if (activeTab === 'ALL') return true;
    if (activeTab === 'PENDING') return r.status === 'PENDING';
    if (activeTab === 'VIEWED') return isViewed(r.status);
    return true;
  });

  const counts = {
    ALL: requests.length,
    PENDING: requests.filter(r => r.status === 'PENDING').length,
    VIEWED: requests.filter(r => isViewed(r.status)).length,
  };

  if (loading) {
    return <View style={styles.center}><ActivityIndicator size="large" color={Colors.primary} /></View>;
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}
    >
      <View style={styles.tabsRow}>
        {TABS.map(tab => (
          <TouchableOpacity
            key={tab.key}
            style={[styles.tab, activeTab === tab.key && styles.tabActive]}
            onPress={() => setActiveTab(tab.key)}
          >
            <Text style={[styles.tabText, activeTab === tab.key && styles.tabTextActive]}>
              {tab.label}
            </Text>
            <View style={[styles.tabBadge, activeTab === tab.key && styles.tabBadgeActive]}>
              <Text style={[styles.tabBadgeText, activeTab === tab.key && styles.tabBadgeTextActive]}>
                {counts[tab.key as keyof typeof counts]}
              </Text>
            </View>
          </TouchableOpacity>
        ))}
      </View>

      {filtered.length === 0 ? (
        <View style={styles.emptyCard}>
          <Ionicons name="cube-outline" size={40} color="#d1d5db" />
          <Text style={styles.emptyText}>No requests found</Text>
        </View>
      ) : (
        filtered.map(req => {
          const display = getDisplayStatus(req.status);
          return (
            <TouchableOpacity
              key={req.id}
              style={styles.requestCard}
              onPress={() => setExpanded(expanded === req.id ? null : req.id)}
              activeOpacity={0.8}
            >
              <View style={styles.requestHeader}>
                <View style={styles.requestLeft}>
                  <Text style={styles.requestId}>Request #{req.id}</Text>
                  <Text style={styles.requestProject}>{req.project_name}</Text>
                  <Text style={styles.requestDate}>{fmtDate(req.created_at)}</Text>
                </View>
                <View style={styles.requestRight}>
                  <View style={[styles.statusBadge, { backgroundColor: display.color + '20' }]}>
                    <Ionicons name={display.icon} size={13} color={display.color} />
                    <Text style={[styles.statusText, { color: display.color }]}>{display.label}</Text>
                  </View>
                  <Ionicons
                    name={expanded === req.id ? 'chevron-up' : 'chevron-down'}
                    size={16} color={Colors.textLight}
                    style={{ marginTop: 8 }}
                  />
                </View>
              </View>

              <View style={styles.itemsSummary}>
                <Ionicons name="cube-outline" size={14} color={Colors.textMuted} />
                <Text style={styles.itemsCount}>
                  {req.items?.length || 0} item{(req.items?.length || 0) !== 1 ? 's' : ''}
                </Text>
              </View>

              {expanded === req.id && (
                <View style={styles.itemsList}>
                  <Text style={styles.itemsHeaderText}>Items</Text>
                  {(req.items || []).map((item, i) => (
                    <View key={i} style={styles.itemRow}>
                      <View style={styles.itemDot} />
                      <Text style={styles.itemName}>{item.item_name}</Text>
                      <Text style={styles.itemQty}>{item.quantity} {item.unit}</Text>
                    </View>
                  ))}
                  {req.note && (
                    <View style={styles.noteRow}>
                      <Ionicons name="document-text-outline" size={14} color={Colors.textMuted} />
                      <Text style={styles.noteText}>{req.note}</Text>
                    </View>
                  )}
                </View>
              )}
            </TouchableOpacity>
          );
        })
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  content: { padding: 16, gap: 16, paddingBottom: 40 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  tabsRow: { flexDirection: 'row', gap: 8 },
  tab: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingVertical: 10, borderRadius: 12,
    backgroundColor: Colors.cardBg, borderWidth: 1, borderColor: Colors.divider,
  },
  tabActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  tabText: { fontSize: 13, color: Colors.textMuted, fontWeight: '600' },
  tabTextActive: { color: Colors.white },
  tabBadge: { backgroundColor: Colors.background, borderRadius: 10, minWidth: 20, height: 20, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 4 },
  tabBadgeActive: { backgroundColor: 'rgba(255,255,255,0.25)' },
  tabBadgeText: { fontSize: 11, color: Colors.textSecondary, fontWeight: '700' },
  tabBadgeTextActive: { color: Colors.white },

  emptyCard: { backgroundColor: Colors.cardBg, borderRadius: 16, padding: 40, alignItems: 'center', gap: 12 },
  emptyText: { fontSize: 15, color: Colors.textLight },

  requestCard: {
    backgroundColor: Colors.cardBg, borderRadius: 16, padding: 16,
    shadowColor: Colors.shadowColor, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 3,
  },
  requestHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  requestLeft: { flex: 1 },
  requestId: { fontSize: 15, fontWeight: 'bold', color: Colors.textPrimary },
  requestProject: { fontSize: 13, color: Colors.textMuted, marginTop: 2 },
  requestDate: { fontSize: 12, color: Colors.textLight, marginTop: 2 },
  requestRight: { alignItems: 'flex-end' },
  statusBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  statusText: { fontSize: 12, fontWeight: '700' },

  itemsSummary: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 10 },
  itemsCount: { fontSize: 13, color: Colors.textMuted },

  itemsList: { marginTop: 12, borderTopWidth: 1, borderTopColor: Colors.background, paddingTop: 12, gap: 8 },
  itemsHeaderText: { fontSize: 13, fontWeight: '600', color: Colors.textSecondary, marginBottom: 4 },
  itemRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  itemDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: Colors.primary },
  itemName: { flex: 1, fontSize: 14, color: Colors.textPrimary },
  itemQty: { fontSize: 13, color: Colors.textMuted, fontWeight: '500' },
  noteRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, backgroundColor: Colors.inputBg, borderRadius: 8, padding: 8, marginTop: 4 },
  noteText: { fontSize: 13, color: Colors.textSecondary, flex: 1 },
});
