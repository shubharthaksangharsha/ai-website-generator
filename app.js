const express = require('express');
const { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } = require('@google/generative-ai');
const OpenAI = require('openai');
const Groq = require('groq-sdk');
const dotenv = require('dotenv');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const cors = require('cors');
const Anthropic = require('@anthropic-ai/sdk');

dotenv.config();

const app = express();
const port = 3000;

// Add CORS middleware
app.use(cors({
  origin: process.env.NODE_ENV === 'production' 
    ? ['https://your-domain.vercel.app'] 
    : ['http://localhost:3000']
}));

app.use(express.static('public'));
app.use(express.json());

const upload = multer({
  storage: multer.memoryStorage(),
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Not an image! Please upload an image.'));
    }
  }
});

// Initialize AI providers
const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const googleModels = [
  "gemini-1.5-flash-002",
  "gemini-1.5-pro-002",
  "gemini-1.5-pro-exp-0801",
  "gemini-1.5-flash",
  "gemini-1.5-pro",
  "gemini-1.0-pro"
];

const openAIModels = [
  "gpt-4",
  "gpt-3.5-turbo",
  "gpt-4-0125-preview",
  "gpt-4-turbo-preview"
];

const groqModels = [
  "llama-3.2-90b-vision-preview",
  "llama-3.2-11b-vision-preview",
  "llava-v1.5-7b-4096-preview",
  "llama-3.1-405b-reasoning",
  "llama-3.1-70b-versatile",
  "llama-3.1-8b-instant",
  "llama3-groq-70b-8192-tool-use-preview",
  "llama3-groq-8b-8192-tool-use-preview",
  "llama3-70b-8192",
  "llama3-8b-8192",
  "mixtral-8x7b-32768",
  "gemma-7b-it",
  "gemma2-9b-it"
];

const claudeModels = [
  "claude-3-5-sonnet-20241022",
  "claude-3-opus-20240229",
  "claude-3-sonnet-20240229",
  "claude-3-haiku-20240307",
  "claude-2.1",
  "claude-2.0",
  "claude-instant-1.2"
];

const systemPrompt = `You are an AI assistant specialized in creating websites based on user descriptions. Your task is to generate clean, valid HTML, CSS, and JavaScript code for a website. Follow this exact structure and formatting:

<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>[Website Title]</title>
    <style>
        /* Reset default styles */
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        /* Main styles */
        body {
            font-family: Arial, sans-serif;
            line-height: 1.6;
        }

        /* Add your custom styles here */
    </style>
</head>
<body>
    <!-- Header Section -->
    <header>
        [Header Content]
    </header>

    <!-- Main Content -->
    <main>
        [Main Content]
    </main>

    <!-- Footer Section -->
    <footer>
        [Footer Content]
    </footer>

    <script>
        // Your JavaScript code here
    </script>
</body>
</html>

Follow these strict formatting rules:
1. Use 4 spaces for indentation
2. Place each HTML element on a new line
3. Add comments for major sections
4. Format CSS properties with one declaration per line
5. Include proper spacing around CSS brackets
6. Use semantic HTML5 elements
7. Ensure all tags are properly closed
8. Keep JavaScript clean and well-formatted

Respond only with the formatted code, no explanations or markdown.`;


app.post('/enhance-prompt', async (req, res) => {
    try {
        const { prompt, provider, model } = req.body;

        if (!prompt || !provider || !model) {
            throw new Error('Missing required parameters');
        }

        const systemPrompt = `As an AI assistant specializing in website creation, enhance this website description to be more detailed and specific. Focus on:
- Visual design elements (colors, typography, layout)
- User interface components
- Responsive design considerations
- Functionality and features
- User experience aspects
Keep the enhanced prompt clear and structured.`;

        let enhancedPrompt;

        switch (provider) {
            case 'google':
                const googleModel = genAI.getGenerativeModel({ model });
                const result = await googleModel.generateContent({
                    contents: [{ role: "user", parts: [{ text: `${systemPrompt}\n\nOriginal prompt: ${prompt}` }]}]
                });
                enhancedPrompt = result.response.text();
                break;

            case 'openai':
                const completion = await openai.chat.completions.create({
                    model,
                    messages: [
                        { role: "system", content: systemPrompt },
                        { role: "user", content: prompt }
                    ],
                    temperature: 0.7,
                    max_tokens: 500
                });
                enhancedPrompt = completion.choices[0].message.content;
                break;

            case 'groq':
                const groqResponse = await groq.chat.completions.create({
                    messages: [
                        { role: "system", content: systemPrompt },
                        { role: "user", content: prompt }
                    ],
                    model,
                    temperature: 0.7,
                    max_tokens: 500
                });
                enhancedPrompt = groqResponse.choices[0].message.content;
                break;

            case 'claude':
                const claudeResponse = await anthropic.messages.create({
                    model: model,
                    messages: [
                        { role: "system", content: systemPrompt },
                        { role: "user", content: prompt }
                    ],
                    max_tokens: 4096,
                    temperature: 0.7
                });
                enhancedPrompt = claudeResponse.content[0].text;
                break;

            default:
                throw new Error('Invalid provider');
        }

        res.json({ enhancedPrompt: enhancedPrompt.trim() });
    } catch (error) {
        console.error('Error enhancing prompt:', error);
        res.status(500).json({ error: error.message || 'Failed to enhance prompt' });
    }
});

async function generateWebsiteCode(provider, model, prompt, images = []) {
  switch (provider) {
    case 'google':
      return generateGoogleWebsiteCode(model, prompt, images);
    case 'openai':
      return generateOpenAIWebsiteCode(model, prompt, images);
    case 'groq':
      return generateGroqWebsiteCode(model, prompt, images);
    case 'claude':
      return generateClaudeWebsiteCode(model, prompt, images);
    default:
      throw new Error('Invalid provider');
  }
}

async function generateGoogleWebsiteCode(model, prompt, images = []) {
  const googleModel = genAI.getGenerativeModel({ 
    model: model,
    safetySettings: [
      {
        category: HarmCategory.HARM_CATEGORY_HARASSMENT,
        threshold: HarmBlockThreshold.BLOCK_NONE,
      },
      {
        category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,
        threshold: HarmBlockThreshold.BLOCK_NONE,
      },
      {
        category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
        threshold: HarmBlockThreshold.BLOCK_NONE,
      },
      {
        category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
        threshold: HarmBlockThreshold.BLOCK_NONE,
      },
    ],
  });

  const parts = [{ text: prompt }];
  
  if (images && images.length > 0) {
    images.forEach(img => {
      parts.push({
        inlineData: {
          data: img,
          mimeType: "image/jpeg"
        }
      });
    });
  }

  const chat = googleModel.startChat({
    history: [
      {
        role: "user", 
        parts: [{text: systemPrompt}],
      },
      {
        role: "model", 
        parts: [{text: "Understood. I will provide the website code based on user description and images. I'll provide clean, valid HTML, CSS, and JavaScript code without any explanations or markdown formatting. I will make sure <style> and <script> part comes within inside the <html>."}]

      },
      {
        role: "user",
        parts: [{ text: prompt }],
      },
      {
        role: "model",
        parts: [{ text: "Understood. I'm ready to generate website code based on user descriptions and images. I'll provide clean, valid HTML, CSS, and JavaScript code without any explanations or markdown formatting." }],
      },
    ],
  });

  const result = await chat.sendMessageStream(parts);
  return result.stream;
}

async function generateOpenAIWebsiteCode(model, prompt, images = []) {
  const messages = [
    { role: "system", content: systemPrompt }
  ];

  if (images && images.length > 0) {
    const content = [
      { type: "text", text: prompt },
      ...images.map(img => ({
        type: "image_url",
        image_url: {
          url: `data:image/jpeg;base64,${img}`,
          detail: "high"
        }
      }))
    ];
    messages.push({ role: "user", content });
  } else {
    messages.push({ role: "user", content: prompt });
  }

  const stream = await openai.chat.completions.create({
    model: model,
    messages: messages,
    stream: true,
  });

  return stream;
}

async function generateGroqWebsiteCode(model, prompt, images = []) {
  const isVisionModel = model.includes('vision') || model.includes('llava');
  
  const messages = [
    { 
      role: "system", 
      content: systemPrompt + "\nEnsure to maintain proper code formatting with appropriate line breaks and indentation."
    }
  ];
  
  if (isVisionModel && images.length > 0) {
    messages.push({
      role: "user",
      content: [
        { type: "text", text: prompt },
        {
          type: "image_url",
          image_url: {
            url: `data:image/jpeg;base64,${images[0]}`
          }
        }
      ]
    });
  } else {
    messages.push({ 
      role: "user", 
      content: prompt 
    });
  }
  
  const stream = await groq.chat.completions.create({
    messages: messages,
    model: model,
    stream: true,
    temperature: 0.7,
    max_tokens: 4096
  });
  return stream;
}

function encodeImageToBase64(buffer) {
  return buffer.toString('base64');
}

app.post('/generate', upload.array('images', 10), async (req, res) => {
  try {
    const { prompt, provider, model } = req.body;
    const images = req.files?.map(file => encodeImageToBase64(file.buffer)) || [];
    handleWebsiteGeneration(req, res, prompt, provider, model, images);
  } catch (error) {
    console.error('Error in generate:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/modify', upload.array('modifyImages', 10), async (req, res) => {
  try {
    const { prompt, currentCode, provider, model } = req.body;
    const images = req.files?.map(file => encodeImageToBase64(file.buffer)) || [];
    const modifyPrompt = `Modify the following website code based on this instruction and the provided images: ${prompt}\n\nCurrent code:\n${currentCode}`;
    handleWebsiteGeneration(req, res, modifyPrompt, provider, model, images);
  } catch (error) {
    console.error('Error in modify:', error);
    res.status(500).json({ error: error.message });
  }
});
const isServerless = process.env.VERCEL == '1';

async function handleWebsiteGeneration(req, res, prompt, provider, model, images = []) {
  if (isServerless){
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
  } else {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive'
    });
  }

  try {
    const stream = await generateWebsiteCode(provider, model, prompt, images);

    if (provider === 'google') {
      for await (const chunk of stream) {
        const chunkText = chunk.text();
        res.write(`data: ${JSON.stringify({ text: chunkText })}\n\n`);
      }
    } else if (provider === 'openai') {
      for await (const chunk of stream) {
        res.write(`data: ${JSON.stringify({ text: chunk.choices[0]?.delta?.content || '' })}\n\n`);
      }
    } else if (provider === 'groq') {
      for await (const chunk of stream) {
        res.write(`data: ${JSON.stringify({ text: chunk.choices[0]?.delta?.content || '' })}\n\n`);
      }
    } else if (provider === 'claude') {
      for await (const chunk of stream) {
        res.write(`data: ${JSON.stringify({ text: chunk.delta?.text || '' })}\n\n`);
      }
    }
  } catch (error) {
    console.error('Error:', error);
    res.write(`data: ${JSON.stringify({ error: 'An error occurred' })}\n\n`);
  }

  res.write('event: close\n\n');
  res.end();
}

app.get('/models', (req, res) => {
  res.json({
    google: googleModels,
    openai: openAIModels,
    groq: groqModels,
    claude: claudeModels
  });
});

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});

async function generateClaudeWebsiteCode(model, prompt, images = []) {
  const messages = [
    { 
      role: "system", 
      content: systemPrompt 
    }
  ];
  
  if (images && images.length > 0) {
    messages.push({
      role: "user",
      content: [
        {
          type: "text",
          text: prompt
        },
        ...images.map(img => ({
          type: "image",
          source: {
            type: "base64",
            media_type: "image/jpeg",
            data: img
          }
        }))
      ]
    });
  } else {
    messages.push({
      role: "user",
      content: prompt
    });
  }

  const stream = await anthropic.messages.create({
    model: model,
    messages: messages,
    max_tokens: 4096,
    stream: true
  });

  return stream;
}
