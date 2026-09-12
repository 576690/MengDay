import { test, expect, type Page } from '@playwright/test';
import { initialData, backup, dayBounds, uid } from '../../src/model';
const day = '2026-09-10',
  hour = 3600000;
function records() {
  const d = initialData(),
    start = dayBounds(day, d.settings.timezone)[0];
  d.entries = [
    {
      id: uid(),
      activityId: d.activities[0].id,
      start: start + 8 * hour + 123,
      end: start + 9 * hour + 123,
      note: '读一份产品方案',
    },
    {
      id: uid(),
      activityId: d.activities[1].id,
      start: start + 10 * hour + 123,
      end: start + 11 * hour + 123,
      note: '做一遍练习',
    },
  ];
  return d;
}
async function nav(page: Page, name: string) {
  await page
    .locator('.bottom-nav:visible,.sidebar nav:visible')
    .getByRole('button', { name, exact: true })
    .click();
}
async function seed(page: Page) {
  const d = records();
  await page.goto('/');
  await page.getByRole('button', { name: '先在本机体验' }).click();
  await nav(page, '设置');
  await page.getByLabel('导入备份', { exact: true }).setInputFiles({
    name: 'fixture.json',
    mimeType: 'application/json',
    buffer: Buffer.from(backup(d)),
  });
  await page.getByRole('button', { name: '确认合并', exact: true }).click();
  await expect(page.locator('.toast')).toContainText('备份已合并');
  await nav(page, '记录');
  await page.getByLabel('时间轴日期').fill(day);
  return d;
}
test('calendar proportions, gap filling, shared handle drag, cancellation and undo', async ({
  page,
}) => {
  const d = await seed(page);
  const blocks = page.getByTestId('timeline-block');
  await expect(blocks).toHaveCount(2);
  expect(await blocks.first().evaluate((e) => parseFloat((e as HTMLElement).style.height))).toBe(
    64,
  );
  expect(
    await blocks.first().evaluate((e) => parseFloat((e as HTMLElement).style.top)),
  ).toBeCloseTo(512, 1);
  await page.getByRole('button', { name: '编辑模式', exact: true }).click();
  await page.getByRole('button', { name: '填补空白 09:00 至 10:00', exact: true }).click();
  await page.getByRole('button', { name: '延长前项：工作', exact: true }).click();
  await expect(blocks.first()).toContainText('10:00');
  const handle = page.getByRole('button', { name: '共同边界 工作', exact: true });
  await expect(handle).toBeVisible();
  await handle.scrollIntoViewIfNeeded();
  const box = (await handle.boundingBox())!;
  if (test.info().project.name === 'mobile') {
    const cdp = await page.context().newCDPSession(page),
      x = box.x + box.width / 2,
      y = box.y + box.height / 2;
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
    for (let n = 1; n <= 5; n++)
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: [{ x, y: y + (32 * n) / 5 }],
      });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await cdp.detach();
  } else {
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 + 32, { steps: 5 });
    await page.mouse.up();
  }
  await expect(blocks.first()).toContainText('10:30');
  await expect(blocks.nth(1)).toContainText('10:30');
  await page.getByRole('button', { name: '撤销上次编辑', exact: true }).click();
  await expect(blocks.first()).toContainText('10:00');
  await handle.scrollIntoViewIfNeeded();
  const b = (await handle.boundingBox())!;
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2 - 20);
  await page.keyboard.press('Escape');
  await page.mouse.up();
  await expect(blocks.first()).toContainText('10:00');
  await handle.press('ArrowUp');
  await expect(blocks.first()).toContainText('09:55');
  await handle.press('Enter');
  await page.getByLabel('边界时间（含时区）').fill('2026-09-10T10:15:00+08:00');
  await page.getByRole('button', { name: '保存边界' }).click();
  await expect(blocks.first()).toContainText('10:15');
  await page.getByRole('button', { name: '完成编辑' }).click();
  await page.getByRole('button', { name: '周', exact: true }).click();
  await expect(page.locator('.calendar-day-heading')).toHaveCount(7);
  await page.getByRole('button', { name: '月', exact: true }).click();
  await expect(page.locator('.calendar-day-heading')).toHaveCount(30);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
    page.viewportSize()!.width,
  );
  await page.screenshot({
    path: `test-results/calendar-month-${test.info().project.name}.png`,
    fullPage: true,
  });
  await page.getByRole('button', { name: '日', exact: true }).click();
  await page.screenshot({
    path: `test-results/calendar-day-${test.info().project.name}.png`,
    fullPage: true,
  });
});
test('gap insertion retains exact millisecond boundaries and solid activity styles sync everywhere', async ({
  page,
  context,
}) => {
  await seed(page);
  await page.getByRole('button', { name: '编辑模式', exact: true }).click();
  await page.getByRole('button', { name: '填补空白 09:00 至 10:00', exact: true }).click();
  await page.getByRole('button', { name: '插入一项活动', exact: true }).click();
  await page.getByRole('textbox', { name: '活动名称', exact: true }).fill('思考');
  await page.getByRole('textbox', { name: /备注/ }).fill('填补时间，也留住想法');
  await page.getByText('颜色与图案', { exact: true }).click();
  await page.getByRole('button', { name: '纯色／无图案', exact: true }).click();
  await page.getByLabel('自定义颜色', { exact: true }).fill('#123abc');
  await page.getByRole('button', { name: '保存记录', exact: true }).click();
  await expect(page.getByTestId('timeline-block')).toHaveCount(3);
  const thought = page.getByTestId('timeline-block').filter({ hasText: '思考' });
  await expect(thought.locator('.activity-icon')).toHaveCount(0);
  expect(
    await thought.evaluate((e) => (e as HTMLElement).style.getPropertyValue('--activity')),
  ).toBe('#123abc');
  await nav(page, '今日');
  await page.getByRole('button', { name: '管理思考', exact: true }).click();
  await page.getByRole('button', { name: '编辑活动', exact: true }).click();
  await page.getByLabel('自定义颜色', { exact: true }).fill('#aa3377');
  await page.getByRole('button', { name: '保存活动', exact: true }).click();
  await nav(page, '记录');
  await page.getByLabel('时间轴日期').fill(day);
  expect(
    await page
      .getByTestId('timeline-block')
      .filter({ hasText: '思考' })
      .evaluate((e) => (e as HTMLElement).style.getPropertyValue('--activity')),
  ).toBe('#aa3377');
  await context.setOffline(true);
  await page.getByRole('button', { name: '编辑模式', exact: true }).click();
  await page.getByRole('button', { name: '共同边界 思考', exact: true }).press('ArrowUp');
  await context.setOffline(false);
  await page.reload();
  await nav(page, '记录');
  await page.getByLabel('时间轴日期').fill(day);
  await expect(page.getByTestId('timeline-block').filter({ hasText: '思考' })).toContainText(
    '09:55',
  );
});
test('card editing and both activity deletion choices with undo', async ({ page }) => {
  await seed(page);
  await nav(page, '今日');
  await page.getByRole('button', { name: '管理工作', exact: true }).click();
  await page.getByRole('button', { name: '删除活动', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('1 段记录');
  await page.getByRole('button', { name: '移除活动，保留历史', exact: true }).click();
  await expect(page.getByRole('button', { name: '管理工作', exact: true })).toHaveCount(0);
  await nav(page, '记录');
  await page.getByLabel('时间轴日期').fill(day);
  await expect(page.getByTestId('timeline-block')).toHaveCount(2);
  await nav(page, '设置');
  await page.getByRole('button', { name: '恢复工作', exact: true }).click();
  await nav(page, '今日');
  await page.getByRole('button', { name: '管理工作', exact: true }).click();
  await page.getByRole('button', { name: '删除活动', exact: true }).click();
  await page.getByLabel('删除方式').selectOption('all');
  await expect(page.getByRole('button', { name: '删除活动及记录', exact: true })).toBeDisabled();
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: '删除活动及记录', exact: true }).click();
  await page.locator('.toast').getByRole('button', { name: '撤销', exact: true }).click();
  await expect(page.getByRole('button', { name: '管理工作', exact: true })).toBeVisible();
  await nav(page, '记录');
  await page.getByLabel('时间轴日期').fill(day);
  await expect(page.getByTestId('timeline-block')).toHaveCount(2);
});
