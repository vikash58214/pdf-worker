import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { generateOptimizedPDF } from "./generate.js";
import { generateOptimizedPrintPDF } from "./printPdf.js";
import { uploadToS3 } from "./upload.js";

dotenv.config();

const app = express();

// ------------------------------
// Middleware
// ------------------------------
app.use(
  cors({
    origin: "*",
    methods: ["GET"],
  })
);

app.use(express.json({ limit: "50mb" }));

// ------------------------------
// Health Check
// ------------------------------
app.get("/", (req, res) => {
  res.json({
    status: "online",
    service: "PDF Generator (Direct)",
    timestamp: new Date().toISOString(),
  });
});

// ------------------------------
// Render Pages Map
// ------------------------------
const RENDER_PAGES = {
  itineraryCrm:
    "https://master.d3ubh7wpfu0fox.amplifyapp.com/crm-itinerary-pdf",
  itineraryCustom:
    "https://master.d3ubh7wpfu0fox.amplifyapp.com/crm-customTheme-pdf",
  itineraryMain: "https://master.d3ubh7wpfu0fox.amplifyapp.com/pdf-preview",
  invoice: "https://master.d3ubh7wpfu0fox.amplifyapp.com/invoice",
  voucherMain: "https://master.d3ubh7wpfu0fox.amplifyapp.com/view-voucher",
  voucherCrm: "https://master.d3ubh7wpfu0fox.amplifyapp.com/hotel-voucher",
  magazinePro: "https://staging.d3ubh7wpfu0fox.amplifyapp.com/crm-magazinePro",
};

const RENDER_PRINT_PAGES = {
  itineraryCrm: "https://master.d3ubh7wpfu0fox.amplifyapp.com/print-pdf-crm",
};

// ------------------------------
// GENERATE PDF (DIRECT)
// ------------------------------
app.get("/generate-now", async (req, res) => {
  const {
    id,
    type = "itineraryCrm",
    waterMark = false,
    mapViewButton = false,
    proTip = false,
    energyMeter = false,
  } = req.query;

  if (!id) {
    return res.status(400).json({ error: "Missing ID" });
  }

  const baseUrl = RENDER_PAGES[type];
  if (!baseUrl) {
    return res.status(400).json({
      error: "Invalid PDF type",
      allowedTypes: Object.keys(RENDER_PAGES),
    });
  }

  const renderUrl =
    `${baseUrl}?id=${id}` +
    `&proTip=${proTip}` +
    `&waterMark=${waterMark}` +
    `&mapViewButton=${mapViewButton}` +
    `&energyMeter=${energyMeter}`;

  try {
    console.log("Generating PDF for:", renderUrl);

    // 1️⃣ Generate PDF
    const pdfBuffer = await generateOptimizedPDF(renderUrl);

    // 2️⃣ Upload to S3
    const key = `crm-pdf/${type}-${id}-${Date.now()}.pdf`;
    const publicUrl = await uploadToS3(pdfBuffer, key);

    // 3️⃣ Redirect user
    return res.redirect(302, publicUrl);
  } catch (err) {
    console.error("PDF generation failed:", err);
    return res.status(500).json({
      error: "PDF generation failed",
      message: err.message,
    });
  }
});

app.get("/generate-now-print", async (req, res) => {
  const {
    id,
    type = "itineraryCrm",
    waterMark = false,
    mapViewButton = false,
  } = req.query;

  if (!id) {
    return res.status(400).json({ error: "Missing ID" });
  }

  const baseUrl = RENDER_PRINT_PAGES[type];
  if (!baseUrl) {
    return res.status(400).json({
      error: "Invalid PDF type",
      allowedTypes: Object.keys(RENDER_PRINT_PAGES),
    });
  }

  const renderUrl =
    `${baseUrl}?id=${id}` +
    `&waterMark=${waterMark}` +
    `&mapViewButton=${mapViewButton}`;

  try {
    console.log("Generating PDF for:", renderUrl);

    // 1️⃣ Generate PDF
    const pdfBuffer = await generateOptimizedPrintPDF(renderUrl);

    // 2️⃣ Upload to S3
    const key = `crm-pdf/${type}-${id}-${Date.now()}.pdf`;
    const publicUrl = await uploadToS3(pdfBuffer, key);

    // 3️⃣ Redirect user
    return res.redirect(302, publicUrl);
  } catch (err) {
    console.error("PDF generation failed:", err);
    return res.status(500).json({
      error: "PDF generation failed",
      message: err.message,
    });
  }
});

// ------------------------------
// Start Server
// ------------------------------
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 PDF Generator running on port ${PORT}`);
});
