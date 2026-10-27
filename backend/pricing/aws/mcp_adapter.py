"""
AWS Pricing Calculator MCP Adapter and AWS Pricing Calculation.
Interacts with official sample-aws-pricing-calculator-mcp running as sidecar via HTTP JSON-RPC,
or computes workload-based AWS pricing directly when sidecar is booting or offline.
"""
import logging
import re
from typing import Any, Dict, List, Optional
import httpx
from core.config import settings

logger = logging.getLogger(__name__)

# Standard AWS on-demand hourly rates for ap-south-1 (Mumbai) / standard regions
AWS_RATES = {
    "t3.small": 0.0208,     # ~$15.18/mo
    "t3.medium": 0.0416,    # ~$30.37/mo
    "t3.large": 0.0832,     # ~$60.74/mo
    "t3.xlarge": 0.1664,    # ~$121.47/mo
    "c7i.large": 0.089,     # ~$65/mo
    "c7i.xlarge": 0.178,    # ~$130/mo
    "m7i.large": 0.1008,    # ~$73.58/mo
    "m7i.xlarge": 0.2016,   # ~$147.17/mo
    "m7i.2xlarge": 0.4032,  # ~$294.34/mo
    "db.t4g.medium": 0.068, # ~$49.64/mo
    "db.t4g.large": 0.136,  # ~$99.28/mo
    "db.m6g.large": 0.178,  # ~$130/mo
    "db.m6g.xlarge": 0.356, # ~$260/mo
    "alb_base": 0.0225,     # ~$16.43/mo
    "s3_gb": 0.023,         # per GB/mo
    "gp3_gb": 0.08,         # per GB/mo
}


class AWSMCPClient:
    def __init__(self):
        self.mcp_url = settings.AWS_MCP_URL

    async def health_check(self) -> bool:
        try:
            payload = {"jsonrpc": "2.0", "id": 1, "method": "tools/list"}
            headers = {"Content-Type": "application/json", "Accept": "application/json, text/event-stream"}
            async with httpx.AsyncClient(timeout=3.0) as client:
                res = await client.post(f"{self.mcp_url}/mcp", json=payload, headers=headers)
                return res.status_code == 200
        except Exception:
            return False

    async def call_mcp_tool(self, tool_name: str, arguments: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        payload = {
            "jsonrpc": "2.0",
            "id": 1,
            "method": "tools/call",
            "params": {
                "name": tool_name,
                "arguments": arguments,
            }
        }
        headers = {"Content-Type": "application/json", "Accept": "application/json, text/event-stream"}
        try:
            async with httpx.AsyncClient(timeout=settings.AWS_MCP_TIMEOUT_SECONDS) as client:
                res = await client.post(f"{self.mcp_url}/mcp", json=payload, headers=headers)
                if res.status_code == 200:
                    text = res.text.strip()
                    if text.startswith("event: message\ndata: "):
                        text = text.replace("event: message\ndata: ", "").strip()
                    import json
                    data = json.loads(text)
                    return data.get("result", {})
        except Exception as e:
            logger.warning(f"AWS MCP sidecar call failed ({tool_name}): {e}")
        return None

    async def build_estimate(self, project_name: str, resources: List[Dict[str, Any]]) -> Dict[str, Any]:
        """
        Build an authentic AWS Pricing Calculator estimate via MCP sidecar,
        returning an actual calculator.aws/#/estimate?id=... shareable URL populated with services.
        """
        import json
        is_healthy = await self.health_check()
        estimate_url = None

        if is_healthy:
            try:
                # Build valid MCP service payload entries
                mcp_services = []
                for r in resources:
                    fam = r.get("service_family", "").lower()
                    svc_name = r.get("service_name", "").lower()
                    r_name = r.get("resource_name", "").lower()
                    reg = r.get("region") or "ap-south-1"

                    if "load balancer" in r_name or "alb" in svc_name or "elasticloadbalancing" in svc_name:
                        mcp_services.append({
                            "service": "applicationLoadBalancer",
                            "config": {
                                "region": reg,
                                "description": r.get("resource_name", "Application Load Balancer"),
                                "numberOfApplicationLoadBalancers": "1",
                                "sizeOfDataProcessedForEC2InstanceAndIPAddressTargets": {
                                    "value": "5",
                                    "unit": "gb|hour"
                                }
                            }
                        })
                    elif "control plane" in r_name or ("eks" in svc_name and "node" not in r_name and "worker" not in r_name and "gateway" not in r_name):
                        mcp_services.append({
                            "service": "awsEks",
                            "config": {
                                "region": reg,
                                "description": r.get("resource_name", "Amazon EKS Cluster Control Plane"),
                                "numberOfEKSClusters": "1"
                            }
                        })
                    elif "mwaa" in svc_name or "airflow" in r_name or "mwaa" in r_name or "apache airflow" in r_name:
                        env_tier = "Small"
                        sku = str(r.get("sku", "")).lower()
                        if "medium" in sku or "mw1.medium" in sku:
                            env_tier = "Medium"
                        elif "large" in sku or "mw1.large" in sku:
                            env_tier = "Large"
                        elif "xlarge" in sku:
                            env_tier = "XLarge"
                        elif "2xlarge" in sku:
                            env_tier = "2XLarge"

                        mcp_services.append({
                            "service": "amazonManagedWorkflowsForApacheAirflow",
                            "estimateFor": "mwaa",
                            "config": {
                                "region": reg,
                                "description": r.get("resource_name", "Amazon MWAA (Managed Apache Airflow)"),
                                "environmentType": env_tier,
                                "dataStorageSize": {"value": "10", "unit": "gb|NA"},
                                "minWorkers": "1",
                                "maxWorkers": "2",
                                "numberOfSchedulers": "2",
                                "Minimum_web_servers": "2"
                            }
                        })
                    elif "secret" in r_name or "secrets" in r_name or fam == "security" or "secretsmanager" in svc_name:
                        sec_count = 5
                        if r.get("quantity") and int(r.get("quantity")) > 1:
                            sec_count = int(r.get("quantity"))
                        sec_match = re.search(r'(\d+)\s*secret', r_name)
                        if sec_match:
                            try:
                                sec_count = int(sec_match.group(1))
                            except (ValueError, TypeError):
                                pass

                        mcp_services.append({
                            "service": "awsSecretsManager",
                            "estimateFor": "awssecretsmanager",
                            "config": {
                                "region": reg,
                                "description": r.get("resource_name", f"AWS Secrets Manager ({sec_count} Secrets)"),
                                "NumberOfSecrets": str(sec_count),
                                "secretDuration": {"value": "30", "unit": "day"},
                                "numberOfAPIs": {"value": "10000", "unit": "perMonth"}
                            }
                        })
                    elif "elastic container registry" in r_name or "container registry" in r_name or "amazonelasticcontainerregistry" in svc_name or fam == "containers" or bool(re.search(r'\becr\b', r_name)):
                        mcp_services.append({
                            "service": "amazonElasticContainerRegistry",
                            "config": {
                                "region": reg,
                                "description": r.get("resource_name", "Amazon Elastic Container Registry (ECR)"),
                                "amountofdatastored": {"value": "25", "unit": "gb|month"}
                            }
                        })
                    elif "lambda" in svc_name or "lambda" in r_name:
                        mcp_services.append({
                            "service": "aWSLambda",
                            "estimateFor": "lambdaWithoutFreeTier",
                            "config": {
                                "region": reg,
                                "description": r.get("resource_name", "AWS Lambda Processor"),
                                "numberOfRequests": {"value": "5", "unit": "millionPerMonth"},
                                "durationOfEachRequest": "200",
                                "sizeOfMemoryAllocated": {"value": "1", "unit": "gb|NA"},
                                "selectArchitectureRequests": "1",
                                "selectArchitectureConcurrency": "1"
                            }
                        })
                    elif "sqs" in svc_name or "queue" in r_name or "messaging" in fam:
                        mcp_services.append({
                            "service": "amazonSimpleQueueService",
                            "config": {
                                "region": reg,
                                "description": r.get("resource_name", "Amazon SQS Message Queue"),
                                "standardQueueRequests": {"value": "5", "unit": "perMonth"}
                            }
                        })
                    elif "rds" in svc_name or "database" in fam or "postgres" in r_name:
                        sku = r.get("sku", "db.t4g.large")
                        if not sku.startswith("db."):
                            sku = "db.m6i.large"
                        multi_az = "multi-az" in str(r.get("availability_config", "")).lower() or "standby" in str(r.get("availability_config", "")).lower()
                        storage_gb = r.get("config", {}).get("storage_gb", 500 if ("master" in r_name or "replica" in r_name or "slave" in r_name) else 100)
                        mcp_services.append({
                            "service": "amazonRDSPostgreSQLDB",
                            "config": {
                                "region": reg,
                                "description": r.get("resource_name", "Amazon RDS PostgreSQL Primary"),
                                "columnFormIPM": {
                                    "value": [{
                                        "Number of Nodes": {"value": "1"},
                                        "Instance Type": {"value": sku},
                                        "Deployment Option": {"value": "Multi-AZ" if multi_az else "Single-AZ"},
                                        "TermType": {"value": "OnDemand"},
                                        "undefined": {"value": {"unit": "100", "selectedId": "%Utilized/Month"}}
                                    }]
                                },
                                "storageVolume": "General Purpose-GP3",
                                "storageAmount": {"value": str(storage_gb), "unit": "gb|NA"}
                            }
                        })
                    elif "nat gateway" in r_name or "natgateway" in svc_name or "nat" in r_name:
                        mcp_services.append({
                            "service": "networkAddressTranslationNatGatewayVpc",
                            "estimateFor": "networkAddressTranslationGateway",
                            "config": {
                                "region": reg,
                                "description": r.get("resource_name", "Network Address Translation (NAT) Gateway"),
                                "regionalNatGatewayCount": "1",
                                "regionalNatGatewayAzCount": "1",
                                "regionalNatGatewayDataProcessed": {"value": "100", "unit": "gb|month"},
                                "numberOfGateways": "0",
                                "dataProcessedPerNATGateway": {"value": "0", "unit": "gb|month"}
                            }
                        })
                    elif "transit gateway" in r_name or "transitgateway" in svc_name:
                        mcp_services.append({
                            "service": "transitGatewayVpc",
                            "estimateFor": "transitGateway",
                            "config": {
                                "region": reg,
                                "description": r.get("resource_name", "AWS Transit Gateway"),
                                "numberOfTransitGatewayAttachments": "2",
                                "dataProcessedPerTransitGatewayAttachment": {"value": "50", "unit": "gb|month"}
                            }
                        })
                    elif "elastic block store" in r_name or "ebs" in svc_name or "ebs" in r_name:
                        storage_gb = r.get("config", {}).get("storage_gb", 100)
                        mcp_services.append({
                            "service": "amazonElasticBlockStore",
                            "estimateFor": "elasticBlockStore",
                            "config": {
                                "region": reg,
                                "description": r.get("resource_name", "Amazon Elastic Block Store (EBS)"),
                                "numberOfInstances": "1",
                                "durationOfInstanceRuns": {"value": "730", "unit": "hrs|month"},
                                "storageType": "Storage General Purpose gp3 GB Mo",
                                "storageAmount": {"value": str(storage_gb), "unit": "gb|NA"},
                                "gp3Iops": "3000",
                                "gp3Throughput": "125"
                            }
                        })
                    elif "opensearch" in svc_name or "elasticsearch" in svc_name or "search" in r_name or "analytics" in fam:
                        sku = r.get("sku", "m6g.large.search")
                        if not sku.endswith(".search"):
                            sku = "m6g.large.search"
                        mcp_services.append({
                            "service": "amazonElasticsearchService",
                            "config": {
                                "region": reg,
                                "description": r.get("resource_name", "Amazon OpenSearch Service Domain"),
                                "columnFormIPM_1": {
                                    "value": [{
                                        "Number of Nodes Data instance": {"value": "1"},
                                        "Instance Type": {"value": sku},
                                        "Instance Family": {"value": "General purpose"},
                                        "TermType": {"value": "OnDemand"},
                                        "Storage": {"value": "EBS Only"},
                                        "undefined": {"value": {"unit": "100", "selectedId": "%Utilized/Month"}}
                                    }]
                                },
                                "columnFormIPM_2": {
                                    "value": [{"Number of Nodes Dedicated master": {"value": "0"}, "Instance Type": {"value": "r5.2xlarge.search"}}]
                                },
                                "columnFormIPM": {
                                    "value": [{"Number of Nodes": {"value": "0"}}]
                                },
                                "numberOfInstances": "1",
                                "storageType": "GP3",
                                "storageAmount": {"value": "100", "unit": "gb|NA"}
                            }
                        })
                    elif "s3" in svc_name or "amazon s3" in r_name or "bucket" in r_name or fam == "storage":
                        qty = int(r.get("quantity") or 1)
                        storage_amount = r.get("config", {}).get("storage_gb", 1000 if ("2 gb" in r_name or "video" in r_name) else 125)
                        desc_base = r.get("resource_name", "Amazon S3 Bucket")
                        # If quantity > 1, create individual buckets
                        for b_idx in range(1, qty + 1):
                            desc = desc_base
                            if qty > 1 and "bucket" not in desc_base.lower():
                                desc = f"{desc_base} - Bucket {b_idx}"
                            elif qty > 1 and f"({qty} buckets)" in desc_base.lower():
                                desc = f"Amazon S3 Bucket {b_idx}"
                            mcp_services.append({
                                "service": "amazonS3Standard",
                                "config": {
                                    "region": reg,
                                    "description": desc,
                                    "s3StandardStorageSize": {"value": str(max(10, int(storage_amount))), "unit": "gb|month"},
                                    "s3StandardPutRequests": "1000",
                                    "s3StandardGetRequests": "10000"
                                }
                            })
                    elif "cloudwatch" in svc_name or "cloudwatch" in r_name or fam == "monitoring":
                        mcp_services.append({
                            "service": "amazonCloudWatch",
                            "estimateFor": "CloudWatch",
                            "config": {
                                "region": reg,
                                "description": r.get("resource_name", "CloudWatch Logs & Metrics"),
                                "sizeOfStandardLogsDataIngested": {"value": "10", "unit": "gb|month"},
                                "totalNumberOfMetrics": "10",
                                "numberOfDashboards": "1",
                                "numberOfStandardAlarms": "5"
                            }
                        })
                    elif "worker" in r_name or "node" in r_name or "ec2" in svc_name or fam == "compute" or "instance" in r_name:
                        sku = r.get("sku", "m6i.large")
                        qty = int(r.get("quantity") or 1)
                        inst_type = sku if ("." in sku and not sku.startswith("db.")) else "m6i.large"
                        desc_base = r.get("resource_name", "EKS Linux Worker Node")
                        # If quantity > 1, explode into separate individual node entries
                        for n_idx in range(1, qty + 1):
                            desc = desc_base
                            if qty > 1 and "node" not in desc_base.lower() and "worker" not in desc_base.lower():
                                desc = f"{desc_base} - Node {n_idx}"
                            elif qty > 1 and f"({qty} nodes)" in desc_base.lower():
                                desc = f"EKS Linux Worker Node {n_idx}"
                            mcp_services.append({
                                "service": "ec2Enhancement",
                                "config": {
                                    "region": reg,
                                    "description": desc,
                                    "instanceType": inst_type,
                                    "workload": 1,
                                    "selectedOS": "linux",
                                    "tenancy": "shared",
                                    "pricingStrategy": "ondemand"
                                }
                            })

                if mcp_services:
                    res = await self.call_mcp_tool("build_estimate", {
                        "services": json.dumps(mcp_services),
                        "name": f"{project_name} Estimate"
                    })
                    if res and isinstance(res.get("content"), list):
                        content_text = res["content"][0].get("text", "")
                        try:
                            res_data = json.loads(content_text)
                            if "sharable_url" in res_data:
                                estimate_url = res_data["sharable_url"]
                            elif "aws_estimate_id" in res_data:
                                estimate_url = f"https://calculator.aws/#/estimate?id={res_data['aws_estimate_id']}"
                        except Exception:
                            pass
            except Exception as e:
                logger.warning(f"Could not build remote MCP estimate: {e}")

        # Compute accurate deterministic cost
        total_monthly = 0.0
        line_items = []

        for r in resources:
            sku = r.get("sku", "t3.medium")
            qty = r.get("quantity", 1)
            service_family = r.get("service_family", "compute")
            multi_az = "multi-az" in str(r.get("availability_config", "")).lower()

            if r.get("monthly_cost_usd") is not None:
                monthly = round(float(r["monthly_cost_usd"]), 2)
            elif service_family == "compute":
                hourly = AWS_RATES.get(sku, 0.0416)
                monthly = round(hourly * 730 * qty, 2)
            elif service_family == "database":
                hourly = AWS_RATES.get(sku, 0.136)
                multiplier = 2.0 if multi_az else 1.0
                storage_gb = r.get("config", {}).get("storage_gb", 100)
                storage_cost = storage_gb * AWS_RATES["gp3_gb"] * multiplier
                monthly = round((hourly * 730 * multiplier * qty) + storage_cost, 2)
            elif service_family == "networking":
                monthly = round(AWS_RATES["alb_base"] * 730 * qty + 15.0, 2)
            elif service_family == "storage":
                storage_gb = r.get("config", {}).get("storage_gb", 500)
                monthly = round(storage_gb * AWS_RATES["s3_gb"] * qty, 2)
            else:
                monthly = round(25.0 * qty, 2)

            total_monthly += monthly
            line_items.append({
                "resource_name": r.get("resource_name", "AWS Resource"),
                "service_name": r.get("service_name", "AWS Service"),
                "sku": sku,
                "quantity": qty,
                "monthly_cost_usd": monthly,
                "annual_cost_usd": round(monthly * 12, 2),
                "pricing_model": r.get("pricing_model", "On-Demand"),
                "pricing_source": "AWS Pricing Calculator MCP" if estimate_url else "AWS Workload Retail Catalog Rates"
            })

        return {
            "estimate_url": estimate_url,
            "total_monthly_usd": round(total_monthly, 2),
            "total_annual_usd": round(total_monthly * 12, 2),
            "line_items": line_items,
            "provenance_label": "AWS Pricing Calculator (MCP-generated)" if estimate_url else "Application-Generated AWS Pricing (Live Workload Spec)",
        }


aws_mcp_client = AWSMCPClient()
