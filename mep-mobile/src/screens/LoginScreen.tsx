import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { apiClient } from '../api/client';
import { useAuthStore } from '../store/useAuthStore';

export default function LoginScreen() {
  const [username, setUsername] = useState('');
  const [pin, setPin] = useState('');
  const [loading, setLoading] = useState(false);
  const { setAuth } = useAuthStore();

  const handleLogin = async () => {
    if (!username.trim() || !pin.trim()) {
      Alert.alert('Error', 'Please enter username and PIN.');
      return;
    }
    setLoading(true);
    try {
      const response = await apiClient.post('/api/auth/login', { username, pin });
      const { ok, token, user } = response.data;
      if (!ok) throw new Error('Login failed');
      await setAuth(user, token);
    } catch (err: any) {
      const status = err.response?.status;
      const data = err.response?.data;
      Alert.alert(
        'Login Failed',
        `Status: ${status}\nError: ${JSON.stringify(data)}`
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.card}>
        <Text style={styles.brand}>CONSTRAI</Text>
        <Text style={styles.subtitle}>MEP Platform</Text>

        <TextInput
          style={styles.input}
          placeholder="Username"
          placeholderTextColor="#9ca3af"
          autoCapitalize="none"
          autoCorrect={false}
          value={username}
          onChangeText={setUsername}
        />
        <TextInput
          style={styles.input}
          placeholder="PIN"
          placeholderTextColor="#9ca3af"
          secureTextEntry
          keyboardType="number-pad"
          value={pin}
          onChangeText={setPin}
        />

        <TouchableOpacity style={styles.button} onPress={handleLogin} disabled={loading}>
          {loading ? (
            <ActivityIndicator color="#ffffff" />
          ) : (
            <Text style={styles.buttonText}>Sign In</Text>
          )}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1e3a5f',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  card: {
    width: '100%',
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 32,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
  },
  brand: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#1e3a5f',
    letterSpacing: 2,
  },
  subtitle: {
    fontSize: 14,
    color: '#6b7280',
    marginBottom: 32,
    marginTop: 4,
  },
  input: {
    width: '100%',
    height: 48,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 8,
    paddingHorizontal: 16,
    fontSize: 15,
    color: '#111827',
    backgroundColor: '#f9fafb',
    marginBottom: 12,
  },
  button: {
    width: '100%',
    height: 48,
    backgroundColor: '#1e3a5f',
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 8,
  },
  buttonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
});
