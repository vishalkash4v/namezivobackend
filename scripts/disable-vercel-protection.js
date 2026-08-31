#!/usr/bin/env node
/**
 * Disable Vercel Authentication (Deployment Protection) on a project.
 *
 * Usage:
 *   VERCEL_TOKEN=xxx node scripts/disable-vercel-protection.js [project-name]
 *
 * Get token: https://vercel.com/account/tokens
 */

const project = process.argv[2] || 'namezivobackend';
const token = process.env.VERCEL_TOKEN;

if (!token) {
  console.error('Missing VERCEL_TOKEN. Create one at https://vercel.com/account/tokens');
  process.exit(1);
}

async function main() {
  const teamId = process.env.VERCEL_TEAM_ID;
  const qs = teamId ? `?teamId=${teamId}` : '';

  const res = await fetch(`https://api.vercel.com/v9/projects/${project}${qs}`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ ssoProtection: null }),
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    console.error('Failed:', res.status, data);
    process.exit(1);
  }

  console.log(`✓ Vercel Authentication disabled for project: ${project}`);
  console.log('  Test: curl https://YOUR_DEPLOYMENT.vercel.app/health');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
