# Change Evidence V1 coverage semantics

A `true` coverage field means the corresponding observation is derived from authoritative persisted Knowledge state for this evidence projection. A `false` field means the dimension is not supported by V1 and must remain unknown downstream.

In particular, `linkedAttachments: false` must never be converted to an empty attachment-change result. This preserves the Evidence First rule: absence of an implemented observation is not evidence that nothing changed.
