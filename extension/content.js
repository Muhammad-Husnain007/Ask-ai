const API_URL = 'http://127.0.0.1:3000/api/v1/ai/scan';
const STATE_KEY = 'ask-ai-linkedin-assistant';
const HIRING_RE = /hiring|we'?re hiring|looking for|join (our|my|the) team|open role|job opening|vacancy|recruiting|i'?m hiring|opportunity/i;

function isLinkedInHost() {
  return /(^|\.)linkedin\.com$/i.test(window.location.hostname);
}

function saveState(state) {
  sessionStorage.setItem(STATE_KEY, JSON.stringify({
    ...state,
    ts: Date.now(),
  }));
}

function readState() {
  try {
    const raw = sessionStorage.getItem(STATE_KEY);
    if (!raw) return { messages: [], panelOpen: false };
    const state = JSON.parse(raw);
    if (!state || Date.now() - Number(state.ts || 0) > 20 * 60 * 1000) {
      return { messages: [], panelOpen: false };
    }
    return {
      messages: Array.isArray(state.messages) ? state.messages.slice(-40) : [],
      panelOpen: Boolean(state.panelOpen),
    };
  } catch {
    return { messages: [], panelOpen: false };
  }
}

function updateState(patch) {
  const next = { ...readState(), ...patch };
  saveState(next);
  return next;
}

function firstText(root, selectors) {
  for (const selector of selectors) {
    const node = root.querySelector(selector);
    const text = node?.innerText?.trim() || node?.textContent?.trim();
    if (text) return text.replace(/\s+/g, ' ');
  }
  return '';
}

function firstHref(root, selectors) {
  for (const selector of selectors) {
    const node = root.querySelector(selector);
    const href = node?.href || node?.getAttribute?.('href');
    if (href) return href;
  }
  return '';
}

function normalizeLinkedInUrl(href) {
  try {
    const url = new URL(href, window.location.href);
    if (!url.hostname.includes('linkedin.com')) return '';
    url.hash = '';
    return url.href;
  } catch {
    return '';
  }
}

function scrapeVisibleHiringPosts() {
  const cards = document.querySelectorAll([
    'div.feed-shared-update-v2',
    'div[data-urn*="activity"]',
    'article.feed-shared-update-v2',
  ].join(','));
  const posts = [];
  const seen = new Set();

  cards.forEach((element) => {
    const author = firstText(element, [
      '.update-components-actor__name span[aria-hidden="true"]',
      '.update-components-actor__name',
      '.feed-shared-actor__name',
    ]);
    const text = firstText(element, [
      '.update-components-text',
      '.feed-shared-update-v2__description',
      '.feed-shared-text',
      '.break-words',
    ]);
    const link = normalizeLinkedInUrl(firstHref(element, [
      'a[href*="/feed/update/"]',
      'a[href*="/posts/"]',
    ]));
    const blob = `${author} ${text}`;
    if (!text || !HIRING_RE.test(blob)) return;
    const key = link || `${author}|${text.slice(0, 80)}`;
    if (seen.has(key) || posts.length >= 12) return;
    seen.add(key);
    posts.push({
      author: author || 'LinkedIn member',
      text: text.slice(0, 420),
      link,
    });
  });

  return posts;
}

function hideWelcomeScreen() {
  const welcomeScreen = document.getElementById('ai-welcome-screen');
  if (welcomeScreen) welcomeScreen.style.display = 'none';
}

function openPanel() {
  const panel = document.getElementById('ai-copilot-panel');
  const btn = document.getElementById('ai-copilot-btn');
  if (!panel) return;
  panel.style.display = 'flex';
  btn?.classList.add('is-open');
  updateState({ panelOpen: true });
}

function setBusy(isBusy) {
  const sendButton = document.getElementById('ai-send-btn');
  const queryInput = document.getElementById('ai-query-input');
  const chatFlow = document.getElementById('ai-chat-flow');
  if (sendButton) sendButton.disabled = isBusy;
  if (queryInput) queryInput.disabled = isBusy;
  chatFlow?.toggleAttribute('aria-busy', isBusy);
}

function showLoading(text) {
  document.getElementById('ai-active-loading')?.remove();
  const chatFlow = document.getElementById('ai-chat-flow');
  if (!chatFlow) return;
  const loadingBubble = document.createElement('div');
  loadingBubble.className = 'ai-loading-indicator';
  loadingBubble.id = 'ai-active-loading';
  loadingBubble.innerHTML = `<span class="ai-thinking-dots"><i></i><i></i><i></i></span> ${text}`;
  chatFlow.appendChild(loadingBubble);
  chatFlow.scrollTop = chatFlow.scrollHeight;
}

function appendNode(node) {
  const chatFlow = document.getElementById('ai-chat-flow');
  if (!chatFlow || !node) return;
  chatFlow.appendChild(node);
  chatFlow.scrollTop = chatFlow.scrollHeight;
}

function textBubble(text, className) {
  const bubble = document.createElement('div');
  bubble.className = `ai-chat-bubble ${className}`;
  bubble.textContent = text;
  return bubble;
}

function resultList(label, items, renderItem) {
  const wrap = document.createElement('div');
  wrap.className = 'ai-chat-bubble assistant ai-result-list';
  const heading = document.createElement('span');
  heading.className = 'ai-message-label';
  heading.textContent = label;
  wrap.append(heading);
  items.forEach((item) => wrap.append(renderItem(item)));
  return wrap;
}

function jobCard(job) {
  const card = document.createElement('article');
  card.className = 'ai-result-card';
  const title = document.createElement('a');
  title.className = 'ai-result-title';
  title.href = job.link;
  title.target = '_blank';
  title.rel = 'noopener noreferrer';
  title.textContent = job.title;
  const meta = document.createElement('div');
  meta.className = 'ai-result-meta';
  meta.textContent = job.company;
  card.append(title, meta);
  return card;
}

function postCard(post) {
  const card = document.createElement('article');
  card.className = 'ai-result-card';
  const title = document.createElement(post.link ? 'a' : 'strong');
  title.className = 'ai-result-title';
  title.textContent = post.author;
  if (post.link) {
    title.href = post.link;
    title.target = '_blank';
    title.rel = 'noopener noreferrer';
  }
  const text = document.createElement('p');
  text.className = 'ai-result-text';
  text.textContent = post.text;
  card.append(title, text);
  return card;
}

function profileCard(person) {
  const card = document.createElement('article');
  card.className = 'ai-result-card';
  const title = document.createElement('a');
  title.className = 'ai-result-title';
  title.href = person.profileLink;
  title.target = '_blank';
  title.rel = 'noopener noreferrer';
  title.textContent = person.name;
  const meta = document.createElement('div');
  meta.className = 'ai-result-meta';
  meta.textContent = [person.headline, person.location].filter(Boolean).join(' · ') || person.profileLink;
  card.append(title, meta);
  return card;
}

function renderStoredMessage(message) {
  if (!message) return;
  if (message.type === 'user') {
    appendNode(textBubble(message.text, 'user'));
    return;
  }
  if (message.type === 'assistant') {
    appendNode(textBubble(message.text, 'assistant'));
    return;
  }
  if (message.type === 'error') {
    appendNode(textBubble(message.text, 'assistant error'));
    return;
  }
  if (message.type === 'jobs' && message.items?.length) {
    appendNode(resultList(`${message.items.length} jobs`, message.items, jobCard));
    return;
  }
  if (message.type === 'posts' && message.items?.length) {
    appendNode(resultList(`${message.items.length} posts`, message.items, postCard));
    return;
  }
  if (message.type === 'people' && message.items?.length) {
    appendNode(resultList(`${message.items.length} people / recruiter profiles`, message.items, profileCard));
    return;
  }
  if (message.type === 'companies' && message.items?.length) {
    appendNode(resultList(`${message.items.length} company profiles`, message.items, profileCard));
  }
}

function pushMessage(message) {
  const state = readState();
  state.messages = [...state.messages, message].slice(-40);
  saveState(state);
  renderStoredMessage(message);
}

function restoreChat() {
  const chatFlow = document.getElementById('ai-chat-flow');
  if (!chatFlow || chatFlow.dataset.restored === '1') return;
  const state = readState();
  if (!state.messages.length) return;
  hideWelcomeScreen();
  chatFlow.dataset.restored = '1';
  state.messages.forEach(renderStoredMessage);
  if (state.panelOpen) openPanel();
}

function conversationForApi() {
  return readState().messages
    .filter((message) => message.type === 'user' || message.type === 'assistant')
    .slice(-8)
    .map((message) => ({
      role: message.type === 'user' ? 'user' : 'assistant',
      text: String(message.text || '').slice(0, 500),
    }));
}

function lightPageContext() {
  try {
    return (document.body?.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 2500);
  } catch {
    return '';
  }
}

function mergePosts(primary, extra) {
  const seen = new Set();
  const merged = [];
  [...(extra || []), ...(primary || [])].forEach((post) => {
    const key = post.link || `${post.author}|${(post.text || '').slice(0, 80)}`;
    if (!post.text || seen.has(key)) return;
    seen.add(key);
    merged.push(post);
  });
  return merged.slice(0, 20);
}

async function fetchLinkedInResults(data) {
  const response = await chrome.runtime.sendMessage({
    type: 'ASK_AI_LINKEDIN',
    intent: data.intent,
    keywords: data.keywords,
    location: data.location,
    personName: data.personName,
    companyName: data.companyName,
  });
  return response || { ok: false, error: 'No response from LinkedIn helper.' };
}

function showLinkedInResults(payload, intent) {
  const jobs = payload.jobs || [];
  const posts = payload.posts || [];
  const people = payload.people || [];
  const companies = payload.companies || [];

  if (jobs.length) pushMessage({ type: 'jobs', items: jobs });
  if (posts.length) pushMessage({ type: 'posts', items: posts });
  if (people.length) pushMessage({ type: 'people', items: people });
  if (companies.length) pushMessage({ type: 'companies', items: companies });

  if (jobs.length || posts.length || people.length || companies.length) return;

  if (intent === 'person_posts') {
    pushMessage({
      type: 'error',
      text: 'Us recruiter ki posts silently load nahi ho sakin. LinkedIn login check karo, naam spelling confirm karo.',
    });
    return;
  }
  pushMessage({
    type: 'error',
    text: 'LinkedIn se results nahi mil sake. Page pe login hona zaroori hai — search bar use nahi ki gayi.',
  });
}

async function fulfillLinkedInRequest(data) {
  showLoading('LinkedIn se silently results nikaal raha hoon — search bar nahi khulegi…');
  try {
    const payload = await fetchLinkedInResults(data);
    document.getElementById('ai-active-loading')?.remove();

    if (!payload.ok) {
      const visiblePosts = data.intent === 'chat' ? [] : scrapeVisibleHiringPosts();
      if (visiblePosts.length) {
        pushMessage({ type: 'posts', items: visiblePosts });
        pushMessage({
          type: 'assistant',
          text: 'API se full search nahi hui, is liye current feed ki hiring posts dikhai hain. Profile links ke liye LinkedIn login confirm karo.',
        });
        return;
      }
      pushMessage({ type: 'error', text: payload.error || 'LinkedIn silent search fail ho gayi.' });
      return;
    }

    if (data.intent === 'latest_posts' || data.intent === 'job_seeker' || data.intent === 'person_posts') {
      payload.posts = mergePosts(payload.posts, scrapeVisibleHiringPosts());
    }

    showLinkedInResults(payload, data.intent);
  } catch (error) {
    document.getElementById('ai-active-loading')?.remove();
    const visiblePosts = scrapeVisibleHiringPosts();
    if (visiblePosts.length) {
      pushMessage({ type: 'posts', items: visiblePosts });
      return;
    }
    pushMessage({
      type: 'error',
      text: error?.message || 'Silent LinkedIn fetch fail. Extension reload karke login page se try karo.',
    });
  }
}

function injectAIWidget() {
  if (document.getElementById('ai-copilot-btn')) return;

  const btn = document.createElement('button');
  btn.id = 'ai-copilot-btn';
  btn.type = 'button';
  btn.setAttribute('aria-label', 'Open Ask AI');
  btn.innerHTML = '<span class="ai-logo ai-logo-launch" aria-hidden="true"><i></i></span><span>Ask AI</span>';
  document.body.appendChild(btn);

  const panel = document.createElement('div');
  panel.id = 'ai-copilot-panel';
  panel.style.display = 'none';
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-label', 'Ask AI');
  panel.innerHTML = `
    <div class="ai-header">
      <div class="ai-brand">
        <div class="ai-logo ai-logo-brand" aria-hidden="true"><i></i></div>
        <div>
          <div class="ai-header-title">Ask AI</div>
          <div class="ai-header-subtitle"><span></span> Silent LinkedIn fetch</div>
        </div>
      </div>
      <button class="ai-close-btn" id="ai-close-btn" type="button" aria-label="Close Ask AI">×</button>
    </div>
    
    <div class="ai-body" id="ai-chat-flow">
      <div class="ai-welcome-screen" id="ai-welcome-screen">
        <div class="ai-welcome-orb">✦</div>
        <p class="ai-eyebrow">NO SEARCH BAR TYPING</p>
        <h2>Chat, posts, jobs,<br/><span>and profile links</span></h2>
        <p class="ai-welcome-copy">Jo search tum khud type kar sakte ho woh yahan manually nahi hogi. Main LinkedIn se silently posts, jobs, aur hiring profiles nikaal ke yahin dunga.</p>
        <div class="ai-chips-container">
          <button class="ai-chip" type="button" data-query="Latest hiring posts nikaal do"><span class="ai-chip-icon purple">✎</span><span><strong>Latest hiring posts</strong><small>Without using LinkedIn search</small></span><b>›</b></button>
          <button class="ai-chip" type="button" data-query="I have 2 years exp, I want a Node.js job in Karachi"><span class="ai-chip-icon amber">▣</span><span><strong>Find work for me</strong><small>Jobs + posts + hiring profiles</small></span><b>›</b></button>
          <button class="ai-chip" type="button" data-query="I need a Node.js developer in Karachi"><span class="ai-chip-icon blue">✦</span><span><strong>Find candidates</strong><small>Matching profile links</small></span><b>›</b></button>
        </div>
      </div>
    </div>
    
    <div class="ai-footer">
      <form class="ai-input-wrapper" id="ai-query-form">
          <textarea id="ai-query-input" rows="1" maxlength="1000" placeholder="Recruiter ka naam, latest posts, ya job requirement..."></textarea>
          <div class="ai-input-actions">
          <span class="ai-model-tag"><i></i> AI powered</span>
          <span class="ai-keyboard-hint">Enter to send</span>
          <button class="ai-send-btn-icon" id="ai-send-btn" type="button" aria-label="Send message">↑</button>
        </div>
      </form>
    </div>
  `;
  document.body.appendChild(panel);

  const togglePanel = (shouldOpen) => {
    const isOpen = panel.style.display !== 'none';
    const open = shouldOpen ?? !isOpen;
    panel.style.display = open ? 'flex' : 'none';
    btn.classList.toggle('is-open', open);
    updateState({ panelOpen: open });
    if (open) requestAnimationFrame(() => document.getElementById('ai-query-input').focus());
    else btn.focus();
  };

  btn.addEventListener('click', togglePanel);
  document.getElementById('ai-close-btn').addEventListener('click', () => togglePanel(false));

  document.querySelectorAll('.ai-chip').forEach((chip) => {
    chip.addEventListener('click', (e) => {
      const query = e.currentTarget.getAttribute('data-query');
      document.getElementById('ai-query-input').value = query;
      handleAISearch();
    });
  });

  document.getElementById('ai-send-btn').addEventListener('click', handleAISearch);
  document.getElementById('ai-query-form').addEventListener('submit', (e) => {
    e.preventDefault();
    handleAISearch();
  });
  document.getElementById('ai-query-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleAISearch();
    }
  });
  document.getElementById('ai-query-input').addEventListener('input', (e) => {
    e.target.style.height = 'auto';
    e.target.style.height = `${Math.min(e.target.scrollHeight, 104)}px`;
  });
}

async function handleAISearch() {
  const queryInput = document.getElementById('ai-query-input');
  const userQuery = queryInput.value.trim();
  if (!userQuery) return;

  hideWelcomeScreen();
  const conversation = conversationForApi();
  pushMessage({ type: 'user', text: userQuery });
  queryInput.value = '';
  queryInput.style.height = 'auto';
  showLoading('Samajh raha hoon…');
  setBusy(true);

  try {
    const res = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: userQuery,
        conversation,
        pageUrl: window.location.href,
        textContext: lightPageContext(),
      }),
    });

    const result = await res.json().catch(() => ({}));
    document.getElementById('ai-active-loading')?.remove();

    const data = result?.data || {};
    const reply = String(data.reply || '').trim();

    if (!result.success || !reply) {
      pushMessage({ type: 'error', text: result.message || `Request failed (${res.status}).` });
      return;
    }

    pushMessage({ type: 'assistant', text: reply });

    if (data.intent && data.intent !== 'chat') {
      await fulfillLinkedInRequest(data);
    }
  } catch {
    document.getElementById('ai-active-loading')?.remove();
    pushMessage({ type: 'error', text: 'Ask AI abhi jawab nahi de saka. Thori der baad try karo.' });
  } finally {
    setBusy(false);
    queryInput.focus();
  }
}

function boot() {
  if (!isLinkedInHost()) return;
  injectAIWidget();
  restoreChat();
}

if (document.readyState === 'loading') {
  window.addEventListener('DOMContentLoaded', boot, { once: true });
} else {
  boot();
}
