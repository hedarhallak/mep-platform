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
import { useTranslation } from 'react-i18next';
import { apiClient } from '../../api/client';
import { useNavigation } from '@react-navigation/native';
import Colors from '../../theme/colors';

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
  const { t } = useTranslation();
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
      Alert.alert(t('materials.noAssignmentTitle'), t('materials.noAssignmentMsg'));
      return;
    }
    const validItems = items.filter(i => i.item_name.trim() && Number(i.quantity) > 0);
    if (!validItems.length) {
      Alert.alert(t('common.error'), t('materials.addItemHint'));
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
      Alert.alert(t('common.success'), t('materials.submitSuccess'), [
        { text: 'OK', onPress: () => { setItems([newItem()]); setNote(''); } },
      ]);
    } catch (err: any) {
      const msg = err.response?.data?.message || err.response?.data?.error || t('materials.submitFailed');
      Alert.alert(t('common.error'), msg);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return <View style={styles.center}><ActivityIndicator size="large" color={Colors.primary} /></View>;
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'} keyboardVerticalOffset={90}>
      <ScrollView style={styles.container} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">

        {assignment ? (
          <View style={styles.projectCard}>
            <View style={styles.projectHeader}>
              <Ionicons name="business-outline" size={18} color={Colors.primary} />
              <Text style={styles.projectLabel}>{t('attendance.project')}</Text>
            </View>
            <Text style={styles.projectName}>{assignment.project_name}</Text>
            <Text style={styles.projectCode}>{assignment.project_code}</Text>
          </View>
        ) : (
          <View style={styles.warningCard}>
            <Ionicons name="warning-outline" size={20} color="#d97706" />
            <Text style={styles.warningText}>{t('attendance.noActiveAssignment')}</Text>
          </View>
        )}

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>{t('materials.items')}</Text>
          <TouchableOpacity style={styles.addButton} onPress={addItem}>
            <Ionicons name="add" size={20} color={Colors.primary} />
            <Text style={styles.addButtonText}>{t('materials.addItem')}</Text>
          </TouchableOpacity>
        </View>

        {items.map((item, index) => (
          <View key={item.id} style={styles.itemCard}>
            <View style={styles.itemHeader}>
              <Text style={styles.itemIndex}>{t('materials.itemLabel', { n: index + 1 })}</Text>
              {items.length > 1 && (
                <TouchableOpacity onPress={() => removeItem(item.id)}>
                  <Ionicons name="trash-outline" size={18} color={Colors.danger} />
                </TouchableOpacity>
              )}
            </View>

            <TextInput
              style={styles.input}
              placeholder={t('materials.itemName')}
              placeholderTextColor={Colors.textLight}
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
                    <Ionicons name="cube-outline" size={16} color={Colors.textMuted} />
                    <Text style={styles.suggestionText}>{s.item_name}</Text>
                    <Text style={styles.suggestionUnit}>{s.default_unit}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            <View style={styles.row}>
              <TextInput
                style={[styles.input, { flex: 1, marginRight: 8, marginBottom: 0 }]}
                placeholder={t('materials.quantity')}
                placeholderTextColor={Colors.textLight}
                keyboardType="decimal-pad"
                value={item.quantity}
                onChangeText={v => updateItem(item.id, 'quantity', v)}
              />
              <TouchableOpacity style={styles.unitButton} onPress={() => openUnitModal(item.id)}>
                <Text style={styles.unitText}>{item.unit}</Text>
                <Ionicons name="chevron-down" size={14} color={Colors.textMuted} />
              </TouchableOpacity>
            </View>

            <TextInput
              style={[styles.input, { marginTop: 10, marginBottom: 0 }]}
              placeholder={t('materials.itemNote')}
              placeholderTextColor={Colors.textLight}
              value={item.note}
              onChangeText={v => updateItem(item.id, 'note', v)}
            />
          </View>
        ))}

        <View style={styles.noteCard}>
          <Text style={styles.noteLabel}>{t('materials.requestNote')}</Text>
          <TextInput
            style={styles.noteInput}
            placeholder={t('materials.generalNote')}
            placeholderTextColor={Colors.textLight}
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
            <ActivityIndicator color={Colors.white} />
          ) : (
            <>
              <Ionicons name="send-outline" size={20} color={Colors.white} />
              <Text style={styles.submitText}>{t('materials.submitRequest')}</Text>
            </>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.myRequestsButton}
          onPress={() => navigation.navigate('MyRequests')}
        >
          <Ionicons name="list-outline" size={20} color={Colors.primary} />
          <Text style={styles.myRequestsText}>{t('materials.viewMyRequests')}</Text>
        </TouchableOpacity>

      </ScrollView>

      <Modal visible={unitModalVisible} transparent animationType="slide">
        <TouchableOpacity style={styles.modalOverlay} onPress={() => setUnitModalVisible(false)}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>{t('materials.selectUnit')}</Text>
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
  container: { flex: 1, backgroundColor: Colors.background },
  content: { padding: 16, gap: 16, paddingBottom: 40 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  projectCard: {
    backgroundColor: Colors.cardBg, borderRadius: 16, padding: 16,
    shadowColor: Colors.shadowColor, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 3,
  },
  projectHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
  projectLabel: { fontSize: 12, fontWeight: '600', color: Colors.primary, textTransform: 'uppercase', letterSpacing: 1 },
  projectName: { fontSize: 16, fontWeight: 'bold', color: Colors.textPrimary },
  projectCode: { fontSize: 13, color: Colors.textMuted, marginTop: 2 },

  warningCard: {
    backgroundColor: Colors.warningBg, borderRadius: 16, padding: 16,
    flexDirection: 'row', alignItems: 'center', gap: 10,
    borderWidth: 1, borderColor: '#fde68a',
  },
  warningText: { fontSize: 14, color: '#d97706', fontWeight: '500' },

  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sectionTitle: { fontSize: 16, fontWeight: 'bold', color: Colors.textPrimary },
  addButton: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: Colors.primaryPale, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6 },
  addButtonText: { fontSize: 14, color: Colors.primary, fontWeight: '600' },

  itemCard: {
    backgroundColor: Colors.cardBg, borderRadius: 16, padding: 16,
    shadowColor: Colors.shadowColor, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 3,
  },
  itemHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  itemIndex: { fontSize: 13, fontWeight: '600', color: Colors.textMuted },

  input: {
    height: 44, borderWidth: 1, borderColor: Colors.divider, borderRadius: 10,
    paddingHorizontal: 14, fontSize: 15, color: Colors.textPrimary, backgroundColor: Colors.inputBg, marginBottom: 10,
  },

  suggestionBox: {
    backgroundColor: Colors.cardBg, borderRadius: 10, borderWidth: 1, borderColor: Colors.divider,
    marginTop: -6, marginBottom: 10, overflow: 'hidden',
    shadowColor: Colors.shadowColor, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.1, shadowRadius: 8, elevation: 5,
  },
  suggestionItem: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, borderBottomWidth: 1, borderBottomColor: Colors.background },
  suggestionText: { flex: 1, fontSize: 14, color: Colors.textPrimary },
  suggestionUnit: { fontSize: 13, color: Colors.textLight, backgroundColor: Colors.background, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 },

  row: { flexDirection: 'row', alignItems: 'center' },
  unitButton: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    height: 44, paddingHorizontal: 14, borderWidth: 1, borderColor: Colors.divider,
    borderRadius: 10, backgroundColor: Colors.inputBg, minWidth: 80, justifyContent: 'center',
  },
  unitText: { fontSize: 15, color: Colors.textSecondary, fontWeight: '600' },

  noteCard: { backgroundColor: Colors.cardBg, borderRadius: 16, padding: 16, shadowColor: Colors.shadowColor, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 3 },
  noteLabel: { fontSize: 13, fontWeight: '600', color: Colors.textSecondary, marginBottom: 8 },
  noteInput: { borderWidth: 1, borderColor: Colors.divider, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, fontSize: 15, color: Colors.textPrimary, backgroundColor: Colors.inputBg, minHeight: 80, textAlignVertical: 'top' },

  submitButton: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
    backgroundColor: Colors.primary, borderRadius: 16, padding: 18,
    shadowColor: Colors.shadowColor, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.15, shadowRadius: 8, elevation: 5,
  },
  disabledButton: { opacity: 0.5 },
  submitText: { fontSize: 17, fontWeight: 'bold', color: Colors.white },
  myRequestsButton: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: Colors.cardBg, borderRadius: 16, padding: 16,
    borderWidth: 1, borderColor: Colors.primary,
  },
  myRequestsText: { fontSize: 16, fontWeight: '600', color: Colors.primary },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  modalSheet: { backgroundColor: Colors.cardBg, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, maxHeight: '60%' },
  modalHandle: { width: 40, height: 4, backgroundColor: Colors.divider, borderRadius: 2, alignSelf: 'center', marginBottom: 16 },
  modalTitle: { fontSize: 18, fontWeight: 'bold', color: Colors.textPrimary, marginBottom: 16 },
  unitOption: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: Colors.background },
  unitOptionText: { fontSize: 16, color: Colors.textPrimary },
});
