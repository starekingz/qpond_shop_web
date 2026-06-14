const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = 3456;
const BASE = path.join(__dirname, "public", "textures");

const server = http.createServer((req, res) => {
  if (req.url === "/") {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(`<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Texture Test</title></head>
<body>
<h2>Texture Test</h2>
<p>qp_item necklace yellow (64x64):</p>
<img src="/tex/assets/qp_item/textures/equipment/necklace/yellow.png" width="64" height="64" style="image-rendering:pixelated;border:2px solid red" />
<p>minecraft paper (64x64):</p>
<img src="/tex/assets/minecraft/textures/item/paper.png" width="64" height="64" style="image-rendering:pixelated;border:2px solid green" />
<p>minecraft diamond (64x64):</p>
<img src="/tex/assets/minecraft/textures/item/diamond.png" width="64" height="64" style="image-rendering:pixelated;border:2px solid blue" />
</body></html>`);
    return;
  }

  if (req.url.startsWith("/tex/")) {
    const filePath = path.join(BASE, req.url.slice(5));
    if (fs.existsSync(filePath)) {
      const data = fs.readFileSync(filePath);
      res.writeHead(200, { "Content-Type": "image/png", "Content-Length": data.length });
      res.end(data);
    } else {
      res.writeHead(404);
      res.end("Not found: " + filePath);
    }
    return;
  }

  res.writeHead(404);
  res.end("Not found");
});

server.listen(PORT, "127.0.0.1", () => {
  console.log("Test server: http://localhost:" + PORT);
});
