const fs = require('fs');
const path = require('path');

function testCidLogic(html, attachments) {
    // Simulate current regex
    const base64Regex = /src="data:(image\/[a-zA-Z]*);base64,([^"]*)"/g;
    let match;
    let imgCounter = 1;
    const matches = [];
    
    // We must be careful about multiple occurrences
    while ((match = base64Regex.exec(html)) !== null) {
        matches.push({ full: match[0], mime: match[1], data: match[2] });
    }

    matches.forEach(m => {
        const ext = m.mime.split('/')[1] || 'png';
        const cid = `img_cid_${imgCounter}`;
        
        // This is where it might fail if quotes are different
        html = html.split(m.full).join(`src="cid:${cid}"`);
        
        attachments.push({
            filename: `image_${imgCounter}.${ext}`,
            content: m.data,
            cid: cid
        });
        imgCounter++;
    });

    return html;
}

const sampleHtml = '<p>Test</p><img src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==" alt="test"><img src="http://localhost:3001/img/logo_dsi.png">';
const sampleAttachments = [];

let processedHtml = sampleHtml;

// Localhost replacer
if (processedHtml.includes('http://localhost:3001/img/logo_dsi.png')) {
    const cid = 'logo_dsi';
    processedHtml = processedHtml.split('http://localhost:3001/img/logo_dsi.png').join(`cid:${cid}`);
    sampleAttachments.push({
        filename: 'logo_dsi.png',
        content: 'dummy_base64',
        cid: cid
    });
}

processedHtml = testCidLogic(processedHtml, sampleAttachments);

console.log('Processed HTML:', processedHtml);
console.log('Attachments:', JSON.stringify(sampleAttachments, null, 2));

if (!processedHtml.includes('src="cid:logo_dsi"') && processedHtml.includes('cid:logo_dsi')) {
    console.log('Warning: logo_dsi replaced but maybe not inside src="..." as expected if quotes vary');
}
