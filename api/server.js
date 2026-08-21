const express = require('express');
const crypto = require('node:crypto');
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

const RBAC_ALLOWED_ROLES = ['Super Admin', 'Admin', 'Assistant Officer 1', 'Assistant Officer 2', 'Assistant Officer 3'];

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

const validateRbacLogin = (profile, allowedRoles = RBAC_ALLOWED_ROLES) => {
  if (!profile) return { valid: false, code: 'ACCOUNT_NOT_FOUND' };
  if (profile.is_active === false || profile.isActive === false) return { valid: false, code: 'ACCOUNT_INACTIVE' };

  const role = profile.role || profile.user_role || null;
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

app.get('/api/employers', async (request, response) => {
  if (!supabase) return response.status(503).json({ error: 'Supabase is not configured.' });

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
  if (!supabase) return response.status(503).json({ error: 'Supabase is not configured.' });

  const employer = request.body;
  const requiredFields = ['assigned_view', 'employer_number', 'employer_name', 'status'];

  if (requiredFields.some((field) => !employer[field])) return response.status(400).json({ error: 'Missing required employer fields.' });

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
