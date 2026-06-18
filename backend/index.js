const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');

const app = express();
const PORT = process.env.PORT || 3000;
const META_TOKEN = process.env.META_TOKEN;
const API_KEY = process.env.API_KEY;
const GRAPH = 'https://graph.facebook.com/v21.0';

app.use(cors());
app.use(express.json());

// ── AUTH MIDDLEWARE ──────────────────────────────────────────────────────────
app.use((req, res, next) => {
  if (req.path === '/health') return next();
  const key = req.headers['x-api-key'];
  if (!key || key !== API_KEY) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  if (!META_TOKEN) {
    return res.status(500).json({ error: 'META_TOKEN não configurado no servidor.' });
  }
  next();
});

// ── HEALTH CHECK ─────────────────────────────────────────────────────────────
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'AQUA Meta Backend', version: '1.0.0' });
});

// ── HELPERS ───────────────────────────────────────────────────────────────────
async function graphGet(endpoint, params = {}) {
  const qs = new URLSearchParams({ ...params, access_token: META_TOKEN });
  const res = await fetch(`${GRAPH}/${endpoint}?${qs}`);
  const json = await res.json();
  if (json.error) throw new Error(json.error.message || JSON.stringify(json.error));
  return json;
}

async function graphPost(endpoint, body = {}) {
  const params = new URLSearchParams({ ...body, access_token: META_TOKEN });
  const res = await fetch(`${GRAPH}/${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString()
  });
  const json = await res.json();
  if (json.error) throw new Error(json.error.message || JSON.stringify(json.error));
  return json;
}

async function graphPatch(endpoint, body = {}) {
  const params = new URLSearchParams({ ...body, access_token: META_TOKEN });
  const res = await fetch(`${GRAPH}/${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString()
  });
  const json = await res.json();
  if (json.error) throw new Error(json.error.message || JSON.stringify(json.error));
  return json;
}

// ── PROXY GENÉRICO (GET) ──────────────────────────────────────────────────────
// Repassa qualquer GET à Graph API usando o token armazenado no servidor.
// O AdsPanel chama: GET /proxy?path=me&fields=id,name
//                   GET /proxy?path=act_123/campaigns&fields=id,name,...
app.get('/proxy', async (req, res) => {
  try {
    const { path, ...params } = req.query;
    if (!path) return res.status(400).json({ error: 'path é obrigatório.' });
    const result = await graphGet(path, params);
    res.json(result);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// ── PROXY GENÉRICO (POST) ─────────────────────────────────────────────────────
// Repassa qualquer POST à Graph API usando o token armazenado no servidor.
// O AdsPanel chama: POST /proxy  com body JSON { path: 'campaignId', status: 'PAUSED' }
app.post('/proxy', async (req, res) => {
  try {
    const { path, ...body } = req.body;
    if (!path) return res.status(400).json({ error: 'path é obrigatório.' });
    const result = await graphPost(path, body);
    res.json(result);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// ── CRIAR CAMPANHA ────────────────────────────────────────────────────────────
app.post('/campaign/create', async (req, res) => {
  try {
    const {
      account_id, name, objective,
      special_ad_categories = [],
      status = 'PAUSED', buying_type = 'AUCTION',
      daily_budget, lifetime_budget, start_time, stop_time
    } = req.body;
    if (!account_id || !name || !objective)
      return res.status(400).json({ error: 'account_id, name e objective são obrigatórios.' });
    const body = {
      name, objective,
      special_ad_categories: JSON.stringify(special_ad_categories),
      status, buying_type
    };
    if (daily_budget) body.daily_budget = Math.round(parseFloat(daily_budget) * 100);
    if (lifetime_budget) body.lifetime_budget = Math.round(parseFloat(lifetime_budget) * 100);
    if (start_time) body.start_time = start_time;
    if (stop_time) body.stop_time = stop_time;
    const result = await graphPost(`act_${account_id}/campaigns`, body);
    res.json({ success: true, campaign_id: result.id });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// ── CRIAR AD SET ──────────────────────────────────────────────────────────────
app.post('/adset/create', async (req, res) => {
  try {
    const {
      account_id, campaign_id, name, optimization_goal,
      billing_event = 'IMPRESSIONS',
      bid_strategy = 'LOWEST_COST_WITHOUT_CAP',
      daily_budget, lifetime_budget, start_time, stop_time,
      destination_type, promoted_object, targeting, status = 'PAUSED'
    } = req.body;
    if (!account_id || !campaign_id || !name || !optimization_goal)
      return res.status(400).json({ error: 'account_id, campaign_id, name e optimization_goal são obrigatórios.' });
    const body = {
      campaign_id, name, optimization_goal, billing_event, bid_strategy, status,
      targeting: typeof targeting === 'string' ? targeting : JSON.stringify(targeting)
    };
    if (daily_budget) body.daily_budget = Math.round(parseFloat(daily_budget) * 100);
    if (lifetime_budget) body.lifetime_budget = Math.round(parseFloat(lifetime_budget) * 100);
    if (start_time) body.start_time = start_time;
    if (stop_time) body.stop_time = stop_time;
    if (destination_type) body.destination_type = destination_type;
    if (promoted_object) body.promoted_object = typeof promoted_object === 'string' ? promoted_object : JSON.stringify(promoted_object);
    const result = await graphPost(`act_${account_id}/adsets`, body);
    res.json({ success: true, adset_id: result.id });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// ── CRIAR ANÚNCIO ─────────────────────────────────────────────────────────────
app.post('/ad/create', async (req, res) => {
  try {
    const { account_id, adset_id, name, creative, status = 'PAUSED' } = req.body;
    if (!account_id || !adset_id || !name || !creative)
      return res.status(400).json({ error: 'account_id, adset_id, name e creative são obrigatórios.' });
    const body = {
      name, adset_id,
      creative: typeof creative === 'string' ? creative : JSON.stringify(creative),
      status
    };
    const result = await graphPost(`act_${account_id}/ads`, body);
    res.json({ success: true, ad_id: result.id });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// ── CRIAR CRIATIVO ────────────────────────────────────────────────────────────
app.post('/creative/create', async (req, res) => {
  try {
    const { account_id, name, page_id, instagram_actor_id, object_story_spec, use_page_actor_override = true } = req.body;
    if (!account_id || !name || !object_story_spec)
      return res.status(400).json({ error: 'account_id, name e object_story_spec são obrigatórios.' });
    const body = {
      name,
      object_story_spec: typeof object_story_spec === 'string' ? object_story_spec : JSON.stringify(object_story_spec),
      use_page_actor_override
    };
    if (page_id) body.page_id = page_id;
    if (instagram_actor_id) body.instagram_actor_id = instagram_actor_id;
    const result = await graphPost(`act_${account_id}/adcreatives`, body);
    res.json({ success: true, creative_id: result.id });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// ── PAUSAR / ATIVAR ───────────────────────────────────────────────────────────
app.post('/entity/status', async (req, res) => {
  try {
    const { entity_id, status } = req.body;
    if (!entity_id || !status) return res.status(400).json({ error: 'entity_id e status são obrigatórios.' });
    if (!['ACTIVE', 'PAUSED'].includes(status)) return res.status(400).json({ error: 'status deve ser ACTIVE ou PAUSED.' });
    await graphPatch(entity_id, { status });
    res.json({ success: true, entity_id, status });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// ── EDITAR ORÇAMENTO ──────────────────────────────────────────────────────────
app.post('/entity/budget', async (req, res) => {
  try {
    const { entity_id, daily_budget, lifetime_budget } = req.body;
    if (!entity_id) return res.status(400).json({ error: 'entity_id é obrigatório.' });
    const body = {};
    if (daily_budget) body.daily_budget = Math.round(parseFloat(daily_budget) * 100);
    if (lifetime_budget) body.lifetime_budget = Math.round(parseFloat(lifetime_budget) * 100);
    if (!body.daily_budget && !body.lifetime_budget)
      return res.status(400).json({ error: 'Informe daily_budget ou lifetime_budget.' });
    await graphPatch(entity_id, body);
    res.json({ success: true, entity_id, ...body });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// ── EDITAR DATAS ──────────────────────────────────────────────────────────────
app.post('/entity/dates', async (req, res) => {
  try {
    const { entity_id, start_time, stop_time } = req.body;
    if (!entity_id) return res.status(400).json({ error: 'entity_id é obrigatório.' });
    const body = {};
    if (start_time) body.start_time = start_time;
    if (stop_time) body.stop_time = stop_time;
    await graphPatch(entity_id, body);
    res.json({ success: true, entity_id, ...body });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// ── DUPLICAR CAMPANHA ─────────────────────────────────────────────────────────
app.post('/campaign/duplicate', async (req, res) => {
  try {
    const { campaign_id, account_id, new_name, status = 'PAUSED' } = req.body;
    if (!campaign_id || !account_id) return res.status(400).json({ error: 'campaign_id e account_id são obrigatórios.' });
    const body = { status_option: status === 'ACTIVE' ? 'ACTIVE' : 'PAUSED' };
    if (new_name) body.rename_options = JSON.stringify({ rename_suffix: '', rename_prefix: '', new_name });
    const result = await graphPost(`${campaign_id}/copies`, { ...body, account_id: `act_${account_id}` });
    res.json({ success: true, new_campaign_id: result.copied_campaign_id || result.id });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// ── LISTAR CAMPANHAS ATIVAS ───────────────────────────────────────────────────
app.get('/campaigns/active', async (req, res) => {
  try {
    const { account_id } = req.query;
    if (!account_id) return res.status(400).json({ error: 'account_id é obrigatório.' });
    const result = await graphGet(`act_${account_id}/campaigns`, {
      fields: 'id,name,status,effective_status,objective,daily_budget,lifetime_budget,start_time,stop_time',
      filtering: JSON.stringify([{ field: 'campaign.effective_status', operator: 'IN', value: ['ACTIVE'] }])
    });
    res.json({ success: true, campaigns: result.data || [] });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// ── INSIGHTS ──────────────────────────────────────────────────────────────────
app.get('/insights', async (req, res) => {
  try {
    const { entity_id, fields = 'spend,impressions,clicks,cpm,ctr', date_preset = 'last_7d' } = req.query;
    if (!entity_id) return res.status(400).json({ error: 'entity_id é obrigatório.' });
    const result = await graphGet(`${entity_id}/insights`, { fields, date_preset });
    res.json({ success: true, data: result.data || [] });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// ── START ─────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`AQUA Meta Backend rodando na porta ${PORT}`);
  console.log(`META_TOKEN: ${META_TOKEN ? 'configurado ✓' : 'NÃO CONFIGURADO ✗'}`);
  console.log(`API_KEY: ${API_KEY ? 'configurada ✓' : 'NÃO CONFIGURADA ✗'}`);
});
