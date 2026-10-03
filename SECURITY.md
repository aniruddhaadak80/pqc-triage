# Security Policy

## Scope

PQC Triage stores what you paste so it can score it. It has **no accounts**; ownership is
an anonymous `HttpOnly` cookie that your browser holds. That shapes what is and is not
reportable here.

## What to report

Please report, privately:

- Cross-session data access: any way to read or write a survey that belongs to another
  anonymous owner.
- A way to reach a survey through `/share/[id]` that the owner has not published, or to keep
  reading one after the owner revoked the link.
- Anything that lets an unauthenticated caller modify a stored seal, an audit event, or a
  chain head.
- Injection: SQL, stored XSS through rendered user content, or a path traversal in the
  export or upload path.
- A secret, token or key committed to the repository, or leaked into a client bundle, a
  public manifest, a log line or an error response.
- Denial of service that does not require an upstream outage.

## What is out of scope

- The scores themselves. PQC Triage is an engineering aid, not an assurance product, and
  it does not certify anything. Disagreeing with a factor weight or a deadline is a
  feature discussion, not a vulnerability.
- Resource estimates that differ from the published literature, as long as the citation is
  present and accurate.
- Reports that require a key or an account the reporter does not have.
- The absence of a hosted rate limiter. It is documented as best-effort in the README; see
  the note below.
- Automated scanning, scraping, or load testing against the public deployment.

## Known and accepted limitations

- **Best-effort write limiting.** The per-session write limiter is an in-process counter. A
  serverless runtime can recycle the process at any moment, so it is trivially bypassed by
  a determined attacker with many sessions. Durable limiting belongs in a hosted rate
  limiter or an edge rule, and is deliberately not pretended at here.
- **Data you paste is stored.** Do not paste production secrets, private keys or personal
  data. The application says this in the import form and in the export.
- **Supply-chain data is trusted for scoring only.** deps.dev and OSV responses are
  normalized and displayed; a hostile value there could distort a supply factor, never
  execute anything.
- **No authentication by design.** Anyone with the cookie is the owner. Clearing cookies
  loses access. That is the product.

## Reporting

Email **security@pqc-triage.pages.dev** or open a private security advisory at
<https://github.com/aniruddhaadak80/pqc-triage/security/advisories/new>.

Please include the endpoint, the request, the observed response, and `/api/health` output.
Give reasonable time for a fix before disclosing publicly. You will get an acknowledgement,
and credit in the release notes if you want it.