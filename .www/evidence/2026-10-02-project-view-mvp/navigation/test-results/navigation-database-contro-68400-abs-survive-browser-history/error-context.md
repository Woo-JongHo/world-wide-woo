# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: navigation.spec.ts >> database controls, row selection, and detail tabs survive browser history
- Location: tests/navigation.spec.ts:51:1

# Error details

```
Test timeout of 30000ms exceeded.
```

```
Error: locator.click: Test timeout of 30000ms exceeded.
Call log:
  - waiting for getByRole('link', { name: 'RAW-014 행 선택' })
    - locator resolved to <a class="row-select" aria-label="RAW-014 행 선택" href="/projects/www/database?table=raw_events&row=RAW-014&q=RAW-014&sort=order&dir=desc">RAW-014</a>

```

# Page snapshot

```yaml
- generic [ref=e3]:
  - banner [ref=e4]:
    - generic [ref=e5]:
      - generic [ref=e6]: W
      - generic [ref=e7]:
        - strong [ref=e8]: WWW
        - generic [ref=e9]: Project View
    - generic [ref=e10]:
      - generic [ref=e11]: MOCK
      - generic [ref=e12]: READ ONLY
      - code [ref=e13]: main / 4f2c9a1
  - navigation "Primary navigation" [ref=e14]:
    - link "01 Service" [ref=e15] [cursor=pointer]:
      - /url: /projects/www/service
      - generic [ref=e16]: "01"
      - strong [ref=e17]: Service
    - link "02 Assurance" [ref=e18] [cursor=pointer]:
      - /url: /projects/www/assurance
      - generic [ref=e19]: "02"
      - strong [ref=e20]: Assurance
    - link "03 Database" [ref=e21] [cursor=pointer]:
      - /url: /projects/www/database
      - generic [ref=e22]: "03"
      - strong [ref=e23]: Database
  - main [ref=e24]:
    - generic [ref=e25]:
      - navigation "Breadcrumb" [ref=e26]:
        - generic [ref=e27]: WWW /
        - generic [ref=e28]: Database
      - generic [ref=e29]:
        - generic [ref=e30]:
          - paragraph [ref=e31]: Common data entry · 11 mock tables
          - heading "Database" [level=1] [ref=e32]
          - paragraph [ref=e33]: Service와 Assurance가 함께 사용하는 구조화 데이터와 보존된 RAW를 읽습니다.
        - generic [ref=e34]:
          - generic [ref=e35]: READ ONLY
          - generic [ref=e36]: Mock metadata · no SQL
      - generic [ref=e37]:
        - complementary [ref=e38]:
          - heading "Tables" [level=2] [ref=e39]
          - generic [ref=e40]:
            - heading "Structure" [level=3] [ref=e41]
            - link "project_nodes 15" [ref=e42] [cursor=pointer]:
              - /url: /projects/www/database?table=project_nodes
              - generic [ref=e43]: project_nodes
              - generic [ref=e44]: "15"
            - link "relations 22" [ref=e45] [cursor=pointer]:
              - /url: /projects/www/database?table=relations
              - generic [ref=e46]: relations
              - generic [ref=e47]: "22"
            - link "views 3" [ref=e48] [cursor=pointer]:
              - /url: /projects/www/database?table=views
              - generic [ref=e49]: views
              - generic [ref=e50]: "3"
          - generic [ref=e51]:
            - heading "Rules & Decisions" [level=3] [ref=e52]
            - link "documents 3" [ref=e53] [cursor=pointer]:
              - /url: /projects/www/database?table=documents
              - generic [ref=e54]: documents
              - generic [ref=e55]: "3"
            - link "principles 4" [ref=e56] [cursor=pointer]:
              - /url: /projects/www/database?table=principles
              - generic [ref=e57]: principles
              - generic [ref=e58]: "4"
            - link "decisions 5" [ref=e59] [cursor=pointer]:
              - /url: /projects/www/database?table=decisions
              - generic [ref=e60]: decisions
              - generic [ref=e61]: "5"
          - generic [ref=e62]:
            - heading "Evidence" [level=3] [ref=e63]
            - link "commits 2" [ref=e64] [cursor=pointer]:
              - /url: /projects/www/database?table=commits
              - generic [ref=e65]: commits
              - generic [ref=e66]: "2"
            - link "implementation_links 2" [ref=e67] [cursor=pointer]:
              - /url: /projects/www/database?table=implementation_links
              - generic [ref=e68]: implementation_links
              - generic [ref=e69]: "2"
            - link "verification_runs 5" [ref=e70] [cursor=pointer]:
              - /url: /projects/www/database?table=verification_runs
              - generic [ref=e71]: verification_runs
              - generic [ref=e72]: "5"
          - generic [ref=e73]:
            - heading "RAW" [level=3] [ref=e74]
            - link "raw_sessions 2" [ref=e75] [cursor=pointer]:
              - /url: /projects/www/database?table=raw_sessions
              - generic [ref=e76]: raw_sessions
              - generic [ref=e77]: "2"
            - link "raw_events 19" [ref=e78] [cursor=pointer]:
              - /url: /projects/www/database?table=raw_events
              - generic [ref=e79]: raw_events
              - generic [ref=e80]: "19"
        - generic [ref=e81]:
          - generic [ref=e82]:
            - generic [ref=e83]:
              - paragraph [ref=e84]: Records / raw_events
              - heading "raw_events" [level=2] [ref=e85]
              - paragraph [ref=e86]: 순서와 전문을 보존한 원본 이벤트
            - button "Schema" [ref=e87] [cursor=pointer]
          - generic [ref=e88]:
            - generic [ref=e89]:
              - text: Search
              - searchbox "Search" [ref=e90]: RAW-014
            - generic [ref=e91]:
              - text: Sort
              - combobox "Sort" [ref=e92]:
                - option "id"
                - option "eventKind"
                - option "sessionId"
                - option "order" [selected]
                - option "occurredAt"
            - button "정렬 방향 내림차순" [active] [ref=e93] [cursor=pointer]: ↓
            - generic [ref=e94]: 1 / 19 records
          - table [ref=e96]:
            - rowgroup [ref=e97]:
              - row [ref=e98]:
                - columnheader "id" [ref=e99]
                - columnheader "eventKind" [ref=e100]
                - columnheader "sessionId" [ref=e101]
                - columnheader "order" [ref=e102]
                - columnheader "occurredAt" [ref=e103]
            - rowgroup [ref=e104]:
              - row [ref=e105]:
                - cell [ref=e106]:
                  - link "RAW-014 행 선택" [ref=e107] [cursor=pointer]:
                    - /url: /projects/www/database?table=raw_events&row=RAW-014&q=RAW-014&sort=order&dir=desc
                    - text: RAW-014
                - cell "user" [ref=e108]
                - cell [ref=e109]:
                  - link "SES-001 Database 레코드로 이동" [ref=e110] [cursor=pointer]:
                    - /url: /projects/www/database?table=raw_sessions&row=SES-001
                    - text: SES-001
                - cell "14" [ref=e111]
                - cell "2026-09-28T14:33:00+09:00" [ref=e112]
  - contentinfo [ref=e113]:
    - generic [ref=e114]: Mock snapshot · 2026-09-28·
    - generic [ref=e115]: Revision 4f2c9a1·
    - generic [ref=e116]: Times shown in Asia/Seoul·
    - generic [ref=e117]: 82 records
```

# Test source

```ts
  1   | import { expect, test } from '@playwright/test';
  2   | 
  3   | test('top-level workspaces remain peers and identify the current page', async ({ page }) => {
  4   |   const errors: string[] = [];
  5   |   page.on('pageerror', (error) => errors.push(error.message));
  6   |   await page.goto('/projects/www/service');
  7   |   const navigation = page.getByRole('navigation', { name: 'Primary navigation' });
  8   |   await expect(navigation.getByRole('link')).toHaveCount(3);
  9   |   await expect(page.getByRole('tablist')).toHaveCount(0);
  10  |   await expect(page.getByRole('tab')).toHaveCount(0);
  11  |   for (const area of ['Service', 'Assurance', 'Database']) {
  12  |     const link = navigation.getByRole('link', { name: new RegExp(area) });
  13  |     await link.click();
  14  |     await expect(link).toHaveAttribute('aria-current', 'page');
  15  |     await expect(page.getByRole('heading', { name: area, exact: true })).toBeVisible();
  16  |   }
  17  |   expect(errors).toEqual([]);
  18  | });
  19  | 
  20  | test('module detail routes open directly and preserve browser history', async ({ page }) => {
  21  |   await page.goto('/projects/www/service/chat?tab=composition&component=CMP-CHAT-STREAM');
  22  |   await expect(page.getByRole('heading', { name: 'Chat', exact: true })).toBeVisible();
  23  |   await expect(page.getByText('Conversation Stream', { exact: true }).first()).toBeVisible();
  24  |   const before = page.url();
  25  |   await page.getByRole('navigation', { name: 'Primary navigation' }).getByRole('link', { name: /Database/ }).click();
  26  |   await page.goBack();
  27  |   await expect(page).toHaveURL(before);
  28  |   await expect(page.getByText('Conversation Stream', { exact: true }).first()).toBeVisible();
  29  |   await page.goForward();
  30  |   await expect(page.getByRole('heading', { name: 'Database', exact: true })).toBeVisible();
  31  | });
  32  | 
  33  | test('every module has its own working preview', async ({ page }) => {
  34  |   for (const [slug, name] of [['monitor', 'Monitor'], ['chat', 'Chat'], ['dashboard', 'Dashboard']]) {
  35  |     await page.goto(`/projects/www/service/${slug}?tab=view`);
  36  |     await expect(page.getByRole('heading', { name, exact: true })).toBeVisible();
  37  |     await expect(page.getByText(/Mock preview/).first()).toBeVisible();
  38  |     await expect(page.locator('.annotation').first()).toBeVisible();
  39  |     await page.locator('.annotation').last().click();
  40  |     await expect(page).toHaveURL(/component=/);
  41  |     await expect(page.locator('.annotation.selected')).toHaveCount(1);
  42  |   }
  43  | });
  44  | 
  45  | test('a broken deep link preserves its identity and explains the missing record', async ({ page }) => {
  46  |   await page.goto('/projects/www/database?table=raw_events&row=RAW-NOT-FOUND');
  47  |   await expect(page.getByText(/RAW-NOT-FOUND/).first()).toBeVisible();
  48  |   await expect(page.getByText(/확인.*불가|찾을 수 없|없습니다/).first()).toBeVisible();
  49  | });
  50  | 
  51  | test('database controls, row selection, and detail tabs survive browser history', async ({ page }) => {
  52  |   await page.goto('/projects/www/database?table=raw_events');
  53  |   await page.getByRole('searchbox', { name: 'Search' }).fill('RAW-014');
  54  |   await expect(page).toHaveURL(/q=RAW-014/);
  55  |   await page.getByRole('combobox', { name: 'Sort' }).selectOption('order');
  56  |   await expect(page).toHaveURL(/sort=order/);
  57  |   await page.getByRole('button', { name: /정렬 방향 오름차순/ }).click();
  58  |   await expect(page).toHaveURL(/dir=desc/);
> 59  |   await page.getByRole('link', { name: 'RAW-014 행 선택' }).click();
      |                                                          ^ Error: locator.click: Test timeout of 30000ms exceeded.
  60  |   await expect(page).toHaveURL(/row=RAW-014/);
  61  |   await page.getByRole('navigation', { name: 'Record detail views' }).getByRole('link', { name: 'Transcript' }).click();
  62  |   await expect(page.locator('.raw-transcript')).toContainText('Chat에서 Native 이벤트를 직접 해석하지 않고 Adapter를 통하도록 하자.');
  63  | 
  64  |   await page.goBack();
  65  |   await expect(page).toHaveURL(/row=RAW-014/);
  66  |   await expect(page.getByText('Fields', { exact: true })).toBeVisible();
  67  |   await page.goBack();
  68  |   await expect(page).not.toHaveURL(/row=/);
  69  |   await expect(page.getByRole('searchbox', { name: 'Search' })).toHaveValue('RAW-014');
  70  |   await expect(page.getByRole('combobox', { name: 'Sort' })).toHaveValue('order');
  71  |   await expect(page.getByRole('button', { name: /정렬 방향 내림차순/ })).toBeVisible();
  72  |   await page.goForward();
  73  |   await expect(page).toHaveURL(/row=RAW-014/);
  74  | });
  75  | 
  76  | test('database schema uses declared nullable types and nested references navigate', async ({ page }) => {
  77  |   await page.goto('/projects/www/database?table=documents');
  78  |   await page.getByRole('button', { name: 'Schema' }).click();
  79  |   const includedInRuntime = page.getByRole('row').filter({ hasText: 'includedInRuntime' });
  80  |   await expect(includedInRuntime).toContainText('boolean | null');
  81  |   await expect(includedInRuntime).toContainText('yes');
  82  | 
  83  |   await page.goto('/projects/www/database?table=relations');
  84  |   await page.getByRole('link', { name: 'DEC-011 Database 레코드로 이동' }).click();
  85  |   await expect(page).toHaveURL(/table=decisions&row=DEC-011/);
  86  |   await expect(page.getByRole('heading', { name: 'DEC-011' })).toBeVisible();
  87  | });
  88  | 
  89  | test('raw transcript preserves newlines and copies the complete text', async ({ page, context }) => {
  90  |   await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  91  |   await page.goto('/projects/www/database?table=raw_events&row=RAW-016&detail=transcript');
  92  |   const transcript = page.locator('.raw-transcript') ;
  93  |   const source     = await transcript.textContent()  ;
  94  |   expect(source).toContain('\nChatMessageView.tsx:118\n');
  95  |   await page.getByRole('button', { name: 'RAW-016 전문 복사' }).click();
  96  |   await expect(page.getByRole('button', { name: '복사됨' })).toBeVisible();
  97  |   expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(source);
  98  | });
  99  | 
  100 | test('narrow database detail traps focus, closes with Escape, and restores the row trigger', async ({ page }) => {
  101 |   await page.setViewportSize({ width: 720, height: 900 });
  102 |   await page.goto('/projects/www/database?table=raw_events&q=RAW-014');
  103 |   const trigger = page.getByRole('link', { name: 'RAW-014 행 선택' });
  104 |   await trigger.click();
  105 |   const detail = page.getByRole('dialog', { name: 'RAW-014 record detail' });
  106 |   await expect(detail).toBeFocused();
  107 |   await page.keyboard.press('Shift+Tab');
  108 |   await expect(detail.locator(':focus')).toHaveCount(1);
  109 |   await page.keyboard.press('Escape');
  110 |   await expect(page).not.toHaveURL(/row=/);
  111 |   await expect(trigger).toBeFocused();
  112 | });
  113 | 
  114 | test('a selected database row is revealed inside the grid without moving the document', async ({ page }) => {
  115 |   await page.goto('/projects/www/database?table=raw_events&row=RAW-014');
  116 |   const position = await page.locator('tr[data-record-id="RAW-014"]').evaluate((row) => {
  117 |     const grid    = row.closest('.record-grid-scroll')  ;
  118 |     if (!grid) throw new Error('selected row is outside the database grid');
  119 |     const rowBox  = row.getBoundingClientRect()  ;
  120 |     const gridBox = grid.getBoundingClientRect() ;
  121 |     return { visible: rowBox.top >= gridBox.top && rowBox.bottom <= gridBox.bottom, documentScroll: window.scrollY };
  122 |   });
  123 |   expect(position.visible).toBe(true);
  124 |   expect(position.documentScroll).toBe(0);
  125 | });
  126 | 
  127 | for (const width of [1920, 1440, 1024, 720, 390]) {
  128 |   test(`important reading surfaces stay within ${width}px viewport`, async ({ page }) => {
  129 |     await page.setViewportSize({ width, height: 900 });
  130 |     for (const route of [
  131 |       '/projects/www/service',
  132 |       '/projects/www/service/chat?tab=view',
  133 |       '/projects/www/service/chat?tab=principles&principle=PRN-003',
  134 |       '/projects/www/assurance?check=CHK-014',
  135 |       '/projects/www/database?table=raw_events&row=RAW-017',
  136 |     ]) {
  137 |       await page.goto(route);
  138 |       await expect(page.locator('h1')).toBeVisible();
  139 |       const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  140 |       expect(overflow, route).toBeLessThanOrEqual(1);
  141 |     }
  142 |   });
  143 | }
  144 | 
```