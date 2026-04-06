require('dotenv').config();
const fs = require('fs');
const path = 'C:\\Users\\Lenovo\\Desktop\\mep-site-backend-fixed\\mep-fixed\\index.js';

let content = fs.readFileSync(path, 'utf8');

const oldLine = 'app.use("/api/profile",         auth, loadRouter("./routes/profile"));';
const newLine = 'app.use("/api/profile",         auth, loadRouter("./routes/profile"));\napp.use("/api/profile",         auth, require("./routes/push_tokens_route"));';

if (content.includes(oldLine)) {
  content = content.replace(oldLine, newLine);
  fs.writeFileSync(path, content, 'utf8');
  console.log('Done — push token route added to index.js');
} else {
  console.log('Line not found — check manually');
}
