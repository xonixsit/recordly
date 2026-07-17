import express from "express";
import path from "path";
import dotenv from "dotenv";
import { GoogleGenAI, Type } from "@google/genai";
import { createServer as createViteServer } from "vite";

dotenv.config();

const app = express();
const PORT = 3000;

// Setup JSON body parser with increased limit to handle recorded audio/video blobs
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));

// Initialize Gemini SDK with telemetry header as required by guidelines
const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: {
    headers: {
      "User-Agent": "aistudio-build",
    },
  },
});

// API Routes
app.get("/api/health", (req, res) => {
  res.json({ status: "ok" });
});

app.post("/api/transcribe", async (req, res) => {
  try {
    const { audioData, mimeType, mode } = req.body;

    if (!audioData) {
      return res.status(400).json({ error: "Missing audioData base64 payload" });
    }

    if (!process.env.GEMINI_API_KEY) {
      console.warn("GEMINI_API_KEY is not defined. Falling back to empty captions.");
      return res.json({ captions: [] });
    }

    const cleanedMimeType = mimeType || "video/webm";
    const isVisualMode = mode === "visual";

    console.log(`Sending audio/video file of type ${cleanedMimeType} to Gemini 3.5 Flash for ${isVisualMode ? "visual walk-through analysis" : "spoken audio transcription"}...`);

    let prompt = "";
    if (isVisualMode) {
      prompt = 
        "Analyze the visual stream of this screen recording video throughout its entire duration. " +
        "Identify the workflows, mouse navigations, mouse clicks, highlight circles, page routing, and interactive features shown in the interface. " +
        "Generate high-quality synchronized walkthrough subtitle caption segments explaining exactly what actions or features are being shown in the video " +
        "(e.g., 'User hovers over the dashboard analytics widget', 'Navigates to the settings configuration panel', 'Enters test data into the input field', 'Clicks compile and download'). " +
        "Each segment MUST have the following structure: " +
        '{ "text": "Walkthrough description", "startTime": 1000, "endTime": 4500 } ' +
        "where startTime and endTime are in milliseconds relative to the start of the recording. " +
        "Distribute the walkthrough segments evenly across the duration of the video based on the visual timeline. " +
        "Keep text short (roughly 5 to 10 words per subtitle) and highly professional. " +
        "If there are no distinct navigations or screen recordings, describe the visual elements present in the video.";
    } else {
      prompt = 
        "Transcribe the spoken audio from this file into a JSON array of caption segments. " +
        "Each segment MUST have the following structure: " +
        '{ "text": "spoken text here", "startTime": 1500, "endTime": 4200 } ' +
        "where startTime and endTime are in milliseconds relative to the start of the recording. " +
        "Keep segments short and readable as subtitles (roughly 3 to 7 words per segment). " +
        "Ensure timestamps are perfectly synchronized with the speech. " +
        "If there is no speech or voice detected, return an empty JSON array [].";
    }

    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: [
        {
          inlineData: {
            data: audioData,
            mimeType: cleanedMimeType,
          },
        },
        {
          text: prompt,
        },
      ],
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              text: { type: Type.STRING },
              startTime: { type: Type.NUMBER, description: "Start time of segment in milliseconds" },
              endTime: { type: Type.NUMBER, description: "End time of segment in milliseconds" },
            },
            required: ["text", "startTime", "endTime"],
          },
        },
      },
    });

    const text = response.text || "[]";
    const captions = JSON.parse(text);

    console.log(`Successfully generated ${captions.length} ${isVisualMode ? "visual walkthrough" : "spoken speech"} caption segments.`);
    res.json({ captions });
  } catch (error: any) {
    console.error("Transcription error:", error);
    res.status(500).json({ error: error.message || "Failed to transcribe audio" });
  }
});

app.post("/api/transcribe-youtube", async (req, res) => {
  try {
    const { duration, title, mode } = req.body;

    if (!process.env.GEMINI_API_KEY) {
      console.warn("GEMINI_API_KEY is not defined. Falling back to empty captions.");
      return res.json({ captions: [] });
    }

    const isVisualMode = mode === "visual";
    console.log(`Generating simulated English subtitle captions for external video/youtube: "${title || 'Screen recording video'}" with duration ${duration}ms, mode: ${mode}...`);

    let prompt = "";
    if (isVisualMode) {
      prompt = 
        `Analyze the context of the presentation video with the title/description: "${title || 'Screen Recording Demo'}". ` +
        `The video duration is exactly ${duration || 30000} milliseconds. ` +
        `Generate a professional, synchronized visual walk-through description detailing the feature flows, screen navigations, clicking actions, and interface workflows you would expect to see in such a video. ` +
        `Each segment MUST have this structure: ` +
        `{ "text": "Walkthrough description", "startTime": 1000, "endTime": 4500 } ` +
        `where startTime and endTime are in milliseconds relative to the start. ` +
        `Distribute these walkthrough segments beautifully and evenly across the entire duration. Keep segments short and highly informative. Return strictly a JSON array.`;
    } else {
      prompt = 
        `Create a high-quality, realistic set of english subtitle captions for a presentation video with the context or title: "${title || 'Screen Recording Demo'}". ` +
        `The video is exactly ${duration || 30000} milliseconds long. ` +
        "Generate a series of spoken subtitle lines that fit this length beautifully. " +
        "Each segment MUST have this structure: " +
        '{ "text": "subtitle line text", "startTime": 1000, "endTime": 4500 } ' +
        "where startTime and endTime are in milliseconds relative to the start. " +
        "Keep the segments short (around 4-8 words), realistic, helpful, and beautifully distributed throughout the entire duration. " +
        "Return strictly a JSON array of these segments.";
    }

    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              text: { type: Type.STRING },
              startTime: { type: Type.NUMBER },
              endTime: { type: Type.NUMBER },
            },
            required: ["text", "startTime", "endTime"],
          },
        },
      },
    });

    const text = response.text || "[]";
    const captions = JSON.parse(text);

    console.log(`Successfully generated ${captions.length} captions for YouTube video.`);
    res.json({ captions });
  } catch (error: any) {
    console.error("YouTube captions generation error:", error);
    res.status(500).json({ error: error.message || "Failed to generate captions" });
  }
});

// Mount Vite middleware or static files depending on the environment
async function setupVite() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }
}

setupVite().then(() => {
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
});
