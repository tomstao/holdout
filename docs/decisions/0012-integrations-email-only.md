# 0012. One integration: the close-out email

**Status:** Accepted, 2026-11-19. Who receives the email is superseded by
[ADR 0017](0017-close-email-to-the-host-alone.md) (2026-11-20): the host alone, no `bcc`.
Spike S8 was run on 2026-11-20 and the email is built ([below](#built-2026-11-20)).

## Context

The brief asks for integrations "where they improve the product", with no minimum, and
an explanation of the ones left out. The catalog has 220 endpoints
(`npx deepspace integrations list`), including LLMs, web and paper search, Wikipedia,
image generation, speech and email.

## Decision

Use `email/send` once per closed competition: the host in `to`, participants in `bcc`,
the top three and a link. $0.013 per request, billed to the app owner, sent from the
close job.

Left out on purpose:

| Integration                       | Why not                                                                                                                                                             |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| LLMs (Claude, GPT)                | Scoring must be exact and reproducible. Writing descriptions or "explaining" scores adds cost and a source of confident errors to the one place users need to trust |
| Exa, Scholar, Wikipedia           | Nothing in the loop searches                                                                                                                                        |
| Image generation                  | The landing uses code-built visuals; DeepSpace's design rules forbid AI images of product UI                                                                        |
| Google Calendar (deadline events) | Needs per-user OAuth for one reminder; the countdown on the page covers it                                                                                          |
| Per-submission or reminder emails | Inbox noise, and owner-billed per message                                                                                                                           |

## Consequences

- Spend is bounded by the number of competitions, not by users.
- Email addresses go into `bcc`, so participants do not see each other's.
- The live catalog says the sender is always `notifications@updates.app.space`
  (`from` is ignored), so `reply_to` is set to the host's address.

## Built, 2026-11-20

**Spike S8.** One `email/send` with a `to`, a `bcc` and a `reply_to`, to two inboxes of
the owner's, through `npx deepspace integrations invoke` as the owner ($0.01). Both
copies arrived. The owner reported it as "from deepspace, didn't show the sender email",
read here as: the sender shown is DeepSpace, and neither copy shows the other address.
Not confirmed by the owner: where Reply goes. The spike asked for a send "from
a job"; the call from the job is the same request, signed with the owner's token by
`buildCronContext`. That call was made by the deployed job later the same day, for a
test competition the owner's account hosted: the job logged `"email":"sent"` and the
account's usage showed the second call ([plan](../plan.md#the-acceptance-walk-through-2026-11-20)).

**What the build settled:**

- **Who receives it changed:** the host alone
  ([ADR 0017](0017-close-email-to-the-host-alone.md)). With participants in `bcc`, each
  of them was shown the host's address. So the spike's `bcc` and `reply_to` are not
  used.
- **Once at most.** Only the step that sets `closed` sends, after that write. Nothing
  records that the email went out, so nothing can send it again; a step that dies in
  between sends none ([ADR 0009](0009-close-with-cron-and-a-job.md)). A refused send is
  logged and does not fail the job.
- **The sender is DeepSpace's name and address,** so the subject and the first line say
  "Holdout".
- **A host whose address mail cannot reach gets none** (`.test`, `.example`, `.invalid`,
  `.localhost`, `example.com`): the platform's test accounts use `.test`.
- **The address stays out of everything but the request:** not in the job's payload or
  result, and a provider's error is logged with any address replaced.
- **Plain text.** No HTML, so nothing a title could inject; titles and names are cut to
  one line.

## Revisit when

A feature needs judgment rather than arithmetic, for example helping a host write a
clear metric explanation. Then it is an opt-in draft the host edits, never part of
scoring.
