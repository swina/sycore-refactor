const fs = require('fs');
const code = fs.readFileSync('src/composables/useMidiCCListener.js', 'utf8');
try {
  new Function(code);
  console.log('Valid syntax');
} catch (e) {
  console.error('Invalid syntax:', e.message);
  console.error('At line:', e.lineNumber);
}
