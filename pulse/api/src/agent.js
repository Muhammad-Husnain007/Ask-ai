import path from 'node:path';
import { GoogleGenAI } from '@google/genai';
import { createFixPullRequest, gatherGithubContext } from './github.js';
import { emailFixReport, resolveNotifyEmail } from './mailer.js';
import { applyAiFilePatch, applyLocalFiles, fallbackReferenceErrorFix, findLocalParseErrors, findStackLocalFiles } from './source.js';
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

function fixedIssueName(title) {
  const slug = String(title || 'issue')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'issue';
  return `fixed/${slug}`;
}

function stackFocus(issue, event) {
  const text = `${issue.culprit || ''}\n${event.stack || ''}`;
  const match = text.match(/([^/\\]+\.(?:js|jsx|mjs|cjs)):(\d+)(?::\d+)?/i);
  if (!match) return 'Change only the crashing line or the smallest unique snippet.';
  return `The crash points at ${match[1]} line ${match[2]}. Edit only that line or the smallest unique snippet around it.`;
}

function selectPatchedFiles(aiFiles, contextFiles) {
  const allowed = new Map(contextFiles.map((file) => [file.path, file]));
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
    const context = allowed.get(target);
    const localPatched = applyAiFilePatch(context.contents, file);
    if (!localPatched) continue;
    const githubPatched = applyAiFilePatch(context.githubContents || context.contents, file);
    if (out.some((item) => item.path === target)) continue;
    out.push({
      path: target,
      contents: localPatched,
      githubContents: githubPatched || context.githubContents || localPatched,
    });
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
The files below are the current source that crashed.
${stackFocus(issue, event)}
A pull request will be opened against GitHub \`${repo}\` branch \`${base}\`.

Return ONLY JSON:
{
  "summary": "one paragraph",
  "rootCause": "technical cause",
  "solution": "what you changed and why",
  "prBody": "markdown PR description",
  "files": [{
    "path": "exact/path/from/the/list.js",
    "edits": [{ "old": "exact original snippet copied from the file", "new": "the same snippet with only the bug fixed" }]
  }]
}

Rules:
- Only edit these exact paths: ${JSON.stringify(allowedPaths)}
- Do NOT return full file contents. Return tiny search/replace edits only.
- "old" must match the file text exactly, including spaces.
- Change only the failing line or the smallest unique snippet. One or two edits is enough.
- Do not reformat, rename unrelated symbols, reorder imports, or rewrite the rest of the file.
- Do not add markdown, incident notes, or new files.
- Pulse will name the pull request fixed/issue-name from the issue title.
- If you cannot make a safe one-line/small-hunk fix, return files: [] and explain in solution.

Issue title: ${issue.title}
Culprit: ${issue.culprit || 'n/a'}
Level: ${issue.level}
URL: ${event.url || 'n/a'}
Environment: ${event.environment || 'n/a'}
Stack:
${event.stack || issue.title}

Client source files:
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
    prTitle: fixedIssueName(issue.title),
    prBody: '',
  };
  let prUrl = '';
  let agentError = '';

  try {
    const localFiles = [
      ...findStackLocalFiles(repoRoot, {
        stack: event.stack,
        culprit: issue.culprit,
        extra: event.extra,
        release: event.release || event.release_name,
      }),
      ...findLocalParseErrors(repoRoot, {
        release: event.release || event.release_name,
        cwd: event.extra?.cwd,
      }),
    ].filter((file, index, all) => all.findIndex((item) => item.path === file.path) === index);
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

      let files = selectPatchedFiles(analysis.files, github.files);
      if (!files.length) files = fallbackReferenceErrorFix(issue, github.files);
      if (files.length) {
        applyLocalFiles(repoRoot, files);
        const prName = fixedIssueName(issue.title);
        const pr = await createFixPullRequest({
          branch: prName,
          title: prName,
          body: [
            analysis.prBody || analysis.solution || analysis.summary,
            '',
            `Tracked issue: ${issue.id}`,
            `Base branch: ${github.base}`,
            `Repo: ${github.repoFull}`,
            event.url ? `Error URL: ${event.url}` : '',
            '',
            'This PR changes only the crashing snippet on the client base-branch files.',
          ].filter(Boolean).join('\n'),
          files,
        });
        if (pr.ok && pr.url) prUrl = pr.url;
        else if (pr.unchanged) {
          analysis.solution = [
            analysis.solution,
            'Local crashing file was patched. GitHub base already has the same code, so no new PR diff was created.',
          ].filter(Boolean).join('\n\n');
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
