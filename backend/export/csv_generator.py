"""
CSV generator for CloudCost Architect AI estimates with strict provenance labeling.
"""
import csv
import io
import os
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List
from core.config import settings
from core.storage import save_artifact


async def generate_estimate_csv(
    project_name: str,
    provider: str,
    scenario_name: str,
    line_items: List[Dict[str, Any]],
    user_id: str,
    job_id: str,
    provenance_label: str,
    estimate_url: str = None
) -> tuple[str, int, str]:
    """
    Generates a CSV file formatted for enterprise review, with provenance header and direct estimator links.
    Returns (relative_path, file_size, checksum).
    """
    output = io.StringIO()
    writer = csv.writer(output)

    # 1. Provenance & Metadata Header
    writer.writerow(["# CLOQS AI - Infrastructure Estimate Export"])
    writer.writerow(["# Project Name", project_name])
    writer.writerow(["# Cloud Provider", provider.upper()])
    writer.writerow(["# Architecture Scenario", scenario_name])
    writer.writerow(["# Generated At (UTC)", datetime.now(timezone.utc).isoformat()])
    writer.writerow(["# Official Provider Calculator Link", estimate_url or "https://calculator.aws/#/estimate" if provider.lower() == "aws" else "https://azure.microsoft.com/en-us/pricing/calculator/"])
    writer.writerow(["# Data Source & Provenance", provenance_label])
    writer.writerow([])

    # 2. Column Headers
    headers = [
        "Resource Name",
        "Service Name",
        "Region",
        "SKU / Instance Size",
        "Quantity",
        "Availability Tier",
        "Pricing Model",
        "Monthly Cost (USD)",
        "Annual Cost (USD)",
        "Pricing Source",
        "Assumptions"
    ]
    writer.writerow(headers)

    # 3. Data Rows
    total_monthly = 0.0
    for item in line_items:
        monthly = float(item.get("monthly_cost_usd", 0.0))
        annual = float(item.get("annual_cost_usd", monthly * 12))
        total_monthly += monthly

        assumptions_str = "; ".join(item.get("assumptions", [])) if isinstance(item.get("assumptions"), list) else str(item.get("assumptions", ""))
        writer.writerow([
            item.get("resource_name", ""),
            item.get("service_name", ""),
            item.get("region", "us-east-1" if provider.lower() == "aws" else "eastus"),
            item.get("sku", ""),
            item.get("quantity", 1),
            item.get("availability_config", "Standard"),
            item.get("pricing_model", "On-Demand"),
            f"{monthly:.2f}",
            f"{annual:.2f}",
            item.get("pricing_source", provenance_label),
            assumptions_str
        ])

    # 4. Total Summary Row
    writer.writerow([])
    writer.writerow(["TOTAL", "", "", "", "", "", "", f"{total_monthly:.2f}", f"{total_monthly * 12:.2f}", "", ""])

    content_bytes = output.getvalue().encode("utf-8")
    filename = f"{project_name.replace(' ', '_').lower()}_{provider}_{scenario_name.lower()}_estimate.csv"

    return await save_artifact(content_bytes, filename, user_id, job_id)
