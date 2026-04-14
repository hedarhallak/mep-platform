import React from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView, Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';

// ------------------------------------------------------------------ types --

export interface SubMenuItem {
  id: string;
  label: string;
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
}

// ================================================================ screen --

export default function SubMenuScreen({ items }: SubMenuScreenProps) {
  const navigation = useNavigation<any>();

  const handlePress = (item: SubMenuItem) => {
    if (!item.screen || item.soon) {
      Alert.alert('Coming Soon', `${item.label} will be available in the next update.`);
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
              {item.badge != null && item.badge > 0 && (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>
                    {item.badge > 99 ? '99+' : item.badge}
                  </Text>
                </View>
              )}
              {item.soon && (
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
  scroll:    { flex: 1 },
  grid:      { padding: 20, gap: 16, paddingBottom: 40 },

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
    color: '#374151',
    textAlign: 'center',
  },
  badge: {
    backgroundColor: '#dc2626',
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
  badgeText: { fontSize: 10, color: '#fff', fontWeight: '700' },
  soonBadge: {
    backgroundColor: '#f3f4f6',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  soonText: { fontSize: 10, color: '#9ca3af', fontWeight: '600' },
});
