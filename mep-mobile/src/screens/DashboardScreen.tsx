import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  StatusBar,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useAuthStore } from '../store/useAuthStore';

// ------------------------------------------------------------------ types --

interface Module {
  id: string;
  label: string;
  icon: any;
  color: string;
  bg: string;
  screen: string | null;
  roles: string[];
}

// --------------------------------------------------------------- modules --

const ALL_MODULES: Module[] = [
  {
    id: 'attendance',
    label: 'Attendance',
    icon: 'location-outline',
    color: '#1e3a5f',
    bg: '#eff6ff',
    screen: 'Attendance',
    roles: ['ALL'],
  },
  {
    id: 'materials',
    label: 'Materials',
    icon: 'cube-outline',
    color: '#0891b2',
    bg: '#ecfeff',
    screen: 'Materials',
    roles: ['ALL'],
  },
  {
    id: 'report',
    label: 'My Report',
    icon: 'bar-chart-outline',
    color: '#7c3aed',
    bg: '#f5f3ff',
    screen: 'Report',
    roles: ['ALL'],
  },
  {
    id: 'assignments',
    label: 'Assignments',
    icon: 'clipboard-outline',
    color: '#d97706',
    bg: '#fffbeb',
    screen: null,
    roles: ['FOREMAN', 'TRADE_ADMIN', 'TRADE_PROJECT_MANAGER', 'COMPANY_ADMIN', 'SUPER_ADMIN', 'IT_ADMIN'],
  },
  {
    id: 'standup',
    label: 'Standup',
    icon: 'people-outline',
    color: '#059669',
    bg: '#ecfdf5',
    screen: null,
    roles: ['FOREMAN', 'TRADE_ADMIN', 'TRADE_PROJECT_MANAGER', 'COMPANY_ADMIN', 'SUPER_ADMIN'],
  },
  {
    id: 'purchase_orders',
    label: 'Purchase Orders',
    icon: 'document-text-outline',
    color: '#6d28d9',
    bg: '#f5f3ff',
    screen: null,
    roles: ['FOREMAN', 'TRADE_ADMIN', 'TRADE_PROJECT_MANAGER', 'COMPANY_ADMIN', 'SUPER_ADMIN', 'IT_ADMIN'],
  },
];

// --------------------------------------------------------- role helpers --

function getVisibleModules(role: string): Module[] {
  const r = (role || '').toUpperCase();
  return ALL_MODULES.filter(m => {
    if (m.roles.includes('ALL')) return true;
    return m.roles.map(x => x.toUpperCase()).includes(r);
  });
}

function getRoleLabel(role: string): string {
  const map: Record<string, string> = {
    SUPER_ADMIN: 'Super Admin',
    IT_ADMIN: 'IT Admin',
    COMPANY_ADMIN: 'Company Admin',
    TRADE_PROJECT_MANAGER: 'Project Manager',
    TRADE_ADMIN: 'Trade Admin',
    FOREMAN: 'Foreman',
    JOURNEYMAN: 'Journeyman',
    APPRENTICE_4: 'Apprentice 4',
    APPRENTICE_3: 'Apprentice 3',
    APPRENTICE_2: 'Apprentice 2',
    APPRENTICE_1: 'Apprentice 1',
    WORKER: 'Worker',
    DRIVER: 'Driver',
  };
  return map[role?.toUpperCase()] || role || 'Worker';
}

function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}

function getDisplayName(user: any): string {
  if (user?.name && user.name.trim()) return user.name.split(' ')[0];
  if (user?.username && user.username.trim()) {
    const u = user.username.split('@')[0];
    return u.charAt(0).toUpperCase() + u.slice(1);
  }
  return 'there';
}

// ================================================================ screen --

export default function DashboardScreen() {
  const navigation = useNavigation<any>();
  const user = useAuthStore(s => s.user);
  const role = user?.role || 'WORKER';
  const modules = getVisibleModules(role);
  const displayName = getDisplayName(user);

  const handleModulePress = (mod: Module) => {
    if (mod.screen) {
      navigation.navigate(mod.screen);
    } else {
      Alert.alert('Coming Soon', `${mod.label} module will be available in the next update.`);
    }
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#1e3a5f" />

      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.greeting}>{getGreeting()},</Text>
          <Text style={styles.name}>{displayName}</Text>
        </View>
        <View style={styles.roleBadge}>
          <Text style={styles.roleText}>{getRoleLabel(role)}</Text>
        </View>
      </View>

      {/* Modules Grid */}
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.grid}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.sectionTitle}>Quick Access</Text>

        <View style={styles.modulesGrid}>
          {modules.map(mod => (
            <TouchableOpacity
              key={mod.id}
              style={[styles.moduleCard, !mod.screen && styles.moduleCardSoon]}
              onPress={() => handleModulePress(mod)}
              activeOpacity={0.75}
            >
              <View style={[styles.moduleIcon, { backgroundColor: mod.bg }]}>
                <Ionicons name={mod.icon} size={28} color={mod.color} />
              </View>
              <Text style={styles.moduleLabel}>{mod.label}</Text>
              {!mod.screen && (
                <View style={styles.soonBadge}>
                  <Text style={styles.soonText}>Soon</Text>
                </View>
              )}
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

// ----------------------------------------------------------------- styles --

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f3f4f6' },

  header: {
    backgroundColor: '#1e3a5f',
    paddingTop: 56,
    paddingBottom: 24,
    paddingHorizontal: 24,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
  },
  greeting: { fontSize: 14, color: 'rgba(255,255,255,0.7)', marginBottom: 2 },
  name: { fontSize: 24, fontWeight: 'bold', color: '#ffffff' },
  roleBadge: {
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  roleText: { fontSize: 12, color: '#ffffff', fontWeight: '600' },

  scroll: { flex: 1 },
  grid: { padding: 20, gap: 16, paddingBottom: 40 },

  sectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#6b7280',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 4,
  },

  modulesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  moduleCard: {
    width: '47%',
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
    gap: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },
  moduleCardSoon: {
    opacity: 0.7,
  },
  moduleIcon: {
    width: 56,
    height: 56,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  moduleLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#374151',
    textAlign: 'center',
  },
  soonBadge: {
    backgroundColor: '#f3f4f6',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  soonText: {
    fontSize: 10,
    color: '#9ca3af',
    fontWeight: '600',
  },
});
