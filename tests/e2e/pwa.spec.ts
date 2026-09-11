import { test, expect } from '@playwright/test';
test('installed worker serves production app and persisted timer while offline', async ({
  page,
  context,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: '先在本机体验' }).click();
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload();
  await expect(page.locator('.timer-digits')).toHaveText('00:00:00');
  await page
    .locator('.activity-card')
    .filter({ has: page.getByRole('heading', { name: '阅读', exact: true }) })
    .click();
  await page.getByRole('textbox', { name: '当前活动备注' }).fill('断网也能读完这一章');
  await expect(page.locator('.timer-note small')).toHaveText('已保存');
  await context.setOffline(true);
  await page.reload();
  await expect(page.locator('.timer-center h2')).toHaveText('阅读');
  await expect(page.getByRole('textbox', { name: '当前活动备注' })).toHaveValue(
    '断网也能读完这一章',
  );
  await page.getByRole('button', { name: '结束这段记录' }).click();
  await context.setOffline(false);
  await page.reload();
  await expect(page.locator('.timer-digits')).toHaveText('00:00:00');
  await expect(page.locator('.today-timeline')).toContainText('断网也能读完这一章');
  const manifest = await page.request.get('/manifest.webmanifest');
  const body = await manifest.json();
  expect(body.display).toBe('standalone');
  expect(body.icons).toHaveLength(2);
  for (const icon of body.icons) {
    const response = await page.request.get(icon.src);
    expect(response.ok()).toBe(true);
    expect(response.headers()['content-type']).toContain('image/png');
  }
});
