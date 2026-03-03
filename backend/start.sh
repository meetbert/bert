#!/bin/bash
# Start BERT backend: uvicorn + ngrok tunnel
# Usage: ./start.sh (from backend/)

cd "$(dirname "$0")"
source venv/bin/activate

PORT=${PORT:-8000}

# Start uvicorn in background
echo "Starting uvicorn on port $PORT..."
uvicorn app.main:app --port "$PORT" --reload &
UVICORN_PID=$!

sleep 2

# Start ngrok
echo "Starting ngrok tunnel..."
ngrok http "$PORT" --log=stderr &
NGROK_PID=$!

sleep 3

# Get the public URL
NGROK_URL=$(curl -s http://localhost:4040/api/tunnels | python3 -c "import sys,json; print(json.load(sys.stdin)['tunnels'][0]['public_url'])" 2>/dev/null)

if [ -n "$NGROK_URL" ]; then
    echo ""
    echo "=================================="
    echo "BERT is running!"
    echo "Webhook URL: $NGROK_URL/webhook/agentmail"
    echo "=================================="
    echo ""
    echo "Paste this URL into AgentMail webhook settings."
    echo "Press Ctrl+C to stop."
else
    echo "Warning: Could not get ngrok URL. Check http://localhost:4040"
fi

# Clean up on Ctrl+C
trap "kill $UVICORN_PID $NGROK_PID 2>/dev/null; exit" INT TERM
wait
