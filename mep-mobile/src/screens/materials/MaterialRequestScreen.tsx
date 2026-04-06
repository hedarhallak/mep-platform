import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Modal,
  FlatList,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { apiClient } from '../../api/client';
import { useNavigation } from '@react-navigation/native';

interface Item {
  id: string;
  item_name: string;
  quantity: string;
  unit: string;
  note: string;
}

interface TodayAssignment {
  assignment_id: number;
  project_id: number;
  project_name: string;
  project_code: string;
}

interface CatalogItem {
  item_name: string;
  default_unit: string;
  use_count: number;
}

const UNITS = ['Pcs', 'Ft', 'M', 'In', 'Cm', 'Kg', 'Lb', 'Box', 'Roll', 'Bag', 'Set', 'L', 'Gal'];

function newItem(): Item {
  return { id: Date.now().toString(), item_name: '', quantity: '', unit: 'pcs', note: '' };
}

export default function MaterialRequestScreen() {
  const navigation = useNavigation<any>();
  const [assignment, setAssignment] = useState<TodayAssignment | null>(null);
  const [items, setItems] = useState<Item[]>([newItem()]);
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const [catalogSuggestions, setCatalogSuggestions] = useState<CatalogItem[]>([]);
  const [activeItemId, setActiveItemId] = useState<string | null>(null);

  const [unitModalVisible, setUnitModalVisible] = useState(false);
  const [unitTargetId, setUnitTargetId] = useState<string | null>(null);

  const fetchAssignment = useCallback(async () => {
    try {
      const res = await apiClient.get('/api/assignments/my-today');
      setAssignment(res.data?.assignment || null);
    } catch {
      setAssignment(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAssignment();
  }, [fetchAssignment]);

  const fetchCatalog = useCallback(async (q: string, itemId: string) => {
    setActiveItemId(itemId);
    if (q.length < 2) {
      setCatalogSuggestions([]);
      return;
    }
    try {
      const res = await apiClient.get(`/api/materials/catalog?q=${encodeURIComponent(q)}`);
      setCatalogSuggestions(res.data?.items || []);
    } catch {
      setCatalogSuggestions([]);
    }
  }, []);

  const selectCatalogItem = (suggestion: CatalogItem, itemId: string) => {
    setItems(prev => prev.map(i =>
      i.id === itemId
        ? { ...i, item_name: suggestion.item_name, unit: suggestion.default_unit || 'pcs' }
        : i
    ));
    setCatalogSuggestions([]);
    setActiveItemId(null);
  };

  const updateItem = (id: string, field: keyof Item, value: string) => {
    setItems(prev => prev.map(i => i.id === id ? { ...i, [field]: value } : i));
  };

  const addItem = () => setItems(prev => [...prev, newItem()]);

  const removeItem = (id: string) => {
    if (items.length === 1) return;
    setItems(prev => prev.filter(i => i.id !== id));
  };

  const openUnitModal = (id: string) => {
    setUnitTargetId(id);
    setUnitModalVisible(true);
  };

  const selectUnit = (unit: string) => {
    if (unitTargetId) updateItem(unitTargetId, 'unit', unit);
    setUnitModalVisible(false);
    setUnitTargetId(null);
  };

  const handleSubmit = async () => {
    if (!assignment) {
      Alert.alert('No Assignment', 'You have no active assignment today.');
      return;
    }
    const validItems = items.filter(i => i.item_name.trim() && Number(i.quantity) > 0);
    if (!validItems.length) {
      Alert.alert('Error', 'Add at least one item with a name and quantity.');
      return;
    }
    setSubmitting(true);
    try {
      await apiClient.post('/api/materials/requests', {
        project_id: assignment.project_id,
        note: note.trim() || null,
        items: validItems.map(i => ({
          item_name: i.item_name.trim(),
          quantity: Number(i.quantity),
          unit: i.unit,
          note: i.note.trim() || null,
        })),
      });
      Alert.alert('Success', 'Material request submitted!', [
        { text: 'OK', onPress: () => { setItems([newItem()]); setNote(''); } },
      ]);
    } catch (err: any) {
      const msg = err.response?.data?.message || err.response?.data?.error || 'Submission failed.';
      Alert.alert('Error', msg);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return <View style={styles.center}><ActivityIndicator size="large" color="#1e3a5f" /></View>;
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'} keyboardVerticalOffset={90}>
      <ScrollView style={styles.container} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">

        {assignment ? (
          <View style={styles.projectCard}>
            <View style={styles.projectHeader}>
              <Ionicons name="business-outline" size={18} color="#1e3a5f" />
              <Text style={styles.projectLabel}>Project</Text>
            </View>
            <Text style={styles.projectName}>{assignment.project_name}</Text>
            <Text style={styles.projectCode}>{assignment.project_code}</Text>
          </View>
        ) : (
          <View style={styles.warningCard}>
            <Ionicons name="warning-outline" size={20} color="#d97706" />
            <Text style={styles.warningText}>No active assignment today</Text>
          </View>
        )}

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Items</Text>
          <TouchableOpacity style={styles.addButton} onPress={addItem}>
            <Ionicons name="add" size={20} color="#1e3a5f" />
            <Text style={styles.addButtonText}>Add Item</Text>
          </TouchableOpacity>
        </View>

        {items.map((item, index) => (
          <View key={item.id} style={styles.itemCard}>
            <View style={styles.itemHeader}>
              <Text style={styles.itemIndex}>Item {index + 1}</Text>
              {items.length > 1 && (
                <TouchableOpacity onPress={() => removeItem(item.id)}>
                  <Ionicons name="trash-outline" size={18} color="#dc2626" />
                </TouchableOpacity>
              )}
            </View>

            <TextInput
              style={styles.input}
              placeholder="Item name *"
              placeholderTextColor="#9ca3af"
              value={item.item_name}
              onChangeText={v => {
                updateItem(item.id, 'item_name', v);
                fetchCatalog(v, item.id);
              }}
              onFocus={() => setActiveItemId(item.id)}
            />

            {activeItemId === item.id && catalogSuggestions.length > 0 && (
              <View style={styles.suggestionBox}>
                {catalogSuggestions.map((s, i) => (
                  <TouchableOpacity
                    key={i}
                    style={styles.suggestionItem}
                    onPress={() => selectCatalogItem(s, item.id)}
                  >
                    <Ionicons name="cube-outline" size={16} color="#6b7280" />
                    <Text style={styles.suggestionText}>{s.item_name}</Text>
                    <Text style={styles.suggestionUnit}>{s.default_unit}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            <View style={styles.row}>
              <TextInput
                style={[styles.input, { flex: 1, marginRight: 8, marginBottom: 0 }]}
                placeholder="Qty *"
                placeholderTextColor="#9ca3af"
                keyboardType="decimal-pad"
                value={item.quantity}
                onChangeText={v => updateItem(item.id, 'quantity', v)}
              />
              <TouchableOpacity style={styles.unitButton} onPress={() => openUnitModal(item.id)}>
                <Text style={styles.unitText}>{item.unit}</Text>
                <Ionicons name="chevron-down" size={14} color="#6b7280" />
              </TouchableOpacity>
            </View>

            <TextInput
              style={[styles.input, { marginTop: 10, marginBottom: 0 }]}
              placeholder="Item note (optional)"
              placeholderTextColor="#9ca3af"
              value={item.note}
              onChangeText={v => updateItem(item.id, 'note', v)}
            />
          </View>
        ))}

        <View style={styles.noteCard}>
          <Text style={styles.noteLabel}>Request Note (optional)</Text>
          <TextInput
            style={styles.noteInput}
            placeholder="General note..."
            placeholderTextColor="#9ca3af"
            multiline
            numberOfLines={3}
            value={note}
            onChangeText={setNote}
          />
        </View>

        <TouchableOpacity
          style={[styles.submitButton, (!assignment || submitting) && styles.disabledButton]}
          onPress={handleSubmit}
          disabled={!assignment || submitting}
        >
          {submitting ? (
            <ActivityIndicator color="#ffffff" />
          ) : (
            <>
              <Ionicons name="send-outline" size={20} color="#ffffff" />
              <Text style={styles.submitText}>Submit Request</Text>
            </>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.myRequestsButton}
          onPress={() => navigation.navigate('MyRequests')}
        >
          <Ionicons name="list-outline" size={20} color="#1e3a5f" />
          <Text style={styles.myRequestsText}>View My Requests</Text>
        </TouchableOpacity>

      </ScrollView>

      <Modal visible={unitModalVisible} transparent animationType="slide">
        <TouchableOpacity style={styles.modalOverlay} onPress={() => setUnitModalVisible(false)}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>Select Unit</Text>
            <FlatList
              data={UNITS}
              keyExtractor={u => u}
              renderItem={({ item: unit }) => (
                <TouchableOpacity style={styles.unitOption} onPress={() => selectUnit(unit)}>
                  <Text style={styles.unitOptionText}>{unit}</Text>
                  {items.find(i => i.id === unitTargetId)?.unit === unit && (
                    <Ionicons name="checkmark" size={20} color="#1e3a5f" />
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

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f3f4f6' },
  content: { padding: 16, gap: 16, paddingBottom: 40 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  projectCard: {
    backgroundColor: '#ffffff', borderRadius: 16, padding: 16,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 3,
  },
  projectHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
  projectLabel: { fontSize: 12, fontWeight: '600', color: '#1e3a5f', textTransform: 'uppercase', letterSpacing: 1 },
  projectName: { fontSize: 16, fontWeight: 'bold', color: '#111827' },
  projectCode: { fontSize: 13, color: '#6b7280', marginTop: 2 },

  warningCard: {
    backgroundColor: '#fffbeb', borderRadius: 16, padding: 16,
    flexDirection: 'row', alignItems: 'center', gap: 10,
    borderWidth: 1, borderColor: '#fde68a',
  },
  warningText: { fontSize: 14, color: '#d97706', fontWeight: '500' },

  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sectionTitle: { fontSize: 16, fontWeight: 'bold', color: '#111827' },
  addButton: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#eff6ff', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6 },
  addButtonText: { fontSize: 14, color: '#1e3a5f', fontWeight: '600' },

  itemCard: {
    backgroundColor: '#ffffff', borderRadius: 16, padding: 16,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 3,
  },
  itemHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  itemIndex: { fontSize: 13, fontWeight: '600', color: '#6b7280' },

  input: {
    height: 44, borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 10,
    paddingHorizontal: 14, fontSize: 15, color: '#111827', backgroundColor: '#f9fafb', marginBottom: 10,
  },

  suggestionBox: {
    backgroundColor: '#ffffff', borderRadius: 10, borderWidth: 1, borderColor: '#e5e7eb',
    marginTop: -6, marginBottom: 10, overflow: 'hidden',
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.1, shadowRadius: 8, elevation: 5,
  },
  suggestionItem: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
  suggestionText: { flex: 1, fontSize: 14, color: '#111827' },
  suggestionUnit: { fontSize: 13, color: '#9ca3af', backgroundColor: '#f3f4f6', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 },

  row: { flexDirection: 'row', alignItems: 'center' },
  unitButton: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    height: 44, paddingHorizontal: 14, borderWidth: 1, borderColor: '#e5e7eb',
    borderRadius: 10, backgroundColor: '#f9fafb', minWidth: 80, justifyContent: 'center',
  },
  unitText: { fontSize: 15, color: '#374151', fontWeight: '600' },

  noteCard: { backgroundColor: '#ffffff', borderRadius: 16, padding: 16, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 3 },
  noteLabel: { fontSize: 13, fontWeight: '600', color: '#374151', marginBottom: 8 },
  noteInput: { borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, fontSize: 15, color: '#111827', backgroundColor: '#f9fafb', minHeight: 80, textAlignVertical: 'top' },

  submitButton: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
    backgroundColor: '#1e3a5f', borderRadius: 16, padding: 18,
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.15, shadowRadius: 8, elevation: 5,
  },
  disabledButton: { opacity: 0.5 },
  submitText: { fontSize: 17, fontWeight: 'bold', color: '#ffffff' },
  myRequestsButton: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: '#ffffff', borderRadius: 16, padding: 16,
    borderWidth: 1, borderColor: '#1e3a5f',
  },
  myRequestsText: { fontSize: 16, fontWeight: '600', color: '#1e3a5f' },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  modalSheet: { backgroundColor: '#ffffff', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, maxHeight: '60%' },
  modalHandle: { width: 40, height: 4, backgroundColor: '#e5e7eb', borderRadius: 2, alignSelf: 'center', marginBottom: 16 },
  modalTitle: { fontSize: 18, fontWeight: 'bold', color: '#111827', marginBottom: 16 },
  unitOption: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
  unitOptionText: { fontSize: 16, color: '#111827' },
});
