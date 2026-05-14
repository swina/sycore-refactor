const fs = require('fs');
const content = fs.readFileSync('f:/Projects/sy.core/sy.core-app/src/components/ResultsPanel.vue', 'utf8');

let pos = 0;
const stack = [];

while (pos < content.length) {
    if (content.startsWith('<div', pos)) {
        const end = content.indexOf('>', pos);
        const tag = content.slice(pos, end + 1);
        if (tag.endsWith('/>')) {
        } else {
            stack.push({ name: 'div', line: content.slice(0, pos).split('\n').length });
        }
        pos = end + 1;
    } else if (content.startsWith('</div>', pos)) {
        const line = content.slice(0, pos).split('\n').length;
        if (stack.length === 0) {
            console.error(`Extra </div> at line ${line}`);
        } else {
            const last = stack.pop();
            if (last.name !== 'div') {
                console.error(`Mismatched </div> at line ${line}, expected </${last.name}> (from line ${last.line})`);
            }
        }
        pos += 6;
    } else if (content.startsWith('<template', pos)) {
        const end = content.indexOf('>', pos);
        const tag = content.slice(pos, end + 1);
        if (tag.endsWith('/>')) {
        } else {
            stack.push({ name: 'template', line: content.slice(0, pos).split('\n').length });
        }
        pos = end + 1;
    } else if (content.startsWith('</template>', pos)) {
        const line = content.slice(0, pos).split('\n').length;
        if (stack.length === 0) {
            console.error(`Extra </template> at line ${line}`);
        } else {
            const last = stack.pop();
            if (last.name !== 'template') {
                console.error(`Mismatched </template> at line ${line}, expected </${last.name}> (from line ${last.line})`);
            }
        }
        pos += 11;
    } else {
        pos++;
    }
}
