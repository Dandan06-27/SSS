const express = require('express');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();
const path = require('path');

const app = express();
const PORT = 3002;
const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const supabase = supabaseUrl && supabaseKey
  ? createClient(supabaseUrl, supabaseKey)
  : null;
const supabaseDatabase = supabaseUrl && process.env.SUPABASE_SERVICE_ROLE_KEY
  ? createClient(supabaseUrl, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  : supabase;

if (!supabase) {
  console.warn('Supabase is not configured. Add credentials to a .env file to enable employer persistence.');
}

app.use(express.json());

app.get('/api/health', (_request, response) => {
  response.json({ status: 'ok' });
});

app.post('/api/auth/login', async (request, response) => {
  if (!supabase) {
    return response.status(503).json({ error: 'Supabase is not configured.' });
  }

  const email = String(request.body?.email || '').trim().toLowerCase();
  const password = String(request.body?.password || '');
  if (!email || !password) {
    return response.status(400).json({ error: 'Email and password are required.' });
  }

  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error || !data.user) {
    return response.status(401).json({ error: 'Invalid email or password.' });
  }

  return response.json({
    user: {
      id: data.user.id,
      email: data.user.email,
      username: data.user.user_metadata?.username || data.user.email,
      role: data.user.app_metadata?.role || null,
      accessToken: data.session?.access_token || null,
    },
  });
});

const requireSuperAdmin = async (request, response) => {
  const authorization = request.headers.authorization || '';
  const accessToken = authorization.startsWith('Bearer ')
    ? authorization.slice('Bearer '.length)
    : '';

  if (!accessToken) {
    response.status(401).json({ error: 'Authentication is required.' });
    return null;
  }

  const { data, error } = await supabase.auth.getUser(accessToken);
  if (error || !data.user || data.user.app_metadata?.role !== 'Super Admin') {
    response.status(403).json({ error: 'Super Admin access is required.' });
    return null;
  }

  return data.user;
};

app.get('/api/employers', async (request, response) => {
  if (!supabase) {
    return response.status(503).json({ error: 'Supabase is not configured.' });
  }

  if (!(await requireSuperAdmin(request, response))) return;

  const { data, error } = await supabaseDatabase
    .from('employers')
    .select('*')
    .order('created_at', { ascending: true });

  if (error) {
    console.error(error);
    return response.status(500).json({ error: 'Unable to load employers.' });
  }

  return response.json(data);
});

app.post('/api/employers', async (request, response) => {
  if (!supabase) {
    return response.status(503).json({ error: 'Supabase is not configured.' });
  }

  const employer = request.body;
  const requiredFields = ['assigned_view', 'employer_number', 'employer_name', 'status'];

  if (requiredFields.some((field) => !employer[field])) {
    return response.status(400).json({ error: 'Missing required employer fields.' });
  }

  const { data, error } = await supabaseDatabase
    .from('employers')
    .insert(employer)
    .select()
    .single();

  if (error) {
    console.error(error);
    return response.status(500).json({ error: 'Unable to save employer.' });
  }

  return response.status(201).json(data);
});

app.delete('/api/employers', async (request, response) => {
  if (!supabase) {
    return response.status(503).json({ error: 'Supabase is not configured.' });
  }

  const ids = Array.isArray(request.body?.ids) ? request.body.ids : [];
  if (!ids.length || ids.some((id) => !Number.isInteger(Number(id)))) {
    return response.status(400).json({ error: 'Valid employer IDs are required.' });
  }

  const { error } = await supabaseDatabase
    .from('employers')
    .delete()
    .in('id', ids.map(Number));

  if (error) {
    console.error(error);
    return response.status(500).json({ error: 'Unable to delete employers.' });
  }

  return response.status(204).send();
});

app.use(express.static(__dirname));

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Frontend: http://localhost:${PORT}`);
    console.log(`Backend:  http://localhost:${PORT}/api/health`);
  });
}

module.exports = app;
