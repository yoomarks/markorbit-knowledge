from pathlib import Path

path = Path("packages/persistence/src/safe-worker-registry.ts")
text = path.read_text()
anchor = '''  claim(workerId: string, credential: string): ClaimResult {
    return this.inner.claim(workerId, credential);
  }

  renewLease'''
replacement = '''  claim(workerId: string, credential: string): ClaimResult {
    return this.inner.claim(workerId, credential);
  }

  claimSpecific(workerId: string, credential: string, jobId: string): ClaimResult {
    return this.inner.claimSpecific(workerId, credential, jobId);
  }

  renewLease'''
if text.count(anchor) != 1:
    raise SystemExit(f"safe worker claim anchor count={text.count(anchor)}")
path.write_text(text.replace(anchor, replacement, 1))
