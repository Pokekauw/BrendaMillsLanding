# Brenda Mills — landing page

_På dansk: Alle besøgs- og klik-tal gemmes nu globalt i skyen (ikke længere kun i
den enkelte browsers localStorage). Admin-panelet (koden `stats`) læser de
sande, fælles tal fra skyen._

## Global statistics (cloud counters)

The site is a static single-page app, so the counters live in free, public,
key-less counter APIs instead of a backend of your own:

| Provider | Service | Read | Write | Reset |
| --- | --- | --- | --- | --- |
| `countapi` (default) | <https://countapi.mileshilliard.com> | `/api/v1/get/<key>` | `/api/v1/hit/<key>` | `/api/v1/set/<key>?value=0` |
| `abacus` | <https://abacus.jasoncameron.dev> | `/info/<ns>/<key>` | `/hit/<ns>/<key>` | needs an admin key, so disabled |

Switch provider in `src/lib/cloudStore.ts`:

```ts
export const CLOUD_CONFIG: CloudConfig = {
  provider: "countapi", // or "abacus"
  ...
};
```

### What is counted

| Counter key | Increases when |
| --- | --- |
| `brendamills-site-v1-page-visits` | someone loads the page (once per page load) |
| `brendamills-site-v1-referral-health` | the health recommendation link is clicked |
| `brendamills-site-v1-referral-coinbase` | the Coinbase referral link is clicked |
| `brendamills-site-v1-<image>-views` | a gallery image is opened |
| `brendamills-site-v1-<image>-saves` | a gallery image is downloaded |

`<image>` is the download file name of the image (for example
`brenda-poolside`), so the keys stay readable and stable even if the gallery
order changes. 27 counters in total.

### Files

- `src/lib/cloudStore.ts` — talks to the counter APIs (timeouts, retries,
  bulk hits, rate-limit friendly batching, provider switch).
- `src/lib/analytics.ts` — public API used by the components
  (`recordVisit`, `trackReferral`, `trackImageView`, `trackImageDownload`,
  `fetchStats`, `resetStats`). Keeps a localStorage **cache** of the last cloud
  snapshot plus an **outbox** for hits that could not be delivered yet, so a
  click is never lost and never counted twice.
- `src/components/AdminPanel.tsx` — the `stats` dashboard. Every time it opens
  it reads all counters from the cloud, shows a sync status, refreshes itself
  once a minute and can reset the global counters (CountAPI only).

### Manual check

```bash
curl https://countapi.mileshilliard.com/api/v1/get/brendamills-site-v1-page-visits
curl https://countapi.mileshilliard.com/api/v1/get/brendamills-site-v1-referral-coinbase
```

### Notes

- All counters are public (anyone who knows the key can read or - on CountAPI -
  write them). They only contain view/click numbers, no personal data.
- Only the browser talks to the API: there is no server, no key and no build
  step to configure.
- Rate limits: CountAPI allows 10 requests/second per route, Abacus 30 requests
  per 10 seconds per IP. Reads are therefore sent in small batches, and repeated
  clicks are bundled into one `?amount=` request.

## Development

```bash
npm install
npm run dev    # http://localhost:5173
npm run build  # single-file build in dist/index.html
```
