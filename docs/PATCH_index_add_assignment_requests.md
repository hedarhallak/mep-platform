# Patch: Wire up assignment_requests routes

## 1) Add file
Place the downloaded file into:
- `routes/assignment_requests.js`

## 2) Update `index.js`
Open your `index.js` and find where you mount routes (many app.use("/api/...", require("./routes/...")) lines).

Add this ONE line near the other routes:

```js
app.use("/api/assignment-requests", require("./routes/assignment_requests"));
```

## 3) Restart backend
Stop and start your server again.

## 4) Quick test (needs Bearer token)
- GET /api/assignment-requests/mine
- GET /api/assignment-requests/inbox (Admin only)
- POST /api/assignment-requests
