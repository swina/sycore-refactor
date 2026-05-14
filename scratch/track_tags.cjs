const fs = require('fs');
const content = fs.readFileSync('f:/Projects/sy.core/sy.core-app/src/components/ResultsPanel.vue', 'utf8');

// Simple parser to track tag nesting
const stack = [];
const tagRegex = /<(\/)?([a-z0-9-]+)([^>]*?)(\/)?>/gi;
let match;

while ((match = tagRegex.exec(content)) !== null) {
    const isClosing = !!match[1];
    const tagName = match[2].toLowerCase();
    const isSelfClosing = !!match[4];

    if (tagName === 'div' || tagName === 'template' || tagName === 'button') {
        if (isSelfClosing) {
            console.log(`Self-closing: <${tagName} ... />`);
            continue;
        }

        if (isClosing) {
            const last = stack.pop();
            if (last !== tagName) {
                console.error(`Mismatch! Found </${tagName}> but expected </${last}> at position ${match.index}`);
                // Break or continue?
            }
        } else {
            stack.push(tagName);
        }
    }
}

if (stack.length > 0) {
    console.error(`Unclosed tags at EOF: ${stack.join(', ')}`);
} else {
    console.log('All tags balanced!');
}
