# InvoiceFlow Solo

Invoicing with **no backend and no landlord**. One static HTML file is
the entire application: keys are derived in your browser, invoices are
sealed in your browser, and the [blindrange](https://blindrange.dev)
public network stores ciphertext it cannot read.

Third rebuild of the same product, one variable moved each time:

| | stack | who runs the backend |
|---|---|---|
| v1 | React + FastAPI + MongoDB | the operator |
| v2 | React + FastAPI + blindrange | the operator (storage blind) |
| v3 | **this file** | **nobody** |

## Use it

Open `index.html` — hosted on GitHub Pages here, or from a local file,
or from anywhere else; it behaves identically because nothing lives
server-side. Pick a passphrase (it seals the master key in your
browser — **losing it loses the books**, the same property that keeps
everyone else out, pointed at you). Add a second device or your
accountant from Settings → invite; Python's `Owner.accept` takes the
same string.

"Print / save PDF" is exactly that — a print stylesheet, no PDF
library, because a page that holds master keys runs nobody else's
code. That is also why `blindrange.js` is vendored, there is no build
step, and there are no third-party scripts of any kind.

## Stored in the database it runs on

`publish.mjs` chunks the app itself into the network as
content-addressed entries; `loader.html#<sha256>` fetches, verifies
**in the browser**, and runs it. Nobody can swap the app under its
users — the address is the integrity check. `loader.html` (~80
auditable lines) is the only file that ever needs conventional
hosting.

```
node publish.mjs index.html     # prints loader.html#<hash>
```

This build is live from the network:
[`loader.html#3f99e0f2…`](https://alviso.github.io/invoiceflow-solo/loader.html#7d433bf835d200bccc72cebbe765e2c43f325eca71efbfdb95755ea6958e9933)

## Honesty section

Talks to the **public demo network**: published membership secret, no
durability promise — point `NET` in `index.html` at your own nodes for
real books. First open costs a few seconds (writer registration);
repeat reads are local (persistent in-browser mirror). Emailing
invoices is inherently someone's infrastructure — v1 is "print or
download, send it yourself," stated rather than worked around. The AI
extraction from v1/v2 is gone: a static page cannot hold an API key.

MIT, like everything blindrange.
