// §149 Batch A — Purchase Orders (read-only list, mobile).
// GET /api/materials/purchase-orders → { purchase_orders: [...] }
// Admins see all; a foreman sees only their own (backend-scoped).

import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, ActivityIndicator, ScrollView, RefreshControl, TouchableOpacity,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { apiClient } from '../../api/client';
import Colors from '../../theme/colors';

interface PO {
  id: number;
  ref: string;
  sent_at: string;
  note?: string;
  is_procurement: boolean;
  items: any;
  project_code: string;
  project_name: string;
  foreman_name?: string;
  supplier_name?: string;
}

function fmtDate(iso?: string) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' });
}
function itemCount(items: any) {
  if (Array.isArray(items)) return items.length;
  try { const p = JSON.parse(items); return Array.isArray(p) ? p.length : 0; } catch { return 0; }
}

export default function PurchaseOrdersScreen() {
  const { t } = useTranslation();
  const [orders, setOrders] = useState<PO[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchData = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const r = await apiClient.get('/api/materials/purchase-orders');
      setOrders(r.data?.purchase_orders || []);
    } catch {
      setOrders([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  if (loading) return <View style={s.center}><ActivityIndicator size="large" color={Colors.primary} /></View>;

  return (
    <ScrollView
      style={s.wrapper}
      contentContainerStyle={s.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchData(true); }} tintColor={Colors.primary} />}
    >
      {orders.length === 0 ? (
        <View style={s.emptyCard}>
          <Ionicons name="document-text-outline" size={40} color={Colors.textLight} />
          <Text style={s.emptyText}>{t('purchaseOrders.empty')}</Text>
        </View>
      ) : (
        orders.map((po) => (
          <View key={po.id} style={s.card}>
            <View style={s.cardHead}>
              <View style={s.refBadge}><Text style={s.refText}>{po.ref}</Text></View>
              <Text style={s.date}>{fmtDate(po.sent_at)}</Text>
            </View>
            <Text style={s.project}>{po.project_name}</Text>
            <Text style={s.projectCode}>{po.project_code}</Text>
            <View style={s.row}>
              <Ionicons name="business-outline" size={14} color={Colors.textLight} />
              <Text style={s.meta}>
                {po.is_procurement ? t('purchaseOrders.procurement') : (po.supplier_name || '—')}
              </Text>
            </View>
            {!!po.foreman_name && (
              <View style={s.row}>
                <Ionicons name="person-outline" size={14} color={Colors.textLight} />
                <Text style={s.meta}>{po.foreman_name}</Text>
              </View>
            )}
            <View style={s.row}>
              <Ionicons name="cube-outline" size={14} color={Colors.textLight} />
              <Text style={s.meta}>{t('purchaseOrders.itemsCount', { count: itemCount(po.items) })}</Text>
            </View>
          </View>
        ))
      )}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  wrapper: { flex: 1, backgroundColor: Colors.background },
  content: { padding: 16, gap: 12, paddingBottom: 40 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: Colors.background },
  emptyCard: { backgroundColor: Colors.white, borderRadius: 16, padding: 40, alignItems: 'center', gap: 12, marginTop: 8 },
  emptyText: { fontSize: 15, color: Colors.textLight },
  card: { backgroundColor: Colors.white, borderRadius: 14, padding: 14, gap: 4, borderWidth: 1, borderColor: Colors.divider },
  cardHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 },
  refBadge: { backgroundColor: Colors.primaryPale, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  refText: { fontSize: 12, fontWeight: '700', color: Colors.primary },
  date: { fontSize: 11, color: Colors.textLight },
  project: { fontSize: 15, fontWeight: '600', color: Colors.textPrimary },
  projectCode: { fontSize: 11, color: Colors.textLight, marginBottom: 4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 },
  meta: { fontSize: 13, color: Colors.textSecondary },
});
