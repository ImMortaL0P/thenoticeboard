const fs = require('fs');

// Update ReviewQueueList component
let comp = fs.readFileSync('src/components/ReviewQueueList.tsx', 'utf8');
comp = comp.replace(
  /rejectReason: string \| null;\n\};/g,
  `rejectReason: string | null;\n  discoveredUrl: string | null;\n  officialSourceUrl: string | null;\n};`
);

// Add the original source link icon/button
comp = comp.replace(
  /(<span className="text-muted-foreground">→<\/span>\n    <\/Link>)/,
  `$1`
);
// Actually it's better to put it before the arrow, maybe next to the origin or reject reason, or on the right side.
// Wait, putting an <a> inside a Next.js <Link> wrapper is invalid HTML (Link renders an <a>, so <a> inside <a>).
// To fix this without breaking the entire clickable area, we can either make the list item a <div> and put the Link on the title, or we can use generic buttons with `e.preventDefault()`. Since Next.js <Link> is rendered as an <a> internally, nested <a> tags are strictly disallowed by HTML and cause hydration bugs.
