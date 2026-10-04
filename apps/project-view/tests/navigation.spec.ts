import { expect, test } from '@playwright/test';

test('top-level workspaces remain peers and identify the current page', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/projects/www/service');
  const navigation = page.getByRole('navigation', { name: '프로젝트 화면' });
  await expect(navigation.getByRole('link')).toHaveCount(3);
  await expect(page.getByRole('tablist')).toHaveCount(0);
  await expect(page.getByRole('tab')).toHaveCount(0);
  for (const [area, heading] of [['구조 맵', '프로젝트 구조'], ['근거 맵', '결정과 근거']]) {
    const link = navigation.getByRole('link', { name: area });
    await link.click();
    await expect(link).toHaveAttribute('aria-current', 'page');
    await expect(page.getByRole('heading', { name: heading, exact: true })).toBeVisible();
  }
  await navigation.getByRole('link', { name: 'Database' }).click();
  await expect(page.getByRole('heading', { name: 'Database', exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});

test('module detail routes open directly and preserve browser history', async ({ page }) => {
  await page.goto('/projects/www/service/chat?tab=composition&component=CMP-CHAT-STREAM');
  await expect(page.getByRole('heading', { name: 'Chat', exact: true })).toBeVisible();
  await expect(page.getByText('Conversation Stream', { exact: true }).first()).toBeVisible();
  const before = page.url();
  await page.getByRole('navigation', { name: 'Primary navigation' }).getByRole('link', { name: /Database/ }).click();
  await page.goBack();
  await expect(page).toHaveURL(before);
  await expect(page.getByText('Conversation Stream', { exact: true }).first()).toBeVisible();
  await page.goForward();
  await expect(page.getByRole('heading', { name: 'Database', exact: true })).toBeVisible();
});

test('every module has its own working preview', async ({ page }) => {
  for (const [slug, name] of [['monitor', 'Monitor'], ['chat', 'Chat'], ['dashboard', 'Dashboard']]) {
    await page.goto(`/projects/www/service/${slug}?tab=view`);
    await expect(page.getByRole('heading', { name, exact: true })).toBeVisible();
    await expect(page.getByText(/Mock preview/).first()).toBeVisible();
    await expect(page.locator('.annotation').first()).toBeVisible();
    await page.locator('.annotation').last().click();
    await expect(page).toHaveURL(/component=/);
    await expect(page.locator('.annotation.selected')).toHaveCount(1);
  }
});

test('a broken deep link preserves its identity and explains the missing record', async ({ page }) => {
  await page.goto('/projects/www/database?table=raw_events&row=RAW-NOT-FOUND');
  await expect(page.getByText(/RAW-NOT-FOUND/).first()).toBeVisible();
  await expect(page.getByText(/확인.*불가|찾을 수 없|없습니다/).first()).toBeVisible();
});

test('database controls, row selection, and detail tabs survive browser history', async ({ page }) => {
  await page.goto('/projects/www/database?table=raw_events');
  await page.getByRole('searchbox', { name: 'Search' }).fill('RAW-014');
  await expect(page).toHaveURL(/q=RAW-014/);
  await page.getByRole('combobox', { name: 'Sort' }).selectOption('order');
  await expect(page).toHaveURL(/sort=order/);
  await page.getByRole('button', { name: /정렬 방향 오름차순/ }).click();
  await expect(page).toHaveURL(/dir=desc/);
  await page.getByRole('link', { name: 'RAW-014 행 선택' }).click();
  await expect(page).toHaveURL(/row=RAW-014/);
  await page.getByRole('navigation', { name: 'Record detail views' }).getByRole('link', { name: 'Transcript' }).click();
  await expect(page.locator('.raw-transcript')).toContainText('Chat에서 Native 이벤트를 직접 해석하지 않고 Adapter를 통하도록 하자.');

  await page.goBack();
  await expect(page).toHaveURL(/row=RAW-014/);
  await expect(page.getByText('Fields', { exact: true })).toBeVisible();
  await page.goBack();
  await expect(page).not.toHaveURL(/row=/);
  await expect(page.getByRole('searchbox', { name: 'Search' })).toHaveValue('RAW-014');
  await expect(page.getByRole('combobox', { name: 'Sort' })).toHaveValue('order');
  await expect(page.getByRole('button', { name: /정렬 방향 내림차순/ })).toBeVisible();
  await page.goForward();
  await expect(page).toHaveURL(/row=RAW-014/);
});

test('database schema uses declared nullable types and nested references navigate', async ({ page }) => {
  await page.goto('/projects/www/database?table=project_nodes');
  await page.getByRole('button', { name: 'Schema' }).click();
  const displayLabel = page.getByRole('row').filter({ hasText: 'displayLabel' });
  await expect(displayLabel).toContainText('string');
  await expect(displayLabel).toContainText('optional');

  await page.goto('/projects/www/database?table=documents');
  await page.getByRole('button', { name: 'Schema' }).click();
  const includedInRuntime = page.getByRole('row').filter({ hasText: 'includedInRuntime' });
  await expect(includedInRuntime).toContainText('boolean | null');
  await expect(includedInRuntime).toContainText('yes');

  await page.goto('/projects/www/database?table=relations');
  await page.getByRole('link', { name: 'DEC-011 Database 레코드로 이동' }).click();
  await expect(page).toHaveURL(/table=decisions&row=DEC-011/);
  await expect(page.getByRole('heading', { name: 'DEC-011' })).toBeVisible();
});

test('raw transcript preserves newlines and copies the complete text', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('/projects/www/database?table=raw_events&row=RAW-016&detail=transcript');
  const transcript = page.locator('.raw-transcript') ;
  const source     = await transcript.textContent()  ;
  expect(source).toContain('\nChatMessageView.tsx:118\n');
  await page.getByRole('button', { name: 'RAW-016 전문 복사' }).click();
  await expect(page.getByRole('button', { name: '복사됨' })).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(source);
});

test('narrow database detail traps focus, closes with Escape, and restores the row trigger', async ({ page }) => {
  await page.setViewportSize({ width: 720, height: 900 });
  await page.goto('/projects/www/database?table=raw_events&q=RAW-014');
  const trigger = page.getByRole('link', { name: 'RAW-014 행 선택' });
  await trigger.click();
  const detail = page.getByRole('dialog', { name: 'RAW-014 record detail' });
  await expect(detail).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(detail.locator(':focus')).toHaveCount(1);
  await page.keyboard.press('Escape');
  await expect(page).not.toHaveURL(/row=/);
  await expect(trigger).toBeFocused();
});

test('a selected database row is revealed inside the grid without moving the document', async ({ page }) => {
  await page.goto('/projects/www/database?table=raw_events&row=RAW-014');
  const position = await page.locator('tr[data-record-id="RAW-014"]').evaluate((row) => {
    const grid    = row.closest('.record-grid-scroll')  ;
    if (!grid) throw new Error('selected row is outside the database grid');
    const rowBox  = row.getBoundingClientRect()  ;
    const gridBox = grid.getBoundingClientRect() ;
    return { visible: rowBox.top >= gridBox.top && rowBox.bottom <= gridBox.bottom, documentScroll: window.scrollY };
  });
  expect(position.visible).toBe(true);
  expect(position.documentScroll).toBe(0);
});

for (const width of [1920, 1440, 1024, 720, 390]) {
  test(`important reading surfaces stay within ${width}px viewport`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    for (const route of [
      '/projects/www/service',
      '/projects/www/service/chat?tab=view',
      '/projects/www/service/chat?tab=principles&principle=PRN-003',
      '/projects/www/assurance?check=CHK-014',
      '/projects/www/database?table=raw_events&row=RAW-017',
    ]) {
      await page.goto(route);
      await expect(page.locator('h1')).toBeVisible();
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow, route).toBeLessThanOrEqual(1);
    }
  });
}
