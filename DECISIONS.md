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

## 1. نظام الأدوار والصلاحيات — Role & Permission System

### القرار المتفق عليه:
**تاريخ:** April 2026

**الوضع الحالي:** Roles hardcoded كـ text في الكود والـ DB

**القرار:** تحويل الـ roles إلى جدول مستقل في الـ DB مع `role_id` foreign key — بدون مرحلة انتقالية

**السبب:** مرونة كاملة — SUPER_ADMIN يضيف/يعدل roles من الـ UI بدون كود

**النموذج المعتمد:**
```
PERMISSIONS (ثابتة في الكود — يضيفها المطور عند إضافة feature)
    ↓
ROLES (مرنة — يضيفها SUPER_ADMIN من UI)
    ↓
USERS (يُعيَّنون على role من قِبَل COMPANY_ADMIN)
```

**الحالة:** 🟡 مخطط — أولوية عالية

---

### الأدوار المطلوبة (بعد التحويل):

| Role | Level | is_system | الوظيفة |
|---|---|---|---|
| SUPER_ADMIN | 100 | true | أنت — Constrai — إدارة كاملة |
| IT_ADMIN | 90 | true | إدارة تقنية للنظام |
| COMPANY_ADMIN | 80 | true | إدارة الشركة وإعطاء الصلاحيات |
| TRADE_PROJECT_MANAGER | 60 | true | مدير المشاريع — يرسل tasks لـ TRADE_ADMIN |
| TRADE_ADMIN | 50 | true | مدير الحرفة — يرسل tasks لـ FOREMAN |
| FOREMAN | 40 | true | فورمان — يرسل tasks للعمال — يدير مشروعه |
| JOURNEYMAN | 20 | true | عامل متمرس |
| APPRENTICE_1 | 15 | true | متدرب مستوى 1 |
| APPRENTICE_2 | 15 | true | متدرب مستوى 2 |
| APPRENTICE_3 | 15 | true | متدرب مستوى 3 |
| APPRENTICE_4 | 15 | true | متدرب مستوى 4 |
| WORKER | 10 | true | عامل عادي |
| DRIVER | 10 | true | سائق |

**ملاحظة:** FOREMAN هو app role كامل — ليس فقط assignment_role

---

### تعديل Middleware المطلوب:
```javascript
// الحالي (hardcoded — يُحذف)
if (req.user.role === 'WORKER') ...

// المطلوب (permission-based)
if (hasPermission(req.user, 'attendance.checkin')) ...
```

**الحالة:** 🟡 مخطط — أولوية عالية

---

## 2. نظام التعيينات الذكي — Smart Assignment System

### القرار المتفق عليه:
**تاريخ:** April 2026

**المشكلة:** التعيينات تتم يدوياً وما في رؤية كاملة لتوزيع العمالة

**القرار:** نظام اقتراح + موافقة مع Smart Workforce Exchange

**آلية العمل:**
```
الفورمان → يرفع طلب عمال إضافيين (مع أولوية + تاريخ + سبب)
    أو
الفورمان → يعرض تخفيف عمال من فريقه

TRADE_ADMIN → يشوف Dashboard كامل (طلبات + عروض)
           → يوافق على إعادة التوزيع
           → التعيين يصير تلقائياً
```

**من يعمل التعيينات:**
| من | يعيّن | آلية |
|---|---|---|
| COMPANY_ADMIN | الجميع | مباشر |
| TRADE_PROJECT_MANAGER | TRADE_ADMIN وما دونه | مباشر |
| TRADE_ADMIN | FOREMAN وما دونه | مباشر (الأساسي) |
| FOREMAN | يقترح فقط | اقتراح → TRADE_ADMIN يوافق |

**الحالة:** 🟡 مخطط — أولوية عالية (بعد Role System)

---

## 3. Dynamic Permissions — صلاحيات ديناميكية حسب Assignment

### القرار المتفق عليه:
**تاريخ:** April 2026

**الفكرة:** عند الـ login، النظام يفحص assignment اليوم ويعطي الصلاحيات تلقائياً

**المنطق:**
```
صلاحيات الشخص =
  صلاحيات role اليوم (من assignment اليوم)
  +
  صلاحيات FOREMAN كاملة على أي مشروع هو مُعيَّن فيه كـ FOREMAN
  (حتى لو المشروع متوقف مؤقتاً)
```

**مثال:**
- ABCD مُعيَّن اليوم كـ JOURNEYMAN على Project B → صلاحيات JOURNEYMAN
- ABCD كان/لازال FOREMAN على Project A (متوقف) → صلاحيات FOREMAN كاملة على Project A

**الحالة:** 🔵 مخطط — أولوية متوسطة (بعد Role System و Smart Assignment)

---

## 4. Mobile App — اختبار وإطلاق

### الوضع الحالي:
- iOS build مثبّت على iPhone ✅
- Android APK build جاهز ✅
- seed.worker1-50 / PIN: 1234 ✅

### المطلوب قبل App Store:
- [ ] اختبار Attendance screen كامل (check in/out)
- [ ] اختبار My Hub (استقبال tasks)
- [ ] اختبار Materials (طلب مواد)
- [ ] اختبار My Report
- [ ] اختبار Profile + Change PIN
- [ ] إصلاح أي bugs تظهر
- [ ] Build production iOS → App Store
- [ ] Build production Android → Google Play

**الحالة:** 🔄 قيد التنفيذ

---

## 5. My Hub — إرسال Tasks

### الوضع الحالي:
- My Hub شغّال للاستقبال ✅
- الإرسال يحتاج FOREMAN/TRADE_ADMIN role

### المطلوب:
- اختبار إرسال task من FOREMAN لـ WORKER
- التأكد من وصول الـ notification

**ملاحظة:** يحتاج Role System ينتهي أولاً لأن FOREMAN role غير موجود حالياً

**الحالة:** 🟡 مخطط — بعد Role System

---

## 6. Web Frontend — شغل متبقي

### شغل موثّق من محادثات سابقة لم يُنفَّذ:
- [ ] صفحة إدارة الـ Roles في SUPER_ADMIN panel
- [ ] تحديث permission matrix لتشمل الأدوار الجديدة
- [ ] صفحة Smart Assignment Dashboard لـ TRADE_ADMIN

**الحالة:** 🟡 مخطط — بعد Role System

---

## 7. قرارات تقنية ثابتة

| القرار | التفاصيل | التاريخ |
|---|---|---|
| Mobile framework | React Native + Expo (ليس PWA/Capacitor) | March 2026 |
| Auth mobile | JWT + PIN (ليس password) | March 2026 |
| Token storage | AsyncStorage — key: mep_token / mep_user | April 2026 |
| Role check | Permission-based (ليس role-based hardcoded) | April 2026 |
| Roles in DB | role_id foreign key — بدون مرحلة انتقالية | April 2026 |
| Backend path on server | /var/www/mep | April 2026 |
| EAS Account | hedarhallak75 on expo.dev | April 2026 |
| Bundle ID | ca.constrai.app | April 2026 |

---

## 8. ترتيب الأولويات — ماذا نعمل بالترتيب

```
1. Role System Redesign (DB + Middleware + UI)
      ↓
2. اختبار Mobile App كامل
      ↓
3. إصلاح bugs Mobile
      ↓
4. Smart Assignment System
      ↓
5. Dynamic Permissions
      ↓
6. App Store + Google Play submission
      ↓
7. My Hub — إرسال Tasks كامل
```
