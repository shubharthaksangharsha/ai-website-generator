const aiPrompt = document.getElementById('ai-prompt');
const generateBtn = document.getElementById('generate-btn');
const modifyPrompt = document.getElementById('modify-prompt');
const modifyBtn = document.getElementById('modify-btn');
const previewFrame = document.getElementById('preview-frame');
const loading = document.getElementById('loading');
const providerSelect = document.getElementById('provider-select');
const modelSelect = document.getElementById('model-select');
const downloadBtn = document.getElementById('download-btn');

let currentWebsiteCode = '';
let models = {};

async function fetchModels() {
    const response = await fetch('/models');
    models = await response.json();
    updateModelSelect();
}

function updateModelSelect() {
    const provider = providerSelect.value;
    modelSelect.innerHTML = '';
    if (models[provider]) {
        models[provider].forEach(model => {
            const option = document.createElement('option');
            option.value = model;
            option.textContent = model;
            modelSelect.appendChild(option);
        });
    } else {
        console.error(`No models found for provider: ${provider}`);
    }
}

providerSelect.addEventListener('change', updateModelSelect);

fetchModels();

async function generateWebsite(prompt, isModify = false) {
    loading.classList.remove('hidden');
    generateBtn.disabled = true;
    modifyBtn.disabled = true;

    const endpoint = isModify ? '/modify' : '/generate';
    const body = {
        prompt: prompt,
        provider: providerSelect.value,
        model: modelSelect.value,
    };

    if (isModify) {
        body.currentCode = currentWebsiteCode;
    }

    try {
        const response = await fetch(endpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(body),
        });

        const reader = response.body.getReader();
        let accumulatedHtml = '';

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            
            const chunk = new TextDecoder().decode(value);
            const lines = chunk.split('\n');
            lines.forEach(line => {
                if (line.startsWith('data: ')) {
                    const data = JSON.parse(line.slice(6));
                    if (data.text) {
                        let cleanedText = cleanGeneratedCode(data.text);
                        accumulatedHtml += cleanedText;
                        updatePreview(accumulatedHtml);
                    }
                }
            });
        }

        currentWebsiteCode = accumulatedHtml;
    } catch (error) {
        console.error('Error:', error);
    } finally {
        loading.classList.add('hidden');
        generateBtn.disabled = false;
        modifyBtn.disabled = false;
    }
}

function cleanGeneratedCode(code) {
    // Remove any leading or trailing backticks
    code = code.replace(/^```|```$/g, '');
    
    // Remove any language specifiers like ```html or ```css
    code = code.replace(/```\w+\n/g, '');
    
    // Remove any <lang="en"> tags
    code = code.replace(/<lang="en">/g, '');
    
    return code;
}

function updatePreview(html) {
    // Remove any surrounding HTML tags if present
    html = html.replace(/^\s*<html>|<\/html>\s*$/gi, '');
    html = html.replace(/^\s*<body>|<\/body>\s*$/gi, '');

    // Extract style and script content
    let style = '';
    let script = '';
    const styleMatch = html.match(/<style>([\s\S]*?)<\/style>/i);
    const scriptMatch = html.match(/<script>([\s\S]*?)<\/script>/i);

    if (styleMatch) {
        style = styleMatch[1];
        html = html.replace(styleMatch[0], '');
    }
    if (scriptMatch) {
        script = scriptMatch[1];
        html = html.replace(scriptMatch[0], '');
    }

    // Clean up any remaining HTML, head, or body tags
    html = html.replace(/<\/?html>|<\/?head>|<\/?body>/gi, '');

    // Remove any leading "html" text
    html = html.replace(/^html/i, '');

    // Update the preview frame
    previewFrame.srcdoc = `
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Preview</title>
            <style>${style}</style>
        </head>
        <body>${html}</body>
        <script>${script}</script>
        </html>
    `;
}
async function downloadWebsite() {
    const zip = new JSZip();
    
    // Extract HTML content
    let htmlContent = currentWebsiteCode;
    
    // Extract and remove style content
    let style = '';
    const styleMatch = htmlContent.match(/<style>([\s\S]*?)<\/style>/i);
    if (styleMatch) {
        style = styleMatch[1];
        htmlContent = htmlContent.replace(styleMatch[0], '');
    }
    
    // Extract and remove script content
    let script = '';
    const scriptMatch = htmlContent.match(/<script>([\s\S]*?)<\/script>/i);
    if (scriptMatch) {
        script = scriptMatch[1];
        htmlContent = htmlContent.replace(scriptMatch[0], '');
    }
    
    // Clean up the HTML content
    htmlContent = htmlContent.replace(/^\s*<html>|<\/html>\s*$/gi, '');
    htmlContent = htmlContent.replace(/^\s*<body>|<\/body>\s*$/gi, '');
    htmlContent = htmlContent.replace(/<\/?html>|<\/?head>|<\/?body>/gi, '');
    
    // Create the final HTML file
    const finalHtml = `
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Generated Website</title>
            <link rel="stylesheet" href="styles.css">
        </head>
        <body>
            ${htmlContent}
            <script src="script.js"></script>
        </body>
        </html>
    `;
    
    zip.file("index.html", finalHtml);
    
    // Add CSS file
    if (style) {
        zip.file("styles.css", style);
    }
    
    // Add JS file
    if (script) {
        zip.file("script.js", script);
    }
    
    // Generate the zip file
    const content = await zip.generateAsync({type: "blob"});
    
    // Create a filename based on the user's prompt
    const prompt = aiPrompt.value.trim();
    const filename = prompt.split(' ').slice(0, 3).join('-').toLowerCase().replace(/[^a-z0-9-]/g, '') || 'my-website';
    
    // Save the zip file with the new filename
    saveAs(content, `${filename}.zip`);
}

generateBtn.addEventListener('click', () => generateWebsite(aiPrompt.value));
modifyBtn.addEventListener('click', () => generateWebsite(modifyPrompt.value, true));
downloadBtn.addEventListener('click', downloadWebsite);

