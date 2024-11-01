const aiPrompt = document.getElementById('ai-prompt');
const generateBtn = document.getElementById('generate-btn');
const modifyPrompt = document.getElementById('modify-prompt');
const modifyBtn = document.getElementById('modify-btn');
const previewFrame = document.getElementById('preview-frame');
const loading = document.getElementById('loading');
const providerSelect = document.getElementById('provider-select');
const modelSelect = document.getElementById('model-select');
const downloadBtn = document.getElementById('download-btn');
const referenceImages = document.getElementById('reference-images');
const imagesPreviewContainer = document.getElementById('images-preview-container');
const imageStatus = document.getElementById('image-status');
const previewToggle = document.getElementById('preview-toggle');
const codeToggle = document.getElementById('code-toggle');
const codeView = document.getElementById('code-view');
const enhancePromptBtn = document.getElementById('enhance-prompt-btn');
const enhanceModifyPromptBtn = document.getElementById('enhance-modify-prompt-btn');
const modifyReferenceImages = document.getElementById('modify-reference-images');
const modifyImagesPreviewContainer = document.getElementById('modify-images-preview-container');
const modifyImageStatus = document.getElementById('modify-image-status');
const importProjectBtn = document.getElementById('import-project-btn');
const projectFilesInput = document.getElementById('project-files');
let modifyUploadedImages = [];

let currentWebsiteCode = '';
let models = [];
let uploadedImages = [];
let versionHistory = [];
let currentVersionIndex = -1;

// Add these constants at the top with your other constants
const deviceSizes = {
    mobile: { width: '375px', height: '667px' },
    tablet: { width: '768px', height: '1024px' },
    desktop: { width: '100%', height: '100%' }
};

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

async function enhancePrompt(promptText, button) {
    if (!promptText.trim()) {
        showNotification('Please enter a prompt first', 'error');
        return;
    }

    // Show loading state
    button.classList.add('loading');
    button.textContent = '⌛';

    try {
        const response = await fetch('/enhance-prompt', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                prompt: promptText,
                provider: providerSelect.value,
                model: modelSelect.value
            })
        });

        if (!response.ok) {
            throw new Error(await response.text());
        }

        const data = await response.json();
        
        if (!data.enhancedPrompt) {
            throw new Error('No enhanced prompt received');
        }

        // Update the corresponding textarea based on which button was clicked
        if (button.id === 'enhance-prompt-btn') {
            aiPrompt.value = data.enhancedPrompt;
        } else if (button.id === 'enhance-modify-prompt-btn') {
            modifyPrompt.value = data.enhancedPrompt;
        }
        
        // Show success notification
        showNotification('Prompt enhanced successfully!');
    } catch (error) {
        console.error('Error:', error);
        showNotification(error.message || 'Failed to enhance prompt', 'error');
    } finally {
        // Reset button state
        button.classList.remove('loading');
        button.textContent = '✨';
    }
}
enhancePromptBtn.addEventListener('click', () => {
    enhancePrompt(aiPrompt.value, enhancePromptBtn);
});

enhanceModifyPromptBtn.addEventListener('click', () => {
    enhancePrompt(modifyPrompt.value, enhanceModifyPromptBtn);
});

async function generateWebsite(prompt, isModify = false) {
    loading.classList.remove('hidden');
    generateBtn.disabled = true;
    modifyBtn.disabled = true;

    const formData = new FormData();
    formData.append('prompt', prompt);
    formData.append('provider', providerSelect.value);
    formData.append('model', modelSelect.value);

    if (isModify) {
        formData.append('currentCode', currentWebsiteCode);
        modifyUploadedImages.forEach(file => {
            formData.append('modifyImages', file);
        });
    } else {
        uploadedImages.forEach(file => {
            formData.append('images', file);
        });
    }

    try {
        const response = await fetch(isModify ? '/modify' : '/generate', {
            method: 'POST',
            body: formData
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
        
        // Add new version to history
        versionHistory.push({
            code: accumulatedHtml,
            timestamp: new Date(),
            prompt: prompt
        });
        currentVersionIndex = versionHistory.length - 1;
        
        // Update navigation UI
        updateVersionNavigation();
    } catch (error) {
        console.error('Error:', error);
    } finally {
        loading.classList.add('hidden');
        generateBtn.disabled = false;
        modifyBtn.disabled = false;
    }
}

function cleanGeneratedCode(code) {
    // Remove code block markers
    code = code.replace(/```\w*\n?/g, '');
    
    // Remove language tags
    code = code.replace(/<lang="[^"]*">/g, '');
    
    // Remove any leading/trailing whitespace
    code = code.trim();
    
    // Ensure style and script tags are properly formatted
    code = code.replace(/<style>\s*{/g, '<style>');
    code = code.replace(/}\s*<\/style>/g, '</style>');
    
    return code;
}

function updatePreview(html) {
    const previewFrame = document.getElementById('preview-frame');
    const activeDevice = document.querySelector('.device-btn.active')?.dataset.device || 'desktop';

    // Clean up any markdown code block syntax
    html = html.replace(/```html|```css|```javascript|```/g, '');

    // Extract style and script content
    let style = '';
    let script = '';
    let mainHtml = html;

    // Extract CSS
    const styleMatches = html.match(/<style[^>]*>([\s\S]*?)<\/style>/gi);
    if (styleMatches) {
        styleMatches.forEach(match => {
            style += match.replace(/<\/?style[^>]*>/g, '') + '\n';
            mainHtml = mainHtml.replace(match, '');
        });
    }

    // Extract JavaScript
    const scriptMatches = html.match(/<script[^>]*>([\s\S]*?)<\/script>/gi);
    if (scriptMatches) {
        scriptMatches.forEach(match => {
            script += match.replace(/<\/?script[^>]*>/g, '') + '\n';
            mainHtml = mainHtml.replace(match, '');
        });
    }

    // Clean up any remaining HTML, head, or body tags
    mainHtml = mainHtml.replace(/^\s*<html[^>]*>|<\/html>\s*$/gi, '');
    mainHtml = mainHtml.replace(/^\s*<body[^>]*>|<\/body>\s*$/gi, '');
    mainHtml = mainHtml.replace(/^\s*<head[^>]*>|<\/head>\s*$/gi, '');
    mainHtml = mainHtml.replace(/^html/i, '');

    // Create a complete HTML document
    const previewContent = `
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Preview</title>
            <style>
                /* Reset default styles */
                * {
                    margin: 0;
                    padding: 0;
                    box-sizing: border-box;
                }
                
                /* Add your extracted styles */
                ${style}
            </style>
        </head>
        <body>
            ${mainHtml}
            <script>
                // Wrap in try-catch to prevent errors from breaking the preview
                try {
                    ${script}
                } catch (error) {
                    console.error('Preview script error:', error);
                }
            </script>
        </body>
        </html>
    `;

    // Update the iframe content
    if (previewFrame) {
        previewFrame.srcdoc = previewContent;
        
        // Maintain the device frame settings
        if (activeDevice !== 'desktop') {
            previewFrame.classList.add('device-frame', `${activeDevice}-frame`);
            const size = deviceSizes[activeDevice];
            previewFrame.style.width = size.width;
            previewFrame.style.height = size.height;
        }
    }

    // Update code view
    updateCodeView(html);
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
    htmlContent = htmlContent
        .replace(/^\s*<html[^>]*>|<\/html>\s*$/gi, '')
        .replace(/^\s*<body[^>]*>|<\/body>\s*$/gi, '')
        .replace(/^\s*<head[^>]*>|<\/head>\s*$/gi, '')
        .replace(/^html/i, '')
        .replace(/^\s+|\s+$/g, ''); // Remove leading/trailing whitespace
    
    // Create the final HTML file with proper DOCTYPE and structure
    const finalHtml = `<!DOCTYPE html>
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
</html>`;
    
    zip.file("index.html", finalHtml);
    
    // Add CSS file
    if (style) {
        zip.file("styles.css", style.trim());
    }
    
    // Add JS file
    if (script) {
        zip.file("script.js", script.trim());
    }
    
    // Generate the zip file
    const content = await zip.generateAsync({type: "blob"});
    
    // Create a filename based on the user's prompt
    const prompt = aiPrompt.value.trim();
    const filename = prompt.split(' ').slice(0, 3).join('-').toLowerCase().replace(/[^a-z0-9-]/g, '') || 'my-website';
    
    // Save the zip file with the new filename
    saveAs(content, `${filename}.zip`);
}

function handleImageUpload(event) {
    const files = event.target.files;
    if (!files.length) return;

    if (providerSelect.value === 'groq') {
        uploadedImages = [files[0]];
    } else {
        uploadedImages = Array.from(files);
    }
    updateImagePreviews();
    updateImageUploadStatus();
    
    // Show upload notification
    showNotification(`${files.length} image${files.length > 1 ? 's' : ''} uploaded successfully!`);
}

function updateImagePreviews() {
    imagesPreviewContainer.innerHTML = '';
    
    uploadedImages.forEach((file, index) => {
        const wrapper = document.createElement('div');
        wrapper.className = 'image-preview-wrapper';

        const img = document.createElement('img');
        img.className = 'image-preview-item';
        img.src = URL.createObjectURL(file);
        img.alt = `Preview ${index + 1}`;

        const removeBtn = document.createElement('button');
        removeBtn.className = 'remove-image-btn';
        removeBtn.innerHTML = '×';
        removeBtn.onclick = () => removeImage(index);

        wrapper.appendChild(img);
        wrapper.appendChild(removeBtn);
        imagesPreviewContainer.appendChild(wrapper);
    });

    imagesPreviewContainer.classList.toggle('hidden', uploadedImages.length === 0);
}

function removeImage(index) {
    uploadedImages.splice(index, 1);
    updateImagePreviews();
    updateImageUploadStatus();
}

function updateImageUploadStatus() {
    const count = uploadedImages.length;
    imageStatus.textContent = count ? `${count} image${count > 1 ? 's' : ''} selected` : '';
}

generateBtn.addEventListener('click', () => generateWebsite(aiPrompt.value));
modifyBtn.addEventListener('click', () => generateWebsite(modifyPrompt.value, true));
downloadBtn.addEventListener('click', downloadWebsite);

referenceImages.addEventListener('change', handleImageUpload);

providerSelect.addEventListener('change', () => {
    const provider = providerSelect.value;
    const model = modelSelect.value;
    const imageUploadContainers = document.querySelectorAll('.image-upload-container');
    const isSupported = provider === 'google' || provider === 'openai' || provider === 'claude' || 
        (provider === 'groq' && (model.includes('vision') || model.includes('llava')));
    
    imageUploadContainers.forEach(container => {
        container.classList.toggle('disabled', !isSupported);
        const input = container.querySelector('input[type="file"]');
        if (input) input.disabled = !isSupported;
    });

    if (provider === 'groq') {
        [referenceImages, modifyReferenceImages].forEach(input => {
            input.removeAttribute('multiple');
        });
        if (uploadedImages.length > 1) {
            uploadedImages = [uploadedImages[0]];
            updateImagePreviews();
            updateImageUploadStatus();
        }
        if (modifyUploadedImages.length > 1) {
            modifyUploadedImages = [modifyUploadedImages[0]];
            updateModifyImagePreviews();
            updateModifyImageUploadStatus();
        }
    } else {
        [referenceImages, modifyReferenceImages].forEach(input => {
            input.setAttribute('multiple', 'multiple');
        });
    }
});

// Add a model change event listener to handle Groq vision models
modelSelect.addEventListener('change', () => {
  const provider = providerSelect.value;
  const model = modelSelect.value;
  const imageUploadContainer = document.querySelector('.image-upload-container');
  
  if (provider === 'groq') {
    const isVisionModel = model.includes('vision') || model.includes('llava');
    imageUploadContainer.classList.toggle('disabled', !isVisionModel);
    referenceImages.disabled = !isVisionModel;
    
    if (!isVisionModel) {
      uploadedImages = [];
      updateImagePreviews();
      updateImageUploadStatus();
    }
  }
});

// Add event listener for clipboard paste
document.addEventListener('paste', async (event) => {
    const activeElement = document.activeElement;
    const isModifySection = activeElement.closest('.modify-box') !== null;
    
    const provider = providerSelect.value;
    const model = modelSelect.value;
    const isSupported = provider === 'google' || provider === 'openai' || provider === 'claude' || 
        (provider === 'groq' && (model.includes('vision') || model.includes('llava')));
    
    if (!isSupported) return;

    const items = event.clipboardData.items;
    let imageFile = null;

    for (let i = 0; i < items.length; i++) {
        if (items[i].type.indexOf('image') !== -1) {
            imageFile = items[i].getAsFile();
            break;
        }
    }

    if (imageFile) {
        const file = new File([imageFile], `pasted-image-${Date.now()}.png`, {
            type: 'image/png'
        });

        if (isModifySection) {
            modifyUploadedImages.push(file);
            updateModifyImagePreviews();
            updateModifyImageUploadStatus();
        } else {
            uploadedImages.push(file);
            updateImagePreviews();
            updateImageUploadStatus();
        }
    }
});

// Add this helper function for notifications
function showNotification(message) {
    const notification = document.createElement('div');
    notification.className = 'paste-notification';
    notification.textContent = message;
    document.body.appendChild(notification);

    // Remove notification after animation
    setTimeout(() => {
        notification.remove();
    }, 3000);
}

// Add these new functions
function updateVersionNavigation() {
const previewHeader = document.querySelector('.preview-header');
    
    // Remove existing navigation if present
    const existingNav = previewHeader.querySelector('.version-navigation');
    if (existingNav) {
        existingNav.remove();
    }

    // Create new navigation element
    const navigation = document.createElement('div');
    navigation.className = 'version-navigation';
    navigation.innerHTML = `
        <button class="nav-btn prev-btn" title="Previous Version (←)">←</button>
        <span class="version-info"></span>
        <button class="nav-btn next-btn" title="Next Version (→)">→</button>
    `;
    
    // Insert after h2 but before view-controls
    const viewControls = previewHeader.querySelector('.view-controls');
    previewHeader.insertBefore(navigation, viewControls);
    
    // Add click handlers
    navigation.querySelector('.prev-btn').addEventListener('click', () => navigateVersion(-1));
    navigation.querySelector('.next-btn').addEventListener('click', () => navigateVersion(1));
    
    updateVersionInfo();
}

function updateVersionInfo() {
    const versionInfo = document.querySelector('.version-info');
    if (versionHistory.length > 0) {
        versionInfo.textContent = `Version ${currentVersionIndex + 1} of ${versionHistory.length}`;
    } else {
        versionInfo.textContent = 'No versions';
    }
    
    // Update button states
    const prevBtn = document.querySelector('.prev-btn');
    const nextBtn = document.querySelector('.next-btn');
    prevBtn.disabled = currentVersionIndex <= 0;
    nextBtn.disabled = currentVersionIndex >= versionHistory.length - 1;
}

function navigateVersion(delta) {
    const newIndex = currentVersionIndex + delta;
    if (newIndex >= 0 && newIndex < versionHistory.length) {
        currentVersionIndex = newIndex;
        const version = versionHistory[currentVersionIndex];
        updatePreview(version.code);
        updateVersionInfo();
    }
}

// Add keyboard navigation
document.addEventListener('keydown', (event) => {
    if (event.target.tagName === 'TEXTAREA') return; // Ignore when typing in textareas
    
    if (event.key === 'ArrowLeft') {
        navigateVersion(-1);
    } else if (event.key === 'ArrowRight') {
        navigateVersion(1);
    }
});

document.addEventListener('DOMContentLoaded', () => {
    const codeElement = codeView.querySelector('code');
    codeElement.contentEditable = 'true';
    codeElement.spellcheck = false;
});

// Add this function after updatePreview function
function updateCodeView(html) {
    const codeElement = codeView.querySelector('code');
    if (!codeElement.contentEditable) {
        codeElement.contentEditable = 'true';
        codeElement.spellcheck = false;
    }
    
    
    // Format the code with syntax highlighting
    const formattedCode = html
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/(".*?")/g, '<span class="string">$1</span>')
        .replace(/(&lt;\/?[a-z]+(&gt;)?)/g, '<span class="keyword">$1</span>')
        .replace(/(\/\*.*?\*\/|\/\/.*$)/gm, '<span class="comment">$1</span>');
    
    codeElement.innerHTML = formattedCode;
}

function executeCode() {
    const codeElement = codeView.querySelector('code');
    const code = codeElement.innerText
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&amp;/g, '&');
    
    updatePreview(code);
    previewToggle.click(); // Switch to preview mode
}

// Add event listeners for toggle buttons
previewToggle.addEventListener('click', () => {
    previewToggle.classList.add('active');
    codeToggle.classList.remove('active');
    previewFrame.classList.add('active');
    codeView.classList.remove('active');
});

codeToggle.addEventListener('click', () => {
    codeToggle.classList.add('active');
    previewToggle.classList.remove('active');
    codeView.classList.add('active');
    previewFrame.classList.remove('active');
});

// Add execute button functionality
const executeButton = document.getElementById('execute-code');
executeButton.addEventListener('click', executeCode);

// Add keyboard shortcut for toggling views
document.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.key === 'b') {
        if (previewFrame.classList.contains('active')) {
            codeToggle.click();
        } else {
            previewToggle.click();
        }
    }

    if (e.ctrlKey && e.key === 'Enter') {
        executeCode();
    }
});

// Add this function after your existing initialization code
function initializeDeviceControls() {
    const deviceButtons = document.querySelectorAll('.device-btn');
    const previewContainer = document.querySelector('.preview-container');
    const previewFrame = document.getElementById('preview-frame');
    
    if (!deviceButtons.length || !previewFrame) {
        console.error('Required elements not found');
        return;
    }
    
    // Wrap the iframe in a container div if not already wrapped
    if (!document.querySelector('.preview-frame-container')) {
        const container = document.createElement('div');
        container.className = 'preview-frame-container';
        previewFrame.parentNode.insertBefore(container, previewFrame);
        container.appendChild(previewFrame);
    }

    deviceButtons.forEach(button => {
        button.addEventListener('click', () => {
            const device = button.dataset.device;
            
            // Update active button state
            deviceButtons.forEach(btn => btn.classList.remove('active'));
            button.classList.add('active');
            
            // Remove all device frame classes
            previewFrame.classList.remove('device-frame', 'mobile-frame', 'tablet-frame', 'desktop-frame');
            
            if (device !== 'desktop') {
                previewFrame.classList.add('device-frame', `${device}-frame`);
            }
            
            // Update iframe size
            const size = deviceSizes[device];
            previewFrame.style.width = size.width;
            previewFrame.style.height = size.height;
        });
    });

    // Set desktop view as default (safely)
    const desktopButton = document.querySelector('[data-device="desktop"]');
    if (desktopButton) {
        desktopButton.click();
    }
}

// Update the DOMContentLoaded event listener
document.addEventListener('DOMContentLoaded', () => {
    // Ensure all required elements exist before initialization
    const requiredElements = [
        'preview-frame',
        'provider-select',
        'model-select',
        'code-view'
    ];
    
    const missingElements = requiredElements.filter(id => !document.getElementById(id));
    if (missingElements.length) {
        console.error('Missing required elements:', missingElements);
        return;
    }

    fetchModels();
    initializeDeviceControls();
});

function handleModifyImageUpload(event) {
    const files = event.target.files;
    if (!files.length) return;

    if (providerSelect.value === 'groq') {
        modifyUploadedImages = [files[0]];
    } else {
        modifyUploadedImages = Array.from(files);
    }
    updateModifyImagePreviews();
    updateModifyImageUploadStatus();
    
    showNotification(`${files.length} image${files.length > 1 ? 's' : ''} uploaded successfully!`);
}

function updateModifyImagePreviews() {
    modifyImagesPreviewContainer.innerHTML = '';
    
    modifyUploadedImages.forEach((file, index) => {
        const wrapper = document.createElement('div');
        wrapper.className = 'image-preview-wrapper';

        const img = document.createElement('img');
        img.className = 'image-preview-item';
        img.src = URL.createObjectURL(file);
        img.alt = `Preview ${index + 1}`;

        const removeBtn = document.createElement('button');
        removeBtn.className = 'remove-image-btn';
        removeBtn.innerHTML = '×';
        removeBtn.onclick = () => removeModifyImage(index);

        wrapper.appendChild(img);
        wrapper.appendChild(removeBtn);
        modifyImagesPreviewContainer.appendChild(wrapper);
    });

    modifyImagesPreviewContainer.classList.toggle('hidden', modifyUploadedImages.length === 0);
}

function removeModifyImage(index) {
    modifyUploadedImages.splice(index, 1);
    updateModifyImagePreviews();
    updateModifyImageUploadStatus();
}

function updateModifyImageUploadStatus() {
    const count = modifyUploadedImages.length;
    modifyImageStatus.textContent = count ? `${count} image${count > 1 ? 's' : ''} selected` : '';
}

modifyReferenceImages.addEventListener('change', handleModifyImageUpload);

function updateImageUploadVisibility() {
    const provider = providerSelect.value;
    const imageUploadSection = document.querySelector('.image-upload-section');
    const supportedProviders = referenceImages.dataset.providerSupport.split(',');
    
    if (supportedProviders.includes(provider)) {
        imageUploadSection.classList.remove('hidden');
    } else {
        imageUploadSection.classList.add('hidden');
        // Clear any existing images when switching to unsupported provider
        clearImagePreviews();
    }
}

// Add event listener for provider change
providerSelect.addEventListener('change', updateImageUploadVisibility);

// Call initially to set correct visibility
updateImageUploadVisibility();

function clearImagePreviews() {
    imagesPreviewContainer.innerHTML = '';
    imagesPreviewContainer.classList.add('hidden');
    imageStatus.textContent = '';
    referenceImages.value = '';
}

function updateImagePreview(files) {
    imagesPreviewContainer.innerHTML = '';
    if (files.length > 0) {
        imagesPreviewContainer.classList.remove('hidden');
        Array.from(files).forEach(file => {
            const reader = new FileReader();
            reader.onload = (e) => {
                const preview = document.createElement('div');
                preview.className = 'image-preview';
                preview.innerHTML = `
                    <img src="${e.target.result}" alt="Preview">
                    <button class="remove-image" title="Remove image">×</button>
                `;
                imagesPreviewContainer.appendChild(preview);
            };
            reader.readAsDataURL(file);
        });
        imageStatus.textContent = `${files.length} image(s) selected`;
    } else {
        clearImagePreviews();
    }
}

async function handleProjectImport(event) {
    const files = Array.from(event.target.files).filter(file => 
        file.name.endsWith('.html') || 
        file.name.endsWith('.css') || 
        file.name.endsWith('.js')
    );

    if (!files.length) {
        showNotification('No valid files found in directory', 'error');
        return;
    }

    let htmlContent = '';
    let cssContent = '';
    let jsContent = '';

    // Read all files
    for (const file of files) {
        const content = await file.text();
        
        if (file.name.endsWith('.html')) {
            // Extract body content if it exists
            const bodyMatch = content.match(/<body[^>]*>([\s\S]*)<\/body>/i);
            htmlContent = bodyMatch ? bodyMatch[1].trim() : content;
        } else if (file.name.endsWith('.css')) {
            cssContent += content + '\n';
        } else if (file.name.endsWith('.js')) {
            jsContent += content + '\n';
        }
    }

    // Construct the combined code
    const combinedCode = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Imported Project</title>
    <style>
        ${cssContent}
    </style>
</head>
<body>
    ${htmlContent}
    <script>
        ${jsContent}
    </script>
</body>
</html>`;

    // Update the preview with the imported code
    currentWebsiteCode = combinedCode;
    updatePreview(combinedCode);
    
    // Add to version history
    versionHistory.push({
        code: combinedCode,
        timestamp: new Date(),
        prompt: 'Imported Project'
    });
    currentVersionIndex = versionHistory.length - 1;
    updateVersionNavigation();
    
    // Show success notification
    showNotification(`Successfully imported ${files.length} files from directory!`);
}

// Update the event listener
importProjectBtn.addEventListener('click', () => {
    projectFilesInput.click();
});

projectFilesInput.addEventListener('change', handleProjectImport);