import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  TextInput,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  ScrollView,
  RefreshControl,
  Modal,
  FlatList,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { apiClient } from '../../api/client';
import { useNavigation } from '@react-navigation/native';

// ------------------------------------------------------------------ types --

interface RequestItem {
  id: number;
  item_name: string;
  quantity: number;
  unit: string;
  note: string | null;
}

interface InboxRequest {
  id: number;
  status: string;
  note: string | null;
  created_at: string;
  project_id: number;
  project_code: string;
  project_name: string;
  requester_name: string | null;
  items: RequestItem[];
}

interface Supplier {
  id: number;
  name: string;
  email: string;
  phone: string;
  address: string | null;
  trade_code: string;
}

// --------------------------------------------------------------- helpers --

function fmtDateTime(iso: string): string {
  const d = new Date(iso);
  return (
    d.toLocaleDateString('en-CA', { month: 'short', day: 'numeric' }) +
    '  ' +
    d.toLocaleTimeString('en-CA', { hour: '2-digit', minute: '2-digit', hour12: false })
  );
}

// ================================================================ screen --

export default function ForemanMaterialsTab() {
  const navigation = useNavigation<any>();
  const [requests, setRequests]           = useState<InboxRequest[]>([]);
  const [suppliers, setSuppliers]         = useState<Supplier[]>([]);
  const [selectedIds, setSelectedIds]     = useState<Set<number>>(new Set());
  const [loading, setLoading]             = useState(true);
  const [refreshing, setRefreshing]       = useState(false);

  const [expandedId, setExpandedId]       = useState<number | null>(null);


  // -------------------------------------------------------- data fetching --

  const fetchAll = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const [inboxRes, suppRes] = await Promise.all([
        apiClient.get('/api/materials/inbox'),
        apiClient.get('/api/suppliers'),
      ]);
      setRequests(inboxRes.data?.requests || []);
      setSuppliers(suppRes.data?.suppliers || []);
    } catch {
      setRequests([]);
      setSuppliers([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const onRefresh = () => { setRefreshing(true); fetchAll(true); };

  // ---------------------------------------------------- selection helpers --

  const toggleRequest = (id: number) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };


  // ------------------------------------------------------- merged preview --

  const mergedItems = (() => {
    const map = new Map<string, { qty: number; unit: string }>();
    for (const req of requests.filter(r => selectedIds.has(r.id))) {
      for (const item of req.items || []) {
        const key = `${item.item_name.trim().toLowerCase()}||${item.unit}`;
        const ex = map.get(key);
        ex ? (ex.qty += Number(item.quantity)) : map.set(key, { qty: Number(item.quantity), unit: item.unit });
      }
    }
    return Array.from(map.entries()).map(([key, val]) => ({
      item_name: key.split('||')[0],
      qty: val.qty,
      unit: val.unit,
    }));
  })();

    // --------------------------------------------------------- action --

  const handleMergeEdit = () => {
    if (selectedIds.size === 0) {
      Alert.alert('No Requests Selected', 'Select at least one request.');
      return;
    }
    if (mergedItems.length === 0) {
      Alert.alert('No Items', 'Selected requests have no items.');
      return;
    }
    navigation.navigate('MergeEdit', {
      request_ids: Array.from(selectedIds),
      initialItems: mergedItems,
      suppliers,
    });
  };

  // ---------------------------------------------------------------- render --

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#1e3a5f" />
      </View>
    );
  }

  return (
    <>
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#1e3a5f" />}
      >
        {/* ---- SECTION 1: Worker Requests ---- */}
        <View style={styles.sectionRow}>
          <View style={styles.titleRow}>
            <Ionicons name="people-outline" size={17} color="#1e3a5f" />
            <Text style={styles.sectionTitle}>Worker Requests</Text>
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{requests.length}</Text>
            </View>
          </View>

          {requests.length > 0 && (
            <View style={styles.selectRow}>
              <TouchableOpacity onPress={() => setSelectedIds(new Set(requests.map(r => r.id)))}>
                <Text style={styles.selectAllText}>Select All</Text>
              </TouchableOpacity>
              {selectedIds.size > 0 && (
                <>
                  <Text style={styles.dot}>Â·</Text>
                  <TouchableOpacity onPress={() => setSelectedIds(new Set())}>
                    <Text style={styles.clearText}>Clear</Text>
                  </TouchableOpacity>
                </>
              )}
            </View>
          )}
        </View>

        {requests.length === 0 ? (
          <View style={styles.emptyCard}>
            <Ionicons name="checkmark-circle-outline" size={36} color="#d1d5db" />
            <Text style={styles.emptyText}>No pending requests</Text>
          </View>
        ) : (
          requests.map(req => {
            const checked  = selectedIds.has(req.id);
            const expanded = expandedId === req.id;
            return (
              <TouchableOpacity
                key={req.id}
                style={[styles.card, checked && styles.cardSelected]}
                onPress={() => toggleRequest(req.id)}
                activeOpacity={0.75}
              >
                <View style={styles.cardHeader}>
                  <View style={[styles.checkbox, checked && styles.checkboxOn]}>
                    {checked && <Ionicons name="checkmark" size={14} color="#fff" />}
                  </View>

                  <View style={styles.cardInfo}>
                    <Text style={styles.cardProject}>{req.project_name}</Text>
                    <Text style={styles.cardMeta}>
                      {req.requester_name ?? 'Worker'}
                      {req.created_at ? `  Â·  ${fmtDateTime(req.created_at)}` : ''}
                    </Text>
                    <Text style={styles.cardItemCount}>
                      {(req.items || []).length} item{(req.items || []).length !== 1 ? 's' : ''}
                    </Text>
                  </View>

                  <TouchableOpacity
                    style={styles.expandBtn}
                    onPress={() => setExpandedId(expanded ? null : req.id)}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  >
                    <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={18} color="#9ca3af" />
                  </TouchableOpacity>
                </View>

                {expanded && (
                  <View style={styles.itemsList}>
                    {(req.items || []).map((item, i) => (
                      <View key={i} style={styles.itemRow}>
                        <View style={styles.itemDot} />
                        <Text style={styles.itemName}>{item.item_name}</Text>
                        <Text style={styles.itemQty}>{item.quantity} {item.unit}</Text>
                      </View>
                    ))}
                    {req.note ? (
                      <View style={styles.noteRow}>
                        <Ionicons name="document-text-outline" size={13} color="#9ca3af" />
                        <Text style={styles.noteText}>{req.note}</Text>
                      </View>
                    ) : null}
                  </View>
                )}
              </TouchableOpacity>
            );
          })
        )}

        {/* ---- SECTION 2: Merged Preview + Destination ---- */}
        {selectedIds.size > 0 && (
          <>
            <View style={[styles.titleRow, { marginTop: 8 }]}>
              <Ionicons name="git-merge-outline" size={17} color="#1e3a5f" />
              <Text style={styles.sectionTitle}>Merged Preview</Text>
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{mergedItems.length} items</Text>
              </View>
            </View>

            <View style={styles.mergedCard}>
              {mergedItems.map((item, i) => (
                <View key={i} style={[styles.mergedRow, i > 0 && styles.mergedBorder]}>
                  <Text style={styles.mergedName}>{item.item_name}</Text>
                  <Text style={styles.mergedQty}>{item.qty} {item.unit}</Text>
                </View>
              ))}
            </View>


            {/* Merge & Edit Button */}
            <TouchableOpacity
              style={[styles.mergeEditBtn, mergedItems.length === 0 && { opacity: 0.4 }]}
              onPress={handleMergeEdit}
              disabled={mergedItems.length === 0}
            >
              <Ionicons name="create-outline" size={20} color="#fff" />
              <Text style={styles.mergeEditText}>
                Merge & Edit ({mergedItems.length} items)
              </Text>
            </TouchableOpacity>
          </>
        )}
      </ScrollView>


    </>
  );
}

// ------------------------------------------------------------------ styles --

const S = StyleSheet;

const styles = S.create({
  container:   { flex: 1, backgroundColor: '#f3f4f6' },
  content:     { padding: 16, gap: 12, paddingBottom: 48 },
  center:      { flex: 1, justifyContent: 'center', alignItems: 'center' },

  sectionRow:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  titleRow:    { flexDirection: 'row', alignItems: 'center', gap: 8 },
  sectionTitle:{ fontSize: 15, fontWeight: '700', color: '#111827' },
  badge:       { backgroundColor: '#eff6ff', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3 },
  badgeText:   { fontSize: 12, fontWeight: '700', color: '#1e3a5f' },

  selectRow:   { flexDirection: 'row', alignItems: 'center', gap: 6 },
  selectAllText:{ fontSize: 13, fontWeight: '600', color: '#1e3a5f' },
  dot:         { fontSize: 13, color: '#9ca3af' },
  clearText:   { fontSize: 13, fontWeight: '600', color: '#dc2626' },

  emptyCard:   { backgroundColor: '#fff', borderRadius: 14, padding: 32, alignItems: 'center', gap: 8 },
  emptyText:   { fontSize: 14, color: '#9ca3af' },

  card: {
    backgroundColor: '#fff', borderRadius: 14, overflow: 'hidden',
    borderWidth: 2, borderColor: 'transparent',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05, shadowRadius: 6, elevation: 2,
  },
  cardSelected:  { borderColor: '#1e3a5f' },
  cardHeader:    { flexDirection: 'row', alignItems: 'center', padding: 14, gap: 12 },
  checkbox:      { width: 24, height: 24, borderRadius: 6, borderWidth: 2, borderColor: '#d1d5db', justifyContent: 'center', alignItems: 'center', backgroundColor: '#f9fafb' },
  checkboxOn:    { backgroundColor: '#1e3a5f', borderColor: '#1e3a5f' },
  cardInfo:      { flex: 1 },
  cardProject:   { fontSize: 14, fontWeight: '700', color: '#111827' },
  cardMeta:      { fontSize: 12, color: '#9ca3af', marginTop: 2 },
  cardItemCount: { fontSize: 12, color: '#6b7280', marginTop: 3 },
  expandBtn:     { padding: 4 },

  itemsList:  { borderTopWidth: 1, borderTopColor: '#f3f4f6', paddingHorizontal: 14, paddingBottom: 12, gap: 8 },
  itemRow:    { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 2 },
  itemDot:    { width: 6, height: 6, borderRadius: 3, backgroundColor: '#1e3a5f' },
  itemName:   { flex: 1, fontSize: 13, color: '#374151' },
  itemQty:    { fontSize: 13, color: '#6b7280', fontWeight: '500' },
  noteRow:    { flexDirection: 'row', gap: 6, backgroundColor: '#f9fafb', borderRadius: 8, padding: 8, marginTop: 4 },
  noteText:   { fontSize: 12, color: '#6b7280', flex: 1 },

  mergedCard:   { backgroundColor: '#fff', borderRadius: 14, overflow: 'hidden', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 6, elevation: 2 },
  mergedRow:    { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12 },
  mergedBorder: { borderTopWidth: 1, borderTopColor: '#f3f4f6' },
  mergedName:   { fontSize: 14, color: '#111827', fontWeight: '500', flex: 1 },
  mergedQty:    { fontSize: 14, color: '#1e3a5f', fontWeight: '700' },

  destCard:    { backgroundColor: '#fff', borderRadius: 14, overflow: 'hidden', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 6, elevation: 2 },
  destOption:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16 },
  destSelected:{ backgroundColor: '#eff6ff' },
  destLeft:    { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  destTitle:   { fontSize: 15, fontWeight: '600', color: '#374151' },
  destTitleOn: { color: '#1e3a5f' },
  destSub:     { fontSize: 12, color: '#9ca3af', marginTop: 2 },
  divider:     { height: 1, backgroundColor: '#f3f4f6' },
  radio:       { width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: '#d1d5db', justifyContent: 'center', alignItems: 'center' },
  radioOn:     { borderColor: '#1e3a5f' },
  radioDot:    { width: 10, height: 10, borderRadius: 5, backgroundColor: '#1e3a5f' },

  sendBtn:         { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, backgroundColor: '#16a34a', borderRadius: 16, padding: 18, shadowColor: '#16a34a', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 5, marginTop: 4 },
  sendBtnDisabled: { opacity: 0.4 },
  sendBtnText:     { fontSize: 16, fontWeight: 'bold', color: '#fff' },

  overlay:     { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  sheet:       { backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, maxHeight: '65%' },
  handle:      { width: 40, height: 4, backgroundColor: '#e5e7eb', borderRadius: 2, alignSelf: 'center', marginBottom: 16 },
  sheetTitle:  { fontSize: 18, fontWeight: 'bold', color: '#111827', marginBottom: 16 },
  supplierRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#f3f4f6', gap: 12 },
  supplierName:{ fontSize: 15, fontWeight: '600', color: '#111827' },
  supplierEmail:{ fontSize: 13, color: '#6b7280', marginTop: 2 },
  supplierAddress:{ fontSize: 12, color: '#9ca3af', marginTop: 1 },
  mergeEditBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, backgroundColor: '#1e3a5f', borderRadius: 14, padding: 16, shadowColor: '#1e3a5f', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 8, elevation: 4 },
  mergeEditText: { fontSize: 15, fontWeight: 'bold', color: '#fff' },
  editQtyInput: { width: 60, height: 32, borderWidth: 1, borderColor: '#1e3a5f', borderRadius: 6, paddingHorizontal: 8, fontSize: 13, color: '#111827', backgroundColor: '#f0f4ff' },
  mergedUnit: { fontSize: 13, color: '#6b7280', marginHorizontal: 4 },
  editSaveBtn: { width: 28, height: 28, borderRadius: 6, backgroundColor: '#dcfce7', justifyContent: 'center', alignItems: 'center', marginHorizontal: 2 },
});
