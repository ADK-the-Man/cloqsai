"""
Playwright-based Azure Pricing Calculator Automation Adapter.
Executes non-blocking headless browser sessions to configure Azure resources
and downloads official native exports directly from Microsoft Azure's pricing portal.
"""
from __future__ import annotations

import asyncio
import hashlib
import logging
import os
import shutil
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)

AZURE_CALCULATOR_URL = "https://azure.microsoft.com/en-us/pricing/calculator/"

SLUG_MAPPINGS = [
    (["aks", "kubernetes", "k8s"], "kubernetes-service"),
    (["vm", "virtual machine", "linux", "windows", "ec2"], "virtual-machines"),
    (["postgres", "postgresql", "psql"], "postgresql"),
    (["sql", "database", "rds"], "azure-sql-database"),
    (["storage", "blob", "s3", "bucket"], "storage"),
    (["redis", "cache"], "redis-cache"),
    (["function", "lambda", "serverless"], "functions"),
    (["app service", "web app", "api"], "app-service"),
    (["cosmos", "nosql", "dynamo"], "cosmos-db"),
    (["key vault", "secrets", "secret"], "key-vault"),
]


def resolve_slug(resource: Dict[str, Any]) -> str:
    text = f"{resource.get('resource_name', '')} {resource.get('service_name', '')} {resource.get('service_family', '')}".lower()
    for keywords, slug in SLUG_MAPPINGS:
        if any(kw in text for kw in keywords):
            return slug
    return "virtual-machines"


class AzurePlaywrightAdapter:
    """
    Automates interactions with the official Azure Pricing Calculator via Playwright.
    Runs in isolated task sessions with strict watchdog timeouts.
    """

    def __init__(self, timeout: float = 35.0):
        self.timeout = timeout

    async def generate_calculator_session(
        self,
        project_name: str,
        resources: List[Dict[str, Any]],
        artifacts_dir: Optional[str] = None,
        user_id: Optional[str] = None,
        job_id: Optional[str] = None,
        headless: bool = True
    ) -> Dict[str, Any]:
        """
        Navigates to the Azure Calculator, clicks workload product slugs,
        and downloads the native Microsoft Excel (.xlsx) export directly from the portal.
        """
        try:
            from playwright.async_api import async_playwright
        except ImportError:
            logger.warning("Playwright is not installed in the environment.")
            return {
                "success": False,
                "calculator_url": AZURE_CALCULATOR_URL,
                "note": "Playwright library not found, defaulted to official portal."
            }

        target_slugs = list(dict.fromkeys(resolve_slug(r) for r in resources))
        if not target_slugs:
            target_slugs = ["virtual-machines", "storage"]

        native_xlsx_path = None
        native_size = 0
        native_sum = ""

        try:
            async with async_playwright() as p:
                browser = await p.chromium.launch(
                    headless=headless,
                    args=["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"]
                )
                context = await browser.new_context(
                    accept_downloads=True,
                    user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
                )
                page = await context.new_page()

                logger.info(f"Navigating to Azure Calculator for project '{project_name}'...")
                await page.goto(AZURE_CALCULATOR_URL, wait_until="domcontentloaded", timeout=int(self.timeout * 1000))
                await asyncio.sleep(4.0)

                # Add products by data-slug
                for slug in target_slugs:
                    try:
                        btn = await page.query_selector(f'button[data-slug="{slug}"]')
                        if btn and await btn.is_visible():
                            await btn.click()
                            logger.info(f"Added Azure service '{slug}' to portal estimate.")
                            await asyncio.sleep(1.0)
                        else:
                            # Search product
                            search_box = await page.query_selector('input.product-search')
                            if search_box:
                                await search_box.fill(slug)
                                await asyncio.sleep(1.0)
                                s_btn = await page.query_selector(f'button[data-slug="{slug}"]')
                                if s_btn:
                                    await s_btn.click()
                                    logger.info(f"Added Azure service '{slug}' via search.")
                                    await asyncio.sleep(1.0)
                    except Exception as e:
                        logger.debug(f"Could not click slug '{slug}': {e}")

                # Export official native Excel workbook directly from Azure Calculator portal
                try:
                    menu3 = await page.query_selector('#menu3')
                    if menu3:
                        await menu3.click()
                        await asyncio.sleep(1.0)
                        export_btn = await page.query_selector('[role="menuitem"]:has-text("Export")')
                        if export_btn and artifacts_dir and user_id and job_id:
                            logger.info("Triggering native Azure portal Excel export...")
                            async with page.expect_download(timeout=15000) as download_info:
                                await export_btn.click()
                            download = await download_info.value
                            temp_path = await download.path()

                            dest_dir = os.path.join(artifacts_dir, str(user_id), str(job_id))
                            os.makedirs(dest_dir, exist_ok=True)
                            dest_file = os.path.join(dest_dir, f"{project_name.replace(' ', '_')}_Native_Azure_Portal_Export.xlsx")
                            shutil.copyfile(temp_path, dest_file)

                            if os.path.exists(dest_file) and os.path.getsize(dest_file) > 0:
                                native_xlsx_path = dest_file
                                native_size = os.path.getsize(dest_file)
                                with open(dest_file, "rb") as f:
                                    native_sum = hashlib.sha256(f.read()).hexdigest()
                                logger.info(f"Saved native Azure Portal export ({native_size} bytes) to {dest_file}")
                except Exception as ex:
                    logger.warning(f"Could not download native portal export: {ex}")

                current_url = page.url
                await browser.close()

                return {
                    "success": True,
                    "calculator_url": current_url or AZURE_CALCULATOR_URL,
                    "native_xlsx_path": native_xlsx_path,
                    "file_size": native_size,
                    "checksum": native_sum,
                    "note": "Populated in Azure Pricing Calculator with official portal Excel download."
                }

        except Exception as e:
            logger.warning(f"Playwright Azure Calculator run skipped: {e}. Gracefully maintaining portal link.")
            return {
                "success": False,
                "calculator_url": AZURE_CALCULATOR_URL,
                "error": str(e)
            }


azure_playwright_client = AzurePlaywrightAdapter()
