import path from 'node:path';
import { GoogleGenAI } from '@google/genai';
import { createFixPullRequest, gatherGithubContext } from './github.js';
import { emailFixReport, resolveNotifyEmail } from './mailer.js';
import { applyLocalFiles, findLocalParseErrors } from './source.js';
import { getIssue, getProject, saveAgentResult, setAgentStatus } from './store.js';

const repoRoot = path.resolve(process.env.REPO_ROOT || path.join(process.cwd(), '..', '..'));
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const isRetryableAi = (error) => /UNAVAILABLE|503|high demand|RESOURCE_EXHAUSTED|429|overloaded/i.test(error?.message || String(error || ''));

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

function normalizePath(value) {
  return String(value || '').replace(/\\/g, '/').replace(/^\/+/, '');
}

function isPlausiblePatch(original, next) {
  const current = String(original || '');
  const updated = String(next || '');
  if (!updated.trim() || updated === current) return false;
  const originalLines = current.split('\n').map((line) => line.trim()).filter(Boolean);
  if (originalLines.length <= 12) return true;
  const updatedSet = new Set(updated.split('\n').map((line) => line.trim()).filter(Boolean));
  const kept = originalLines.filter((line) => updatedSet.has(line)).length;
  return kept / originalLines.length >= 0.45;
}

function selectPatchedFiles(aiFiles, contextFiles) {
  const allowed = new Map(contextFiles.map((file) => [file.path, file.contents]));
  const out = [];
  for (const file of Array.isArray(aiFiles) ? aiFiles : []) {
    const requested = normalizePath(file?.path);
    if (!requested || requested.includes('..') || requested.startsWith('pulse/incidents/')) continue;
    let target = allowed.has(requested) ? requested : null;
    if (!target) {
      const base = path.posix.basename(requested);
      target = [...allowed.keys()].find((item) => item === requested || item.endsWith(`/${base}`)) || null;
    }
    if (!target) continue;
    const contents = String(file.contents ?? file.content ?? '');
    if (!isPlausiblePatch(allowed.get(target), contents)) continue;
    if (out.some((item) => item.path === target)) continue;
    out.push({ path: target, contents });
  }
  return out;
}

async function analyzeWithGemini({ issue, event, contextFiles, repo, base }) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY missing');
  const preferred = (process.env.PRIMARY_GEMINI_MODEL || 'gemini-3.6-flash').replace(/^models\//, '');
  const models = [...new Set([preferred, 'gemini-3.6-flash', 'gemini-3.5-flash', 'gemini-flash-latest'])];
  const ai = new GoogleGenAI({ apiKey });
  const allowedPaths = contextFiles.map((file) => file.path);
  const prompt = `You are Pulse, a production incident agent.
The files below are the CURRENT contents of the client's GitHub branch \`${base}\` in \`${repo}\`.
Patch those files in place so the crash is fixed, then a pull request can be opened against that same base branch.

Return ONLY JSON:
{
  "summary": "one paragraph",
  "rootCause": "technical cause",
  "solution": "what you changed and why",
  "prTitle": "fix: ...",
  "prBody": "markdown PR description",
  "commitMessage": "fix: ...",
  "files": [{"path":"exact/path/from/the/list.js","contents":"full updated file contents"}]
}

Rules:
- Only edit these exact paths: ${JSON.stringify(allowedPaths)}
- Return the complete file contents, not a diff and not a snippet.
- Keep existing style, imports, comments, and unrelated logic.
- Change the smallest safe amount of code that fixes the crash.
- Do not add markdown, incident notes, or new files.
- If this is a SyntaxError and the stack only shows Node internals, inspect the provided source and repair the invalid JavaScript.
- If you cannot make a safe code fix, return files: [] and explain in solution.

Issue title: ${issue.title}
Culprit: ${issue.culprit || 'n/a'}
Level: ${issue.level}
URL: ${event.url || 'n/a'}
Environment: ${event.environment || 'n/a'}
Stack:
${event.stack || issue.title}

Client base-branch files:
${JSON.stringify(contextFiles.map((file) => ({ path: file.path, contents: file.contents.slice(0, 16000) })))}`;

  let lastError;
  for (const model of models) {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const response = await ai.models.generateContent({
          model,
          contents: prompt,
          config: { responseMimeType: 'application/json' },
        });
        return parseJsonObject(response.text || '');
      } catch (error) {
        lastError = error;
        if (!isRetryableAi(error) && !/NOT_FOUND|404/i.test(error?.message || '')) throw error;
        await sleep(1500 * (attempt + 1));
      }
    }
  }
  throw lastError;
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
    const localFiles = findLocalParseErrors(repoRoot, {
      release: event.release || event.release_name,
      cwd: event.extra?.cwd,
    });
    const github = await gatherGithubContext({
      stack: event.stack,
      culprit: issue.culprit,
      release: event.release || event.release_name,
      extra: event.extra,
      localFiles,
    });
    if (!github.ok) {
      agentError = github.reason || 'GitHub repo is not available';
    } else if (!github.files.length) {
      agentError = 'Could not match this stack to client source files.';
    } else {
      try {
        analysis = {
          ...analysis,
          ...(await analyzeWithGemini({
            issue,
            event,
            contextFiles: github.files,
            repo: github.repoFull,
            base: github.base,
          })),
        };
      } catch (error) {
        agentError = error.message || 'AI analysis failed';
        analysis = {
          ...analysis,
          summary: `Gemini could not complete the analysis: ${agentError}`,
          rootCause: issue.title,
          solution: 'Review the stack trace on the client base branch and re-run the agent after the model is available.',
        };
        logger?.error?.({ err: error }, 'Pulse AI analysis failed');
      }

      const files = selectPatchedFiles(analysis.files, github.files);
      if (files.length) {
        applyLocalFiles(repoRoot, files);
        const pr = await createFixPullRequest({
          branch: `pulse/fix-${issue.id}`.replace(/[^a-zA-Z0-9/_-]/g, '-').slice(0, 60),
          title: analysis.prTitle || `fix: ${issue.title}`.slice(0, 70),
          body: [
            analysis.prBody || analysis.solution || analysis.summary,
            '',
            `Tracked issue: ${issue.id}`,
            `Base branch: ${github.base}`,
            `Repo: ${github.repoFull}`,
            event.url ? `Error URL: ${event.url}` : '',
            '',
            'This PR applies the AI patch onto the current client base-branch files.',
          ].filter(Boolean).join('\n'),
          files,
        });
        if (pr.ok && pr.url) prUrl = pr.url;
        else if (pr.unchanged) {
          prUrl = current.pr_url || '';
          agentError = agentError || 'Code fix is ready locally. GitHub base already contains the same patch, so no new code diff was opened.';
        } else agentError = pr.reason || 'GitHub PR failed';
      } else {
        agentError = agentError || 'AI did not return a safe patch against the client source files.';
      }
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
    status: agentError && !prUrl && !analysis.summary ? 'failed' : 'done',
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
