const express = require('express');
const { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } = require('@google/generative-ai');
const OpenAI = require('openai');
const Groq = require('groq-sdk');
const dotenv = require('dotenv');

dotenv.config();

const app = express();
const port = 3000;

app.use(express.static('public'));
app.use(express.json());

// Initialize AI providers
const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

const googleModels = [
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

async function generateWebsiteCode(provider, model, prompt) {
  switch (provider) {
    case 'google':
      return generateGoogleWebsiteCode(model, prompt);
    case 'openai':
      return generateOpenAIWebsiteCode(model, prompt);
    case 'groq':
      return generateGroqWebsiteCode(model, prompt);
    default:
      throw new Error('Invalid provider');
  }
}

async function generateGoogleWebsiteCode(model, prompt) {
  const googleModel = genAI.getGenerativeModel({ 
    model: model,
    systemInstruction:systemPrompt,
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

  const chat = googleModel.startChat({
    history: [
      {
        role: "model",
        parts: [{ text: "Understood. I'm ready to generate website code based on user descriptions. I'll provide clean, valid HTML, CSS, and JavaScript code without any explanations or markdown formatting." }],
      },
    ],
  });

  const result = await chat.sendMessageStream(prompt);
  return result.stream;
}

async function generateOpenAIWebsiteCode(model, prompt) {
  const stream = await openai.chat.completions.create({
    model: model,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: prompt }, 
    ],
    stream: true,
  });

  return stream;
}

async function generateGroqWebsiteCode(model, prompt) {
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

app.post('/generate', async (req, res) => {
  const { prompt, provider, model } = req.body;
  handleWebsiteGeneration(req, res, prompt, provider, model);
});

app.post('/modify', async (req, res) => {
  const { prompt, currentCode, provider, model } = req.body;
  const modifyPrompt = `Modify the following website code based on this instruction: ${prompt}\n\nCurrent code:\n${currentCode}`;
  handleWebsiteGeneration(req, res, modifyPrompt, provider, model);
});

async function handleWebsiteGeneration(req, res, prompt, provider, model) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive'
  });

  try {
    const stream = await generateWebsiteCode(provider, model, prompt);

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

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});