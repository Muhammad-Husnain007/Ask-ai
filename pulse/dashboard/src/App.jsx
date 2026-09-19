import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, NavLink, Route, Routes, useNavigate, useParams } from 'react-router-dom';
import { Activity, AlertTriangle, Bot, CheckCircle2, CircleDot, GitPullRequest, Mail, Radio, Settings2, ShieldAlert } from 'lucide-react';
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { io } from 'socket.io-client';
import { createProject, getIssue, getIssues, getProjects, getStats, patchIssue, patchProject, runIssueAgent } from './api.js';

function timeAgo(iso) {
  if (!iso) return '';
  const seconds = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return `${Math.floor(seconds)}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

const levelClass = {
  fatal: 'bg-red-500/15 text-red-300 border-red-500/30',
  error: 'bg-orange-500/15 text-orange-300 border-orange-500/30',
  warning: 'bg-amber-500/15 text-amber-200 border-amber-500/30',
  info: 'bg-sky-500/15 text-sky-300 border-sky-500/30',
  debug: 'bg-zinc-500/15 text-zinc-300 border-zinc-500/30',
};

function Badge({ level }) {
  return (
    <span className={`rounded-md border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${levelClass[level] || levelClass.error}`}>
      {level || 'error'}
    </span>
  );
}

const agentClass = {
  running: 'bg-sky-500/15 text-sky-300 border-sky-500/30',
  done: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
  failed: 'bg-red-500/15 text-red-300 border-red-500/30',
  idle: 'bg-zinc-500/15 text-zinc-400 border-zinc-500/30',
};

function AgentPill({ status }) {
  const value = status || 'idle';
  return (
    <span className={`rounded-md border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${agentClass[value] || agentClass.idle}`}>
      {value === 'running' ? 'AI fixing' : value === 'done' ? 'AI done' : value === 'failed' ? 'AI failed' : 'AI idle'}
    </span>
  );
}

function usePulseLive(onEvent) {
  const callback = useRef(onEvent);
  callback.current = onEvent;
  useEffect(() => {
    const socket = io('http://127.0.0.1:8787', {
      path: '/realtime',
      transports: ['websocket', 'polling'],
    });
    socket.on('pulse:event', (payload) => callback.current(payload));
    socket.on('pulse:issue', (issue) => callback.current({ issue }));
    return () => socket.disconnect();
  }, []);
}

function Shell({ children, liveCount }) {
  return (
    <div className="min-h-screen bg-ink-950 text-zinc-100">
      <div className="flex min-h-screen">
        <aside className="w-60 shrink-0 border-r border-white/5 bg-ink-900 px-4 py-5">
          <div className="mb-8 flex items-center gap-3 px-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-orange-500 text-ink-950 shadow-[0_0_24px_rgba(249,115,22,.35)]">
              <ShieldAlert size={18} />
            </span>
            <div>
              <div className="text-sm font-bold tracking-tight">Pulse</div>
              <div className="text-[11px] text-zinc-500">Error command center</div>
            </div>
          </div>
          <nav className="space-y-1 text-sm">
            <NavLink to="/" end className={({ isActive }) => `flex items-center gap-2 rounded-lg px-3 py-2 ${isActive ? 'bg-white/8 text-white' : 'text-zinc-400 hover:bg-white/4 hover:text-white'}`}>
              <AlertTriangle size={16} /> Issues
            </NavLink>
            <NavLink to="/live" className={({ isActive }) => `flex items-center gap-2 rounded-lg px-3 py-2 ${isActive ? 'bg-white/8 text-white' : 'text-zinc-400 hover:bg-white/4 hover:text-white'}`}>
              <Radio size={16} /> Live
              {liveCount > 0 && <span className="ml-auto rounded-full bg-emerald-500/20 px-2 text-[10px] text-emerald-300">{liveCount}</span>}
            </NavLink>
            <NavLink to="/setup" className={({ isActive }) => `flex items-center gap-2 rounded-lg px-3 py-2 ${isActive ? 'bg-white/8 text-white' : 'text-zinc-400 hover:bg-white/4 hover:text-white'}`}>
              <Settings2 size={16} /> Setup / SDK
            </NavLink>
          </nav>
          <div className="mt-10 rounded-xl border border-emerald-500/20 bg-emerald-500/5 px-3 py-3 text-[11px] text-emerald-200/90">
            <div className="mb-1 flex items-center gap-2 font-semibold"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" /> Realtime on</div>
            New production errors stream in without refresh.
          </div>
        </aside>
        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </div>
  );
}

function IssuesPage({ refreshKey }) {
  const [issues, setIssues] = useState(null);
  const [stats, setStats] = useState(null);
  const [status, setStatus] = useState('open');
  const [q, setQ] = useState('');
  const [loadError, setLoadError] = useState('');

  useEffect(() => {
    let cancelled = false;
    const load = () => {
      getIssues({ status, q })
        .then((data) => { if (!cancelled) setIssues(data.issues || []); })
        .catch((error) => { if (!cancelled) { setIssues([]); setLoadError(error.message); } });
      getStats()
        .then((data) => { if (!cancelled) setStats(data.stats); })
        .catch(() => { if (!cancelled) setStats(null); });
    };
    load();
    const timer = setInterval(load, 4000);
    return () => { cancelled = true; clearInterval(timer); };
  }, [status, q]);

  const chartData = useMemo(() => (stats?.series || []).map((row) => ({
    hour: row.hour.slice(11, 16),
    count: row.count,
  })), [stats]);

  return (
    <div className="p-8">
      <div className="mb-8 flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Issues</h1>
          <p className="mt-1 text-sm text-zinc-500">Grouped production exceptions, live-updated.</p>
        </div>
        <div className="flex gap-2">
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search title or culprit" className="h-10 w-64 rounded-lg border border-white/10 bg-ink-800 px-3 text-sm outline-none focus:border-orange-400/50" />
          <select value={status} onChange={(e) => setStatus(e.target.value)} className="h-10 rounded-lg border border-white/10 bg-ink-800 px-3 text-sm">
            <option value="open">Open</option>
            <option value="resolved">Resolved</option>
            <option value="ignored">Ignored</option>
            <option value="all">All</option>
          </select>
        </div>
      </div>

      <div className="mb-8 grid grid-cols-3 gap-4">
        <StatCard label="Open issues" value={stats?.openIssues ?? '—'} icon={<CircleDot size={16} />} />
        <StatCard label="Events (24h)" value={stats?.events24h ?? '—'} icon={<Activity size={16} />} />
        <StatCard label="Users affected (24h)" value={stats?.users24h ?? '—'} icon={<AlertTriangle size={16} />} />
      </div>

      <div className="mb-6 h-40 rounded-2xl border border-white/8 bg-ink-900 p-4">
        <div className="mb-2 text-[11px] uppercase tracking-wider text-zinc-500">Event volume · 24h</div>
        <ResponsiveContainer width="100%" height="85%">
          <AreaChart data={chartData}>
            <defs>
              <linearGradient id="fill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#f97316" stopOpacity={0.35} />
                <stop offset="100%" stopColor="#f97316" stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis dataKey="hour" stroke="#52525b" fontSize={11} tickLine={false} axisLine={false} />
            <YAxis hide />
            <Tooltip contentStyle={{ background: '#161821', border: '1px solid #27272a', borderRadius: 12, fontSize: 12 }} />
            <Area type="monotone" dataKey="count" stroke="#fb923c" fill="url(#fill)" strokeWidth={2} />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <div className="overflow-hidden rounded-2xl border border-white/8">
        <table className="w-full text-left text-sm">
          <thead className="bg-ink-900 text-[11px] uppercase tracking-wider text-zinc-500">
            <tr>
              <th className="px-4 py-3">Issue</th>
              <th className="px-4 py-3">Level</th>
              <th className="px-4 py-3">AI</th>
              <th className="px-4 py-3">Events</th>
              <th className="px-4 py-3">Users</th>
              <th className="px-4 py-3">Last seen</th>
            </tr>
          </thead>
          <tbody>
            {issues === null && (
              <tr><td colSpan={6} className="px-4 py-12 text-center text-zinc-500">Loading issues…</td></tr>
            )}
            {issues && issues.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-12 text-center text-zinc-500">{loadError || 'No issues yet. Connected apps will appear here when they report errors.'}</td></tr>
            )}
            {(issues || []).map((issue) => (
              <tr key={issue.id} className="border-t border-white/5 bg-ink-900/40 hover:bg-white/[.03]">
                <td className="px-4 py-3">
                  <Link to={`/issues/${issue.id}`} className="block">
                    <div className="font-medium text-zinc-100">{issue.title}</div>
                    <div className="mt-0.5 font-mono text-[11px] text-zinc-500">{issue.culprit || issue.fingerprint}</div>
                  </Link>
                </td>
                <td className="px-4 py-3"><Badge level={issue.level} /></td>
                <td className="px-4 py-3"><AgentPill status={issue.agent_status} /></td>
                <td className="px-4 py-3 font-mono text-zinc-300">{issue.count}</td>
                <td className="px-4 py-3 font-mono text-zinc-300">{issue.user_count}</td>
                <td className="px-4 py-3 text-zinc-400">{timeAgo(issue.last_seen)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function StatCard({ label, value, icon }) {
  return (
    <div className="rounded-2xl border border-white/8 bg-ink-900 p-4">
      <div className="mb-3 flex items-center gap-2 text-[11px] uppercase tracking-wider text-zinc-500">{icon} {label}</div>
      <div className="text-3xl font-semibold tracking-tight">{value}</div>
    </div>
  );
}

function IssueDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [issue, setIssue] = useState(null);
  const [running, setRunning] = useState(false);

  const load = () => getIssue(id).then((data) => setIssue(data.issue)).catch(() => setIssue(null));
  useEffect(() => { load(); }, [id]);
  useEffect(() => {
    if (!issue || issue.agent_status !== 'running') return undefined;
    const timer = setInterval(load, 2500);
    return () => clearInterval(timer);
  }, [id, issue?.agent_status]);

  if (!issue) return <div className="p-8 text-zinc-500">Loading issue…</div>;
  const latest = issue.events?.[0];

  return (
    <div className="p-8">
      <button onClick={() => navigate('/')} className="mb-5 text-sm text-zinc-500 hover:text-white">← All issues</button>
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <div className="mb-2 flex items-center gap-2"><Badge level={issue.level} /><AgentPill status={issue.agent_status} /><span className="text-xs text-zinc-500">{issue.status}</span></div>
          <h1 className="max-w-3xl text-2xl font-semibold tracking-tight">{issue.title}</h1>
          <p className="mt-2 font-mono text-xs text-zinc-500">{issue.culprit}</p>
        </div>
        <div className="flex gap-2">
          {['open', 'resolved', 'ignored'].map((status) => (
            <button
              key={status}
              onClick={async () => { await patchIssue(issue.id, status); load(); }}
              className={`rounded-lg border px-3 py-2 text-xs capitalize ${issue.status === status ? 'border-orange-400/40 bg-orange-500/15 text-orange-200' : 'border-white/10 text-zinc-400 hover:bg-white/5'}`}
            >
              {status}
            </button>
          ))}
        </div>
      </div>

      <div className="mb-6 grid grid-cols-4 gap-3 text-sm">
        <Meta label="Events" value={issue.count} />
        <Meta label="Users" value={issue.user_count} />
        <Meta label="First seen" value={timeAgo(issue.first_seen)} />
        <Meta label="Last seen" value={timeAgo(issue.last_seen)} />
      </div>

      <section className="mb-5 rounded-2xl border border-orange-400/20 bg-orange-500/5 p-5">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="flex items-center gap-2 text-sm font-semibold"><Bot size={16} /> AI agent</h2>
          <button
            disabled={running || issue.agent_status === 'running'}
            onClick={async () => {
              setRunning(true);
              try {
                await runIssueAgent(issue.id);
                await load();
              } finally {
                setRunning(false);
              }
            }}
            className="rounded-lg border border-orange-400/30 px-3 py-1.5 text-xs text-orange-200 hover:bg-orange-500/10 disabled:opacity-50"
          >
            {issue.agent_status === 'running' || running ? 'Finding fix…' : 'Run AI fix'}
          </button>
        </div>
        <p className="mb-3 text-sm text-zinc-400">{issue.agent_summary || 'New error/fatal issues trigger the agent automatically. It writes a fix, opens a PR, and emails the address saved on this project in Setup.'}</p>
        {issue.agent_solution && (
          <pre className="mb-3 max-h-56 overflow-auto whitespace-pre-wrap rounded-xl bg-black/30 p-3 font-mono text-[12px] text-orange-100/90">{issue.agent_solution}</pre>
        )}
        <div className="flex flex-wrap gap-4 text-xs text-zinc-400">
          {issue.pr_url && (
            <a href={issue.pr_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-emerald-300 hover:underline">
              <GitPullRequest size={14} /> Open pull request
            </a>
          )}
          <span className="inline-flex items-center gap-1">
            <Mail size={14} />
            PR alerts: {issue.emailed_to || issue.notify_email || 'not set'}
            {issue.emailed_at ? ` · sent ${timeAgo(issue.emailed_at)}` : ''}
          </span>
        </div>
      </section>

      <div className="grid grid-cols-[1.3fr_.7fr] gap-5">
        <section className="rounded-2xl border border-white/8 bg-ink-900 p-5">
          <h2 className="mb-3 text-sm font-semibold">Stack trace</h2>
          <pre className="max-h-[420px] overflow-auto whitespace-pre-wrap font-mono text-[12px] leading-relaxed text-orange-100/90">{latest?.stack || 'No stack captured.'}</pre>
        </section>
        <section className="space-y-5">
          <div className="rounded-2xl border border-white/8 bg-ink-900 p-5 text-sm">
            <h2 className="mb-3 text-sm font-semibold">Context</h2>
            <Row k="URL" v={latest?.url} />
            <Row k="Environment" v={latest?.environment} />
            <Row k="Release" v={latest?.release} />
            <Row k="User" v={latest?.user?.email || latest?.user?.id || 'anonymous'} />
            <Row k="SDK" v={latest?.sdk} />
          </div>
          <div className="rounded-2xl border border-white/8 bg-ink-900 p-5">
            <h2 className="mb-3 text-sm font-semibold">Breadcrumbs</h2>
            <div className="max-h-64 space-y-2 overflow-auto text-xs">
              {(latest?.breadcrumbs || []).length === 0 && <div className="text-zinc-500">None</div>}
              {(latest?.breadcrumbs || []).map((crumb, index) => (
                <div key={index} className="rounded-lg bg-black/20 px-2 py-1.5 font-mono text-zinc-400">
                  <span className="text-zinc-500">{crumb.category}</span> · {crumb.message}
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

function Meta({ label, value }) {
  return (
    <div className="rounded-xl border border-white/8 bg-ink-900 px-4 py-3">
      <div className="text-[11px] uppercase tracking-wider text-zinc-500">{label}</div>
      <div className="mt-1 font-medium">{value}</div>
    </div>
  );
}

function Row({ k, v }) {
  return (
    <div className="border-b border-white/5 py-2 text-xs last:border-0">
      <div className="text-zinc-500">{k}</div>
      <div className="mt-0.5 break-all font-mono text-zinc-300">{v || '—'}</div>
    </div>
  );
}

function LivePage({ events }) {
  return (
    <div className="p-8">
      <h1 className="text-2xl font-semibold tracking-tight">Live tail</h1>
      <p className="mt-1 mb-6 text-sm text-zinc-500">Incoming production events, newest first.</p>
      <div className="space-y-2">
        {events.length === 0 && <div className="rounded-2xl border border-dashed border-white/10 p-10 text-center text-zinc-500">Waiting for the next crash…</div>}
        {events.map((item) => (
          <Link key={item.event.id} to={`/issues/${item.issue.id}`} className="flex items-start justify-between gap-4 rounded-xl border border-white/8 bg-ink-900 px-4 py-3 hover:border-orange-400/30">
            <div>
              <div className="flex items-center gap-2"><Badge level={item.issue.level} /><span className="font-medium">{item.event.message}</span></div>
              <div className="mt-1 font-mono text-[11px] text-zinc-500">{item.event.url || item.issue.culprit}</div>
            </div>
            <div className="text-xs text-zinc-500">{timeAgo(item.event.timestamp)}</div>
          </Link>
        ))}
      </div>
    </div>
  );
}

function SetupPage() {
  const [projects, setProjects] = useState([]);
  const [name, setName] = useState('Checkout API');
  const [notifyEmail, setNotifyEmail] = useState('hasnainilyas007@gmail.com');
  const [drafts, setDrafts] = useState({});
  const [status, setStatus] = useState('');
  const [selected, setSelected] = useState(null);

  const refresh = async () => {
    const data = await getProjects();
    const list = data.projects || [];
    setProjects(list);
    setDrafts(Object.fromEntries(list.map((project) => [project.id, project.notify_email || ''])));
    setSelected((current) => current || list[0] || null);
    return list;
  };

  useEffect(() => {
    refresh().catch(() => setProjects([]));
  }, []);

  const active = selected || projects[0];
  const origin = typeof window !== 'undefined' ? window.location.origin : 'http://127.0.0.1:5173';
  const localDsn = `http://127.0.0.1:8787/ingest/${active?.public_key || 'pk_live_demo_pulse'}`;
  const dashboardDsn = `${origin}/ingest/${active?.public_key || 'pk_live_demo_pulse'}`;
  const snippet = `import { init, captureException } from '@pulse/sdk';

init({
  dsn: '${localDsn}',
  environment: 'production', // or 'local'
  release: '1.0.0',
  user: { id: 'u_42', email: 'dev@company.com' },
});

try {
  riskyWork();
} catch (error) {
  captureException(error);
}`;

  return (
    <div className="p-8">
      <h1 className="text-2xl font-semibold tracking-tight">Setup</h1>
      <p className="mt-1 mb-8 max-w-3xl text-sm text-zinc-500">Add Pulse to any local or production app with the project DSN. When an error arrives, the AI agent opens a PR and emails the address saved on that project.</p>

      <div className="mb-6 grid gap-4 md:grid-cols-2">
        <div className="rounded-2xl border border-white/8 bg-ink-900 p-5 text-sm">
          <h2 className="mb-2 font-semibold">Local app</h2>
          <p className="mb-3 text-zinc-500">Keep Pulse API on this machine. Point the SDK at localhost.</p>
          <code className="block break-all rounded-lg bg-black/30 px-3 py-2 font-mono text-[12px] text-orange-200">{localDsn}</code>
        </div>
        <div className="rounded-2xl border border-white/8 bg-ink-900 p-5 text-sm">
          <h2 className="mb-2 font-semibold">Production app</h2>
          <p className="mb-3 text-zinc-500">Deploy Pulse, then replace the host. Same project key works.</p>
          <code className="block break-all rounded-lg bg-black/30 px-3 py-2 font-mono text-[12px] text-orange-200">https://pulse.yourdomain.com/ingest/{active?.public_key || 'pk_live_demo_pulse'}</code>
        </div>
      </div>

      <pre className="mb-8 overflow-auto rounded-2xl border border-white/8 bg-ink-900 p-5 font-mono text-[12px] leading-relaxed text-zinc-300">{snippet}</pre>

      <div className="rounded-2xl border border-white/8 bg-ink-900 p-5">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold">Projects, DSN keys, PR email</h2>
            <p className="mt-1 text-xs text-zinc-500">Each project has its own DSN and the inbox that receives the AI fix / PR email. Comma-separated emails are allowed.</p>
          </div>
          <button
            onClick={async () => {
              try {
                const created = await createProject(name, notifyEmail);
                const list = await refresh();
                setSelected(created.project || list.find((item) => item.public_key === created.project?.public_key) || list[0]);
                setStatus('Project created');
              } catch (error) {
                setStatus(error.message);
              }
            }}
            className="rounded-lg bg-white/10 px-3 py-1.5 text-xs hover:bg-white/15"
          >
            Create project
          </button>
        </div>
        <div className="mb-4 grid gap-3 md:grid-cols-2">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Project name" className="h-9 w-full rounded-lg border border-white/10 bg-ink-800 px-3 text-sm" />
          <input value={notifyEmail} onChange={(e) => setNotifyEmail(e.target.value)} placeholder="PR alert email" className="h-9 w-full rounded-lg border border-white/10 bg-ink-800 px-3 text-sm" />
        </div>
        {status && <div className="mb-3 text-xs text-emerald-300">{status}</div>}
        <div className="space-y-3 text-sm">
          {projects.map((project) => (
            <div
              key={project.id}
              className={`rounded-xl border px-3 py-3 ${selected?.id === project.id ? 'border-orange-400/40 bg-orange-500/5' : 'border-white/8 bg-black/20'}`}
            >
              <button type="button" onClick={() => setSelected(project)} className="mb-2 flex w-full items-center justify-between text-left">
                <span className="font-medium">{project.name}</span>
                <code className="font-mono text-[11px] text-orange-200">{project.public_key}</code>
              </button>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[11px] uppercase tracking-wider text-zinc-500">PR email</span>
                <input
                  value={drafts[project.id] ?? project.notify_email ?? ''}
                  onChange={(e) => setDrafts((current) => ({ ...current, [project.id]: e.target.value }))}
                  onClick={(e) => e.stopPropagation()}
                  className="h-8 min-w-[240px] flex-1 rounded-lg border border-white/10 bg-ink-800 px-3 text-xs"
                  placeholder="you@company.com"
                />
                <button
                  onClick={async (event) => {
                    event.stopPropagation();
                    try {
                      const data = await patchProject(project.id, { notifyEmail: drafts[project.id] });
                      await refresh();
                      setSelected(data.project);
                      setStatus(`PR emails for ${data.project.name} go to ${data.project.notify_email}`);
                    } catch (error) {
                      setStatus(error.message);
                    }
                  }}
                  className="rounded-lg bg-orange-500 px-3 py-1.5 text-xs font-semibold text-ink-950 hover:bg-orange-400"
                >
                  Save email
                </button>
              </div>
              <div className="mt-2 break-all font-mono text-[11px] text-zinc-500">Dashboard ingest: {dashboardDsn.replace(active?.public_key || '', project.public_key)}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const [liveEvents, setLiveEvents] = useState([]);
  const [refreshKey, setRefreshKey] = useState(0);

  usePulseLive((payload) => {
    if (payload?.event) {
      setLiveEvents((current) => [payload, ...current].slice(0, 50));
    }
    setRefreshKey((value) => value + 1);
  });

  return (
    <Shell liveCount={liveEvents.length}>
      <Routes>
        <Route path="/" element={<IssuesPage />} />
        <Route path="/issues/:id" element={<IssueDetail />} />
        <Route path="/live" element={<LivePage events={liveEvents} />} />
        <Route path="/setup" element={<SetupPage />} />
      </Routes>
    </Shell>
  );
}
