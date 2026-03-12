# MEP Platform — Update

## كيفية التطبيق

### الخطوة 1 — DB
```
psql -U postgres -d erp -f migrations/005_project_foremen.sql
```

### الخطوة 2 — انسخ الملفات لمشروعك
افتح الـ ZIP وانسخ كل ملف لمكانه بالضبط:

```
index.js                                              → (جذر المشروع)
routes/assignments.js                                 → routes/
routes/auto_assign.js                                 → routes/        ← جديد
routes/project_foremen.js                             → routes/        ← جديد
migrations/005_project_foremen.sql                    → migrations/
mep-frontend/src/pages/assignments/AssignmentsPage.jsx → mep-frontend/src/pages/assignments/
```

### الخطوة 3 — أعد تشغيل السيرفر
```
node index.js
```
