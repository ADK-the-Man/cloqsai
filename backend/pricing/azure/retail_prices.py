"""
Client for Microsoft Azure Retail Prices API.
Official endpoint: https://prices.azure.com/api/retail/prices?api-version=2023-01-01-preview
Public, unauthenticated, live enterprise-grade retail rates.
"""
import logging
from typing import Any, Dict, List, Optional
import httpx
from core.config import settings
from pricing.azure.service_catalog import normalize_azure_region

logger = logging.getLogger(__name__)

# Fallback known standard prices if offline/network timeout during test
FALLBACK_PRICES = {
    "D2s_v5": 0.096,  # ~$70/mo
    "D4s_v5": 0.192,  # ~$140/mo
    "D8s_v5": 0.384,  # ~$280/mo
    "B2s": 0.0416,    # ~$30/mo
    "B4ms": 0.166,    # ~$121/mo
    "GP_Gen5_2": 0.14, # PostgreSQL 2 vCPU
    "GP_Gen5_4": 0.28, # PostgreSQL 4 vCPU
    "Blob_Hot_GB": 0.0208,
}


class AzureRetailPricesClient:
    def __init__(self):
        self.base_url = settings.AZURE_RETAIL_PRICES_URL
        self.api_version = settings.AZURE_RETAIL_PRICES_API_VERSION
        self._cache: Dict[str, Any] = {}

    async def get_prices(
        self,
        service_name: str,
        arm_sku_name: Optional[str] = None,
        region: str = "centralindia",
        price_type: str = "Consumption"
    ) -> List[Dict[str, Any]]:
        arm_region = normalize_azure_region(region)
        filter_parts = [
            f"serviceName eq '{service_name}'",
            f"armRegionName eq '{arm_region}'",
            f"priceType eq '{price_type}'"
        ]
        if arm_sku_name:
            filter_parts.append(f"armSkuName eq '{arm_sku_name}'")

        filter_expr = " and ".join(filter_parts)
        cache_key = f"{service_name}:{arm_sku_name}:{arm_region}:{price_type}"
        if cache_key in self._cache:
            return self._cache[cache_key]

        params = {
            "api-version": self.api_version,
            "$filter": filter_expr
        }

        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                res = await client.get(self.base_url, params=params)
                if res.status_code == 200:
                    data = res.json()
                    items = data.get("Items", [])
                    self._cache[cache_key] = items
                    return items
                else:
                    logger.warning(f"Azure Retail API error {res.status_code}: {res.text[:200]}")
        except Exception as e:
            logger.warning(f"Azure Retail Prices API fetch failed: {e}. Using intelligent fallback estimate.")

        return []

    async def get_vm_monthly_cost(self, sku_name: str, region: str = "centralindia") -> float:
        items = await self.get_prices("Virtual Machines", arm_sku_name=sku_name, region=region)
        # Find Linux consumption rate
        for item in items:
            if "Windows" not in item.get("productName", "") and item.get("unitOfMeasure") == "1 Hour":
                unit_price = item.get("retailPrice", 0.0)
                if unit_price > 0:
                    return round(unit_price * 730, 2)
        
        # Fallback approximation
        fallback_rate = FALLBACK_PRICES.get(sku_name, 0.12)
        return round(fallback_rate * 730, 2)

    async def get_postgres_monthly_cost(self, sku_name: str, region: str = "centralindia", ha: bool = True) -> float:
        items = await self.get_prices("Azure Database for PostgreSQL", arm_sku_name=sku_name, region=region)
        base_rate = 0.0
        for item in items:
            if item.get("unitOfMeasure") == "1 Hour":
                base_rate = item.get("retailPrice", 0.0)
                break
        if base_rate == 0.0:
            base_rate = FALLBACK_PRICES.get(sku_name, 0.20)
        
        multiplier = 2.0 if ha else 1.0
        return round(base_rate * 730 * multiplier, 2)

    async def health_check(self) -> bool:
        try:
            params = {
                "api-version": self.api_version,
                "$filter": "serviceName eq 'Virtual Machines' and armRegionName eq 'centralindia'",
                "$top": 1
            }
            async with httpx.AsyncClient(timeout=5.0) as client:
                res = await client.get(self.base_url, params=params)
                return res.status_code == 200
        except Exception:
            return False


azure_retail_client = AzureRetailPricesClient()
