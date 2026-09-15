# Local model setup

The verification agent falls back to a local model once every hosted provider's
daily allowance is spent. That model runs here, on an admin's own machine.

## Install

macOS — the desktop app is preferable to `brew install ollama` because it keeps
the server running and restarts it at login, which is what the admin agent
needs:

    https://ollama.com/download

Or, if you would rather have it in the terminal:

    brew install ollama
    ollama serve        # leave this running, or `brew services start ollama`

## Build the model

Do NOT use plain `qwen2.5:7b`. Ollama's default context window is 2048 tokens,
which truncates a notice long before its closing date. The Modelfile here sets
16k context and zero temperature:

    ollama pull qwen2.5:7b
    ollama create noticeboard -f ollama/Modelfile

## Point the project at it

In your local `.env` only — never on Render, which cannot reach your laptop:

    OLLAMA_HOST=http://localhost:11434
    OLLAMA_MODEL=noticeboard

## Check it

    curl http://localhost:11434/api/tags          # server is up
    ollama run noticeboard "Reply with {\"ok\":true}"
    npx tsx scripts/test-providers.ts             # should show ollama answering

## Cost on the machine

| | |
|---|---|
| Disk | ~4.7 GB for the 7B weights |
| RAM while running | ~6 GB, plus ~1.5 GB for the 16k context |
| RAM when idle | zero — Ollama unloads after ~5 minutes |

## If it is not running

Nothing breaks. The cascade marks it unreachable after one failed connection
and carries on with the hosted providers. The admin panel shows no agent
connected and disables the button rather than pretending to work.
