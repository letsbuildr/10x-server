const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const { createClient } = require("@deepgram/sdk");
const GeminiService = require("../gemini");

const app = express();
const port = 3000;

// Middleware
app.use(express.json());
app.use(express.static("public"));
app.use("/uploads", express.static("uploads"));

// Ensure uploads directory exists
const uploadsDir = "./uploads";
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Multer configuration for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    const extension = path.extname(file.originalname);
    cb(null, "video-" + uniqueSuffix + extension);
  },
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 500 * 1024 * 1024, // 500MB limit
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = [
      "video/mp4",
      "video/avi",
      "video/mov",
      "video/wmv",
      "video/mkv",
    ];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("Invalid file type. Please upload a video file."), false);
    }
  },
});

// Initialize Gemini service
const geminiService = new GeminiService();

// Routes
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

// Upload video endpoint
app.post("/upload", upload.single("video"), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: "No video file provided",
      });
    }

    console.log(`Video uploaded: ${req.file.filename}`);

    res.json({
      success: true,
      filename: req.file.filename,
      originalName: req.file.originalname,
      size: req.file.size,
    });
  } catch (error) {
    console.error("Upload error:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// Transcribe video endpoint
app.post("/transcribe", async (req, res) => {
  try {
    const { filename } = req.body;

    if (!filename) {
      return res.status(400).json({
        success: false,
        error: "Filename is required",
      });
    }

    const videoPath = path.join(uploadsDir, filename);

    if (!fs.existsSync(videoPath)) {
      return res.status(404).json({
        success: false,
        error: "Video file not found",
      });
    }

    console.log(`Starting transcription for: ${filename}`);

    // Execute Whisper command
    const command = `whisper "${videoPath}" --language English --model base --output_format txt --output_dir "${uploadsDir}"`;

    exec(command, (error, stdout, stderr) => {
      if (error) {
        console.error("Whisper error:", error);
        return res.status(500).json({
          success: false,
          error: "Transcription failed: " + error.message,
        });
      }

      try {
        // Read the generated transcript file
        const baseFilename = path.parse(filename).name;
        const transcriptPath = path.join(uploadsDir, baseFilename + ".txt");

        if (fs.existsSync(transcriptPath)) {
          const transcript = fs.readFileSync(transcriptPath, "utf-8");

          console.log("Transcription completed successfully");

          res.json({
            success: true,
            transcript: transcript.trim(),
            transcriptFile: baseFilename + ".txt",
          });
        } else {
          throw new Error("Transcript file not generated");
        }
      } catch (readError) {
        console.error("Error reading transcript:", readError);
        res.status(500).json({
          success: false,
          error: "Failed to read transcript: " + readError.message,
        });
      }
    });
  } catch (error) {
    console.error("Transcription error:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// Generate social media content endpoint
app.post("/generate-content", async (req, res) => {
  try {
    const { transcript } = req.body;

    if (!transcript) {
      return res.status(400).json({
        success: false,
        error: "Transcript is required",
      });
    }

    console.log("Generating social media content...");

    // Generate content for all platforms
    const content = await geminiService.generateAllPlatformContent(transcript);

    console.log("Content generation completed successfully");

    res.json({
      success: true,
      content: content,
    });
  } catch (error) {
    console.error("Content generation error:", error);
    res.status(500).json({
      success: false,
      error: "Content generation failed: " + error.message,
    });
  }
});

// Health check endpoint
app.get("/health", (req, res) => {
  res.json({
    success: true,
    message: "Server is running",
    timestamp: new Date().toISOString(),
  });
});

// Error handling middleware
app.use((error, req, res, next) => {
  console.error("Server error:", error);
  res.status(500).json({
    success: false,
    error: error.message,
  });
});

// Start server
app.listen(port, () => {
  console.log(
    `🚀 Video Transcription Server running on http://localhost:${port}`
  );
  console.log(`📁 Uploads directory: ${path.resolve(uploadsDir)}`);
  console.log("📝 Make sure Whisper is installed and available in your PATH");
  console.log("🔑 Make sure to set your GEMINI_API_KEY environment variable");
});

module.exports = app;
