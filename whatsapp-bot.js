git push -u origin mainrequire('dotenv').config();
const express = require('express');
const axios = require('axios');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const mongoose = require('mongoose');

const app = express();
app.use(express.json());

// MongoDB connection and ScheduledPost model
const MONGODB_URI = process.env.MONGODB_URI || "mongodb+srv://bukkyglory2020:cxMfKrMJK3J52cMG@cluster0.jyceljh.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0";
mongoose.connect(MONGODB_URI, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => console.log("✅ WhatsApp bot connected to MongoDB"))
  .catch((err) => console.error("❌ MongoDB connection error:", err));

const scheduledPostSchema = new mongoose.Schema({
  filename: String,
  caption: String,
  cloudinaryUrl: String,
  platforms: [String],
  hashtags: [String],
  scheduledTime: Date,
  status: { type: String, default: "pending" },
  createdAt: { type: Date, default: Date.now },
  generatedContent: mongoose.Schema.Types.Mixed,
});
const ScheduledPost = mongoose.model("ScheduledPost", scheduledPostSchema);

// Initialize Gemini AI
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

// WhatsApp config
const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID || '719752467884192';
const VERIFY_TOKEN = process.env.VERIFY_TOKEN || '10x_token';

// Webhook verification (required by Meta/Facebook)
app.get('/webhook', (req, res) => {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];
    if (mode && token) {
        if (mode === 'subscribe' && token === VERIFY_TOKEN) {
            console.log('Webhook verified!');
            res.status(200).send(challenge);
        } else {
            res.sendStatus(403);
        }
    } else {
        res.sendStatus(400);
    }
});

// Send WhatsApp message
async function sendWhatsAppMessage(to, message) {
    try {
        const response = await axios({
            url: `https://graph.facebook.com/v20.0/${PHONE_NUMBER_ID}/messages`,
            method: 'post',
            headers: {
                'Authorization': `Bearer ${WHATSAPP_TOKEN}`,
                'Content-Type': 'application/json'
            },
            data: {
                messaging_product: 'whatsapp',
                to: to,
                type: 'text',
                text: { body: message }
            }
        });
        console.log('Message sent successfully:', response.data);
        return response.data;
    } catch (error) {
        console.error('Error sending message:', error.response?.data || error.message);
        throw error;
    }
}

// Get Gemini AI response
async function getGeminiResponse(userMessage) {
    try {
        const prompt = userMessage;
        const result = await model.generateContent(prompt);
        const response = await result.response;
        return response.text();
    } catch (error) {
        console.error('Error getting Gemini response:', error);
        return "Sorry, I'm having trouble processing your request right now. Please try again later.";
    }
}

// Helper to parse date in DD/MM/YYYY or DD-MM-YYYY format
function parseDate(input) {
    const match = input.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
    if (!match) return null;
    const [_, day, month, year] = match;
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
}

// Webhook to receive WhatsApp messages
app.post('/webhook', async (req, res) => {
    const body = req.body;
    console.log('--- Incoming WhatsApp Webhook ---');
    console.dir(body, { depth: null });

    if (body.object) {
        if (body.entry && body.entry[0].changes && body.entry[0].changes[0] && body.entry[0].changes[0].value.messages && body.entry[0].changes[0].value.messages[0]) {
            const message = body.entry[0].changes[0].value.messages[0];
            const from = message.from;
            const messageText = message.text?.body?.trim();

            // 1. List upcoming uploads for a date
            const listMatch = messageText.match(/which upcoming upload.*?(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{4})/i);
            if (listMatch) {
                const date = parseDate(listMatch[1]);
                if (!date) {
                    await sendWhatsAppMessage(from, "Please provide a valid date in DD/MM/YYYY format.");
                } else {
                    const start = new Date(date);
                    const end = new Date(date);
                    end.setHours(23, 59, 59, 999);
                    const posts = await ScheduledPost.find({ scheduledTime: { $gte: start, $lte: end } }).sort({ scheduledTime: 1 });
                    if (posts.length) {
                        let reply = `Upcoming uploads for ${date}:\n\n`;
                        posts.forEach(post => {
                            reply += `ID: ${post._id}\nTime: ${new Date(post.scheduledTime).toLocaleString()}\nCaption: ${post.caption}\nPlatforms: ${(post.platforms || []).join(', ')}\nStatus: ${post.status}\n\n`;
                        });
                        await sendWhatsAppMessage(from, reply);
                    } else {
                        await sendWhatsAppMessage(from, `No uploads scheduled for ${date}.`);
                    }
                }
                return res.status(200).send('EVENT_RECEIVED');
            }

            // 2. Change date/time of a scheduled post
            const changeMatch = messageText.match(/change date.*?(\w{24}).*?(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{4})\s*(\d{1,2}:\d{2}(?:am|pm)?)/i);
            if (changeMatch) {
                // ...handle change logic...
                return res.status(200).send('EVENT_RECEIVED');
            }

            // 3. Cancel a scheduled post
            const cancelMatch = messageText.match(/cancel\s+(\w{24})/i);
            if (cancelMatch) {
                // ...handle cancel logic...
                return res.status(200).send('EVENT_RECEIVED');
            }

            // 4. Only fallback to Gemini for other messages
            if (messageText) {
                try {
                    // ...Gemini logic...
                } catch (error) {
                    // ...error handling...
                }
            }
        }
        res.status(200).send('EVENT_RECEIVED');
    } else {
        res.sendStatus(404);
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`WhatsApp bot server running on port ${PORT}`);
    console.log(`Webhook URL: http://localhost:${PORT}/webhook`);
    console.log('Make sure to set up ngrok or deploy to a public server for WhatsApp webhooks');
}); 