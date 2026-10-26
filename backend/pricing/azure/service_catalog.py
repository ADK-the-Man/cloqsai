"""
Azure Service Catalog, SKU mapping, and region normalization.
"""
from typing import Dict, Any, List

AZURE_REGIONS: Dict[str, str] = {
    "mumbai": "centralindia",
    "centralindia": "centralindia",
    "southindia": "southindia",
    "westindia": "westindia",
    "eastus": "eastus",
    "east us": "eastus",
    "westus2": "westus2",
    "west us 2": "westus2",
    "westeurope": "westeurope",
    "northeurope": "northeurope",
    "southeastasia": "southeastasia",
}


def normalize_azure_region(region_input: str) -> str:
    cleaned = (region_input or "").lower().strip()
    return AZURE_REGIONS.get(cleaned, "centralindia")


AZURE_CATALOG_SERVICES: List[Dict[str, Any]] = [
    {
        "service_code": "Virtual Machines",
        "service_name": "Azure Virtual Machines",
        "provider": "azure",
        "service_family": "compute",
        "description": "On-demand scalable cloud compute capacity",
        "discovery_supported": True,
        "sizing_supported": True,
        "pricing_data_supported": True,
        "calculator_config_supported": True,
        "export_supported": True,
        "known_limitations": ["Prices vary based on consumption model (Pay-as-you-go vs Spot vs Reserved)"],
    },
    {
        "service_code": "Azure Database for PostgreSQL",
        "service_name": "Azure Database for PostgreSQL - Flexible Server",
        "provider": "azure",
        "service_family": "database",
        "description": "Fully managed enterprise PostgreSQL database service with zone-redundant HA",
        "discovery_supported": True,
        "sizing_supported": True,
        "pricing_data_supported": True,
        "calculator_config_supported": True,
        "export_supported": True,
        "known_limitations": ["Zone-redundant HA adds compute cost multiplier"],
    },
    {
        "service_code": "Storage",
        "service_name": "Azure Blob Storage",
        "provider": "azure",
        "service_family": "storage",
        "description": "Massively scalable object storage for unstructured data",
        "discovery_supported": True,
        "sizing_supported": True,
        "pricing_data_supported": True,
        "calculator_config_supported": True,
        "export_supported": True,
        "known_limitations": ["Access tier (Hot/Cool/Archive) substantially impacts write vs read vs storage costs"],
    },
    {
        "service_code": "Application Gateway",
        "service_name": "Azure Application Gateway v2",
        "provider": "azure",
        "service_family": "networking",
        "description": "Web traffic load balancer with built-in Web Application Firewall (WAF)",
        "discovery_supported": True,
        "sizing_supported": True,
        "pricing_data_supported": True,
        "calculator_config_supported": True,
        "export_supported": True,
        "known_limitations": ["Capacity Unit charges scale based on compute units, persistent connections, throughput"],
    },
    {
        "service_code": "Azure Monitor",
        "service_name": "Azure Monitor & Log Analytics",
        "provider": "azure",
        "service_family": "monitoring",
        "description": "Comprehensive solution for collecting, analyzing, and acting on telemetry",
        "discovery_supported": True,
        "sizing_supported": True,
        "pricing_data_supported": True,
        "calculator_config_supported": True,
        "export_supported": True,
        "known_limitations": ["First 5GB/month free data ingestion included"],
    },
]
