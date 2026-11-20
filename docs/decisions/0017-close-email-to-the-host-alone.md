# 0017. The close-out email goes to the host alone

**Status:** Accepted, 2026-11-20. Supersedes who receives the email in
[ADR 0012](0012-integrations-email-only.md); the rest of that record stands.

## Context

ADR 0012 put the host in `to` and the participants in `bcc`, with replies to the host.
That hides the participants from each other. It does not hide the host: `email/send`
needs somebody in `to`, and whoever is there is shown to every `bcc` recipient. So
"everyone in `bcc`" is not possible, and the plan as written gave the host's address to
every participant.

In a class that is harmless: the students know their teacher's address. But anyone can
sign up and host, and anyone who submits one file is a participant. Submitting a file
to a competition would have been a way to collect its host's address at the close. The
host never chose to share it.

It was first built as planned (PR #30, merged and never deployed). The owner asked
whether the address should be hidden, and chose this.

## Decision

One message per closed competition, to the host alone: the top three and the link. No
`bcc`, no `reply_to`. Participants are not emailed; the page shows them the final
standings, and it changes on its own at the close.

The job reads the host's `users` row for the address and no participant's.

## Consequences

- No user's address reaches another user.
- Spend is one request per competition again ($0.013), whatever its size. The limit of
  50 recipients a message, which the first build worked around with one message per 49
  participants, no longer matters.
- A participant who is not on the page at the close is not told. They know the deadline
  from the countdown.
- The close job makes one read and one request more than it did without the email,
  not one read per participant.

## Alternatives

| Option                                       | Why not                                                                                                                                                              |
| -------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| As planned: host in `to`, participants `bcc` | Shows the host's address to everyone who submitted                                                                                                                   |
| One message per person, each alone in `to`   | Shows nothing and tells everyone, at $0.013 a participant from the owner's credits: $2.60 for 200. Spend would follow sign-ups, which ADR 0012 set out to avoid      |
| A shared address of the app's in `to`        | Needs an inbox the app owns, and shows that address to everyone instead                                                                                              |
| A setting for the host: "show my address"    | The right shape for later: the participants are written to only when the host agrees. It needs a field on the competition and a line in the form; out of scope today |

## Revisit when

Participants ask to be told. Then: one message per person, or the host's opt-in above,
with a cap on what one competition may spend.
