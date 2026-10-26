"""
Dynamic SKU rate lookup and monthly cost calculation.
"""
from typing import Any, Dict, Optional

# AWS Hourly Rates (Commercial US Regions)
AWS_HOURLY_RATES: Dict[str, float] = {
    # Compute: General Purpose
    "t3.nano": 0.0052,
    "t3.micro": 0.0104,
    "t3.small": 0.0208,
    "t3.medium": 0.0416,
    "t3.large": 0.0832,
    "t3.xlarge": 0.1664,
    "t3.2xlarge": 0.3328,
    "m6i.large": 0.096,     # $70.08/mo
    "m6i.xlarge": 0.192,    # $140.16/mo
    "m6i.2xlarge": 0.384,   # $280.32/mo
    "m6i.4xlarge": 0.768,   # $560.64/mo
    "m6i.8xlarge": 1.536,
    "m7i.large": 0.1008,
    "m7i.xlarge": 0.2016,
    "m7i.2xlarge": 0.4032,
    "m7i.4xlarge": 0.8064,
    # Compute: Compute-Optimized
    "c6i.large": 0.085,
    "c6i.xlarge": 0.170,
    "c7i.large": 0.089,
    "c7i.xlarge": 0.178,
    "c7i.2xlarge": 0.356,
    "c7i.4xlarge": 0.712,
    # Compute: Memory-Optimized
    "r6i.large": 0.126,
    "r6i.xlarge": 0.252,
    "r7i.large": 0.133,
    "r7i.xlarge": 0.266,
    "r7i.2xlarge": 0.532,
    # Database: RDS PostgreSQL / MySQL
    "db.t4g.micro": 0.017,
    "db.t4g.small": 0.034,
    "db.t4g.medium": 0.068,
    "db.t4g.large": 0.136,   # $99.28/mo single AZ
    "db.t4g.xlarge": 0.272,  # $198.56/mo single AZ
    "db.t4g.2xlarge": 0.544,
    "db.m6g.large": 0.178,
    "db.m6g.xlarge": 0.356,
    "db.m6g.2xlarge": 0.712,
    "db.r6g.large": 0.240,
    "db.r6g.xlarge": 0.480,
    # OpenSearch
    "m6g.large.search": 0.114,   # $83.22/mo compute + $10.22 storage = $93.44/mo
    "m6g.xlarge.search": 0.228,
    "m6g.2xlarge.search": 0.456,
    "r6g.large.search": 0.198,
    "r6g.xlarge.search": 0.396,
}

# Azure Hourly Rates
AZURE_HOURLY_RATES: Dict[str, float] = {
    "Standard_B2s": 0.0416,
    "B2s": 0.0416,
    "Standard_B4ms": 0.166,
    "B4ms": 0.166,
    "Standard_D2s_v5": 0.096,
    "D2s_v5": 0.096,
    "Standard_D4s_v5": 0.192,
    "D4s_v5": 0.192,
    "Standard_D8s_v5": 0.384,
    "D8s_v5": 0.384,
    "Standard_D16s_v5": 0.768,
    "D16s_v5": 0.768,
    "Standard_E4s_v5": 0.252,
    "E4s_v5": 0.252,
    "Standard_E8s_v5": 0.504,
    "E8s_v5": 0.504,
    "Standard_F4s_v2": 0.169,
    "Standard_F8s_v2": 0.338,
    "GP_Gen5_2": 0.14,
    "GP_Gen5_4": 0.28,
    "GP_Gen5_8": 0.56,
}


def lookup_sku_monthly_cost(
    provider: str,
    service_family: str,
    sku: str,
    quantity: int = 1,
    availability_config: str = "",
    config: Optional[Dict[str, Any]] = None,
    current_cost: float = 0.0,
) -> float:
    """
    Calculate dynamic monthly cost for a given cloud resource SKU.
    """
    sku_clean = (sku or "").strip()
    p = (provider or "").lower().strip()
    fam = (service_family or "").lower().strip()
    cfg = config or {}
    qty = max(1, quantity)
    is_multi_az = "multi-az" in str(availability_config).lower() or "zone-redundant" in str(availability_config).lower()

    if p == "aws":
        if fam == "compute" or "node" in sku_clean or "m6i" in sku_clean or "t3" in sku_clean or "c7i" in sku_clean or "r7i" in sku_clean:
            hourly = AWS_HOURLY_RATES.get(sku_clean)
            if hourly:
                return round(hourly * 730 * qty, 2)
            # Sizing pattern heuristics: e.g. "m6i.xlarge" has "xlarge" (2x large)
            if "xlarge" in sku_clean and "2xlarge" not in sku_clean:
                return round(0.192 * 730 * qty, 2)  # $140.16
            elif "2xlarge" in sku_clean:
                return round(0.384 * 730 * qty, 2)  # $280.32
            elif "4xlarge" in sku_clean:
                return round(0.768 * 730 * qty, 2)  # $560.64
            elif "large" in sku_clean:
                return round(0.096 * 730 * qty, 2)  # $70.08
            elif "medium" in sku_clean:
                return round(0.0416 * 730 * qty, 2) # $30.37

        elif fam == "database" or "rds" in sku_clean or sku_clean.startswith("db."):
            hourly = AWS_HOURLY_RATES.get(sku_clean)
            if not hourly:
                if "xlarge" in sku_clean:
                    hourly = 0.272
                elif "large" in sku_clean:
                    hourly = 0.136
                elif "medium" in sku_clean:
                    hourly = 0.068
                else:
                    hourly = 0.136
            multiplier = 2.0 if is_multi_az else 1.0
            storage_gb = cfg.get("storage_gb", 100)
            storage_cost = storage_gb * (0.1278 if is_multi_az else 0.115)
            return round((hourly * 730 * multiplier * qty) + storage_cost, 2)

        elif fam == "analytics" or "search" in sku_clean:
            hourly = AWS_HOURLY_RATES.get(sku_clean, 0.114)
            storage_cost = 100 * 0.1022  # 100 GB gp3 ($10.22)
            return round((hourly * 730 * qty) + storage_cost, 2)

        elif fam == "storage" or "s3" in sku_clean.lower():
            storage_gb = cfg.get("storage_gb", 125)
            return round(storage_gb * 0.023 * qty + 0.50, 2)

        elif "redis" in sku_clean.lower() or "cache" in sku_clean.lower() or "elasticache" in sku_clean.lower():
            if "r6g" in sku_clean.lower():
                return round(148.92 * qty, 2)
            elif "t4g" in sku_clean.lower():
                return round(24.82 * qty, 2)
            return round(45.00 * qty, 2)

        elif "waf" in sku_clean.lower():
            return round(30.00 * qty, 2)

        elif fam == "compute" and ("lambda" in sku_clean.lower() or "serverless" in sku_clean.lower()):
            return 17.67 * qty

        elif fam == "messaging" or "sqs" in sku_clean.lower() or "queue" in sku_clean.lower():
            return 2.00 * qty

        elif fam == "containers" or "ecr" in sku_clean.lower():
            return 2.50 * qty

        elif fam == "security" or "secret" in sku_clean.lower():
            sec_count = cfg.get("secrets_count") or 5
            return round((sec_count * 0.40 + 1.00) * qty, 2)

        elif "mwaa" in sku_clean.lower() or "airflow" in sku_clean.lower():
            if "medium" in sku_clean.lower():
                return 680.00 * qty
            return 438.00 * qty

        elif "eks" in sku_clean.lower() and "cluster" in sku_clean.lower():
            return 73.00 * qty

    elif p == "azure":
        if "airflow" in sku_clean.lower() or "data factory" in sku_clean.lower():
            return 365.00 * qty

        elif "aks" in sku_clean.lower() or ("kubernetes" in sku_clean.lower() and "node" not in sku_clean.lower()):
            if "free" in sku_clean.lower():
                return 0.00
            return 73.00 * qty

        elif fam == "containers" or "acr" in sku_clean.lower() or "registry" in sku_clean.lower():
            if "basic" in sku_clean.lower():
                return 5.00 * qty
            elif "premium" in sku_clean.lower():
                return 50.00 * qty
            return 20.00 * qty

        elif fam == "storage" or "blob" in sku_clean.lower():
            storage_gb = cfg.get("storage_gb", 100)
            return round(storage_gb * 0.0208 * qty + 0.50, 2)

        elif "redis" in sku_clean.lower() or "cache" in sku_clean.lower():
            if "c2" in sku_clean.lower():
                return round(109.50 * qty, 2)
            elif "c1" in sku_clean.lower():
                return round(54.75 * qty, 2)
            return round(75.00 * qty, 2)

        elif "waf" in sku_clean.lower():
            return round(36.00 * qty, 2)

        elif fam == "messaging" or "servicebus" in sku_clean.lower():
            return round(10.00 * qty, 2)

        elif fam == "security" or "keyvault" in sku_clean.lower() or "key vault" in sku_clean.lower() or "secret" in sku_clean.lower():
            return 3.00 * qty

        elif fam == "compute" or "d" in sku_clean.lower() or "b" in sku_clean.lower() or "standard" in sku_clean.lower():
            clean_name = sku_clean.replace("Standard_", "")
            hourly = AZURE_HOURLY_RATES.get(clean_name) or AZURE_HOURLY_RATES.get(sku_clean)
            if hourly:
                return round(hourly * 730 * qty, 2)
            if "8s" in sku_clean or "8ms" in sku_clean:
                return round(0.384 * 730 * qty, 2)
            elif "4s" in sku_clean or "4ms" in sku_clean:
                return round(0.192 * 730 * qty, 2)
            elif "2s" in sku_clean or "2ms" in sku_clean:
                return round(0.096 * 730 * qty, 2)

        elif fam == "database" or "gen5" in sku_clean.lower():
            if "4" in sku_clean:
                base = 292.00 if is_multi_az else 146.00
            elif "8" in sku_clean:
                base = 584.00 if is_multi_az else 292.00
            else:
                base = 146.00 if is_multi_az else 73.00
            return round(base * qty, 2)

    # Fallback to current cost scaled by quantity
    return round(current_cost * qty, 2) if current_cost > 0 else 50.0
