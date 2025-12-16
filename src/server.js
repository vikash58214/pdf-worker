import express from "express";
import cors from "cors";
import { pdfQueue } from "./queue.js";
import dotenv from "dotenv";
dotenv.config();

const app = express();

// ------------------------------
// Middleware
// ------------------------------
app.use(
  cors({
    origin: "*", // Change to your domain when needed
    methods: ["GET", "POST"],
  })
);

app.use(
  express.json({
    limit: "50mb",
    strict: true,
  })
);

// ------------------------------
// Health Check
// ------------------------------
app.get("/", (req, res) => {
  res.status(200).json({
    status: "online",
    service: "PDF Worker API",
    timestamp: new Date().toISOString(),
  });
});

// ------------------------------
// Add Job to Queue
// ------------------------------
app.post("/generate", async (req, res) => {
  try {
    const {
      url,
      fileName,
      waterMark = false,
      mapViewButton = false,
    } = req.body;

    // Validate
    if (!url || typeof url !== "string") {
      return res.status(400).json({ error: "A valid URL is required" });
    }

    if (!fileName || typeof fileName !== "string") {
      return res.status(400).json({ error: "fileName is required" });
    }

    // Prevent overload — optional safety
    const jobCount = await pdfQueue.count();
    if (jobCount > 50) {
      return res.status(429).json({
        error: "Queue overloaded",
        message: "Too many PDF jobs running, try again in 1–2 minutes.",
      });
    }

    // Create job
    const job = await pdfQueue.add(
      "create-pdf",
      {
        url,
        fileName,
        waterMark,
        mapViewButton,
      },
      {
        attempts: 3, // Auto retry
        backoff: {
          type: "exponential",
          delay: 3000,
        },
        removeOnComplete: true,
        removeOnFail: false,
      }
    );

    return res.status(200).json({
      success: true,
      message: "PDF job queued successfully",
      jobId: job.id,
      status: "queued",
    });
  } catch (err) {
    console.error("Error while queueing PDF job:", err);

    return res.status(500).json({
      error: "Failed to queue job",
      details: err.message,
    });
  }
});

// ------------------------------
// Get Job Status
// ------------------------------
app.get("/status/:jobId", async (req, res) => {
  try {
    const { jobId } = req.params;
    const job = await pdfQueue.getJob(jobId);

    if (!job) {
      return res.status(404).json({ error: "Job not found" });
    }

    const state = await job.getState();
    const progress = job.progress();
    const result = job.returnvalue;

    return res.status(200).json({
      jobId,
      state,
      progress,
      result,
    });
  } catch (err) {
    console.error("Error while checking status:", err);
    return res.status(500).json({
      error: "Failed to fetch job status",
      details: err.message,
    });
  }
});

const RENDER_PAGES = {
  itineraryCrm:
    "https://master.d3ubh7wpfu0fox.amplifyapp.com/crm-itinerary-pdf",
  itineraryCustom:
    "https://master.d3ubh7wpfu0fox.amplifyapp.com/crm-customTheme-pdf",
  itineraryMain: "https://master.d3ubh7wpfu0fox.amplifyapp.com/pdf-preview",
  invoice: "https://master.d3ubh7wpfu0fox.amplifyapp.com/invoice",
  voucherMain: "https://master.d3ubh7wpfu0fox.amplifyapp.com/view-voucher",
  voucherCrm: "https://master.d3ubh7wpfu0fox.amplifyapp.com/hotel-voucher",
};
app.get("/generate-now", async (req, res) => {
  const {
    id,
    type = "itineraryCrm",
    waterMark = false,
    mapViewButton = false,
  } = req.query;

  if (!id) {
    return res.status(400).json({ error: "Missing itinerary ID" });
  }

  try {
    const baseUrl = RENDER_PAGES[type];

    if (!baseUrl) {
      return res.status(400).json({
        error: "Invalid PDF type",
        allowedTypes: Object.keys(RENDER_PAGES),
      });
    }

    const renderUrl =
      `${baseUrl}?id=${id}` +
      `&waterMark=${waterMark}` +
      `&mapViewButton=${mapViewButton}`;

    // 2️⃣ Create PDF job
    const job = await pdfQueue.add(
      "create-pdf",
      {
        url: renderUrl,
        fileName: `${type}-${id}`,
        waterMark,
        mapViewButton,
      },
      {
        attempts: 3,
        backoff: { type: "exponential", delay: 3000 },
      }
    );

    console.log("Queued job:", job.id);

    // 3️⃣ Poll job until completed or failed
    const interval = setInterval(async () => {
      const state = await job.getState();

      if (state === "completed") {
        const freshJob = await pdfQueue.getJob(job.id);
        const result = freshJob?.returnvalue;

        if (result && result.url) {
          clearInterval(interval);
          return res.redirect(302, result.url);
        } else {
          console.log(
            "PDF ready, but result.value not propagated yet. Waiting..."
          );
          return; // Wait for next polling cycle
        }
      }

      if (state === "failed") {
        clearInterval(interval);

        return res.status(500).json({
          error: "PDF generation failed",
          jobId: job.id,
        });
      }

      // else keep polling
    }, 1500);

    // Clean up polling if client closes connection
    req.on("close", () => {
      clearInterval(interval);
    });
  } catch (err) {
    console.error("Error generating now:", err);
    return res.status(500).json({ error: err.message });
  }
});

// ------------------------------
// Start Server
// ------------------------------
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`PDF Worker API running on port ${PORT}`);
});
