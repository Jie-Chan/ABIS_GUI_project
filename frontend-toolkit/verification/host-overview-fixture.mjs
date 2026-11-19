import { HOST_RESOURCES_PATH, HOST_RESOURCE_HOSTS } from '../../src/constants/hostResources.js'

export async function stubHostOverview(page, base) {
  const endpoint = `${base}${HOST_RESOURCES_PATH}`
  await page.route(endpoint, route => route.fulfill({
    json: { items: [{ ...HOST_RESOURCE_HOSTS[0], sample: null, history: [] }] },
  }))
  return endpoint
}
