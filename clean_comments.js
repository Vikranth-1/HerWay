const fs = require('fs');
const path = require('path');

const rootDir = 'c:/Users/HP/Desktop/VIKRANTH_V/Skill Gap identification & Smart Career Pathway for Rural Urban Women';

const files = [
    'client/assessment.html',
    'client/barter-results.html',
    'client/barter.html',
    'client/chat.html',
    'client/course-view.html',
    'client/index.html',
    'client/login.html',
    'client/profile.html',
    'client/skill-gap-finder.html',
    'client/style.css',
    'server/server.js',
    'server/reset_and_seed.sql',
    'server/test_supabase.js'
];

function cleanJS(js) {
    // Remove multi-line comments
    js = js.replace(/\/\*[\s\S]*?\*\//g, '');
    // Remove single-line comments (ignoring URLs)
    js = js.replace(/(^|[^:])\/\/.*/g, '$1');
    return js;
}

function cleanCSS(css) {
    // Remove multi-line comments
    css = css.replace(/\/\*[\s\S]*?\*\//g, '');
    return css;
}

function cleanHTML(html) {
    // Remove HTML comments
    html = html.replace(/<!--[\s\S]*?-->/g, '');

    // Process <style> tags
    html = html.replace(/<style>([\s\S]*?)<\/style>/gi, (match, p1) => {
        return `<style>${cleanCSS(p1)}</style>`;
    });

    // Process <script> tags
    html = html.replace(/<script(?![^>]*src=)([\s\S]*?)<\/script>/gi, (match, p1) => {
        return `<script>${cleanJS(p1)}</script>`;
    });

    return html;
}

files.forEach(file => {
    const fullPath = path.join(rootDir, file);
    if (!fs.existsSync(fullPath)) return;

    let content = fs.readFileSync(fullPath, 'utf8');
    const ext = path.extname(file);

    console.log(`Processing: ${file}`);

    if (ext === '.js') {
        content = cleanJS(content);
    } else if (ext === '.css') {
        content = cleanCSS(content);
    } else if (ext === '.html') {
        content = cleanHTML(content);
    } else if (ext === '.sql') {
        content = content.replace(/--.*/g, '');
        content = content.replace(/\/\*[\s\S]*?\*\//g, '');
    }

    fs.writeFileSync(fullPath, content);
});

console.log('Done!');
