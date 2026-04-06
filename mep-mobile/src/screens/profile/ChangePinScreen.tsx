import React, { useState } from 'react';
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
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { apiClient } from '../../api/client';

export default function ChangePinScreen() {
  const navigation = useNavigation();
  const [currentPin, setCurrentPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [loading, setLoading] = useState(false);
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const handleChange = async () => {
    if (!currentPin || !newPin || !confirmPin) {
      Alert.alert('Error', 'Please fill all fields.');
      return;
    }
    if (newPin !== confirmPin) {
      Alert.alert('Error', 'New PIN and confirmation do not match.');
      return;
    }
    if (newPin.length < 4 || newPin.length > 8) {
      Alert.alert('Error', 'New PIN must be 4-8 characters.');
      return;
    }
    if (currentPin === newPin) {
      Alert.alert('Error', 'New PIN must be different from current PIN.');
      return;
    }

    setLoading(true);
    try {
      await apiClient.post('/api/auth/change-pin', {
        current_pin: currentPin,
        new_pin: newPin,
      });
      Alert.alert('Success', 'PIN changed successfully!', [
        { text: 'OK', onPress: () => navigation.goBack() },
      ]);
    } catch (err: any) {
      const error = err.response?.data?.error;
      const msg = error === 'WRONG_CURRENT_PIN'
        ? 'Current PIN is incorrect.'
        : error === 'SAME_PIN'
        ? 'New PIN must be different from current PIN.'
        : err.response?.data?.message || 'Failed to change PIN.';
      Alert.alert('Error', msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>

        <View style={styles.infoCard}>
          <Ionicons name="information-circle-outline" size={20} color="#2563eb" />
          <Text style={styles.infoText}>PIN must be 4-8 characters.</Text>
        </View>

        <View style={styles.formCard}>
          <Text style={styles.fieldLabel}>Current PIN</Text>
          <View style={styles.inputRow}>
            <TextInput
              style={styles.input}
              placeholder="Enter current PIN"
              placeholderTextColor="#9ca3af"
              secureTextEntry={!showCurrent}
              keyboardType="number-pad"
              value={currentPin}
              onChangeText={setCurrentPin}
            />
            <TouchableOpacity onPress={() => setShowCurrent(!showCurrent)} style={styles.eyeButton}>
              <Ionicons name={showCurrent ? 'eye-off-outline' : 'eye-outline'} size={20} color="#6b7280" />
            </TouchableOpacity>
          </View>

          <Text style={[styles.fieldLabel, { marginTop: 16 }]}>New PIN</Text>
          <View style={styles.inputRow}>
            <TextInput
              style={styles.input}
              placeholder="Enter new PIN"
              placeholderTextColor="#9ca3af"
              secureTextEntry={!showNew}
              keyboardType="number-pad"
              value={newPin}
              onChangeText={setNewPin}
            />
            <TouchableOpacity onPress={() => setShowNew(!showNew)} style={styles.eyeButton}>
              <Ionicons name={showNew ? 'eye-off-outline' : 'eye-outline'} size={20} color="#6b7280" />
            </TouchableOpacity>
          </View>

          <Text style={[styles.fieldLabel, { marginTop: 16 }]}>Confirm New PIN</Text>
          <View style={styles.inputRow}>
            <TextInput
              style={styles.input}
              placeholder="Confirm new PIN"
              placeholderTextColor="#9ca3af"
              secureTextEntry={!showConfirm}
              keyboardType="number-pad"
              value={confirmPin}
              onChangeText={setConfirmPin}
            />
            <TouchableOpacity onPress={() => setShowConfirm(!showConfirm)} style={styles.eyeButton}>
              <Ionicons name={showConfirm ? 'eye-off-outline' : 'eye-outline'} size={20} color="#6b7280" />
            </TouchableOpacity>
          </View>
        </View>

        <TouchableOpacity
          style={[styles.submitButton, loading && styles.disabledButton]}
          onPress={handleChange}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#ffffff" />
          ) : (
            <>
              <Ionicons name="key-outline" size={20} color="#ffffff" />
              <Text style={styles.submitText}>Change PIN</Text>
            </>
          )}
        </TouchableOpacity>

      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f3f4f6' },
  content: { padding: 16, gap: 16, paddingBottom: 40 },

  infoCard: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#eff6ff', borderRadius: 12, padding: 14,
    borderWidth: 1, borderColor: '#bfdbfe',
  },
  infoText: { fontSize: 14, color: '#2563eb', flex: 1 },

  formCard: {
    backgroundColor: '#ffffff', borderRadius: 16, padding: 20,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 3,
  },
  fieldLabel: { fontSize: 13, fontWeight: '600', color: '#374151', marginBottom: 8 },
  inputRow: { flexDirection: 'row', alignItems: 'center' },
  input: {
    flex: 1, height: 48, borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 10,
    paddingHorizontal: 14, fontSize: 16, color: '#111827', backgroundColor: '#f9fafb',
    letterSpacing: 4,
  },
  eyeButton: { position: 'absolute', right: 14 },

  submitButton: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
    backgroundColor: '#1e3a5f', borderRadius: 16, padding: 18,
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.15, shadowRadius: 8, elevation: 5,
  },
  disabledButton: { opacity: 0.5 },
  submitText: { fontSize: 17, fontWeight: 'bold', color: '#ffffff' },
});
