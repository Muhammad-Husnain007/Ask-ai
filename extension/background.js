const SEARCH_QUERY_ID = 'voyagerSearchDashClusters.b0928897b71bd00a5a7291755dcd64f0';
const HIRING_RE = /hiring|we'?re hiring|looking for|join (our|my|the) team|open role|job opening|vacancy|recruiting|i'?m hiring|opportunity|developers? wanted|now hiring/i;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function asText(value) {
  if (value == null) return '';
  if (typeof value === 'string') return value.replace(/\s+/g, ' ').trim();
  if (typeof value !== 'object') return '';
  if (typeof value.text === 'string') return asText(value.text);
  if (value.text && typeof value.text === 'object') return asText(value.text);
  if (typeof value.localizedName === 'string') return value.localizedName;
  if (typeof value.name === 'string') return value.name;
  return '';
}

function walk(node, visit, seen = new WeakSet()) {
  if (!node || typeof node !== 'object' || seen.has(node)) return;
  seen.add(node);
  visit(node);
  const values = Array.isArray(node) ? node : Object.values(node);
  values.forEach((value) => walk(value, visit, seen));
}

function profileUrlFrom(node) {
  const publicId = asText(node.publicIdentifier);
  if (publicId && !publicId.includes(' ')) {
    return { slug: publicId, url: `https://www.linkedin.com/in/${publicId}` };
  }
  const nav = asText(node.navigationUrl) || asText(node.url) || asText(node.canonicalUrl);
  const match = String(nav).match(/\/in\/([^/?#]+)/i);
  if (match) return { slug: match[1], url: `https://www.linkedin.com/in/${match[1]}` };
  return { slug: '', url: '' };
}

function companyUrlFrom(node) {
  const nav = asText(node.navigationUrl) || asText(node.url) || asText(node.universalName) || asText(node.companyUrn);
  const match = String(nav).match(/\/company\/([^/?#]+)/i);
  if (match) return `https://www.linkedin.com/company/${match[1]}`;
  const universal = asText(node.universalName);
  if (universal && !universal.includes(' ')) return `https://www.linkedin.com/company/${universal}`;
  return '';
}

function activityUrlFrom(node) {
  const urn = asText(node.urn) || asText(node.entityUrn) || asText(node.updateMetadata?.urn) || asText(node['*entityUrn']);
  const match = String(urn).match(/activity[:\u003A]+(\d+)/i) || String(urn).match(/urn:li:activity:(\d+)/i);
  if (match) return `https://www.linkedin.com/feed/update/urn:li:activity:${match[1]}/`;
  const nav = asText(node.permalink) || asText(node.navigationUrl);
  if (/\/feed\/update\//i.test(nav) || /\/posts\//i.test(nav)) return nav;
  return '';
}

function collectEntities(payload) {
  const people = new Map();
  const posts = new Map();
  const jobs = new Map();
  const companies = new Map();

  walk(payload, (node) => {
    if (Array.isArray(node)) return;

    const title = asText(node.title)
      || [asText(node.firstName), asText(node.lastName)].filter(Boolean).join(' ')
      || asText(node.actorName)
      || asText(node.name);
    const headline = asText(node.primarySubtitle) || asText(node.headline) || asText(node.occupation);
    const location = asText(node.secondarySubtitle) || asText(node.locationName) || asText(node.geoLocationName);
    const commentary = asText(node.commentary) || asText(node.snippetText) || asText(node.summary);

    const person = profileUrlFrom(node);
    if (person.url && (title || person.slug)) {
      people.set(person.url, {
        name: title || person.slug,
        headline,
        location,
        profileLink: person.url,
        publicIdentifier: person.slug,
        entityUrn: asText(node.entityUrn) || asText(node.fsdProfileUrn),
      });
    }

    const companyLink = companyUrlFrom(node);
    if (companyLink && (title || asText(node.universalName))) {
      companies.set(companyLink, {
        name: title || asText(node.universalName),
        headline: headline || 'Company',
        profileLink: companyLink,
      });
    }

    const jobId = asText(node.jobPostingId)
      || (asText(node.entityUrn).match(/jobPosting:(\d+)/i) || [])[1]
      || (asText(node.preDashEntityUrn).match(/jobPosting:(\d+)/i) || [])[1];
    const jobTitle = asText(node.jobPostingTitle) || (jobId ? title : '');
    if (jobId && jobTitle) {
      jobs.set(jobId, {
        title: jobTitle,
        company: asText(node.primaryDescription) || asText(node.companyName) || headline || 'Unknown company',
        link: `https://www.linkedin.com/jobs/view/${jobId}/`,
      });
    }

    const postLink = activityUrlFrom(node);
    const postText = commentary || asText(node.commentary?.text?.text);
    if (postLink && postText) {
      posts.set(postLink, {
        author: title || asText(node.actor?.name) || 'LinkedIn member',
        text: postText.slice(0, 500),
        link: postLink,
      });
    }
  });

  return {
    people: [...people.values()],
    posts: [...posts.values()],
    jobs: [...jobs.values()],
    companies: [...companies.values()],
  };
}

async function getCsrfToken() {
  const cookie = await chrome.cookies.get({
    url: 'https://www.linkedin.com',
    name: 'JSESSIONID',
  });
  if (!cookie?.value) {
    throw new Error('LinkedIn login required.');
  }
  return cookie.value.replace(/"/g, '');
}

async function voyagerGet(pathAndQuery) {
  const csrf = await getCsrfToken();
  const url = pathAndQuery.startsWith('http')
    ? pathAndQuery
    : `https://www.linkedin.com${pathAndQuery}`;
  const response = await fetch(url, {
    method: 'GET',
    credentials: 'include',
    headers: {
      accept: 'application/vnd.linkedin.normalized+json+2.1',
      'csrf-token': csrf,
      'x-restli-protocol-version': '2.0.0',
      'x-li-lang': 'en_US',
    },
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`LinkedIn request failed (${response.status}).`);
  }
  try {
    return JSON.parse(text);
  } catch {
    return {};
  }
}

function keywordClause(keywords) {
  return String(keywords || '')
    .replace(/[(),]/g, ' ')
    .replace(/\s+/g, '%20')
    .trim();
}

async function graphqlSearch(resultType, keywords) {
  const kw = keywordClause(keywords);
  if (!kw) return collectEntities({});
  const variables = `(start:0,origin:GLOBAL_SEARCH_HEADER,query:(keywords:${kw},flagshipSearchIntent:SEARCH_SRP,queryParameters:List((key:resultType,value:List(${resultType}))),includeFiltersInResponse:false))`;
  const url = `https://www.linkedin.com/voyager/api/graphql?variables=${variables}&queryId=${SEARCH_QUERY_ID}`;
  return collectEntities(await voyagerGet(url));
}

async function typeaheadPeople(name) {
  const query = encodeURIComponent(name);
  const payload = await voyagerGet(`/voyager/api/typeahead/hitsV2?keywords=${query}&origin=OTHER&q=type&type=PEOPLE`);
  return collectEntities(payload).people;
}

async function profilePosts(person) {
  const tries = [];
  if (person.publicIdentifier) {
    tries.push(`/voyager/api/identity/profileUpdatesV2?count=15&start=0&q=memberShareFeed&moduleKey=member-shares:phone&includeLongTermHistory=true&profileId=${encodeURIComponent(person.publicIdentifier)}`);
  }
  if (person.entityUrn) {
    tries.push(`/voyager/api/identity/profileUpdatesV2?count=15&start=0&q=memberShareFeed&moduleKey=member-shares:phone&includeLongTermHistory=true&profileUrn=${encodeURIComponent(person.entityUrn)}`);
  }
  const posts = [];
  for (const path of tries) {
    try {
      const collected = collectEntities(await voyagerGet(path));
      posts.push(...collected.posts);
      if (posts.length) break;
    } catch {
      /* try next shape */
    }
  }
  return posts;
}

function hiringPhrase(keywords, location) {
  return ['hiring', keywords, location].filter(Boolean).join(' ').replace(/\bhiring hiring\b/i, 'hiring');
}

function preferHiring(posts) {
  const hiring = posts.filter((post) => HIRING_RE.test(`${post.author} ${post.text}`));
  return hiring.length ? hiring : posts;
}

async function handleLinkedInRequest({ intent, keywords, location, personName, companyName }) {
  const phrase = [keywords, location].filter(Boolean).join(' ');
  const out = { ok: true, jobs: [], posts: [], people: [], companies: [] };

  if (intent === 'person_posts' && personName) {
    let people = await typeaheadPeople(personName);
    await sleep(350);
    if (!people.length) {
      people = (await graphqlSearch('PEOPLE', personName)).people;
    }
    out.people = people.slice(0, 8);
    if (people[0]) {
      await sleep(350);
      out.posts = preferHiring(await profilePosts(people[0])).slice(0, 15);
      if (!out.posts.length) {
        out.people = out.people.map((person, index) => (
          index === 0
            ? {
              ...person,
              headline: person.headline || 'Open profile / recent activity',
              profileLink: `${person.profileLink.replace(/\/$/, '')}/recent-activity/all/`,
            }
            : person
        ));
      }
    }
    if (companyName) {
      await sleep(350);
      out.companies = (await graphqlSearch('COMPANIES', companyName)).companies.slice(0, 8);
    }
    return out;
  }

  if (intent === 'latest_posts') {
    const query = hiringPhrase(keywords, location);
    await sleep(200);
    out.posts = preferHiring((await graphqlSearch('CONTENT', query)).posts).slice(0, 15);
    await sleep(350);
    out.people = (await graphqlSearch('PEOPLE', `${query} recruiter`)).people.slice(0, 10);
    await sleep(350);
    out.companies = (await graphqlSearch('COMPANIES', query)).companies.slice(0, 8);
    return out;
  }

  if (intent === 'recruiter') {
    out.people = (await graphqlSearch('PEOPLE', phrase)).people.slice(0, 15);
    return out;
  }

  out.jobs = (await graphqlSearch('JOBS', phrase)).jobs.slice(0, 15);
  await sleep(350);
  try {
    const jobCards = await voyagerGet(`/voyager/api/voyagerJobsDashJobCards?decorationId=com.linkedin.voyager.dash.deco.jobs.search.JobSearchCardsCollection-174&count=20&q=jobSearch&query=(origin:JOB_SEARCH_PAGE_OTHER_ENTRY,keywords:${keywordClause(keywords)}${location ? `,locationUnion:(text:${keywordClause(location)})` : ''})&start=0`);
    const extraJobs = collectEntities(jobCards).jobs;
    const seen = new Set(out.jobs.map((job) => job.link));
    extraJobs.forEach((job) => {
      if (!seen.has(job.link)) out.jobs.push(job);
    });
    out.jobs = out.jobs.slice(0, 15);
  } catch {
    /* jobs dash is optional */
  }
  await sleep(350);
  out.posts = preferHiring((await graphqlSearch('CONTENT', hiringPhrase(keywords, location))).posts).slice(0, 15);
  await sleep(350);
  out.people = (await graphqlSearch('PEOPLE', hiringPhrase(`${keywords} recruiter`, location))).people.slice(0, 10);
  await sleep(350);
  out.companies = (await graphqlSearch('COMPANIES', hiringPhrase(keywords, location))).companies.slice(0, 8);
  return out;
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== 'ASK_AI_LINKEDIN') return undefined;
  handleLinkedInRequest(message)
    .then(sendResponse)
    .catch((error) => sendResponse({ ok: false, error: error.message || 'LinkedIn fetch failed.' }));
  return true;
});
