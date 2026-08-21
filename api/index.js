const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const supabase = supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey) : null;
const supabaseDatabase = supabaseUrl && process.env.SUPABASE_SERVICE_ROLE_KEY
	? createClient(supabaseUrl, process.env.SUPABASE_SERVICE_ROLE_KEY, {
		auth: { persistSession: false, autoRefreshToken: false },
	})
	: supabase;

const readBody = (req) => new Promise((resolve, reject) => {
	let body = '';
	req.on('data', (chunk) => { body += chunk; });
	req.on('end', () => {
		try { resolve(body ? JSON.parse(body) : {}); } catch (e) { reject(e); }
	});
	req.on('error', reject);
});

module.exports = async (req, res) => {
	const pathname = new URL(req.url, `http://${req.headers.host}`).pathname;

	// Health
	if (req.method === 'GET' && pathname.endsWith('/api/health')) {
		res.statusCode = 200;
		res.setHeader('Content-Type', 'application/json');
		res.end(JSON.stringify({ status: 'ok' }));
		return;
	}

	// Login
	if (req.method === 'POST' && pathname.endsWith('/api/auth/login')) {
		if (!supabase) {
			res.statusCode = 503;
			res.setHeader('Content-Type', 'application/json');
			res.end(JSON.stringify({ error: 'Supabase is not configured.' }));
			return;
		}

		try {
			const body = await readBody(req);
			const email = String(body?.email || '').trim().toLowerCase();
			const password = String(body?.password || '');
			if (!email || !password) {
				res.statusCode = 400;
				res.setHeader('Content-Type', 'application/json');
				res.end(JSON.stringify({ error: 'Email and password are required.' }));
				return;
			}

			const { data, error } = await supabase.auth.signInWithPassword({ email, password });
			if (error || !data.user) {
				res.statusCode = 401;
				res.setHeader('Content-Type', 'application/json');
				res.end(JSON.stringify({ error: 'Invalid email or password.' }));
				return;
			}

			res.statusCode = 200;
			res.setHeader('Content-Type', 'application/json');
			res.end(JSON.stringify({ user: {
				id: data.user.id,
				email: data.user.email,
				username: data.user.user_metadata?.username || data.user.email,
				role: data.user.app_metadata?.role || null,
				accessToken: data.session?.access_token || null,
			} }));
			return;
		} catch (err) {
			res.statusCode = 500;
			res.setHeader('Content-Type', 'application/json');
			res.end(JSON.stringify({ error: 'Invalid request body.' }));
			return;
		}
	}

	// Employers endpoints (require Super Admin)
	if (pathname.startsWith('/api/employers')) {
		if (!supabase) {
			res.statusCode = 503;
			res.setHeader('Content-Type', 'application/json');
			res.end(JSON.stringify({ error: 'Supabase is not configured.' }));
			return;
		}

		const authHeader = req.headers.authorization || '';
		const token = authHeader.startsWith('Bearer ') ? authHeader.slice('Bearer '.length) : '';
		if (!token) {
			res.statusCode = 401;
			res.setHeader('Content-Type', 'application/json');
			res.end(JSON.stringify({ error: 'Authentication is required.' }));
			return;
		}

		const { data: userData, error: userErr } = await supabase.auth.getUser(token);
		if (userErr || !userData.user || userData.user.app_metadata?.role !== 'Super Admin') {
			res.statusCode = 403;
			res.setHeader('Content-Type', 'application/json');
			res.end(JSON.stringify({ error: 'Super Admin access is required.' }));
			return;
		}

		if (req.method === 'GET') {
			const { data, error } = await supabaseDatabase.from('employers').select('*').order('created_at', { ascending: true });
			if (error) {
				res.statusCode = 500;
				res.setHeader('Content-Type', 'application/json');
				res.end(JSON.stringify({ error: 'Unable to load employers.' }));
				return;
			}
			res.statusCode = 200;
			res.setHeader('Content-Type', 'application/json');
			res.end(JSON.stringify(data));
			return;
		}

		if (req.method === 'POST') {
			try {
				const body = await readBody(req);
				const employer = body;
				const requiredFields = ['assigned_view', 'employer_number', 'employer_name', 'status'];
				if (requiredFields.some((f) => !employer[f])) {
					res.statusCode = 400;
					res.setHeader('Content-Type', 'application/json');
					res.end(JSON.stringify({ error: 'Missing required employer fields.' }));
					return;
				}
				const { data, error } = await supabaseDatabase.from('employers').insert(employer).select().single();
				if (error) {
					res.statusCode = 500;
					res.setHeader('Content-Type', 'application/json');
					res.end(JSON.stringify({ error: 'Unable to save employer.' }));
					return;
				}
				res.statusCode = 201;
				res.setHeader('Content-Type', 'application/json');
				res.end(JSON.stringify(data));
				return;
			} catch (err) {
				res.statusCode = 400;
				res.setHeader('Content-Type', 'application/json');
				res.end(JSON.stringify({ error: 'Invalid request body.' }));
				return;
			}
		}

		if (req.method === 'DELETE') {
			try {
				const body = await readBody(req);
				const ids = Array.isArray(body?.ids) ? body.ids : [];
				if (!ids.length || ids.some((id) => !Number.isInteger(Number(id)))) {
					res.statusCode = 400;
					res.setHeader('Content-Type', 'application/json');
					res.end(JSON.stringify({ error: 'Valid employer IDs are required.' }));
					return;
				}
				const { error } = await supabaseDatabase.from('employers').delete().in('id', ids.map(Number));
				if (error) {
					res.statusCode = 500;
					res.setHeader('Content-Type', 'application/json');
					res.end(JSON.stringify({ error: 'Unable to delete employers.' }));
					return;
				}
				res.statusCode = 204;
				res.end();
				return;
			} catch (err) {
				res.statusCode = 400;
				res.setHeader('Content-Type', 'application/json');
				res.end(JSON.stringify({ error: 'Invalid request body.' }));
				return;
			}
		}
	}

	// Fallback for unknown API paths
	res.statusCode = 404;
	res.setHeader('Content-Type', 'application/json');
	res.end(JSON.stringify({ error: 'Not found' }));
};
