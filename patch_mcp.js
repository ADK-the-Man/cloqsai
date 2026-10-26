const fs = require('fs');

const file = '/usr/local/lib/node_modules/sample-aws-pricing-calculator-mcp/dist/mcp-server.js';
if (!fs.existsSync(file)) {
  console.log('File does not exist:', file);
  process.exit(1);
}

let content = fs.readFileSync(file, 'utf8');

// 1. Replace PQ(e)
const oldPQ = 'function PQ(e){return Object.entries(e).filter(([t,r])=>t!=="region"&&t!=="description"&&r!=null).map(([t,r])=>`${t} (${r&&typeof r=="object"?r.value:r})`).join(", ")}';

const newPQ = 'function PQ(e){return Object.entries(e).filter(([t,r])=>t!=="region"&&t!=="description"&&r!=null).map(([t,r])=>{let v=r&&typeof r=="object"?(r.value!==undefined?r.value:r):r;if(Array.isArray(v)){if(t==="columnFormIPM"&&v[0]){let it=v[0]["Instance Type"]?.value||v[0]["Instance Type"]||"";let dep=v[0]["Deployment Option"]?.value||v[0]["Deployment Option"]||"";return it?`Instance: ${it}${dep?" ("+dep+")":""}`:null}if(t==="columnFormIPM_1"&&v[0]){let it=v[0]["Instance Type"]?.value||v[0]["Instance Type"]||"";return it?`Data Nodes: ${it}`:null}if(t==="columnFormIPM_2"||t==="dataTransferForEC2")return null;return `${t}: ${v.length} items`}if(typeof v==="object"&&v!==null){if(v.value!==undefined&&v.unit!==undefined)return `${t} (${v.value} ${v.unit})`;if(v.value!==undefined)return `${t} (${v.value})`}return `${t} (${v})`}).filter(Boolean).join(", ")}';

// 2. Replace configSummary:""
const oldSum = 'version:I?.version||"0.0.1",configSummary:""}';
const newSum = 'version:I?.version||"0.0.1",configSummary:PQ(p)}';

let patched = content.replace(oldPQ, newPQ).replace(oldSum, newSum);

if (patched !== content) {
  fs.writeFileSync(file, patched, 'utf8');
  console.log('SUCCESS: Patched mcp-server.js cleanly!');
} else {
  console.log('WARNING: Could not match exact patterns in mcp-server.js');
}
