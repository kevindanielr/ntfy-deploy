const TARGETS = [
  { name: 'DEV',       flag: '🧪', url: 'https://viajes.dev.rappi.com',       mode: 'dev'     },
  { name: 'Staging',   flag: '🧰', url: 'https://viajes-staging.rappi.com',    mode: 'staging' },
  { name: 'Colombia',  flag: '🇨🇴', url: 'https://travel.rappi.com.co',         mode: 'prod'    },
  { name: 'Brasil',    flag: '🇧🇷', url: 'https://travel.rappi.com.br',         mode: 'prod'    },
  { name: 'México',    flag: '🇲🇽', url: 'https://travel.rappi.com.mx',         mode: 'prod'    },
  { name: 'Argentina', flag: '🇦🇷', url: 'https://travel.rappi.com.ar',         mode: 'prod'    },
  { name: 'Perú',      flag: '🇵🇪', url: 'https://travel.rappi.com.pe',         mode: 'prod'    },
  { name: 'Chile',     flag: '🇨🇱', url: 'https://travel.rappi.cl',             mode: 'prod'    },
];

const REPO = 'kevindanielr/ntfy-deploy';
const BRANCH = 'main';
const GH_API = `https://api.github.com/repos/${REPO}/contents`;
const UA = 'ntfy-deploy-worker';

function slugify(name) {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function extractVersion(html, mode) {
  if (mode === 'dev' || mode === 'staging') {
    const m = html.match(/ng-rappi-travel-version="([a-f0-9]+)"/);
    return m ? m[1] : null;
  }
  const m = html.match(/main\.([a-f0-9]{16,})\.js/);
  return m ? m[1] : null;
}

async function ghGet(path, token) {
  const res = await fetch(`${GH_API}/${path}?ref=${BRANCH}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      'User-Agent': UA,
      Accept: 'application/vnd.github.v3+json',
    },
  });
  if (res.status === 404) return { sha: null, content: '' };
  if (!res.ok) throw new Error(`GH GET ${path}: ${res.status}`);
  const data = await res.json();
  const b64 = data.content.replace(/\n/g, '');
  const content = atob(b64).trim();
  return { sha: data.sha, content };
}

async function ghPut(path, newContent, sha, message, token) {
  const body = {
    message,
    content: btoa(newContent + '\n'),
    branch: BRANCH,
    ...(sha ? { sha } : {}),
  };
  const res = await fetch(`${GH_API}/${path}`, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${token}`,
      'User-Agent': UA,
      Accept: 'application/vnd.github.v3+json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GH PUT ${path}: ${res.status} - ${text}`);
  }
}

function buildMessage(target, version, previous) {
  const compareUrl = `https://github.com/rappi-inc/ng-rappi-travel/compare/${previous}...${version}`;
  if (target.mode === 'dev') {
    return {
      title: `${target.flag} Deploy DEV finalizado`,
      priority: '4',
      body: `${target.flag} Deploy ${target.name} Finalizado\n\n@manuela.trujillo @ext-d.agudelo\n\nDeploy Finalizado :ok_exp_qa:\n\n:deploying: Tickets desplegados para pruebas en DEV:\n\n:pushpin: Tag Version: ${version}`,
      actions: `view, Abrir DEV, ${target.url}, clear=true; view, Ver commits, ${compareUrl}, clear=true; copy, Copiar tag, ${version}`,
    };
  }
  if (target.mode === 'staging') {
    return {
      title: `${target.flag} Deploy STAGING finalizado`,
      priority: '4',
      body: `${target.flag} Deploy ${target.name} Finalizado\n\n:deploying: Tickets desplegados en STAGING:\n\n:pushpin: Tag Version: ${version}\nAnterior: ${previous}`,
      actions: `view, Abrir Staging, ${target.url}, clear=true; view, Ver commits, ${compareUrl}, clear=true; copy, Copiar tag, ${version}`,
    };
  }
  return {
    title: `${target.flag} Deploy ${target.name} (PROD)`,
    priority: '5',
    body: `${target.flag} Deploy ${target.name} Finalizado\n\n:pushpin: Tag Version: ${version}\nAnterior: ${previous}`,
    actions: `view, Abrir sitio, ${target.url}, clear=true; copy, Copiar tag, ${version}`,
  };
}

async function notifyNtfy(target, version, previous, topic) {
  const msg = buildMessage(target, version, previous);
  await fetch(`https://ntfy.sh/${topic}`, {
    method: 'POST',
    headers: {
      Title: msg.title,
      Tags: 'rocket,white_check_mark',
      Priority: msg.priority,
      Actions: msg.actions,
    },
    body: msg.body,
  });
}

async function checkOne(target, env, log) {
  const slug = slugify(target.name);
  const path = `state/${slug}.version`;
  const htmlRes = await fetch(target.url, { cf: { cacheTtl: 0, cacheEverything: false } });
  if (!htmlRes.ok) { log.push(`${target.name}: HTTP ${htmlRes.status}`); return; }
  const html = await htmlRes.text();
  const version = extractVersion(html, target.mode);
  if (!version) { log.push(`${target.name}: no version extracted`); return; }
  const state = await ghGet(path, env.GITHUB_TOKEN);
  log.push(`${target.name}: current=${version} last=${state.content || '(empty)'}`);
  if (version === state.content) return;
  if (state.content) {
    await notifyNtfy(target, version, state.content, env.NTFY_TOPIC);
    log.push(`  → notified`);
  } else {
    log.push(`  → baseline primed`);
  }
  await ghPut(path, version, state.sha, `chore: ${slug} ${version}`, env.GITHUB_TOKEN);
}

async function checkAll(env) {
  const log = [];
  for (const target of TARGETS) {
    try {
      await checkOne(target, env, log);
    } catch (err) {
      log.push(`${target.name} ERROR: ${err.message}`);
    }
  }
  console.log(log.join('\n'));
  return log;
}

export default {
  async scheduled(_event, env, ctx) {
    ctx.waitUntil(checkAll(env));
  },
  async fetch(_req, env) {
    const log = await checkAll(env);
    return new Response(log.join('\n'), { headers: { 'Content-Type': 'text/plain' } });
  },
};
