const fs = require('fs');

let page = fs.readFileSync('src/app/admin/review/page.tsx', 'utf8');
page = page.replace(
  /rejectReason={n.status === "rejected" \? n.rejectReason : null}/,
  `rejectReason={n.status === "rejected" ? n.rejectReason : null}\n                discoveredUrl={n.discoveredUrl}\n                officialSourceUrl={n.officialSourceUrl}`
);
fs.writeFileSync('src/app/admin/review/page.tsx', page);
