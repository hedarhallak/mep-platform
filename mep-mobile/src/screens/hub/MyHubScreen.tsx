import React, { useState, useEffect, useCallback } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import {
  View, Text, StyleSheet, ActivityIndicator, ScrollView,
  RefreshControl, TouchableOpacity, Modal, TextInput,
  Alert, KeyboardAvoidingView, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import * as ImagePicker from 'expo-image-picker';
import { Image } from 'react-native';
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
  recipients: { first_name: string; last_name: string; username: string; status: string; acknowledged_at: string | null; completion_note: string | null; completion_image_url: string | null }[];
}
interface Worker { id: number; employee_id: number; first_name: string; last_name: string; role: string; trade_name: string; is_assigned: boolean; }
interface Project { id: number; project_code: string; project_name: string; }

const PRIORITIES = ['NORMAL','HIGH','URGENT'];
// INBOX_TABS moved inside component
// Hub shows Inbox only - Send Task moved to Dashboard
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
  return (
    <Modal visible transparent animationType="fade">
      <View style={{ flex:1, backgroundColor:'rgba(0,0,0,0.97)' }}>
        <TouchableOpacity style={{ position:'absolute', top:50, right:20, zIndex:10, padding:10, backgroundColor:'rgba(255,255,255,0.15)', borderRadius:20 }} onPress={onClose}>
          <Ionicons name="close" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={{ position:'absolute', top:56, left:0, right:0, textAlign:'center', color:'rgba(255,255,255,0.4)', fontSize:12, zIndex:5 }}>Pinch to zoom Â· Double tap to reset</Text>
        <ScrollView
          style={{ flex:1 }}
          contentContainerStyle={{ flex:1, justifyContent:'center', alignItems:'center' }}
          maximumZoomScale={5}
          minimumZoomScale={1}
          showsHorizontalScrollIndicator={false}
          showsVerticalScrollIndicator={false}
          centerContent
        >
          <Image source={{ uri }} style={{ width:'100%', height:400 }} resizeMode="contain" />
        </ScrollView>
      </View>
    </Modal>
  );
}
export default function MyHubScreen() {
  const { t } = useTranslation();
  const INBOX_TABS = [{key:'ALL',label:t('hub.filters.all')},{key:'TASK',label:t('hub.filters.tasks')},{key:'GENERAL',label:t('hub.filters.general')}];
  const { user } = useAuthStore();


  const [messages, setMessages] = useState<HubMessage[]>([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [inboxTab, setInboxTab] = useState('ALL');

  const [fullScreenImg, setFullScreenImg] = useState<string|null>(null);
  const [expandedMsgs, setExpandedMsgs] = useState<Record<number,boolean>>({});
  const [completingId, setCompletingId] = useState<number|null>(null);
  const [completionNote, setCompletionNote] = useState('');
  const [completionFile, setCompletionFile] = useState<{uri:string;name:string;type:string}|null>(null); 


  // Refresh unread count when screen gains focus (updates bottom tab badge)
  useFocusEffect(
    useCallback(() => {
      fetchInbox();
    }, [])
  );

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

  const completeTask = async (id:number) => {
    setCompletingId(id);
    try {
      const fd = new FormData();
      if (completionNote.trim()) fd.append('completion_note', completionNote.trim());
      if (completionFile) {
        fd.append('completion_image', { uri: completionFile.uri, name: completionFile.name, type: completionFile.type } as any);
      }
      await apiClient.patch(`/api/hub/messages/${id}/complete`, fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setMessages(p=>p.map(m=>m.id===id?{...m,acknowledged_at:new Date().toISOString()}:m));
      setCompletionFile(null); setCompletionNote('');
    } catch (e:any) {
      Alert.alert('Error', e.response?.data?.error||'Failed to complete task.');
    } finally { setCompletingId(null); }
  };

  const filtered = inboxTab==='ALL'?messages:messages.filter(m=>m.type===inboxTab);

  if (loading) return <View style={s.center}><ActivityIndicator size="large" color="#1e3a5f"/></View>;

  return (
    <View style={s.wrapper}>

      {/* INBOX */}
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
            <View style={s.emptyCard}><Ionicons name="mail-outline" size={40} color="#d1d5db"/><Text style={s.emptyText}>{t('hub.noMessages')}</Text></View>
          ):filtered.map(msg=>{
            const isOpen = expandedMsgs[msg.id];
            const isNew = !msg.read_at;
            const isDone = !!msg.acknowledged_at;
            return (
              <View key={msg.id} style={[s.msgCard, isNew&&s.unreadCard]}>
                {/* Header - tap to expand */}
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
                      <View style={{gap:8}}>
                        <TextInput style={[s.input,{marginBottom:0}]} placeholder="Completion notes (optional)..." placeholderTextColor="#9ca3af" value={completionNote} onChangeText={setCompletionNote} multiline numberOfLines={2}/>
                        <TouchableOpacity style={s.completionPhotoBtn} onPress={pickCompletionImage}>
                          <Ionicons name="camera-outline" size={18} color="#1e3a5f"/>
                          <Text style={[s.completionPhotoBtnText, !completionFile&&{color:'#9ca3af'}]}>
                            {completionFile ? completionFile.name : 'Add completion photo (optional)'}
                          </Text>
                          {completionFile&&<TouchableOpacity onPress={()=>setCompletionFile(null)}><Ionicons name="close-circle" size={16} color="#dc2626"/></TouchableOpacity>}
                        </TouchableOpacity>
                        {completionFile&&<Image source={{uri:completionFile.uri}} style={{width:'100%',height:120,borderRadius:10}} resizeMode="cover"/>}
                        <TouchableOpacity style={[s.ackBtn,{opacity:completingId===msg.id?0.6:1}]} onPress={()=>completeTask(msg.id)} disabled={completingId===msg.id}>
                          {completingId===msg.id?<ActivityIndicator color="#fff" size="small"/>:<>
                            <Ionicons name="checkmark-done-outline" size={16} color="#fff"/>
                            <Text style={s.ackText}>{t('hub.markComplete')}</Text>
                          </>}
                        </TouchableOpacity>
                      </View>
                    )}
                    {isDone&&<View style={s.ackDone}><Ionicons name="checkmark-done" size={15} color="#16a34a"/><Text style={s.ackDoneText}>{t('hub.taskCompleted')}</Text></View>}
                  </View>
                )}
              </View>
            );
          })}
        </ScrollView>

      {/* Full Screen Image Modal */}
      {fullScreenImg&&<ImageViewer uri={fullScreenImg} onClose={()=>setFullScreenImg(null)}/>}



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
  recipientCard:{backgroundColor:'#fff',borderRadius:12,padding:12,borderLeftWidth:3,borderLeftColor:'#e5e7eb',borderWidth:1,borderColor:'#f3f4f6',marginBottom:6},
  recipientAvatar:{width:26,height:26,borderRadius:13,backgroundColor:'#9ca3af',justifyContent:'center',alignItems:'center'},
  recipientName:{fontSize:13,fontWeight:'600',color:'#111827'},
  recipientBadge:{paddingHorizontal:8,paddingVertical:3,borderRadius:20},
  recipientStatus:{fontSize:11,fontWeight:'700'},
  completionNoteBox:{flexDirection:'row',alignItems:'flex-start',gap:6,marginTop:8,backgroundColor:'#f9fafb',borderRadius:8,padding:8},
  completionNoteText:{fontSize:12,color:'#374151',flex:1,lineHeight:18},
  completionThumb:{width:'100%',height:140,borderRadius:10},
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
  completionPhotoBtn:{flexDirection:'row',alignItems:'center',gap:10,backgroundColor:'#f9fafb',borderRadius:10,borderWidth:1,borderColor:'#e5e7eb',paddingHorizontal:14,paddingVertical:12},
  completionPhotoBtnText:{flex:1,fontSize:13,color:'#111827'},
  attachBtn:{flexDirection:'row',alignItems:'center',gap:10,backgroundColor:'#f9fafb',borderRadius:10,borderWidth:1,borderColor:'#e5e7eb',paddingHorizontal:14,paddingVertical:12},
  attachBtnText:{flex:1,fontSize:14,color:'#111827'},
  previewImg:{width:'100%',height:180,borderRadius:12,marginTop:8},
  inboxImg:{width:'100%',height:200,borderRadius:12,marginTop:8},
});











