import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, ActivityIndicator, ScrollView,
  RefreshControl, TouchableOpacity, Modal, TextInput,
  Alert, KeyboardAvoidingView, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { apiClient } from '../../api/client';
import { useAuthStore } from '../../store/useAuthStore';

interface HubMessage {
  id: number; type: string; title: string; body: string; priority: string;
  due_date: string | null; created_at: string; project_name: string;
  project_code: string; status: string; read_at: string | null;
  acknowledged_at: string | null; sender_first: string; sender_last: string;
}
interface Worker { id: number; employee_id: number; first_name: string; last_name: string; role: string; }
interface Project { id: number; project_code: string; project_name: string; }

const CAN_SEND = ['FOREMAN','TRADE_ADMIN','TRADE_PROJECT_MANAGER','COMPANY_ADMIN','IT_ADMIN','SUPER_ADMIN'];
const PRIORITIES = ['NORMAL','HIGH','URGENT'];
const TABS = [{key:'ALL',label:'All'},{key:'TASK',label:'Tasks'},{key:'MATERIAL',label:'Materials'},{key:'GENERAL',label:'General'}];

function fmtDate(d: Date) { return d.toISOString().split('T')[0]; }
function fmtDT(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString('en-CA',{month:'short',day:'numeric'})+' '+d.toLocaleTimeString('en-CA',{hour:'2-digit',minute:'2-digit',hour12:false});
}
function priorityColor(p: string) { return p==='URGENT'?'#dc2626':p==='HIGH'?'#f59e0b':'#2563eb'; }
function typeIcon(t: string): any { return t==='TASK'?'checkmark-circle-outline':t==='MATERIAL'?'cube-outline':t==='SAFETY'?'shield-checkmark-outline':'mail-outline'; }

export default function MyHubScreen() {
  const { user } = useAuthStore();
  const [messages, setMessages] = useState<HubMessage[]>([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [tab, setTab] = useState('ALL');
  const [modal, setModal] = useState(false);
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loadingModal, setLoadingModal] = useState(false);
  const [recipient, setRecipient] = useState<Worker|null>(null);
  const [project, setProject] = useState<Project|null>(null);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [priority, setPriority] = useState('NORMAL');
  const [dueDate, setDueDate] = useState(new Date());
  const [showPicker, setShowPicker] = useState(false);
  const [sending, setSending] = useState(false);

  const canSend = user?.role && CAN_SEND.includes(user.role);

  const fetchMessages = useCallback(async () => {
    try {
      const [r1,r2] = await Promise.all([apiClient.get('/api/hub/messages/inbox'),apiClient.get('/api/hub/messages/unread-count')]);
      setMessages(r1.data?.messages||[]);
      setUnread(Number(r2.data?.count||0));
    } catch { setMessages([]); } finally { setLoading(false); setRefreshing(false); }
  },[]);

  useEffect(()=>{ fetchMessages(); },[fetchMessages]);

  const markRead = async (id:number) => {
    try {
      await apiClient.patch(`/api/hub/messages/${id}/read`);
      setMessages(p=>p.map(m=>m.id===id?{...m,read_at:new Date().toISOString()}:m));
      setUnread(p=>Math.max(0,p-1));
    } catch {}
  };

  const ack = async (id:number) => {
    try {
      await apiClient.patch(`/api/hub/messages/${id}/ack`);
      setMessages(p=>p.map(m=>m.id===id?{...m,acknowledged_at:new Date().toISOString()}:m));
    } catch {}
  };

  const openModal = async () => {
    setModal(true); setLoadingModal(true);
    setRecipient(null); setTitle(''); setBody(''); setPriority('NORMAL'); setDueDate(new Date()); setShowPicker(false);
    try {
      const [r1,r2] = await Promise.all([apiClient.get('/api/hub/workers'),apiClient.get('/api/hub/my-projects')]);
      const w = r1.data?.workers||[]; const p = r2.data?.projects||[];
      setWorkers(w); setProjects(p);
      if (p.length>0) setProject(p[0]);
    } catch { setWorkers([]); setProjects([]); } finally { setLoadingModal(false); }
  };

  const send = async () => {
    if (!recipient) { Alert.alert('Error','Please select a recipient.'); return; }
    if (!title.trim()) { Alert.alert('Error','Please enter a task title.'); return; }
    setSending(true);
    try {
      await apiClient.post('/api/hub/messages',{
        title:title.trim(), body:body.trim()||undefined, type:'TASK',
        priority, due_date:fmtDate(dueDate),
        project_id:project?.id||undefined,
        recipient_ids:JSON.stringify([recipient.id]),
      });
      setModal(false);
      Alert.alert('Sent',`Task sent to ${recipient.first_name} ${recipient.last_name}.`);
      fetchMessages();
    } catch (e:any) {
      Alert.alert('Error', e.response?.data?.error||'Failed to send task.');
    } finally { setSending(false); }
  };

  const filtered = tab==='ALL'?messages:messages.filter(m=>m.type===tab);

  if (loading) return <View style={s.center}><ActivityIndicator size="large" color="#1e3a5f"/></View>;

  return (
    <>
      <ScrollView style={s.container} contentContainerStyle={s.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={()=>{setRefreshing(true);fetchMessages();}} tintColor="#1e3a5f"/>}>

        <View style={s.headerCard}>
          <View style={s.row}>
            <Ionicons name="notifications-outline" size={22} color="#1e3a5f"/>
            <Text style={s.headerTitle}>My Hub</Text>
          </View>
          <View style={s.row}>
            {unread>0&&<View style={s.badge}><Text style={s.badgeText}>{unread} unread</Text></View>}
            {canSend&&<TouchableOpacity style={s.sendBtn} onPress={openModal}>
              <Ionicons name="send-outline" size={16} color="#fff"/>
              <Text style={s.sendBtnText}>Send Task</Text>
            </TouchableOpacity>}
          </View>
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.tabsScroll}>
          <View style={s.tabsRow}>
            {TABS.map(t=>{
              const cnt = t.key==='ALL'?messages.filter(m=>!m.read_at).length:messages.filter(m=>m.type===t.key&&!m.read_at).length;
              return (
                <TouchableOpacity key={t.key} style={[s.tab,tab===t.key&&s.tabActive]} onPress={()=>setTab(t.key)}>
                  <Text style={[s.tabText,tab===t.key&&s.tabTextActive]}>{t.label}</Text>
                  {cnt>0&&<View style={s.tabBadge}><Text style={s.tabBadgeText}>{cnt}</Text></View>}
                </TouchableOpacity>
              );
            })}
          </View>
        </ScrollView>

        {filtered.length===0?(
          <View style={s.emptyCard}><Ionicons name="mail-outline" size={40} color="#d1d5db"/><Text style={s.emptyText}>No messages here</Text></View>
        ):filtered.map(msg=>(
          <TouchableOpacity key={msg.id} style={[s.msgCard,!msg.read_at&&s.unreadCard]} onPress={()=>!msg.read_at&&markRead(msg.id)} activeOpacity={0.8}>
            <View style={s.msgHeader}>
              <View style={s.row}>
                <Ionicons name={typeIcon(msg.type)} size={18} color="#1e3a5f"/>
                <Text style={s.msgType}>{msg.type}</Text>
                <View style={[s.pBadge,{backgroundColor:priorityColor(msg.priority)+'20'}]}>
                  <Text style={[s.pText,{color:priorityColor(msg.priority)}]}>{msg.priority}</Text>
                </View>
              </View>
              {!msg.read_at&&<View style={s.dot}/>}
            </View>
            <Text style={s.msgTitle}>{msg.title}</Text>
            {msg.body?<Text style={s.msgBody} numberOfLines={3}>{msg.body}</Text>:null}
            <View style={s.meta}>
              <View style={s.row}><Ionicons name="business-outline" size={13} color="#9ca3af"/><Text style={s.metaText}>{msg.project_name||'General'}</Text></View>
              <View style={s.row}><Ionicons name="person-outline" size={13} color="#9ca3af"/><Text style={s.metaText}>{msg.sender_first} {msg.sender_last}</Text></View>
              <View style={s.row}><Ionicons name="time-outline" size={13} color="#9ca3af"/><Text style={s.metaText}>{fmtDT(msg.created_at)}</Text></View>
            </View>
            {msg.due_date&&<View style={s.dueRow}><Ionicons name="calendar-outline" size={14} color="#dc2626"/><Text style={s.dueText}>Due: {msg.due_date}</Text></View>}
            {msg.read_at&&!msg.acknowledged_at&&(
              <TouchableOpacity style={s.ackBtn} onPress={()=>ack(msg.id)}>
                <Ionicons name="checkmark-done-outline" size={16} color="#fff"/>
                <Text style={s.ackText}>Acknowledge</Text>
              </TouchableOpacity>
            )}
            {msg.acknowledged_at&&<View style={s.ackDone}><Ionicons name="checkmark-done" size={15} color="#16a34a"/><Text style={s.ackDoneText}>Acknowledged</Text></View>}
          </TouchableOpacity>
        ))}
      </ScrollView>

      <Modal visible={modal} animationType="slide" presentationStyle="pageSheet">
        <KeyboardAvoidingView style={{flex:1}} behavior={Platform.OS==='ios'?'padding':undefined}>
          <View style={s.modalContainer}>
            <View style={s.modalHeader}>
              <Text style={s.modalTitle}>Send Task</Text>
              <TouchableOpacity onPress={()=>setModal(false)}><Ionicons name="close" size={24} color="#111827"/></TouchableOpacity>
            </View>
            {loadingModal?<View style={s.center}><ActivityIndicator size="large" color="#1e3a5f"/></View>:(
              <ScrollView style={s.modalBody} keyboardShouldPersistTaps="handled">

                <Text style={s.label}>Recipient *</Text>
                {workers.length===0?<Text style={s.noData}>No workers found.</Text>:(
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{marginBottom:8}}>
                    <View style={{flexDirection:'row',gap:8}}>
                      {workers.map(w=>(
                        <TouchableOpacity key={w.id} style={[s.chip,recipient?.id===w.id&&s.chipSel]} onPress={()=>setRecipient(w)}>
                          <Text style={[s.chipText,recipient?.id===w.id&&s.chipTextSel]}>{w.first_name} {w.last_name}</Text>
                          <Text style={[s.chipSub,recipient?.id===w.id&&{color:'#93c5fd'}]}>{w.role}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </ScrollView>
                )}

                <Text style={s.label}>Project</Text>
                {projects.length===0?<Text style={s.noData}>No projects.</Text>:(
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{marginBottom:8}}>
                    <View style={{flexDirection:'row',gap:8}}>
                      {projects.map(p=>(
                        <TouchableOpacity key={p.id} style={[s.chip,project?.id===p.id&&s.chipSel]} onPress={()=>setProject(project?.id===p.id?null:p)}>
                          <Text style={[s.chipText,project?.id===p.id&&s.chipTextSel]}>{p.project_name}</Text>
                          <Text style={[s.chipSub,project?.id===p.id&&{color:'#93c5fd'}]}>{p.project_code}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </ScrollView>
                )}

                <Text style={s.label}>Title *</Text>
                <TextInput style={s.input} placeholder="Task title..." placeholderTextColor="#9ca3af" value={title} onChangeText={setTitle}/>

                <Text style={s.label}>Description</Text>
                <TextInput style={[s.input,s.textArea]} placeholder="Details..." placeholderTextColor="#9ca3af" value={body} onChangeText={setBody} multiline numberOfLines={4}/>

                <Text style={s.label}>Priority</Text>
                <View style={{flexDirection:'row',gap:8,marginBottom:8}}>
                  {PRIORITIES.map(p=>(
                    <TouchableOpacity key={p} style={[s.pChip,priority===p&&{backgroundColor:priorityColor(p),borderColor:priorityColor(p)}]} onPress={()=>setPriority(p)}>
                      <Text style={[s.pChipText,priority===p&&{color:'#fff'}]}>{p}</Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <Text style={s.label}>Due Date</Text>
                <TouchableOpacity style={s.dateBtn} onPress={()=>setShowPicker(!showPicker)}>
                  <Ionicons name="calendar-outline" size={18} color="#1e3a5f"/>
                  <Text style={s.dateBtnText}>{fmtDate(dueDate)}</Text>
                  <Ionicons name={showPicker?'chevron-up':'chevron-down'} size={16} color="#9ca3af"/>
                </TouchableOpacity>
                {showPicker&&(
                  <DateTimePicker
                    value={dueDate} mode="date" display="inline" minimumDate={new Date()}
                    onChange={(_,d)=>{ if(d) setDueDate(d); if(Platform.OS!=='ios') setShowPicker(false); }}
                    style={{marginBottom:8}}
                  />
                )}

                <TouchableOpacity style={[s.submitBtn,sending&&{opacity:0.6}]} onPress={send} disabled={sending}>
                  {sending?<ActivityIndicator color="#fff"/>:<>
                    <Ionicons name="send" size={18} color="#fff"/>
                    <Text style={s.submitText}>Send Task</Text>
                  </>}
                </TouchableOpacity>
              </ScrollView>
            )}
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </>
  );
}

const s = StyleSheet.create({
  container:{flex:1,backgroundColor:'#f3f4f6'},
  content:{padding:16,gap:16,paddingBottom:40},
  center:{flex:1,justifyContent:'center',alignItems:'center'},
  row:{flexDirection:'row',alignItems:'center',gap:8},
  headerCard:{backgroundColor:'#fff',borderRadius:16,padding:16,flexDirection:'row',justifyContent:'space-between',alignItems:'center',shadowColor:'#000',shadowOffset:{width:0,height:2},shadowOpacity:0.06,shadowRadius:8,elevation:3},
  headerTitle:{fontSize:18,fontWeight:'bold',color:'#1e3a5f'},
  badge:{backgroundColor:'#dc2626',borderRadius:20,paddingHorizontal:10,paddingVertical:4},
  badgeText:{fontSize:12,color:'#fff',fontWeight:'700'},
  sendBtn:{flexDirection:'row',alignItems:'center',gap:4,backgroundColor:'#1e3a5f',borderRadius:20,paddingHorizontal:12,paddingVertical:6},
  sendBtnText:{fontSize:13,color:'#fff',fontWeight:'600'},
  tabsScroll:{marginHorizontal:-16,paddingHorizontal:16},
  tabsRow:{flexDirection:'row',gap:8,paddingRight:16},
  tab:{flexDirection:'row',alignItems:'center',gap:6,paddingHorizontal:16,paddingVertical:8,borderRadius:20,backgroundColor:'#fff',borderWidth:1,borderColor:'#e5e7eb'},
  tabActive:{backgroundColor:'#1e3a5f',borderColor:'#1e3a5f'},
  tabText:{fontSize:14,color:'#6b7280',fontWeight:'500'},
  tabTextActive:{color:'#fff',fontWeight:'700'},
  tabBadge:{backgroundColor:'#dc2626',borderRadius:10,minWidth:18,height:18,justifyContent:'center',alignItems:'center',paddingHorizontal:4},
  tabBadgeText:{fontSize:11,color:'#fff',fontWeight:'700'},
  emptyCard:{backgroundColor:'#fff',borderRadius:16,padding:40,alignItems:'center',gap:12},
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
  modalContainer:{flex:1,backgroundColor:'#f3f4f6'},
  modalHeader:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',padding:20,backgroundColor:'#fff',borderBottomWidth:1,borderBottomColor:'#e5e7eb'},
  modalTitle:{fontSize:18,fontWeight:'bold',color:'#1e3a5f'},
  modalBody:{flex:1,padding:16},
  label:{fontSize:13,fontWeight:'600',color:'#374151',marginBottom:8,marginTop:16},
  input:{backgroundColor:'#fff',borderRadius:12,borderWidth:1,borderColor:'#e5e7eb',paddingHorizontal:16,paddingVertical:12,fontSize:15,color:'#111827'},
  textArea:{height:100,textAlignVertical:'top'},
  noData:{fontSize:14,color:'#9ca3af',marginBottom:8},
  chip:{backgroundColor:'#fff',borderRadius:12,borderWidth:1,borderColor:'#e5e7eb',paddingHorizontal:14,paddingVertical:10,alignItems:'center',minWidth:110},
  chipSel:{backgroundColor:'#1e3a5f',borderColor:'#1e3a5f'},
  chipText:{fontSize:13,fontWeight:'600',color:'#111827'},
  chipTextSel:{color:'#fff'},
  chipSub:{fontSize:11,color:'#9ca3af',marginTop:2},
  pChip:{paddingHorizontal:16,paddingVertical:8,borderRadius:20,backgroundColor:'#f3f4f6',borderWidth:1,borderColor:'#e5e7eb'},
  pChipText:{fontSize:13,fontWeight:'600',color:'#374151'},
  dateBtn:{flexDirection:'row',alignItems:'center',gap:10,backgroundColor:'#fff',borderRadius:12,borderWidth:1,borderColor:'#e5e7eb',paddingHorizontal:16,paddingVertical:14},
  dateBtnText:{flex:1,fontSize:15,color:'#111827',fontWeight:'500'},
  submitBtn:{flexDirection:'row',alignItems:'center',justifyContent:'center',gap:8,backgroundColor:'#1e3a5f',borderRadius:14,padding:16,marginTop:24,marginBottom:40},
  submitText:{fontSize:16,fontWeight:'bold',color:'#fff'},
});
