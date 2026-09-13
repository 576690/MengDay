import { test, expect } from '@playwright/test';
import { formatInTimeZone } from 'date-fns-tz';
import { readFile } from 'node:fs/promises';
test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '先在本机体验' }).click();
  await expect(page.getByRole('heading', { name: '今天，把时间花在哪里？' })).toBeVisible();
});
test('timer, autosaved notes, name memory, history and offline reload', async ({
  page,
  context,
}) => {
  await expect(page.locator('.timer-digits')).toHaveText('00:00:00');
  await page.getByRole('button', { name: '开始记录', exact: true }).click();
  await page.getByRole('textbox', { name: '活动名称', exact: true }).fill('深度写作');
  await page.getByRole('textbox', { name: /备注/ }).fill('整理这一章\n想到一个新角度');
  await page.getByRole('button', { name: '开始记录', exact: true }).click();
  await expect(page.locator('.timer-center h2')).toHaveText('深度写作');
  await page.getByRole('textbox', { name: '当前活动备注' }).fill('整理这一章\n想法已经保存');
  await expect(page.locator('.timer-note small')).toHaveText('已保存');
  await page.reload();
  await expect(page.getByRole('textbox', { name: '当前活动备注' })).toHaveValue(
    '整理这一章\n想法已经保存',
  );
  await context.setOffline(true);
  await page.clock.setFixedTime(new Date(Date.now() + 120000));
  await page.getByRole('button', { name: '结束这段记录' }).click();
  await page.getByRole('button', { name: '开始记录', exact: true }).click();
  await page.getByRole('textbox', { name: '活动名称', exact: true }).fill('深度');
  await page.getByRole('textbox', { name: '活动名称', exact: true }).press('ArrowDown');
  await expect(
    page.locator('.suggestions').getByRole('button', { name: /深度写作/ }),
  ).toBeFocused();
  await page
    .locator('.suggestions')
    .getByRole('button', { name: /深度写作/ })
    .press('Enter');
  await expect(page.getByRole('textbox', { name: /备注/ })).toHaveValue('');
  await page.getByRole('button', { name: '开始记录', exact: true }).click();
  await expect(page.getByRole('textbox', { name: '当前活动备注' })).toHaveValue('');
  await context.setOffline(false);
  await page.reload();
  await expect(page.locator('.timer-center h2')).toHaveText('深度写作');
  await page.clock.setFixedTime(new Date(Date.now() + 240000));
  await page.getByRole('button', { name: '结束这段记录' }).click();
  await page
    .locator('.bottom-nav:visible,.sidebar nav:visible')
    .getByRole('button', { name: '记录', exact: true })
    .click();
  await expect(page.getByTestId('timeline-block')).toHaveCount(2);
  await page
    .getByRole('button', { name: /查看短记录/ })
    .first()
    .click();
  await page.locator('.short-record-list button').first().click();
  await expect(page.getByRole('textbox', { name: /备注/ })).toHaveValue('整理这一章\n想法已经保存');
  await page.getByRole('button', { name: '关闭', exact: true }).click();
  await page.screenshot({
    path: `test-results/history-${test.info().project.name}.png`,
    fullPage: true,
  });
});
test('responsive dashboard, settings, backup and isolated tabs', async ({ page, context }) => {
  await page.screenshot({
    path: `test-results/dashboard-${test.info().project.name}.png`,
    fullPage: true,
  });
  const width = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(width).toBeLessThanOrEqual(page.viewportSize()!.width);
  await page
    .locator('.bottom-nav:visible,.sidebar nav:visible')
    .getByRole('button', { name: '设置', exact: true })
    .click();
  await page.getByRole('button', { name: '工作 工作', exact: true }).click();
  await page.getByRole('spinbutton', { name: '目标时长（分钟）' }).fill('120');
  await page.getByRole('button', { name: '保存活动' }).click();
  await expect(page.locator('.manage-activity').first()).toContainText('每日 2 小时');
  await page.getByRole('button', { name: '深色', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  const downloaded = page.waitForEvent('download');
  await page.getByRole('button', { name: /导出完整备份/ }).click();
  const file = await downloaded;
  expect(file.suggestedFilename()).toMatch(/MengDay.*\.json/);
  const second = await context.newPage();
  await second.goto('/');
  await second.getByRole('button', { name: '先在本机体验' }).click();
  await expect(second.locator('html')).toHaveAttribute('data-theme', 'dark');
  await second
    .locator('.activity-card')
    .filter({ has: second.getByRole('heading', { name: '学习', exact: true }) })
    .click();
  await page
    .locator('.bottom-nav:visible,.sidebar nav:visible')
    .getByRole('button', { name: '今日', exact: true })
    .click();
  await expect(page.locator('.timer-center h2')).toHaveText('学习');
  await page.screenshot({
    path: `test-results/dark-${test.info().project.name}.png`,
    fullPage: true,
  });
});
test('manual entries, overlap rejection, undo, backup restore and reports', async ({ page }) => {
  await page.getByRole('button', { name: '补记时间', exact: true }).click();
  await page.getByRole('textbox', { name: '活动名称', exact: true }).fill('午后阅读');
  await page.getByRole('textbox', { name: /备注/ }).fill('读到第三章\n“慢慢来”');
  const local = (ms: number) => formatInTimeZone(ms, 'Asia/Shanghai', "yyyy-MM-dd'T'HH:mm:ss");
  const end = Date.now() - 120000,
    start = end - 1800000;
  await page.getByLabel('开始时间', { exact: true }).fill(local(start));
  await page.getByLabel('结束时间', { exact: true }).fill(local(end));
  await page.getByRole('button', { name: '保存记录', exact: true }).click();
  await expect(page.locator('.today-timeline')).toContainText('午后阅读');
  await page.getByRole('button', { name: '补记时间', exact: true }).click();
  await page.getByRole('textbox', { name: '活动名称', exact: true }).fill('重叠活动');
  await page.getByLabel('开始时间', { exact: true }).fill(local(start + 60000));
  await page.getByLabel('结束时间', { exact: true }).fill(local(end + 60000));
  await page.getByRole('button', { name: '保存记录', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('重叠');
  await page.getByRole('button', { name: '关闭', exact: true }).click();
  await page.locator('.today-timeline .timeline-row').click();
  await page.getByRole('button', { name: '删除记录', exact: true }).click();
  await expect(page.locator('.toast')).toContainText('记录已删除');
  await page.getByRole('button', { name: '撤销', exact: true }).click();
  await expect(page.locator('.today-timeline')).toContainText('午后阅读');
  await page
    .locator('.bottom-nav:visible,.sidebar nav:visible')
    .getByRole('button', { name: '设置', exact: true })
    .click();
  const event = page.waitForEvent('download');
  await page.getByRole('button', { name: /导出完整备份/ }).click();
  const file = await event;
  const content = await readFile((await file.path())!);
  const json = JSON.parse(content.toString());
  expect(json.data.entries[0].note).toBe('读到第三章\n“慢慢来”');
  await page
    .getByLabel('导入备份', { exact: true })
    .setInputFiles({ name: 'backup.json', mimeType: 'application/json', buffer: content });
  await expect(page.getByRole('heading', { name: '恢复备份', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '确认合并', exact: true }).click();
  await expect(page.locator('.toast')).toContainText('备份已合并');
  await page
    .locator('.bottom-nav:visible,.sidebar nav:visible')
    .getByRole('button', { name: '统计', exact: true })
    .click();
  await expect(page.locator('.activity-report')).toContainText('午后阅读');
  await expect(page.locator('.activity-report')).toContainText('30 分钟');
  await page.screenshot({
    path: `test-results/stats-${test.info().project.name}.png`,
    fullPage: true,
  });
});
