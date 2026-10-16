function generateSubToken() {
  const raw = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(raw).map(b => b.toString(16).padStart(2, '0')).join('');
}
export { generateSubToken };
