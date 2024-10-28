const fs = require("fs");
const path = require("path");
const axios = require("axios");
const { execFile } = require("child_process");
const express = require("express");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, "public")));

// Set up EJS as the view engine
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

// Paths to binary and cookies file
const binDir = path.join(process.cwd(), "bin");
const ytDlpBinaryPath = path.join(binDir, process.platform === "win32" ? "yt-dlp.exe" : "yt-dlp");
const cookieFilePath = path.join(binDir, "cookies.txt");

const ytDlpUrl = process.platform === "win32"
  ? "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe"
  : "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp";

const cookiesUrl = process.env.COOKIE_FILE || "";

async function downloadFile(url, outputPath) {
  const writer = fs.createWriteStream(outputPath);

  const response = await axios.get(url, { responseType: "stream" });
  response.data.pipe(writer);

  return new Promise((resolve, reject) => {
    writer.on("finish", resolve);
    writer.on("error", reject);
  });
}

async function downloadYtDlpAndCookies() {
  if (!fs.existsSync(binDir)) {
    fs.mkdirSync(binDir);
  }

  try {
    console.log("Downloading yt-dlp...");
    await downloadFile(ytDlpUrl, ytDlpBinaryPath);
    if (process.platform !== "win32") {
      fs.chmodSync(ytDlpBinaryPath, "755");
    }
    console.log("yt-dlp downloaded successfully.");

    console.log("Downloading cookies.txt...");
    await downloadFile(cookiesUrl, cookieFilePath);
    console.log("cookies.txt downloaded successfully.");
  } catch (error) {
    console.error("Error downloading files:", error.message);
    throw error;
  }
}

// Function to check and download yt-dlp if necessary
async function checkAndDownloadYtDlpAndCookies() {
  if (!fs.existsSync(ytDlpBinaryPath) || !fs.existsSync(cookieFilePath)) {
    console.log("yt-dlp or cookies.txt not found, downloading...");
    await downloadYtDlpAndCookies();
  }
}

async function runYtDlp(url) {
  try {
    await checkAndDownloadYtDlpAndCookies();

    const args = [
      "--cookies",
      cookieFilePath,
      "--ignore-errors",
      "--dump-json",
      url,
    ];

    return new Promise((resolve, reject) => {
      execFile(ytDlpBinaryPath, args, (error, stdout, stderr) => {
        if (error) {
          reject(`Error: ${error.message}`);
          return;
        }
        if (stderr) {
          reject(`Stderr: ${stderr}`);
          return;
        }
        try {
          const result = JSON.parse(stdout);
          // const filteredResult = result.formats.filter(format =>
          //     !format.url.includes('.m3u8') &&
          //     format.filesize && format.filesize <= 84 * 1024 * 1024
          // );

          resolve(result);
        } catch (parseError) {
          reject(`Failed to parse JSON: ${parseError.message}`);
        }
      });
    });
  } catch (err) {
    console.error(err);
    throw err;
  }
}

// Define an API endpoint that accepts a URL as a query parameter or from a POST body
app.use(express.json());

// Home route
app.get("/", (req, res) => {
  res.render("home");
});

// Docs route
app.get("/docs", (req, res) => {
  res.render("docs");
});

app.get("/ytdl", async (req, res) => {
  const url = req.query.url;
  if (!url) {
    return res.status(400).json({ error: "URL query parameter is required" });
  }
  console.log(url);

  try {
    const result = await runYtDlp(url);
    console.log(result);
    res.json({ success: true, data: result });
  } catch (error) {
    console.log("bal",error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post("/ytdl", async (req, res) => {
  const url = req.body.url;
  if (!url) {
    return res
      .status(400)
      .json({ error: "URL is required in the request body" });
  }

  try {
    const result = await runYtDlp(url);
    res.json({ success: true, data: result });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get("/proxy", async (req, res) => {
  try {
    const imageUrl = req.query.url;
    const response = await axios.get(imageUrl, { responseType: "arraybuffer" });
    res.set("Content-Type", "image/jpeg");
    res.send(response.data);
  } catch (error) {
    res.status(500).send("Error fetching image");
  }
});

// Start the server
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});

// Example usage:
// runYtDlp(' https://www.instagram.com/reel/C-iMPtxvxUQ/?igsh=aWw5dnM5Nml3Y3l1')
//     .then(result => {
//         console.log('Filtered formats:', result);
//         const outputPath = path.join(process.cwd(), 'filtered_formats.json');
//         fs.writeFileSync(outputPath, JSON.stringify(result, null, 2));
//         console.log(`Filtered formats saved to ${outputPath}`);
//     })
//     .catch(error => {
//         console.error(error);
//     });
