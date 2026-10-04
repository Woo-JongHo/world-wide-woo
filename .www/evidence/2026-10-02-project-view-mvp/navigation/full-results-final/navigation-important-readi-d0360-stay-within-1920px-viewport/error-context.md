# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: navigation.spec.ts >> important reading surfaces stay within 1920px viewport
- Location: tests/navigation.spec.ts:134:3

# Error details

```
Test timeout of 30000ms exceeded.
```

```
Error: page.goto: Test timeout of 30000ms exceeded.
Call log:
  - navigating to "http://127.0.0.1:4173/projects/www/service/chat?tab=principles&principle=PRN-003", waiting until "load"

```

# Page snapshot

```yaml
- generic [ref=f1e3]:
  - banner [ref=f1e4]:
    - generic [ref=f1e5]:
      - generic [ref=f1e6]: W
      - generic [ref=f1e7]:
        - strong [ref=f1e8]: WWW
        - generic [ref=f1e9]: Project View
    - generic [ref=f1e10]:
      - generic [ref=f1e11]: MOCK
      - generic [ref=f1e12]: READ ONLY
      - code [ref=f1e13]: main / 4f2c9a1
  - navigation "Primary navigation" [ref=f1e14]:
    - link "01 Service" [ref=f1e15] [cursor=pointer]:
      - /url: /projects/www/service
      - generic [ref=f1e16]: "01"
      - strong [ref=f1e17]: Service
    - link "02 Assurance" [ref=f1e18] [cursor=pointer]:
      - /url: /projects/www/assurance
      - generic [ref=f1e19]: "02"
      - strong [ref=f1e20]: Assurance
    - link "03 Database" [ref=f1e21] [cursor=pointer]:
      - /url: /projects/www/database
      - generic [ref=f1e22]: "03"
      - strong [ref=f1e23]: Database
  - main [ref=f1e24]:
    - generic [ref=f1e25]:
      - navigation "Breadcrumb" [ref=f1e26]:
        - generic [ref=f1e27]: WWW /
        - generic [ref=f1e28]:
          - link "Service" [ref=f1e29] [cursor=pointer]:
            - /url: /projects/www/service
          - text: /
        - generic [ref=f1e30]: Chat
      - generic [ref=f1e31]:
        - generic [ref=f1e32]:
          - paragraph [ref=f1e33]: Service module · MOD-CHAT
          - heading "Chat" [level=1] [ref=f1e34]
          - paragraph [ref=f1e35]: 대화, 도구 실행, 계획과 검사 상태를 하나의 작업 흐름으로 표현한다.
        - generic [ref=f1e36]:
          - generic [ref=f1e37]: Implementation
          - code [ref=f1e38]: src/adapters/inbound/tui/features/chat
      - navigation "Service modules" [ref=f1e39]:
        - link "Monitor" [ref=f1e40] [cursor=pointer]:
          - /url: /projects/www/service/monitor?tab=overview
        - link "Chat" [ref=f1e41] [cursor=pointer]:
          - /url: /projects/www/service/chat?tab=overview
        - link "Dashboard" [ref=f1e42] [cursor=pointer]:
          - /url: /projects/www/service/dashboard?tab=overview
      - navigation "Chat detail views" [ref=f1e43]:
        - link "Overview 화면" [ref=f1e44] [cursor=pointer]:
          - /url: /projects/www/service/chat?tab=overview
          - text: Overview
        - link "Composition 화면" [ref=f1e45] [cursor=pointer]:
          - /url: /projects/www/service/chat?tab=composition
          - text: Composition
        - link "View 화면" [ref=f1e46] [cursor=pointer]:
          - /url: /projects/www/service/chat?tab=view
          - text: View
        - link "Principles 화면" [ref=f1e47] [cursor=pointer]:
          - /url: /projects/www/service/chat?tab=principles
          - text: Principles
        - link "Decisions 화면" [ref=f1e48] [cursor=pointer]:
          - /url: /projects/www/service/chat?tab=decisions
          - text: Decisions
      - generic [ref=f1e49]:
        - generic [ref=f1e50]:
          - generic [ref=f1e51]:
            - generic [ref=f1e52]: Chat / Mock preview
            - code [ref=f1e53]: revision 4f2c9a1
          - generic "Chat mock preview" [ref=f1e54]:
            - generic [aria-hidden] [ref=f1e55]: "01"
            - generic [ref=f1e56]:
              - generic [ref=f1e57]:
                - generic [ref=f1e58]: WWW
                - paragraph [ref=f1e59]: Native workbench · project context ready
              - generic [ref=f1e60]:
                - text: YOU
                - paragraph [ref=f1e61]: Chat 표시 경계를 확인하고 테스트해 줘.
              - generic [ref=f1e62]:
                - text: NATIVE
                - paragraph [ref=f1e63]: Adapter 경계와 View 참조를 확인하고 있습니다.
                - generic [ref=f1e64]:
                  - generic [ref=f1e65]: TOOL · search
                  - code [ref=f1e66]: nativePayload → 3 matches
                - paragraph [ref=f1e67]: 한 곳의 직접 참조가 남아 검사 기준을 충족하지 못했습니다.
            - complementary [ref=f1e68]:
              - generic [ref=f1e69]:
                - text: PLAN
                - paragraph [ref=f1e70]: Chat boundary review
                - list [ref=f1e71]:
                  - listitem [ref=f1e72]: Inspect adapter
                  - listitem [ref=f1e73]: Trace View model
                  - listitem [ref=f1e74]: Run checks
              - generic [ref=f1e75]:
                - text: PROGRESS · 2/3
                - generic [ref=f1e76]: Adapter linked
                - generic [ref=f1e78]: View scan failed
              - generic [ref=f1e80]:
                - text: TEST
                - generic [ref=f1e81]:
                  - generic [ref=f1e82]:
                    - term [ref=f1e83]: Static refs
                    - definition [ref=f1e84]: 0.8s
                  - generic [ref=f1e85]:
                    - term [ref=f1e86]: Passed
                    - definition [ref=f1e87]: "3"
                  - generic [ref=f1e88]:
                    - term [ref=f1e89]: Failed
                    - definition [ref=f1e90]: "1"
            - generic [ref=f1e91]:
              - generic [ref=f1e92]:
                - generic [ref=f1e93]: receive
                - generic [ref=f1e95]: queue
                - generic [ref=f1e97]: project
                - generic [ref=f1e99]: publish
                - generic [ref=f1e101]: schedule
                - generic [ref=f1e103]: layout
                - generic [ref=f1e105]: write
              - generic [ref=f1e107]:
                - generic [ref=f1e108]: Message Native…
                - generic [ref=f1e109]: ↵
            - generic [ref=f1e110]:
              - generic [ref=f1e111]: ADAPTER
              - code [ref=f1e112]: NativeEvent → ChatMessage
        - complementary [ref=f1e113]:
          - paragraph [ref=f1e114]: View annotations
          - heading "구성요소" [level=2] [ref=f1e115]
          - link "01 Input Composer 사용자 입력과 실행 직전의 7단계 상태를 배치한다." [ref=f1e116] [cursor=pointer]:
            - /url: /projects/www/service/chat?tab=view&component=CMP-CHAT-INPUT
            - generic [ref=f1e117]: "01"
            - generic [ref=f1e118]:
              - strong [ref=f1e119]: Input Composer
              - generic [ref=f1e120]: 사용자 입력과 실행 직전의 7단계 상태를 배치한다.
          - link "02 Conversation Stream 대화 메시지를 Adapter가 정규화한 표시 모델로 렌더링한다." [ref=f1e121] [cursor=pointer]:
            - /url: /projects/www/service/chat?tab=view&component=CMP-CHAT-STREAM
            - generic [ref=f1e122]: "02"
            - generic [ref=f1e123]:
              - strong [ref=f1e124]: Conversation Stream
              - generic [ref=f1e125]: 대화 메시지를 Adapter가 정규화한 표시 모델로 렌더링한다.
          - link "03 Tool Activity 도구 실행과 결과를 대화 문맥 안에서 구분한다." [ref=f1e126] [cursor=pointer]:
            - /url: /projects/www/service/chat?tab=view&component=CMP-CHAT-TOOLS
            - generic [ref=f1e127]: "03"
            - generic [ref=f1e128]:
              - strong [ref=f1e129]: Tool Activity
              - generic [ref=f1e130]: 도구 실행과 결과를 대화 문맥 안에서 구분한다.
          - link "04 Plan / Progress / Test Rail 계획, 세부 진행, 검사 결과의 포함 관계를 보여준다." [ref=f1e131] [cursor=pointer]:
            - /url: /projects/www/service/chat?tab=view&component=CMP-CHAT-RAIL
            - generic [ref=f1e132]: "04"
            - generic [ref=f1e133]:
              - strong [ref=f1e134]: Plan / Progress / Test Rail
              - generic [ref=f1e135]: 계획, 세부 진행, 검사 결과의 포함 관계를 보여준다.
          - link "05 Chat Event Adapter Native 이벤트를 View가 소비하는 모델로 변환한다." [ref=f1e136] [cursor=pointer]:
            - /url: /projects/www/service/chat?tab=view&component=CMP-CHAT-ADAPTER
            - generic [ref=f1e137]: "05"
            - generic [ref=f1e138]:
              - strong [ref=f1e139]: Chat Event Adapter
              - generic [ref=f1e140]: Native 이벤트를 View가 소비하는 모델로 변환한다.
          - generic [ref=f1e141]:
            - heading "Selected evidence" [level=3] [ref=f1e142]
            - code [ref=f1e143]: features/chat/view/input-composer.tsx
            - link "PRN-002 Database 레코드로 이동" [ref=f1e144] [cursor=pointer]:
              - /url: /projects/www/database?table=principles&row=PRN-002
              - text: PRN-002
  - contentinfo [ref=f1e145]:
    - generic [ref=f1e146]: Mock snapshot · 2026-09-28·
    - generic [ref=f1e147]: Revision 4f2c9a1·
    - generic [ref=f1e148]: Times shown in Asia/Seoul·
    - generic [ref=f1e149]: 82 records
```

# Test source

```ts
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
  59  |   await page.getByRole('link', { name: 'RAW-014 행 선택' }).click();
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
  77  |   await page.goto('/projects/www/database?table=project_nodes');
  78  |   await page.getByRole('button', { name: 'Schema' }).click();
  79  |   const displayLabel = page.getByRole('row').filter({ hasText: 'displayLabel' });
  80  |   await expect(displayLabel).toContainText('string');
  81  |   await expect(displayLabel).toContainText('optional');
  82  | 
  83  |   await page.goto('/projects/www/database?table=documents');
  84  |   await page.getByRole('button', { name: 'Schema' }).click();
  85  |   const includedInRuntime = page.getByRole('row').filter({ hasText: 'includedInRuntime' });
  86  |   await expect(includedInRuntime).toContainText('boolean | null');
  87  |   await expect(includedInRuntime).toContainText('yes');
  88  | 
  89  |   await page.goto('/projects/www/database?table=relations');
  90  |   await page.getByRole('link', { name: 'DEC-011 Database 레코드로 이동' }).click();
  91  |   await expect(page).toHaveURL(/table=decisions&row=DEC-011/);
  92  |   await expect(page.getByRole('heading', { name: 'DEC-011' })).toBeVisible();
  93  | });
  94  | 
  95  | test('raw transcript preserves newlines and copies the complete text', async ({ page, context }) => {
  96  |   await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  97  |   await page.goto('/projects/www/database?table=raw_events&row=RAW-016&detail=transcript');
  98  |   const transcript = page.locator('.raw-transcript') ;
  99  |   const source     = await transcript.textContent()  ;
  100 |   expect(source).toContain('\nChatMessageView.tsx:118\n');
  101 |   await page.getByRole('button', { name: 'RAW-016 전문 복사' }).click();
  102 |   await expect(page.getByRole('button', { name: '복사됨' })).toBeVisible();
  103 |   expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(source);
  104 | });
  105 | 
  106 | test('narrow database detail traps focus, closes with Escape, and restores the row trigger', async ({ page }) => {
  107 |   await page.setViewportSize({ width: 720, height: 900 });
  108 |   await page.goto('/projects/www/database?table=raw_events&q=RAW-014');
  109 |   const trigger = page.getByRole('link', { name: 'RAW-014 행 선택' });
  110 |   await trigger.click();
  111 |   const detail = page.getByRole('dialog', { name: 'RAW-014 record detail' });
  112 |   await expect(detail).toBeFocused();
  113 |   await page.keyboard.press('Shift+Tab');
  114 |   await expect(detail.locator(':focus')).toHaveCount(1);
  115 |   await page.keyboard.press('Escape');
  116 |   await expect(page).not.toHaveURL(/row=/);
  117 |   await expect(trigger).toBeFocused();
  118 | });
  119 | 
  120 | test('a selected database row is revealed inside the grid without moving the document', async ({ page }) => {
  121 |   await page.goto('/projects/www/database?table=raw_events&row=RAW-014');
  122 |   const position = await page.locator('tr[data-record-id="RAW-014"]').evaluate((row) => {
  123 |     const grid    = row.closest('.record-grid-scroll')  ;
  124 |     if (!grid) throw new Error('selected row is outside the database grid');
  125 |     const rowBox  = row.getBoundingClientRect()  ;
  126 |     const gridBox = grid.getBoundingClientRect() ;
  127 |     return { visible: rowBox.top >= gridBox.top && rowBox.bottom <= gridBox.bottom, documentScroll: window.scrollY };
  128 |   });
  129 |   expect(position.visible).toBe(true);
  130 |   expect(position.documentScroll).toBe(0);
  131 | });
  132 | 
  133 | for (const width of [1920, 1440, 1024, 720, 390]) {
  134 |   test(`important reading surfaces stay within ${width}px viewport`, async ({ page }) => {
  135 |     await page.setViewportSize({ width, height: 900 });
  136 |     for (const route of [
  137 |       '/projects/www/service',
  138 |       '/projects/www/service/chat?tab=view',
  139 |       '/projects/www/service/chat?tab=principles&principle=PRN-003',
  140 |       '/projects/www/assurance?check=CHK-014',
  141 |       '/projects/www/database?table=raw_events&row=RAW-017',
  142 |     ]) {
> 143 |       await page.goto(route);
      |                  ^ Error: page.goto: Test timeout of 30000ms exceeded.
  144 |       await expect(page.locator('h1')).toBeVisible();
  145 |       const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  146 |       expect(overflow, route).toBeLessThanOrEqual(1);
  147 |     }
  148 |   });
  149 | }
  150 | 
```