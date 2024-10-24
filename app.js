const express = require('express');
const { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } = require('@google/generative-ai');
const OpenAI = require('openai');
const Groq = require('groq-sdk');
const dotenv = require('dotenv');
const multer = require('multer');
const fs = require('fs');
const path = require('path');

dotenv.config();

const app = express();
const port = 3000;

app.use(express.static('public'));
app.use(express.json());

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
});

// Initialize AI providers
const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

const googleModels = [
  "gemini-1.5-flash-002",
  "gemini-1.5-pro-002",
  "gemini-1.5-flash",
  "gemini-1.5-pro-exp-0801",
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

const systemPrompt = "You are an AI assistant specialized in creating websites based on user descriptions. Your task is to generate clean, valid HTML, CSS, and JavaScript code for a website. Respond only with the code needed to create the website, without any explanations or markdown formatting. The code should be ready to be rendered directly in a browser.";

async function generateWebsiteCode(provider, model, prompt, images = []) {
  switch (provider) {
    case 'google':
      return generateGoogleWebsiteCode(model, prompt, images);
    case 'openai':
      return generateOpenAIWebsiteCode(model, prompt, images);
    case 'groq':
      return generateGroqWebsiteCode(model, prompt, images);
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
  // Check if it's a vision model
  const isVisionModel = model.includes('vision') || model.includes('llava');
  
  // If it's a vision model and we have images
  if (isVisionModel && images.length > 0) {
    // Groq only supports one image per request, so we'll use the first image
    const image = images[0];
    
    const stream = await groq.chat.completions.create({
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: prompt },
            {
              type: "image_url",
              image_url: {
                url: `data:image/jpeg;base64,${image}`
              }
            }
          ]
        }
      ],
      model: model,
      stream: true,
      temperature: 0.7,
      max_tokens: 4096
    });
    
    return stream;
  } else {
    // For non-vision models or requests without images, use the original approach
    const stream = await groq.chat.completions.create({
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: prompt }
      ],
      model: model,
      stream: true,
    });

    return stream;
  }
}

function encodeImageToBase64(buffer) {
  return buffer.toString('base64');
}

app.post('/generate', upload.array('images', 5), async (req, res) => {
  const { prompt, provider, model } = req.body;
  const images = req.files ? req.files.map(file => encodeImageToBase64(file.buffer)) : [];
  handleWebsiteGeneration(req, res, prompt, provider, model, images);
});

app.post('/modify', upload.array('images', 5), async (req, res) => {
  const { prompt, currentCode, provider, model } = req.body;
  const images = req.files ? req.files.map(file => encodeImageToBase64(file.buffer)) : [];
  const modifyPrompt = `Modify the following website code based on this instruction and the provided images: ${prompt}\n\nCurrent code:\n${currentCode}`;
  handleWebsiteGeneration(req, res, modifyPrompt, provider, model, images);
});

async function handleWebsiteGeneration(req, res, prompt, provider, model, images = []) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive'
  });

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
    groq: groqModels
  });
});

app.get('/', (req, res) => {
  res.sendFile(__dirname + 'public', '/index.html');
});

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});



module.exports = app;
