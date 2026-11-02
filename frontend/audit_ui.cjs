const fs = require('fs');

const html = fs.readFileSync('frontend/index.html', 'utf8');

// 1. Check for duplicate IDs
const idRegex = /\sid=["']([^"']+)["']/g;
let m;
const idCounts = {};
while ((m = idRegex.exec(html)) !== null) {
  const id = m[1];
  idCounts[id] = (idCounts[id] || 0) + 1;
}
const duplicateIds = Object.entries(idCounts).filter(([_, count]) => count > 1);
console.log('=== DUPLICATE IDS ===');
console.log(duplicateIds);

// 2. Form inputs without labels or aria-label
console.log('\n=== INPUTS WITHOUT LABEL / ARIA-LABEL ===');
const inputRegex = /<(input|select|textarea)([^>]*)>/gi;
while ((m = inputRegex.exec(html)) !== null) {
  const tag = m[1];
  const attrs = m[2];
  const typeMatch = attrs.match(/type=["']([^"']+)["']/i);
  const type = typeMatch ? typeMatch[1].toLowerCase() : (tag === 'textarea' ? 'textarea' : 'text');
  if (['hidden', 'submit', 'button'].includes(type)) continue;

  const hasAriaLabel = /aria-label=/i.test(attrs);
  const hasAriaLabelledby = /aria-labelledby=/i.test(attrs);
  const idMatch = attrs.match(/id=["']([^"']+)["']/i);
  let hasAssociatedLabel = false;
  if (idMatch) {
    const id = idMatch[1];
    const labelRegex = new RegExp('<label[^>]*for=["\']' + id + '["\']', 'i');
    hasAssociatedLabel = labelRegex.test(html);
  }
  if (!hasAriaLabel && !hasAriaLabelledby && !hasAssociatedLabel) {
    console.log(`[${tag} type=${type}] id=${idMatch ? idMatch[1] : 'NONE'} | snippet: ${m[0].slice(0, 80)}...`);
  }
}

// 3. Buttons without text, title, or aria-label
console.log('\n=== BUTTONS WITHOUT ACCESSIBLE NAME ===');
const buttonRegex = /<button([^>]*)>([\s\S]*?)<\/button>/gi;
while ((m = buttonRegex.exec(html)) !== null) {
  const attrs = m[1];
  const inner = m[2].replace(/<[^>]+>/g, '').trim();
  const hasAriaLabel = /aria-label=/i.test(attrs);
  const hasTitle = /title=/i.test(attrs);
  const idMatch = attrs.match(/id=["']([^"']+)["']/i);
  if (!inner && !hasAriaLabel && !hasTitle) {
    console.log(`[button id=${idMatch ? idMatch[1] : 'NONE'}] snippet: ${m[0].slice(0, 100)}...`);
  }
}

// 4. Modals / Dialogs without aria-modal / role
console.log('\n=== MODAL / DIALOG CHECK ===');
const modalRegex = /<div[^>]*class=["'][^"']*(modal|dialog|drawer|popup)[^"']*["'][^>]*>/gi;
while ((m = modalRegex.exec(html)) !== null) {
  const tag = m[0];
  const hasRole = /role=["'](dialog|alertdialog)["']/i.test(tag);
  const hasAriaModal = /aria-modal=/i.test(tag);
  console.log(`Modal/Dialog: ${tag.slice(0, 80)}... (role=${hasRole}, aria-modal=${hasAriaModal})`);
}
