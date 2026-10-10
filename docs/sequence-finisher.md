# Sequence finisher

ChatGPT researches the company, selects the instrument, and writes the outreach. This app finishes that outreach with visit availability and existing Knowledge Base resources. It does not research, reassess the instrument, or rewrite message bodies.

## Main tabs

- **Finish Sequence:** paste the sequence, enter the company and optional location, select availability, then finish. Review/edit the messages and resource selections, copy/download text, and save to History.
- **Knowledge Base:** existing upload, metadata editing, preview, link, and deletion functions remain available.
- **History:** search by company; reopen, edit, copy, or delete saved sequences. Earlier sequences and account research remain accessible.

## Add to the ChatGPT Sequence Builder project instructions

After choosing the instrument and writing the sequence in Tim's voice, provide one clean copyable handoff using the following format. No JSON is required.

Put the instrument recommendation above the messages. Use these exact message headings in this order:

```text
Email 1
Email 2
LinkedIn Connection Request
LinkedIn Message 1
Email 3
Email 4
Email 5
LinkedIn Message 2
Email 6
```

Use `Subject:` on its own line for emails and LinkedIn Message 1 / LinkedIn Message 2. Only LinkedIn Connection Request has no Subject field. Older headings remain supported: `LinkedIn 1` maps to `LinkedIn Connection Request`, `LinkedIn 2` maps to `LinkedIn Message 1`, and `LinkedIn 3` maps to `LinkedIn Message 2`. The app preserves message order.

LinkedIn Message 1 uses Trip 1 placeholders and LinkedIn Message 2 uses Trip 2 placeholders. The finisher normalizes any trip placeholders in those messages to the correct trip. The Connection Request is plain text with no hyperlinks, attachments, resource picker or resource suggestions. Product names are not auto-linked; supplied links are reduced to their text and bare URLs are removed. It has no visit dates or availability; do not include trip placeholders there. If mistakenly supplied, they remain unresolved with a warning instead of inserting availability or rewriting the surrounding sentence.

Email 4 starts immediately after its greeting and paragraph break with this exact opening:

```text
Sorry I missed you last time. As a reminder, my name is Tim Glidewell and I am your Spatial Regional Account Manager with Bruker Spatial Biology.
```

The finisher preserves this wording exactly; it does not reject or rewrite “Sorry I missed you.” The existing Bruker Spatial Biology hyperlink is applied for display/copy without changing the words.

Use these exact scheduling placeholders. Put each availability placeholder alone on its own line, between the lead-in sentence and the meeting question:

Every sequence requires TWO trips; there is no one-visit option. Enter at least one valid availability window for each trip before finishing. Trip 1 applies to Email 1, Email 2, LinkedIn Message 1 and Email 3. Trip 2 applies to Email 4, Email 5, LinkedIn Message 2 and Email 6. The Connection Request has no availability. Existing saved sequences remain accessible; finishing them again requires both visits.

- `{{TRIP_1_DATES}}` / `{{TRIP_2_DATES}}` — the trip's date range, bold in email: **October 27–30**, **October 30–November 2**, or **October 27**. The first and last selected availability dates define the range. Cross-year ranges include both years.
- `{{TRIP_1_AVAILABILITY}}` / `{{TRIP_2_AVAILABILITY}}` — a chronological bulleted list, one bold line per day including year and time zone. Multiple windows on a day are joined with "and". No semicolons or trailing periods.
- `{{LOCATION}}` — city or visit area, when needed.
- `{{TIMEZONE}}` — only if a separate time-zone reference is needed.

Avoid additional date/time placeholders. Do not invent dates or assume that a particular attachment has already been selected. Write emails that stand on their own.

After each message, optionally add one separate line beginning `Resource note:`. Describe the purpose of supporting material, rather than requiring an exact title or keyword. Welcome related panel resources, application notes, publications, relevant biological images, or an instrument photo. This private line will not be copied into the email. Do not place private commentary elsewhere in the message body.

Example structure (illustrative text, not an approved account-specific sequence):

```text
Instrument: CellScape

Email 1
Subject: Immune profiling in tissue

Hi there,

[Complete account-specific email wording goes here.]

I'll be in {{LOCATION}} {{TRIP_1_DATES}}, and I have the following dates and times available:
{{TRIP_1_AVAILABILITY}}
Would any of those times work for a brief discussion?

Best,
Tim

Resource note: Help illustrate immune profiling. A related VistaPlex panel resource or CellScape instrument photo is useful if no exact application image is available.

Email 2
Subject: [The second subject]

[Complete second email, with a distinct useful point.]
```

Replace all illustrative square-bracketed text before using this example. Always write `{{first_name}}` exactly for Outreach. Variants such as `{{FIRST_NAME}}`, `{{First_Name}}`, `{first_name}`, `{{ first_name }}` and `[First Name]` are normalized to `{{first_name}}` in display, copy and downloads and never block copying. Missing scheduling or other unresolved placeholders still show a warning and block copying; drafts can be saved.

For the second trip, use this layout (keep the question specific to the email):

```text
I'll be back in {{LOCATION}} {{TRIP_2_DATES}}, and I have the following dates and times available:
{{TRIP_2_AVAILABILITY}}
Would any of those times work for a brief discussion about whether that distinction is relevant to Earli's research?
```

The lead-in, availability list and question render as separate paragraphs/blocks. Example list:

- **Tuesday, October 27, 2026, 1 PM–4 PM PDT**
- **Wednesday, October 28, 2026, 9 AM–11 AM and 2 PM–4 PM PDT**
- **Friday, October 30, 2026, 10 AM–1 PM PDT**

LinkedIn Message 1 and LinkedIn Message 2 use the same rich formatting as emails: bold date ranges, bold daily bullets and real embedded product hyperlinks. Only the Connection Request stays plain text. Copy supplies formatted HTML and a plain-text alternative for email clients; browsers without rich clipboard support fall back to plain text. Plain copy and .txt downloads contain "- " bullets with no ** markers. Each message appears once as a formatted preview. Use **Edit message** to switch to editable text, then **Done editing** to return to the preview.

Every unlinked mention of CosMx, CellScape, GeoMx, or Bruker Spatial Biology automatically links to its official product or company page in email previews and rich-text copy. Existing links are preserved. Plain-text exports include the URL beside the name because plain text cannot embed a hyperlink; Connection Requests omit links and URLs entirely. This applies to reopened History entries too, without changing saved wording or resource matching.

Older handoffs with an availability placeholder inside a sentence retain the original inline, semicolon-separated output. Missing trips leave their date/availability placeholders unresolved and display the existing warning.

## Resource matching

The matcher considers the actual meaning of catalog titles, descriptions, and keywords. It prefers direct matches, then related biology/panels, then useful platform introductions. It may reuse a useful resource and may leave a message without one. It never invents assets or changes the instrument. Generic images are not presented as instrument-generated results. Suggestions remain editable; the entire library is available for manual selection.

Matching uses the existing OpenAI key. `BSB_RESOURCE_MODEL` can override the model; otherwise it reuses `BSB_ASSESSMENT_MODEL`, then the existing model default. Every library item is considered in metadata batches. If AI access fails, local topic matching still offers resources and displays a clear fallback message. No email writing calls are made.

Copied/downloaded message text excludes private resource notes and the resource checklist. Files must be downloaded and attached in the sending application. The app does not send email or automatically attach files to an email client.

## Data preservation and deployment

Startup creates only the new `bsb_finished_sequences` table and initializes the existing Knowledge Base/trip tables. No account, asset, old sequence, or assessment table is dropped or cleared. Old sequence records are read in place. Editing an old sequence saves a new copy. Existing account research is available under History.

The production router no longer exposes the previous assessment/generation actions. The old backend modules remain as unmounted compatibility/reference code where existing asset/trip helpers and historical tests still depend on them; they do not run the new workflow. The old assessment UI has been removed.

Pull the GitHub changes into the existing Replit app, then restart/redeploy using its usual workflow. Keep the existing database and uploaded assets. No second Replit project, database reset, or research-packet conversion is required. The backup branch is `backup/before-sequence-finisher-2026-10-08`.

## Validation

Focused tests cover preserved wording, first/second visit substitution, time zones, invalid/past/overlapping slots, private-note removal, related panel and instrument-image matching, invalid AI IDs, provider fallback, and catalog batching. HTTP tests use a disposable database for save/reopen/update/delete, concurrent-edit protection, removed resources, earlier sequences, and preservation of accounts/assets.

The opt-in HTTP test requires `BSB_FINISHER_TEST_DB=true` and a **disposable** `DATABASE_URL`; do not point it at the live Replit database. Live semantic matching against Tim's actual resource collection still needs an in-app trial after pulling the code.
