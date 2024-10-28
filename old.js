const fs = require("fs");
const path = require("path");
const axios = require("axios");
const { execFile } = require("child_process");
const express = require("express");

const app = express();
const PORT = process.env.PORT || 3000;

// Serve static files
app.use(express.static(path.join(__dirname, "public")));

// Set up EJS as the view engine
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

// Path to the binary
const binDir = path.join(process.cwd(), "bin");
const ytDlpBinaryPath = path.join(
  binDir,
  process.platform === "win32" ? "yt-dlp.exe" : "yt-dlp"
);
const cookieFilePath = path.join(binDir, "cookies.txt");

async function downloadYtDlp() {
  if (!fs.existsSync(binDir)) {
    fs.mkdirSync(binDir);
  }

  let url = "";
  if (process.platform === "win32") {
    url =
      "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe";
  } else {
    url = "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp";
  }

  const writer = fs.createWriteStream(ytDlpBinaryPath);

  try {
    const response = await axios.get(url, {
      responseType: "stream",
    });

    const totalLength = response.headers["content-length"];
    let downloadedLength = 0;

    response.data.on("data", (chunk) => {
      downloadedLength += chunk.length;
      const progress = ((downloadedLength / totalLength) * 100).toFixed(2);
      process.stdout.write(`Downloading yt-dlp: ${progress}%\r`);
    });

    response.data.pipe(writer);

    return new Promise((resolve, reject) => {
      writer.on("finish", () => {
        if (process.platform !== "win32") {
          fs.chmodSync(ytDlpBinaryPath, "755");
        }
        console.log("\nDownload complete.");
        resolve();
      });
      writer.on("error", (err) => {
        fs.unlink(ytDlpBinaryPath, () => {});
        reject(`Failed to download yt-dlp: ${err.message}`);
      });
    });
  } catch (error) {
    fs.unlink(ytDlpBinaryPath, () => {});
    throw new Error(`Failed to download yt-dlp: ${error.message}`);
  }
}

// Function to check and download yt-dlp if necessary
async function checkAndDownloadYtDlp() {
  if (!fs.existsSync(ytDlpBinaryPath)) {
    console.log("yt-dlp not found, downloading...");
    await downloadYtDlp();
  }
}

// Function to run yt-dlp with specified URL and format options
async function runYtDlp(url) {
  try {
    await checkAndDownloadYtDlp();

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
    res.json({ success: true, data: result });
  } catch (error) {
    console.log(error);
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
