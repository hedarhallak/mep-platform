import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { apiClient } from '../../api/client';
import { useAuthStore } from '../../store/useAuthStore';
import { useNavigation } from '@react-navigation/native';

interface Profile {
  employee_id: number;
  employee_code: string;
  full_name: string;
  email: string;
  phone: string | null;
  trade_code: string | null;
  rank_code: string | null;
  home_address: string | null;
  distance_km: number | null;
  ccq_sector: string | null;
}

function InfoRow({ icon, label, value }: { icon: any; label: string; value: string | null }) {
  if (!value) return null;
  return (
    <View style={styles.infoRow}>
      <View style={styles.infoIcon}>
        <Ionicons name={icon} size={18} color="#1e3a5f" />
      </View>
      <View style={styles.infoContent}>
        <Text style={styles.infoLabel}>{label}</Text>
        <Text style={styles.infoValue}>{value}</Text>
      </View>
    </View>
  );
}

export default function ProfileScreen() {
  const { user, logout } = useAuthStore();
  const navigation = useNavigation<any>();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchProfile = useCallback(async () => {
    try {
      const res = await apiClient.get('/api/profile/me');
      setProfile(res.data?.profile || res.data || null);
    } catch {
      setProfile(null);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchProfile();
  }, [fetchProfile]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchProfile();
  };

  const handleLogout = () => {
    Alert.alert(
      'Sign Out',
      'Are you sure you want to sign out?',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Sign Out', style: 'destructive', onPress: logout },
      ]
    );
  };

  if (loading) {
    return <View style={styles.center}><ActivityIndicator size="large" color="#1e3a5f" /></View>;
  }

  const initials = profile?.full_name
    ? profile.full_name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase()
    : '??';

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#1e3a5f" />}
    >
      <View style={styles.avatarCard}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{initials}</Text>
        </View>
        <Text style={styles.fullName}>{profile?.full_name || user?.name || '—'}</Text>
        <View style={styles.roleBadge}>
          <Text style={styles.roleText}>{user?.role || '—'}</Text>
        </View>
        {profile?.employee_code && (
          <Text style={styles.empCode}>#{profile.employee_code}</Text>
        )}
      </View>

      <View style={styles.infoCard}>
        <Text style={styles.sectionTitle}>Information</Text>
        <InfoRow icon="mail-outline" label="Email" value={profile?.email || null} />
        <InfoRow icon="call-outline" label="Phone" value={profile?.phone || null} />
        <InfoRow icon="construct-outline" label="Trade" value={profile?.trade_code || null} />
        <InfoRow icon="ribbon-outline" label="Rank" value={profile?.rank_code || null} />
        <InfoRow icon="location-outline" label="Address" value={profile?.home_address || null} />
        <InfoRow icon="car-outline" label="Distance" value={profile?.distance_km ? `${profile.distance_km} km` : null} />
        <InfoRow icon="business-outline" label="CCQ Sector" value={profile?.ccq_sector || null} />
      </View>

      <View style={styles.actionsCard}>
        <Text style={styles.sectionTitle}>Settings</Text>
        <TouchableOpacity style={styles.actionRow} onPress={() => navigation.navigate('ChangePin')}>
          <View style={styles.actionLeft}>
            <Ionicons name="key-outline" size={20} color="#1e3a5f" />
            <Text style={styles.actionText}>Change PIN</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color="#9ca3af" />
        </TouchableOpacity>
      </View>

      <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
        <Ionicons name="log-out-outline" size={20} color="#dc2626" />
        <Text style={styles.logoutText}>Sign Out</Text>
      </TouchableOpacity>

      <Text style={styles.version}>MEP Platform v1.0.0</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f3f4f6' },
  content: { padding: 16, gap: 16, paddingBottom: 40 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  avatarCard: {
    backgroundColor: '#1e3a5f', borderRadius: 20, padding: 32,
    alignItems: 'center',
  },
  avatar: {
    width: 80, height: 80, borderRadius: 40,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center', alignItems: 'center', marginBottom: 12,
  },
  avatarText: { fontSize: 28, fontWeight: 'bold', color: '#ffffff' },
  fullName: { fontSize: 22, fontWeight: 'bold', color: '#ffffff', marginBottom: 8 },
  roleBadge: { backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 20, paddingHorizontal: 14, paddingVertical: 4, marginBottom: 6 },
  roleText: { fontSize: 13, color: '#93c5fd', fontWeight: '600' },
  empCode: { fontSize: 13, color: 'rgba(255,255,255,0.5)' },

  infoCard: {
    backgroundColor: '#ffffff', borderRadius: 16, padding: 20,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 3,
  },
  sectionTitle: { fontSize: 13, fontWeight: '700', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 16 },

  infoRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16 },
  infoIcon: { width: 36, height: 36, borderRadius: 10, backgroundColor: '#eff6ff', justifyContent: 'center', alignItems: 'center' },
  infoContent: { flex: 1 },
  infoLabel: { fontSize: 12, color: '#9ca3af', marginBottom: 2 },
  infoValue: { fontSize: 15, color: '#111827', fontWeight: '500' },

  actionsCard: {
    backgroundColor: '#ffffff', borderRadius: 16, padding: 20,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 3,
  },
  actionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 4 },
  actionLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  actionText: { fontSize: 15, color: '#111827', fontWeight: '500' },

  logoutButton: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: '#ffffff', borderRadius: 16, padding: 18,
    borderWidth: 1, borderColor: '#fecaca',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 3,
  },
  logoutText: { fontSize: 16, fontWeight: '600', color: '#dc2626' },

  version: { textAlign: 'center', fontSize: 12, color: '#9ca3af' },
});
