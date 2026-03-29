import { promises as fs } from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const CONFIG_PATH = path.join(ROOT, "claude-docs", "config.json");
const SYSTEM_PROMPT_PATH = path.join(ROOT, "claude-docs", "prompts", "user-docs-system.txt");

const parseArg = (name) => {
  const idx = process.argv.indexOf(name);
  if (idx === -1) return null;
  return process.argv[idx + 1] ?? null;
};

const hasFlag = (name) => process.argv.includes(name);

const ensureContext = async (config) => {
  const contextPath = path.join(ROOT, config.contextPath);
  try {
    await fs.access(contextPath);
    return contextPath;
  } catch {
    throw new Error(`Context file not found at ${config.contextPath}. Run: npm run claude:context`);
  }
};

const buildUserPrompt = (context, objective) => {
  return [
    `Objective: ${objective}`,
    "",
    "Use this project context to generate user documentation:",
    JSON.stringify(context, null, 2),
  ].join("\n");
};

const callClaude = async ({ apiKey, model, maxTokens, temperature, systemPrompt, userPrompt }) => {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      temperature,
      system: systemPrompt,
      messages: [
        {
          role: "user",
          content: userPrompt,
        },
      ],
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Claude API failed (${response.status}): ${text}`);
  }

  const data = await response.json();
  const textBlocks = (data.content ?? [])
    .filter((block) => block.type === "text")
    .map((block) => block.text);

  return textBlocks.join("\n\n").trim();
};

const main = async () => {
  const config = JSON.parse(await fs.readFile(CONFIG_PATH, "utf8"));
  const systemPrompt = await fs.readFile(SYSTEM_PROMPT_PATH, "utf8");
  const objective = parseArg("--objective") ?? "Create a complete user guide for this TPM tooling app.";
  const dryRun = hasFlag("--dry-run");

  const contextPath = await ensureContext(config);
  const context = JSON.parse(await fs.readFile(contextPath, "utf8"));
  const userPrompt = buildUserPrompt(context, objective);

  if (dryRun) {
    console.log("Dry run enabled. Prompt prepared; no API call made.");
    console.log(`Model: ${config.model}`);
    console.log(`Objective: ${objective}`);
    return;
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("Missing ANTHROPIC_API_KEY environment variable.");
  }

  const output = await callClaude({
    apiKey,
    model: process.env.CLAUDE_MODEL || config.model,
    maxTokens: Number(process.env.CLAUDE_MAX_TOKENS || config.maxTokens),
    temperature: Number(process.env.CLAUDE_TEMPERATURE || config.temperature),
    systemPrompt,
    userPrompt,
  });

  const outPath = path.join(ROOT, config.outputPath);
  await fs.mkdir(path.dirname(outPath), { recursive: true });
  await fs.writeFile(outPath, `${output}\n`, "utf8");

  console.log(`User documentation generated at ${config.outputPath}`);
};

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
