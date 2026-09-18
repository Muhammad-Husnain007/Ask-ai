// ==========================================
// 1. DATA EXTRACTION LOGIC
// ==========================================
function extractPageData() {
  const visibleText = document.body.innerText.substring(0, 6000);
  const extractedLinks = Array.from(document.querySelectorAll('a'))
    .map(a => ({ text: a.innerText.trim(), url: a.href }))
    .filter(link => link.text.length > 0 && link.url.startsWith('http'))
    .slice(0, 50);

  return { textContext: visibleText, links: extractedLinks };
}

function renderFormattedMessage(container, answer, allowedUrls) {
  const messageNode = document.createElement('div');
  messageNode.className = 'ai-chat-bubble assistant';

  const label = document.createElement('span');
  label.className = 'ai-message-label';
  label.textContent = 'Ask AI';
  messageNode.append(label);

  const content = document.createElement('div');
  content.className = 'ai-message-content';

  const urlPattern = /https?:\/\/[^\s<>"']+/g;
  let lastIndex = 0;

  for (const match of answer.matchAll(urlPattern)) {
    content.append(document.createTextNode(answer.slice(lastIndex, match.index)));
    if (allowedUrls.has(match[0])) {
      const link = document.createElement('a');
      link.href = match[0];
      link.textContent = match[0];
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      content.append(link);
    } else {
      content.append(document.createTextNode(match[0]));
    }
    lastIndex = match.index + match[0].length;
  }
  content.append(document.createTextNode(answer.slice(lastIndex)));
  messageNode.append(content);
  container.appendChild(messageNode);
}

// ==========================================
// 2. INJECT FLOATING WIDGET (UI)
// ==========================================
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
          <div class="ai-header-subtitle"><span></span> Page-aware assistant</div>
        </div>
      </div>
      <button class="ai-close-btn" id="ai-close-btn" type="button" aria-label="Close Ask AI">×</button>
    </div>
    
    <div class="ai-body" id="ai-chat-flow">
      <div class="ai-welcome-screen" id="ai-welcome-screen">
        <div class="ai-welcome-orb">✦</div>
        <p class="ai-eyebrow">YOUR SMART PAGE COMPANION</p>
        <h2>What would you like<br/><span>to discover today?</span></h2>
        <p class="ai-welcome-copy">I can read this page, surface useful details, and help you move faster.</p>
        <div class="ai-chips-container">
          <button class="ai-chip" type="button" data-query="Summarize the main content of this page"><span class="ai-chip-icon purple">✎</span><span><strong>Summarize this page</strong><small>Get the essential points</small></span><b>›</b></button>
          <button class="ai-chip" type="button" data-query="Extract all job titles and links"><span class="ai-chip-icon amber">▣</span><span><strong>Extract jobs & links</strong><small>Find useful opportunities</small></span><b>›</b></button>
        </div>
      </div>
    </div>
    
    <div class="ai-footer">
      <form class="ai-input-wrapper" id="ai-query-form">
          <textarea id="ai-query-input" rows="1" maxlength="1000" placeholder="Ask anything about this page..."></textarea>
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
    if (open) requestAnimationFrame(() => document.getElementById('ai-query-input').focus());
    else btn.focus();
  };

  btn.addEventListener('click', togglePanel);
  document.getElementById('ai-close-btn').addEventListener('click', () => togglePanel(false));

  // Quick Chips Click
  document.querySelectorAll('.ai-chip').forEach(chip => {
    chip.addEventListener('click', (e) => {
      const query = e.currentTarget.getAttribute('data-query');
      document.getElementById('ai-query-input').value = query;
      handleAISearch();
    });
  });

  // Submit Triggers
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

// ==========================================
// 3. HANDLE CHAT FLOW & API
// ==========================================
async function handleAISearch() {
  const queryInput = document.getElementById('ai-query-input');
  const chatFlow = document.getElementById('ai-chat-flow');
  const userQuery = queryInput.value.trim();

  if (!userQuery) return;

  // 1. Hide Welcome Screen on First Query
  const welcomeScreen = document.getElementById('ai-welcome-screen');
  if (welcomeScreen) welcomeScreen.style.display = 'none';

  // 2. Append User Query Bubble
  const userBubble = document.createElement('div');
  userBubble.className = 'ai-chat-bubble user';
  userBubble.textContent = userQuery;
  chatFlow.appendChild(userBubble);

  // 3. Clear Input Field Immediately
  queryInput.value = '';
  queryInput.style.height = 'auto';

  // 4. Append Loading Indicator
  const loadingBubble = document.createElement('div');
  loadingBubble.className = 'ai-loading-indicator';
  loadingBubble.id = 'ai-active-loading';
  loadingBubble.innerHTML = '<span class="ai-thinking-dots"><i></i><i></i><i></i></span> Thinking through this page';
  chatFlow.appendChild(loadingBubble);
  chatFlow.scrollTop = chatFlow.scrollHeight;

  const sendButton = document.getElementById('ai-send-btn');
  sendButton.disabled = true;
  queryInput.disabled = true;
  chatFlow.setAttribute('aria-busy', 'true');

  const scannedData = extractPageData();

  try {
    const res = await fetch('http://127.0.0.1:3000/api/v1/ai/scan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: userQuery,
        textContext: scannedData.textContext,
        extractedLinks: scannedData.links,
        pageUrl: window.location.href
      })
    });

    const result = await res.json().catch(() => ({}));
    
    // Remove Loading Indicator
    const activeLoading = document.getElementById('ai-active-loading');
    if (activeLoading) activeLoading.remove();

    if (result.success && result.data && result.data.answer) {
      renderFormattedMessage(
        chatFlow,
        result.data.answer,
        new Set(scannedData.links.map(l => l.url))
      );
    } else {
      const errBubble = document.createElement('div');
      errBubble.className = 'ai-chat-bubble assistant error';
      errBubble.textContent = result.message || `Request failed (${res.status}).`;
      chatFlow.appendChild(errBubble);
    }
  } catch (error) {
    const activeLoading = document.getElementById('ai-active-loading');
    if (activeLoading) activeLoading.remove();

    const errBubble = document.createElement('div');
    errBubble.className = 'ai-chat-bubble assistant error';
    errBubble.textContent = 'Ask AI could not process this page right now.';
    chatFlow.appendChild(errBubble);
  } finally {
    sendButton.disabled = false;
    queryInput.disabled = false;
    chatFlow.removeAttribute('aria-busy');
    queryInput.focus();
    chatFlow.scrollTop = chatFlow.scrollHeight;
  }
}

if (document.readyState === 'loading') {
  window.addEventListener('DOMContentLoaded', injectAIWidget, { once: true });
} else {
  injectAIWidget();
}
