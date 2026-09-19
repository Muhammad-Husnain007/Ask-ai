import fs from 'node:fs';
import path from 'node:path';
import { GoogleGenAI } from '@google/genai';
import { createFixPullRequest } from './github.js';
import { emailFixReport, resolveNotifyEmail } from './mailer.js';
import { getIssue, getProject, saveAgentResult, setAgentStatus } from './store.js';

const repoRoot = path.resolve(process.env.REPO_ROOT || path.join(process.cwd(), '..', '..'));

function parseJsonObject(raw) {
  const cleaned = String(raw || '')
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start === -1 || end <= start) throw new Error('AI did not return JSON');
  return JSON.parse(cleaned.slice(start, end + 1));
}

function stackPaths(stack) {
  const matches = String(stack || '').match(/[A-Za-z0-9_./\\-]+\.(?:js|jsx|ts|tsx|mjs|cjs)/g) || [];
  return [...new Set(matches.map((item) => item.replace(/\\/g, '/')))].slice(0, 6);
}

function resolveLocalFile(relOrName) {
  const normalized = relOrName.replace(/\\/g, '/').replace(/^\/+/, '');
  const direct = path.resolve(repoRoot, normalized);
  if (direct.startsWith(repoRoot) && fs.existsSync(direct) && fs.statSync(direct).isFile()) {
    return { path: path.relative(repoRoot, direct).replace(/\\/g, '/'), abs: direct };
  }
  const base = path.basename(normalized);
  const queue = [repoRoot];
  const skip = new Set(['node_modules', '.git', 'dist', 'data']);
  while (queue.length) {
    const dir = queue.shift();
    let entries = [];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (skip.has(entry.name)) continue;
      const abs = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        queue.push(abs);
      } else if (entry.name === base) {
        return { path: path.relative(repoRoot, abs).replace(/\\/g, '/'), abs };
      }
    }
  }
  return null;
}

function gatherContext(stack, culprit) {
  const names = [...stackPaths(stack), culprit || ''].filter(Boolean);
  const files = [];
  for (const name of names) {
    const found = resolveLocalFile(name);
    if (!found) continue;
    if (files.some((file) => file.path === found.path)) continue;
    const contents = fs.readFileSync(found.abs, 'utf8').slice(0, 20_000);
    files.push({ path: found.path, contents });
    if (files.length >= 4) break;
  }
  return files;
}

function safeFiles(files) {
  if (!Array.isArray(files)) return [];
  return files.slice(0, 5).map((file) => {
    const rel = String(file?.path || '').replace(/\\/g, '/').replace(/^\/+/, '');
    if (!rel || rel.includes('..') || rel.startsWith('.git/')) return null;
    const abs = path.resolve(repoRoot, rel);
    if (!abs.startsWith(repoRoot)) return null;
    const contents = String(file.contents ?? file.content ?? '');
    if (!contents || contents.length > 200_000) return null;
    return { path: rel, abs, contents };
  }).filter(Boolean);
}

function applyLocalFiles(files) {
  for (const file of files) {
    fs.mkdirSync(path.dirname(file.abs), { recursive: true });
    fs.writeFileSync(file.abs, file.contents, 'utf8');
  }
}

async function analyzeWithGemini({ issue, event, contextFiles }) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY missing');
  const ai = new GoogleGenAI({ apiKey });
  const model = (process.env.PRIMARY_GEMINI_MODEL || 'gemini-3.6-flash').replace(/^models\//, '');
  const prompt = `You are Pulse, a production incident agent.
Given a runtime error, find the root cause and implement a minimal, safe code fix.

Return ONLY JSON:
{
  "summary": "one paragraph",
  "rootCause": "technical cause",
  "solution": "what you changed and why",
  "prTitle": "fix: ...",
  "prBody": "markdown PR description",
  "commitMessage": "fix: ...",
  "files": [{"path":"relative/from/repo/root.js","contents":"full file contents"}]
}

Rules:
- Prefer a real code fix in existing files when context is provided.
- If this looks like a deliberate test/demo error, or you cannot locate production code, return files: [] and still explain the fix.
- Never include markdown fences.
- Keep the change small. Do not remove unrelated features.

Issue title: ${issue.title}
Culprit: ${issue.culprit || 'n/a'}
Level: ${issue.level}
URL: ${event.url || 'n/a'}
Environment: ${event.environment || 'n/a'}
Stack:
${event.stack || issue.title}

Existing files:
${JSON.stringify(contextFiles.map((file) => ({ path: file.path, contents: file.contents.slice(0, 12000) })))}`;

  const response = await ai.models.generateContent({
    model,
    contents: prompt,
    config: { responseMimeType: 'application/json' },
  });
  return parseJsonObject(response.text || '');
}

export async function runFixAgent({ issue, event, logger, io, force = false, project = null }) {
  if (!['error', 'fatal'].includes(issue.level || event.level || 'error')) return null;
  const current = getIssue(issue.id) || issue;
  const owner = project || getProject(current.project_id);
  const mailTo = resolveNotifyEmail(owner, current);
  if (!force && current.agent_status === 'running') return current;
  if (!force && current.agent_status === 'done' && current.pr_url) return current;

  setAgentStatus(issue.id, 'running');
  io?.emit('pulse:issue', { ...current, agent_status: 'running' });

  let analysis = {
    summary: '',
    rootCause: '',
    solution: '',
    prTitle: `fix: ${issue.title}`.slice(0, 70),
    prBody: '',
  };
  let prUrl = '';
  let agentError = '';

  try {
    const contextFiles = gatherContext(event.stack, issue.culprit);
    try {
      analysis = { ...analysis, ...(await analyzeWithGemini({ issue, event, contextFiles })) };
    } catch (error) {
      agentError = error.message || 'AI analysis failed';
      analysis = {
        ...analysis,
        summary: `Gemini could not complete the analysis: ${agentError}`,
        rootCause: issue.title,
        solution: 'Review the stack trace, add a guard or retry around the failing call, and re-run the agent after GEMINI_API_KEY is set.',
      };
      logger?.error?.({ err: error }, 'Pulse AI analysis failed');
    }
    const files = safeFiles(analysis.files);
    if (!files.length && (analysis.solution || analysis.summary || analysis.rootCause)) {
      const rel = `pulse/incidents/${issue.id}.md`;
      files.push({
        path: rel,
        abs: path.resolve(repoRoot, rel),
        contents: [
          `# ${issue.title}`,
          '',
          `Tracked issue: \`${issue.id}\``,
          '',
          '## Root cause',
          '',
          analysis.rootCause || 'See solution below.',
          '',
          '## Solution',
          '',
          analysis.solution || analysis.summary || 'No solution generated.',
        ].join('\n'),
      });
    }
    if (files.length) {
      applyLocalFiles(files);
      const pr = await createFixPullRequest({
        branch: `pulse/fix-${issue.id}`.replace(/[^a-zA-Z0-9/_-]/g, '-').slice(0, 60),
        title: analysis.prTitle || `fix: ${issue.title}`.slice(0, 70),
        body: [
          analysis.prBody || analysis.solution || analysis.summary,
          '',
          `Tracked issue: ${issue.id}`,
          event.url ? `Error URL: ${event.url}` : '',
        ].filter(Boolean).join('\n'),
        files,
      });
      if (pr.ok) prUrl = pr.url;
      else agentError = pr.reason;
    } else {
      agentError = agentError || 'No production files were changed. Solution is advisory.';
    }
  } catch (error) {
    agentError = error.message || 'AI agent failed';
    logger?.error?.({ err: error }, 'Pulse AI agent failed');
  }

  let emailedAt = null;
  let emailedTo = '';
  try {
    const mailed = await emailFixReport({
      issue: { ...current, project_name: owner?.name || current.project_name },
      event,
      analysis,
      prUrl,
      error: agentError,
      to: mailTo,
    });
    if (mailed.ok) {
      emailedAt = new Date().toISOString();
      emailedTo = mailed.to;
    } else if (!agentError) agentError = mailed.reason;
  } catch (error) {
    agentError = [agentError, error.message].filter(Boolean).join(' · ');
  }

  const saved = saveAgentResult(issue.id, {
    status: agentError && !analysis.summary ? 'failed' : 'done',
    summary: analysis.summary || analysis.rootCause || '',
    solution: [analysis.rootCause, analysis.solution, agentError].filter(Boolean).join('\n\n'),
    prUrl,
    emailedAt,
    emailedTo,
  });
  io?.emit('pulse:issue', saved);
  return saved;
}

export function shouldRunAgent(result) {
  const level = result.event?.level || result.issue?.level;
  if (!['error', 'fatal'].includes(level)) return false;
  if (!result.isNew && !result.reopened) return false;
  if (result.issue?.agent_status === 'running') return false;
  if (result.issue?.agent_status === 'done' && result.issue?.pr_url && !result.reopened) return false;
  return true;
}
