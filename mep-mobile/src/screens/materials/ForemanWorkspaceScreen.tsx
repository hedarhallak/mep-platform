import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
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
import Colors from '../../theme/colors';

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

export default function ForemanWorkspaceScreen() {
  const [requests, setRequests]           = useState<InboxRequest[]>([]);
  const [suppliers, setSuppliers]         = useState<Supplier[]>([]);
  const [selectedIds, setSelectedIds]     = useState<Set<number>>(new Set());
  const [destination, setDestination]     = useState<'procurement' | number | null>(null);
  const [loading, setLoading]             = useState(true);
  const [refreshing, setRefreshing]       = useState(false);
  const [sending, setSending]             = useState(false);
  const [expandedId, setExpandedId]       = useState<number | null>(null);
  const [supplierModal, setSupplierModal] = useState(false);

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

  const selectedSupplier =
    typeof destination === 'number' ? suppliers.find(s => s.id === destination) ?? null : null;

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

  // --------------------------------------------------------- send action --

  const handleSend = () => {
    if (selectedIds.size === 0) {
      Alert.alert('No Requests Selected', 'Select at least one request.');
      return;
    }
    if (destination === null) {
      Alert.alert('No Destination', 'Choose a supplier or send to procurement.');
      return;
    }

    const destLabel =
      destination === 'procurement'
        ? 'Procurement department'
        : selectedSupplier?.name ?? 'Supplier';

    Alert.alert(
      'Confirm Send',
      `Merge ${selectedIds.size} request(s) · ${mergedItems.length} item(s)\nSend to: ${destLabel}`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Send',
          onPress: async () => {
            setSending(true);
            try {
              const params = new URLSearchParams({
                request_ids: Array.from(selectedIds).join(','),
                supplier_id: destination === 'procurement' ? 'procurement' : String(destination),
              });
              await apiClient.get(`/api/materials/pdf-data?${params.toString()}`);
              Alert.alert('Sent', 'Purchase order created and sent successfully.');
              setSelectedIds(new Set());
              setDestination(null);
              fetchAll(true);
            } catch (err: any) {
              Alert.alert('Error', err.response?.data?.error || 'Failed to send.');
            } finally {
              setSending(false);
            }
          },
        },
      ]
    );
  };

  // ---------------------------------------------------------------- render --

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  return (
    <>
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}
      >
        {/* ---- SECTION 1: Worker Requests ---- */}
        <View style={styles.sectionRow}>
          <View style={styles.titleRow}>
            <Ionicons name="people-outline" size={17} color={Colors.primary} />
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
                  <Text style={styles.dot}>·</Text>
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
                    {checked && <Ionicons name="checkmark" size={14} color={Colors.white} />}
                  </View>

                  <View style={styles.cardInfo}>
                    <Text style={styles.cardProject}>{req.project_name}</Text>
                    <Text style={styles.cardMeta}>
                      {req.requester_name ?? 'Worker'}
                      {req.created_at ? `  ·  ${fmtDateTime(req.created_at)}` : ''}
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
                    <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={18} color={Colors.textLight} />
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
                        <Ionicons name="document-text-outline" size={13} color={Colors.textLight} />
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
              <Ionicons name="git-merge-outline" size={17} color={Colors.primary} />
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

            <View style={[styles.titleRow, { marginTop: 8 }]}>
              <Ionicons name="send-outline" size={17} color={Colors.primary} />
              <Text style={styles.sectionTitle}>Send To</Text>
            </View>

            <View style={styles.destCard}>
              {/* Procurement */}
              <TouchableOpacity
                style={[styles.destOption, destination === 'procurement' && styles.destSelected]}
                onPress={() => setDestination('procurement')}
              >
                <View style={styles.destLeft}>
                  <Ionicons
                    name="business-outline" size={20}
                    color={destination === 'procurement' ? Colors.primary : Colors.textLight}
                  />
                  <View>
                    <Text style={[styles.destTitle, destination === 'procurement' && styles.destTitleOn]}>
                      Procurement
                    </Text>
                    <Text style={styles.destSub}>Internal purchasing department</Text>
                  </View>
                </View>
                <View style={[styles.radio, destination === 'procurement' && styles.radioOn]}>
                  {destination === 'procurement' && <View style={styles.radioDot} />}
                </View>
              </TouchableOpacity>

              <View style={styles.divider} />

              {/* Supplier */}
              <TouchableOpacity
                style={[styles.destOption, typeof destination === 'number' && styles.destSelected]}
                onPress={() => setSupplierModal(true)}
              >
                <View style={styles.destLeft}>
                  <Ionicons
                    name="storefront-outline" size={20}
                    color={typeof destination === 'number' ? Colors.primary : Colors.textLight}
                  />
                  <View>
                    <Text style={[styles.destTitle, typeof destination === 'number' && styles.destTitleOn]}>
                      {selectedSupplier ? selectedSupplier.name : 'Select Supplier'}
                    </Text>
                    <Text style={styles.destSub}>
                      {selectedSupplier ? selectedSupplier.email : 'Send directly to a supplier'}
                    </Text>
                  </View>
                </View>
                <View style={[styles.radio, typeof destination === 'number' && styles.radioOn]}>
                  {typeof destination === 'number' && <View style={styles.radioDot} />}
                </View>
              </TouchableOpacity>
            </View>

            {/* Send Button */}
            <TouchableOpacity
              style={[styles.sendBtn, (sending || destination === null) && styles.sendBtnDisabled]}
              onPress={handleSend}
              disabled={sending || destination === null}
            >
              {sending ? (
                <ActivityIndicator color={Colors.white} />
              ) : (
                <>
                  <Ionicons name="paper-plane-outline" size={20} color={Colors.white} />
                  <Text style={styles.sendBtnText}>
                    Merge & Send ({selectedIds.size} request{selectedIds.size !== 1 ? 's' : ''})
                  </Text>
                </>
              )}
            </TouchableOpacity>
          </>
        )}
      </ScrollView>

      {/* ---- Supplier Picker Modal ---- */}
      <Modal visible={supplierModal} transparent animationType="slide">
        <TouchableOpacity style={styles.overlay} onPress={() => setSupplierModal(false)}>
          <View style={styles.sheet}>
            <View style={styles.handle} />
            <Text style={styles.sheetTitle}>Select Supplier</Text>
            {suppliers.length === 0 ? (
              <View style={styles.emptyCard}>
                <Text style={styles.emptyText}>No suppliers found</Text>
              </View>
            ) : (
              <FlatList
                data={suppliers}
                keyExtractor={s => String(s.id)}
                renderItem={({ item: s }) => (
                  <TouchableOpacity
                    style={styles.supplierRow}
                    onPress={() => { setDestination(s.id); setSupplierModal(false); }}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={styles.supplierName}>{s.name}</Text>
                      <Text style={styles.supplierEmail}>{s.email}</Text>
                      {s.address ? <Text style={styles.supplierAddress}>{s.address}</Text> : null}
                    </View>
                    {destination === s.id && <Ionicons name="checkmark" size={20} color={Colors.primary} />}
                  </TouchableOpacity>
                )}
              />
            )}
          </View>
        </TouchableOpacity>
      </Modal>
    </>
  );
}

// ------------------------------------------------------------------ styles --

const S = StyleSheet;

const styles = S.create({
  container:   { flex: 1, backgroundColor: Colors.background },
  content:     { padding: 16, gap: 12, paddingBottom: 48 },
  center:      { flex: 1, justifyContent: 'center', alignItems: 'center' },

  sectionRow:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  titleRow:    { flexDirection: 'row', alignItems: 'center', gap: 8 },
  sectionTitle:{ fontSize: 15, fontWeight: '700', color: Colors.textPrimary },
  badge:       { backgroundColor: Colors.primaryPale, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3 },
  badgeText:   { fontSize: 12, fontWeight: '700', color: Colors.primary },

  selectRow:   { flexDirection: 'row', alignItems: 'center', gap: 6 },
  selectAllText:{ fontSize: 13, fontWeight: '600', color: Colors.primary },
  dot:         { fontSize: 13, color: Colors.textLight },
  clearText:   { fontSize: 13, fontWeight: '600', color: Colors.danger },

  emptyCard:   { backgroundColor: Colors.cardBg, borderRadius: 14, padding: 32, alignItems: 'center', gap: 8 },
  emptyText:   { fontSize: 14, color: Colors.textLight },

  card: {
    backgroundColor: Colors.cardBg, borderRadius: 14, overflow: 'hidden',
    borderWidth: 2, borderColor: 'transparent',
    shadowColor: Colors.shadowColor, shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05, shadowRadius: 6, elevation: 2,
  },
  cardSelected:  { borderColor: Colors.primary },
  cardHeader:    { flexDirection: 'row', alignItems: 'center', padding: 14, gap: 12 },
  checkbox:      { width: 24, height: 24, borderRadius: 6, borderWidth: 2, borderColor: '#d1d5db', justifyContent: 'center', alignItems: 'center', backgroundColor: Colors.inputBg },
  checkboxOn:    { backgroundColor: Colors.primary, borderColor: Colors.primary },
  cardInfo:      { flex: 1 },
  cardProject:   { fontSize: 14, fontWeight: '700', color: Colors.textPrimary },
  cardMeta:      { fontSize: 12, color: Colors.textLight, marginTop: 2 },
  cardItemCount: { fontSize: 12, color: Colors.textMuted, marginTop: 3 },
  expandBtn:     { padding: 4 },

  itemsList:  { borderTopWidth: 1, borderTopColor: Colors.background, paddingHorizontal: 14, paddingBottom: 12, gap: 8 },
  itemRow:    { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 2 },
  itemDot:    { width: 6, height: 6, borderRadius: 3, backgroundColor: Colors.primary },
  itemName:   { flex: 1, fontSize: 13, color: Colors.textSecondary },
  itemQty:    { fontSize: 13, color: Colors.textMuted, fontWeight: '500' },
  noteRow:    { flexDirection: 'row', gap: 6, backgroundColor: Colors.inputBg, borderRadius: 8, padding: 8, marginTop: 4 },
  noteText:   { fontSize: 12, color: Colors.textMuted, flex: 1 },

  mergedCard:   { backgroundColor: Colors.cardBg, borderRadius: 14, overflow: 'hidden', shadowColor: Colors.shadowColor, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 6, elevation: 2 },
  mergedRow:    { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12 },
  mergedBorder: { borderTopWidth: 1, borderTopColor: Colors.background },
  mergedName:   { fontSize: 14, color: Colors.textPrimary, fontWeight: '500', flex: 1 },
  mergedQty:    { fontSize: 14, color: Colors.primary, fontWeight: '700' },

  destCard:    { backgroundColor: Colors.cardBg, borderRadius: 14, overflow: 'hidden', shadowColor: Colors.shadowColor, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 6, elevation: 2 },
  destOption:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16 },
  destSelected:{ backgroundColor: Colors.primaryPale },
  destLeft:    { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  destTitle:   { fontSize: 15, fontWeight: '600', color: Colors.textSecondary },
  destTitleOn: { color: Colors.primary },
  destSub:     { fontSize: 12, color: Colors.textLight, marginTop: 2 },
  divider:     { height: 1, backgroundColor: Colors.background },
  radio:       { width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: '#d1d5db', justifyContent: 'center', alignItems: 'center' },
  radioOn:     { borderColor: Colors.primary },
  radioDot:    { width: 10, height: 10, borderRadius: 5, backgroundColor: Colors.primary },

  sendBtn:         { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, backgroundColor: Colors.success, borderRadius: 16, padding: 18, shadowColor: Colors.success, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 5, marginTop: 4 },
  sendBtnDisabled: { opacity: 0.4 },
  sendBtnText:     { fontSize: 16, fontWeight: 'bold', color: Colors.white },

  overlay:     { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  sheet:       { backgroundColor: Colors.cardBg, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, maxHeight: '65%' },
  handle:      { width: 40, height: 4, backgroundColor: Colors.divider, borderRadius: 2, alignSelf: 'center', marginBottom: 16 },
  sheetTitle:  { fontSize: 18, fontWeight: 'bold', color: Colors.textPrimary, marginBottom: 16 },
  supplierRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: Colors.background, gap: 12 },
  supplierName:{ fontSize: 15, fontWeight: '600', color: Colors.textPrimary },
  supplierEmail:{ fontSize: 13, color: Colors.textMuted, marginTop: 2 },
  supplierAddress:{ fontSize: 12, color: Colors.textLight, marginTop: 1 },
});
