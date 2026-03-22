# OpenClaw Inbox Assistant Tools Plugin

This package is a native OpenClaw plugin that exposes the inbox assistant's HTTP tool API to OpenClaw.

Registered tools:

- `get_urgent_emails`
- `get_pending_emails`
- `create_todo`

The plugin is intentionally thin:

- it reads config from the OpenClaw plugin config
- it calls the inbox assistant over HTTP with bearer-token auth
- it formats results into model-friendly summaries
- it does not duplicate inbox assistant business logic

## Install from a repo checkout

```bash
cd /path/to/openclaw-inbox-assisant/apps/openclaw-inbox-assistant-tools
npm install
npm run build
openclaw plugins install .
openclaw gateway restart
```

## Configure

Add this to the OpenClaw config:

```json
{
  "plugins": {
    "allow": ["openclaw-inbox-assistant-tools"],
    "entries": {
      "openclaw-inbox-assistant-tools": {
        "enabled": true,
        "config": {
          "baseUrl": "http://localhost:3400",
          "bearerToken": "REPLACE_ME",
          "assistantName": "Nova"
        }
      }
    }
  },
  "tools": {
    "allow": [
      "get_urgent_emails",
      "get_pending_emails",
      "create_todo"
    ]
  }
}
```

See [examples/openclaw.config.example.json](./examples/openclaw.config.example.json) and [examples/nova.system-prompt.md](./examples/nova.system-prompt.md).
