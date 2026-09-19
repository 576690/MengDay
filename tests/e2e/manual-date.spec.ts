import { test, expect } from '@playwright/test';

test('record view starts weekly and daily manual entry uses selected date', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-09-19T08:10:00Z'));
  await page.goto('/');
  await page.getByRole('button', { name: '先在本机体验' }).click();
  const nav = (name: string) =>
    page
      .locator('.bottom-nav:visible,.sidebar nav:visible')
      .getByRole('button', { name, exact: true })
      .click();
  await nav('记录');
  await expect(page.getByRole('button', { name: '周', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await page.getByRole('button', { name: '日', exact: true }).click();
  await page.getByLabel('时间轴日期').fill('2026-09-10');
  await page.getByRole('button', { name: '补记时间', exact: true }).click();
  const fields = page.locator('input[type="datetime-local"]');
  await expect(fields.nth(0)).toHaveValue('2026-09-10T15:40');
  await expect(fields.nth(1)).toHaveValue('2026-09-10T16:10');
  await page.getByRole('button', { name: '关闭', exact: true }).click();
  await nav('今日');
  await nav('记录');
  await expect(page.getByRole('button', { name: '周', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  for (const view of ['周', '月']) {
    await page.getByRole('button', { name: view, exact: true }).click();
    await page.getByRole('button', { name: '补记时间', exact: true }).click();
    await expect(fields.nth(1)).toHaveValue('2026-09-19T16:10');
    await page.getByRole('button', { name: '关闭', exact: true }).click();
  }
});
