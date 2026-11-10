const fs = require('fs');

const file = '/usr/local/lib/node_modules/sample-aws-pricing-calculator-mcp/dist/mcp-server.js';
if (!fs.existsSync(file)) {
  console.log('File does not exist:', file);
  process.exit(1);
}

let content = fs.readFileSync(file, 'utf8');

// Match whatever minified function name (Pce, PQ, etc.) parses config entries
const m = content.match(/function\s+([a-zA-Z0-9_$]+)\s*\(e\)\s*\{\s*return\s+Object\.entries\(e\)\.filter\(\(\[t,\s*r\]\)\s*=>\s*t\s*!==\s*"region"/);

if (m) {
  const fnName = m[1];
  const oldFuncRegex = new RegExp(`function\\s+${fnName}\\s*\\(e\\)\\{return\\s+Object\\.entries\\(e\\)\\.filter\\(\\(\\[t,r\\]\\)=>t!=="region"&&t!=="description"&&r!=null\\)\\.map\\(\\(\\[t,r\\]\\)=>\\\`\\$\\{t\\}\\s*\\(\\$\\{r&&typeof r=="object"\\?r\\.value:r\\}\\)\\\`\\)\\.join\\(", "\\)\\}`);
  const newFunc = `function ${fnName}(e){return Object.entries(e).filter(([t,r])=>t!=="region"&&t!=="description"&&r!=null).map(([t,r])=>{let v=r&&typeof r=="object"?(r.value!==undefined?r.value:r):r;if(Array.isArray(v)){if(t==="columnFormIPM"&&v[0]){let it=v[0]["Instance Type"]?.value||v[0]["Instance Type"]||"";let dep=v[0]["Deployment Option"]?.value||v[0]["Deployment Option"]||"";return it?\`Instance: \${it}\${dep?" ("+dep+")":""}\`:null}if(t==="columnFormIPM_1"&&v[0]){let it=v[0]["Instance Type"]?.value||v[0]["Instance Type"]||"";return it?\`Data Nodes: \${it}\`:null}if(t==="columnFormIPM_2"||t==="dataTransferForEC2")return null;return \`\${t}: \${v.length} items\`}if(typeof v==="object"&&v!==null){if(v.value!==undefined&&v.unit!==undefined)return \`\${t} (\${v.value} \${v.unit})\`;if(v.value!==undefined)return \`\${t} (\${v.value})\`}return \`\${t} (\${v})\`}).filter(Boolean).join(", ")}`;

  content = content.replace(oldFuncRegex, newFunc);
  content = content.replace(/configSummary:\s*(?:""|[a-zA-Z0-9_$]+\(p\))/g, `configSummary:${fnName}(p)`);
  fs.writeFileSync(file, content, 'utf8');
  console.log(`SUCCESS: Patched mcp-server.js cleanly using function ${fnName}!`);
} else {
  // If not matched, ensure no broken reference to undefined PQ remains
  content = content.replace(/configSummary:PQ\(p\)/g, 'configSummary:""');
  fs.writeFileSync(file, content, 'utf8');
  console.log('Cleaned up configSummary fallback');
}
