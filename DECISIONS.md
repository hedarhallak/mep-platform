# Constrai — Architectural Decisions & Pending Work

> هذا الملف يوثّق كل قرار معماري متفق عليه + كل شغل مخطط له ولم يُنفَّذ بعد.
> في بداية كل محادثة: اقرأ MASTER_README.md ثم DECISIONS.md
> Raw URL: https://raw.githubusercontent.com/hedarhallak/mep-platform/main/DECISIONS.md

---

## كيف تستخدم هذا الملف

- ✅ **منفّذ** — تم التنفيذ وتم اختباره
- 🔄 **قيد التنفيذ** — بدأنا العمل عليه
- 🟡 **مخطط — أولوية عالية** — متفق عليه، لم يُنفَّذ بعد
- 🔵 **مخطط — أولوية متوسطة** — متفق عليه، وقته لاحقاً
- 💡 **فكرة مستقبلية** — موثّقة لكن ليست في الخطة القريبة

---

## قاعدة العمل — توثيق القرارات

> **كل قرار معماري أو تصميمي يُتفق عليه أثناء المحادثة → يُوثَّق فوراً في DECISIONS.md قبل الانتقال للخطوة التالية. لا نعتمد على الذاكرة أبداً.**
> Claude لا يرى المحادثات السابقة — DECISIONS.md هو الذاكرة الوحيدة المشتركة.

---

## 1. نظام الأدوار والصلاحيات — Role & Permission System

### المبدأ الجوهري المتفق عليه:

- **PERMISSIONS** — ثابتة في الكود، يضيفها المطور فقط عند إضافة feature جديد
- **ROLES** — مرنة بالكامل، يضيفها/يعدلها SUPER_ADMIN من الـ UI بدون أي كود
- **توزيع permissions على roles** — من الـ UI بدون أي كود
- **تعديل صلاحيات role** — UPDATE في DB من الـ UI، صفر كود
- إضافة منصب جديد أو تعديل صلاحياته = من الـ UI فقط، لا يحتاج مطور

```
PERMISSIONS (ثابتة في الكود)
    ↓
ROLES (مرنة — من UI)
    ↓
USERS (يُعيَّنون على role من COMPANY_ADMIN)
```

**Middleware المطلوب:**
```javascript
// الحالي (hardcoded — يُحذف)
if (req.user.role === 'WORKER') ...

// المطلوب (ديناميكي من DB)
if (hasPermission(req.user, 'attendance.checkin')) ...
```

**الحالة:** 🔄 قيد التنفيذ — الأولوية القصوى

---

### الأدوار المعتمدة — 13 Role:

| Role | Level | الوظيفة |
|---|---|---|
| SUPER_ADMIN | 100 | Constrai — إدارة كاملة للنظام |
| IT_ADMIN | 90 | إدارة تقنية للنظام |
| COMPANY_ADMIN | 80 | إدارة الشركة كاملة |
| TRADE_PROJECT_MANAGER | 60 | مدير المشاريع |
| TRADE_ADMIN | 50 | مدير الحرفة |
| FOREMAN | 40 | فورمان — app role كامل (ليس فقط assignment_role) |
| JOURNEYMAN | 20 | عامل متمرس |
| APPRENTICE_4 | 15 | متدرب مستوى 4 |
| APPRENTICE_3 | 15 | متدرب مستوى 3 |
| APPRENTICE_2 | 15 | متدرب مستوى 2 |
| APPRENTICE_1 | 15 | متدرب مستوى 1 |
| WORKER | 10 | عامل عادي |
| DRIVER | 10 | سائق |

---

### Permission Matrix الكاملة — المتفق عليها April 2026:

> SA=SUPER_ADMIN, IT=IT_ADMIN, CA=COMPANY_ADMIN, TPM=TRADE_PROJECT_MANAGER, TA=TRADE_ADMIN, FM=FOREMAN, JM=JOURNEYMAN, A4=APPRENTICE_4, A3=APPRENTICE_3, A2=APPRENTICE_2, A1=APPRENTICE_1, WK=WORKER, DR=DRIVER

| Permission | SA | IT | CA | TPM | TA | FM | JM | A4 | A3 | A2 | A1 | WK | DR |
|---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| assignments.create | ✅ | | ✅ | | ✅ | | | | | | | | |
| assignments.delete | ✅ | | ✅ | | ✅ | | | | | | | | |
| assignments.edit | ✅ | | ✅ | | ✅ | | | | | | | | |
| assignments.smart_assign | ✅ | | ✅ | | ✅ | | | | | | | | |
| assignments.view | ✅ | | ✅ | ✅ | ✅ | ✅ | | | | | | | |
| assignments.view_own_trade | ✅ | | ✅ | ✅ | ✅ | ✅ | | | | | | | |
| attendance.approve | ✅ | | ✅ | | ✅ | | | | | | | | |
| attendance.checkin | ✅ | | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| attendance.overtime_approve | ✅ | | ✅ | | ✅ | | | | | | | | |
| attendance.view | ✅ | | ✅ | ✅ | ✅ | ✅ | | | | | | | |
| attendance.view_own_trade | ✅ | | ✅ | ✅ | ✅ | ✅ | | | | | | | |
| attendance.view_self | ✅ | | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| audit.view | ✅ | ✅ | ✅ | | | | | | | | | | |
| bi.access_full | ✅ | | ✅ | | | | | | | | | | |
| bi.access_own_trade | ✅ | | ✅ | ✅ | ✅ | | | | | | | | |
| bi.workforce_planner | ✅ | | ✅ | ✅ | ✅ | | | | | | | | |
| dashboard.view | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| employees.create | ✅ | ✅ | ✅ | | | | | | | | | | |
| employees.delete | ✅ | ✅ | ✅ | | | | | | | | | | |
| employees.edit | ✅ | ✅ | ✅ | | | | | | | | | | |
| employees.invite | ✅ | ✅ | ✅ | | | | | | | | | | |
| employees.view | ✅ | ✅ | ✅ | | | | | | | | | | |
| employees.view_own_trade | ✅ | ✅ | ✅ | ✅ | ✅ | | | | | | | | |
| hub.access | ✅ | | ✅ | ✅ | ✅ | ✅ | | | | | | | |
| hub.attendance_approval | ✅ | | ✅ | | ✅ | | | | | | | | |
| hub.materials_inbox | ✅ | | ✅ | ✅ | ✅ | ✅ | | | | | | | |
| hub.materials_merge_send | ✅ | | ✅ | | ✅ | ✅ | | | | | | | |
| hub.receive_tasks | ✅ | | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| hub.send_tasks | ✅ | | ✅ | ✅ | ✅ | ✅ | | | | | | | |
| materials.catalog_view | ✅ | | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | |
| materials.request_submit | ✅ | | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | | | ✅ | |
| materials.request_view_all | ✅ | | ✅ | | | | | | | | | | |
| materials.request_view_own | ✅ | | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | | | ✅ | |
| materials.request_view_own_trade | ✅ | | ✅ | ✅ | ✅ | ✅ | | | | | | | |
| materials.surplus_declare | ✅ | | ✅ | | ✅ | ✅ | | | | | | | |
| materials.surplus_view | ✅ | | ✅ | ✅ | ✅ | ✅ | | | | | | | |
| projects.create | ✅ | | ✅ | | | | | | | | | | |
| projects.delete | ✅ | | ✅ | | | | | | | | | | |
| projects.edit | ✅ | | ✅ | | | | | | | | | | |
| projects.view | ✅ | | ✅ | | | | | | | | | | |
| projects.view_own_trade | ✅ | | ✅ | ✅ | ✅ | ✅ | | | | | | | |
| purchase_orders.print | ✅ | | ✅ | ✅ | ✅ | ✅ | | | | | | | |
| purchase_orders.view | ✅ | | ✅ | ✅ | ✅ | ✅ | | | | | | | |
| purchase_orders.view_own | ✅ | | ✅ | | ✅ | ✅ | ✅ | ✅ | | | | ✅ | |
| purchase_orders.view_own_trade | ✅ | | ✅ | ✅ | ✅ | | | | | | | | |
| reports.view | ✅ | | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | | | ✅ | |
| reports.view_self | ✅ | | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| settings.company | ✅ | ✅ | ✅ | | | | | | | | | | |
| settings.permissions | ✅ | ✅ | | | | | | | | | | | |
| settings.system | ✅ | ✅ | | | | | | | | | | | |
| settings.user_management | ✅ | ✅ | ✅ | | | | | | | | | | |
| standup.manage | ✅ | | ✅ | ✅ | ✅ | | | | | | | | |
| suppliers.create | ✅ | | ✅ | | | | | | | | | | |
| suppliers.delete | ✅ | | ✅ | | | | | | | | | | |
| suppliers.edit | ✅ | | ✅ | | | | | | | | | | |
| suppliers.view | ✅ | | ✅ | ✅ | ✅ | ✅ | | | | | | | |
| tasks.send | ✅ | | ✅ | ✅ | ✅ | ✅ | | | | | | | |
| tasks.view | ✅ | | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |

---

## 2. Mobile App — ملاحظات الاختبار April 2026

**ما يعمل:**
- ✅ Attendance — Check In / Check Out / Summary / منع Double Check-in
- ✅ My Hub — إرسال tasks + صور + إكمال + إرجاع للفورمان

**ما يحتاج عمل:**
- [ ] Materials ForemanWorkspaceScreen — بُني، لم يُختبر (ينتظر Role System)
- [ ] My Report — لم يُختبر
- [ ] Profile + Change PIN — لم يُختبر

### قرار UX — Dashboard First Navigation:

```
Bottom Bar: Home · Hub · Profile (3 فقط — ثابتة)
Dashboard: Grid of module icons — تظهر حسب الـ role
```

| Role | Modules |
|---|---|
| WORKER | Attendance · Materials · Report · Profile |
| FOREMAN | Attendance · Materials · Report · Assignments · Profile |
| TRADE_ADMIN+ | كل شيء |

**الحالة:** 🟡 مخطط — بعد Role System

---

## 3. نظام التعيينات الذكي

| من | يعيّن | آلية |
|---|---|---|
| COMPANY_ADMIN | الجميع | مباشر |
| TRADE_PROJECT_MANAGER | TRADE_ADMIN وما دونه | مباشر |
| TRADE_ADMIN | FOREMAN وما دونه | مباشر |
| FOREMAN | يقترح فقط | اقتراح → TRADE_ADMIN يوافق |

**الحالة:** 🟡 مخطط — بعد Role System

---

## 4. Dynamic Permissions

```
صلاحيات الشخص = صلاحيات role الأساسي
               + صلاحيات FOREMAN على مشاريعه
```

**الحالة:** 🔵 مخطط — بعد Role System و Smart Assignment

---

## 5. قرارات تقنية ثابتة

| القرار | التفاصيل | التاريخ |
|---|---|---|
| Mobile framework | React Native + Expo | March 2026 |
| Auth mobile | JWT + PIN | March 2026 |
| Token storage | AsyncStorage — mep_token / mep_user | April 2026 |
| Role check | Permission-based ديناميكي من DB | April 2026 |
| Roles | مرنة من UI — بدون كود | April 2026 |
| Permissions | ثابتة في الكود | April 2026 |
| Backend path | /var/www/mep | April 2026 |
| EAS Account | hedarhallak75 on expo.dev | April 2026 |
| Bundle ID | ca.constrai.app | April 2026 |
| Mobile Navigation | Dashboard First — Home · Hub · Profile | April 2026 |

---

## 6. ترتيب الأولويات

```
1. Role System Redesign
   a. standup.manage → permissions table
   b. مسح role_permissions الحالية + إعادة بناء من المصفوفة
   c. Middleware ديناميكي من DB
   d. Web UI — صفحة إدارة Roles
      ↓
2. Mobile Dashboard First Navigation
      ↓
3. اختبار Mobile كامل (Materials + Report + Profile)
      ↓
4. Smart Assignment System
      ↓
5. Dynamic Permissions
      ↓
6. App Store + Google Play
```
