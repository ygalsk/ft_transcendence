export function createWebSocket(token: string, baseWs: string) {
  const url = `${baseWs}?token=${encodeURIComponent(token)}`;
  const ws = new WebSocket(url);
  return ws;
}
