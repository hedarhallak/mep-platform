import React, { useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  StatusBar,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useAuthStore } from '../store/useAuthStore';
import { usePermsStore } from '../store/usePermsStore';
import { useTranslation } from 'react-i18next';
import Colors from '../theme/colors';

// ------------------------------------------------------------------ types --

interface Module {
  id: string;
  label: string;
  icon: any;
  color: string;
  bg: string;
  screen: string | null;
  // §149: visible when the user holds ANY of these [module, action] permissions
  // (empty = always visible). Mirrors the web AppLayout's permission gating.
  perms: [string, string][];
}

function getDisplayName(user: any): string {
  if (user?.name && user.name.trim()) return user.name.split(' ')[0];
  if (user?.username && user.username.trim()) {
    const u = user.username.split('@')[0];
    return u.charAt(0).toUpperCase() + u.slice(1);
  }
  return 'there';
}

function getRoleLabel(role: string): string {
  const map: Record<string, string> = {
    SUPER_ADMIN: 'Super Admin', IT_ADMIN: 'IT Admin', COMPANY_ADMIN: 'Company Admin',
    TRADE_PROJECT_MANAGER: 'Project Manager', TRADE_ADMIN: 'Trade Admin',
    FOREMAN: 'Foreman', JOURNEYMAN: 'Journeyman', APPRENTICE_4: 'Apprentice 4',
    APPRENTICE_3: 'Apprentice 3', APPRENTICE_2: 'Apprentice 2', APPRENTICE_1: 'Apprentice 1',
    WORKER: 'Worker', DRIVER: 'Driver',
  };
  return map[role?.toUpperCase()] || role || 'Worker';
}

export default function DashboardScreen() {
  const navigation = useNavigation<any>();
  const { t } = useTranslation();
  const user = useAuthStore(s => s.user);

  const ALL_MODULES: Module[] = [
    { id: 'attendance', label: t('modules.attendance'), icon: 'location-outline', color: Colors.primary, bg: Colors.primaryPale, screen: 'Attendance', perms: [['attendance', 'view_self'], ['attendance', 'view'], ['attendance', 'checkin']] },
    { id: 'materials', label: t('modules.materials'), icon: 'cube-outline', color: '#0891b2', bg: '#ecfeff', screen: 'Materials', perms: [['materials', 'request_submit'], ['materials', 'request_view_own'], ['materials', 'catalog_view']] },
    { id: 'report', label: t('modules.report'), icon: 'bar-chart-outline', color: '#7c3aed', bg: '#f5f3ff', screen: 'Report', perms: [['reports', 'view_self'], ['reports', 'view']] },
    { id: 'tasks', label: t('modules.tasks'), icon: 'checkmark-circle-outline', color: Colors.danger, bg: Colors.dangerBg, screen: 'Tasks', perms: [['hub', 'send_tasks']] },
    { id: 'assignments', label: t('modules.assignments'), icon: 'clipboard-outline', color: '#d97706', bg: '#fffbeb', screen: 'SubmitRequest', perms: [['assignments', 'create']] },
    { id: 'pending_requests', label: t('modules.pendingRequests'), icon: 'checkmark-done-outline', color: '#0d9488', bg: '#f0fdfa', screen: 'PendingRequests', perms: [['assignments', 'edit']] },
    { id: 'standup', label: t('modules.standup'), icon: 'people-outline', color: '#059669', bg: '#ecfdf5', screen: null, perms: [['standup', 'manage']] },
    { id: 'purchase_orders', label: t('modules.purchaseOrders'), icon: 'document-text-outline', color: '#6d28d9', bg: '#f5f3ff', screen: 'PurchaseOrders', perms: [['purchase_orders', 'view'], ['purchase_orders', 'view_own']] },
    { id: 'expenses', label: t('modules.expenses'), icon: 'receipt-outline', color: '#ea580c', bg: '#fff7ed', screen: 'Expenses', perms: [['expense_claims', 'submit'], ['expense_claims', 'view']] },
    { id: 'surplus', label: t('modules.surplus'), icon: 'repeat-outline', color: '#0d9488', bg: '#f0fdfa', screen: 'Surplus', perms: [['materials', 'surplus_view'], ['materials', 'surplus_declare']] },
    { id: 'tools', label: t('modules.tools'), icon: 'construct-outline', color: '#b45309', bg: '#fffbeb', screen: 'Tools', perms: [['materials', 'request_submit']] },
    { id: 'crews', label: t('modules.crews'), icon: 'people-circle-outline', color: '#7c3aed', bg: '#f5f3ff', screen: 'Crews', perms: [['assignments', 'view']] },
  ];
  const canAny = usePermsStore(s => s.canAny);
  const permsLoaded = usePermsStore(s => s.loaded);
  const fetchPerms = usePermsStore(s => s.fetchPerms);
  // Refresh permissions when the Dashboard mounts (covers a failed login-time
  // fetch + reflects any company/user permission change since last load).
  useEffect(() => { fetchPerms(); }, [fetchPerms]);

  const modules = ALL_MODULES.filter(m => m.perms.length === 0 || canAny(m.perms));
  const role = user?.role || 'WORKER';
  const displayName = getDisplayName(user);

  const handleModulePress = (mod: Module) => {
    if (mod.screen) {
      navigation.navigate(mod.screen);
    } else {
      Alert.alert(t('common.comingSoon'), `${mod.label}`);
    }
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={Colors.primary} />

      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.greeting}>{new Date().getHours() < 12 ? t('dashboard.greeting.morning') : new Date().getHours() < 18 ? t('dashboard.greeting.afternoon') : t('dashboard.greeting.evening')},</Text>
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
        <Text style={styles.sectionTitle}>{t('dashboard.quickAccess')}</Text>

        {!permsLoaded ? (
          <ActivityIndicator color={Colors.primary} style={{ marginTop: 40 }} />
        ) : (
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
                  <Text style={styles.soonText}>{t('common.comingSoon')}</Text>
                </View>
              )}
            </TouchableOpacity>
          ))}
        </View>
        )}
      </ScrollView>
    </View>
  );
}

// ----------------------------------------------------------------- styles --

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },

  header: {
    backgroundColor: Colors.primary,
    paddingTop: 56,
    paddingBottom: 24,
    paddingHorizontal: 24,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
  },
  greeting: { fontSize: 14, color: 'rgba(255,255,255,0.7)', marginBottom: 2 },
  name: { fontSize: 24, fontWeight: 'bold', color: Colors.white },
  roleBadge: {
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  roleText: { fontSize: 12, color: Colors.white, fontWeight: '600' },

  scroll: { flex: 1 },
  grid: { padding: 20, gap: 16, paddingBottom: 40 },

  sectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.textMuted,
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
    backgroundColor: Colors.cardBg,
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
    gap: 10,
    shadowColor: Colors.shadowColor,
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
    color: Colors.textSecondary,
    textAlign: 'center',
  },
  soonBadge: {
    backgroundColor: Colors.background,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  soonText: {
    fontSize: 10,
    color: Colors.textLight,
    fontWeight: '600',
  },
});
