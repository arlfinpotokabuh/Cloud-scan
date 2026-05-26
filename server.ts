import express from "express";
import path from "path";
import fs from "fs";
import { Transform } from "stream";
import multer from "multer";
import { createServer as createViteServer } from "vite";
import axios from 'axios';
import https from 'https';
import { GoogleGenAI } from "@google/genai";
import { Document, Packer, Paragraph, ImageRun, TextRun } from "docx";

const ignoreSslAgent = new https.Agent({ rejectUnauthorized: false });

const apiKey = process.env.GEMINI_API_KEY;
const ai = apiKey ? new GoogleGenAI({
  apiKey: apiKey,
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    }
  }
}) : null;

class Throttle extends Transform {
    private rate: number;
    constructor(rate: number) {
        super();
        this.rate = rate; // bytes per second
    }
    _transform(chunk: Buffer, encoding: BufferEncoding, callback: Function) {
        const size = chunk.length;
        const timeToWait = (size / this.rate) * 1000;
        setTimeout(() => {
            this.push(chunk);
            callback();
        }, timeToWait);
    }
}

async function startServer() {
  const app = express();
  const PORT = 3000;
  const UPLOADS_DIR = path.join(process.cwd(), 'uploads');

  if (!fs.existsSync(UPLOADS_DIR)) {
    fs.mkdirSync(UPLOADS_DIR);
  }

  const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, UPLOADS_DIR),
    filename: (req, file, cb) => cb(null, file.originalname),
  });
  const upload = multer({ storage });

  const MAX_STORAGE_BYTES = 100 * 1024 * 1024 * 1024; // 100GB

  app.use(express.json({ limit: "150mb" }));
  app.use(express.urlencoded({ limit: "150mb", extended: true }));

  // Helper to get total size safely
  const getTotalSize = (dir: string) => {
    let size = 0;
    try {
      if (fs.existsSync(dir)) {
        const files = fs.readdirSync(dir);
        for (const file of files) {
          try {
            const stats = fs.statSync(path.join(dir, file));
            size += stats.size;
          } catch (e) {
            console.warn("Failed to stat file in getTotalSize:", file, e);
          }
        }
      }
    } catch (e) {
      console.warn("Failed to read directory in getTotalSize:", e);
    }
    return size;
  };

  // API routes
  app.get("/api/storage-info", async (req, res) => {
    try {
        const used = getTotalSize(UPLOADS_DIR);
        res.json({
            free: MAX_STORAGE_BYTES - used,
            total: MAX_STORAGE_BYTES,
            used: used,
            limit: MAX_STORAGE_BYTES
        });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: "Failed to get storage info" });
    }
  });

  app.get("/api/files", (req, res) => {
    fs.readdir(UPLOADS_DIR, { withFileTypes: true }, (err, files) => {
      if (err) return res.status(500).json({ error: "Unable to list files" });
      try {
        const fileDetails = files.filter(f => !f.name.endsWith('.meta.json')).map(file => {
          const filePath = path.join(UPLOADS_DIR, file.name);
          const stats = fs.statSync(filePath);
          const metaPath = filePath + '.meta.json';
          let uidAttr = null;
          if (fs.existsSync(metaPath)) {
              try {
                  const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
                  uidAttr = meta.uid;
              } catch(e) {}
          }
          return { name: file.name, size: stats.size, mtime: stats.mtime, birthtime: stats.birthtime, uid: uidAttr };
        });
        res.json(fileDetails);
      } catch (errLoop) {
        console.error("Error reading file stats:", errLoop);
        res.status(500).json({ error: "Error retrieving file statistics" });
      }
    });
  });

  app.post("/api/upload", (req, res, next) => {
    upload.single("file")(req, res, (err) => {
      if (err) {
        console.error("Multer upload middleware error:", err);
        return res.status(400).json({ error: "Multer error: " + err.message });
      }
      next();
    });
  }, (req, res) => {
    try {
        const fileReq = req as any;
        if (!fileReq.file) return res.status(400).json({ error: "No file uploaded" });
        const { uid } = req.body;
        
        if (uid) {
            fs.writeFileSync(fileReq.file.path + '.meta.json', JSON.stringify({ uid }));
        }
        
        if (getTotalSize(UPLOADS_DIR) > MAX_STORAGE_BYTES) {
            fs.unlinkSync(fileReq.file.path);
            return res.status(400).json({ error: "Storage limit exceeded (100GB)" });
        }
        res.json({ message: "File uploaded successfully" });
    } catch (errHandler) {
        console.error("Error inside /api/upload handler:", errHandler);
        res.status(500).json({ error: "Internal server error during upload" });
    }
  });

  app.post("/api/download-remote", async (req, res) => {
    const { url, uid } = req.body;
    if (!url) return res.status(400).json({ error: "URL is required" });

    try {
        const response = await axios.get(url, { 
            responseType: 'stream',
            httpsAgent: ignoreSslAgent
        });
        
        const fileName = path.basename(new URL(url).pathname) || 'downloaded_file';
        const filePath = path.join(UPLOADS_DIR, fileName);

        if (getTotalSize(UPLOADS_DIR) > MAX_STORAGE_BYTES) {
            return res.status(400).json({ error: "Storage limit exceeded (100GB)" });
        }

        const rawContentLength = response.headers['content-length'];
        const totalLength = rawContentLength ? parseInt(String(rawContentLength), 10) : 0;
        let downloadedLength = 0;

        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');

        response.data.on('data', (chunk: Buffer) => {
            downloadedLength += chunk.length;
            if (totalLength) {
                const percent = Math.floor((downloadedLength / totalLength) * 100);
                res.write(`data: ${JSON.stringify({ progress: Math.min(percent, 99) })}\n\n`);
            } else {
                res.write(`data: ${JSON.stringify({ progress: 50 })}\n\n`); // Indeterminate
            }
        });

        const writer = fs.createWriteStream(filePath);
        response.data.pipe(new Throttle(12.5 * 1024 * 1024)).pipe(writer);

        writer.on('finish', () => {
             if (uid) {
                fs.writeFileSync(filePath + '.meta.json', JSON.stringify({ uid }));
            }
            res.write(`data: ${JSON.stringify({ status: 'complete' })}\n\n`);
            res.end();
        });
        writer.on('error', () => {
            res.write(`data: ${JSON.stringify({ error: 'Download failed' })}\n\n`);
            res.end();
        });
    } catch (e) {
        res.status(500).json({ error: "Download failed" });
    }
  });


  // Direct download
  app.get("/api/download/:filename", (req, res) => {
    const filename = req.params.filename;
    const filePath = path.join(UPLOADS_DIR, filename);
    console.log(`Attempting to download: ${filePath}`);
    if (!fs.existsSync(filePath)) {
        console.error(`File not found: ${filePath}`);
        return res.status(404).json({ error: "File not found" });
    }
    res.download(filePath, filename, { dotfiles: 'allow' }, (err) => {
        if (err) {
            console.error("download error for " + filename, err);
            if (!res.headersSent) {
                res.status(500).json({ error: "Download failed" });
            }
        }
    });
  });

  // Proxy external downloads to bypass CORS on the frontend
  app.get("/api/proxy", async (req, res) => {
    const { url } = req.query;
    if (!url) return res.status(400).json({ error: "URL is required" });
    try {
      const response = await axios.get(String(url), { 
        responseType: 'stream',
        httpsAgent: ignoreSslAgent
      });
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Expose-Headers', 'Content-Length, Content-Type, Content-Disposition');
      res.setHeader('Content-Type', String(response.headers['content-type'] || 'application/octet-stream'));
      
      const contentLength = response.headers['content-length'];
      if (contentLength) {
        res.setHeader('Content-Length', String(contentLength));
      }
      
      response.data.pipe(res);
    } catch (e) {
      console.error("Proxy error:", e);
      res.status(500).json({ error: "Proxy failed" });
    }
  });

  app.get("/api/browser-proxy", async (req, res) => {
    const { url, injectJs, userAgent } = req.query;
    if (!url) return res.status(400).send("URL is required");

    let targetUrl = String(url);
    if (!targetUrl.startsWith("http://") && !targetUrl.startsWith("https://")) {
      targetUrl = "https://" + targetUrl;
    }

    try {
      const headers: Record<string, string> = {
        'User-Agent': String(userAgent || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36')
      };

      const response = await axios.get(targetUrl, {
        headers,
        timeout: 15000,
        responseType: 'arraybuffer',
        validateStatus: () => true,
        httpsAgent: ignoreSslAgent,
      });

      const contentType = String(response.headers['content-type'] || 'text/html');
      res.setHeader('Content-Type', contentType);
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('X-Frame-Options', 'ALLOWALL');

      if (contentType.includes('text/html')) {
        let html = Buffer.from(response.data).toString('utf-8');
        const urlObj = new URL(targetUrl);
        const baseHref = `${urlObj.protocol}//${urlObj.host}${urlObj.pathname}`;

        const baseTag = `<base href="${baseHref}">`;
        
        const hijackScript = `
          <script id="proxy-hijack-script">
            document.addEventListener('click', function(e) {
              const anchor = e.target.closest('a');
              if (anchor && anchor.href) {
                if (anchor.getAttribute('href') && anchor.getAttribute('href').startsWith('#')) return;
                e.preventDefault();
                window.parent.postMessage({ type: 'BROWSER_NAVIGATE', url: anchor.href }, '*');
              }
            });

            document.addEventListener('submit', function(e) {
              const form = e.target.closest('form');
              if (form) {
                e.preventDefault();
                const action = form.getAttribute('action') || '';
                const method = (form.getAttribute('method') || 'GET').toUpperCase();
                
                const formData = new FormData(form);
                const params = new URLSearchParams();
                for (const pair of formData.entries()) {
                  params.append(pair[0], String(pair[1]));
                }
                
                let actionUrl = action;
                if (!action.startsWith('http://') && !action.startsWith('https://')) {
                  actionUrl = new URL(action, "${baseHref}").href;
                }
                
                if (method === 'GET') {
                  const finalUrl = actionUrl + (actionUrl.includes('?') ? '&' : '?') + params.toString();
                  window.parent.postMessage({ type: 'BROWSER_NAVIGATE', url: finalUrl }, '*');
                } else {
                  window.parent.postMessage({ type: 'BROWSER_NAVIGATE', url: actionUrl }, '*');
                }
              }
            });
            console.log("[JS Proxy] Navigation interceptors loaded!");
          </script>
        `;

        let userInjectedScript = '';
        if (injectJs && injectJs !== 'undefined') {
          userInjectedScript = `
            <script id="proxy-user-script">
              try {
                ${decodeURIComponent(String(injectJs))}
              } catch (err) {
                console.error("[JS Proxy] Custom script error:", err);
              }
            </script>
          `;
        }

        if (html.toLowerCase().includes('<head>')) {
          html = html.replace(/<head>/i, '<head>' + baseTag + hijackScript + userInjectedScript);
        } else {
          html = baseTag + hijackScript + userInjectedScript + html;
        }

        return res.send(html);
      } else {
        return res.send(Buffer.from(response.data));
      }
    } catch (e) {
      console.error("Browser Proxy Error:", e);
      res.status(500).send("Browser Proxy Failed fetching target");
    }
  });

  app.patch("/api/rename", (req, res) => {
    try {
        const { oldName, newName, uid } = req.body;
        const oldPath = path.join(UPLOADS_DIR, oldName);
        const newPath = path.join(UPLOADS_DIR, newName);
        const oldMetaPath = oldPath + '.meta.json';
        const newMetaPath = newPath + '.meta.json';
        
        if (!fs.existsSync(oldPath)) return res.status(404).json({ error: "File not found" });
        
        if (fs.existsSync(oldMetaPath)) {
            const meta = JSON.parse(fs.readFileSync(oldMetaPath, 'utf8'));
            if (meta.uid !== uid) {
                return res.status(403).json({ error: "Forbidden: Not the owner" });
            }
        }

        fs.rename(oldPath, newPath, (err) => {
          if (err) return res.status(500).json({ error: "Rename failed" });
          
          try {
              if (fs.existsSync(oldMetaPath)) {
                fs.renameSync(oldMetaPath, newMetaPath);
              }
          } catch(e) {
              console.error(e);
          }
          
          res.json({ message: "File renamed" });
        });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: "Server error" });
    }
  });

  app.delete("/api/delete/:filename", (req, res) => {
    try {
        const filePath = path.join(UPLOADS_DIR, req.params.filename);
        const metaPath = filePath + '.meta.json';
        const { uid } = req.query;

        if (fs.existsSync(metaPath)) {
            const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
            if (meta.uid !== uid) {
                return res.status(403).json({ error: "Forbidden: Not the owner" });
            }
            try {
                fs.unlinkSync(metaPath);
            } catch(e) { console.error(e); }
        } 
        
        if (!fs.existsSync(filePath)) {
            return res.json({ message: "File already deleted or not present on local server" });
        }
        fs.unlink(filePath, (err) => {
          if (err) return res.status(500).json({ error: "Delete failed" });
          res.json({ message: "File deleted" });
        });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: "Server error" });
    }
  });

  const MIME_TYPES: Record<string, string> = {
    'jpg': 'image/jpeg',
    'jpeg': 'image/jpeg',
    'png': 'image/png',
    'gif': 'image/gif',
    'webp': 'image/webp',
    'svg': 'image/svg+xml',
    'mp4': 'video/mp4',
    'webm': 'video/webm',
    'mp3': 'audio/mpeg',
    'wav': 'audio/wav',
    'ogg': 'audio/ogg',
    'pdf': 'application/pdf',
    'html': 'text/html',
    'js': 'application/javascript',
    'css': 'text/css',
    'json': 'application/json',
    'txt': 'text/plain',
    'md': 'text/markdown',
  };

  app.get("/api/open/:filename", (req, res) => {
    const filename = req.params.filename;
    const filePath = path.join(UPLOADS_DIR, filename);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: "File not found" });
    }
    
    const ext = path.extname(filename).toLowerCase().replace('.', '');
    const isMedia = ['mp4', 'mov', 'avi', 'mkv', 'webm', 'ogg', 'mp3', 'wav'].includes(ext);
    
    if (isMedia) {
      res.sendFile(filePath, { dotfiles: 'allow' }, (err) => {
        if (err) {
          console.error("sendFile error for " + filename, err);
          if (!res.headersSent) {
            res.status(404).json({ error: "File not found" });
          }
        }
      });
    } else {
      const contentType = MIME_TYPES[ext] || 'application/octet-stream';
      res.setHeader('Content-Type', contentType);
      const stream = fs.createReadStream(filePath);
      stream.on('error', (err) => {
        console.error("Stream read error for " + filename, err);
        if (!res.headersSent) {
          res.status(500).json({ error: "Failed to stream file" });
        }
      });
      stream.pipe(res);
    }
  });

  app.post("/api/save/:filename", (req, res) => {
    try {
        const { content, uid } = req.body;
        const filename = req.params.filename;
        const filePath = path.join(UPLOADS_DIR, filename);
        const metaPath = filePath + '.meta.json';
        
        if (fs.existsSync(metaPath)) {
            const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
            if (meta?.uid && meta.uid !== uid) {
                return res.status(403).json({ error: "Forbidden: Not the owner of this file" });
            }
        }
        
        fs.writeFileSync(filePath, content);
        
        if (uid) {
            fs.writeFileSync(metaPath, JSON.stringify({ uid }));
        }
        
        const stats = fs.statSync(filePath);
        res.json({ 
          message: "File saved successfully", 
          size: stats.size, 
          mtime: stats.mtime 
        });
    } catch (e) {
        console.error("Save API Error:", e);
        res.status(500).json({ error: "Failed to save file content" });
    }
  });

  app.post("/api/camscan/ocr", async (req, res) => {
    try {
        const { imageBase64, mimeType } = req.body;
        if (!imageBase64) {
            return res.status(400).json({ error: "Image base64 data is required" });
        }
        
        if (!ai) {
            return res.json({ 
                warning: "API Key Gemini tidak terdeteksi. Silakan gunakan mode gambar/edit manual offline.", 
                words: [] 
            });
        }
        
        // Clean base64 data
        let cleanBase64 = imageBase64;
        if (cleanBase64.includes("base64,")) {
            cleanBase64 = cleanBase64.split("base64,")[1];
        }
        
        const response = await ai.models.generateContent({
            model: "gemini-1.5-flash",
            contents: {
                parts: [
                    {
                        inlineData: {
                            mimeType: mimeType || "image/jpeg",
                            data: cleanBase64
                        }
                    },
                    {
                        text: "Analyze this document/invoice/page image. Transcribe all words, lines, or structural text blocks that you see. For each text block or phrase, estimate its bounding box. Your output MUST be a JSON object containing an array of estimated text boxes, specified as percentages of the image size (from 0 to 100). Sorting the boxes from top to bottom. Use this exact JSON structure:\n\n{\n  \"words\": [\n    { \"text\": \"The detected text\", \"x\": 15.0, \"y\": 20.0, \"w\": 30.0, \"h\": 4.5 }\n  ]\n}\n\nReturn ONLY the valid JSON block without any markdown wrapping (no ```json code blocks)."
                    }
                ]
            },
            config: {
                responseMimeType: "application/json"
            }
        });
        
        const textResult = response.text || "{}";
        let ocrData;
        try {
            ocrData = JSON.parse(textResult.trim());
        } catch (parseErr) {
            console.warn("Retrying JSON parsing due to markdown wrapper:", textResult);
            const cleanedText = textResult.replace(/```json/gi, "").replace(/```/g, "").trim();
            ocrData = JSON.parse(cleanedText);
        }
        
        res.json(ocrData);
    } catch (err: any) {
        console.error("CamScan OCR Error:", err);
        res.status(500).json({ 
            error: "Gagal memproses OCR via AI", 
            details: err.message,
            words: [] 
        });
    }
  });

  app.post("/api/camscan/save-cloud", async (req, res) => {
    try {
        const { imageBase64, filename, uid } = req.body;
        if (!imageBase64) {
            return res.status(400).json({ error: "Image base64 is required" });
        }
        
        const name = filename || `Scan_${Date.now()}.png`;
        const filePath = path.join(UPLOADS_DIR, name);
        const metaPath = filePath + '.meta.json';
        
        let cleanBase64 = imageBase64;
        if (cleanBase64.includes("base64,")) {
            cleanBase64 = cleanBase64.split("base64,")[1];
        }
        
        const imageBuffer = Buffer.from(cleanBase64, "base64");
        fs.writeFileSync(filePath, imageBuffer);
        
        if (uid) {
            fs.writeFileSync(metaPath, JSON.stringify({ uid }));
        }
        
        res.json({ 
            message: "File saved to cloud successfully", 
            name: name,
            size: imageBuffer.length 
        });
    } catch (e: any) {
        console.error("Save cloud error:", e);
        res.status(500).json({ error: "Gagal menyimpan ke cloud: " + e.message });
    }
  });

  app.post("/api/camscan/save-docx", async (req, res) => {
    try {
        const { imageBase64, filename, textBlocks, uid } = req.body;
        if (!imageBase64) {
            return res.status(400).json({ error: "Image base64 is required" });
        }
        
        const name = filename || `Scan_${Date.now()}.docx`;
        const filePath = path.join(UPLOADS_DIR, name);
        const metaPath = filePath + '.meta.json';
        
        let cleanBase64 = imageBase64;
        if (cleanBase64.includes("base64,")) {
            cleanBase64 = cleanBase64.split("base64,")[1];
        }
        
        const imageBuffer = Buffer.from(cleanBase64, "base64");
        
        // Assemble docx sections
        const childrenElements: any[] = [
            new Paragraph({
                children: [
                    new ImageRun({
                        data: imageBuffer,
                        transformation: {
                            width: 500,
                            height: 650,
                        },
                        type: "png",
                        fallback: "png",
                    } as any),
                ],
            })
        ];
        
        // Append transcribed lines as searchable word doc components!
        if (textBlocks && Array.isArray(textBlocks) && textBlocks.length > 0) {
            childrenElements.push(new Paragraph({ text: "\n=== Teks Hasil Scan & Edit ===" }));
            for (const block of textBlocks) {
                if (block.text && block.text.trim()) {
                    childrenElements.push(
                        new Paragraph({
                            children: [
                                new TextRun({
                                    text: block.text,
                                    size: 24, // 12pt
                                }),
                            ],
                        })
                    );
                }
            }
        }
        
        const doc = new Document({
            sections: [
                {
                    properties: {},
                    children: childrenElements,
                },
            ],
        });
        
        const docBuffer = await Packer.toBuffer(doc);
        fs.writeFileSync(filePath, docBuffer);
        
        if (uid) {
            fs.writeFileSync(metaPath, JSON.stringify({ uid }));
        }
        
        res.json({ 
            message: "Office file saved successfully", 
            name: name,
            size: docBuffer.length 
        });
    } catch (e: any) {
        console.error("Save docx error:", e);
        res.status(500).json({ error: "Gagal menyimpan file Office: " + e.message });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'), (err) => {
        if (err) {
          console.error("dist index.html send file error:", err);
          if (!res.headersSent) {
            res.status(404).send("Page not found");
          }
        }
      });
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
