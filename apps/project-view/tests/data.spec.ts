import      { expect, test                } from '@playwright/test' ;
import      { mockDb                      } from '../src/mock-db'   ;
import      {
              decisionsForModule        ,
              formatValue               ,
              implementationForDecision ,
              moduleComponents          ,
              relationPathForPrinciple  ,
              verificationForDecision   ,
              verifyMockDb              ,
              viewForModule             ,
                                          } from '../src/selectors' ;

test('mock snapshot has complete navigable evidence and meaningful table coverage', () => {
  expect(verifyMockDb()                 ).toEqual               ([]) ;
  expect(mockDb.documents.length        ).toBeGreaterThanOrEqual(3 ) ;
  expect(mockDb.principles.length       ).toBeGreaterThanOrEqual(3 ) ;
  expect(mockDb.decisions.length        ).toBeGreaterThanOrEqual(4 ) ;
  expect(mockDb.commits.length          ).toBeGreaterThanOrEqual(2 ) ;
  expect(mockDb.verification_runs.length).toBeGreaterThanOrEqual(4 ) ;
  expect(mockDb.raw_sessions.length     ).toBeGreaterThanOrEqual(2 ) ;
  expect(mockDb.raw_events.length       ).toBeGreaterThanOrEqual(12) ;
  for (const slug of ['monitor', 'chat', 'dashboard'] as const) {
    expect(moduleComponents(slug).length).toBeGreaterThan(0);
  }
});

test('an adopted decision and a commit never imply a passed verification', () => {
  const decision = decisionsForModule('chat').find((item) => item.id === 'DEC-014');
  expect(decision?.status).toBe('adopted');
  expect(implementationForDecision('DEC-014')?.commitId).toBe('COM-014');
  if (!decision) throw new Error('DEC-014 must exist');
  expect(verificationForDecision(decision)?.status).toBe('failed');
  expect(decision.sourceRawIds).toEqual(['RAW-013', 'RAW-014']);
  expect(implementationForDecision('DEC-016')).toBeUndefined();
});

test('PRN-003 evidence categories come from stored relations', () => {
  const principle = mockDb.principles.find((item) => item.id === 'PRN-003');
  if (!principle) throw new Error('PRN-003 must exist');
  const path = relationPathForPrinciple(principle);
  expect(path.documentReferences.map((item) => item.id)).toEqual(['REL-007']           ) ;
  expect(path.definition?.id                           ).toBe   ('REL-008'             ) ;
  expect(path.applicationTargets.map((item) => item.id)).toEqual(['REL-009', 'REL-010']) ;
  expect(path.runtimeInputs.map((item) => item.id)     ).toEqual(['REL-011']           ) ;
  expect(path.verifications.map((item) => item.id)     ).toEqual(['REL-012']           ) ;
});

test('view annotations and preview content share one view record', () => {
  const view = viewForModule('chat');
  expect(view.previewKind).toBe('native-chat');
  expect(view.annotations.map((item) => item.componentId)).toEqual([
    'CMP-CHAT-INPUT', 'CMP-CHAT-STREAM', 'CMP-CHAT-TOOLS',
    'CMP-CHAT-RAIL', 'CMP-CHAT-ADAPTER',
  ]);
  expect(view.annotations.map((item) => item.area)).toEqual([
    'composer', 'stream', 'tools', 'rail', 'adapter',
  ]);
  if (view.previewKind !== 'native-chat') throw new Error('VIEW-CHAT must be native-chat');
  expect(view.preview.stages).toHaveLength(7);
  expect(view.preview.rail.test.rows.find((item) => item.label === 'Failed')?.value).toBe('1');
});

test('integrity checker rejects duplicated identity, missing foreign identity and replacement cycles', () => {
  const duplicated = structuredClone(mockDb);
  duplicated.raw_events.push(structuredClone(duplicated.raw_events[0]!));
  expect(verifyMockDb(duplicated).some((issue) => issue.type === 'duplicate')).toBe(true);

  const missing = structuredClone(mockDb);
  missing.raw_events[0]!.sessionId = 'SES-DOES-NOT-EXIST';
  expect(verifyMockDb(missing).some((issue) => issue.type === 'missing-ref')).toBe(true);

  const missingViewComponent = structuredClone(mockDb);
  missingViewComponent.views[0]!.annotations[0]!.componentId = 'CMP-DOES-NOT-EXIST';
  expect(verifyMockDb(missingViewComponent).some((issue) => issue.type === 'missing-ref')).toBe(true);

  const cyclic  = structuredClone(mockDb)                                ;
  const current = cyclic.decisions.find((item) => item.id === 'DEC-014') ;
  if (!current) throw new Error('DEC-014 must exist');
  current.supersededBy = 'DEC-011';
  expect(verifyMockDb(cyclic).some((issue) => issue.type === 'cycle')).toBe(true);
});

test('raw transcript preserves approval and unknown timestamps without inventing chronology', () => {
  expect(mockDb.raw_events.find((event) => event.id === 'RAW-014')?.transcript)
    .toBe('Chat에서 Native 이벤트를 직접 해석하지 않고 Adapter를 통하도록 하자. 이 방식으로 진행하자.');
  for (const session of mockDb.raw_sessions) {
    const events = mockDb.raw_events.filter((event) => event.sessionId === session.id);
    expect(new Set(events.map((event) => event.order)).size).toBe(events.length);
  }
  expect(mockDb.raw_events.find((event) => event.id === 'RAW-015')?.occurredAt).toBeNull();
  expect(mockDb.raw_events.find((event) => event.id === 'RAW-009')?.transcript).toBeNull();
});

test('database value rendering distinguishes absence, emptiness, zero and false', () => {
  const values = [null, '', 0, false].map(formatValue);
  expect(new Set(values).size).toBe(4);
  expect(formatValue({ nested: true })).not.toBe('[object Object]');
});
