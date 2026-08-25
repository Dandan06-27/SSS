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

const requireAuthenticatedUser = async (request, response) => {
  const authorization = request.headers.authorization || '';
  const accessToken = authorization.startsWith('Bearer ')
    ? authorization.slice('Bearer '.length)
    : '';
  if (!accessToken) {
    response.status(401).json({ error: 'Authentication is required.' });
    return null;
  }

  const { data, error } = await supabase.auth.getUser(accessToken);
  if (error || !data.user) {
    response.status(401).json({ error: 'Authentication is required.' });
    return null;
  }
  return data.user;
};

app.get('/api/calendar-events', async (request, response) => {
  if (!supabase) return response.status(503).json({ error: 'Supabase is not configured.' });
  if (!(await requireAuthenticatedUser(request, response))) return;

  const { data, error } = await supabaseDatabase
    .from('calendar_events')
    .select('id, title, event_date, start_time, end_time, description, created_by, created_at')
    .order('event_date', { ascending: true })
    .order('start_time', { ascending: true });
  if (error) {
    console.error(error);
    return response.status(500).json({ error: 'Unable to load calendar events. Run the calendar_events schema migration.' });
  }
  return response.json(data);
});

app.post('/api/calendar-events', async (request, response) => {
  if (!supabase) return response.status(503).json({ error: 'Supabase is not configured.' });
  const user = await requireAuthenticatedUser(request, response);
  if (!user) return;

  const submittedEvent = request.body || {};
  const event = {
    title: String(submittedEvent.title || '').trim(),
    event_date: submittedEvent.date,
    start_time: submittedEvent.startTime,
    end_time: submittedEvent.endTime,
    description: String(submittedEvent.description || '').trim() || null,
    created_by: user.id,
  };
  if (!event.title || !event.event_date || !event.start_time || !event.end_time || event.end_time <= event.start_time) {
    return response.status(400).json({ error: 'Valid event title, date, and time range are required.' });
  }

  const { data, error } = await supabaseDatabase
    .from('calendar_events')
    .insert(event)
    .select('id, title, event_date, start_time, end_time, description, created_by, created_at')
    .single();
  if (error) {
    console.error(error);
    return response.status(500).json({ error: 'Unable to save calendar event. Run the calendar_events schema migration.' });
  }
  return response.status(201).json(data);
});

app.get('/api/users', async (request, response) => {
  if (!supabase) {
    return response.status(503).json({ error: 'Supabase is not configured.' });
  }

  if (!(await requireSuperAdmin(request, response))) return;

  const { data, error } = await supabase.auth.admin.listUsers({ perPage: 1000 });
  if (error) {
    console.error(error);
    return response.status(500).json({ error: 'Unable to load user accounts.' });
  }

  return response.json((data.users || []).map((user) => ({
    id: user.id,
    username: user.user_metadata?.username || user.email,
    email: user.email,
    role: user.app_metadata?.role || 'Unassigned',
  })));
});

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

app.patch('/api/employers', async (request, response) => {
  if (!supabase) return response.status(503).json({ error: 'Supabase is not configured.' });
  if (!(await requireSuperAdmin(request, response))) return;

  const id = Number(request.body?.id);
  const submittedEmployer = request.body?.employer;
  if (!Number.isInteger(id) || !submittedEmployer || !submittedEmployer.employer_number || !submittedEmployer.employer_name || !submittedEmployer.status) {
    return response.status(400).json({ error: 'Valid employer data is required.' });
  }

  const employerFields = [
    'assigned_view', 'employer_number', 'employer_name', 'address', 'employee_count', 'principal', 'penalty', 'interest', 'total_amount',
    'payment_principal', 'payment_interest', 'payment_penalty', 'payment_total', 'billing_date', 'coverage_date', 'soa_date',
    'soa2_date', 'soa3_date', 'legal_referral_date', 'demand_letter_date', 'demand_letter_received_date', 'handling_lawyer',
    'docket_number', 'case_date', 'person_received', 'status',
  ];
  const employer = Object.fromEntries(employerFields
    .filter((field) => Object.prototype.hasOwnProperty.call(submittedEmployer, field))
    .map((field) => [field, submittedEmployer[field]]));

  const { data, error } = await supabaseDatabase
    .from('employers')
    .update(employer)
    .eq('id', id)
    .select()
    .single();
  if (error) {
    console.error(error);
    return response.status(500).json({ error: 'Unable to update employer.' });
  }
  return response.json(data);
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
