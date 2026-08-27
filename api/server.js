const express = require('express');
const crypto = require('node:crypto');
const path = require('node:path');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const app = express();
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
const APP_SESSION_SECRET = process.env.APP_SESSION_SECRET || 'sss-local-dev-secret-change-me';

const RBAC_ALLOWED_ROLES = ['Super Admin', 'Admin', 'Account Officer 1', 'Account Officer 2', 'Account Officer 3'];
const isMissingPersonReceivedColumn = (error) => error?.code === '42703'
  && String(error.message || '').includes('person_received');

const hashPassword = (password) => crypto.createHash('sha256').update(String(password)).digest('hex');

const signAppToken = (payload) => {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'sss-rbac' })).toString('base64url');
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = crypto.createHmac('sha256', APP_SESSION_SECRET).update(`${header}.${body}`).digest('base64url');
  return `${header}.${body}.${signature}`;
};

const verifyAppToken = (token) => {
  if (!token || typeof token !== 'string') return null;

  const parts = token.split('.');
  if (parts.length !== 3) return null;

  const [header, body, signature] = parts;
  const expectedSignature = crypto.createHmac('sha256', APP_SESSION_SECRET).update(`${header}.${body}`).digest('base64url');
  if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature))) return null;

  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    if (!payload || !payload.userId || !payload.role) return null;
    if (payload.expiresAt && Number(payload.expiresAt) < Date.now()) return null;
    return payload;
  } catch (_error) {
    return null;
  }
};

const normalizeRole = (role) => String(role || '')
  .replace(/^Assistant Officer ([1-3])$/, 'Account Officer $1')
  .replace(/^Account Assistant ([1-3])$/, 'Account Officer $1');

const officerViewForRole = (role) => {
  const normalizedRole = normalizeRole(role);
  return /^Account Officer [1-3]$/.test(normalizedRole)
    ? normalizedRole.replace('Account Officer ', 'AO')
    : null;
};

const validateRbacLogin = (profile, allowedRoles = RBAC_ALLOWED_ROLES) => {
  if (!profile) return { valid: false, code: 'ACCOUNT_NOT_FOUND' };
  if (profile.is_active === false || profile.isActive === false) return { valid: false, code: 'ACCOUNT_INACTIVE' };

  const role = normalizeRole(profile.role || profile.user_role || null);
  if (!role) return { valid: false, code: 'ROLE_NOT_FOUND' };
  if (!allowedRoles.includes(role)) return { valid: false, code: 'ROLE_NOT_ALLOWED' };

  return { valid: true, role };
};

const findUserByLoginIdentifier = async (loginIdentifier, supabaseClient) => {
  const normalizedIdentifier = String(loginIdentifier || '').trim().toLowerCase();
  if (!normalizedIdentifier) return null;

  const { data, error } = await supabaseClient
    .from('users')
    .select('*');

  if (error) {
    console.error('User list lookup error:', error);
    throw error;
  }

  return (data || []).find((user) => {
    const email = String(user.email || '').trim().toLowerCase();
    const username = String(user.username || '').trim().toLowerCase();
    return email === normalizedIdentifier || username === normalizedIdentifier;
  }) || null;
};

if (!supabase) {
  console.warn('Supabase is not configured. Add credentials to environment to enable employer persistence.');
}

app.use(express.json());
app.use(express.static(path.join(__dirname, '..')));

app.get('/api/health', (_request, response) => {
  response.json({ status: 'ok' });
});

app.post('/api/auth/login', async (request, response) => {
  if (!supabase || !supabaseDatabase) return response.status(503).json({ error: 'Supabase is not configured.' });

  const loginIdentifier = String(request.body?.email || request.body?.username || '').trim();
  const password = String(request.body?.password || '');
  if (!loginIdentifier || !password) return response.status(400).json({ error: 'Email/username and password are required.' });

  let userRecord;
  try {
    userRecord = await findUserByLoginIdentifier(loginIdentifier, supabaseDatabase);
  } catch (userError) {
    console.error('User lookup error:', userError);
    return response.status(500).json({ error: 'Unable to verify account access.' });
  }

  const validation = validateRbacLogin(userRecord, RBAC_ALLOWED_ROLES);
  if (!validation.valid) {
    const accountErrors = {
      ACCOUNT_NOT_FOUND: 'No active account was found for that username/email.',
      ACCOUNT_INACTIVE: 'This account is inactive and cannot sign in.',
      ROLE_NOT_FOUND: 'This account does not have a valid access role.',
      ROLE_NOT_ALLOWED: 'This account does not have permission to access this system.',
    };

    return response.status(validation.code === 'ACCOUNT_NOT_FOUND' ? 401 : 403).json({
      error: accountErrors[validation.code] || 'Access denied.',
      code: validation.code,
    });
  }

  userRecord.role = validation.role;

  if (!userRecord.password_hash || hashPassword(password) !== userRecord.password_hash) {
    return response.status(401).json({ error: 'Invalid email or password.' });
  }

  const accessToken = signAppToken({
    userId: userRecord.id,
    email: userRecord.email,
    username: userRecord.username,
    role: userRecord.role,
    expiresAt: Date.now() + 8 * 60 * 60 * 1000,
  });

  return response.json({
    user: {
      id: userRecord.id,
      email: userRecord.email,
      username: userRecord.username || userRecord.email,
      role: userRecord.role,
      accessToken,
    },
  });
});

app.get('/api/users', async (request, response) => {
  if (!supabase) return response.status(503).json({ error: 'Supabase is not configured.' });
  if (!(await requireSuperAdmin(request, response))) return;

  const { data, error } = await supabaseDatabase
    .from('users')
    .select('id, username, email, full_name, role, is_active')
    .order('role', { ascending: true })
    .order('full_name', { ascending: true });

  if (error) {
    console.error(error);
    return response.status(500).json({ error: 'Unable to load user accounts.' });
  }

  return response.json(data || []);
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

  const payload = verifyAppToken(accessToken);
  if (!payload || payload.role !== 'Super Admin') {
    response.status(403).json({ error: 'Super Admin access is required.' });
    return null;
  }

  return payload;
};

const requireAuthenticatedUser = async (request, response) => {
  const authorization = request.headers.authorization || '';
  const accessToken = authorization.startsWith('Bearer ')
    ? authorization.slice('Bearer '.length)
    : '';
  const payload = verifyAppToken(accessToken);
  if (payload && RBAC_ALLOWED_ROLES.includes(normalizeRole(payload.role))) return payload;

  if (supabase) {
    const { data, error } = await supabase.auth.getUser(accessToken);
    const role = normalizeRole(data.user?.app_metadata?.role);
    if (!error && data.user && RBAC_ALLOWED_ROLES.includes(role)) {
      return { userId: data.user.id, role, email: data.user.email };
    }
  }

  response.status(401).json({ error: 'Authentication is required.' });
  return null;
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
    return response.status(500).json({ error: 'Unable to load calendar events.' });
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
    created_by: user.userId,
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

app.get('/api/employers', async (request, response) => {
  if (!supabase) return response.status(503).json({ error: 'Supabase is not configured.' });

  const user = await requireAuthenticatedUser(request, response);
  if (!user) return;

  let employerQuery = supabaseDatabase
    .from('employers')
    .select('*')
    .order('created_at', { ascending: true });
  const officerView = officerViewForRole(user.role);
  if (officerView) employerQuery = employerQuery.eq('assigned_view', officerView);

  const { data, error } = await employerQuery;

  if (error) {
    console.error(error);
    return response.status(500).json({ error: 'Unable to load employers.' });
  }

  return response.json(data);
});

app.get('/api/employer-summary', async (request, response) => {
  if (!supabase) return response.status(503).json({ error: 'Supabase is not configured.' });

  const user = await requireAuthenticatedUser(request, response);
  if (!user) return;

  const { data, error } = await supabaseDatabase
    .from('employers')
    .select('assigned_view, status, total_amount');
  if (error) {
    console.error(error);
    return response.status(500).json({ error: 'Unable to load employer summary.' });
  }

  const summary = ['AO1', 'AO2', 'AO3'].reduce((result, viewName) => {
    const employers = (data || []).filter((employer) => employer.assigned_view === viewName);
    const settled = employers.filter((employer) => employer.status?.toLowerCase() === 'settled').length;
    const unsettled = employers.filter((employer) => employer.status?.toLowerCase() === 'unsettled').length;
    const registered = employers.filter((employer) => ['registed', 'registered'].includes(employer.status?.toLowerCase())).length;
    const unregistered = employers.filter((employer) => ['not yet registered', 'unregistered'].includes(employer.status?.toLowerCase())).length;
    const billed = employers.reduce((total, employer) => total + Number(employer.total_amount || 0), 0);
    const settledAmount = employers
      .filter((employer) => employer.status?.toLowerCase() === 'settled')
      .reduce((total, employer) => total + Number(employer.total_amount || 0), 0);
    const unsettledAmount = employers
      .filter((employer) => employer.status?.toLowerCase() === 'unsettled')
      .reduce((total, employer) => total + Number(employer.total_amount || 0), 0);
    result[viewName] = {
      total: employers.length,
      settled,
      unsettled,
      completion: `${employers.length ? ((settled / employers.length) * 100).toFixed(2) : '0.00'}%`,
      billed: billed.toFixed(2),
      settledAmount: settledAmount.toFixed(2),
      unsettledAmount: unsettledAmount.toFixed(2),
      registered,
      unregistered,
    };
    return result;
  }, {});

  return response.json(summary);
});

app.post('/api/employers', async (request, response) => {
  if (!supabase) return response.status(503).json({ error: 'Supabase is not configured.' });

  const user = await requireAuthenticatedUser(request, response);
  if (!user) return;

  const employer = { ...request.body };
  const officerView = officerViewForRole(user.role);
  if (officerView && employer.assigned_view !== officerView) {
    return response.status(403).json({ error: `Account Assistant access is limited to ${officerView}.` });
  }
  const requiredFields = ['assigned_view', 'employer_number', 'employer_name', 'status'];

  if (requiredFields.some((field) => !employer[field])) return response.status(400).json({ error: 'Missing required employer fields.' });

  const { data, error } = await supabaseDatabase
    .from('employers')
    .insert(employer)
    .select()
    .single();

  if (error) {
    console.error(error);
    if (isMissingPersonReceivedColumn(error)) {
      return response.status(500).json({ error: 'Database setup is incomplete. Run: alter table public.employers add column if not exists person_received text;' });
    }
    return response.status(500).json({ error: 'Unable to save employer.' });
  }

  return response.status(201).json(data);
});

app.patch('/api/employers', async (request, response) => {
  if (!supabase) return response.status(503).json({ error: 'Supabase is not configured.' });
  const user = await requireAuthenticatedUser(request, response);
  if (!user) return;

  const id = Number(request.body?.id);
  const submittedEmployer = request.body?.employer;
  if (!Number.isInteger(id) || !submittedEmployer || !submittedEmployer.employer_number || !submittedEmployer.employer_name || !submittedEmployer.status) {
    return response.status(400).json({ error: 'Valid employer data is required.' });
  }

  const employerFields = [
    'employer_number', 'employer_name', 'address', 'principal', 'penalty', 'interest', 'total_amount',
    'billing_date', 'coverage_date', 'soa_date', 'employee_count', 'payment_principal', 'payment_interest',
    'payment_penalty', 'payment_total', 'soa2_date', 'soa3_date', 'legal_referral_date', 'demand_letter_date',
    'demand_letter_received_date', 'person_received', 'handling_lawyer', 'docket_number', 'case_date', 'status',
  ];
  const employer = Object.fromEntries(employerFields
    .filter((field) => Object.prototype.hasOwnProperty.call(submittedEmployer, field))
    .map((field) => [field, submittedEmployer[field]]));

  let employerQuery = supabaseDatabase
    .from('employers')
    .update(employer)
    .eq('id', id);
  const officerView = officerViewForRole(user.role);
  if (officerView) employerQuery = employerQuery.eq('assigned_view', officerView);

  const { data, error } = await employerQuery.select().single();

  if (error) {
    console.error(error);
    if (error.code === 'PGRST116') {
      return response.status(404).json({ error: 'Employer was not found in your assigned view.' });
    }
    if (isMissingPersonReceivedColumn(error)) {
      return response.status(500).json({ error: 'Database setup is incomplete. Run: alter table public.employers add column if not exists person_received text;' });
    }
    return response.status(500).json({ error: 'Unable to update employer.' });
  }

  return response.json(data);
});

app.delete('/api/employers', async (request, response) => {
  if (!supabase) return response.status(503).json({ error: 'Supabase is not configured.' });

  const ids = Array.isArray(request.body?.ids) ? request.body.ids : [];
  if (!ids.length || ids.some((id) => !Number.isInteger(Number(id)))) return response.status(400).json({ error: 'Valid employer IDs are required.' });

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

module.exports = app;
module.exports.validateRbacLogin = validateRbacLogin;

if (require.main === module) {
  const port = Number(process.env.PORT) || 3002;
  app.listen(port, '127.0.0.1', () => {
    console.log(`SSS dashboard running at http://localhost:${port}`);
  });
}
