from __future__ import annotations
"""
Dynamic architecture selector: builds a complete topological service graph
and React Flow diagram nodes & edges matching the specific workload components
(EKS, Lambda, SQS, OpenSearch, S3, RDS, etc.).
"""
from typing import Any, Dict, List, Tuple
from models.schemas import ArchitectureService, DiagramData, DiagramNode, DiagramEdge
from ai.stages.sizing_engine import parse_workload_signals


def build_architecture_graph(provider: str, requirements: Dict[str, Any]) -> Tuple[List[ArchitectureService], DiagramData]:
    p = provider.lower()
    sig = parse_workload_signals(requirements)
    aws_region = sig.get("region", "us-east-1")
    if aws_region == "centralindia":
        azure_region = "centralindia"
        aws_region = "ap-south-1"
    elif aws_region == "us-east-2":
        azure_region = "eastus2"
    elif aws_region == "us-west-2":
        azure_region = "westus2"
    elif aws_region == "ap-south-1":
        azure_region = "centralindia"
    elif aws_region == "eu-west-1":
        azure_region = "northeurope"
    else:
        azure_region = "eastus"

    services: List[ArchitectureService] = []

    if p == "aws":
        # Tier 1 (y: 40): Public Ingress Tier
        app_target = "eks" if sig["has_eks"] else "app"
        alb_deps = [app_target]
        if sig.get("has_llm_gateway"):
            alb_deps.append("llm_gateway")

        services.append(ArchitectureService(
            id="alb",
            name="Application Load Balancer",
            provider="aws",
            service_family="networking",
            service_name="ElasticLoadBalancing",
            region=aws_region,
            purpose="HTTPS traffic ingress & TLS termination",
            rationale="Distributes incoming user traffic across multi-AZ container nodes and LLM gateway.",
            dependencies=alb_deps,
            diagram_position={"x": 420, "y": 40}
        ))

        # Tier 2 (y: 190): Compute & Container Tier
        if sig["has_eks"]:
            eks_deps = []
            if sig["has_rds"]:
                eks_deps.append("rds")
            if sig.get("has_secrets"):
                eks_deps.append("secrets")
            if sig.get("has_acr"):
                eks_deps.append("ecr")
            if sig["has_opensearch"]:
                eks_deps.append("opensearch")
            if sig["has_sqs"]:
                eks_deps.append("sqs")
            if sig.get("has_redis"):
                eks_deps.append("redis")
            if sig.get("has_s3"):
                eks_deps.append("s3")
            eks_deps.append("cloudwatch")

            services.append(ArchitectureService(
                id="eks",
                name=f"Amazon EKS Cluster ({sig['node_count']} Linux Nodes)",
                provider="aws",
                service_family="compute",
                service_name="AmazonEKS",
                region=aws_region,
                purpose="Primary container orchestration & microservices execution",
                rationale=f"Runs application pods on {sig['node_count']} dedicated Linux worker nodes.",
                dependencies=eks_deps,
                diagram_position={"x": 420, "y": 190}
            ))
        else:
            app_deps = ["cloudwatch"]
            if sig["has_rds"]:
                app_deps.append("rds")
            if sig.get("has_redis"):
                app_deps.append("redis")
            if sig.get("has_s3"):
                app_deps.append("s3")
            services.append(ArchitectureService(
                id="app",
                name="FastAPI App Cluster",
                provider="aws",
                service_family="compute",
                service_name="AmazonEC2",
                region=aws_region,
                purpose="Primary backend API execution",
                rationale="Multi-AZ autoscaling instances distributed over 2 Availability Zones.",
                dependencies=app_deps,
                diagram_position={"x": 420, "y": 190}
            ))

        if sig.get("has_llm_gateway"):
            llm_deps = ["secrets"] if sig.get("has_secrets") else []
            services.append(ArchitectureService(
                id="llm_gateway",
                name="In-House LLM Gateway Cluster",
                provider="aws",
                service_family="compute",
                service_name="AmazonEC2",
                region=aws_region,
                purpose="In-house LLM routing & token inference proxy",
                rationale="Dedicated compute cluster handling sub-30s inference gateway routing and rate limiting.",
                dependencies=llm_deps,
                diagram_position={"x": 680, "y": 190}
            ))

        if sig.get("has_mid_server"):
            services.append(ArchitectureService(
                id="midserver",
                name="Mid Server Setup (Amazon EC2)",
                provider="aws",
                service_family="compute",
                service_name="AmazonEC2",
                region=aws_region,
                purpose="Intermediate automation and integration mid-server",
                rationale="Dedicated EC2 compute instance configured for integration agent and automation mid-server setup.",
                dependencies=["eks" if sig["has_eks"] else "app"],
                diagram_position={"x": 120, "y": 190}
            ))

        if sig.get("has_acr"):
            services.append(ArchitectureService(
                id="ecr",
                name="Amazon Elastic Container Registry (ECR)",
                provider="aws",
                service_family="containers",
                service_name="AmazonECR",
                region=aws_region,
                purpose="Container image repository",
                rationale="Private container registry for deploying images to EKS cluster.",
                dependencies=[],
                diagram_position={"x": 720, "y": 190}
            ))

        # Tier 3 (y: 350): Data, Secrets & Middleware Tier
        if sig["has_rds"]:
            master_name = "Amazon RDS PostgreSQL Master (Writer)" if sig.get("has_read_replica") else "Amazon RDS PostgreSQL"
            services.append(ArchitectureService(
                id="rds",
                name=master_name,
                provider="aws",
                service_family="database",
                service_name="AmazonRDS",
                region=aws_region,
                purpose="Primary transactional data store (5,000 writes)" if sig.get("has_read_replica") else "Primary transactional data store",
                rationale="Dedicated master database instance with provisioned IOPS and automatic multi-AZ failover.",
                dependencies=[],
                diagram_position={"x": 120, "y": 350}
            ))

            if sig.get("has_read_replica"):
                services.append(ArchitectureService(
                    id="rds_replica",
                    name="Amazon RDS PostgreSQL Read Replica (Slave)",
                    provider="aws",
                    service_family="database",
                    service_name="AmazonRDS",
                    region=aws_region,
                    purpose="Dedicated read offloading (5,000 concurrent reads)",
                    rationale="Asynchronous streaming replication offloading read traffic from the master database.",
                    dependencies=["rds"],
                    diagram_position={"x": 120, "y": 420}
                ))

        if sig.get("has_secrets"):
            sec_count = sig.get("secrets_count", 5)
            services.append(ArchitectureService(
                id="secrets",
                name=f"AWS Secrets Manager ({sec_count} Secrets)",
                provider="aws",
                service_family="security",
                service_name="AWSSecretsManager",
                region=aws_region,
                purpose="Credentials & secrets management",
                rationale=f"Centralized secret rotation, credentials, and API key management for {sec_count} secrets.",
                dependencies=[],
                diagram_position={"x": 380, "y": 350}
            ))

        if sig.get("has_redis"):
            services.append(ArchitectureService(
                id="redis",
                name="Amazon ElastiCache Redis",
                provider="aws",
                service_family="database",
                service_name="AmazonElastiCache",
                region=aws_region,
                purpose="In-memory cache & fast session store",
                rationale="Sub-millisecond query caching, rate limiting, and session offloading.",
                dependencies=[],
                diagram_position={"x": 540, "y": 350}
            ))

        if sig["has_opensearch"]:
            services.append(ArchitectureService(
                id="opensearch",
                name="Amazon OpenSearch Domain",
                provider="aws",
                service_family="analytics",
                service_name="OpenSearchService",
                region=aws_region,
                purpose="Full-text search indexing & query acceleration",
                rationale="Managed search domain serving high-throughput search queries with low latency.",
                dependencies=[],
                diagram_position={"x": 580, "y": 350}
            ))

        if sig["has_sqs"]:
            sqs_deps = ["lambda"] if sig["has_lambda"] else []
            services.append(ArchitectureService(
                id="sqs",
                name="Amazon SQS Message Queue",
                provider="aws",
                service_family="messaging",
                service_name="AmazonSQS",
                region=aws_region,
                purpose="Asynchronous task buffer & queue",
                rationale="Buffers background workloads to prevent traffic spikes from overwhelming downstream processors.",
                dependencies=sqs_deps,
                diagram_position={"x": 760, "y": 350}
            ))

        if sig.get("has_s3"):
            if sig.get("has_large_video_uploads"):
                s3_label = "Amazon S3 (2 GB Video & Document Storage)"
            else:
                s3_label = f"Amazon S3 ({sig['s3_count']} Buckets)"
            services.append(ArchitectureService(
                id="s3",
                name=s3_label,
                provider="aws",
                service_family="storage",
                service_name="AmazonS3",
                region=aws_region,
                purpose="User asset uploads & archival backups",
                rationale="Highly durable (99.999999999%) S3 object storage supporting 2 GB video files and office documents.",
                dependencies=[],
                diagram_position={"x": 940, "y": 350}
            ))

        # Tier 4 (y: 500): Orchestration, Serverless Worker & Telemetry Tier
        if sig.get("has_airflow"):
            mwaa_deps = []
            if sig.get("has_s3"):
                mwaa_deps.append("s3")
            if sig.get("has_rds"):
                mwaa_deps.append("rds")
            services.append(ArchitectureService(
                id="mwaa",
                name="Amazon MWAA (Managed Apache Airflow)",
                provider="aws",
                service_family="compute",
                service_name="AmazonMWAA",
                region=aws_region,
                purpose="Workflow DAG orchestration & batch processing",
                rationale="Fully managed Airflow environment scheduling data workflows with automatic Celery worker autoscaling.",
                dependencies=mwaa_deps,
                diagram_position={"x": 120, "y": 500}
            ))

        if sig["has_lambda"]:
            services.append(ArchitectureService(
                id="lambda",
                name="AWS Lambda Worker",
                provider="aws",
                service_family="compute",
                service_name="AWSLambda",
                region=aws_region,
                purpose="Serverless queue message processor",
                rationale="Invoked automatically by SQS events to handle background tasks without idle server cost.",
                dependencies=["s3"] if sig.get("has_s3") else [],
                diagram_position={"x": 540, "y": 500}
            ))

        services.append(ArchitectureService(
            id="cloudwatch",
            name="Amazon CloudWatch",
            provider="aws",
            service_family="monitoring",
            service_name="AWSCloudWatch",
            region=aws_region,
            purpose="Metrics, Container Insights & Alarms",
            rationale="Aggregates pod metrics, system logs, and triggers scaling alarms.",
            dependencies=[],
            diagram_position={"x": 760, "y": 500}
        ))

    elif p == "azure":
        # Tier 1: Ingress
        app_target = "aks" if sig["has_eks"] else "vmss"
        agw_deps = [app_target]
        if sig.get("has_llm_gateway"):
            agw_deps.append("llm_gateway")

        services.append(ArchitectureService(
            id="agw",
            name="Azure Application Gateway v2",
            provider="azure",
            service_family="networking",
            service_name="Application Gateway",
            region=azure_region,
            purpose="WAF & Layer 7 HTTP ingress",
            rationale="Enterprise-grade ingress with integrated Web Application Firewall.",
            dependencies=agw_deps,
            diagram_position={"x": 420, "y": 40}
        ))

        # Tier 2: Compute & Container Tier
        if sig["has_eks"]:
            aks_deps = []
            if sig["has_rds"]:
                aks_deps.append("pg_flex")
            if sig.get("has_secrets"):
                aks_deps.append("keyvault")
            if sig.get("has_acr"):
                aks_deps.append("acr")
            if sig["has_opensearch"]:
                aks_deps.append("search")
            if sig["has_sqs"]:
                aks_deps.append("servicebus")
            if sig.get("has_redis"):
                aks_deps.append("redis")
            if sig.get("has_s3"):
                aks_deps.append("blob")
            aks_deps.append("monitor")

            services.append(ArchitectureService(
                id="aks",
                name=f"Azure Kubernetes Service ({sig['node_count']} Linux Nodes)",
                provider="azure",
                service_family="compute",
                service_name="Azure Kubernetes Service",
                region=azure_region,
                purpose="Managed Kubernetes microservices runtime (AKS)",
                rationale=f"Runs application microservices across {sig['node_count']} dedicated Linux worker nodes.",
                dependencies=aks_deps,
                diagram_position={"x": 420, "y": 190}
            ))
        else:
            vmss_deps = ["monitor"]
            if sig["has_rds"]:
                vmss_deps.append("pg_flex")
            if sig.get("has_redis"):
                vmss_deps.append("redis")
            if sig.get("has_s3"):
                vmss_deps.append("blob")
            services.append(ArchitectureService(
                id="vmss",
                name="Virtual Machine Scale Set",
                provider="azure",
                service_family="compute",
                service_name="Virtual Machines",
                region=azure_region,
                purpose="Scalable backend API tier",
                rationale="Runs compute instances across availability zones.",
                dependencies=vmss_deps,
                diagram_position={"x": 420, "y": 190}
            ))

        if sig.get("has_llm_gateway"):
            llm_deps = ["keyvault"] if sig.get("has_secrets") else []
            services.append(ArchitectureService(
                id="llm_gateway",
                name="In-House LLM Gateway (VMSS)",
                provider="azure",
                service_family="compute",
                service_name="Virtual Machines",
                region=azure_region,
                purpose="In-house LLM routing & token inference proxy",
                rationale="Dedicated VMSS cluster handling sub-30s inference gateway routing and rate limiting.",
                dependencies=llm_deps,
                diagram_position={"x": 680, "y": 190}
            ))

        if sig.get("has_mid_server"):
            services.append(ArchitectureService(
                id="midserver",
                name="Azure VM (Mid Server Setup)",
                provider="azure",
                service_family="compute",
                service_name="Virtual Machines",
                region=azure_region,
                purpose="Intermediate automation & integration mid-server",
                rationale="Dedicated VM for integration agent, automation, and mid-server setup.",
                dependencies=["aks" if sig["has_eks"] else "vmss"],
                diagram_position={"x": 120, "y": 190}
            ))

        if sig.get("has_acr"):
            services.append(ArchitectureService(
                id="acr",
                name="Azure Container Registry (ACR)",
                provider="azure",
                service_family="containers",
                service_name="Container Registry",
                region=azure_region,
                purpose="Managed private container registry",
                rationale="Hosts and secures Docker and OCI container images deployed to AKS.",
                dependencies=[],
                diagram_position={"x": 720, "y": 190}
            ))

        # Tier 3: Data, Secrets & Middleware
        if sig["has_rds"]:
            master_name = "PostgreSQL Flexible Server Master (Writer)" if sig.get("has_read_replica") else "PostgreSQL Flexible Server"
            services.append(ArchitectureService(
                id="pg_flex",
                name=master_name,
                provider="azure",
                service_family="database",
                service_name="Azure Database for PostgreSQL",
                region=azure_region,
                purpose="Managed relational database (5,000 writes)" if sig.get("has_read_replica") else "Managed relational database",
                rationale="Zone-redundant standby instance and automated daily backups.",
                dependencies=[],
                diagram_position={"x": 120, "y": 350}
            ))

            if sig.get("has_read_replica"):
                services.append(ArchitectureService(
                    id="pg_flex_replica",
                    name="PostgreSQL Flexible Server Read Replica (Slave)",
                    provider="azure",
                    service_family="database",
                    service_name="Azure Database for PostgreSQL",
                    region=azure_region,
                    purpose="Dedicated read offloading (5,000 concurrent reads)",
                    rationale="Dedicated asynchronous read replica handling queries offloaded from the primary flexible master.",
                    dependencies=["pg_flex"],
                    diagram_position={"x": 120, "y": 420}
                ))

        if sig.get("has_secrets"):
            sec_count = sig.get("secrets_count", 5)
            services.append(ArchitectureService(
                id="keyvault",
                name=f"Azure Key Vault ({sec_count} Secrets)",
                provider="azure",
                service_family="security",
                service_name="Key Vault",
                region=azure_region,
                purpose="Secure secret & key management",
                rationale=f"Centralized secret, key, and certificate management for {sec_count} secrets.",
                dependencies=[],
                diagram_position={"x": 380, "y": 350}
            ))

        if sig.get("has_redis"):
            services.append(ArchitectureService(
                id="redis",
                name="Azure Cache for Redis",
                provider="azure",
                service_family="database",
                service_name="Azure Redis",
                region=azure_region,
                purpose="Managed in-memory cache & fast session store",
                rationale="Sub-millisecond data cache reducing backend PostgreSQL load and speeding API responses.",
                dependencies=[],
                diagram_position={"x": 540, "y": 350}
            ))

        if sig["has_opensearch"]:
            services.append(ArchitectureService(
                id="search",
                name="Azure AI Search Service",
                provider="azure",
                service_family="analytics",
                service_name="Azure Cognitive Search",
                region=azure_region,
                purpose="Managed enterprise search indexing",
                rationale="Provides search capability and vector indexing matching OpenSearch functionality.",
                dependencies=[],
                diagram_position={"x": 580, "y": 350}
            ))

        if sig["has_sqs"]:
            sb_deps = ["func"] if sig["has_lambda"] else []
            services.append(ArchitectureService(
                id="servicebus",
                name="Azure Service Bus Queue",
                provider="azure",
                service_family="messaging",
                service_name="Azure Service Bus",
                region=azure_region,
                purpose="Cloud messaging queue",
                rationale="Decoupled asynchronous messaging between API tier and background processing.",
                dependencies=sb_deps,
                diagram_position={"x": 760, "y": 350}
            ))

        if sig.get("has_s3"):
            if sig.get("has_large_video_uploads"):
                blob_label = "Azure Blob Storage (2 GB Video & Document Storage)"
            else:
                blob_label = f"Azure Blob Storage ({sig['s3_count']} Accounts)"
            services.append(ArchitectureService(
                id="blob",
                name=blob_label,
                provider="azure",
                service_family="storage",
                service_name="Storage",
                region=azure_region,
                purpose="Blob and container object storage",
                rationale="ZRS storage accounts supporting chunked upload for 2 GB video files and enterprise documents.",
                dependencies=[],
                diagram_position={"x": 940, "y": 350}
            ))

        # Tier 4: Orchestration, Serverless Worker & Telemetry
        if sig.get("has_airflow"):
            adf_deps = []
            if sig.get("has_s3"):
                adf_deps.append("blob")
            if sig.get("has_rds"):
                adf_deps.append("pg_flex")
            services.append(ArchitectureService(
                id="airflow",
                name="Azure Data Factory (Managed Apache Airflow)",
                provider="azure",
                service_family="compute",
                service_name="Azure Data Factory",
                region=azure_region,
                purpose="Workflow DAG orchestration & batch processing",
                rationale="Managed Airflow environment in Azure Data Factory scheduling batch DAG workflows.",
                dependencies=adf_deps,
                diagram_position={"x": 120, "y": 500}
            ))

        if sig["has_lambda"]:
            services.append(ArchitectureService(
                id="func",
                name="Azure Functions (Serverless Worker)",
                provider="azure",
                service_family="compute",
                service_name="Azure Functions",
                region=azure_region,
                purpose="Serverless message handler",
                rationale="Processes messages from Azure Service Bus queue in an elastic serverless model.",
                dependencies=["blob"] if sig.get("has_s3") else [],
                diagram_position={"x": 540, "y": 500}
            ))

        services.append(ArchitectureService(
            id="monitor",
            name="Azure Monitor & Log Analytics",
            provider="azure",
            service_family="monitoring",
            service_name="Azure Monitor",
            region=azure_region,
            purpose="Unified telemetry and alerts",
            rationale="Monitors cluster health and collects diagnostic logs.",
            dependencies=[],
            diagram_position={"x": 760, "y": 500}
        ))

    # Build diagram nodes and edges
    nodes = []
    edges = []

    for svc in services:
        nodes.append(DiagramNode(
            id=svc.id,
            type="serviceNode",
            position=svc.diagram_position,
            data={
                "name": svc.name,
                "provider": svc.provider,
                "service_family": svc.service_family,
                "service_name": svc.service_name,
                "region": svc.region,
                "purpose": svc.purpose,
            }
        ))
        for dep in svc.dependencies:
            edges.append(DiagramEdge(
                id=f"edge-{svc.id}-{dep}",
                source=svc.id,
                target=dep,
                animated=True,
            ))

    return services, DiagramData(nodes=nodes, edges=edges)
