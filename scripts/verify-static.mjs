import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { resolve, extname, relative } from "node:path";
import { chromium } from "@playwright/test";
const root = resolve("dist");
const types = {
  ".html": "text/html",
  ".js": "application/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".svg": "image/svg+xml",
};
const server = createServer(async (req, res) => {
  const pathname = decodeURIComponent(
    new URL(req.url, "http://localhost").pathname,
  );
  if (!pathname.startsWith("/EvoTrack/")) {
    res.writeHead(404).end();
    return;
  }
  const path = resolve(
    root,
    pathname.slice("/EvoTrack/".length) || "index.html",
  );
  if (relative(root, path).startsWith("..")) {
    res.writeHead(403).end();
    return;
  }
  try {
    res.writeHead(200, {
      "Content-Type": types[extname(path)] ?? "application/octet-stream",
    });
    res.end(await readFile(path));
  } catch {
    res.writeHead(404).end();
  }
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const browser = await chromium.launch();
try {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
  });
  const errors = [];
  const external = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("request", (r) => {
    if (!r.url().startsWith("http://127.0.0.1:")) external.push(r.url());
  });
  const url = `http://127.0.0.1:${server.address().port}/EvoTrack/`;
  await page.goto(url);
  await page.getByRole("heading", { name: "학습 실험실" }).waitFor();
  await page.getByLabel("현재 맵").selectOption("r-straight");
  await page
    .getByRole("button", { name: "Genetic Algorithm", exact: false })
    .click();
  await page.getByLabel("개체군 크기", { exact: true }).fill("4");
  await page.getByLabel("에피소드 최대 스텝", { exact: true }).fill("60");
  await page.getByRole("button", { name: "학습 시작", exact: true }).click();
  await page.waitForFunction(
    () => document.querySelector(".metric-card strong")?.textContent !== "—",
  );
  await page.getByRole("button", { name: "학습 중지", exact: true }).click();
  await page
    .getByRole("button", { name: "맵 라이브러리", exact: false })
    .click();
  await page.reload();
  await page.getByRole("heading", { name: "맵 라이브러리" }).waitFor();
  if ((await page.locator(".map-card").count()) !== 9)
    throw Error("Static map library did not load");
  if (errors.length || external.length)
    throw Error(JSON.stringify({ errors, external }));
  console.log(
    JSON.stringify({
      result: "PASS",
      mount: "/EvoTrack/",
      checks: [
        "relative assets",
        "bundled GA Worker",
        "training snapshot",
        "hash route refresh",
        "9 built-in maps",
        "no external requests",
        "no browser errors",
      ],
    }),
  );
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
