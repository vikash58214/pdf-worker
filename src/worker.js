import { Worker } from "bullmq";
import Redis from "ioredis";
import { generateOptimizedPDF } from "./generate.js";
import { uploadToS3 } from "./upload.js";
import dotenv from "dotenv";
dotenv.config();

// -------------------------------------------
// Redis Connection (Upstash Safe Mode)
// -------------------------------------------
const connection = new Redis(process.env.UPSTASH_REDIS_URL, {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
  reconnectOnError: () => true,
});

connection.on("error", (err) => {
  console.error("Redis Worker Connection Error:", err);
});

// -------------------------------------------
// Worker Configuration
// -------------------------------------------
const worker = new Worker(
  "pdf-generation",

  // ==============================
  // MAIN JOB PROCESSOR
  // ==============================
  async (job) => {
    const {
      url,
      fileName,
      waterMark = false,
      mapViewButton = false,
    } = job.data;

    console.log(`[JOB START] ${job.id}`);
    console.log("Payload:", job.data);

    try {
      job.updateProgress(10);

      // -------------------------------
      // 1. Generate PDF
      // -------------------------------
      console.log("Generating PDF…");
      const pdfBuffer = await generateOptimizedPDF(url);

      if (!pdfBuffer || pdfBuffer.length === 0) {
        throw new Error("Generated PDF buffer is empty");
      }

      console.log(`📦 PDF size: ${pdfBuffer.length} bytes`);
      job.updateProgress(60);

      // -------------------------------
      // 2. Upload to S3
      // -------------------------------
      console.log("☁ Uploading PDF to S3…");

      const key = `crm-pdf/${fileName}-${Date.now()}.pdf`;
      const publicUrl = await uploadToS3(pdfBuffer, key);

      console.log("Uploaded:", publicUrl);
      job.updateProgress(100);

      // -------------------------------
      // DONE
      // -------------------------------
      return {
        status: "success",
        url: publicUrl,
        size: pdfBuffer.length,
      };
    } catch (error) {
      console.error(`[JOB FAILED] ${job.id}: ${error.message}`);

      // Bubble error so BullMQ marks job as failed
      throw error;
    }
  },

  // ==============================
  // WORKER OPTIONS
  // ==============================
  {
    connection,

    // DO NOT increase concurrency — Puppeteer will crash
    concurrency: 1,

    // Worker-level error handling
    autorun: true,

    // Fail job if it runs too long
    // Prevent zombie Puppeteer processes
    lockDuration: 180000, // 3 minutes
  }
);

// -------------------------------------------
// Worker Global Error Handling
// -------------------------------------------
worker.on("completed", (job, result) => {
  console.log(`Job Completed: ${job.id}`);
  console.log("Result:", result);
});

worker.on("failed", (job, err) => {
  console.error(`Job Failed: ${job?.id}`);
  console.error("Reason:", err?.message);
});

// Panic handler: worker crashed
worker.on("error", (err) => {
  console.error("Worker Internal Error:", err);
});

// Log worker ready
console.log("PDF Worker Started & Listening…");
