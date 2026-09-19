import { Octokit } from '@octokit/rest';

export async function createFixPullRequest({ branch, title, body, files }) {
  const token = process.env.GITHUB_TOKEN;
  const repoFull = process.env.GITHUB_REPO || 'Muhammad-Husnain007/Ask-ai';
  if (!token) return { ok: false, reason: 'GITHUB_TOKEN missing' };
  if (!repoFull || !repoFull.includes('/')) return { ok: false, reason: 'GITHUB_REPO must be owner/name' };
  if (!files?.length) return { ok: false, reason: 'No files to commit' };

  const [owner, repo] = repoFull.split('/');
  const octokit = new Octokit({ auth: token });
  const { data: repoData } = await octokit.repos.get({ owner, repo });
  const base = process.env.GITHUB_BASE_BRANCH || repoData.default_branch;
  const { data: baseRef } = await octokit.git.getRef({ owner, repo, ref: `heads/${base}` });

  try {
    await octokit.git.createRef({
      owner,
      repo,
      ref: `refs/heads/${branch}`,
      sha: baseRef.object.sha,
    });
  } catch (error) {
    if (error.status !== 422) throw error;
  }

  for (const file of files) {
    let sha;
    try {
      const existing = await octokit.repos.getContent({ owner, repo, path: file.path, ref: branch });
      if (!Array.isArray(existing.data)) sha = existing.data.sha;
    } catch {
      sha = undefined;
    }
    await octokit.repos.createOrUpdateFileContents({
      owner,
      repo,
      path: file.path,
      branch,
      message: title.slice(0, 80),
      content: Buffer.from(file.contents, 'utf8').toString('base64'),
      sha,
    });
  }

  const pr = await octokit.pulls.create({
    owner,
    repo,
    title,
    head: branch,
    base,
    body,
  });

  return { ok: true, url: pr.data.html_url, number: pr.data.number };
}
