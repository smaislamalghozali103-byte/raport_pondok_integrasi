export function requiredEnv(names){
  const missing = names.filter(n => !process.env[n] || !String(process.env[n]).trim());
  return {ok: missing.length === 0, missing};
}

export function assertServerEnv(){
  const result = requiredEnv([
    'FIREBASE_PROJECT_ID','FIREBASE_CLIENT_EMAIL','FIREBASE_PRIVATE_KEY','SESSION_SECRET',
    'GOOGLE_CLIENT_EMAIL','GOOGLE_PRIVATE_KEY'
  ]);
  if(!result.ok) throw new Error(`Environment belum lengkap: ${result.missing.join(', ')}`);
  if(String(process.env.SESSION_SECRET).length < 32) throw new Error('SESSION_SECRET minimal 32 karakter.');
}
