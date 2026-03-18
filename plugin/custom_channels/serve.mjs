import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const PORT = 3200;
const html = readFileSync(resolve("public/index.html"), "utf-8");

createServer((req, res) => {
  res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
  res.end(html);
}).listen(PORT, () => {
  console.log(`Preview: http://localhost:${PORT}`);
});
