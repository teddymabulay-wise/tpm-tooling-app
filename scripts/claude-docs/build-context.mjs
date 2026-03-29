import { promises as fs } from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const CONFIG_PATH = path.join(ROOT, "claude-docs", "config.json");

const globToRegex = (glob) => {
  const escaped = glob.replace(/[.+^${}()|[\]\\]/g, "\\$&");
  const withDoubleStarDirs = escaped.replace(/\/\*\*\//g, "(?:\\/(?:.*\\/)?)?");
  const withDoubleStar = withDoubleStarDirs.replace(/\*\*/g, ".*");
  const withSingleStar = withDoubleStar.replace(/\*/g, "[^/]*");
  return new RegExp(`^${withSingleStar}$`);
};

const toPosix = (value) => value.split(path.sep).join("/");

const walk = async (dir) => {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files = await Promise.all(entries.map(async (entry) => {
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) return walk(abs);
    return [abs];
  }));
  return files.flat();
};

const pickFiles = async (config) => {
  const allFiles = (await walk(path.join(ROOT, "src"))).map((abs) => ({
    abs,
    rel: toPosix(path.relative(ROOT, abs)),
  }));

  const includeRegexes = (config.includeGlobs ?? []).map(globToRegex);
  const excludeRegexes = (config.excludeGlobs ?? []).map(globToRegex);

  return allFiles
    .filter((f) => includeRegexes.some((rx) => rx.test(f.rel)))
    .filter((f) => !excludeRegexes.some((rx) => rx.test(f.rel)));
};

const parseRoutes = (appTsx) => {
  const routeRegex = /<Route\s+path="([^"]+)"\s+element={<([^>]+)>}\s*\/>/g;
  const routes = [];
  let match;
  while ((match = routeRegex.exec(appTsx)) !== null) {
    routes.push({ path: match[1], component: match[2] });
  }
  return routes;
};

const summarizeFile = (rel, content) => {
  const lines = content.split("\n");
  const exported = lines
    .filter((line) => line.includes("export default function") || line.includes("export function") || line.includes("export const"))
    .map((line) => line.trim());

  return {
    path: rel,
    size: content.length,
    exports: exported.slice(0, 10),
  };
};

const main = async () => {
  const config = JSON.parse(await fs.readFile(CONFIG_PATH, "utf8"));
  const files = await pickFiles(config);
  const appPath = path.join(ROOT, "src", "App.tsx");
  const sidebarPath = path.join(ROOT, "src", "components", "AppSidebar.tsx");

  const appTsx = await fs.readFile(appPath, "utf8");
  const sidebarTsx = await fs.readFile(sidebarPath, "utf8");

  const routes = parseRoutes(appTsx);
  const fileSummaries = [];

  for (const file of files) {
    const content = await fs.readFile(file.abs, "utf8");
    fileSummaries.push(summarizeFile(file.rel, content));
  }

  const context = {
    generatedAt: new Date().toISOString(),
    project: {
      name: config.projectName,
      audience: config.audience,
    },
    routes,
    sidebarSnippet: sidebarTsx.slice(0, 6000),
    files: fileSummaries,
  };

  const outPath = path.join(ROOT, config.contextPath);
  await fs.mkdir(path.dirname(outPath), { recursive: true });
  await fs.writeFile(outPath, JSON.stringify(context, null, 2), "utf8");

  console.log(`Context written to ${toPosix(path.relative(ROOT, outPath))}`);
  console.log(`Routes captured: ${routes.length}`);
  console.log(`Files summarized: ${fileSummaries.length}`);
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
