import { describe, expect, it } from "vitest";
import { parseRadarCsv, planRadarSourceIntake, type RadarSourceIntakeFiles } from "../src/radar-source-intake";

function completeFiles(sourceRows: string): RadarSourceIntakeFiles {
  return {
    "source_registry.csv": [
      "source_id,name,organization,jurisdiction,country,region,language,authority_type,topic,source_type,priority,homepage_url,newsletter_url,rss_url,sitemap_url,news_url,other_acquisition,sender_email,sender_domain,list_id,subscription_status,confirmed,source_quality_score,authority_score,originality_score,freshness_score,signal_score,noise_score,discovered_by,parent_source,notes",
      sourceRows,
    ].join("\n"),
    "candidates.csv": [
      "candidate_id,name,url,organization,country,category,discovered_from,reason,estimated_priority,status,notes",
      "cand-1,Example Candidate,https://candidate.example,Example Org,US,law_firm,src-1,Cited by trusted source,A,promote,Review before activation",
    ].join("\n"),
    "missing_coverage.csv": [
      "jurisdiction,country,source_category,importance,current_coverage,missing,recommended_action,notes",
      "US,United States,case_law,high,partial,appellate feed,discover,Need better court coverage",
    ].join("\n"),
    "subscription_log.csv": [
      "timestamp,source_id,source_name,newsletter_url,action,result,email_used,confirmation_required,confirmation_received,confirmation_completed,gmail_label,manual_required,notes",
      "2026-08-18T00:00:00Z,src-1,WIPO Alerts,https://example.test/newsletter,confirmed,ok,radar@example.test,true,true,true,RADAR/01_OFFICIAL/GLOBAL,false,Confirmed",
    ].join("\n"),
    "rules_map.csv": [
      "rule_id,source_id,source_name,match_type,match_value,gmail_label,verified_from_real_email,created,created_at,notes",
      "rule-1,src-1,WIPO Alerts,list_id,wipo.alerts,RADAR/01_OFFICIAL/GLOBAL,true,true,2026-08-18T00:00:00Z,Observed from real mail",
    ].join("\n"),
  };
}

describe("Radar source intake", () => {
  it("builds a zero-mutation plan from confirmed email and non-email acquisition evidence", () => {
    const files = completeFiles(
      "src-1,WIPO Alerts,WIPO,WO,,GLOBAL,en,international_organization,trademark,newsletter,S,https://www.wipo.int,https://example.test/newsletter,https://example.test/feed.xml,https://example.test/sitemap.xml,https://example.test/news,,alerts@example.test,example.test,wipo.alerts,confirmed,true,95,100,90,95,98,5,codex,,High signal",
    );
    const plan = planRadarSourceIntake({
      files,
      generatedAt: "2026-08-18T00:00:00.000Z",
    });

    expect(plan).toMatchObject({
      version: "radar-source-intake-v1",
      mode: "PLAN",
      mutationPerformed: false,
      activationAuthorized: false,
      collectionAuthorized: false,
      summary: {
        filesPresent: 5,
        sourceRows: 1,
        sourceProposals: 1,
        candidateRows: 1,
        candidateProposals: 1,
        coverageGapRows: 1,
        subscriptionRows: 1,
        routingRows: 1,
        errors: 0,
      },
    });
    const source = plan.sourceProposals[0];
    expect(source.organizationKey).toBe("wipo");
    expect(source.endpointKey).toBe("wipo:newsletter");
    expect(source.disposition).toBe("REVIEW");
    expect(source.acquisitions.map((item) => item.kind)).toEqual([
      "EMAIL",
      "RSS",
      "SITEMAP",
      "HTML_WATCH",
    ]);
    expect(source.acquisitions[0]).toMatchObject({
      kind: "EMAIL",
      verified: true,
      senderEmail: "alerts@example.test",
      listId: "wipo.alerts",
    });
    expect(source.routingEvidence).toEqual([
      expect.objectContaining({
        matchType: "list_id",
        matchValue: "wipo.alerts",
        verifiedFromRealEmail: true,
      }),
    ]);
    expect(source.advisoryScores).toMatchObject({ sourceQuality: 95, authority: 100 });
    expect(plan.candidateProposals[0]).toMatchObject({
      externalStatus: "promote",
      disposition: "REVIEW",
    });
  });

  it("parses quoted commas, escaped quotes and embedded newlines", () => {
    const parsed = parseRadarCsv('id,name,notes\n1,"WIPO, Madrid","Line 1\nLine ""2"""\n');
    expect(parsed.rows).toHaveLength(1);
    expect(parsed.rows[0].values).toEqual({
      id: "1",
      name: "WIPO, Madrid",
      notes: 'Line 1\nLine "2"',
    });
  });

  it("rejects invalid source enums per row without aborting the whole batch", () => {
    const files = completeFiles(
      [
        "bad-1,Bad Source,Bad Org,US,US,,en,not_a_real_authority,trademark,newsletter,S,https://bad.example,,,,,,,,,confirmed,true,,,,,,,,,,",
        "good-1,Good Source,Good Org,US,US,,en,official,trademark,news,S,https://good.example,,,,https://good.example/news,,,,,html_watch,false,,,,,,,,,,",
      ].join("\n"),
    );
    const plan = planRadarSourceIntake({ files });

    expect(plan.summary.sourceRows).toBe(2);
    expect(plan.summary.sourceProposals).toBe(1);
    expect(plan.sourceProposals[0].externalSourceId).toBe("good-1");
    expect(plan.issues).toContainEqual(
      expect.objectContaining({
        severity: "ERROR",
        code: "UNSUPPORTED_ENUM",
        field: "authority_type",
        value: "not_a_real_authority",
      }),
    );
  });

  it("keeps manual sources and rejected candidates fail-closed", () => {
    const files = completeFiles(
      "src-1,Manual Source,Manual Org,US,US,,en,law_firm,trademark,newsletter,A,https://manual.example,https://manual.example/newsletter,,,,,,,,manual_required,false,,,,,,,,codex,,CAPTCHA",
    );
    files["candidates.csv"] = [
      "candidate_id,name,url,organization,country,category,discovered_from,reason,estimated_priority,status,notes",
      "cand-1,Rejected Candidate,https://candidate.example,Example Org,US,blog,src-1,SEO noise,C,reject,Do not activate",
    ].join("\n");

    const plan = planRadarSourceIntake({ files });
    expect(plan.sourceProposals[0]).toMatchObject({
      disposition: "BLOCKED",
      blockingReasons: ["SUBSCRIPTION_STATUS_MANUAL_REQUIRED"],
    });
    expect(plan.candidateProposals[0]).toMatchObject({
      disposition: "BLOCKED",
      externalStatus: "reject",
    });
    expect(plan.activationAuthorized).toBe(false);
    expect(plan.mutationPerformed).toBe(false);
  });

  it("deduplicates repeated source identity deterministically", () => {
    const row =
      "src-1,Source One,Org,US,US,,en,official,trademark,news,S,https://example.test,,,,https://example.test/news,,,,,html_watch,false,,,,,,,,,,";
    const files = completeFiles([row, row].join("\n"));
    const plan = planRadarSourceIntake({ files });

    expect(plan.sourceProposals).toHaveLength(1);
    expect(plan.issues).toContainEqual(
      expect.objectContaining({
        severity: "ERROR",
        code: "DUPLICATE_ID",
        field: "source_id",
        value: "src-1",
      }),
    );
  });
});
