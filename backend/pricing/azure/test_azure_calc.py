import asyncio
import json
import re
from playwright.async_api import async_playwright

async def inspect():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        page = await browser.new_page()

        # Listen to network requests
        page.on("request", lambda req: print(f"REQ: {req.method} {req.url}") if "estimate" in req.url or "share" in req.url or "save" in req.url else None)
        page.on("response", lambda resp: print(f"RESP: {resp.status} {resp.url}") if "estimate" in resp.url or "share" in resp.url else None)

        await page.goto("https://azure.microsoft.com/en-us/pricing/calculator/", timeout=45000)
        
        # Click VM product to add it to estimate
        btn = await page.wait_for_selector("button:has-text('Virtual Machines')", timeout=10000)
        if btn:
            await btn.click()
            print("Clicked VM button")
            await page.wait_for_timeout(4000)

        # Look at window local storage or global calculator object
        storage = await page.evaluate("() => ({ localStorage: Object.keys(localStorage), sessionStorage: Object.keys(sessionStorage) })")
        print("Storage keys:", storage)

        await browser.close()

if __name__ == "__main__":
    asyncio.run(inspect())
