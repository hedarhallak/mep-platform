require('dotenv').config();
const fs = require('fs');
const path = 'C:\\Users\\Lenovo\\Desktop\\mep-site-backend-fixed\\mep-fixed\\routes\\hub.js';

let content = fs.readFileSync(path, 'utf8');

if (!content.includes('pushNotification')) {
  content = content.replace(
    '"use strict";',
    '"use strict";\nconst { sendPushNotification } = require("../lib/pushNotification");'
  );
}

const oldCode = `    await client.query("COMMIT");\n\n    res.status(201).json({`;
const newCode = `    await client.query("COMMIT");\n\n    for (const recipientId of recipients) {\n      sendPushNotification(recipientId, title, body || '', { type, message_id: messageId }).catch(() => {});\n    }\n\n    res.status(201).json({`;

if (content.includes(oldCode)) {
  content = content.replace(oldCode, newCode);
  fs.writeFileSync(path, content, 'utf8');
  console.log('Done');
} else {
  console.log('Pattern not found');
}
