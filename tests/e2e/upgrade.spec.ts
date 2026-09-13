import { test, expect } from '@playwright/test';
import { initialData, dayBounds, dateKey, backup, uid } from '../../src/model';

test('short timer is ignored offline and activity remains available', async ({ page, context }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '先在本机体验' }).click();
  await page.getByRole('button', { name: '开始记录', exact: true }).click();
  await page.getByRole('textbox', { name: '活动名称', exact: true }).fill('误触测试');
  await page.getByRole('textbox', { name: /备注/ }).fill('应丢弃的备注');
  await page.getByRole('button', { name: '开始记录', exact: true }).click();
  await context.setOffline(true);
  await page.getByRole('button', { name: '结束这段记录' }).click();
  await expect(page.locator('.toast')).toContainText('已忽略不足一分钟的计时');
  await expect(page.locator('.activity-card').filter({ hasText: '误触测试' })).toBeVisible();
  await context.setOffline(false);
  await page.reload();
  await page
    .locator('.bottom-nav:visible,.sidebar nav:visible')
    .getByRole('button', { name: '记录', exact: true })
    .click();
  await expect(page.getByTestId('timeline-block')).toHaveCount(0);
});

test('category reports expand and installed shell keeps inputs usable', async ({ page }) => {
  await page.addInitScript(() => Object.defineProperty(navigator, 'standalone', { value: true }));
  await page.goto('/');
  await page.getByRole('button', { name: '先在本机体验' }).click();
  const nav = (name: string) =>
    page
      .locator('.bottom-nav:visible,.sidebar nav:visible')
      .getByRole('button', { name, exact: true })
      .click();
  const d = initialData(),
    s = dayBounds(dateKey(Date.now(), d.settings.timezone), d.settings.timezone)[0];
  d.activities[0].category = '学习类';
  d.activities[1].category = ' 学习类 ';
  d.activities[0].name = '分类测试甲';
  d.activities[1].name = '分类测试乙';
  d.entries = d.activities.slice(0, 2).map((a, i) => ({
    id: uid(),
    activityId: a.id,
    start: s + i * 3600000,
    end: s + (i + 1) * 3600000,
    note: '保留备注',
  }));
  await nav('设置');
  await expect(page.getByRole('button', { name: '添加到主屏幕' })).toBeHidden();
  await page.getByLabel('导入备份', { exact: true }).setInputFiles({
    name: 'categories.json',
    mimeType: 'application/json',
    buffer: Buffer.from(backup(d)),
  });
  await page.getByRole('button', { name: '确认合并', exact: true }).click();
  await expect(page.locator('.toast')).toContainText('备份已合并');
  await nav('统计');
  await page.getByRole('button', { name: '按分类', exact: true }).click();
  await expect(page.locator('.category-report')).toHaveCount(1);
  await expect(page.locator('.category-report summary')).toContainText('100%');
  await page.locator('.category-report summary').click();
  await expect(page.locator('.category-report .report-row')).toHaveCount(2);
  await expect(page.locator('.category-report .report-row').first()).toBeVisible();
  if (test.info().project.name === 'mobile') {
    await expect(page.locator('.topbar')).toHaveCSS('background-color', 'rgb(24, 34, 55)');
    await expect(page.locator('body')).not.toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: 'test-results/iphone-categories.png', fullPage: true });
  }
  await page.getByRole('button', { name: '按活动', exact: true }).click();
  await expect(page.getByRole('heading', { name: '活动明细' })).toBeVisible();
});
