require("dotenv").config();
const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const axios = require("axios");
const FormData = require("form-data");
const { createClient } = require("@deepgram/sdk");
const GeminiService = require("./gemini");
const { TwitterApi } = require("twitter-api-v2");
const cron = require("node-cron");
const cloudinary = require("cloudinary").v2;
const cors = require("cors");
const mongoose = require("mongoose");
const { google } = require("googleapis");
const drive = google.drive("v3");
const auth = new google.auth.GoogleAuth({
  keyFile: "path/to/your-service-account.json",
  scopes: ["https://www.googleapis.com/auth/drive"],
});
const driveClient = drive.files;

// MongoDB connection
const MONGODB_URI =
  process.env.MONGODB_URI ||
  "mongodb+srv://bukkyglory2020:cxMfKrMJK3J52cMG@cluster0.jyceljh.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0";
mongoose
  .connect(MONGODB_URI, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => console.log("✅ Connected to MongoDB"))
  .catch((err) => console.error("❌ MongoDB connection error:", err));

// ScheduledPost schema
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

// Initialize Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME || "drfzrl9zj",
  api_key: process.env.CLOUDINARY_API_KEY || "688311995351466",
  api_secret:
    process.env.CLOUDINARY_API_SECRET || "ClpgreJrbm586eessamWy1wYh1E",
});

const app = express();
const port = 4000;

// Initialize Gemini service
let geminiService;
try {
  geminiService = new GeminiService();
  console.log("✅ Gemini service initialized successfully");
} catch (error) {
  console.warn("⚠️ Gemini service initialization failed:", error.message);
  geminiService = null;
}

// Middleware
app.use(
  cors({
    origin: "*", // Or restrict to your Vercel frontend domain
  })
);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.post("/webhook", async (req, res) => {
  const { from, body: messageText, timestamp } = req.body;
  console.log("Received from bot:", req.body);

  // 1. Schedule post if message is a date/time (with or without space before am/pm)
  const dateTimeMatch =
    (messageText &&
      messageText.match(
        /(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{4})\s+(\d{1,2}:\d{2}(?:\s*[ap]m)?)/i
      )) ||
    messageText.match(
      /(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{4})\s*(\d{1,2}:\d{2}[ap]m)/i
    );
  if (dateTimeMatch && global.lastDriveUpload) {
    const [_, date, time] = dateTimeMatch;
    function parseDate(input) {
      const match = input.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
      if (!match) return null;
      const [__, day, month, year] = match;
      return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
    }
    const dateTimeStr = `${parseDate(date)} ${time.replace(
      /([ap]m)$/i,
      " $1"
    )}`;
    const scheduleDate = new Date(dateTimeStr);
    if (isNaN(scheduleDate) || scheduleDate <= new Date()) {
      await sendWhatsAppMessage(
        from,
        "Invalid or past schedule time. Please reply in DD/MM/YYYY HH:mm am/pm format and use a future time."
      );
      return res.status(200).send("EVENT_RECEIVED");
    }
    const { fileName, cloudinaryUrl, folderName, uniqueId, captions } =
      global.lastDriveUpload;
    let platforms = [];
    if (/tiktok/i.test(folderName) && /instagram/i.test(folderName)) {
      platforms = ["tiktok", "instagram"];
    } else if (/tiktok/i.test(folderName)) {
      platforms = ["tiktok"];
    } else if (/instagram/i.test(folderName)) {
      platforms = ["instagram"];
    } else {
      platforms = ["facebook", "instagram", "tiktok", "twitter", "linkedin"];
    }
    function extractHashtags(text) {
      return (text.match(/#\w+/g) || []).map((tag) => tag.toLowerCase());
    }
    const hashtags = extractHashtags(
      captions.facebook || captions.tiktok || ""
    );
    const scheduledDoc = await ScheduledPost.create({
      filename: fileName,
      caption: captions.facebook || captions.tiktok || folderName,
      cloudinaryUrl,
      platforms,
      hashtags,
      scheduledTime: scheduleDate,
      status: "pending",
      generatedContent: captions,
    });
    await sendWhatsAppMessage(
      from,
      `✅ 10X has scheduled '${fileName}' for ${scheduleDate.toLocaleString()} on ${platforms.join(
        ", "
      )}.`
    );
    global.lastDriveUpload = null;
    return res.status(200).send("EVENT_RECEIVED");
  }

  // 2. List scheduled posts for a date
  const listMatch =
    messageText &&
    messageText.match(
      /what do we have to post on (\d{1,2}[\/\-]\d{1,2}[\/\-]\d{4})/i
    );
  if (listMatch) {
    function parseDate(input) {
      const match = input.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
      if (!match) return null;
      const [__, day, month, year] = match;
      return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
    }
    const date = parseDate(listMatch[1]);
    if (!date) {
      await sendWhatsAppMessage(
        from,
        "Please provide a valid date in DD/MM/YYYY format."
      );
      return res.status(200).send("EVENT_RECEIVED");
    }
    const start = new Date(date);
    const end = new Date(date);
    end.setHours(23, 59, 59, 999);
    const posts = await ScheduledPost.find({
      scheduledTime: { $gte: start, $lte: end },
    }).sort({ scheduledTime: 1 });
    if (posts.length) {
      let reply = `Scheduled posts for ${date}:\n\n`;
      posts.forEach((post) => {
        reply += `ID: ${post._id}\nName: ${post.filename}\nTime: ${new Date(
          post.scheduledTime
        ).toLocaleString()}\nPlatforms: ${(post.platforms || []).join(
          ", "
        )}\nStatus: ${post.status}\n\n`;
      });
      await sendWhatsAppMessage(from, reply);
    } else {
      await sendWhatsAppMessage(from, `No posts scheduled for ${date}.`);
    }
    return res.status(200).send("EVENT_RECEIVED");
  }

  // 3. Show all details for a scheduled post by ID
  const aboutMatch = messageText && messageText.match(/about\s+(\w{24})/i);
  if (aboutMatch) {
    const id = aboutMatch[1];
    const post = await ScheduledPost.findById(id);
    if (post) {
      let reply = `All about scheduled post ${id}:\n`;
      reply += `Name: ${post.filename}\nTime: ${new Date(
        post.scheduledTime
      ).toLocaleString()}\nPlatforms: ${(post.platforms || []).join(
        ", "
      )}\nStatus: ${post.status}\nCaption: ${post.caption}\n`;
      if (post.cloudinaryUrl)
        reply += `Cloudinary URL: ${post.cloudinaryUrl}\n`;
      if (post.generatedContent) {
        reply += `Generated captions:\n`;
        Object.entries(post.generatedContent).forEach(([platform, cap]) => {
          reply += `- ${platform}: ${cap}\n`;
        });
      }
      await sendWhatsAppMessage(from, reply);
    } else {
      await sendWhatsAppMessage(from, `No scheduled post found with ID ${id}.`);
    }
    return res.status(200).send("EVENT_RECEIVED");
  }

  res.status(200).send("EVENT_RECEIVED");
});

// Endpoint to fetch all upcoming scheduled posts
app.get("/scheduled", async (req, res) => {
  try {
    const { date } = req.query;
    let query = {};
    if (date) {
      const start = new Date(date);
      const end = new Date(date);
      end.setHours(23, 59, 59, 999);
      query.scheduledTime = { $gte: start, $lte: end };
    } else {
      query.scheduledTime = { $gte: new Date() };
    }
    const posts = await ScheduledPost.find(query).sort({ scheduledTime: 1 });
    res.json({ success: true, posts });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Change date/time of a scheduled post
app.patch("/scheduled/:id", async (req, res) => {
  try {
    const { dateTime } = req.body; // expects ISO string or parseable date
    const post = await ScheduledPost.findByIdAndUpdate(
      req.params.id,
      { scheduledTime: new Date(dateTime) },
      { new: true }
    );
    if (!post)
      return res.status(404).json({ success: false, error: "Not found" });
    res.json({ success: true, post });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Cancel a scheduled post
app.post("/scheduled/:id/cancel", async (req, res) => {
  try {
    const post = await ScheduledPost.findByIdAndUpdate(
      req.params.id,
      { status: "cancelled" },
      { new: true }
    );
    if (!post)
      return res.status(404).json({ success: false, error: "Not found" });
    res.json({ success: true, post });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Backend-only service - no static file serving
// app.use(express.static("public"));
// app.use("/uploads", express.static("uploads"));

// Create uploads directory if it doesn't exist
if (!fs.existsSync("uploads")) {
  fs.mkdirSync("uploads");
}

// Multer configuration for video uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, "uploads/");
  },
  filename: (req, file, cb) => {
    const uniqueName = `video_${Date.now()}${path.extname(file.originalname)}`;
    cb(null, uniqueName);
  },
});

const upload = multer({
  storage: storage,
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith("video/")) {
      cb(null, true);
    } else {
      cb(new Error("Only video files are allowed"));
    }
  },
  limits: {
    fileSize: 100 * 1024 * 1024, // 100MB limit
  },
});

// Global upload state
let isUploading = false;

// Scheduled tasks storage
const scheduledTasks = new Map();

// TikTok Authentication Functions
const crypto = require("crypto");
let code_verifier = "";

async function getTikTokAuthUrl() {
  code_verifier = crypto.randomBytes(64).toString("hex");
  const code_challenge = crypto
    .createHash("sha256")
    .update(code_verifier)
    .digest("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

  const state = crypto.randomBytes(10).toString("hex");
  const redirectUri = process.env.REDIRECT_URI;
  const authURL = `https://www.tiktok.com/v2/auth/authorize/?client_key=${
    process.env.TIKTOK_CLIENT_KEY
  }&response_type=code&scope=user.info.basic,video.upload,video.publish&redirect_uri=${encodeURIComponent(
    redirectUri
  )}&state=${state}&code_challenge=${code_challenge}&code_challenge_method=S256`;

  console.log("🔗 TikTok Auth URL:", authURL);
  return authURL;
}

async function exchangeTikTokCode(code) {
  try {
    console.log("🔄 Exchanging TikTok code for token...");

    const redirectUri = process.env.REDIRECT_URI;
    const tokenRes = await axios.post(
      "https://open.tiktokapis.com/v2/oauth/token/",
      new URLSearchParams({
        client_key: process.env.TIKTOK_CLIENT_KEY,
        client_secret: process.env.TIKTOK_CLIENT_SECRET,
        code,
        grant_type: "authorization_code",
        redirect_uri: redirectUri,
        code_verifier,
      }),
      {
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
      }
    );

    const { access_token, refresh_token, expires_in } = tokenRes.data;
    fs.writeFileSync(
      "tiktok_token.txt",
      JSON.stringify({
        access_token,
        refresh_token,
        expires_in,
        timestamp: Date.now(),
      })
    );
    console.log("✅ TikTok token saved successfully");
    return { success: true, token: access_token };
  } catch (error) {
    console.error(
      "❌ TikTok token exchange error:",
      error.response?.data || error.message
    );
    return {
      success: false,
      error: error.response?.data?.error_description || error.message,
    };
  }
}

async function refreshTikTokToken() {
  try {
    if (!fs.existsSync("tiktok_token.txt")) {
      throw new Error("No TikTok token file found");
    }

    const tokenData = JSON.parse(fs.readFileSync("tiktok_token.txt", "utf-8"));
    const { refresh_token } = tokenData;

    console.log("🔄 Refreshing TikTok token...");

    const tokenRes = await axios.post(
      "https://open.tiktokapis.com/v2/oauth/token/",
      new URLSearchParams({
        client_key: process.env.TIKTOK_CLIENT_KEY,
        client_secret: process.env.TIKTOK_CLIENT_SECRET,
        grant_type: "refresh_token",
        refresh_token,
      }),
      {
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
      }
    );

    const {
      access_token,
      refresh_token: new_refresh_token,
      expires_in,
    } = tokenRes.data;
    fs.writeFileSync(
      "tiktok_token.txt",
      JSON.stringify({
        access_token,
        refresh_token: new_refresh_token || refresh_token,
        expires_in,
        timestamp: Date.now(),
      })
    );
    console.log("✅ TikTok token refreshed successfully");
    return access_token;
  } catch (error) {
    console.error(
      "❌ TikTok token refresh error:",
      error.response?.data || error.message
    );
    return null;
  }
}

// Cloudinary Upload Function
async function uploadToCloudinary(filePath) {
  try {
    console.log("📤 Uploading video to Cloudinary...");
    const result = await cloudinary.uploader.upload(filePath, {
      resource_type: "video",
      folder: "social_media_uploads",
      timeout: 120000, // 2 minutes timeout
    });
    console.log("✅ Video uploaded to Cloudinary:", result.secure_url);
    return {
      success: true,
      url: result.secure_url,
      public_id: result.public_id,
    };
  } catch (error) {
    console.error("❌ Cloudinary upload error:", error.message);
    return {
      success: false,
      error: error.message,
    };
  }
}

// Social Media Upload Functions
async function uploadToFacebook(filePath, caption, cloudinaryUrl) {
  try {
    // Use provided Cloudinary URL or upload if not provided
    let videoUrl = cloudinaryUrl;
    if (!videoUrl) {
      const cloudinaryResult = await uploadToCloudinary(filePath);
      if (!cloudinaryResult.success) {
        throw new Error(`Cloudinary upload failed: ${cloudinaryResult.error}`);
      }
      videoUrl = cloudinaryResult.url;
    }

    // Verify video URL accessibility
    try {
      await axios.head(videoUrl);
      console.log("✅ Video URL accessible for Facebook:", videoUrl);
    } catch (urlError) {
      throw new Error(`Video URL is not accessible: ${videoUrl}`);
    }

    const response = await axios.post(
      `https://graph.facebook.com/v19.0/${process.env.FB_PAGE_ID}/videos`,
      {
        access_token: process.env.PAGE_ACCESS_TOKEN,
        file_url: videoUrl,
        description: caption || "🎥 Uploaded via API",
      }
    );

    console.log("✅ Facebook Video ID:", response.data.id);
    return { success: true, id: response.data.id, platform: "Facebook" };
  } catch (error) {
    console.error(
      "❌ Facebook upload error:",
      error.response?.data || error.message
    );
    return {
      success: false,
      error: error.response?.data?.error?.message || error.message,
      platform: "Facebook",
    };
  }
}

async function uploadToInstagram(filePath, caption, cloudinaryUrl) {
  try {
    console.log("📤 Starting Instagram upload...");

    // Use provided Cloudinary URL or upload if not provided
    let videoUrl = cloudinaryUrl;
    if (!videoUrl) {
      const cloudinaryResult = await uploadToCloudinary(filePath);
      if (!cloudinaryResult.success) {
        throw new Error(`Cloudinary upload failed: ${cloudinaryResult.error}`);
      }
      videoUrl = cloudinaryResult.url;
    }

    // Verify video URL accessibility
    try {
      await axios.head(videoUrl);
      console.log("✅ Video URL accessible for Instagram:", videoUrl);
    } catch (urlError) {
      throw new Error(`Video URL is not accessible: ${videoUrl}`);
    }

    // Step 1: Create media container
    const containerResponse = await axios.post(
      `https://graph.facebook.com/v19.0/${process.env.IG_USER_ID}/media`,
      {
        video_url: videoUrl,
        media_type: "REELS",
        caption: caption || "🔥 Posted via API",
        access_token: process.env.PAGE_ACCESS_TOKEN,
      }
    );

    const creationId = containerResponse.data.id;
    console.log("✅ Instagram container created:", creationId);

    // Step 2: Wait for processing with status checks
    console.log("⏳ Waiting for Instagram media processing...");
    let ready = false;
    let attempts = 0;
    let errorMessage = null;

    while (!ready && attempts < 60) {
      await new Promise((resolve) => setTimeout(resolve, 2000));

      try {
        const statusResponse = await axios.get(
          `https://graph.facebook.com/v19.0/${creationId}`,
          {
            params: {
              fields: "status_code,status",
              access_token: process.env.PAGE_ACCESS_TOKEN,
            },
          }
        );

        console.log(
          `Instagram status attempt ${attempts + 1}:`,
          statusResponse.data.status_code
        );

        if (statusResponse.data.status_code === "FINISHED") {
          ready = true;
        } else if (statusResponse.data.status_code === "ERROR") {
          errorMessage =
            statusResponse.data.status || "Instagram media processing failed";
          throw new Error(errorMessage);
        }
      } catch (statusError) {
        errorMessage = statusError.message;
        break;
      }

      attempts++;
    }

    if (!ready) {
      throw new Error(
        errorMessage || "Instagram media processing timeout (2 minutes)"
      );
    }

    // Step 3: Publish media
    console.log("📤 Publishing Instagram media...");
    const publishResponse = await axios.post(
      `https://graph.facebook.com/v19.0/${process.env.IG_USER_ID}/media_publish`,
      {
        creation_id: creationId,
        access_token: process.env.PAGE_ACCESS_TOKEN,
      }
    );

    console.log("✅ Instagram Media ID:", publishResponse.data.id);
    return {
      success: true,
      id: publishResponse.data.id,
      platform: "Instagram",
    };
  } catch (error) {
    console.error(
      "❌ Instagram upload error:",
      error.response?.data || error.message
    );
    return {
      success: false,
      error: error.response?.data?.error?.message || error.message,
      platform: "Instagram",
    };
  }
}

async function uploadToTikTok(filePath, caption) {
  try {
    if (!fs.existsSync("tiktok_token.txt")) {
      return {
        success: false,
        error: "TikTok token missing. Please authenticate first.",
        platform: "TikTok",
      };
    }

    let tokenData = JSON.parse(fs.readFileSync("tiktok_token.txt", "utf-8"));
    let accessToken = tokenData.access_token;

    // Check if token is expired
    const expiresIn = tokenData.expires_in * 1000; // Convert to milliseconds
    const timestamp = tokenData.timestamp;
    if (Date.now() > timestamp + expiresIn) {
      console.log("⚠️ TikTok token expired, attempting refresh...");
      accessToken = await refreshTikTokToken();
      if (!accessToken) {
        return {
          success: false,
          error: "Failed to refresh TikTok token",
          platform: "TikTok",
        };
      }
    }

    const videoSize = fs.statSync(filePath).size;

    console.log("📤 Starting TikTok upload flow...");
    console.log("Video size:", videoSize);

    // Step 1: Initialize upload
    const initResponse = await axios.post(
      "https://open.tiktokapis.com/v2/post/publish/video/init/",
      {
        post_info: {
          title: caption || "🎥 Uploaded via API",
          privacy_level: "SELF_ONLY",
          disable_duet: false,
          disable_comment: false,
          disable_stitch: false,
          video_cover_timestamp_ms: 1000,
        },
        source_info: {
          source: "FILE_UPLOAD",
          video_size: videoSize,
          chunk_size: videoSize,
          total_chunk_count: 1,
        },
      },
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
      }
    );

    console.log("TikTok init response:", initResponse.data);

    const { upload_url, publish_id } = initResponse.data.data;
    console.log("✅ TikTok upload URL received");

    // Step 2: Upload video
    const videoData = fs.readFileSync(filePath);
    const uploadResponse = await axios.put(upload_url, videoData, {
      headers: {
        "Content-Type": "video/mp4",
        "Content-Range": `bytes 0-${videoSize - 1}/${videoSize}`,
      },
      maxContentLength: Infinity,
      maxBodyLength: Infinity,
    });

    console.log("✅ Video uploaded to TikTok, status:", uploadResponse.status);

    // Step 3: Publish
    const publishResponse = await axios.post(
      "https://open.tiktokapis.com/v2/post/publish/video/publish/",
      {
        post_id: publish_id,
      },
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
      }
    );

    console.log("TikTok publish response:", publishResponse.data);
    console.log("🎉 Video published to TikTok!");
    return { success: true, id: publish_id, platform: "TikTok" };
  } catch (error) {
    console.error(
      "❌ TikTok upload failed:",
      error.response?.data || error.message
    );

    if (error.response?.data?.error?.code === "access_token_invalid") {
      console.log("⚠️ Attempting to refresh TikTok token...");
      const newAccessToken = await refreshTikTokToken();
      if (newAccessToken) {
        // Retry upload with new token
        return await uploadToTikTok(filePath, caption);
      }
    }

    return {
      success: false,
      error:
        error.response?.data?.error?.message ||
        error.response?.data?.message ||
        error.message,
      platform: "TikTok",
    };
  }
}

async function uploadToTwitter(filePath, caption) {
  try {
    console.log("🐦 Starting Twitter text-only upload...");

    if (
      !process.env.TWITTER_API_KEY ||
      !process.env.TWITTER_API_SECRET ||
      !process.env.TWITTER_ACCESS_TOKEN ||
      !process.env.TWITTER_ACCESS_SECRET
    ) {
      return {
        success: false,
        error:
          "Twitter API credentials not configured. Please set TWITTER_API_KEY, TWITTER_API_SECRET, TWITTER_ACCESS_TOKEN, and TWITTER_ACCESS_SECRET.",
        platform: "Twitter",
      };
    }

    const client = new TwitterApi({
      appKey: process.env.TWITTER_API_KEY,
      appSecret: process.env.TWITTER_API_SECRET,
      accessToken: process.env.TWITTER_ACCESS_TOKEN,
      accessSecret: process.env.TWITTER_ACCESS_SECRET,
    });

    if (!caption || caption.trim() === "") {
      return {
        success: false,
        error: "No caption provided for Twitter post",
        platform: "Twitter",
      };
    }

    // Parse for thread (lines starting with '1.', '2.', etc.)
    const lines = caption
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
    const threadTweets = lines
      .filter((l) => /^\d+\./.test(l))
      .map((l) => l.replace(/^\d+\.\s*/, ""));
    let tweetsToPost =
      threadTweets.length > 0 ? threadTweets : [caption.trim()];

    // Only post tweets that are <= 280 chars
    tweetsToPost = tweetsToPost.filter((t) => t.length > 0 && t.length <= 280);
    if (tweetsToPost.length === 0) {
      return {
        success: false,
        error: "No valid tweet content to post.",
        platform: "Twitter",
      };
    }

    let lastTweetId = null;
    for (let i = 0; i < tweetsToPost.length; i++) {
      const tweetText = tweetsToPost[i];
      let tweet;
      if (lastTweetId) {
        tweet = await client.v2.reply(tweetText, lastTweetId);
      } else {
        tweet = await client.v2.tweet(tweetText);
      }
      lastTweetId = tweet.data.id;
      console.log(`✅ Tweet ${i + 1} posted:`, tweetText);
    }

    return {
      success: true,
      platform: "Twitter",
      message: `Tweet(s) posted successfully!`,
    };
  } catch (error) {
    console.error("❌ Twitter upload failed:", error);
    if (error.data) {
      console.error("Twitter API error details:", error.data);
    }
    return {
      success: false,
      error: error.message || "Twitter upload failed",
      platform: "Twitter",
    };
  }
}

async function uploadToLinkedIn(filePath, caption, cloudinaryUrl) {
  try {
    console.log("🔗 Starting LinkedIn upload...");
    const accessToken = process.env.LINKEDIN_ACCESS_TOKEN;
    const authorUrn = "urn:li:person:vHC6_J19r-";

    // Use provided Cloudinary URL or upload if not provided
    let videoUrl = cloudinaryUrl;
    if (!videoUrl) {
      const cloudinaryResult = await uploadToCloudinary(filePath);
      if (!cloudinaryResult.success) {
        throw new Error(`Cloudinary upload failed: ${cloudinaryResult.error}`);
      }
      videoUrl = cloudinaryResult.url;
    }

    // Step 1: Register upload
    const registerResponse = await axios.post(
      "https://api.linkedin.com/v2/assets?action=registerUpload",
      {
        registerUploadRequest: {
          owner: authorUrn,
          recipes: ["urn:li:digitalmediaRecipe:feedshare-video"],
          serviceRelationships: [
            {
              relationshipType: "OWNER",
              identifier: "urn:li:userGeneratedContent",
            },
          ],
        },
      },
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
          "X-Restli-Protocol-Version": "2.0.0",
        },
      }
    );

    const assetUrn = registerResponse.data.value.asset;
    const uploadUrl =
      registerResponse.data.value.uploadMechanism[
        "com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest"
      ].uploadUrl;

    console.log("✅ LinkedIn upload registered:", assetUrn);

    // Step 2: Upload video to LinkedIn using Cloudinary URL
    const videoData = (
      await axios.get(videoUrl, { responseType: "arraybuffer" })
    ).data;
    await axios.put(uploadUrl, videoData, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "video/mp4",
      },
      maxContentLength: Infinity,
      maxBodyLength: Infinity,
    });

    console.log("✅ Video uploaded to LinkedIn");

    // Step 3: Create post
    const postData = {
      author: authorUrn,
      lifecycleState: "PUBLISHED",
      specificContent: {
        "com.linkedin.ugc.ShareContent": {
          shareCommentary: {
            text: caption || "📝 Posted via API!",
          },
          shareMediaCategory: "VIDEO",
          media: [
            {
              status: "READY",
              media: assetUrn,
            },
          ],
        },
      },
      visibility: {
        "com.linkedin.ugc.MemberNetworkVisibility": "PUBLIC",
      },
    };

    const postResponse = await axios.post(
      "https://api.linkedin.com/v2/ugcPosts",
      postData,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
          "X-Restli-Protocol-Version": "2.0.0",
        },
      }
    );

    console.log("✅ LinkedIn Post ID:", postResponse.data.id);
    return {
      success: true,
      id: postResponse.data.id,
      platform: "LinkedIn",
      message: "Video posted successfully to LinkedIn",
    };
  } catch (error) {
    console.error(
      "❌ LinkedIn upload error:",
      error.response?.data || error.message
    );
    return {
      success: false,
      error: error.response?.data?.message || error.message,
      platform: "LinkedIn",
    };
  }
}

// Routes
// Backend-only service - no frontend routes
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.get("/debug", (req, res) => {
  const debug = {
    hasClientKey: !!process.env.TIKTOK_CLIENT_KEY,
    hasClientSecret: !!process.env.TIKTOK_CLIENT_SECRET,
    hasRedirectUri: !!process.env.REDIRECT_URI,
    redirectUri: process.env.REDIRECT_URI,
    clientKeyLength: process.env.TIKTOK_CLIENT_KEY?.length || 0,
    hasTikTokToken: fs.existsSync("tiktok_token.txt"),
    hasCloudinaryConfig:
      !!process.env.CLOUDINARY_CLOUD_NAME &&
      !!process.env.CLOUDINARY_API_KEY &&
      !!process.env.CLOUDINARY_API_SECRET,
    timestamp: new Date().toISOString(),
  };

  res.json(debug);
});

app.get("/test", (req, res) => {
  res.json({
    message: "Server is working!",
    timestamp: new Date().toISOString(),
  });
});

// TikTok authentication routes
app.get("/auth/tiktok", async (req, res) => {
  try {
    const authUrl = await getTikTokAuthUrl();
    res.redirect(authUrl);
  } catch (error) {
    res.status(500).json({ error: "Failed to generate TikTok auth URL" });
  }
});

app.get("/callback", async (req, res) => {
  const code = req.query.code;
  if (!code) {
    return res.status(400).send("Missing code in callback.");
  }
  const result = await exchangeTikTokCode(code);
  if (result.success) {
    res.send("✅ TikTok authentication successful! You may close this window.");
  } else {
    res.status(500).send("❌ TikTok authentication failed: " + result.error);
  }
});

// Check TikTok auth status
app.get("/auth/status", (req, res) => {
  const isAuthenticated = fs.existsSync("tiktok_token.txt");
  res.json({ tiktokAuthenticated: isAuthenticated });
});

// Upload video
app.post("/upload", upload.single("video"), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "No video file uploaded" });
  }

  res.json({
    success: true,
    message: "Video uploaded successfully",
    filename: req.file.filename,
    filepath: req.file.path,
  });
});

// Distribute to selected platforms
app.post("/distribute", async (req, res) => {
  if (isUploading) {
    return res.status(423).json({ error: "Upload in progress. Please wait." });
  }

  const { filename, caption, processTranscript, platforms, scheduleTime } =
    req.body;

  if (!filename) {
    return res.status(400).json({ error: "No filename provided" });
  }

  if (!platforms || !Array.isArray(platforms) || platforms.length === 0) {
    return res.status(400).json({ error: "No platforms selected" });
  }

  const filePath = path.join(__dirname, "uploads", filename);

  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: "Video file not found" });
  }

  isUploading = true;

  try {
    console.log("🚀 Starting distribution to selected platforms:", platforms);

    let platformCaptions = {
      facebook: caption,
      instagram: caption,
      tiktok: caption,
      twitter: caption,
      linkedin: caption,
    };

    // If transcript processing is enabled, generate content for each platform
    if (processTranscript) {
      console.log("🎯 Processing transcript and generating content...");

      try {
        const transcriptResponse = await axios.post(
          `${req.protocol}://${req.get("host")}/process-transcript`,
          {
            filename: filename,
          }
        );

        if (transcriptResponse.data.success) {
          const generatedContent = transcriptResponse.data.content;
          platformCaptions = {
            facebook: generatedContent.facebook || caption,
            instagram: generatedContent.instagram || caption,
            tiktok: generatedContent.tiktok || caption,
            twitter: generatedContent.twitter || caption,
            linkedin: generatedContent.linkedin || caption,
          };
          console.log("✅ Content generated successfully for all platforms");
        } else {
          console.warn("⚠️ Content generation failed, using original caption");
        }
      } catch (transcriptError) {
        console.error(
          "❌ Transcript processing error:",
          transcriptError.message
        );
        console.warn("⚠️ Using original caption for all platforms");
      }
    }

    // Upload to Cloudinary once if needed
    let cloudinaryResult = null;
    if (
      platforms.some((p) => ["facebook", "instagram", "linkedin"].includes(p))
    ) {
      cloudinaryResult = await uploadToCloudinary(filePath);
      if (!cloudinaryResult.success) {
        throw new Error(`Cloudinary upload failed: ${cloudinaryResult.error}`);
      }
    }

    // Extract hashtags from caption (simple regex)
    function extractHashtags(text) {
      return (text.match(/#\w+/g) || []).map((tag) => tag.toLowerCase());
    }
    const hashtags = extractHashtags(caption);

    // Save to MongoDB if scheduled
    if (scheduleTime) {
      const scheduleDate = new Date(scheduleTime);
      if (isNaN(scheduleDate) || scheduleDate <= new Date()) {
        return res.status(400).json({ error: "Invalid or past schedule time" });
      }

      // Save scheduled post to MongoDB
      const scheduledDoc = await ScheduledPost.create({
        filename,
        caption,
        cloudinaryUrl: cloudinaryResult?.url || null,
        platforms,
        hashtags,
        scheduledTime: scheduleDate,
        status: "pending",
        generatedContent: platformCaptions,
      });

      const taskId = `task_${Date.now()}_${Math.random()
        .toString(36)
        .substring(2)}`;
      const cronTime = `${scheduleDate.getSeconds()} ${scheduleDate.getMinutes()} ${scheduleDate.getHours()} ${scheduleDate.getDate()} ${
        scheduleDate.getMonth() + 1
      } *`;

      scheduledTasks.set(taskId, {
        filename,
        caption,
        platforms,
        platformCaptions,
        filePath,
      });

      cron.schedule(cronTime, async () => {
        console.log(
          `📅 Executing scheduled task ${taskId} for platforms: ${platforms.join(
            ", "
          )}`
        );
        const results = {};

        for (const platform of platforms) {
          console.log(`📤 Uploading to ${platform}...`);
          if (platform === "facebook") {
            results.facebook = await uploadToFacebook(
              filePath,
              platformCaptions.facebook,
              cloudinaryResult?.url
            );
            await notifyWhatsAppOnSuccess(scheduledDoc, 'Facebook', results.facebook);
          } else if (platform === "instagram") {
            results.instagram = await uploadToInstagram(
              filePath,
              platformCaptions.instagram,
              cloudinaryResult?.url
            );
            await notifyWhatsAppOnSuccess(scheduledDoc, 'Instagram', results.instagram);
          } else if (platform === "tiktok") {
            results.tiktok = await uploadToTikTok(
              filePath,
              platformCaptions.tiktok
            );
            await notifyWhatsAppOnSuccess(scheduledDoc, 'TikTok', results.tiktok);
          } else if (platform === "twitter") {
            results.twitter = await uploadToTwitter(
              filePath,
              platformCaptions.twitter
            );
            await notifyWhatsAppOnSuccess(scheduledDoc, 'Twitter', results.twitter);
          } else if (platform === "linkedin") {
            results.linkedin = await uploadToLinkedIn(
              filePath,
              platformCaptions.linkedin,
              cloudinaryResult?.url
            );
            await notifyWhatsAppOnSuccess(scheduledDoc, 'LinkedIn', results.linkedin);
          }
        }

        const successCount = Object.values(results).filter(
          (r) => r.success
        ).length;
        const totalCount = Object.keys(results).length;

        console.log(
          `✅ Scheduled distribution completed: ${successCount}/${totalCount} platforms successful`
        );

        // Update status in MongoDB
        await ScheduledPost.findByIdAndUpdate(scheduledDoc._id, {
          status: "completed",
        });
        scheduledTasks.delete(taskId);
      });

      res.json({
        success: true,
        scheduled: true,
        message: `Post scheduled for ${new Date(
          scheduleTime
        ).toLocaleString()}`,
        results: {},
        scheduledId: scheduledDoc._id,
      });
    } else {
      // Immediate distribution
      const results = {};

      for (const platform of platforms) {
        console.log(`📤 Uploading to ${platform}...`);
        if (platform === "facebook") {
          results.facebook = await uploadToFacebook(
            filePath,
            platformCaptions.facebook,
            cloudinaryResult?.url
          );
          await notifyWhatsAppOnSuccess(null, 'Facebook', results.facebook);
        } else if (platform === "instagram") {
          results.instagram = await uploadToInstagram(
            filePath,
            platformCaptions.instagram,
            cloudinaryResult?.url
          );
          await notifyWhatsAppOnSuccess(null, 'Instagram', results.instagram);
        } else if (platform === "tiktok") {
          results.tiktok = await uploadToTikTok(
            filePath,
            platformCaptions.tiktok
          );
          await notifyWhatsAppOnSuccess(null, 'TikTok', results.tiktok);
        } else if (platform === "twitter") {
          results.twitter = await uploadToTwitter(
            filePath,
            platformCaptions.twitter
          );
          await notifyWhatsAppOnSuccess(null, 'Twitter', results.twitter);
        } else if (platform === "linkedin") {
          results.linkedin = await uploadToLinkedIn(
            filePath,
            platformCaptions.linkedin,
            cloudinaryResult?.url
          );
          await notifyWhatsAppOnSuccess(null, 'LinkedIn', results.linkedin);
        }
      }

      const successCount = Object.values(results).filter(
        (r) => r.success
      ).length;
      const totalCount = Object.keys(results).length;

      console.log(
        `✅ Distribution completed: ${successCount}/${totalCount} platforms successful`
      );

      res.json({
        success: successCount > 0,
        message: `Distribution completed: ${successCount}/${totalCount} platforms successful`,
        results: results,
      });
    }
  } catch (error) {
    console.error("❌ Distribution error:", error);
    res.status(500).json({
      success: false,
      error: "Distribution failed",
      details: error.message,
    });
  } finally {
    isUploading = false;
  }
});

// Transcribe video and generate content endpoint
app.post("/process-transcript", async (req, res) => {
  try {
    const { filename } = req.body;

    if (!filename) {
      return res.status(400).json({
        success: false,
        error: "Filename is required",
      });
    }

    const videoPath = path.join(__dirname, "uploads", filename);

    if (!fs.existsSync(videoPath)) {
      return res.status(404).json({
        success: false,
        error: "Video file not found",
      });
    }

    console.log(`Starting transcription for: ${filename}`);

    // Use Deepgram API for transcription via axios
    const deepgramApiKey = process.env.DEEPGRAM_API_KEY;
    if (!deepgramApiKey) {
          return res.status(500).json({
            success: false,
        error: "Deepgram API key not set in environment (DEEPGRAM_API_KEY)",
      });
    }

    let transcript = "";
    try {
      const videoBuffer = fs.readFileSync(videoPath);
      const response = await axios({
        method: "POST",
        url: "https://api.deepgram.com/v1/listen",
        headers: {
          "Authorization": `Token ${deepgramApiKey}`,
          "Content-Type": "video/mp4"
        },
        data: videoBuffer
      });
      transcript = response.data.results.channels[0].alternatives[0].transcript || "";
      if (!transcript) throw new Error("No transcript returned from Deepgram");
      console.log("Transcription completed successfully");
    } catch (dgError) {
      console.error("Deepgram transcription error:", dgError.response?.data || dgError.message);
        return res.status(500).json({
          success: false,
        error: "Transcription failed: " + (dgError.response?.data?.err_msg || dgError.message),
      });
    }

          // Generate content for all platforms
          let content = {};
          if (geminiService) {
            try {
        content = await geminiService.generateAllPlatformContent(transcript.trim());
            } catch (geminiError) {
        console.error("❌ Gemini content generation failed:", geminiError.message);
              // Fallback to basic content
              content = {
                facebook: `🎥 ${transcript.trim().substring(0, 200)}...`,
                instagram: `🎬 ${transcript.trim().substring(0, 150)}...`,
                tiktok: `🔥 ${transcript.trim().substring(0, 100)}...`,
                twitter: `📱 ${transcript.trim().substring(0, 280)}...`,
                linkedin: `📝 ${transcript.trim().substring(0, 200)}...`,
              };
            }
          } else {
            // Fallback to basic content if Gemini is not available
            content = {
              facebook: `🎥 ${transcript.trim().substring(0, 200)}...`,
              instagram: `🎬 ${transcript.trim().substring(0, 150)}...`,
              tiktok: `🔥 ${transcript.trim().substring(0, 100)}...`,
              twitter: `📱 ${transcript.trim().substring(0, 280)}...`,
              linkedin: `📝 ${transcript.trim().substring(0, 200)}...`,
            };
          }

          console.log("Content generation completed successfully");

          res.json({
            success: true,
            transcript: transcript.trim(),
            content: content,
      transcriptFile: filename + ".txt",
    });
  } catch (error) {
    console.error("Transcription error:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// Get upload status
app.get("/upload/status", (req, res) => {
  res.json({ isUploading });
});

// Start server
app.listen(port, () => {
  console.log(`🚀 Server running on http://localhost:${port}`);
  console.log(
    `🎯 Transcript processing: ${
      process.env.GEMINI_API_KEY
        ? "Enabled (Gemini API configured)"
        : "Disabled (GEMINI_API_KEY not set)"
    }`
  );
  console.log(
    `🐦 Twitter API: ${
      process.env.TWITTER_API_KEY
        ? "Enabled (Twitter API configured)"
        : "Disabled (Twitter credentials not set)"
    }`
  );
  console.log(
    `🔗 LinkedIn API: ${
      process.env.LINKEDIN_ACCESS_TOKEN
        ? "Enabled (LinkedIn API configured)"
        : "Disabled (LinkedIn credentials not set)"
    }`
  );
  console.log(
    `☁️ Cloudinary: ${
      process.env.CLOUDINARY_CLOUD_NAME &&
      process.env.CLOUDINARY_API_KEY &&
      process.env.CLOUDINARY_API_SECRET
        ? "Enabled (Cloudinary configured)"
        : "Disabled (Cloudinary credentials not set)"
    }`
  );
  console.log(
    `📝 Whisper: Make sure Whisper is installed and available in your PATH for transcript processing`
  );
});

// Helper to parse date in DD/MM/YYYY or DD-MM-YYYY format
function parseDate(input) {
  const match = input.match(/(\d{1,2})[\/\\-](\d{1,2})[\/\\-](\d{4})/);
  if (!match) return null;
  const [_, day, month, year] = match;
  return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
}

// Replace sendWhatsAppMessage to use local bot
async function sendWhatsAppMessage(to, message) {
  try {
    // Use the WhatsApp bot URL from environment or default to localhost
    const botUrl = process.env.WHATSAPP_BOT_URL || "http://localhost:3000";
    await axios.post(`${botUrl}/send`, { text: message });
    console.log("✅ Message sent to WhatsApp bot at", botUrl);
  } catch (error) {
    console.error("❌ Error sending to WhatsApp bot:", error.message);
  }
}

app.post("/drive-webhook", async (req, res) => {
  // Google will send a notification here
  console.log("--- Google Drive Webhook Received ---");
  console.log("Request body:", req.body);
  // You need to verify the notification and get the file ID
  // For real implementation, handle X-Goog-Channel-Id, X-Goog-Resource-Id, etc.
  // For demo, let's assume you get the fileId from req.body
  const fileId = req.body.fileId; // You may need to parse the notification format
  console.log("Received fileId:", fileId);

  try {
    const authClient = await auth.getClient();
    const fileInfo = await driveClient.get({
      fileId,
      fields: "id, name, mimeType, parents, createdTime, webViewLink",
      auth: authClient,
    });
    const file = fileInfo.data;
    console.log("Fetched file info:", file);
    if (file.mimeType && file.mimeType.startsWith("video/")) {
      // Get the full folder path
      let folderPath = "Bomcel";
      if (file.parents && file.parents.length > 0) {
        const parentId = file.parents[0];
        const parentInfo = await driveClient.get({
          fileId: parentId,
          fields: "name, parents",
          auth: authClient,
        });
        folderPath += "/" + parentInfo.data.name;
        // Optionally, walk up the tree for deeper subfolders
      }
      const message = `New video uploaded in ${folderPath}:\n- File: ${file.name}\n- Uploaded at: ${file.createdTime}\n- Google Drive link: ${file.webViewLink}`;
      console.log("Sending WhatsApp notification:", message);
      await sendWhatsAppMessage(process.env.NOTIFY_WHATSAPP_NUMBER, message);
    } else {
      console.log("File is not a video, skipping WhatsApp notification.");
    }
    res.status(200).send("OK");
  } catch (err) {
    console.error("Drive webhook error:", err);
    res.status(500).send("Error");
  }
});

// --- Google Drive Polling for New Files (from l.txt, improved for only new files after startup) ---
const { google: googlePoll } = require("googleapis");
const authPoll = new googlePoll.auth.OAuth2(
  process.env.GOOGLE_DRIVE_CLIENT_ID,
  process.env.GOOGLE_DRIVE_CLIENT_SECRET,
  process.env.GOOGLE_DRIVE_REDIRECT_URI
);
authPoll.setCredentials({
  refresh_token: process.env.GOOGLE_DRIVE_REFRESH_TOKEN,
});
const drivePoll = googlePoll.drive({ version: "v3", auth: authPoll });
const folderMap = new Map(); // key = folderId, value = Set of file IDs
const processingFiles = new Set();
let initializedDrivePolling = false;

async function listSubfolders(parentId) {
  const res = await drivePoll.files.list({
    q: `'${parentId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
    fields: "files(id, name)",
  });
  return res.data.files || [];
}

async function listFilesInFolder(folderId) {
  const res = await drivePoll.files.list({
    q: `'${folderId}' in parents and trashed = false`,
    fields: "files(id, name, mimeType, webViewLink, createdTime)",
  });
  return res.data.files || [];
}

async function initializeFolderMap() {
  const mainFolderId = process.env.GOOGLE_DRIVE_FOLDER_ID;
  if (!mainFolderId) {
    console.warn("GOOGLE_DRIVE_FOLDER_ID not set in .env");
    return;
  }
  const subfolders = await listSubfolders(mainFolderId);
  subfolders.push({ id: mainFolderId, name: "Bomcel (root)" });
  for (const folder of subfolders) {
    const currentFiles = await listFilesInFolder(folder.id);
    folderMap.set(folder.id, new Set(currentFiles.map((f) => f.id)));
  }
  initializedDrivePolling = true;
  console.log(
    "Initialized Google Drive polling. Will only notify for new files from now on."
  );
}

async function downloadDriveFile(fileId, destPath) {
  const dest = fs.createWriteStream(destPath);
  const drive = googlePoll.drive({ version: "v3", auth: authPoll });
  return new Promise((resolve, reject) => {
    drive.files.get(
      { fileId, alt: "media" },
      { responseType: "stream" },
      (err, res) => {
        if (err) return reject(err);
        res.data
          .on("end", () => resolve(destPath))
          .on("error", reject)
          .pipe(dest);
      }
    );
  });
}

function generateUniqueFolderId(folderName) {
  // Example: BOMCEL24 (folderName + random 2-digit number)
  const num = Math.floor(10 + Math.random() * 90);
  return `${folderName.replace(/\s+/g, "").toUpperCase()}${num}`;
}

async function handleNewDriveVideo(file, folder) {
  try {
    console.log(
      `\n🚨 New video detected from Drive: ${file.name} in folder ${folder.name}`
    );
    // 1. Download file to uploads/
    const localPath = path.join(__dirname, "uploads", file.name);
    console.log(`⬇️  Downloading file from Drive to ${localPath}...`);
    await downloadDriveFile(file.id, localPath);
    console.log(`✅ Downloaded file to ${localPath}`);
    // 2. Upload to Cloudinary
    console.log(`☁️  Uploading to Cloudinary...`);
    const cloudinaryResult = await uploadToCloudinary(localPath);
    if (cloudinaryResult.success) {
      console.log(`✅ Uploaded to Cloudinary: ${cloudinaryResult.url}`);
    } else {
      console.error(`❌ Cloudinary upload failed: ${cloudinaryResult.error}`);
    }
    // 3. Call /process-transcript to generate captions
    console.log(`📝 Transcribing and generating captions...`);
    let captions = {};
    try {
      const transcriptRes = await axios.post(
        `http://localhost:${port}/process-transcript`,
        { filename: file.name }
      );
      if (transcriptRes.data.success) {
        captions = transcriptRes.data.content;
        console.log(`✅ Captions generated for all platforms.`);
      } else {
        console.warn(
          `⚠️ Transcript processing failed, using folder name as caption.`
        );
      }
    } catch (e) {
      captions = { tiktok: folder.name, instagram: folder.name };
      console.warn(
        `⚠️ Transcript/caption generation error, using folder name as fallback.`
      );
    }
    // 4. Generate unique folder ID
    const uniqueId = generateUniqueFolderId(folder.name);
    // 5. Compose WhatsApp message
    console.log(`✉️  Preparing WhatsApp message...`);
    let message = `New Uploaded file: ${file.name}\nOur Unique ID for the folder ${folder.name}: ${uniqueId}\nCaption generated:\n`;
    if (/tiktok/i.test(folder.name) && /instagram/i.test(folder.name)) {
      message += `Tiktok: ${captions.tiktok || folder.name}\nInstagram: ${
        captions.instagram || folder.name
      }\n`;
    } else if (/tiktok/i.test(folder.name)) {
      message += `Tiktok: ${captions.tiktok || folder.name}\n`;
    } else if (/instagram/i.test(folder.name)) {
      message += `Instagram: ${captions.instagram || folder.name}\n`;
    } else {
      message += `All: ${
        captions.facebook || captions.tiktok || folder.name
      }\n`;
    }
    message += `What time would you like to post it? (Reply in DD/MM/YYYY HH:mm am/pm format)`;
    // 6. Store pending info for later scheduling (in-memory or DB, as needed)
    global.lastDriveUpload = {
      fileName: file.name,
      cloudinaryUrl: cloudinaryResult.url,
      folderName: folder.name,
      uniqueId,
      captions,
    };
    await sendWhatsAppMessage(process.env.NOTIFY_WHATSAPP_NUMBER, message);
    console.log(`✅ WhatsApp message sent to user for scheduling.`);
  } catch (err) {
    console.error("Error in handleNewDriveVideo:", err);
  }
}

async function watchFolderAndSubfolders() {
  if (!initializedDrivePolling) return; // Don't run until initialized
  const mainFolderId = process.env.GOOGLE_DRIVE_FOLDER_ID;
  if (!mainFolderId) {
    console.warn("GOOGLE_DRIVE_FOLDER_ID not set in .env");
    return;
  }
  const subfolders = await listSubfolders(mainFolderId);
  subfolders.push({ id: mainFolderId, name: "Bomcel (root)" });
  for (const folder of subfolders) {
    const currentFiles = await listFilesInFolder(folder.id);
    const known = folderMap.get(folder.id) || new Set();
    const newOnes = currentFiles.filter((file) => !known.has(file.id));
    for (const file of newOnes) {
      if (
        file.mimeType !== "application/vnd.google-apps.folder" &&
        file.mimeType.startsWith("video/")
      ) {
        if (processingFiles.has(file.id)) {
          // Already being processed, skip
          continue;
        }
        processingFiles.add(file.id); // Mark as being processed
        handleNewDriveVideo(file, folder)
          .catch(console.error)
          .finally(() => {
            processingFiles.delete(file.id); // Remove from processing set
            // Add to folderMap so it's not picked up again
            const known = folderMap.get(folder.id) || new Set();
            known.add(file.id);
            folderMap.set(folder.id, known);
          });
      } else if (file.mimeType !== "application/vnd.google-apps.folder") {
        // Non-video file, skip or handle as needed
      } else {
        console.log(
          `🆕 New folder added to folder: ${folder.name} → ${file.name}`
        );
      }
    }
    // Update folderMap with current file IDs
    folderMap.set(folder.id, new Set(currentFiles.map((f) => f.id)));
  }
}
// On startup, initialize folderMap so only new files after startup are notified
initializeFolderMap().catch(console.error);
// Run polling every 5 seconds
setInterval(() => {
  watchFolderAndSubfolders().catch(console.error);
}, 5000);

// --- Catch-up job to post overdue scheduled posts ---
setInterval(async () => {
  try {
    const now = new Date();
    const overduePosts = await ScheduledPost.find({
      status: "pending",
      scheduledTime: { $lte: now },
    });
    for (const post of overduePosts) {
      console.log(`⏰ Catch-up: Posting overdue scheduled post '${post.filename}' (${post._id})`);
      const filePath = path.join(__dirname, "uploads", post.filename);
      const platformCaptions = post.generatedContent || {};
      const cloudinaryUrl = post.cloudinaryUrl;
      const platforms = post.platforms || [];
      const results = {};
      for (const platform of platforms) {
        try {
          if (platform === "facebook") {
            results.facebook = await uploadToFacebook(filePath, platformCaptions.facebook, cloudinaryUrl);
            await notifyWhatsAppOnSuccess(post, 'Facebook', results.facebook);
          } else if (platform === "instagram") {
            results.instagram = await uploadToInstagram(filePath, platformCaptions.instagram, cloudinaryUrl);
            await notifyWhatsAppOnSuccess(post, 'Instagram', results.instagram);
          } else if (platform === "tiktok") {
            results.tiktok = await uploadToTikTok(filePath, platformCaptions.tiktok);
            await notifyWhatsAppOnSuccess(post, 'TikTok', results.tiktok);
          } else if (platform === "twitter") {
            results.twitter = await uploadToTwitter(filePath, platformCaptions.twitter);
            await notifyWhatsAppOnSuccess(post, 'Twitter', results.twitter);
          } else if (platform === "linkedin") {
            results.linkedin = await uploadToLinkedIn(filePath, platformCaptions.linkedin, cloudinaryUrl);
            await notifyWhatsAppOnSuccess(post, 'LinkedIn', results.linkedin);
          }
        } catch (err) {
          console.error(`❌ Error posting to ${platform}:`, err.message);
        }
      }
      await ScheduledPost.findByIdAndUpdate(post._id, { status: "completed" });
      console.log(`✅ Catch-up: Completed scheduled post '${post.filename}' (${post._id})`);
    }
  } catch (err) {
    console.error("❌ Catch-up job error:", err);
  }
}, 5 * 60 * 1000); // every 5 minutes

// --- Self-ping to prevent Render from sleeping ---
setInterval(() => {
  axios
    .get("https://one0x-finale.onrender.com/test")
    .then(() => console.log("🔄 Self-ping to prevent sleep"))
    .catch((err) => console.warn("⚠️ Self-ping failed:", err.message));
}, 5 * 60 * 1000); // every 5 minutes

// --- Helper to send WhatsApp notification on successful post ---
async function notifyWhatsAppOnSuccess(post, platform, result) {
  if (result && result.success) {
    const to = process.env.NOTIFY_WHATSAPP_NUMBER;
    if (!to) return;
    const message = `✅ Successfully posted '${post.filename}' to ${platform}. Post ID: ${result.id || 'N/A'}`;
    await sendWhatsAppMessage(to, message);
  }
}

// --- Daily health check and error report ---
const HEALTH_CHECK_HOUR = 8; // 8:00 AM
cron.schedule('0 8 * * *', async () => {
  try {
    let healthStatus = '✅ Server is running.';
    let errorSummary = '';
    // Check MongoDB connection
    if (mongoose.connection.readyState !== 1) {
      healthStatus = '❌ MongoDB is not connected!';
      errorSummary += '\n- MongoDB connection issue.';
    }
    // Check if uploads directory exists
    if (!fs.existsSync('uploads')) {
      errorSummary += '\n- uploads/ directory is missing.';
    }
    // Check for pending scheduled posts that are overdue
    const now = new Date();
    const overduePosts = await ScheduledPost.find({
      status: 'pending',
      scheduledTime: { $lte: now },
    });
    if (overduePosts.length > 0) {
      errorSummary += `\n- ${overduePosts.length} scheduled post(s) are overdue.`;
    }
    // Check for recent errors in a simple error log file (if exists)
    let recentErrors = '';
    const errorLogPath = 'error.log';
    if (fs.existsSync(errorLogPath)) {
      const logContent = fs.readFileSync(errorLogPath, 'utf-8');
      const lines = logContent.trim().split('\n');
      recentErrors = lines.slice(-10).join('\n'); // last 10 errors
      if (recentErrors) {
        errorSummary += `\n- Recent errors:\n${recentErrors}`;
      }
    }
    // Suggestion
    let suggestion = '';
    if (errorSummary) {
      suggestion = '\nPlease check the server logs, MongoDB connection, and ensure all environment variables are set. Investigate overdue posts and errors above.';
    } else {
      suggestion = '\nNo issues detected. All systems operational.';
    }
    // Compose and send WhatsApp message
    const to = process.env.NOTIFY_WHATSAPP_NUMBER;
    if (to) {
      const message = `🌅 Daily Health Check:\n${healthStatus}${errorSummary}${suggestion}`;
      await sendWhatsAppMessage(to, message);
    }
    console.log('✅ Daily health check sent to WhatsApp.');
  } catch (err) {
    console.error('❌ Health check job error:', err);
  }
});
