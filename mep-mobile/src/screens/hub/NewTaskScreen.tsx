import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, ActivityIndicator, ScrollView,
  RefreshControl, TouchableOpacity, Modal, TextInput,
  Alert, Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import * as ImagePicker from 'expo-image-picker';
import { apiClient } from '../../api/client';
import Colors from '../../theme/colors';

// ------------------------------------------------------------------ types --

interface Worker { id: number; employee_id: number; first_name: string; last_name: string; role: string; trade_name: string; is_assigned: boolean; }
interface Project { id: number; project_code: string; project_name: string; }

// --------------------------------------------------------------- helpers --

const PRIORITIES = ['NORMAL', 'HIGH', 'URGENT'];
const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const DAYS = ['Su','Mo','Tu','We','Th','Fr','Sa'];

function fmtDateShort(d: Date) { return d.toISOString().split('T')[0]; }
function fmtDateDisplay(d: Date) { return `${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`; }
function fmtDueDate(iso: string) { const d = new Date(iso); return d.toLocaleDateString('en-CA',{month:'short',day:'numeric',year:'numeric'}); }
function fmtDT(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString('en-CA',{month:'short',day:'numeric'})+' '+d.toLocaleTimeString('en-CA',{hour:'2-digit',minute:'2-digit',hour12:false});
}
function priorityColor(p: string) { return p==='URGENT'?Colors.danger:p==='HIGH'?Colors.warning:Colors.info; }
function getDaysInMonth(y: number, m: number) { return new Date(y, m+1, 0).getDate(); }
function getFirstDay(y: number, m: number) { return new Date(y, m, 1).getDay(); }

// ---------------------------------------------------------------- Calendar --

function CalendarPicker({ value, onChange, minDate }: { value: Date; onChange: (d: Date) => void; minDate?: Date }) {
  const [view, setView] = useState({ year: value.getFullYear(), month: value.getMonth() });
  const days = getDaysInMonth(view.year, view.month);
  const firstDay = getFirstDay(view.year, view.month);
  const prev = () => { const d = new Date(view.year, view.month - 1); setView({ year: d.getFullYear(), month: d.getMonth() }); };
  const next = () => { const d = new Date(view.year, view.month + 1); setView({ year: d.getFullYear(), month: d.getMonth() }); };
  return (
    <View style={cal.container}>
      <View style={cal.header}>
        <TouchableOpacity onPress={prev} style={cal.navBtn}><Ionicons name="chevron-back" size={20} color="#1e3a5f"/></TouchableOpacity>
        <Text style={cal.title}>{MONTHS[view.month]} {view.year}</Text>
        <TouchableOpacity onPress={next} style={cal.navBtn}><Ionicons name="chevron-forward" size={20} color="#1e3a5f"/></TouchableOpacity>
      </View>
      <View style={cal.daysRow}>{DAYS.map(d=><Text key={d} style={cal.dayLabel}>{d}</Text>)}</View>
      <View style={cal.grid}>
        {Array(firstDay).fill(null).map((_,i)=><View key={`e${i}`} style={cal.cell}/>)}
        {Array(days).fill(null).map((_,i)=>{
          const date = new Date(view.year, view.month, i+1);
          const isSelected = date.toDateString() === value.toDateString();
          const isDisabled = minDate ? date < minDate : false;
          return (
            <TouchableOpacity key={i} style={[cal.cell, isSelected&&cal.selectedCell, isDisabled&&cal.disabledCell]}
              onPress={()=>!isDisabled&&onChange(date)} disabled={isDisabled}>
              <Text style={[cal.dayNum, isSelected&&cal.selectedNum, isDisabled&&cal.disabledNum]}>{i+1}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

// ================================================================ screen --

export default function NewTaskScreen() {
  const { t } = useTranslation();
  const [projects, setProjects]           = useState<Project[]>([]);
  const [workers, setWorkers]             = useState<Worker[]>([]);
  const [loading, setLoading]             = useState(true);
  const [sending, setSending]             = useState(false);
  const [showForm, setShowForm]           = useState(false);
  const [showWorkerModal, setShowWorkerModal] = useState(false);
  const [fullScreenImg, setFullScreenImg] = useState<string|null>(null);
  const [attachedFile, setAttachedFile]   = useState<{uri:string;name:string;type:string}|null>(null);
  const [workerSearch, setWorkerSearch]   = useState('');
  const [dueDate, setDueDate]             = useState(new Date());
  const [showCalendar, setShowCalendar]   = useState(false);
  const [form, setForm]                   = useState({ title:'', body:'', type:'TASK', priority:'NORMAL', project_id:'', recipient_ids:[] as number[] });
  const [refreshing, setRefreshing]       = useState(false);

  const setField = (k: string, v: any) => setForm(f => ({ ...f, [k]: v }));

  const fetchData = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const [r1, r2] = await Promise.all([
        apiClient.get('/api/hub/my-projects'),
        apiClient.get('/api/hub/workers'),
      ]);
      const p = r1.data?.projects || [];
      setProjects(p);
      setWorkers(r2.data?.workers || []);
      if (p.length > 0 && !form.project_id) setField('project_id', String(p[0].id));
    } catch {}
    finally { setLoading(false); setRefreshing(false); }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  useEffect(() => {
    if (!form.project_id) return;
    apiClient.get(`/api/hub/workers?project_id=${form.project_id}`)
      .then(r => setWorkers(r.data?.workers || []))
      .catch(() => {});
    setField('recipient_ids', []);
  }, [form.project_id]);

  const filteredWorkers = workerSearch.trim()
    ? workers.filter(w => `${w.first_name} ${w.last_name} ${w.role} ${w.trade_name}`.toLowerCase().includes(workerSearch.toLowerCase()))
    : workers;

  const toggleRecipient = (id: number) => {
    setField('recipient_ids', form.recipient_ids.includes(id)
      ? form.recipient_ids.filter(r => r !== id)
      : [...form.recipient_ids, id]);
  };
  const selectAll = () => setField('recipient_ids', filteredWorkers.map(w => w.id));
  const clearAll  = () => setField('recipient_ids', []);

  const resetForm = () => {
    setForm({ title:'', body:'', type:'TASK', priority:'NORMAL', project_id: projects.length>0?String(projects[0].id):'', recipient_ids:[] });
    setDueDate(new Date()); setWorkerSearch(''); setShowForm(false); setAttachedFile(null);
  };

  const pickImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') { Alert.alert('Permission needed', 'Please allow photo access.'); return; }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, allowsEditing: false, quality: 0.7 });
    if (!result.canceled && result.assets[0]) {
      const asset = result.assets[0];
      setAttachedFile({ uri: asset.uri, name: asset.uri.split('/').pop() || 'image.jpg', type: 'image/jpeg' });
    }
  };

  const handleSend = async () => {
    if (!form.title.trim()) { Alert.alert('Error', 'Title is required'); return; }
    if (!form.recipient_ids.length) { Alert.alert('Error', 'Select at least one recipient'); return; }
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
      if (attachedFile) fd.append('file', { uri: attachedFile.uri, name: attachedFile.name, type: attachedFile.type } as any);
      await apiClient.post('/api/hub/messages', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      resetForm();
      fetchData(true);
      Alert.alert(t('common.success'), `Task sent to ${form.recipient_ids.length} recipient(s).`);
    } catch (e: any) {
      Alert.alert('Error', e.response?.data?.error || 'Failed to send task.');
    } finally { setSending(false); }
  };

  const selectedWorkers = workers.filter(w => form.recipient_ids.includes(w.id));

  if (loading) return <View style={s.center}><ActivityIndicator size="large" color="#1e3a5f"/></View>;

  return (
    <View style={s.wrapper}>

      <ScrollView style={s.container} contentContainerStyle={s.content}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={()=>{setRefreshing(true);fetchData(true);}} tintColor="#1e3a5f"/>}>

          {!showForm&&(
            <TouchableOpacity style={s.newTaskBtn} onPress={()=>setShowForm(true)}>
              <Ionicons name="add-circle-outline" size={20} color="#fff"/>
              <Text style={s.newTaskText}>{t('tasks.newTaskBtn')}</Text>
            </TouchableOpacity>
          )}

          {showForm&&(
            <View style={s.formCard}>
              <Text style={s.formTitle}>{t('tasks.newTaskBtn')}</Text>

              <Text style={s.label}>{t('attendance.project')}</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{marginBottom:8}}>
                <View style={{flexDirection:'row',gap:8}}>
                  {projects.map(p=>(
                    <TouchableOpacity key={p.id} style={[s.chip, form.project_id===String(p.id)&&s.chipSel]}
                      onPress={()=>setField('project_id', String(p.id))}>
                      <Text style={[s.chipText, form.project_id===String(p.id)&&s.chipTextSel]}>{p.project_name}</Text>
                      <Text style={[s.chipSub, form.project_id===String(p.id)&&{color:Colors.primaryBright}]}>{p.project_code}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </ScrollView>

              <View style={s.workerHeader}>
                <Text style={s.label}>{t('tasks.recipients')} {form.recipient_ids.length>0?`(${form.recipient_ids.length})`:''}</Text>
                {form.recipient_ids.length>0&&(
                  <TouchableOpacity onPress={clearAll} style={s.selectBtn}>
                    <Text style={s.selectBtnText}>{t('materials.clear')}</Text>
                  </TouchableOpacity>
                )}
              </View>
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
              <TouchableOpacity style={s.workerPickerBtn} onPress={()=>{setWorkerSearch('');setShowWorkerModal(true);}}>
                <Ionicons name="people-outline" size={18} color="#1e3a5f"/>
                <Text style={[s.workerPickerText, form.recipient_ids.length===0&&{color:Colors.textLight}]}>
                  {form.recipient_ids.length===0?t('tasks.selectRecipients'):`${form.recipient_ids.length} selected - tap to edit`}
                </Text>
                <Ionicons name="chevron-forward" size={16} color="#9ca3af"/>
              </TouchableOpacity>

              <Text style={s.label}>{t('tasks.taskTitle')} *</Text>
              <TextInput style={s.input} placeholder={t('tasks.taskTitle')} placeholderTextColor="#9ca3af" value={form.title} onChangeText={v=>setField('title',v)}/>

              <Text style={s.label}>{t('tasks.description')}</Text>
              <TextInput style={[s.input,s.textArea]} placeholder={t('tasks.description')} placeholderTextColor="#9ca3af" value={form.body} onChangeText={v=>setField('body',v)} multiline numberOfLines={3}/>

              <Text style={s.label}>{t('tasks.priority')}</Text>
              <View style={{flexDirection:'row',gap:8,marginBottom:8}}>
                {PRIORITIES.map(p=>(
                  <TouchableOpacity key={p} style={[s.pChip, form.priority===p&&{backgroundColor:priorityColor(p),borderColor:priorityColor(p)}]} onPress={()=>setField('priority',p)}>
                    <Text style={[s.pChipText, form.priority===p&&{color:Colors.white}]}>{p}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={s.label}>{t('tasks.dueDate')}</Text>
              <TouchableOpacity style={s.dateButton} onPress={()=>setShowCalendar(true)}>
                <Ionicons name="calendar-outline" size={16} color="#1e3a5f"/>
                <Text style={s.dateButtonText}>{fmtDateDisplay(dueDate)}</Text>
              </TouchableOpacity>

              <Text style={s.label}>{t('tasks.attachment')}</Text>
              <TouchableOpacity style={s.attachBtn} onPress={pickImage}>
                <Ionicons name="image-outline" size={18} color="#1e3a5f"/>
                <Text style={[s.attachBtnText, !attachedFile&&{color:Colors.textLight}]}>
                  {attachedFile?attachedFile.name:t('tasks.addPhoto')}
                </Text>
                {attachedFile&&<TouchableOpacity onPress={()=>setAttachedFile(null)}><Ionicons name="close-circle" size={18} color="#dc2626"/></TouchableOpacity>}
              </TouchableOpacity>
              {attachedFile&&<Image source={{uri:attachedFile.uri}} style={s.previewImg} resizeMode="cover"/>}

              <View style={s.formActions}>
                <TouchableOpacity style={s.cancelBtn} onPress={resetForm}>
                  <Text style={s.cancelText}>{t('common.cancel')}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[s.sendBtn, sending&&{opacity:0.6}]} onPress={handleSend} disabled={sending}>
                  {sending?<ActivityIndicator color="#fff" size="small"/>:<>
                    <Ionicons name="send" size={16} color="#fff"/>
                    <Text style={s.sendBtnText}>{t('tasks.sendTask')}</Text>
                  </>}
                </TouchableOpacity>
              </View>
            </View>
          )}
        </ScrollView>



      {/* Full Screen Image */}
      {fullScreenImg&&(
        <Modal visible transparent animationType="fade">
          <TouchableOpacity style={{flex:1,backgroundColor:'rgba(0,0,0,0.9)',justifyContent:'center'}} onPress={()=>setFullScreenImg(null)}>
            <Image source={{uri:fullScreenImg}} style={{width:'100%',height:400}} resizeMode="contain"/>
          </TouchableOpacity>
        </Modal>
      )}

      {/* Calendar Modal */}
      <Modal visible={showCalendar} transparent animationType="fade">
        <View style={s.calOverlay}>
          <View style={s.calCard}>
            <Text style={s.calTitle}>{t('tasks.dueDate')}</Text>
            <CalendarPicker value={dueDate} onChange={d=>setDueDate(d)} minDate={new Date()}/>
            <TouchableOpacity style={s.calDone} onPress={()=>setShowCalendar(false)}>
              <Text style={s.calDoneText}>{t('common.done')}</Text>
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
            <View style={{flexDirection:'row',alignItems:'center',gap:6}}>
              <TouchableOpacity onPress={selectAll} style={s.selectBtn}><Text style={s.selectBtnText}>All</Text></TouchableOpacity>
              <TouchableOpacity onPress={clearAll} style={s.selectBtn}><Text style={s.selectBtnText}>Clear</Text></TouchableOpacity>
              <TouchableOpacity style={s.pickerDoneBtn} onPress={()=>setShowWorkerModal(false)}>
                <Text style={s.pickerDoneText}>Done</Text>
              </TouchableOpacity>
            </View>
          </View>
          <View style={s.pickerSearch}>
            <Ionicons name="search-outline" size={18} color="#9ca3af"/>
            <TextInput style={s.searchInput} placeholder="Search by name, role, trade..." placeholderTextColor="#9ca3af"
              value={workerSearch} onChangeText={setWorkerSearch} autoFocus/>
            {workerSearch.length>0&&<TouchableOpacity onPress={()=>setWorkerSearch('')}><Ionicons name="close-circle" size={18} color="#9ca3af"/></TouchableOpacity>}
          </View>
          <ScrollView style={{flex:1,paddingHorizontal:16}}>
            {filteredWorkers.length===0?(
              <View style={s.emptyCard}><Text style={s.emptyText}>No workers found</Text></View>
            ):filteredWorkers.map(w=>{
              const selected = form.recipient_ids.includes(w.id);
              return (
                <TouchableOpacity key={w.id} style={[s.workerRow, selected&&s.workerRowSel]} onPress={()=>toggleRecipient(w.id)}>
                  <View style={[s.workerAvatar, selected&&{backgroundColor:Colors.primary}]}>
                    <Text style={[s.workerAvatarText, selected&&{color:Colors.white}]}>{w.first_name[0]}{w.last_name[0]}</Text>
                  </View>
                  <View style={{flex:1}}>
                    <Text style={[s.workerName, selected&&{color:Colors.primary,fontWeight:'700'}]}>{w.first_name} {w.last_name}</Text>
                    <Text style={s.workerRole}>{w.role} Â· {w.trade_name||'General'}{w.is_assigned?' Â· Assigned':''}</Text>
                  </View>
                  {selected?<Ionicons name="checkmark-circle" size={22} color="#1e3a5f"/>:<View style={s.emptyCheck}/>}
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>
      </Modal>

    </View>
  );
}

// ------------------------------------------------------------------ styles --

const cal = StyleSheet.create({
  container:{paddingVertical:8},
  header:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',marginBottom:12},
  navBtn:{padding:8},
  title:{fontSize:16,fontWeight:'700',color:Colors.primary},
  daysRow:{flexDirection:'row',marginBottom:4},
  dayLabel:{width:'14.28%',textAlign:'center',fontSize:11,color:Colors.textLight,fontWeight:'600'},
  grid:{flexDirection:'row',flexWrap:'wrap'},
  cell:{width:'14.28%',aspectRatio:1,alignItems:'center',justifyContent:'center'},
  selectedCell:{backgroundColor:Colors.primary,borderRadius:20},
  disabledCell:{opacity:0.3},
  dayNum:{fontSize:14,color:Colors.textPrimary},
  selectedNum:{color:Colors.white,fontWeight:'700'},
  disabledNum:{color:Colors.textLight},
});

const s = StyleSheet.create({
  wrapper:{flex:1,backgroundColor:Colors.background},
  container:{flex:1},
  content:{padding:16,gap:12,paddingBottom:40},
  center:{flex:1,justifyContent:'center',alignItems:'center',paddingVertical:40},
  tabBar:{flexDirection:'row',backgroundColor:Colors.white,borderBottomWidth:1,borderBottomColor:Colors.divider},
  tab:{flex:1,flexDirection:'row',alignItems:'center',justifyContent:'center',gap:6,paddingVertical:14,borderBottomWidth:2,borderBottomColor:'transparent'},
  tabActive:{borderBottomColor:Colors.primary},
  tabText:{fontSize:14,fontWeight:'600',color:Colors.textMuted},
  tabTextActive:{color:Colors.primary},
  emptyCard:{backgroundColor:Colors.white,borderRadius:16,padding:40,alignItems:'center',gap:12,marginTop:8},
  emptyText:{fontSize:15,color:Colors.textLight},
  newTaskBtn:{flexDirection:'row',alignItems:'center',justifyContent:'center',gap:8,backgroundColor:Colors.primary,borderRadius:14,padding:14},
  newTaskText:{fontSize:15,fontWeight:'bold',color:Colors.white},
  formCard:{backgroundColor:Colors.white,borderRadius:16,padding:16,gap:4,shadowColor:Colors.shadowColor,shadowOffset:{width:0,height:2},shadowOpacity:0.06,shadowRadius:8,elevation:3},
  formTitle:{fontSize:17,fontWeight:'bold',color:Colors.primary,marginBottom:8},
  label:{fontSize:13,fontWeight:'600',color:Colors.textSecondary,marginBottom:6,marginTop:12},
  input:{backgroundColor:Colors.inputBg,borderRadius:10,borderWidth:1,borderColor:Colors.divider,paddingHorizontal:14,paddingVertical:10,fontSize:14,color:Colors.textPrimary},
  textArea:{height:80,textAlignVertical:'top'},
  chip:{backgroundColor:Colors.background,borderRadius:12,borderWidth:1,borderColor:Colors.divider,paddingHorizontal:14,paddingVertical:10,alignItems:'center',minWidth:100},
  chipSel:{backgroundColor:Colors.primary,borderColor:Colors.primary},
  chipText:{fontSize:13,fontWeight:'600',color:Colors.textSecondary},
  chipTextSel:{color:Colors.white},
  chipSub:{fontSize:11,color:Colors.textLight,marginTop:2},
  pChip:{paddingHorizontal:14,paddingVertical:8,borderRadius:20,backgroundColor:Colors.background,borderWidth:1,borderColor:Colors.divider},
  pChipText:{fontSize:13,fontWeight:'600',color:Colors.textSecondary},
  dateButton:{flexDirection:'row',alignItems:'center',gap:8,height:44,borderWidth:1,borderColor:Colors.divider,borderRadius:10,paddingHorizontal:12,backgroundColor:Colors.inputBg},
  dateButtonText:{fontSize:13,color:Colors.textPrimary,fontWeight:'500',flex:1},
  workerHeader:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',marginTop:12},
  selectBtn:{paddingHorizontal:10,paddingVertical:4,backgroundColor:Colors.background,borderRadius:8,borderWidth:1,borderColor:Colors.divider},
  selectBtnText:{fontSize:12,color:Colors.textSecondary,fontWeight:'600'},
  workerPickerBtn:{flexDirection:'row',alignItems:'center',gap:10,backgroundColor:Colors.inputBg,borderRadius:10,borderWidth:1,borderColor:Colors.divider,paddingHorizontal:14,paddingVertical:12,marginTop:4},
  workerPickerText:{flex:1,fontSize:14,color:Colors.textPrimary},
  selectedChip:{flexDirection:'row',alignItems:'center',gap:4,backgroundColor:Colors.primary,borderRadius:20,paddingHorizontal:10,paddingVertical:5},
  selectedChipText:{fontSize:12,color:Colors.white,fontWeight:'600'},
  formActions:{flexDirection:'row',gap:10,marginTop:16},
  cancelBtn:{flex:1,padding:14,borderRadius:12,backgroundColor:Colors.background,alignItems:'center'},
  cancelText:{fontSize:14,fontWeight:'600',color:Colors.textSecondary},
  sendBtn:{flex:2,flexDirection:'row',alignItems:'center',justifyContent:'center',gap:8,backgroundColor:Colors.primary,borderRadius:12,padding:14},
  sendBtnText:{fontSize:14,fontWeight:'bold',color:Colors.white},
  attachBtn:{flexDirection:'row',alignItems:'center',gap:10,backgroundColor:Colors.inputBg,borderRadius:10,borderWidth:1,borderColor:Colors.divider,paddingHorizontal:14,paddingVertical:12},
  attachBtnText:{flex:1,fontSize:14,color:Colors.textPrimary},
  previewImg:{width:'100%',height:180,borderRadius:12,marginTop:8},
  pBadge:{paddingHorizontal:8,paddingVertical:2,borderRadius:20},
  pText:{fontSize:11,fontWeight:'700'},
  sentCard:{backgroundColor:Colors.white,borderRadius:14,borderWidth:1,borderColor:Colors.divider,overflow:'hidden'},
  sentHeader:{flexDirection:'row',alignItems:'center',gap:10,padding:14},
  sentIcon:{width:36,height:36,borderRadius:10,backgroundColor:Colors.primaryPale,justifyContent:'center',alignItems:'center'},
  sentTitle:{fontSize:14,fontWeight:'600',color:Colors.textPrimary,flex:1},
  sentMeta:{fontSize:11,color:Colors.textLight,marginTop:2},
  sentProgress:{alignItems:'center',marginRight:4},
  sentPct:{fontSize:13,fontWeight:'bold',color:Colors.primary},
  sentPctSub:{fontSize:10,color:Colors.textLight},
  sentDetails:{borderTopWidth:1,borderTopColor:Colors.background,padding:12,gap:6},
  recipientCard:{backgroundColor:Colors.white,borderRadius:12,padding:12,borderLeftWidth:3,borderLeftColor:Colors.divider,borderWidth:1,borderColor:Colors.background,marginBottom:6},
  recipientAvatar:{width:26,height:26,borderRadius:13,backgroundColor:Colors.textLight,justifyContent:'center',alignItems:'center'},
  recipientName:{fontSize:13,fontWeight:'600',color:Colors.textPrimary},
  recipientBadge:{paddingHorizontal:8,paddingVertical:3,borderRadius:20},
  recipientStatus:{fontSize:11,fontWeight:'700'},
  completionNoteBox:{flexDirection:'row',alignItems:'flex-start',gap:6,marginTop:8,backgroundColor:Colors.inputBg,borderRadius:8,padding:8},
  completionNoteText:{fontSize:12,color:Colors.textSecondary,flex:1,lineHeight:18},
  completionThumb:{width:'100%',height:140,borderRadius:10},
  pendingNote:{flexDirection:'row',alignItems:'center',gap:6,padding:8,backgroundColor:'#fffbeb',borderRadius:8},
  pendingNoteText:{fontSize:12,color:'#d97706',flex:1},
  calOverlay:{flex:1,backgroundColor:'rgba(0,0,0,0.5)',justifyContent:'center',alignItems:'center',padding:24},
  calCard:{backgroundColor:Colors.white,borderRadius:20,padding:20,width:'100%'},
  calTitle:{fontSize:16,fontWeight:'700',color:Colors.primary,marginBottom:12,textAlign:'center'},
  calDone:{backgroundColor:Colors.primary,borderRadius:10,padding:12,alignItems:'center',marginTop:12},
  calDoneText:{color:Colors.white,fontWeight:'700',fontSize:14},
  pickerHeader:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',padding:16,backgroundColor:Colors.white,borderBottomWidth:1,borderBottomColor:Colors.divider},
  pickerTitle:{fontSize:17,fontWeight:'bold',color:Colors.primary},
  pickerSub:{fontSize:12,color:Colors.textLight,marginTop:2},
  pickerDoneBtn:{backgroundColor:Colors.primary,borderRadius:10,paddingHorizontal:14,paddingVertical:7},
  pickerDoneText:{fontSize:14,fontWeight:'700',color:Colors.white},
  pickerSearch:{flexDirection:'row',alignItems:'center',gap:10,backgroundColor:Colors.white,margin:12,borderRadius:12,borderWidth:1,borderColor:Colors.divider,paddingHorizontal:14,paddingVertical:10},
  searchInput:{flex:1,fontSize:15,color:Colors.textPrimary},
  workerRow:{flexDirection:'row',alignItems:'center',gap:12,backgroundColor:Colors.white,borderRadius:14,padding:12,marginBottom:8,borderWidth:1,borderColor:Colors.divider},
  workerRowSel:{borderColor:Colors.primary,backgroundColor:Colors.primaryPale},
  workerAvatar:{width:38,height:38,borderRadius:19,backgroundColor:'#e8f0fe',justifyContent:'center',alignItems:'center'},
  workerAvatarText:{fontSize:13,fontWeight:'700',color:Colors.primary},
  workerName:{fontSize:14,fontWeight:'600',color:Colors.textPrimary},
  workerRole:{fontSize:11,color:Colors.textLight,marginTop:1},
  emptyCheck:{width:22,height:22,borderRadius:11,borderWidth:2,borderColor:Colors.divider},
});
