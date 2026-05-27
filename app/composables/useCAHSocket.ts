/**
 * Manages the raw WebSocket connection to the CAH server.
 * Handles connect, reconnect (up to 3 attempts), keepalive PING, and clean teardown.
 */
import type { ClientMessage, ServerMessage } from '../../shared/types/cah'

function genId(): string {
  return crypto.randomUUID().replace(/-/g, '').slice(0, 16)
}

export function useCAHSocket(
  roomId: Ref<string> | string,
  playerName: Ref<string> | string,
) {
  // ── Stable player ID persisted in localStorage ─────────────────────────────
  const playerId = ref('')

  onMounted(() => {
    let id = localStorage.getItem('cah-player-id')
    if (!id) { id = genId(); localStorage.setItem('cah-player-id', id) }
    playerId.value = id
  })

  // ── Reactive state ─────────────────────────────────────────────────────────
  const status = ref<'connecting' | 'connected' | 'disconnected' | 'error'>('disconnected')
  const lastMessage = ref<ServerMessage | null>(null)

  // ── Internals ──────────────────────────────────────────────────────────────
  let ws: WebSocket | null = null
  let pingTimer: ReturnType<typeof setInterval> | null = null
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null
  let attempts = 0
  let closing = false    // true when the composable is intentionally tearing down

  function buildUrl(): string {
    const rid  = toValue(roomId)
    const name = encodeURIComponent((toValue(playerName) || 'Player').slice(0, 32))
    const pid  = playerId.value
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:'
    return `${proto}//${location.host}/games/cah/ws?roomId=${rid}&playerId=${pid}&name=${name}`
  }

  function connect() {
    if (!import.meta.client || !playerId.value) return
    closing = false
    status.value = 'connecting'

    ws = new WebSocket(buildUrl())

    ws.onopen = () => {
      status.value = 'connected'
      attempts = 0
      pingTimer = setInterval(() => send({ type: 'PING' }), 25_000)
    }

    ws.onmessage = (ev) => {
      try {
        lastMessage.value = JSON.parse(ev.data as string) as ServerMessage
      } catch { /* ignore malformed frames */ }
    }

    ws.onclose = () => {
      status.value = 'disconnected'
      clearPing()
      if (!closing) scheduleReconnect()
    }

    ws.onerror = () => {
      status.value = 'error'
    }
  }

  function scheduleReconnect() {
    if (attempts >= 3) return
    const delay = [1_500, 3_000, 5_000][attempts] ?? 5_000
    attempts++
    reconnectTimer = setTimeout(connect, delay)
  }

  function send(msg: ClientMessage) {
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(msg))
    }
  }

  function clearPing() {
    if (pingTimer) { clearInterval(pingTimer); pingTimer = null }
  }

  function disconnect() {
    closing = true
    if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null }
    clearPing()
    ws?.close()
    ws = null
    status.value = 'disconnected'
  }

  // Connect once the player ID is ready
  watch(playerId, (id) => { if (id) connect() }, { once: true })

  onUnmounted(() => {
    send({ type: 'LEAVE_ROOM' })
    disconnect()
  })

  return { playerId, status, lastMessage, send, disconnect }
}
