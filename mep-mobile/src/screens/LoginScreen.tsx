import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  Alert, KeyboardAvoidingView, Platform, ActivityIndicator,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { apiClient } from '../api/client';
import { useAuthStore } from '../store/useAuthStore';
import Colors from '../theme/colors';

export default function LoginScreen() {
  const { t } = useTranslation();
  const [username, setUsername] = useState('');
  const [pin, setPin] = useState('');
  const [loading, setLoading] = useState(false);
  const { setAuth } = useAuthStore();

  const handleLogin = async () => {
    if (!username.trim() || !pin.trim()) {
      Alert.alert(t('common.error'), t('errors.titleRequired'));
      return;
    }
    setLoading(true);
    try {
      const response = await apiClient.post('/api/auth/login', { username, pin });
      const { ok, token, user } = response.data;
      if (!ok) throw new Error('Login failed');
      await setAuth(user, token);
    } catch (err: any) {
      Alert.alert(t('common.error'), t('errors.serverError'));
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
        <Text style={styles.subtitle}>{t('auth.loginSubtitle')}</Text>

        <TextInput
          style={styles.input}
          placeholder={t('auth.usernamePlaceholder')}
          placeholderTextColor={Colors.textLight}
          autoCapitalize="none"
          autoCorrect={false}
          value={username}
          onChangeText={setUsername}
        />
        <TextInput
          style={styles.input}
          placeholder={t('auth.pinPlaceholder')}
          placeholderTextColor={Colors.textLight}
          secureTextEntry
          keyboardType="number-pad"
          value={pin}
          onChangeText={setPin}
        />

        <TouchableOpacity style={styles.button} onPress={handleLogin} disabled={loading}>
          {loading ? (
            <ActivityIndicator color={Colors.white} />
          ) : (
            <Text style={styles.buttonText}>{t('auth.login')}</Text>
          )}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.primary, justifyContent: 'center', alignItems: 'center', padding: 24 },
  card: { width: '100%', backgroundColor: Colors.cardBg, borderRadius: 16, padding: 32, alignItems: 'center', shadowColor: Colors.shadowColor, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.15, shadowRadius: 12, elevation: 8 },
  brand: { fontSize: 28, fontWeight: 'bold', color: Colors.primary, letterSpacing: 2 },
  subtitle: { fontSize: 14, color: Colors.textMuted, marginBottom: 32, marginTop: 4 },
  input: { width: '100%', height: 48, borderWidth: 1, borderColor: Colors.divider, borderRadius: 8, paddingHorizontal: 16, fontSize: 15, color: Colors.textPrimary, backgroundColor: Colors.inputBg, marginBottom: 12 },
  button: { width: '100%', height: 48, backgroundColor: Colors.primary, borderRadius: 8, justifyContent: 'center', alignItems: 'center', marginTop: 8 },
  buttonText: { color: Colors.white, fontSize: 16, fontWeight: '600' },
});
