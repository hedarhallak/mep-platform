import React from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView, Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import Colors from '../../theme/colors';

// ------------------------------------------------------------------ types --

export interface SubMenuItem {
  id: string;
  label: string;
  description?: string;
  icon: any;
  color: string;
  bg: string;
  screen: string | null;
  params?: Record<string, any>;
  badge?: number;
  soon?: boolean;
}

interface SubMenuScreenProps {
  items: SubMenuItem[];
  title?: string;
}

// ================================================================ screen --

export default function SubMenuScreen({ items, title }: SubMenuScreenProps) {
  const { t } = useTranslation();
  const navigation = useNavigation<any>();

  const handlePress = (item: SubMenuItem) => {
    if (!item.screen || item.soon) {
      Alert.alert(t('common.comingSoon'), item.label);
      return;
    }
    navigation.navigate(item.screen, item.params);
  };

  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.grid}
        showsVerticalScrollIndicator={false}
      >
        {title && <Text style={styles.screenTitle}>{title}</Text>}
        <View style={styles.modulesGrid}>
          {items.map(item => (
            <TouchableOpacity
              key={item.id}
              style={[styles.moduleCard, item.soon && styles.moduleCardSoon]}
              onPress={() => handlePress(item)}
              activeOpacity={0.75}
            >
              <View style={[styles.moduleIcon, { backgroundColor: item.bg }]}>
                <Ionicons name={item.icon} size={28} color={item.color} />
              </View>
              <Text style={styles.moduleLabel}>{item.label}</Text>
              {item.description && (
                <Text style={styles.moduleDescription} numberOfLines={2}>
                  {item.description}
                </Text>
              )}
              {item.badge != null && item.badge > 0 && (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>
                    {item.badge > 99 ? '99+' : item.badge}
                  </Text>
                </View>
              )}
              {item.soon && (
                <View style={styles.soonBadge}>
                  <Text style={styles.soonText}>{t('common.comingSoon')}</Text>
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
  container: { flex: 1, backgroundColor: Colors.background },
  scroll:    { flex: 1 },
  grid:      { padding: 20, gap: 16, paddingBottom: 40 },

  screenTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginBottom: 4,
  },
  moduleDescription: {
    fontSize: 11,
    color: Colors.textMuted,
    textAlign: 'center',
    marginTop: 2,
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
  moduleCardSoon: { opacity: 0.7 },
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
  badge: {
    backgroundColor: Colors.danger,
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 5,
    position: 'absolute',
    top: 8,
    right: 8,
  },
  badgeText: { fontSize: 10, color: Colors.white, fontWeight: '700' },
  soonBadge: {
    backgroundColor: Colors.background,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  soonText: { fontSize: 10, color: Colors.textLight, fontWeight: '600' },
});
