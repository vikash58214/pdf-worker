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
  MAX_PDF_HEIGHT: 50000,
  PDF_WIDTH: 850, // Define width constant to ensure consistency
};

export async function generateOptimizedMagazineProPDF(url) {
  return attemptPDFGeneration(url, CONFIG.MAX_RETRIES);
}

async function attemptPDFGeneration(url, retries) {
  let browser;

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      console.log(`PDF Attempt ${attempt}/${retries} → URL: ${url}`);

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
          width: CONFIG.PDF_WIDTH, // FIXED: Match PDF width here
          height: 800, // Height doesn't matter much here, it expands
          deviceScaleFactor: 1, // FIXED: Force 1x scale to avoid math confusion
        },
      });

      const page = await browser.newPage();

      page.setDefaultTimeout(CONFIG.PAGE_TIMEOUT);
      page.setDefaultNavigationTimeout(CONFIG.PAGE_TIMEOUT);

      console.log("Navigating…");

      const response = await page.goto(url, {
        waitUntil: ["networkidle0", "domcontentloaded"],
        timeout: CONFIG.PAGE_TIMEOUT,
      });

      if (!response || !response.ok()) {
        throw new Error(`Failed to load page. Status: ${response?.status()}`);
      }

      await page.waitForSelector("body", { timeout: 8000 });
      await wait(CONFIG.WAIT_AFTER_LOAD);
      await page.emulateMediaType("print"); // or 'screen' depending on your CSS

      // --------------------------
      // Measure Page Height
      // --------------------------
      const { height } = await page.evaluate(() => {
        // Use documentElement to capture full height, usually safer than body
        const h = document.documentElement.scrollHeight;
        return { height: h };
      });

      // FIXED: Removed DPR multiplication.
      // page.pdf expects CSS pixels, which matches the scrollHeight exactly.
      const adjustedHeight = Math.min(height, CONFIG.MAX_PDF_HEIGHT);

      console.log(`Measured Height: ${height}px`);
      console.log(`Final PDF Height: ${adjustedHeight}px`);

      // Disable page breaks
      await page.addStyleTag({
        content: `
          * {
            page-break-inside: avoid !important;
            break-inside: avoid !important;
          }
          body {
            overflow: visible !important;
            height: auto !important; 
          }
        `,
      });

      // --------------------------
      // Generate PDF
      // --------------------------
      const pdfBuffer = await page.pdf({
        printBackground: true,
        preferCSSPageSize: false,
        displayHeaderFooter: false,
        scale: 1,
        width: `${CONFIG.PDF_WIDTH}px`, // Matches viewport
        height: `${adjustedHeight + 2}px`, // Small buffer +2px to prevent cutoff
        margin: {
          top: "0px",
          bottom: "0px",
          left: "0px",
          right: "0px",
        },
      });

      if (!pdfBuffer || pdfBuffer.length === 0) {
        throw new Error("Generated PDF is empty");
      }

      console.log(`PDF SUCCESS → ${pdfBuffer.length} bytes`);

      await browser.close();
      browser = null;

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

function wait(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
