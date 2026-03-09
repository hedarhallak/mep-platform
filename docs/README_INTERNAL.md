# Mini EP / MEP Site Workforce App — اتفاقية داخلية + أرشفة المشروع (Master Archive)

> **هذه الوثيقة مرجع داخلي بيني وبينك** لتثبيت: (الرؤية) + (النطاق) + (ما تم إنجازه) + (الخطّة) + (قواعد العمل).
> الهدف: عدم ضياع السياق عند الانتقال بين محادثات كثيرة، وتجنّب إعادة الشرح، ومنع الانحراف عن “التبسيط الذكي”.

---

## 1) هوية المنتج (Product Identity)

### 1.1 ماذا نبني؟
نحن نبني نظام **Field Workforce Control** لإدارة العمل الميداني في مواقع مشاريع MEP (سباكة/كهرباء/ميكانيك) — يركّز على:
- حضور الموظفين بطريقة “ضغطة واحدة”
- تعيينات الموظفين على المشاريع (Assignments)
- طلب مواد من الموقع (Materials Request)
- تقارير (Exports) عملية (CSV) تغطي ما تحتاجه الإدارة
- تحليلات أداء ذكية **بشكل بسيط** (أرقام واضحة قبل الرسوم)

### 1.2 ماذا لسنا؟
لسنا نسخة من أنظمة FSM الثقيلة (مثل أنظمة “Work Orders + Invoicing + Customer Portal”).  
نحن ننافس بالـ **بساطة الذكية + السعر المنخفض + سرعة التبنّي**.

### 1.3 مبدأ غير قابل للتفاوض
> **التبسيط الذكي**: الذكاء يكون في الخلفية (guards, auto-detect, منع أخطاء) وليس في واجهة مربكة.

---

## 2) Phase 1 (المرحلة الأولى) — بسيطة وذكية (LOCKED)

### A) Attendance (الحضور)
**هدف Phase 1:** حضور “سهل جدًا”:
- Check In / Check Out
- المشروع والشفت تُستنتج تلقائيًا (قدر الإمكان)
- Absence Request موجود (سبب + ملاحظة) بدون تعقيد

**قاعدة:** العامل لا يختار مشروع يدويًا إلا إذا اضطررنا (fallback لاحقًا، إن لزم).

### B) Assignments (تعيينات المشاريع)
- Create Assignment (منطق واضح + منع overlap)
- Assignments List (مركز التحكم: بحث/فرز/تصدير/إدارة)
- Edit (تعديل مباشر لصاحب الصلاحية)
- Delete
- **Request Modify** (طلب تعديل/نقل ليوم واحد بين مديرين) — هو محور التميّز

### C) Materials Requests (طلبات المواد)
- Worker Draft → Submit
- Foreman view (طلبات اليوم)
- دمج البنود المتشابهة (merge preview)
- بدون أسعار أو موردين في Phase 1

### D) Reports (تقارير)
تقارير Phase 1 = **Exports** (CSV) قبل أي Dashboard:
- Timesheet
- Project Summary
- Travel Allowance (إن كانت موجودة ضمن النسخة الحالية)
- Parking Claims
- Materials (عند توفره)

### E) تحليلات الأداء (Smart Analytics)
في Phase 1: مؤشرات بسيطة وواضحة (Counts / Totals / Exceptions).
لا نبدأ برسومات أو “AI تنبؤي” قبل تثبيت القياسات الأساسية.

---

## 3) قرار معماري مهم: “Request Modify” بدل تعدد الشاشات

### 3.1 الفرق بين Edit و Request Modify
- **Edit**: تعديل مباشر (لصاحب المشروع/ADMIN حسب السياسة).
- **Request Modify**: مدير مشروع آخر يطلب الموظف **ليوم محدد** ضمن فترة تعيينه، ويحتاج موافقة.

### 3.2 لماذا هذا القرار قوي؟
- يقلّل عدد الشاشات
- يحافظ على تدفّق واقعي (PM ↔ PM)
- يمنع العبث في Assignments طويلة (split مؤجل إن لزم)
- يبقي النظام بسيطًا لكن “قويًا” في الواقع

---

## 4) قواعد UX ثابتة (لا رجعة عنها)

1) **كل شاشة = سؤال واحد**
- Create Assignment: مين/وين/متى/دور
- List: تحكم وإدارة
- Request Modify: طلب رسمي

2) **لا معلومات مكررة**
إذا المعلومة موجودة في List، لا نكررها في Create.

3) **الذكاء في الخلفية**
Auto-detect + Guards + منع تكرار الطلبات + رسائل خطأ واضحة.

4) **لا Tabs داخل Tabs**
الـ Sidebar داخل Assignments هو طريقة التنقل الأساسية (قرار ثابت حاليًا).

---

## 5) البنية التقنية (Tech Stack)

- Backend: Node.js + Express
- DB: PostgreSQL (مع توسّع PostGIS في بعض النقاشات/النسخ)
- Frontend: Vanilla JS + HTML/CSS
- Auth: JWT Bearer
- Timezone: America/Toronto

---

## 6) حالة المشروع الآن (Current Snapshot)

### 6.1 ما هو “مؤكّد شغال” وفق الأرشيف؟
- Server شغال وواجهة app.html تعمل عبر localhost
- JWT login + whoami موجودين
- Attendance موجود (Check-in/out) و Absence ذكر أنه موجود ضمن النسخ
- Assignments:
  - Create / List / Edit / Delete
  - منع overlap (UI + DB constraints)
  - Request Modify تم اعتماده وإضافته كزر في List (في أحدث اتجاه)
- Materials Requests (ذُكر أنه موجود ضمن نسخ Phase 1 مع flow Worker/Foreman)
- Reports CSV موجودة ومحميّة (ذُكر Admin key ثم RBAC لاحقًا)

> ملاحظة: قد توجد اختلافات بين “نسخ متعددة” عبر الزمن. هذه الوثيقة تثبّت الاتجاه النهائي، والنسخة العاملة تُحدد عند كل تحديث (انظر قسم 9).

---

## 7) سياسة التطوير بيننا (Working Agreement)

### 7.1 قواعد العمل
- شرح بالعربي، الكود بالإنجليزية فقط
- خطوة واحدة في كل مرة (Step-by-step)
- تفضيل “ملف كامل جاهز” بدل patch داخل الشات عندما يكون الملف طويلًا
- لا تغييرات تكسر الـ backend أو الـ stable flow
- لا إضافة ميزات خارج Phase 1 إلا بموافقة صريحة

### 7.2 طريقة التبادل لتقليل ضغط المحادثة
- تعتمد الملفات الجاهزة للتحميل والاستبدال (بدل لصق أكواد طويلة في الشات)
- أي تعديل: اسم الملف + نسخة جديدة جاهزة

---

## 8) خطة الاختبار (Phase 1 QA Checklist)

### Attendance
- Check-in يعمل ويحدد مشروع اليوم
- Check-out يعمل ويغلق اليوم
- Absence request يظهر ويُرسل

### Assignments
- Create assignment (يوم/فترة) ✅
- Overlap يمنع التعيين المتضارب ✅
- List يعرض بيانات صحيحة + بحث/فرز ✅
- Edit / Delete ✅
- Request Modify:
  - اختيار يوم داخل الفترة
  - اختيار To Project مختلف
  - منع duplicate pending
  - Approve/Reject (إن كانت ضمن النسخة الحالية)

### Materials
- Draft → Submit
- Foreman view
- Merge preview

### Reports
- كل CSV يُولد بدون أخطاء
- حماية endpoints صحيحة (حسب RBAC/Keys في النسخة الحالية)

---

## 9) سجل التحديثات (يُحدَّث يدويًا)
> عند كل خطوة جديدة: نضيف سطرين هنا.

**Template:**
- Date:
- Change:
- Files:
- Verified by user: (Yes/No)

---

## 10) المرحلة الثانية (Phase 2) — موجودة كفكرة فقط
- Invoices / Billing / Vendors
- Dashboards / BI
- Mobile app / PWA advanced
- GPS tracking advanced
> لا نبدأ بها قبل “Freeze Phase 1”.

---

## 11) أين نخزّن هذه الوثيقة؟
- داخل المشروع: `docs/PROJECT_ARCHIVE.md` (اقتراح)
- أو داخل `README_INTERNAL.md`
- ويمكن توليد نسخة PDF لاحقًا

---
