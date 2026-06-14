const http = require("http");

function checkUrl(url) {
  return new Promise((resolve) => {
    http.get(url, (res) => {
      let data = "";
      res.on("data", (chunk) => { if (data.length < 200) data += chunk; });
      res.on("end", () => resolve({ status: res.statusCode, contentType: res.headers["content-type"], bodyPreview: data.substring(0, 100) }));
    }).on("error", (e) => resolve({ error: e.message }));
  });
}

(async () => {
  const urls = [
    "http://localhost:5182/textures/assets/qp_weapon/models/bow/dark.json",
    "http://localhost:5182/textures/assets/qp_weapon/textures/bow/dark.png",
  ];
  for (const url of urls) {
    const result = await checkUrl(url);
    console.log(url.split("/").pop() + ":", result.status || result.error, result.contentType || "", result.bodyPreview ? result.bodyPreview.substring(0, 60) : "");
  }
})();
