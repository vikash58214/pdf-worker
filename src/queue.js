import { Queue, QueueEvents } from "bullmq";
import Redis from "ioredis";
import dotenv from "dotenv";
dotenv.config();

// ------------------------------------
// Redis Connection (Upstash)
// ------------------------------------
export const connection = new Redis(process.env.UPSTASH_REDIS_URL, {
  maxRetriesPerRequest: null, // required for BullMQ
  enableReadyCheck: false,
  reconnectOnError: () => true,
});

// Log Redis errors
connection.on("error", (err) => {
  console.error("Redis connection error:", err);
});

// ------------------------------------
// Main PDF Queue
// ------------------------------------
export const pdfQueue = new Queue("pdf-generation", {
  connection,
  defaultJobOptions: {
    attempts: 3, // Auto retry at queue level
    backoff: {
      type: "exponential",
      delay: 3000,
    },
    removeOnComplete: {
      age: 60 * 60 * 24 * 2, // Keep successful jobs for 2 days
    },
    removeOnFail: false, // Keep failed jobs for inspection
  },
  limiter: {
    max: 10, // Max 10 jobs per second
    duration: 1000,
  },
});

// ------------------------------------
// Queue Event Listener (Highly useful)
// ------------------------------------
export const pdfQueueEvents = new QueueEvents("pdf-generation", {
  connection,
});

// Track job completion
pdfQueueEvents.on("completed", ({ jobId, returnvalue }) => {
  console.log(`Job ${jobId} completed`, returnvalue);
});

// Track job failure
pdfQueueEvents.on("failed", ({ jobId, failedReason }) => {
  console.error(`Job ${jobId} failed →`, failedReason);
});

// Optional: log when queue is drained
pdfQueueEvents.on("drained", () => {
  console.log("PDF queue is empty (all jobs processed)");
});

console.log("PDF Queue initialized: pdf-generation");
