# RSSL acquisition survey: research and design review
**Date:** 18 November 2026 · **Status:** proposal only, not deployed  
**Live survey:** https://www.reservoirlaundry.com.au/survey/  
**Primary business question:** Which channels and value propositions bring *new paying laundry customers* profitably to Reservoir Street Self Service Laundry?

## Executive conclusion
Keep the eleven native-language tiles, Samsung Galaxy Tab A11+ landscape design, single-tap answers, anonymous data collection, offline queue and stable English codes. The current five-question questionnaire provides discovery/channel data but does not capture (1) the **decision driver** or (2) a **local versus visitor segment**. Google directions actions measure local intent, not transactions or Google Ads incrementality. Improve new-customer insight by **branching the final two questions** after first versus returning status; keep the survey at five single-tap questions.

**Do not deploy without an additive Supabase migration and full 11-language regression tests.** The current table's constraints and schema for new fields have not been checked directly. Do not overload `experience`, `improvement`, or `google_today` with incompatible meanings.

## Current questionnaire (source: survey/index.html)
1. `visit_type`: Is this your first visit? [first/repeat/unsure].
2. `discovery_source`: How did you first hear about us? [Google Maps, Google Search, walking past, friend/family, other, unsure].
3. `google_today`: Did you use Google to find us today? [Maps, Search, both, no, unsure].
4. `experience`: How has your visit been? [excellent, good, could be better, not finished].
5. `improvement`: What could we improve? [nothing, machines, cleanliness, prices, card payment, instructions, other].

**Strengths:** very short, consistent categories, new versus returning, distinguishes initial discovery from navigational Google use, anonymous, one touch per answer and no typing, eleven languages and offline submissions.

**Important weaknesses:**
- Discovery is not persuasion: no question tells us *why* this venue won the visit (location, opening hours, reviews, price, card convenience, machines).
- No local resident/worker/accommodation visitor distinction. This is especially relevant for marketing to travellers and nearby accommodation operators.
- The experience question asks for ratings even if the customer has not completed their wash/dry; such responses should not be treated as completed service outcomes.
- The Google question primes a specific brand and does not measure Apple Maps or independent route assistance. Consider preserving it for trend continuity but label it 'Google used for this visit', **not 'customers acquired by Google Ads'**.
- 'Other' conceals recommendations from Airbnb hosts/hotels or Apple Maps; add explicit channels only if RLS / check constraints are safely migrated.
- No selected language is logged, despite an 11-language UI. Language chosen is a **presentation preference**, not citizenship/ethnicity.
- There is no response-rate denominator and no independent link from individual answers to actual paid machine cycles.
- Survey records contain `answered_at` while the email report reads `submitted_at`. Check timestamp semantics: delayed offline uploads could be assigned to a later calendar week if analysis uses server receipt time rather than answer time.

## Proposed five-question, conditional survey (v2)

**Everyone:**
1. **Is this your first time using this laundry?** First time / Have used it before / Prefer not to say.
2. **How did you first discover this laundry?** Google Maps / Google Search (web) / Walking past / Friend or family / Accommodation host or hotel / Apple Maps or another map app / Other / Can't remember. Preserve old values for existing categories and explicitly map new responses to new values.
3. **Did you use Google Maps or Google Search to find this laundry today?** Maps / Search / Both / No / Not sure. This remains navigational use, not ad-click attribution.

**If first time (or visit type unknown, with a neutral wording):**
4. **What mattered most when choosing this laundry today?** Convenient location / Opening hours / Reviews or ratings / Price / Card payment / Machine size or availability / Recommendation / Something else. One answer; not multiple selection, not 'why did you choose us over competitors?'.
5. **Which best describes you today?** Live nearby / Work or study nearby / Staying nearby (hotel, Airbnb or other accommodation) / Visiting the area / Prefer not to say.

**If returning:**
4. Retain **How has your visit been?** for continuity and useful operational insights.
5. Retain **What could we improve?** for continuity and useful operational insights.

A simpler alternative is to ask question 4 (decision driver) of everyone while restricting question 5 to local/visitor versus improvement. However, this sacrifices the historical customer experience series. The conditional design preserves more existing data and keeps acquisition questions directly relevant to first visits.

### New data fields (additive, not yet applied)
- `choice_reason` text, nullable, controlled enumerations.
- `customer_context` text, nullable, controlled enumerations.
- `survey_language` text, nullable, ISO BCP-47 language selection; note this does not establish nationality.
- Optional `survey_version` smallint default 1 for source/analysis comparability.

Use `NULL` for non-asked conditional questions, not a fictional zero/negative answer. Retain all existing fields, codes and historical rows. Avoid new required fields: they would make old survey clients and offline queued submissions fail.

**Safety checklist before a release:**
1. Inspect actual database column types, constraints, grants and RLS. The new RSSL Supabase project is not available through the connected management app; actual migration is outstanding.
2. Create additive columns, explicit allowed codes, and check policy allows anonymous INSERT of only the needed fields. Never place the server `sb_secret_` key in public browser code.
3. Translate all changed/new prompts and every answer choice into all eleven languages, then native-speaker spot-check key languages.
4. Update kiosk progress/branching, payload, offline queue backward compatibility, service worker cache version, and tests.
5. Update Google Apps Script `select` and report sections to show **first-time acquisition channels**, **first-time decision drivers**, and **local versus traveller segments**. Don't label these as paid Google conversions.
6. Test browser with real schema before publication. Confirm English database codes from at least one non-English survey.
7. Treat answers collected before v2 as a separate survey version; do not invent zero data for missing historical answers.

## What the weekly email should show
- **Acquisition mix:** Number of new survey respondents and valid first-time answers; initial Google Maps vs web Search vs other sources, separately.
- **First-time selection drivers:** location, hours, review reputation, payment, prices, machines and referral. Show both counts and percentages of answered first-time responses.
- **Local/visitor split:** resident/worker versus accommodation guest/visitor, and breakdown by discovery channel. This could guide hostel/hotel/Airbnb partnerships and language copy.
- **Google navigation versus discovery:** Among first-time visitors, *originally discovered through Google* versus *used Google for directions today*, not assumed identical.
- **Weekly time series:** 6-week rolling average with the explicit sample size, completed reporting weeks, and small-sample caution. The first six weeks after launch are ramp-up.
- **Operational feedback:** Returning customers' service and improvement responses, but don't compare these directly with historical all-customer satisfaction without a segment label.
- **Data quality:** n per question, skipped counts, response volume by day, delayed queue uploads (based on `answered_at` if supported), surveys/Paymate machine-cycle ratio as a *rough coverage indicator*, not a unique-customer conversion rate.

## Optimisation decision rule (survey + other systems)
Google Ads `Local actions – Directions` reflects directions interactions following advertising, **not unique paying customers**. A survey cannot reliably tell organic Google exposure from paid Google clicks or prove incrementality. The combination of Google Ads cost/directions, customer first-time answers, Paymate paid machine cycles and energy consumption is much more valuable. Use advertising *experiments* or a carefully designed holdout to test causal lift once traffic is adequate; do not increase budget solely because Google labels the campaign budget-limited.

**Illustrative contribution equation:** incremental paid machine cycles × (AUD 8 revenue per cycle minus actual variable cost per cycle) minus advertising spend. Actual variable cost and incremental cycles must be validated, not inferred from direction actions.

## Fieldwork practice
- Put the kiosk where people who **actually use a machine** can see it, preferably during or after payment, without obstructing the laundry.
- Invite neutrally: “Help improve this laundry — a few anonymous taps.” Avoid “Tell us how you found us on Google” or coaching an answer.
- Do not offer review-contingent rewards or request identification. Collect no name, telephone number or exact home address.
- Pilot with roughly ten people from multiple language groups, including a person unfamiliar with Google Maps versus Google web search. Ask what each question means to them, track confusion and check screen fit in 16:10 landscape.
- Track participation across several times of day. Respondents are a self-selected convenience sample, not a random sample of unique paying customers.

## Research sources and grounding
1. Pew Research Center, [Writing Survey Questions](https://www.pewresearch.org/writing-survey-questions/): wording, order, pretesting and measurement continuity.
2. Qualtrics, [Mobile Survey Optimization](https://www.qualtrics.com/support/survey-platform/survey-module/mobile-survey-optimization/): short questions and reduced typing.
3. Qualtrics, [Survey Errors](https://www.qualtrics.com/en-au/articles/strategy-research/survey-errors/): neutral language, mutually exclusive response options and order.
4. AAPOR, [Best Practices for Survey Research](https://aapor.org/standards-and-ethics/best-practices/): sample representativeness, survey/data triangulation.
5. Google Ads Help, [Local actions conversions](https://support.google.com/google-ads/answer/9013908?hl=en-AU-0): Directions local actions semantics.
6. Google Ads Help, [Custom experiments](https://support.google.com/google-ads/answer/10683687?hl=en-AU) and [Conversion lift](https://support.google.com/google-ads/answer/12003020?hl=en-AU): testing campaign impact.
7. Google Business Profile Help, [Understand profile performance](https://support.google.com/business/answer/9918094): directions requests and metrics.
8. Destination NSW, [Visitor economy results March 2026](https://www.destinationnsw.com.au/newsroom/nsw-tourism-hits-new-heights-visitor-spending-breaks-records): why local versus traveller segmentation is worth testing; these are state-level trends, not RSSL's customer mix.
9. OAIC, [Australian Privacy Principles guidelines](https://www.oaic.gov.au/privacy/australian-privacy-principles/australian-privacy-principles-guidelines): anonymity, minimal data collection and transparent processing.
10. UK CMA, [Customer survey evidence good practice](https://www.gov.uk/government/publications/mergers-consumer-survey-evidence-design-and-presentation/good-practice-in-the-design-and-presentation-of-customer-survey-evidence-in-merger-cases): neutral intercepts and survey placement.

**Deployment status:** Research review only. No changes to the live five-question survey, public Supabase endpoint or Google Apps Script were made by this audit; safe roll-out needs controlled schema migration and multilingual acceptance tests.
