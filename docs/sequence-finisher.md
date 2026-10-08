# Sequence finisher

ChatGPT researches the company, selects the instrument, and writes the outreach. This app finishes that outreach with visit availability and existing Knowledge Base resources. It does not research, reassess the instrument, or rewrite message bodies.

## Main tabs

- **Finish Sequence:** paste the sequence, enter the company and optional location, select availability, then finish. Review/edit the messages and resource selections, copy/download text, and save to History.
- **Knowledge Base:** existing upload, metadata editing, preview, link, and deletion functions remain available.
- **History:** search by company; reopen, edit, copy, or delete saved sequences. Earlier sequences and account research remain accessible.

## Add to the ChatGPT Sequence Builder project instructions

After choosing the instrument and writing the sequence in Tim's voice, provide one clean copyable handoff using the following format. No JSON is required.

Put the instrument recommendation above the messages. Label every message with a numbered heading such as `Email 1` or `LinkedIn 1`. Use `Subject:` on its own line for email subjects. Preserve the approved sequence order, number of touches, voice, and meeting-request wording.

Use these exact scheduling placeholders within otherwise complete sentences:

- `{{TRIP_1_AVAILABILITY}}` — first visit dates and times, including the time zone.
- `{{TRIP_2_AVAILABILITY}}` — later visit dates and times, including the time zone.
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

I’ll be in {{LOCATION}} on {{TRIP_1_AVAILABILITY}}. Would you have time to meet?

Best,
Tim

Resource note: Help illustrate immune profiling. A related VistaPlex panel resource or CellScape instrument photo is useful if no exact application image is available.

Email 2
Subject: [The second subject]

[Complete second email, with a distinct useful point.]
```

Replace all illustrative square-bracketed text before using this example. Recipient placeholders such as `{{FIRST_NAME}}` remain editable in the finished messages; unresolved placeholders prevent accidental copying, but drafts can be saved.

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
