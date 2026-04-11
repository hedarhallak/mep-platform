import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, ActivityIndicator, ScrollView,
  RefreshControl, TouchableOpacity, Modal, TextInput,
  Alert, KeyboardAvoidingView, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { Image } from 'react-native';
import { GestureHandlerRootView, GestureDetector, Gesture } from 'react-native-gesture-handler';
import Animated, { useSharedValue, useAnimatedStyle, withSpring } from 'react-native-reanimated';
import { apiClient } from '../../api/client';
import { useAuthStore } from '../../store/useAuthStore';

interface HubMessage {
  id: number; type: string; title: string; body: string; priority: string;
  due_date: string | null; created_at: string; project_name: string;
  project_code: string; status: string; read_at: string | null;
  acknowledged_at: string | null; sender_first: string; sender_last: string;
  file_url: string | null; file_name: string | null;
}
interface SentMessage {
  id: number; type: string; title: string; priority: string;
  due_date: string | null; created_at: string; project_code: string;
  total_recipients: number; acknowledged_count: number; pending_count: number;
  recipients: { first_name: string; last_name: string; username: string; status: string; acknowledged_at: string | null }[];
}
interface Worker { id: number; employee_id: number; first_name: string; last_name: string; role: string; trade_name: string; is_assigned: boolean; }
interface Project { id: number; project_code: string; project_name: string; }

const CAN_SEND = ['FOREMAN','TRADE_ADMIN','TRADE_PROJECT_MANAGER','COMPANY_ADMIN','IT_ADMIN','SUPER_ADMIN'];
const PRIORITIES = ['NORMAL','HIGH','URGENT'];
const INBOX_TABS = [{key:'ALL',label:'All'},{key:'TASK',label:'Tasks'},{key:'MATERIAL',label:'Materials'},{key:'GENERAL',label:'General'}];
const HUB_TABS = [{key:'inbox',label:'Inbox'},{key:'send',label:'Send Task'}];
const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const DAYS = ['Su','Mo','Tu','We','Th','Fr','Sa'];

function fmtDateShort(d: Date) { return d.toISOString().split('T')[0]; }
function fmtDateDisplay(d: Date) { return `${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`; }
function fmtDueDate(iso: string) { const d = new Date(iso); return d.toLocaleDateString('en-CA',{month:'short',day:'numeric',year:'numeric'}); }
function fmtDT(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString('en-CA',{month:'short',day:'numeric'})+' '+d.toLocaleTimeString('en-CA',{hour:'2-digit',minute:'2-digit',hour12:false});
}
function priorityColor(p: string) { return p==='URGENT'?'#dc2626':p==='HIGH'?'#f59e0b':'#2563eb'; }
function typeIcon(t: string): any { return t==='TASK'?'checkmark-circle-outline':t==='MATERIAL'?'cube-outline':t==='SAFETY'?'shield-checkmark-outline':'mail-outline'; }
function getDaysInMonth(y: number, m: number) { return new Date(y, m+1, 0).getDate(); }
function getFirstDay(y: number, m: number) { return new Date(y, m, 1).getDay(); }

function ImageViewer({ uri, onClose }: { uri: string; onClose: () => void }) {
  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const savedX = useSharedValue(0);
  const savedY = useSharedValue(0);
  const pinch = Gesture.Pinch().onUpdate(e => { scale.value = savedScale.value * e.scale; }).onEnd(() => { savedScale.value = scale.value; if (scale.value < 1) { scale.value = withSpring(1); savedScale.value = 1; translateX.value = withSpring(0); translateY.value = withSpring(0); } });
  const pan = Gesture.Pan().onUpdate(e => { translateX.value = savedX.value + e.translationX; translateY.value = savedY.value + e.translationY; }).onEnd(() => { savedX.value = translateX.value; savedY.value = translateY.value; });
  const doubleTap = Gesture.Tap().numberOfTaps(2).onEnd(() => { if (scale.value > 1) { scale.value = withSpring(1); savedScale.value = 1; translateX.value = withSpring(0); translateY.value = withSpring(0); savedX.value = 0; savedY.value = 0; } else { scale.value = withSpring(2.5); savedScale.value = 2.5; } });
  const composed = Gesture.Simultaneous(pinch, pan);
  const animStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }, { translateX: translateX.value }, { translateY: translateY.value }] }));
  return (
    <Modal visible transparent animationType="fade">
      <GestureHandlerRootView style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.97)', justifyContent: 'center', alignItems: 'center' }}>
        <TouchableOpacity style={{ position: 'absolute', top: 50, right: 20, zIndex: 10, padding: 10, backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 20 }} onPress={onClose}>
          <Ionicons name="close" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={{ position: 'absolute', top: 55, left: 0, right: 0, textAlign: 'center', color: 'rgba(255,255,255,0.4)', fontSize: 12 }}>Pinch to zoom · Double tap · Drag</Text>
        <GestureDetector gesture={Gesture.Simultaneous(composed, doubleTap)}>
          <Animated.Image source={{ uri }} style={[{ width: '100%', height: '80%' }, animStyle]} resizeMode="contain" />
        </GestureDetector>
      </GestureHandlerRootView>
    </Modal>
  );
}

function CalendarPicker({ value, onChange, minDate }: { value: Date; onChange: (d: Date) => void; minDate?: Date; }) {
  const [viewYear, setViewYear] = useState(value.getFullYear());
  const [viewMonth, setViewMonth] = useState(value.getMonth());
  const daysInMonth = getDaysInMonth(viewYear, viewMonth);
  const firstDay = getFirstDay(viewYear, viewMonth);
  const prevMonth = () => { if (viewMonth===0){setViewMonth(11);setViewYear(y=>y-1);}else setViewMonth(m=>m-1); };
  const nextMonth = () => { if (viewMonth===11){setViewMonth(0);setViewYear(y=>y+1);}else setViewMonth(m=>m+1); };
  const cells: (number|null)[] = [];
  for (let i=0;i<firstDay;i++) cells.push(null);
  for (let d=1;d<=daysInMonth;d++) cells.push(d);
  return (
    <View style={cal.container}>
      <View style={cal.header}>
        <TouchableOpacity onPress={prevMonth} style={cal.navBtn}><Ionicons name="chevron-back" size={20} color="#1e3a5f"/></TouchableOpacity>
        <Text style={cal.title}>{MONTHS[viewMonth]} {viewYear}</Text>
        <TouchableOpacity onPress={nextMonth} style={cal.navBtn}><Ionicons name="chevron-forward" size={20} color="#1e3a5f"/></TouchableOpacity>
      </View>
      <View style={cal.daysRow}>{DAYS.map(d=><Text key={d} style={cal.dayLabel}>{d}</Text>)}</View>
      <View style={cal.grid}>
        {cells.map((day, i) => {
          if (!day) return <View key={`e-${i}`} style={cal.cell}/>;
          const thisDate = new Date(viewYear, viewMonth, day);
          const isSelected = fmtDateShort(thisDate)===fmtDateShort(value);
          const isDisabled = minDate ? thisDate < minDate : false;
          return (
            <TouchableOpacity key={day} style={[cal.cell, isSelected&&cal.selectedCell, isDisabled&&cal.disabledCell]} onPress={()=>!isDisabled&&onChange(thisDate)} disabled={isDisabled}>
              <Text style={[cal.dayNum, isSelected&&cal.selectedNum, isDisabled&&cal.disabledNum]}>{day}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

export default function MyHubScreen() {
  const { user } = useAuthStore();
  const canSend = user?.role && CAN_SEND.includes(user.role);
  const [hubTab, setHubTab] = useState('inbox');

  const [messages, setMessages] = useState<HubMessage[]>([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [inboxTab, setInboxTab] = useState('ALL');

  const [projects, setProjects] = useState<Project[]>([]);
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [sent, setSent] = useState<SentMessage[]>([]);
  const [loadingSend, setLoadingSend] = useState(false);
  const [loadingSent, setLoadingSent] = useState(true);
  const [sending, setSending] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [showWorkerModal, setShowWorkerModal] = useState(false);
  const [fullScreenImg, setFullScreenImg] = useState<string|null>(null);
  const [attachedFile, setAttachedFile] = useState<{uri:string;name:string;type:string}|null>(null);
  const [workerSearch, setWorkerSearch] = useState('');
  const [expandedSent, setExpandedSent] = useState<Record<number,boolean>>({});
  const [expandedMsgs, setExpandedMsgs] = useState<Record<number,boolean>>({}); 
  const [dueDate, setDueDate] = useState(new Date());
  const [showCalendar, setShowCalendar] = useState(false);
  const [form, setForm] = useState({
    title: '', body: '', type: 'TASK', priority: 'NORMAL',
    project_id: '', recipient_ids: [] as number[],
  });

  const setField = (k: string, v: any) => setForm(f => ({ ...f, [k]: v }));

  const fetchInbox = useCallback(async () => {
    try {
      const [r1,r2] = await Promise.all([
        apiClient.get('/api/hub/messages/inbox'),
        apiClient.get('/api/hub/messages/unread-count'),
      ]);
      setMessages(r1.data?.messages||[]);
      setUnread(Number(r2.data?.count||0));
    } catch { setMessages([]); }
    finally { setLoading(false); setRefreshing(false); }
  },[]);

  useEffect(()=>{ fetchInbox(); },[fetchInbox]);

  const fetchSendData = useCallback(async () => {
    setLoadingSend(true);
    try {
      const [r1,r2,r3] = await Promise.all([
        apiClient.get('/api/hub/my-projects'),
        apiClient.get('/api/hub/workers'),
        apiClient.get('/api/hub/messages/sent'),
      ]);
      const p = r1.data?.projects||[];
      setProjects(p);
      setWorkers(r2.data?.workers||[]);
      setSent(r3.data?.messages||[]);
      if (p.length>0) setField('project_id', String(p[0].id));
    } catch {}
    finally { setLoadingSend(false); setLoadingSent(false); }
  },[]);

  useEffect(()=>{
    if (hubTab==='send' && canSend) fetchSendData();
  },[hubTab]);

  useEffect(()=>{
    if (!form.project_id) return;
    apiClient.get(`/api/hub/workers?project_id=${form.project_id}`)
      .then(r => setWorkers(r.data?.workers||[]))
      .catch(()=>{});
    setField('recipient_ids', []);
  },[form.project_id]);

  const handleExpand = async (msg: HubMessage) => {
    const isOpen = expandedMsgs[msg.id];
    setExpandedMsgs(p=>({...p,[msg.id]:!isOpen}));
    // Mark as read on first expand
    if (!isOpen && !msg.read_at) {
      try {
        await apiClient.patch(`/api/hub/messages/${msg.id}/read`);
        setMessages(p=>p.map(m=>m.id===msg.id?{...m,read_at:new Date().toISOString()}:m));
        setUnread(p=>Math.max(0,p-1));
      } catch {}
    }
  };
  const ack = async (id:number) => {
    try {
      await apiClient.patch(`/api/hub/messages/${id}/ack`);
      setMessages(p=>p.map(m=>m.id===id?{...m,acknowledged_at:new Date().toISOString()}:m));
    } catch {}
  };

  const filteredWorkers = workerSearch.trim()
    ? workers.filter(w=>`${w.first_name} ${w.last_name} ${w.role} ${w.trade_name}`.toLowerCase().includes(workerSearch.toLowerCase()))
    : workers;

  const toggleRecipient = (id:number) => {
    setField('recipient_ids', form.recipient_ids.includes(id)
      ? form.recipient_ids.filter(r=>r!==id)
      : [...form.recipient_ids, id]);
  };
  const selectAll = () => setField('recipient_ids', filteredWorkers.map(w=>w.id));
  const clearAll  = () => setField('recipient_ids', []);

  const resetForm = () => {
    setForm({ title:'', body:'', type:'TASK', priority:'NORMAL', project_id: projects.length>0?String(projects[0].id):'', recipient_ids:[] });
    setDueDate(new Date()); setWorkerSearch(''); setShowForm(false); setAttachedFile(null);
  };

  const pickImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') { Alert.alert('Permission needed', 'Please allow photo access.'); return; }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: false, quality: 0.7,
    });
    if (!result.canceled && result.assets[0]) {
      const asset = result.assets[0];
      const name = asset.uri.split('/').pop() || 'image.jpg';
      const type = asset.type === 'image' ? 'image/jpeg' : 'image/jpeg';
      setAttachedFile({ uri: asset.uri, name, type });
    }
  };

  const handleSend = async () => {
    if (!form.title.trim()) { Alert.alert('Error','Title is required'); return; }
    if (!form.recipient_ids.length) { Alert.alert('Error','Select at least one recipient'); return; }
    setSending(true);
    try {
      const fd = new FormData();
      fd.append('title', form.title.trim());
      if (form.body.trim()) fd.append('body', form.body.trim());
      fd.append('type', form.type);
      fd.append('priority', form.priority);
      fd.append('due_date', fmtDateShort(dueDate));
      if (form.project_id) fd.append('project_id', form.project_id);
      fd.append('recipient_ids', JSON.stringify(form.recipient_ids));
      if (attachedFile) {
        fd.append('file', { uri: attachedFile.uri, name: attachedFile.name, type: attachedFile.type } as any);
      }
      await apiClient.post('/api/hub/messages', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      resetForm();
      fetchSendData();
      Alert.alert('Sent', `Task sent to ${form.recipient_ids.length} recipient(s).`);
    } catch (e:any) {
      Alert.alert('Error', e.response?.data?.error||'Failed to send task.');
    } finally { setSending(false); }
  };

  const filtered = inboxTab==='ALL'?messages:messages.filter(m=>m.type===inboxTab);
  const selectedWorkers = workers.filter(w=>form.recipient_ids.includes(w.id));

  if (loading && hubTab==='inbox') return <View style={s.center}><ActivityIndicator size="large" color="#1e3a5f"/></View>;

  return (
    <View style={s.wrapper}>
      {/* Hub Tab Bar */}
      <View style={s.hubTabBar}>
        {(canSend ? HUB_TABS : [HUB_TABS[0]]).map(t=>(
          <TouchableOpacity key={t.key} style={[s.hubTab, hubTab===t.key&&s.hubTabActive]} onPress={()=>setHubTab(t.key)}>
            <Text style={[s.hubTabText, hubTab===t.key&&s.hubTabTextActive]}>{t.label}</Text>
            {t.key==='inbox'&&unread>0&&<View style={s.tabBadge}><Text style={s.tabBadgeText}>{unread}</Text></View>}
          </TouchableOpacity>
        ))}
      </View>

      {/* INBOX TAB */}
      {hubTab==='inbox'&&(
        <ScrollView style={s.container} contentContainerStyle={s.content}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={()=>{setRefreshing(true);fetchInbox();}} tintColor="#1e3a5f"/>}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.tabsScroll}>
            <View style={s.tabsRow}>
              {INBOX_TABS.map(t=>{
                const cnt = t.key==='ALL'?messages.filter(m=>!m.read_at).length:messages.filter(m=>m.type===t.key&&!m.read_at).length;
                return (
                  <TouchableOpacity key={t.key} style={[s.tab,inboxTab===t.key&&s.tabActive]} onPress={()=>setInboxTab(t.key)}>
                    <Text style={[s.tabText,inboxTab===t.key&&s.tabTextActive]}>{t.label}</Text>
                    {cnt>0&&<View style={s.smallBadge}><Text style={s.smallBadgeText}>{cnt}</Text></View>}
                  </TouchableOpacity>
                );
              })}
            </View>
          </ScrollView>
          {filtered.length===0?(
            <View style={s.emptyCard}><Ionicons name="mail-outline" size={40} color="#d1d5db"/><Text style={s.emptyText}>No messages here</Text></View>
          ):filtered.map(msg=>{
            const isOpen = expandedMsgs[msg.id];
            const isNew = !msg.read_at;
            const isDone = !!msg.acknowledged_at;
            return (
              <View key={msg.id} style={[s.msgCard, isNew&&s.unreadCard]}>
                {/* Header â€” tap to expand */}
                <TouchableOpacity onPress={()=>handleExpand(msg)} activeOpacity={0.8}>
                  <View style={s.msgHeader}>
                    <View style={s.row}>
                      <Ionicons name={typeIcon(msg.type)} size={18} color={isDone?'#16a34a':isNew?'#f59e0b':'#1e3a5f'}/>
                      <Text style={s.msgType}>{msg.type}</Text>
                      <View style={[s.pBadge,{backgroundColor:priorityColor(msg.priority)+'20'}]}>
                        <Text style={[s.pText,{color:priorityColor(msg.priority)}]}>{msg.priority}</Text>
                      </View>
                      {isNew&&<View style={s.newBadge}><Text style={s.newBadgeText}>NEW</Text></View>}
                      {isDone&&<View style={s.doneBadge}><Text style={s.doneBadgeText}>Done</Text></View>}
                    </View>
                    <View style={s.row}>
                      {isNew&&<View style={s.dot}/>}
                      <Ionicons name={isOpen?'chevron-up':'chevron-down'} size={16} color="#9ca3af"/>
                    </View>
                  </View>
                  <Text style={[s.msgTitle, isDone&&{color:'#6b7280'}]}>{msg.title}</Text>
                  {!isOpen&&msg.body?<Text style={s.msgBody} numberOfLines={2}>{msg.body}</Text>:null}
                  <View style={s.meta}>
                    <View style={s.row}><Ionicons name="person-outline" size={13} color="#9ca3af"/><Text style={s.metaText}>{msg.sender_first} {msg.sender_last} Â· {fmtDT(msg.created_at)}</Text></View>
                    {msg.project_name&&<View style={s.row}><Ionicons name="business-outline" size={13} color="#9ca3af"/><Text style={s.metaText}>{msg.project_name}</Text></View>}
                  </View>
                </TouchableOpacity>
                {/* Expanded details */}
                {isOpen&&(
                  <View style={s.msgExpanded}>
                    {msg.body?<Text style={s.msgBodyFull}>{msg.body}</Text>:null}
                    {msg.due_date&&<View style={s.dueRow}><Ionicons name="calendar-outline" size={14} color="#dc2626"/><Text style={s.dueText}>Due: {fmtDueDate(msg.due_date!)}</Text></View>}
                    {msg.file_url&&(
                      <TouchableOpacity onPress={()=>setFullScreenImg(`https://app.constrai.ca/uploads${msg.file_url}`)}><Image source={{uri:`https://app.constrai.ca/uploads${msg.file_url}`}} style={s.inboxImg} resizeMode="cover"/></TouchableOpacity>
                    )}
                    {!isDone&&(
                      <TouchableOpacity style={s.ackBtn} onPress={()=>ack(msg.id)}>
                        <Ionicons name="checkmark-done-outline" size={16} color="#fff"/>
                        <Text style={s.ackText}>Acknowledge Task</Text>
                      </TouchableOpacity>
                    )}
                    {isDone&&<View style={s.ackDone}><Ionicons name="checkmark-done" size={15} color="#16a34a"/><Text style={s.ackDoneText}>Acknowledged</Text></View>}
                  </View>
                )}
              </View>
            );
          })}
        </ScrollView>
      )}

      {/* SEND TASK TAB */}
      {hubTab==='send'&&canSend&&(
        <ScrollView style={s.container} contentContainerStyle={s.content}>
          {loadingSend?(
            <View style={s.center}><ActivityIndicator size="large" color="#1e3a5f"/></View>
          ):(
            <>
              {!showForm&&(
                <TouchableOpacity style={s.newTaskBtn} onPress={()=>setShowForm(true)}>
                  <Ionicons name="add-circle-outline" size={20} color="#fff"/>
                  <Text style={s.newTaskText}>New Task</Text>
                </TouchableOpacity>
              )}

              {showForm&&(
                <View style={s.formCard}>
                  <Text style={s.formTitle}>New Task</Text>

                  {/* Project */}
                  <Text style={s.label}>Project</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{marginBottom:8}}>
                    <View style={{flexDirection:'row',gap:8}}>
                      {projects.map(p=>(
                        <TouchableOpacity key={p.id} style={[s.chip, form.project_id===String(p.id)&&s.chipSel]}
                          onPress={()=>setField('project_id', String(p.id))}>
                          <Text style={[s.chipText, form.project_id===String(p.id)&&s.chipTextSel]}>{p.project_name}</Text>
                          <Text style={[s.chipSub, form.project_id===String(p.id)&&{color:'#93c5fd'}]}>{p.project_code}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </ScrollView>

                  {/* Recipients Ã¢â‚¬â€ modal picker */}
                  <View style={s.workerHeader}>
                    <Text style={s.label}>Recipients {form.recipient_ids.length>0?`(${form.recipient_ids.length})`:''}</Text>
                    {form.recipient_ids.length>0&&(
                      <TouchableOpacity onPress={clearAll} style={s.selectBtn}>
                        <Text style={s.selectBtnText}>Clear all</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                  {/* Selected chips */}
                  {selectedWorkers.length>0&&(
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{marginBottom:8}}>
                      <View style={{flexDirection:'row',gap:6}}>
                        {selectedWorkers.map(w=>(
                          <TouchableOpacity key={w.id} style={s.selectedChip} onPress={()=>toggleRecipient(w.id)}>
                            <Text style={s.selectedChipText}>{w.first_name} {w.last_name}</Text>
                            <Ionicons name="close-circle" size={14} color="#fff"/>
                          </TouchableOpacity>
                        ))}
                      </View>
                    </ScrollView>
                  )}
                  <TouchableOpacity style={s.workerPickerBtn} onPress={()=>{ setWorkerSearch(''); setShowWorkerModal(true); }}>
                    <Ionicons name="people-outline" size={18} color="#1e3a5f"/>
                    <Text style={[s.workerPickerText, form.recipient_ids.length===0&&{color:'#9ca3af'}]}>
                      {form.recipient_ids.length===0 ? 'Select recipients...' : `${form.recipient_ids.length} selected Ã¢â‚¬â€ tap to edit`}
                    </Text>
                    <Ionicons name="chevron-forward" size={16} color="#9ca3af"/>
                  </TouchableOpacity>

                  {/* Title */}
                  <Text style={s.label}>Title *</Text>
                  <TextInput style={s.input} placeholder="Task title..." placeholderTextColor="#9ca3af" value={form.title} onChangeText={v=>setField('title',v)}/>

                  {/* Body */}
                  <Text style={s.label}>Description</Text>
                  <TextInput style={[s.input,s.textArea]} placeholder="Details..." placeholderTextColor="#9ca3af" value={form.body} onChangeText={v=>setField('body',v)} multiline numberOfLines={3}/>

                  {/* Priority */}
                  <Text style={s.label}>Priority</Text>
                  <View style={{flexDirection:'row',gap:8,marginBottom:8}}>
                    {PRIORITIES.map(p=>(
                      <TouchableOpacity key={p} style={[s.pChip, form.priority===p&&{backgroundColor:priorityColor(p),borderColor:priorityColor(p)}]} onPress={()=>setField('priority',p)}>
                        <Text style={[s.pChipText, form.priority===p&&{color:'#fff'}]}>{p}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>

                  {/* Due Date */}
                  <Text style={s.label}>Due Date</Text>
                  <TouchableOpacity style={s.dateButton} onPress={()=>setShowCalendar(true)}>
                    <Ionicons name="calendar-outline" size={16} color="#1e3a5f"/>
                    <Text style={s.dateButtonText}>{fmtDateDisplay(dueDate)}</Text>
                  </TouchableOpacity>

                  {/* Attachment */}
                  <Text style={s.label}>Attachment (optional)</Text>
                  <TouchableOpacity style={s.attachBtn} onPress={pickImage}>
                    <Ionicons name="image-outline" size={18} color="#1e3a5f"/>
                    <Text style={[s.attachBtnText, !attachedFile&&{color:'#9ca3af'}]}>
                      {attachedFile ? attachedFile.name : 'Add photo or image...'}
                    </Text>
                    {attachedFile&&<TouchableOpacity onPress={()=>setAttachedFile(null)}><Ionicons name="close-circle" size={18} color="#dc2626"/></TouchableOpacity>}
                  </TouchableOpacity>
                  {attachedFile&&<Image source={{uri:attachedFile.uri}} style={s.previewImg} resizeMode="cover"/>}

                  {/* Actions */}
                  <View style={s.formActions}>
                    <TouchableOpacity style={s.cancelBtn} onPress={resetForm}>
                      <Text style={s.cancelText}>Cancel</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[s.sendBtn, sending&&{opacity:0.6}]} onPress={handleSend} disabled={sending}>
                      {sending?<ActivityIndicator color="#fff" size="small"/>:<>
                        <Ionicons name="send" size={16} color="#fff"/>
                        <Text style={s.sendBtnText}>Send Task</Text>
                      </>}
                    </TouchableOpacity>
                  </View>
                </View>
              )}

              {/* Sent Messages */}
              {loadingSent?(
                <View style={s.center}><ActivityIndicator color="#1e3a5f"/></View>
              ):sent.length===0&&!showForm?(
                <View style={s.emptyCard}><Ionicons name="send-outline" size={40} color="#d1d5db"/><Text style={s.emptyText}>No tasks sent yet</Text></View>
              ):sent.map(task=>{
                const total = Number(task.total_recipients)||0;
                const acked = Number(task.acknowledged_count)||0;
                const pending = Number(task.pending_count)||0;
                const pct = total>0?Math.round((acked/total)*100):0;
                const isOpen = expandedSent[task.id];
                return (
                  <View key={task.id} style={s.sentCard}>
                    <TouchableOpacity style={s.sentHeader} onPress={()=>setExpandedSent(p=>({...p,[task.id]:!p[task.id]}))}>
                      <View style={s.sentIcon}>
                        <Ionicons name="checkmark-circle-outline" size={20} color="#1e3a5f"/>
                      </View>
                      <View style={{flex:1}}>
                        <View style={s.row}>
                          <Text style={s.sentTitle} numberOfLines={1}>{task.title}</Text>
                          <View style={[s.pBadge,{backgroundColor:priorityColor(task.priority)+'20'}]}>
                            <Text style={[s.pText,{color:priorityColor(task.priority)}]}>{task.priority}</Text>
                          </View>
                        </View>
                        <Text style={s.sentMeta}>
                          {fmtDT(task.created_at)}{task.project_code?` Ã‚Â· ${task.project_code}`:''} Ã‚Â· {total} recipient{total!==1?'s':''}
                          {task.due_date?` Ã‚Â· Due ${task.due_date}`:''}
                        </Text>
                      </View>
                      <View style={s.sentProgress}>
                        <Text style={s.sentPct}>{pct}%</Text>
                        <Text style={s.sentPctSub}>{acked}/{total}</Text>
                      </View>
                      <Ionicons name={isOpen?'chevron-up':'chevron-down'} size={16} color="#9ca3af"/>
                    </TouchableOpacity>
                    {isOpen&&(
                      <View style={s.sentDetails}>
                        {task.recipients?.map((r,i)=>{
                          const name = r.first_name?`${r.first_name} ${r.last_name}`:r.username;
                          const isPending = r.status==='PENDING';
                          const isDone = r.status==='ACKNOWLEDGED';
                          const isRead = r.status==='READ';
                          return (
                            <View key={i} style={[s.recipientRow, isDone&&{backgroundColor:'#f0fdf4'}, isPending&&{backgroundColor:'#fffbeb'}, isRead&&{backgroundColor:'#eff6ff'}]}>
                              <Text style={s.recipientName}>{name}</Text>
                              <Text style={[s.recipientStatus, isDone&&{color:'#16a34a'}, isPending&&{color:'#d97706'}, isRead&&{color:'#2563eb'}]}>
                                {isDone?'Done':isPending?'Awaiting assignment':isRead?'Seen':'Sent'}
                              </Text>
                            </View>
                          );
                        })}
                        {pending>0&&(
                          <View style={s.pendingNote}>
                            <Ionicons name="time-outline" size={14} color="#d97706"/>
                            <Text style={s.pendingNoteText}>{pending} recipient{pending!==1?'s':''} will receive this once assigned to the project</Text>
                          </View>
                        )}
                      </View>
                    )}
                  </View>
                );
              })}
            </>
          )}
        </ScrollView>
      )}

      {/* Full Screen Image Modal */}
      {fullScreenImg&&<ImageViewer uri={fullScreenImg} onClose={()=>setFullScreenImg(null)}/>}

      {/* Calendar Modal */}
      <Modal visible={showCalendar} transparent animationType="fade">
        <View style={s.calOverlay}>
          <View style={s.calCard}>
            <Text style={s.calTitle}>Select Due Date</Text>
            <CalendarPicker value={dueDate} onChange={d=>setDueDate(d)} minDate={new Date()}/>
            <TouchableOpacity style={s.calDone} onPress={()=>setShowCalendar(false)}>
              <Text style={s.calDoneText}>Done</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Worker Picker Modal */}
      <Modal visible={showWorkerModal} animationType="slide" presentationStyle="pageSheet">
        <View style={s.wrapper}>
          <View style={s.pickerHeader}>
            <View>
              <Text style={s.pickerTitle}>Select Recipients</Text>
              <Text style={s.pickerSub}>{form.recipient_ids.length} selected</Text>
            </View>
            <View style={s.row}>
              <TouchableOpacity onPress={selectAll} style={s.selectBtn}>
                <Text style={s.selectBtnText}>All</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={clearAll} style={s.selectBtn}>
                <Text style={s.selectBtnText}>Clear</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.pickerDoneBtn} onPress={()=>setShowWorkerModal(false)}>
                <Text style={s.pickerDoneText}>Done</Text>
              </TouchableOpacity>
            </View>
          </View>
          <View style={s.pickerSearch}>
            <Ionicons name="search-outline" size={18} color="#9ca3af"/>
            <TextInput
              style={s.searchInput}
              placeholder="Search by name, role, trade..."
              placeholderTextColor="#9ca3af"
              value={workerSearch}
              onChangeText={setWorkerSearch}
              autoFocus
            />
            {workerSearch.length>0&&(
              <TouchableOpacity onPress={()=>setWorkerSearch('')}>
                <Ionicons name="close-circle" size={18} color="#9ca3af"/>
              </TouchableOpacity>
            )}
          </View>
          <ScrollView style={{flex:1,paddingHorizontal:16}}>
            {filteredWorkers.length===0?(
              <View style={s.emptyCard}><Text style={s.emptyText}>No workers found</Text></View>
            ):filteredWorkers.map(w=>{
              const selected = form.recipient_ids.includes(w.id);
              return (
                <TouchableOpacity key={w.id} style={[s.workerRow, selected&&s.workerRowSel]} onPress={()=>toggleRecipient(w.id)}>
                  <View style={[s.workerAvatar, selected&&{backgroundColor:'#1e3a5f'}]}>
                    <Text style={[s.workerAvatarText, selected&&{color:'#fff'}]}>{w.first_name[0]}{w.last_name[0]}</Text>
                  </View>
                  <View style={{flex:1}}>
                    <Text style={[s.workerName, selected&&{color:'#1e3a5f',fontWeight:'700'}]}>{w.first_name} {w.last_name}</Text>
                    <Text style={s.workerRole}>{w.role} Ã‚Â· {w.trade_name||'General'}{w.is_assigned?' Ã‚Â· Assigned':''}</Text>
                  </View>
                  {selected
                    ?<Ionicons name="checkmark-circle" size={22} color="#1e3a5f"/>
                    :<View style={s.emptyCheck}/>
                  }
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

const cal = StyleSheet.create({
  container:{paddingVertical:8},
  header:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',marginBottom:12},
  navBtn:{padding:8},
  title:{fontSize:16,fontWeight:'700',color:'#1e3a5f'},
  daysRow:{flexDirection:'row',marginBottom:4},
  dayLabel:{width:'14.28%',textAlign:'center',fontSize:11,color:'#9ca3af',fontWeight:'600'},
  grid:{flexDirection:'row',flexWrap:'wrap'},
  cell:{width:'14.28%',aspectRatio:1,alignItems:'center',justifyContent:'center'},
  selectedCell:{backgroundColor:'#1e3a5f',borderRadius:20},
  disabledCell:{opacity:0.3},
  dayNum:{fontSize:14,color:'#111827'},
  selectedNum:{color:'#fff',fontWeight:'700'},
  disabledNum:{color:'#9ca3af'},
});

const s = StyleSheet.create({
  wrapper:{flex:1,backgroundColor:'#f3f4f6'},
  container:{flex:1},
  content:{padding:16,gap:12,paddingBottom:40},
  center:{flex:1,justifyContent:'center',alignItems:'center',paddingVertical:40},
  row:{flexDirection:'row',alignItems:'center',gap:6},
  hubTabBar:{flexDirection:'row',backgroundColor:'#fff',borderBottomWidth:1,borderBottomColor:'#e5e7eb',paddingHorizontal:16},
  hubTab:{flexDirection:'row',alignItems:'center',gap:6,paddingVertical:14,paddingHorizontal:16,borderBottomWidth:2,borderBottomColor:'transparent'},
  hubTabActive:{borderBottomColor:'#1e3a5f'},
  hubTabText:{fontSize:14,fontWeight:'600',color:'#6b7280'},
  hubTabTextActive:{color:'#1e3a5f'},
  tabBadge:{backgroundColor:'#dc2626',borderRadius:10,minWidth:18,height:18,justifyContent:'center',alignItems:'center',paddingHorizontal:4},
  tabBadgeText:{fontSize:11,color:'#fff',fontWeight:'700'},
  tabsScroll:{marginHorizontal:-16,paddingHorizontal:16,marginBottom:4},
  tabsRow:{flexDirection:'row',gap:8,paddingRight:16},
  tab:{flexDirection:'row',alignItems:'center',gap:6,paddingHorizontal:16,paddingVertical:8,borderRadius:20,backgroundColor:'#fff',borderWidth:1,borderColor:'#e5e7eb'},
  tabActive:{backgroundColor:'#1e3a5f',borderColor:'#1e3a5f'},
  tabText:{fontSize:14,color:'#6b7280',fontWeight:'500'},
  tabTextActive:{color:'#fff',fontWeight:'700'},
  smallBadge:{backgroundColor:'#dc2626',borderRadius:10,minWidth:16,height:16,justifyContent:'center',alignItems:'center',paddingHorizontal:3},
  smallBadgeText:{fontSize:10,color:'#fff',fontWeight:'700'},
  emptyCard:{backgroundColor:'#fff',borderRadius:16,padding:40,alignItems:'center',gap:12,marginTop:8},
  emptyText:{fontSize:15,color:'#9ca3af'},
  msgCard:{backgroundColor:'#fff',borderRadius:16,padding:16,shadowColor:'#000',shadowOffset:{width:0,height:2},shadowOpacity:0.06,shadowRadius:8,elevation:3},
  unreadCard:{borderLeftWidth:4,borderLeftColor:'#1e3a5f'},
  msgHeader:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',marginBottom:10},
  msgType:{fontSize:13,fontWeight:'600',color:'#1e3a5f'},
  pBadge:{paddingHorizontal:8,paddingVertical:2,borderRadius:20},
  pText:{fontSize:11,fontWeight:'700'},
  dot:{width:10,height:10,borderRadius:5,backgroundColor:'#dc2626'},
  msgTitle:{fontSize:16,fontWeight:'bold',color:'#111827',marginBottom:6},
  msgBody:{fontSize:14,color:'#374151',lineHeight:20,marginBottom:12},
  meta:{gap:4,marginBottom:8},
  metaText:{fontSize:12,color:'#9ca3af'},
  dueRow:{flexDirection:'row',alignItems:'center',gap:4,marginBottom:10},
  dueText:{fontSize:13,color:'#dc2626',fontWeight:'500'},
  ackBtn:{flexDirection:'row',alignItems:'center',justifyContent:'center',gap:6,backgroundColor:'#1e3a5f',borderRadius:10,padding:10,marginTop:4},
  ackText:{fontSize:14,color:'#fff',fontWeight:'600'},
  ackDone:{flexDirection:'row',alignItems:'center',gap:4,marginTop:4},
  ackDoneText:{fontSize:13,color:'#16a34a',fontWeight:'500'},
  msgExpanded:{borderTopWidth:1,borderTopColor:'#f3f4f6',paddingTop:12,marginTop:8,gap:10},
  msgBodyFull:{fontSize:14,color:'#374151',lineHeight:22},
  newBadge:{backgroundColor:'#fef3c7',borderRadius:10,paddingHorizontal:8,paddingVertical:2},
  newBadgeText:{fontSize:10,fontWeight:'700',color:'#d97706'},
  doneBadge:{backgroundColor:'#f0fdf4',borderRadius:10,paddingHorizontal:8,paddingVertical:2},
  doneBadgeText:{fontSize:10,fontWeight:'700',color:'#16a34a'},
  newTaskBtn:{flexDirection:'row',alignItems:'center',justifyContent:'center',gap:8,backgroundColor:'#1e3a5f',borderRadius:14,padding:14},
  newTaskText:{fontSize:15,fontWeight:'bold',color:'#fff'},
  formCard:{backgroundColor:'#fff',borderRadius:16,padding:16,gap:4,shadowColor:'#000',shadowOffset:{width:0,height:2},shadowOpacity:0.06,shadowRadius:8,elevation:3},
  formTitle:{fontSize:17,fontWeight:'bold',color:'#1e3a5f',marginBottom:8},
  label:{fontSize:13,fontWeight:'600',color:'#374151',marginBottom:6,marginTop:12},
  input:{backgroundColor:'#f9fafb',borderRadius:10,borderWidth:1,borderColor:'#e5e7eb',paddingHorizontal:14,paddingVertical:10,fontSize:14,color:'#111827'},
  textArea:{height:80,textAlignVertical:'top'},
  chip:{backgroundColor:'#f3f4f6',borderRadius:12,borderWidth:1,borderColor:'#e5e7eb',paddingHorizontal:14,paddingVertical:10,alignItems:'center',minWidth:100},
  chipSel:{backgroundColor:'#1e3a5f',borderColor:'#1e3a5f'},
  chipText:{fontSize:13,fontWeight:'600',color:'#374151'},
  chipTextSel:{color:'#fff'},
  chipSub:{fontSize:11,color:'#9ca3af',marginTop:2},
  pChip:{paddingHorizontal:14,paddingVertical:8,borderRadius:20,backgroundColor:'#f3f4f6',borderWidth:1,borderColor:'#e5e7eb'},
  pChipText:{fontSize:13,fontWeight:'600',color:'#374151'},
  dateButton:{flexDirection:'row',alignItems:'center',gap:8,height:44,borderWidth:1,borderColor:'#e5e7eb',borderRadius:10,paddingHorizontal:12,backgroundColor:'#f9fafb'},
  dateButtonText:{fontSize:13,color:'#111827',fontWeight:'500',flex:1},
  workerHeader:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',marginTop:12},
  selectBtn:{paddingHorizontal:10,paddingVertical:4,backgroundColor:'#f3f4f6',borderRadius:8,borderWidth:1,borderColor:'#e5e7eb'},
  selectBtnText:{fontSize:12,color:'#374151',fontWeight:'600'},
  // Worker picker button
  workerPickerBtn:{flexDirection:'row',alignItems:'center',gap:10,backgroundColor:'#f9fafb',borderRadius:10,borderWidth:1,borderColor:'#e5e7eb',paddingHorizontal:14,paddingVertical:12,marginTop:4},
  workerPickerText:{flex:1,fontSize:14,color:'#111827'},
  selectedChip:{flexDirection:'row',alignItems:'center',gap:4,backgroundColor:'#1e3a5f',borderRadius:20,paddingHorizontal:10,paddingVertical:5},
  selectedChipText:{fontSize:12,color:'#fff',fontWeight:'600'},
  formActions:{flexDirection:'row',gap:10,marginTop:16},
  cancelBtn:{flex:1,padding:14,borderRadius:12,backgroundColor:'#f3f4f6',alignItems:'center'},
  cancelText:{fontSize:14,fontWeight:'600',color:'#374151'},
  sendBtn:{flex:2,flexDirection:'row',alignItems:'center',justifyContent:'center',gap:8,backgroundColor:'#1e3a5f',borderRadius:12,padding:14},
  sendBtnText:{fontSize:14,fontWeight:'bold',color:'#fff'},
  sentCard:{backgroundColor:'#fff',borderRadius:14,borderWidth:1,borderColor:'#e5e7eb',overflow:'hidden'},
  sentHeader:{flexDirection:'row',alignItems:'center',gap:10,padding:14},
  sentIcon:{width:36,height:36,borderRadius:10,backgroundColor:'#eff6ff',justifyContent:'center',alignItems:'center'},
  sentTitle:{fontSize:14,fontWeight:'600',color:'#111827',flex:1},
  sentMeta:{fontSize:11,color:'#9ca3af',marginTop:2},
  sentProgress:{alignItems:'center',marginRight:4},
  sentPct:{fontSize:13,fontWeight:'bold',color:'#1e3a5f'},
  sentPctSub:{fontSize:10,color:'#9ca3af'},
  sentDetails:{borderTopWidth:1,borderTopColor:'#f3f4f6',padding:12,gap:6},
  recipientRow:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',paddingHorizontal:10,paddingVertical:8,borderRadius:8,backgroundColor:'#f9fafb'},
  recipientName:{fontSize:13,fontWeight:'500',color:'#374151'},
  recipientStatus:{fontSize:12,fontWeight:'600',color:'#6b7280'},
  pendingNote:{flexDirection:'row',alignItems:'center',gap:6,padding:8,backgroundColor:'#fffbeb',borderRadius:8},
  pendingNoteText:{fontSize:12,color:'#d97706',flex:1},
  calOverlay:{flex:1,backgroundColor:'rgba(0,0,0,0.5)',justifyContent:'center',alignItems:'center',padding:24},
  calCard:{backgroundColor:'#fff',borderRadius:20,padding:20,width:'100%'},
  calTitle:{fontSize:16,fontWeight:'700',color:'#1e3a5f',marginBottom:12,textAlign:'center'},
  calDone:{backgroundColor:'#1e3a5f',borderRadius:10,padding:12,alignItems:'center',marginTop:12},
  calDoneText:{color:'#fff',fontWeight:'700',fontSize:14},
  // Worker picker modal
  pickerHeader:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',padding:16,backgroundColor:'#fff',borderBottomWidth:1,borderBottomColor:'#e5e7eb'},
  pickerTitle:{fontSize:17,fontWeight:'bold',color:'#1e3a5f'},
  pickerSub:{fontSize:12,color:'#9ca3af',marginTop:2},
  pickerDoneBtn:{backgroundColor:'#1e3a5f',borderRadius:10,paddingHorizontal:14,paddingVertical:7},
  pickerDoneText:{fontSize:14,fontWeight:'700',color:'#fff'},
  pickerSearch:{flexDirection:'row',alignItems:'center',gap:10,backgroundColor:'#fff',margin:12,borderRadius:12,borderWidth:1,borderColor:'#e5e7eb',paddingHorizontal:14,paddingVertical:10},
  searchInput:{flex:1,fontSize:15,color:'#111827'},
  workerRow:{flexDirection:'row',alignItems:'center',gap:12,backgroundColor:'#fff',borderRadius:14,padding:12,marginBottom:8,borderWidth:1,borderColor:'#e5e7eb'},
  workerRowSel:{borderColor:'#1e3a5f',backgroundColor:'#eff6ff'},
  workerAvatar:{width:38,height:38,borderRadius:19,backgroundColor:'#e8f0fe',justifyContent:'center',alignItems:'center'},
  workerAvatarText:{fontSize:13,fontWeight:'700',color:'#1e3a5f'},
  workerName:{fontSize:14,fontWeight:'600',color:'#111827'},
  workerRole:{fontSize:11,color:'#9ca3af',marginTop:1},
  emptyCheck:{width:22,height:22,borderRadius:11,borderWidth:2,borderColor:'#e5e7eb'},
  attachBtn:{flexDirection:'row',alignItems:'center',gap:10,backgroundColor:'#f9fafb',borderRadius:10,borderWidth:1,borderColor:'#e5e7eb',paddingHorizontal:14,paddingVertical:12},
  attachBtnText:{flex:1,fontSize:14,color:'#111827'},
  previewImg:{width:'100%',height:180,borderRadius:12,marginTop:8},
  inboxImg:{width:'100%',height:200,borderRadius:12,marginTop:8},
});






