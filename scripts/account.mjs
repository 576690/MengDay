import { createClient } from '@supabase/supabase-js';
import { randomBytes } from 'node:crypto';
const [command, email] = process.argv.slice(2);
if (!['create', 'reset'].includes(command) || !email) {
  console.error('Usage: npm run account -- create|reset email@example.com');
  process.exit(1);
}
if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY)
  throw Error('Configure .env.admin first');
const client = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const password = randomBytes(18).toString('base64url');
let result;
if (command === 'create')
  result = await client.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    app_metadata: { force_password_change: true },
  });
else {
  let user;
  for (let page = 1; !user; page++) {
    const { data, error } = await client.auth.admin.listUsers({ page, perPage: 100 });
    if (error) throw error;
    user = data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
    if (data.users.length < 100 && !user) throw Error('User not found');
  }
  result = await client.auth.admin.updateUserById(user.id, { password });
  if (result.error) throw result.error;
  // Separate call after the password trigger has run.
  result = await client.auth.admin.updateUserById(user.id, {
    app_metadata: { ...user.app_metadata, force_password_change: true },
  });
}
if (result.error) throw result.error;
console.log(
  `Account ${command}: ${email}\nTemporary password (share privately): ${password}\nFirst login requires a password change.`,
);
