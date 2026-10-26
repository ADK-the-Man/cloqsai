"""
Service catalog and provider status endpoints.
"""
from typing import List
from fastapi import APIRouter
from core.config import settings
from pricing.aws.service_catalog import CATALOG_SERVICES
from pricing.azure.service_catalog import AZURE_CATALOG_SERVICES
from pricing.aws.mcp_adapter import aws_mcp_client
from pricing.azure.retail_prices import azure_retail_client
from models.schemas import ServiceCatalogItem, ProviderStatusResponse

router = APIRouter()


@router.get("/catalog/services", response_model=List[ServiceCatalogItem])
async def get_service_catalog():
    combined = []
    for s in CATALOG_SERVICES:
        combined.append(ServiceCatalogItem(**s))
    for s in AZURE_CATALOG_SERVICES:
        combined.append(ServiceCatalogItem(**s))
    return combined


@router.get("/providers/status", response_model=ProviderStatusResponse)
async def get_provider_status():
    aws_ok = await aws_mcp_client.health_check()
    azure_ok = await azure_retail_client.health_check()

    return ProviderStatusResponse(
        aws_mcp_available=aws_ok,
        aws_mcp_url=settings.AWS_MCP_URL,
        aws_mcp_message="AWS Pricing Calculator MCP sidecar active and reachable" if aws_ok else "AWS MCP sidecar offline; fallback catalog active",
        azure_retail_prices_available=azure_ok,
        azure_retail_prices_message="Microsoft Azure Retail Prices API online and responsive" if azure_ok else "Azure Retail Prices API unreachable; using cached regional rates",
    )


@router.get("/catalog/rates")
async def get_catalog_rates():
    """
    Returns authoritative consolidated SKU hourly and monthly baseline rates
    for both AWS and Azure to ensure 100% single-source-of-truth between backend and UI.
    """
    from pricing.rate_lookup import AWS_HOURLY_RATES, AZURE_HOURLY_RATES
    return {
        "aws_hourly": AWS_HOURLY_RATES,
        "azure_hourly": AZURE_HOURLY_RATES,
        "fixed_monthly_services": {
            "aws_eks_control_plane": 73.00,
            "aws_cloudwatch_container_insights": 15.00,
            "aws_secrets_manager": 3.00,
            "aws_ecr_private_registry": 2.50,
            "aws_alb_base": 16.43,
            "azure_aks_cluster_sla": 73.00,
            "azure_monitor_insights": 14.50,
            "azure_key_vault": 3.00,
            "azure_acr_standard": 20.00,
            "azure_app_gateway_v2": 36.50,
        }
    }
