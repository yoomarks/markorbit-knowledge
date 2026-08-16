from pathlib import Path

path = Path("packages/persistence/src/priority-national-source-coverage.ts")
text = path.read_text()

old_classification = "https://www.moet.gov.ae/en/trademark-services"
new_classification = "https://www.moet.gov.ae/en/search-results?_com_liferay_portal_search_web_search_results_portlet_SearchResultsPortlet_INSTANCE_axqn_assetEntryId=200540&_com_liferay_portal_search_web_search_results_portlet_SearchResultsPortlet_INSTANCE_axqn_mvcPath=%2Fview_content.jsp&_com_liferay_portal_search_web_search_results_portlet_SearchResultsPortlet_INSTANCE_axqn_type=content&p_l_back_url=%2Fen%2Fsearch-results%3Fq%3D%26start%3D12&p_p_id=com_liferay_portal_search_web_search_results_portlet_SearchResultsPortlet_INSTANCE_axqn&p_p_lifecycle=0&p_p_mode=view&p_p_state=maximized"

count = text.count(old_classification)
if count != 3:
    raise RuntimeError(f"expected 3 UAE classification URL matches, got {count}")
text = text.replace(old_classification, new_classification)
text = text.replace(
    'label: "Current trademark service surface"',
    'label: "Official trademark FAQ explaining Nice Classification"',
    1,
)

old_bulletin = "https://www.moet.gov.ae/en/our-publications"
new_bulletin = "https://www.moet.gov.ae/en/publications1"
count = text.count(old_bulletin)
if count != 2:
    raise RuntimeError(f"expected 2 UAE bulletin URL matches, got {count}")
text = text.replace(old_bulletin, new_bulletin)

path.write_text(text)
