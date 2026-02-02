#!/bin/bash
# Game Portal Host - Start/Stop/Status Script
# Usage: ./host.sh [start|stop|status]

PROJECT_DIR="/Users/vdat/Desktop/Dat/CODE/5.game"
GAME_DIR="$PROJECT_DIR/public"  # Serve only public folder for security
PID_DIR="$PROJECT_DIR/.host"
HTTP_PID="$PID_DIR/http.pid"
TUNNEL_PID="$PID_DIR/tunnel.pid"
LOG_DIR="$PID_DIR/logs"

mkdir -p "$PID_DIR" "$LOG_DIR"

start() {
    echo "🚀 Starting Game Portal hosting..."
    
    # Check if already running
    if [ -f "$HTTP_PID" ] && kill -0 $(cat "$HTTP_PID") 2>/dev/null; then
        echo "⚠️  HTTP server already running (PID: $(cat $HTTP_PID))"
    else
        cd "$PROJECT_DIR"
        nohup node server.js > "$LOG_DIR/http.log" 2>&1 &
        echo $! > "$HTTP_PID"
        echo "✅ Node.js server started (PID: $!)"
    fi
    
    if [ -f "$TUNNEL_PID" ] && kill -0 $(cat "$TUNNEL_PID") 2>/dev/null; then
        echo "⚠️  Cloudflare tunnel already running (PID: $(cat $TUNNEL_PID))"
    else
        nohup cloudflared tunnel run game-portal > "$LOG_DIR/tunnel.log" 2>&1 &
        echo $! > "$TUNNEL_PID"
        echo "✅ Cloudflare tunnel started (PID: $!)"
    fi
    
    sleep 2
    echo ""
    echo "🌐 Website live at: https://datnv.online"
}

stop() {
    echo "🛑 Stopping Game Portal hosting..."
    
    if [ -f "$HTTP_PID" ]; then
        kill $(cat "$HTTP_PID") 2>/dev/null && echo "✅ HTTP server stopped" || echo "⚠️  HTTP server not running"
        rm -f "$HTTP_PID"
    fi
    
    if [ -f "$TUNNEL_PID" ]; then
        kill $(cat "$TUNNEL_PID") 2>/dev/null && echo "✅ Cloudflare tunnel stopped" || echo "⚠️  Tunnel not running"
        rm -f "$TUNNEL_PID"
    fi
    
    # Also kill any orphaned processes
    pkill -f "node server.js" 2>/dev/null
    pkill -f "cloudflared tunnel run game-portal" 2>/dev/null
    
    echo "🔴 Website offline"
}

status() {
    echo "📊 Game Portal Status"
    echo "====================="
    
    if [ -f "$HTTP_PID" ] && kill -0 $(cat "$HTTP_PID") 2>/dev/null; then
        echo "🟢 HTTP Server: Running (PID: $(cat $HTTP_PID))"
    else
        echo "🔴 HTTP Server: Stopped"
    fi
    
    if [ -f "$TUNNEL_PID" ] && kill -0 $(cat "$TUNNEL_PID") 2>/dev/null; then
        echo "🟢 Cloudflare Tunnel: Running (PID: $(cat $TUNNEL_PID))"
    else
        echo "🔴 Cloudflare Tunnel: Stopped"
    fi
    
    echo ""
    echo "🌐 URL: https://datnv.online"
}

logs() {
    echo "📜 Recent logs:"
    echo "--- HTTP Server ---"
    tail -10 "$LOG_DIR/http.log" 2>/dev/null || echo "No logs"
    echo ""
    echo "--- Cloudflare Tunnel ---"
    tail -10 "$LOG_DIR/tunnel.log" 2>/dev/null || echo "No logs"
}

case "$1" in
    start)  start ;;
    stop)   stop ;;
    status) status ;;
    logs)   logs ;;
    restart) stop; sleep 1; start ;;
    *)
        echo "🎮 Game Portal Host Manager"
        echo ""
        echo "Usage: $0 {start|stop|status|restart|logs}"
        echo ""
        echo "Commands:"
        echo "  start   - Start HTTP server & Cloudflare tunnel"
        echo "  stop    - Stop all services"
        echo "  status  - Show running status"
        echo "  restart - Restart all services"
        echo "  logs    - Show recent logs"
        ;;
esac
