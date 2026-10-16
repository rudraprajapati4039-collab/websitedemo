const $ = id => document.getElementById(id);
const show = (t, c) => { $('msg').className = c; $('msg').textContent = t; };
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

/* ---------- public page ---------- */
if ($('reqForm')) {
  $('yr').textContent = new Date().getFullYear();
  fetch('/api/site').then(r => r.json()).then(d => {
    $('svcGrid').innerHTML = d.services.map(x => `<div class="svc"><span>${esc(x.icon)}</span><h3>${esc(x.name)}</h3></div>`).join('');
    $('service').insertAdjacentHTML('beforeend', d.services.map(x => `<option>${esc(x.name)}</option>`).join(''));
    if (d.hero) $('hero').style.backgroundImage = `linear-gradient(rgba(15,39,64,.8),rgba(15,39,64,.8)),url(/site/${d.hero})`;
  });
  $('reqForm').addEventListener('submit', async e => {
    e.preventDefault(); show('Sending your documents…', 'ok');
    try {
      const r = await fetch('/api/request', { method: 'POST', body: new FormData(e.target) });
      const d = await r.json();
      if (!r.ok) return show(d.error, 'err');
      e.target.reset(); show('Application received. We will call you on your phone number soon.', 'ok');
    } catch { show('No connection. Check your internet and try again.', 'err'); }
  });
}

/* ---------- login page ---------- */
const api = (u, o = {}) => fetch(u, { headers: { 'Content-Type': 'application/json' }, ...o });
if ($('loginForm')) {
  $('showpw').addEventListener('change', e => { $('lw').type = e.target.checked ? 'text' : 'password'; });
  $('loginForm').addEventListener('submit', async e => {
    e.preventDefault(); show('Checking…', 'ok');
    try {
      const r = await api('/api/admin/login', { method: 'POST', body: JSON.stringify({ phone: $('lp').value, password: $('lw').value }) });
      if (r.ok) location.href = 'admin.html'; else show((await r.json()).error, 'err');
    } catch { show('No connection. Check your internet and try again.', 'err'); }
  });
}

/* ---------- admin panel ---------- */
if ($('rows')) {
  async function load() {
    const r = await api('/api/admin/requests');
    if (r.status === 401) { location.href = 'login.html'; return; }
    const list = await r.json();
    $('count').textContent = list.length + ' application(s)';
    $('rows').innerHTML = list.length ? list.map(x => `<tr>
      <td>${esc(x.created_at)}</td>
      <td><b>${esc(x.name)}</b><br>${esc(x.phone)}<br>${esc(x.email)}<br>${esc(x.address)}${x.message ? '<br><i>' + esc(x.message) + '</i>' : ''}</td>
      <td>${esc(x.service)}</td>
      <td><a href="/files/${x.aadhaar}" target="_blank">Aadhaar</a><br><a href="/files/${x.pan}" target="_blank">PAN</a><br><a href="/files/${x.photo}" target="_blank">Photo</a></td>
      <td><span class="tag ${x.status}">${x.status}</span></td>
      <td><button class="btn sm" data-a="t" data-id="${x.id}" data-s="${x.status}">Mark ${x.status === 'Done' ? 'New' : 'Done'}</button>
          <button class="btn sm red" data-a="d" data-id="${x.id}">Delete</button></td></tr>`).join('')
      : '<tr><td colspan="6">No applications yet. New ones will appear here.</td></tr>';
  }
  $('rows').addEventListener('click', async e => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.a === 'd') { if (!confirm('Delete this application and its documents?')) return; await api('/api/admin/requests/' + b.dataset.id, { method: 'DELETE' }); }
    else await api('/api/admin/requests/' + b.dataset.id, { method: 'PATCH', body: JSON.stringify({ status: b.dataset.s === 'Done' ? 'New' : 'Done' }) });
    load();
  });
  $('logout').addEventListener('click', async e => { e.preventDefault(); await api('/api/admin/logout', { method: 'POST' }); location.href = 'login.html'; });
  load();
}

/* ---------- admin: website settings ---------- */
if ($('svcList')) {
  const fail = async r => { if (!r.ok) alert((await r.json()).error || 'Something went wrong.'); };
  const send = (u, m, body) => fetch(u, { method: m, body });
  async function site() {
    const d = await (await fetch('/api/site')).json();
    $('svcList').innerHTML = d.services.map(x => `<li><span>${esc(x.icon)} ${esc(x.name)}</span><button class="btn sm red" data-d="services/${x.id}">Remove</button></li>`).join('') || '<li>No services yet.</li>';
    $('bgNow').style.backgroundImage = d.hero ? `url(/site/${d.hero})` : '';
    $('bgNow').textContent = d.hero ? '' : 'Default blue background';
  }
  document.addEventListener('click', async e => {
    const b = e.target.closest('[data-d]'); if (!b || !confirm('Remove this?')) return;
    await send('/api/admin/' + b.dataset.d, 'DELETE'); site();
  });
  $('svcForm').addEventListener('submit', async e => {
    e.preventDefault();
    await fail(await fetch('/api/admin/services', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ icon: $('sIcon').value, name: $('sName').value }) }));
    e.target.reset(); site();
  });
  $('bgForm').addEventListener('submit', async e => { e.preventDefault(); await fail(await send('/api/admin/background', 'POST', new FormData(e.target))); e.target.reset(); site(); });
  $('bgReset').addEventListener('click', async () => { await send('/api/admin/background', 'DELETE'); site(); });
  site();
}
