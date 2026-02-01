import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { generateOptimizedPDF } from "./generate.js";
import { generateOptimizedPrintPDF } from "./printPdf.js";
import { generateOptimizedMagazineProPDF } from "./magazinePro.js";
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
  itineraryCrm: `${process.env.DOMAIN}/crm-itinerary-pdf`,
  itineraryCustom: `${process.env.DOMAIN}/crm-customTheme-pdf`,
  itineraryMain: `${process.env.DOMAIN}/pdf-preview`,
  invoice: `${process.env.DOMAIN}/invoice`,
  voucherMain: `${process.env.DOMAIN}/view-voucher`,
  voucherCrm: `${process.env.DOMAIN}/hotel-voucher`,
};

const RENDER_PRINT_PAGES = {
  itineraryCrm: `${process.env.DOMAIN}/print-pdf-crm`,
};

const RENDER_MAGAZINE_PAGE = {
  magazinePro: `${process.env.DOMAIN}/crm-magazinePro`,
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
    `&waterMark=${waterMark}` +
    `&mapViewButton=${mapViewButton}`;

  try {
    console.log("Generating PDF for:", renderUrl);

    // 1️⃣ Generate PDF
    const pdfBuffer = await generateOptimizedPDF(renderUrl);

    // 2️⃣ Upload to S3
    const filename = `${type}-${id}-${Date.now()}.pdf`;
    const key = req.query.userId
      ? `crm-pdf/${type}/${req.query.userId}/${filename}`
      : `crm-pdf/${filename}`;
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
    const filename = `${type}-${id}-${Date.now()}.pdf`;
    const key = req.query.userId
      ? `crm-pdf/${type}/${req.query.userId}/${filename}`
      : `crm-pdf/${filename}`;
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

app.get("/magazinePro", async (req, res) => {
  const {
    id,
    type = "magazinePro",
    proTip = true,
    energyMeter = true,
    mapViewButton = false,
  } = req.query;

  if (!id) {
    return res.status(400).json({ error: "Missing ID" });
  }

  const baseUrl = RENDER_MAGAZINE_PAGE[type];
  if (!baseUrl) {
    return res.status(400).json({
      error: "Invalid PDF type",
      allowedTypes: Object.keys(RENDER_MAGAZINE_PAGE),
    });
  }

  const renderUrl =
    `${baseUrl}?id=${id}` +
    `&proTip=${proTip}` +
    `&energyMeter=${energyMeter}` +
    `&mapViewButton=${mapViewButton}`;

  try {
    console.log("Generating PDF for:", renderUrl);

    // 1️⃣ Generate PDF
    const pdfBuffer = await generateOptimizedMagazineProPDF(renderUrl);

    // 2️⃣ Upload to S3
    const filename = `${type}-${id}-${Date.now()}.pdf`;
    const key = req.query.userId
      ? `crm-pdf/${type}/${req.query.userId}/${filename}`
      : `crm-pdf/${filename}`;
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
