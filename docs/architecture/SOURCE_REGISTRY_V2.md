# Source Registry V2

## Purpose

Source Registry is the governed directory of external information sources available to MarkOrbit Knowledge.

Knowledge stores source identity, discovery provenance and acquisition metadata only. Interpretation and reasoning remain in MarkOrbit Core.

## Source Record Extensions

A source record may include:

- source identity
- category
- country / jurisdiction
- discovery origin
- parent source
- relationship type
- acquisition capability
- lifecycle status
- review state

## Discovery Provenance

Every discovered source should preserve how it was found.

Example:

```
Source: UAE Trademark Office
Discovered From: WIPO
Relationship: MEMBER_OFFICE_LINK
```

## Governance

Discovery creates candidates only.

Candidate sources require controlled activation before production collection.

The registry must never imply:

- legal authority
- professional endorsement
- factual correctness
- analytical conclusions

Those decisions belong outside Knowledge.
