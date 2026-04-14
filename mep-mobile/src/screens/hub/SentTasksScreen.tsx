import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ActivityIndicator, ScrollView,
  RefreshControl, TouchableOpacity, Modal, Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { apiClient } from '../../api/client';
import { useFocusEffect } from '@react-navigation/native';

interface SentMessage {
  id: number; type: string; title: string; priority: string;
  due_date: string | null; created_at: string; project_code: string;
  total_recipients: number; acknowledged_count: number; pending_count: number;
  recipients: {
    first_name: string; last_name: string; username: string; status: string;
    acknowledged_at: string | null; completion_note: string | null; completion_image_url: string | null;
  }[];
}

function fmtDueDate(iso: string) { const d = new Date(iso); return d.toLocaleDateString('en-CA',{month:'short',day:'numeric',year:'numeric'}); }
function fmtDT(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString('en-CA',{month:'short',day:'numeric'})+' '+d.toLocaleTimeString('en-CA',{hour:'2-digit',minute:'2-digit',hour12:false});
}
function priorityColor(p: string) { return p==='URGENT'?'#dc2626':p==='HIGH'?'#f59e0b':'#2563eb'; }

export default function SentTasksScreen() {
  const [sent, setSent]                   = useState<SentMessage[]>([]);
  const [loading, setLoading]             = useState(true);
  const [refreshing, setRefreshing]       = useState(false);
  const [expandedSent, setExpandedSent]   = useState<Record<number,boolean>>({});
  const [fullScreenImg, setFullScreenImg] = useState<string|null>(null);

  const fetchSent = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const r = await apiClient.get('/api/hub/messages/sent');
      setSent(r.data?.messages || []);
    } catch {}
    finally { setLoading(false); setRefreshing(false); }
  }, []);

  useFocusEffect(useCallback(() => { fetchSent(); }, [fetchSent]));

  if (loading) return <View style={s.center}><ActivityIndicator size="large" color="#1e3a5f"/></View>;

  return (
    <View style={s.wrapper}>
      <ScrollView style={s.container} contentContainerStyle={s.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={()=>{setRefreshing(true);fetchSent(true);}} tintColor="#1e3a5f"/>}>
        {sent.length===0?(
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
                <View style={s.sentIcon}><Ionicons name="checkmark-circle-outline" size={20} color="#1e3a5f"/></View>
                <View style={{flex:1}}>
                  <View style={{flexDirection:'row',alignItems:'center',gap:6}}>
                    <Text style={s.sentTitle} numberOfLines={1}>{task.title}</Text>
                    <View style={[s.pBadge,{backgroundColor:priorityColor(task.priority)+'20'}]}>
                      <Text style={[s.pText,{color:priorityColor(task.priority)}]}>{task.priority}</Text>
                    </View>
                  </View>
                  <Text style={s.sentMeta}>
                    {fmtDT(task.created_at)}{task.project_code?` · ${task.project_code}`:''} · {total} recipient{total!==1?'s':''}
                    {task.due_date?` · Due ${fmtDueDate(task.due_date)}`:''}
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
                      <View key={i} style={[s.recipientCard, isDone&&{borderLeftColor:'#16a34a'}, isPending&&{borderLeftColor:'#d97706'}, isRead&&{borderLeftColor:'#2563eb'}]}>
                        <View style={{flexDirection:'row',justifyContent:'space-between',alignItems:'center'}}>
                          <View style={{flexDirection:'row',alignItems:'center',gap:8}}>
                            <View style={[s.recipientAvatar, isDone&&{backgroundColor:'#16a34a'}, isPending&&{backgroundColor:'#d97706'}, isRead&&{backgroundColor:'#2563eb'}]}>
                              <Text style={{fontSize:11,fontWeight:'700',color:'#fff'}}>{name[0]?.toUpperCase()}</Text>
                            </View>
                            <Text style={s.recipientName}>{name}</Text>
                          </View>
                          <View style={[s.recipientBadge, isDone&&{backgroundColor:'#f0fdf4'}, isPending&&{backgroundColor:'#fffbeb'}, isRead&&{backgroundColor:'#eff6ff'}]}>
                            <Text style={[s.recipientStatus, isDone&&{color:'#16a34a'}, isPending&&{color:'#d97706'}, isRead&&{color:'#2563eb'}]}>
                              {isDone?'✓ Done':isPending?'⏳ Pending':isRead?'👁 Seen':'📬 Sent'}
                            </Text>
                          </View>
                        </View>
                        {r.completion_note&&(
                          <View style={s.completionNoteBox}>
                            <Ionicons name="chatbubble-outline" size={12} color="#6b7280"/>
                            <Text style={s.completionNoteText}>{r.completion_note}</Text>
                          </View>
                        )}
                        {r.completion_image_url&&(
                          <TouchableOpacity onPress={()=>setFullScreenImg('https://app.constrai.ca/uploads'+r.completion_image_url)} style={{marginTop:8}}>
                            <Image source={{uri:'https://app.constrai.ca/uploads'+r.completion_image_url}} style={s.completionThumb} resizeMode="cover"/>
                            <Text style={{fontSize:11,color:'#6b7280',marginTop:4}}>Tap to view completion photo</Text>
                          </TouchableOpacity>
                        )}
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
      </ScrollView>

      {fullScreenImg&&(
        <Modal visible transparent animationType="fade">
          <TouchableOpacity style={{flex:1,backgroundColor:'rgba(0,0,0,0.9)',justifyContent:'center'}} onPress={()=>setFullScreenImg(null)}>
            <Image source={{uri:fullScreenImg}} style={{width:'100%',height:400}} resizeMode="contain"/>
          </TouchableOpacity>
        </Modal>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  wrapper:{flex:1,backgroundColor:'#f3f4f6'},
  container:{flex:1},
  content:{padding:16,gap:12,paddingBottom:40},
  center:{flex:1,justifyContent:'center',alignItems:'center',paddingVertical:40},
  emptyCard:{backgroundColor:'#fff',borderRadius:16,padding:40,alignItems:'center',gap:12,marginTop:8},
  emptyText:{fontSize:15,color:'#9ca3af'},
  pBadge:{paddingHorizontal:8,paddingVertical:2,borderRadius:20},
  pText:{fontSize:11,fontWeight:'700'},
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
});
