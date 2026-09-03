export function noStore(headers = {}){
  return {'Cache-Control':'no-store, max-age=0', ...headers};
}

export function safeMessage(error, fallback='Terjadi kesalahan server.'){
  if(process.env.NODE_ENV !== 'production' && error?.message) return error.message;
  return fallback;
}
