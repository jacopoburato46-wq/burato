const config = window.BURATO_CONFIG || {};
const supabaseUrl = config.supabaseUrl;
const supabaseAnonKey = config.supabaseAnonKey;

const els = {
  buratoPrice: document.getElementById('burato-price'),
  marketPrice: document.getElementById('market-price'),
  totalGrams: document.getElementById('total-grams'),
  nextAlert: document.getElementById('next-alert'),
  lastUpdate: document.getElementById('last-update'),
  marketNote: document.getElementById('market-note'),
  entriesBody: document.getElementById('entries-body'),
  countEntries: document.getElementById('count-entries'),
  alertStatus: document.getElementById('alert-status'),
  form: document.getElementById('entry-form'),
  submitButton: document.getElementById('submit-button'),
  resetButton: document.getElementById('reset-button'),
  resetNote: document.getElementById('reset-note'),
};

const euroNum = (n, digits = 2) => new Intl.NumberFormat('it-IT', { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(Number(n || 0));
const dt = (value) => {
  const d = new Date(value);
  return {
    date: d.toLocaleDateString('it-IT'),
    time: d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' }),
  };
};

function setStatus(text, type = '') {
  els.alertStatus.textContent = text;
  els.alertStatus.className = `pill ${type}`.trim();
}

function escapeHtml(str) {
  return String(str ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

if (!supabaseUrl || supabaseUrl.includes('INCOLLA_') || !supabaseAnonKey || supabaseAnonKey.includes('INCOLLA_')) {
  setStatus('Inserisci URL e key Supabase in public/config.js', 'error');
}

const supabase = window.supabase && supabaseUrl && supabaseAnonKey && !supabaseUrl.includes('INCOLLA_')
  ? window.supabase.createClient(supabaseUrl, supabaseAnonKey)
  : null;

const STEP = 100;

async function fetchJSON(url, options) {
  const res = await fetch(url, options);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || 'Errore richiesta');
  }
  return res.json();
}

function renderEntries(entries) {
  if (!entries.length) {
    els.entriesBody.innerHTML = '<tr><td colspan="4" class="empty-state">Nessun ritiro registrato</td></tr>';
    return;
  }

  els.entriesBody.innerHTML = entries.map((entry) => {
    const when = dt(entry.created_at);
    return `
      <tr>
        <td>${when.date}</td>
        <td>${when.time}</td>
        <td>${escapeHtml(entry.store)}</td>
        <td class="right"><strong>${euroNum(entry.grams)} g</strong></td>
      </tr>
    `;
  }).join('');
}

function renderSummary(entries, lastResetAt) {
  const visibleEntries = lastResetAt
    ? entries.filter((entry) => new Date(entry.created_at).getTime() > new Date(lastResetAt).getTime())
    : entries.slice();

  visibleEntries.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  const totalGrams = visibleEntries.reduce((sum, item) => sum + Number(item.grams || 0), 0);
  const nextAlertAt = (Math.floor(totalGrams / STEP) + 1) * STEP || STEP;
  const remaining = Math.max(0, nextAlertAt - totalGrams);

  els.totalGrams.textContent = `${euroNum(totalGrams)} g`;
  els.nextAlert.textContent = `Mancano ${euroNum(remaining)} g al prossimo alert (${euroNum(nextAlertAt, 0)} g)`;
  els.countEntries.textContent = `${visibleEntries.length} movimenti`;
  els.resetNote.textContent = lastResetAt
    ? `Ultimo reset: ${new Date(lastResetAt).toLocaleString('it-IT')}`
    : 'Azzera tabella e totale corrente, mantenendo lo storico in database.';
  renderEntries(visibleEntries);
}

function renderPrice(data) {
  els.marketPrice.textContent = `${euroNum(data.marketPrice)} €/g`;
  els.buratoPrice.textContent = `${euroNum(data.buratoPrice)} €/g`;
  els.lastUpdate.textContent = data.fetchedAtDisplay || '—';
  els.marketNote.textContent = `Oro 24kt live al grammo · diff. ${euroNum(data.marketPrice - data.buratoPrice)} €/g`;
}

async function loadAll() {
  if (!supabase) return;
  try {
    const [price, entriesRes, stateRes] = await Promise.all([
      fetchJSON('/api/gold-price'),
      supabase.from('gold_entries').select('*').order('created_at', { ascending: false }),
      supabase.from('gold_state').select('*').eq('id', 1).single(),
    ]);

    if (entriesRes.error) throw entriesRes.error;
    if (stateRes.error) throw stateRes.error;

    renderPrice(price);
    renderSummary(entriesRes.data || [], stateRes.data?.last_reset_at || null);
    setStatus('Sincronizzato', 'success');
  } catch (err) {
    console.error(err);
    setStatus('Errore di caricamento', 'error');
  }
}

els.form.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!supabase) return;

  const store = document.getElementById('store').value;
  const grams = Number(document.getElementById('grams').value);

  if (!grams || grams <= 0) {
    setStatus('Inserisci grammi validi', 'error');
    return;
  }

  els.submitButton.disabled = true;
  setStatus('Salvataggio…');

  try {
    const { error } = await supabase.from('gold_entries').insert([{ store, grams }]);
    if (error) throw error;

    document.getElementById('grams').value = '';
    await loadAll();
    setStatus('Ritiro salvato', 'success');
  } catch (err) {
    console.error(err);
    setStatus('Errore salvataggio', 'error');
  } finally {
    els.submitButton.disabled = false;
  }
});

els.resetButton.addEventListener('click', async () => {
  if (!supabase) return;
  const confirmed = window.confirm('Confermi il reset dopo fusione?');
  if (!confirmed) return;

  els.resetButton.disabled = true;
  setStatus('Reset in corso…');

  try {
    const { error } = await supabase
      .from('gold_state')
      .update({ last_reset_at: new Date().toISOString() })
      .eq('id', 1);

    if (error) throw error;
    await loadAll();
    setStatus('Reset eseguito', 'success');
  } catch (err) {
    console.error(err);
    setStatus('Errore reset', 'error');
  } finally {
    els.resetButton.disabled = false;
  }
});

loadAll();
