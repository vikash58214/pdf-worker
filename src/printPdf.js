import chromium from "@sparticuz/chromium";
import puppeteer from "puppeteer-core";
import dotenv from "dotenv";
import os from "os";
dotenv.config();

const CONFIG = {
  MAX_RETRIES: 3,
  PAGE_TIMEOUT: 45000,
  WAIT_AFTER_LOAD: 4000,
  RETRY_DELAY_BASE: 1500,
  // A4 print mode – browser handles pagination
};

export async function generateOptimizedPrintPDF(url) {
  return attemptPDFGeneration(url, CONFIG.MAX_RETRIES);
}

async function attemptPDFGeneration(url, retries) {
  let browser;

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      console.log(`PDF Attempt ${attempt}/${retries} → URL: ${url}`);

      // --------------------------
      // Launch Puppeteer
      // --------------------------
      const isLocal = os.platform() === "darwin";

      const executablePath = isLocal
        ? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
        : await chromium.executablePath();

      browser = await puppeteer.launch({
        args: isLocal
          ? []
          : [
              ...chromium.args,
              "--disable-dev-shm-usage",
              "--disable-gpu",
              "--disable-background-timer-throttling",
              "--disable-backgrounding-occluded-windows",
              "--disable-renderer-backgrounding",
              "--disable-setuid-sandbox",
              "--no-sandbox",
              "--no-zygote",
              "--single-process",
            ],
        executablePath,
        headless: true,
        defaultViewport: {
          width: 400,
          height: 800,
        },
      });

      const page = await browser.newPage();

      page.setDefaultTimeout(CONFIG.PAGE_TIMEOUT);
      page.setDefaultNavigationTimeout(CONFIG.PAGE_TIMEOUT);

      console.log("Navigating…");

      // --------------------------
      // Navigate
      // --------------------------
      const response = await page.goto(url, {
        waitUntil: ["networkidle0", "domcontentloaded"],
        timeout: CONFIG.PAGE_TIMEOUT,
      });

      if (!response || !response.ok()) {
        throw new Error(`Failed to load page. Status: ${response?.status()}`);
      }

      // Wait for body
      await page.waitForSelector("body", { timeout: 8000 });

      // Extra wait for dynamic React UI
      await wait(CONFIG.WAIT_AFTER_LOAD);
      await page.emulateMediaType("print");

      // --------------------------
      // Generate PDF
      // --------------------------
      const pdfBuffer = await page.pdf({
        format: "A4",
        printBackground: true,
        preferCSSPageSize: true,
        displayHeaderFooter: false,
        margin: {
          top: "20mm",
          bottom: "20mm",
          left: "15mm",
          right: "15mm",
        },
      });

      if (!pdfBuffer || pdfBuffer.length === 0) {
        throw new Error("Generated PDF is empty");
      }

      console.log(`PDF SUCCESS → ${pdfBuffer.length} bytes`);

      await browser.close();
      browser = null;

      // Cleanup memory
      if (global.gc) global.gc();

      return pdfBuffer;
    } catch (error) {
      console.error(`PDF FAIL Attempt ${attempt}: ${error.message}`);

      if (browser) {
        try {
          await browser.close();
        } catch (closeError) {
          console.error("Error closing browser:", closeError);
        }
      }

      if (attempt === retries) {
        throw new Error(
          `PDF generation failed after ${retries} attempts → ${error.message}`
        );
      }

      const delay = CONFIG.RETRY_DELAY_BASE * Math.pow(2, attempt);
      console.log(`Retrying in ${delay}ms…`);
      await wait(delay);
    }
  }
}

// Helper
function wait(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
