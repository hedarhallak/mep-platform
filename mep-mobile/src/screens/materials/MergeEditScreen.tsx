import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Modal,
  FlatList,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import { apiClient } from '../../api/client';
import Colors from '../../theme/colors';

// ------------------------------------------------------------------ types --

interface MergedItem {
  item_name: string;
  qty: number;
  unit: string;
}

interface Supplier {
  id: number;
  name: string;
  email: string;
  address: string | null;
}

const UNITS = ['Pcs', 'Ft', 'M', 'In', 'Cm', 'Kg', 'Lb', 'Box', 'Roll', 'Bag', 'Set', 'L', 'Gal'];

// ================================================================ screen --

export default function MergeEditScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();

  const { request_ids, initialItems, suppliers } = route.params as {
    request_ids: number[];
    initialItems: MergedItem[];
    suppliers: Supplier[];
  };

  const [items, setItems]               = useState<MergedItem[]>(initialItems);
  const [destination, setDestination]   = useState<'procurement' | number | null>(null);
  const [sending, setSending]           = useState(false);
  const [supplierModal, setSupplierModal] = useState(false);
  const [unitModal, setUnitModal]       = useState(false);
  const [unitTargetIdx, setUnitTargetIdx] = useState<number | null>(null);

  const selectedSupplier =
    typeof destination === 'number' ? suppliers.find(s => s.id === destination) ?? null : null;

  // ----------------------------------------------------------- item actions --

  const updateQty = (idx: number, val: string) => {
    setItems(prev => prev.map((item, i) =>
      i === idx ? { ...item, qty: Number(val) || 0 } : item
    ));
  };

  const updateUnit = (idx: number, unit: string) => {
    setItems(prev => prev.map((item, i) =>
      i === idx ? { ...item, unit } : item
    ));
  };

  const deleteItem = (idx: number) => {
    if (items.length === 1) {
      Alert.alert('Cannot Delete', 'At least one item is required.');
      return;
    }
    Alert.alert(
      'Remove Item',
      `Remove "${items[idx].item_name}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Remove', style: 'destructive', onPress: () => setItems(prev => prev.filter((_, i) => i !== idx)) },
      ]
    );
  };

  // ------------------------------------------------------------ send action --

  const handleSend = () => {
    const validItems = items.filter(i => i.qty > 0);
    if (validItems.length === 0) {
      Alert.alert('No Items', 'Add at least one item with a valid quantity.');
      return;
    }
    if (destination === null) {
      Alert.alert('No Destination', 'Choose a supplier or send to procurement.');
      return;
    }

    const destLabel = destination === 'procurement'
      ? 'Procurement department'
      : selectedSupplier?.name ?? 'Supplier';

    Alert.alert(
      'Confirm Send',
      `Send ${validItems.length} item(s) to ${destLabel}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Send',
          onPress: async () => {
            setSending(true);
            try {
              await apiClient.post('/api/materials/send-order', {
                request_ids,
                items: validItems,
                supplier_id: destination === 'procurement' ? 'procurement' : destination,
              });
              Alert.alert('Sent', 'Purchase order created and sent successfully.', [
                { text: 'OK', onPress: () => navigation.goBack() },
              ]);
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

  // ----------------------------------------------------------------- render --

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={90}
    >
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >

        {/* Items Section */}
        <View style={styles.sectionRow}>
          <Ionicons name="git-merge-outline" size={17} color={Colors.primary} />
          <Text style={styles.sectionTitle}>Merged Items</Text>
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{items.length} items</Text>
          </View>
        </View>

        <View style={styles.itemsCard}>
          {items.map((item, idx) => (
            <View key={idx} style={[styles.itemRow, idx > 0 && styles.itemBorder]}>
              <View style={styles.itemInfo}>
                <Text style={styles.itemName}>{item.item_name}</Text>
              </View>
              <View style={styles.itemControls}>
                <TextInput
                  style={styles.qtyInput}
                  keyboardType="decimal-pad"
                  value={item.qty > 0 ? String(item.qty) : ''}
                  onChangeText={v => updateQty(idx, v)}
                  placeholder="Qty"
                  placeholderTextColor={Colors.textLight}
                />
                <TouchableOpacity
                  style={styles.unitBtn}
                  onPress={() => { setUnitTargetIdx(idx); setUnitModal(true); }}
                >
                  <Text style={styles.unitText}>{item.unit}</Text>
                  <Ionicons name="chevron-down" size={12} color={Colors.textMuted} />
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.deleteBtn}
                  onPress={() => deleteItem(idx)}
                >
                  <Ionicons name="trash-outline" size={18} color={Colors.danger} />
                </TouchableOpacity>
              </View>
            </View>
          ))}
        </View>

        {/* Destination Section */}
        <View style={[styles.sectionRow, { marginTop: 16 }]}>
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
              <Ionicons name="business-outline" size={22} color={destination === 'procurement' ? Colors.primary : Colors.textLight} />
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
              <Ionicons name="storefront-outline" size={22} color={typeof destination === 'number' ? Colors.primary : Colors.textLight} />
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
                Send Order ({items.filter(i => i.qty > 0).length} items)
              </Text>
            </>
          )}
        </TouchableOpacity>

      </ScrollView>

      {/* Supplier Modal */}
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
                    </View>
                    {destination === s.id && <Ionicons name="checkmark" size={20} color={Colors.primary} />}
                  </TouchableOpacity>
                )}
              />
            )}
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Unit Modal */}
      <Modal visible={unitModal} transparent animationType="slide">
        <TouchableOpacity style={styles.overlay} onPress={() => setUnitModal(false)}>
          <View style={styles.sheet}>
            <View style={styles.handle} />
            <Text style={styles.sheetTitle}>Select Unit</Text>
            <FlatList
              data={UNITS}
              keyExtractor={u => u}
              renderItem={({ item: unit }) => (
                <TouchableOpacity
                  style={styles.unitOptionRow}
                  onPress={() => {
                    if (unitTargetIdx !== null) updateUnit(unitTargetIdx, unit);
                    setUnitModal(false);
                    setUnitTargetIdx(null);
                  }}
                >
                  <Text style={styles.unitOptionText}>{unit}</Text>
                  {unitTargetIdx !== null && items[unitTargetIdx]?.unit === unit && (
                    <Ionicons name="checkmark" size={20} color={Colors.primary} />
                  )}
                </TouchableOpacity>
              )}
            />
          </View>
        </TouchableOpacity>
      </Modal>

    </KeyboardAvoidingView>
  );
}

// ------------------------------------------------------------------ styles --

const styles = StyleSheet.create({
  container:   { flex: 1, backgroundColor: Colors.background },
  content:     { padding: 16, gap: 12, paddingBottom: 48 },

  sectionRow:  { flexDirection: 'row', alignItems: 'center', gap: 8 },
  sectionTitle:{ fontSize: 15, fontWeight: '700', color: Colors.textPrimary },
  badge:       { backgroundColor: Colors.primaryPale, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3 },
  badgeText:   { fontSize: 12, fontWeight: '700', color: Colors.primary },

  itemsCard:   { backgroundColor: Colors.cardBg, borderRadius: 14, overflow: 'hidden', shadowColor: Colors.shadowColor, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 6, elevation: 2 },
  itemRow:     { flexDirection: 'row', alignItems: 'center', padding: 14, gap: 10 },
  itemBorder:  { borderTopWidth: 1, borderTopColor: Colors.background },
  itemInfo:    { flex: 1 },
  itemName:    { fontSize: 14, fontWeight: '600', color: Colors.textPrimary },
  itemControls:{ flexDirection: 'row', alignItems: 'center', gap: 8 },
  qtyInput:    { width: 64, height: 40, borderWidth: 1, borderColor: Colors.divider, borderRadius: 8, paddingHorizontal: 10, fontSize: 15, fontWeight: '700', color: Colors.primary, backgroundColor: Colors.inputBg, textAlign: 'center' },
  unitBtn:     { flexDirection: 'row', alignItems: 'center', gap: 2, height: 40, paddingHorizontal: 10, borderWidth: 1, borderColor: Colors.divider, borderRadius: 8, backgroundColor: Colors.inputBg, minWidth: 56 },
  unitText:    { fontSize: 13, fontWeight: '600', color: Colors.textSecondary },
  deleteBtn:   { width: 36, height: 36, borderRadius: 8, backgroundColor: Colors.dangerBg, justifyContent: 'center', alignItems: 'center' },

  destCard:    { backgroundColor: Colors.cardBg, borderRadius: 14, overflow: 'hidden', shadowColor: Colors.shadowColor, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 6, elevation: 2 },
  destOption:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 18 },
  destSelected:{ backgroundColor: Colors.primaryPale },
  destLeft:    { flexDirection: 'row', alignItems: 'center', gap: 14, flex: 1 },
  destTitle:   { fontSize: 15, fontWeight: '600', color: Colors.textSecondary },
  destTitleOn: { color: Colors.primary },
  destSub:     { fontSize: 12, color: Colors.textLight, marginTop: 2 },
  divider:     { height: 1, backgroundColor: Colors.background },
  radio:       { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: '#d1d5db', justifyContent: 'center', alignItems: 'center' },
  radioOn:     { borderColor: Colors.primary },
  radioDot:    { width: 11, height: 11, borderRadius: 6, backgroundColor: Colors.primary },

  sendBtn:         { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, backgroundColor: Colors.success, borderRadius: 16, padding: 18, shadowColor: Colors.success, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 5, marginTop: 8 },
  sendBtnDisabled: { opacity: 0.4 },
  sendBtnText:     { fontSize: 16, fontWeight: 'bold', color: Colors.white },

  overlay:      { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  sheet:        { backgroundColor: Colors.cardBg, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, maxHeight: '65%' },
  handle:       { width: 40, height: 4, backgroundColor: Colors.divider, borderRadius: 2, alignSelf: 'center', marginBottom: 16 },
  sheetTitle:   { fontSize: 18, fontWeight: 'bold', color: Colors.textPrimary, marginBottom: 16 },
  emptyCard:    { padding: 24, alignItems: 'center' },
  emptyText:    { fontSize: 14, color: Colors.textLight },
  supplierRow:  { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: Colors.background, gap: 12 },
  supplierName: { fontSize: 15, fontWeight: '600', color: Colors.textPrimary },
  supplierEmail:{ fontSize: 13, color: Colors.textMuted, marginTop: 2 },
  unitOptionRow:{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: Colors.background },
  unitOptionText:{ fontSize: 16, color: Colors.textPrimary },
});
