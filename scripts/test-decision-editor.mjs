// Run against a local frontend preview: DECISION_TEST_URL=http://localhost:4173 node scripts/test-decision-editor.mjs
// All API traffic is intercepted; no real company data, database writes or model calls.
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
import assert from 'node:assert/strict';

const url = process.env.DECISION_TEST_URL || 'http://localhost:4173';
if (!['localhost', '127.0.0.1'].includes(new URL(url).hostname)) throw new Error('Local preview only');
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  let requests = [];
  let packet;
  const graph = { schema: 'bsb-instrument-graph-v1', start: 'q', nodes: [
    { id: 'q', type: 'question', text: 'Does this synthetic unit work with tissue?', answers: [
      { label: 'Yes', next: 'yes' }, { label: 'No', next: 'no' }, { label: 'Unknown', next: 'unknown' },
    ] },
    ...['yes', 'no', 'unknown'].map(id => ({ id, type: 'outcome', text: `Synthetic ${id} destination`, instrument: id === 'yes' ? 'CosMx' : 'Keep researching' })),
  ] };
  await page.route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname;
    let body = [];
    if (path.endsWith('/packets/synthetic')) body = packet;
    if (path.endsWith('/assessment-config')) body = { enabled: true, missing: [] };
    if (path.endsWith('/decision-override')) {
      const edit = route.request().postDataJSON(); requests.push(edit);
      body = { ...packet.assessment, id: 'revised' };
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  });
  for (const answer of ['Yes', 'No', 'Unknown']) {
    packet = {
      id: 'synthetic', stage: 'ASSESSED', createdAt: '2026-01-01T12:00:00Z', normalizedEvidence: [],
      researchPacket: { brief: 'Synthetic fixture only' }, validation: { structurallyValid: true, supportValid: true, warnings: [], errors: [] },
      assessment: { id: `original-${answer}`, model: 'synthetic', mock: false, instruments: [], limitations: [], selectedInstruments: ['CosMx'],
        decisionTrace: { graph, treeHash: 'synthetic-tree-version', buyerUnit: 'Synthetic unit',
          path: [{ nodeId: 'q', question: graph.nodes[0].text, lookFor: 'Synthetic question guidance', label: answer, reasoning: 'Private synthetic reasoning', citations: [], evidenceIds: [], next: answer.toLowerCase() }],
          outcome: { nodeId: answer.toLowerCase(), text: `Synthetic ${answer.toLowerCase()} destination`, instrument: 'CosMx' },
        },
      },
    };
    await page.goto(`${url}/workspace/packet/synthetic`);
    await page.getByRole('tab', { name: 'Instrument Assessment' }).click();
    assert.equal(await page.getByText('Private synthetic reasoning').count(), 0, 'Reason stays inside popup');
    await page.getByRole('button', { name: /Does this synthetic unit/ }).click();
    await page.getByRole('dialog').waitFor();
    assert.equal(await page.getByText('Private synthetic reasoning').count(), 1);
    await page.getByRole('button', { name: 'Change', exact: true }).click();
    const run = page.getByRole('button', { name: 'Run', exact: true });
    assert.equal(await run.isDisabled(), true);
    await page.getByLabel('Reason (required)').fill('   ');
    assert.equal(await run.isDisabled(), true);
    await page.getByLabel('Answer', { exact: true }).selectOption('No');
    assert.equal(await page.getByRole('dialog').getByText('Synthetic no destination — Keep researching').count(), 1);
    await page.getByLabel('Reason (required)').fill('Confirmed by a synthetic customer conversation.');
    assert.equal(await run.isEnabled(), true);
    await run.click();
    await page.getByRole('dialog').waitFor({ state: 'hidden' });
    assert.equal(requests.at(-1).assessmentId, `original-${answer}`);
    assert.equal(requests.at(-1).label, 'No');
    await page.getByRole('button', { name: /Does this synthetic unit/ }).click();
    await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  }
  assert.equal(requests.length, 3, 'Cancel makes no requests');
  assert.deepEqual(errors, []);
  console.log('Decision editor browser checks passed: Yes/No/Unknown, popup-only details, branch preview, required reason, Run, Cancel.');
} finally { await browser.close(); }
