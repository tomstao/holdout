# 0012. One integration: the close-out email

**Status:** Accepted, 2026-11-19. Delivery with `bcc` and `reply_to` (spike S8) is not yet
tested: it needs two owner-controlled addresses.

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

## Revisit when

A feature needs judgment rather than arithmetic, for example helping a host write a
clear metric explanation. Then it is an opt-in draft the host edits, never part of
scoring.
