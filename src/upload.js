import AWS from "aws-sdk";
import dotenv from "dotenv";
dotenv.config();

const CDN_BASE_URL = "https://d19og5jzdjz5k4.cloudfront.net";
// ------------------------------------
// Initialize AWS S3
// ------------------------------------
const s3 = new AWS.S3({
  region: process.env.AWS_REGION,
  accessKeyId: process.env.AWS_ACCESS,
  secretAccessKey: process.env.AWS_SECRET,
  signatureVersion: "v4",
});

// ------------------------------------
// Upload Configuration
// ------------------------------------
const CONFIG = {
  RETRIES: 3,
  RETRY_DELAY: 1500,
  MULTIPART_THRESHOLD: 5 * 1024 * 1024, // 5 MB → use multipart upload
};

// ------------------------------------
// Public Upload Function
// ------------------------------------
export async function uploadToS3(buffer, key) {
  return attemptUpload(buffer, key, CONFIG.RETRIES);
}

// ------------------------------------
// Retry Wrapper
// ------------------------------------
async function attemptUpload(buffer, key, retries) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      console.log(`Uploading PDF to S3 (${attempt}/${retries}) → ${key}`);

      const url = await uploadFile(buffer, key);

      console.log("Upload successful:", url);
      return url;
    } catch (error) {
      console.error(`Upload attempt ${attempt} failed:`, error.message);

      if (attempt === retries) {
        throw new Error(`S3 upload failed after ${retries} attempts`);
      }

      const delay = CONFIG.RETRY_DELAY * attempt;
      console.log(`Retrying upload in ${delay}ms...`);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
}

// ------------------------------------
// Upload Logic with Multipart Support
// ------------------------------------
async function uploadFile(buffer, key) {
  const bucket = process.env.S3_BUCKET;

  if (buffer.length > CONFIG.MULTIPART_THRESHOLD) {
    return uploadMultipart(buffer, bucket, key);
  }

  return uploadSingle(buffer, bucket, key);
}

// ------------------------------------
// SIMPLE PUT (Fast for < 5MB)
// ------------------------------------
async function uploadSingle(buffer, bucket, key) {
  const params = {
    Bucket: bucket,
    Key: key,
    Body: buffer,
    ContentType: "application/pdf",
    CacheControl: "public, max-age=31536000",
    ContentDisposition: "inline",
    ServerSideEncryption: "AES256",
  };

  await s3.putObject(params).promise();

  return buildPublicUrl(key);
}

// ------------------------------------
// MULTIPART UPLOAD (Safe for > 5MB)
// ------------------------------------
async function uploadMultipart(buffer, bucket, key) {
  console.log("Using multipart upload…");

  const upload = await s3
    .upload(
      {
        Bucket: bucket,
        Key: key,
        Body: buffer,
        ContentType: "application/pdf",
        CacheControl: "public, max-age=31536000",
        ContentDisposition: "inline",
        ServerSideEncryption: "AES256",
      },
      {
        partSize: 5 * 1024 * 1024,
        queueSize: 4,
      }
    )
    .promise();

  return buildPublicUrl(key);
}

// ------------------------------------
// Build Public URL (With CloudFront)
// ------------------------------------
function buildPublicUrl(key) {
  if (!CDN_BASE_URL) {
    throw new Error("CDN_URL is required (CloudFront domain)");
  }

  return `${CDN_BASE_URL}/${key}`;
}
