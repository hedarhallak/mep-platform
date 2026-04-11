import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  Modal,
  TextInput,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { apiClient } from '../../api/client';
import { useAuthStore } from '../../store/useAuthStore';

interface HubMessage {
  id: number;
  type: string;
  title: string;
  body: string;
  priority: string;
  due_date: string | null;
  created_at: string;
  project_name: string;
  project_code: string;
  status: string;
  read_at: string | null;
  acknowledged_at: string | null;
  sender_first: string;
  sender_last: string;
}

interface Worker {
  id: number;
  employee_id: number;
  first_name: string;
  last_name: string;
  role: string;
}

interface Project {
  id: number;
  project_code: string;
  project_name: string;
}

const CAN_SEND_ROLES = ['FOREMAN', 'TRADE_ADMIN', 'TRADE_PROJECT_MANAGER', 'COMPANY_ADMIN', 'IT_ADMIN', 'SUPER_ADMIN'];

function fmtDateTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('en-CA', { month: 'short', day: 'numeric' }) +
    ' ' + d.toLocaleTimeString('en-CA', { hour: '2-digit', minute: '2-digit', hour12: false });
}

function getPriorityColor(priority: string): string {
  switch (priority) {
    case 'URGENT': return '#dc2626';
    case 'HIGH': return '#f59e0b';
    case 'NORMAL': return '#2563eb';
    default: return '#6b7280';
  }
}

function getTypeIcon(type: string): any {
  switch (type) {
    case 'TASK': return 'checkmark-circle-outline';
    case 'MATERIAL': return 'cube-outline';
    case 'SAFETY': return 'shield-checkmark-outline';
    case 'GENERAL': return 'chatbubble-outline';
    default: return 'mail-outline';
  }
}

const TABS = [
  { key: 'ALL', label: 'All' },
  { key: 'TASK', label: 'Tasks' },
  { key: 'MATERIAL', label: 'Materials' },
  { key: 'GENERAL', label: 'General' },
];

const PRIORITIES = ['NORMAL', 'HIGH', 'URGENT'];

export default function MyHubScreen() {
  const { user } = useAuthStore();
  const [messages, setMessages] = useState<HubMessage[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState('ALL');

  const [showSendModal, setShowSendModal] = useState(false);
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loadingModal, setLoadingModal] = useState(false);
  const [selectedWorker, setSelectedWorker] = useState<Worker | null>(null);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [taskTitle, setTaskTitle] = useState('');
  const [taskBody, setTaskBody] = useState('');
  const [taskPriority, setTaskPriority] = useState('NORMAL');
  const [taskDueDate, setTaskDueDate] = useState('');
  const [sending, setSending] = useState(false);

  const canSend = user?.role && CAN_SEND_ROLES.includes(user.role);

  const fetchMessages = useCallback(async () => {
    try {
      const [inboxRes, countRes] = await Promise.all([
        apiClient.get('/api/hub/messages/inbox'),
        apiClient.get('/api/hub/messages/unread-count'),
      ]);
      setMessages(inboxRes.data?.messages || []);
      setUnreadCount(Number(countRes.data?.count || 0));
    } catch {
      setMessages([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchMessages();
  }, [fetchMessages]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchMessages();
  };

  const markAsRead = async (id: number) => {
    try {
      await apiClient.patch(`/api/hub/messages/${id}/read`);
      setMessages(prev => prev.map(m => m.id === id ? { ...m, read_at: new Date().toISOString() } : m));
      setUnreadCount(prev => Math.max(0, prev - 1));
    } catch {}
  };

  const acknowledge = async (id: number) => {
    try {
      await apiClient.patch(`/api/hub/messages/${id}/ack`);
      setMessages(prev => prev.map(m => m.id === id ? { ...m, acknowledged_at: new Date().toISOString() } : m));
    } catch {}
  };

  const openSendModal = async () => {
    setShowSendModal(true);
    setLoadingModal(true);
    setSelectedWorker(null);
    setSelectedProject(null);
    setTaskTitle('');
    setTaskBody('');
    setTaskPriority('NORMAL');
    setTaskDueDate('');
    try {
      const [workersRes, projectsRes] = await Promise.all([
        apiClient.get('/api/hub/workers'),
        apiClient.get('/api/hub/my-projects'),
      ]);
      setWorkers(workersRes.data?.workers || []);
      setProjects(projectsRes.data?.projects || []);
    } catch {
      setWorkers([]);
      setProjects([]);
    } finally {
      setLoadingModal(false);
    }
  };

  const sendTask = async () => {
    if (!selectedWorker) {
      Alert.alert('Error', 'Please select a recipient.');
      return;
    }
    if (!taskTitle.trim()) {
      Alert.alert('Error', 'Please enter a task title.');
      return;
    }
    setSending(true);
    try {
      await apiClient.post('/api/hub/messages', {
        title: taskTitle.trim(),
        body: taskBody.trim() || undefined,
        type: 'TASK',
        priority: taskPriority,
        due_date: taskDueDate.trim() || undefined,
        project_id: selectedProject?.id || undefined,
        recipient_ids: JSON.stringify([selectedWorker.id]),
      });
      setShowSendModal(false);
      Alert.alert('Sent', `Task sent to ${selectedWorker.first_name} ${selectedWorker.last_name}.`);
      fetchMessages();
    } catch (err: any) {
      const msg = err.response?.data?.message || err.response?.data?.error || 'Failed to send task.';
      Alert.alert('Error', msg);
    } finally {
      setSending(false);
    }
  };

  const filtered = activeTab === 'ALL' ? messages : messages.filter(m => m.type === activeTab);

  if (loading) {
    return <View style={styles.center}><ActivityIndicator size="large" color="#1e3a5f" /></View>;
  }

  return (
    <>
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#1e3a5f" />}
      >
        <View style={styles.headerCard}>
          <View style={styles.headerLeft}>
            <Ionicons name="notifications-outline" size={22} color="#1e3a5f" />
            <Text style={styles.headerTitle}>My Hub</Text>
          </View>
          <View style={styles.headerRight}>
            {unreadCount > 0 && (
              <View style={styles.unreadBadge}>
                <Text style={styles.unreadText}>{unreadCount} unread</Text>
              </View>
            )}
            {canSend && (
              <TouchableOpacity style={styles.sendButton} onPress={openSendModal}>
                <Ionicons name="send-outline" size={16} color="#ffffff" />
                <Text style={styles.sendButtonText}>Send Task</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabsScroll}>
          <View style={styles.tabsRow}>
            {TABS.map(tab => {
              const count = tab.key === 'ALL'
                ? messages.filter(m => !m.read_at).length
                : messages.filter(m => m.type === tab.key && !m.read_at).length;
              return (
                <TouchableOpacity
                  key={tab.key}
                  style={[styles.tab, activeTab === tab.key && styles.tabActive]}
                  onPress={() => setActiveTab(tab.key)}
                >
                  <Text style={[styles.tabText, activeTab === tab.key && styles.tabTextActive]}>
                    {tab.label}
                  </Text>
                  {count > 0 && (
                    <View style={styles.tabBadge}>
                      <Text style={styles.tabBadgeText}>{count}</Text>
                    </View>
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
        </ScrollView>

        {filtered.length === 0 ? (
          <View style={styles.emptyCard}>
            <Ionicons name="mail-outline" size={40} color="#d1d5db" />
            <Text style={styles.emptyText}>No messages here</Text>
          </View>
        ) : (
          filtered.map(msg => (
            <TouchableOpacity
              key={msg.id}
              style={[styles.messageCard, !msg.read_at && styles.unreadCard]}
              onPress={() => !msg.read_at && markAsRead(msg.id)}
              activeOpacity={0.8}
            >
              <View style={styles.messageHeader}>
                <View style={styles.typeRow}>
                  <Ionicons name={getTypeIcon(msg.type)} size={18} color="#1e3a5f" />
                  <Text style={styles.messageType}>{msg.type}</Text>
                  <View style={[styles.priorityBadge, { backgroundColor: getPriorityColor(msg.priority) + '20' }]}>
                    <Text style={[styles.priorityText, { color: getPriorityColor(msg.priority) }]}>{msg.priority}</Text>
                  </View>
                </View>
                {!msg.read_at && <View style={styles.unreadDot} />}
              </View>
              <Text style={styles.messageTitle}>{msg.title}</Text>
              {msg.body ? <Text style={styles.messageBody} numberOfLines={3}>{msg.body}</Text> : null}
              <View style={styles.messageMeta}>
                <View style={styles.metaRow}>
                  <Ionicons name="business-outline" size={13} color="#9ca3af" />
                  <Text style={styles.metaText}>{msg.project_name || 'General'}</Text>
                </View>
                <View style={styles.metaRow}>
                  <Ionicons name="person-outline" size={13} color="#9ca3af" />
                  <Text style={styles.metaText}>{msg.sender_first} {msg.sender_last}</Text>
                </View>
                <View style={styles.metaRow}>
                  <Ionicons name="time-outline" size={13} color="#9ca3af" />
                  <Text style={styles.metaText}>{fmtDateTime(msg.created_at)}</Text>
                </View>
              </View>
              {msg.due_date && (
                <View style={styles.dueRow}>
                  <Ionicons name="calendar-outline" size={14} color="#dc2626" />
                  <Text style={styles.dueText}>Due: {msg.due_date}</Text>
                </View>
              )}
              {msg.read_at && !msg.acknowledged_at && (
                <TouchableOpacity style={styles.ackButton} onPress={() => acknowledge(msg.id)}>
                  <Ionicons name="checkmark-done-outline" size={16} color="#ffffff" />
                  <Text style={styles.ackText}>Acknowledge</Text>
                </TouchableOpacity>
              )}
              {msg.acknowledged_at && (
                <View style={styles.ackDoneRow}>
                  <Ionicons name="checkmark-done" size={15} color="#16a34a" />
                  <Text style={styles.ackDoneText}>Acknowledged</Text>
                </View>
              )}
            </TouchableOpacity>
          ))
        )}
      </ScrollView>

      <Modal visible={showSendModal} animationType="slide" presentationStyle="pageSheet">
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={styles.modalContainer}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Send Task</Text>
              <TouchableOpacity onPress={() => setShowSendModal(false)}>
                <Ionicons name="close" size={24} color="#111827" />
              </TouchableOpacity>
            </View>
            {loadingModal ? (
              <View style={styles.center}>
                <ActivityIndicator size="large" color="#1e3a5f" />
              </View>
            ) : (
              <ScrollView style={styles.modalBody} keyboardShouldPersistTaps="handled">
                <Text style={styles.fieldLabel}>Recipient *</Text>
                {workers.length === 0 ? (
                  <Text style={styles.noDataText}>No workers found.</Text>
                ) : (
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 8 }}>
                    <View style={{ flexDirection: 'row', gap: 8 }}>
                      {workers.map(w => (
                        <TouchableOpacity
                          key={w.id}
                          style={[styles.chip, selectedWorker?.id === w.id && styles.chipSelected]}
                          onPress={() => setSelectedWorker(w)}
                        >
                          <Text style={[styles.chipText, selectedWorker?.id === w.id && styles.chipTextSelected]}>
                            {w.first_name} {w.last_name}
                          </Text>
                          <Text style={[styles.chipSub, selectedWorker?.id === w.id && { color: '#93c5fd' }]}>
                            {w.role}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </ScrollView>
                )}

                <Text style={styles.fieldLabel}>Project (optional)</Text>
                {projects.length === 0 ? (
                  <Text style={styles.noDataText}>No projects found.</Text>
                ) : (
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 8 }}>
                    <View style={{ flexDirection: 'row', gap: 8 }}>
                      {projects.map(p => (
                        <TouchableOpacity
                          key={p.id}
                          style={[styles.chip, selectedProject?.id === p.id && styles.chipSelected]}
                          onPress={() => setSelectedProject(selectedProject?.id === p.id ? null : p)}
                        >
                          <Text style={[styles.chipText, selectedProject?.id === p.id && styles.chipTextSelected]}>
                            {p.project_name}
                          </Text>
                          <Text style={[styles.chipSub, selectedProject?.id === p.id && { color: '#93c5fd' }]}>
                            {p.project_code}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </ScrollView>
                )}

                <Text style={styles.fieldLabel}>Title *</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Task title..."
                  placeholderTextColor="#9ca3af"
                  value={taskTitle}
                  onChangeText={setTaskTitle}
                />

                <Text style={styles.fieldLabel}>Description</Text>
                <TextInput
                  style={[styles.input, styles.textArea]}
                  placeholder="Task details..."
                  placeholderTextColor="#9ca3af"
                  value={taskBody}
                  onChangeText={setTaskBody}
                  multiline
                  numberOfLines={4}
                />

                <Text style={styles.fieldLabel}>Priority</Text>
                <View style={styles.priorityRow}>
                  {PRIORITIES.map(p => (
                    <TouchableOpacity
                      key={p}
                      style={[styles.priorityChip, taskPriority === p && { backgroundColor: getPriorityColor(p), borderColor: getPriorityColor(p) }]}
                      onPress={() => setTaskPriority(p)}
                    >
                      <Text style={[styles.priorityChipText, taskPriority === p && { color: '#ffffff' }]}>{p}</Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <Text style={styles.fieldLabel}>Due Date (optional)</Text>
                <TextInput
                  style={styles.input}
                  placeholder="YYYY-MM-DD"
                  placeholderTextColor="#9ca3af"
                  value={taskDueDate}
                  onChangeText={setTaskDueDate}
                />

                <TouchableOpacity
                  style={[styles.submitButton, sending && { opacity: 0.6 }]}
                  onPress={sendTask}
                  disabled={sending}
                >
                  {sending ? (
                    <ActivityIndicator color="#ffffff" />
                  ) : (
                    <>
                      <Ionicons name="send" size={18} color="#ffffff" />
                      <Text style={styles.submitButtonText}>Send Task</Text>
                    </>
                  )}
                </TouchableOpacity>
              </ScrollView>
            )}
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f3f4f6' },
  content: { padding: 16, gap: 16, paddingBottom: 40 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  headerCard: {
    backgroundColor: '#ffffff', borderRadius: 16, padding: 16,
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 3,
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  headerTitle: { fontSize: 18, fontWeight: 'bold', color: '#1e3a5f' },
  unreadBadge: { backgroundColor: '#dc2626', borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4 },
  unreadText: { fontSize: 12, color: '#ffffff', fontWeight: '700' },
  sendButton: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: '#1e3a5f', borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6,
  },
  sendButtonText: { fontSize: 13, color: '#ffffff', fontWeight: '600' },
  tabsScroll: { marginHorizontal: -16, paddingHorizontal: 16 },
  tabsRow: { flexDirection: 'row', gap: 8, paddingRight: 16 },
  tab: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20,
    backgroundColor: '#ffffff', borderWidth: 1, borderColor: '#e5e7eb',
  },
  tabActive: { backgroundColor: '#1e3a5f', borderColor: '#1e3a5f' },
  tabText: { fontSize: 14, color: '#6b7280', fontWeight: '500' },
  tabTextActive: { color: '#ffffff', fontWeight: '700' },
  tabBadge: { backgroundColor: '#dc2626', borderRadius: 10, minWidth: 18, height: 18, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 4 },
  tabBadgeText: { fontSize: 11, color: '#ffffff', fontWeight: '700' },
  emptyCard: { backgroundColor: '#ffffff', borderRadius: 16, padding: 40, alignItems: 'center', gap: 12 },
  emptyText: { fontSize: 15, color: '#9ca3af' },
  messageCard: {
    backgroundColor: '#ffffff', borderRadius: 16, padding: 16,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 3,
  },
  unreadCard: { borderLeftWidth: 4, borderLeftColor: '#1e3a5f' },
  messageHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  typeRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  messageType: { fontSize: 13, fontWeight: '600', color: '#1e3a5f' },
  priorityBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 20 },
  priorityText: { fontSize: 11, fontWeight: '700' },
  unreadDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#dc2626' },
  messageTitle: { fontSize: 16, fontWeight: 'bold', color: '#111827', marginBottom: 6 },
  messageBody: { fontSize: 14, color: '#374151', lineHeight: 20, marginBottom: 12 },
  messageMeta: { gap: 4, marginBottom: 8 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metaText: { fontSize: 12, color: '#9ca3af' },
  dueRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 10 },
  dueText: { fontSize: 13, color: '#dc2626', fontWeight: '500' },
  ackButton: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    backgroundColor: '#1e3a5f', borderRadius: 10, padding: 10, marginTop: 4,
  },
  ackText: { fontSize: 14, color: '#ffffff', fontWeight: '600' },
  ackDoneRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 },
  ackDoneText: { fontSize: 13, color: '#16a34a', fontWeight: '500' },
  modalContainer: { flex: 1, backgroundColor: '#f3f4f6' },
  modalHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    padding: 20, backgroundColor: '#ffffff',
    borderBottomWidth: 1, borderBottomColor: '#e5e7eb',
  },
  modalTitle: { fontSize: 18, fontWeight: 'bold', color: '#1e3a5f' },
  modalBody: { flex: 1, padding: 16 },
  fieldLabel: { fontSize: 13, fontWeight: '600', color: '#374151', marginBottom: 8, marginTop: 16 },
  input: {
    backgroundColor: '#ffffff', borderRadius: 12, borderWidth: 1, borderColor: '#e5e7eb',
    paddingHorizontal: 16, paddingVertical: 12, fontSize: 15, color: '#111827',
  },
  textArea: { height: 100, textAlignVertical: 'top' },
  noDataText: { fontSize: 14, color: '#9ca3af', marginBottom: 8 },
  chip: {
    backgroundColor: '#ffffff', borderRadius: 12, borderWidth: 1, borderColor: '#e5e7eb',
    paddingHorizontal: 14, paddingVertical: 10, alignItems: 'center', minWidth: 110,
  },
  chipSelected: { backgroundColor: '#1e3a5f', borderColor: '#1e3a5f' },
  chipText: { fontSize: 13, fontWeight: '600', color: '#111827' },
  chipTextSelected: { color: '#ffffff' },
  chipSub: { fontSize: 11, color: '#9ca3af', marginTop: 2 },
  priorityRow: { flexDirection: 'row', gap: 8, marginBottom: 8 },
  priorityChip: {
    paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20,
    backgroundColor: '#f3f4f6', borderWidth: 1, borderColor: '#e5e7eb',
  },
  priorityChipText: { fontSize: 13, fontWeight: '600', color: '#374151' },
  submitButton: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: '#1e3a5f', borderRadius: 14, padding: 16, marginTop: 24, marginBottom: 40,
  },
  submitButtonText: { fontSize: 16, fontWeight: 'bold', color: '#ffffff' },
});
