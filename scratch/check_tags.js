import fs from 'fs';
const content = fs.readFileSync('f:/Projects/sy.core/sy.core-app/src/components/ResultsPanel.vue', 'utf8');

function countTags(tagName) {
    const openRegex = new RegExp('<' + tagName + '(\\s|>)', 'g');
    const closeRegex = new RegExp('</' + tagName + '>', 'g');
    const openCount = (content.match(openRegex) || []).length;
    const closeCount = (content.match(closeRegex) || []).length;
    return { openCount, closeCount };
}

['div', 'template', 'button', 'span', 'h2', 'h3', 'h4', 'Transition'].forEach(tag => {
    const counts = countTags(tag);
    console.log(`${tag}: Open ${counts.openCount}, Close ${counts.closeCount}`);
});
