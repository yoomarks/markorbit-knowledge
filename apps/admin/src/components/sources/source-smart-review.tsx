"use client";

import { SourceChangeReview } from "@/components/sources/source-change-review";
import { SourceSmartReviewUi } from "@/lib/admin-v2/source-smart-review-ui";

export function SourceSmartReview() {
  return (
    <>
      <SourceChangeReview />
      <SourceSmartReviewUi />
    </>
  );
}
