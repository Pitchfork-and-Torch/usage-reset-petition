# Friday 4:45pm New York

Public petition page. Grok Bot weekly usage should reset every Friday at 4:45pm New York time.

Not an xAI product. A name on the list does not change the product.

Live: https://usageresetpetition.jonbailey.xyz/

## How a signature works

1. The visitor enters an X handle.
2. The worker issues one code, `URP-XXXX`, bound to that handle for 24 hours. Asking again returns the same code until it expires or is used.
3. The visitor posts a fixed line containing that code from that account.
4. The visitor pastes the post link.
5. The worker reads the public post, checks the author, the code, and that the words support this Friday reset, then appends one ledger row.

Someone else cannot add your handle. An older reply that does not contain your code does not count. Posts that ask for Wednesday, Saturday, or a daily limit do not count.

The public ledger is `GET /api/ledger`.

## Deploy

```powershell
powershell -ExecutionPolicy Bypass -File .\deploy.ps1
```

Needs the existing Cloudflare token on this machine. Signatures live in Workers KV. Do not commit `.dev.vars`.
