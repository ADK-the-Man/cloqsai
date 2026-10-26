"""
AWS Service Catalog, SKU mapping, and region normalization.
"""
from typing import Dict, Any, List

AWS_REGIONS: Dict[str, str] = {
    "mumbai": "ap-south-1",
    "ap-south-1": "ap-south-1",
    "us-east-1": "us-east-1",
    "n. virginia": "us-east-1",
    "us-east-2": "us-east-2",
    "ohio": "us-east-2",
    "us-west-2": "us-west-2",
    "oregon": "us-west-2",
    "eu-west-1": "eu-west-1",
    "ireland": "eu-west-1",
    "eu-central-1": "eu-central-1",
    "frankfurt": "eu-central-1",
    "ap-southeast-1": "ap-southeast-1",
    "singapore": "ap-southeast-1",
}


def normalize_aws_region(region_input: str) -> str:
    cleaned = (region_input or "").lower().strip()
    return AWS_REGIONS.get(cleaned, "ap-south-1")


CATALOG_SERVICES: List[Dict[str, Any]] = [
    {
        "service_code": "AmazonEC2",
        "service_name": "Amazon Elastic Compute Cloud (EC2)",
        "provider": "aws",
        "service_family": "compute",
        "description": "Virtual computing environments in the cloud",
        "discovery_supported": True,
        "sizing_supported": True,
        "pricing_data_supported": True,
        "calculator_config_supported": True,
        "export_supported": True,
        "known_limitations": ["Spot price volatility not guaranteed in forward estimates"],
    },
    {
        "service_code": "AmazonRDS",
        "service_name": "Amazon Relational Database Service (RDS)",
        "provider": "aws",
        "service_family": "database",
        "description": "Managed relational database service for PostgreSQL, MySQL, MariaDB",
        "discovery_supported": True,
        "sizing_supported": True,
        "pricing_data_supported": True,
        "calculator_config_supported": True,
        "export_supported": True,
        "known_limitations": ["Multi-AZ deployment doubles base instance and storage unit cost"],
    },
    {
        "service_code": "AmazonS3",
        "service_name": "Amazon Simple Storage Service (S3)",
        "provider": "aws",
        "service_family": "storage",
        "description": "Scalable object storage in the cloud",
        "discovery_supported": True,
        "sizing_supported": True,
        "pricing_data_supported": True,
        "calculator_config_supported": True,
        "export_supported": True,
        "known_limitations": ["PUT/GET API request counts must be estimated"],
    },
    {
        "service_code": "ElasticLoadBalancing",
        "service_name": "Application Load Balancer (ALB)",
        "provider": "aws",
        "service_family": "networking",
        "description": "Layer 7 request routing and load balancing",
        "discovery_supported": True,
        "sizing_supported": True,
        "pricing_data_supported": True,
        "calculator_config_supported": True,
        "export_supported": True,
        "known_limitations": ["LCU pricing depends on processed bytes, new connections, and rule evaluations"],
    },
    {
        "service_code": "AWSCloudWatch",
        "service_name": "Amazon CloudWatch",
        "provider": "aws",
        "service_family": "monitoring",
        "description": "Monitoring and observability service",
        "discovery_supported": True,
        "sizing_supported": True,
        "pricing_data_supported": True,
        "calculator_config_supported": True,
        "export_supported": True,
        "known_limitations": ["Ingestion pricing per GB plus custom metrics and dashboard count"],
    },
]
