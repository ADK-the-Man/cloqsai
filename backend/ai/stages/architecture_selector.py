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
    budget_tier = sig.get("budget_tier", "standard")
    target_budget = sig.get("target_budget")
    is_tight = budget_tier in ["micro", "starter"]

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

        alb_title = "Application Load Balancer (Cost-Optimized)" if is_tight else "Application Load Balancer"
        alb_rationale = (
            f"Cost-optimized traffic ingress for {budget_tier} tier workload."
            if is_tight
            else "Distributes incoming user traffic across multi-AZ container nodes and LLM gateway."
        )

        services.append(ArchitectureService(
            id="alb",
            name=alb_title,
            provider="aws",
            service_family="networking",
            service_name="ElasticLoadBalancing",
            region=aws_region,
            purpose="HTTPS traffic ingress & TLS termination",
            rationale=alb_rationale,
            dependencies=alb_deps,
            diagram_position={"x": 450, "y": 40}
        ))

        # Tier 2 (y: 220): Compute & Container Tier
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
                diagram_position={"x": 220, "y": 220}
            ))
        else:
            app_deps = ["cloudwatch"]
            if sig["has_rds"]:
                app_deps.append("rds")
            if sig.get("has_redis"):
                app_deps.append("redis")
            if sig.get("has_s3"):
                app_deps.append("s3")

            compute_name = (
                "AWS App Runner (Zero-Idle Serverless Container)"
                if budget_tier == "micro"
                else "Amazon ECS Fargate (Burstable Containers)"
                if budget_tier == "starter"
                else "Amazon ECS (Autoscaling Cluster)"
            )
            compute_service = "AWSAppRunner" if budget_tier == "micro" else "AmazonECS"
            compute_rationale = (
                f"Elastic serverless container execution with zero-idle minimums tailored for {budget_tier} tier."
                if is_tight
                else "Multi-AZ containerized instances distributed over 2 Availability Zones."
            )

            services.append(ArchitectureService(
                id="app",
                name=compute_name,
                provider="aws",
                service_family="compute",
                service_name=compute_service,
                region=aws_region,
                purpose="Primary backend API container execution",
                rationale=compute_rationale,
                dependencies=app_deps,
                diagram_position={"x": 220, "y": 220}
            ))

        # Additional Compute/Worker Services at Tier 2 (y: 220)
        if sig.get("has_airflow") and not is_tight:
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
                diagram_position={"x": 540, "y": 220}
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
                diagram_position={"x": 820, "y": 220}
            ))

        if sig.get("has_llm_gateway"):
            llm_deps = ["secrets"] if sig.get("has_secrets") else []
            if sig.get("no_separate_ec2") or (sig.get("has_eks") and sig.get("no_separate_ec2")):
                services.append(ArchitectureService(
                    id="llm_gateway",
                    name="In-House LLM Gateway (EKS Node Group)",
                    provider="aws",
                    service_family="compute",
                    service_name="AmazonEKS",
                    region=aws_region,
                    purpose="In-house LLM routing & token inference proxy on EKS",
                    rationale="Worker node group attached directly to the EKS cluster (no separate standalone EC2 cluster as requested).",
                    dependencies=["eks"] + llm_deps,
                    diagram_position={"x": 1080, "y": 220}
                ))
            else:
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
                    diagram_position={"x": 1080, "y": 220}
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
                diagram_position={"x": 120, "y": 220}
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
                rationale="Private container registry for deploying images to container runtime.",
                dependencies=[],
                diagram_position={"x": 1080, "y": 220}
            ))

        # Tier 3 (y: 460): Data, Persistence & Middleware Tier
        if sig["has_rds"]:
            if is_tight:
                master_name = (
                    "Amazon RDS PostgreSQL (db.t4g.micro Single-AZ)"
                    if budget_tier == "micro"
                    else "Amazon RDS PostgreSQL (db.t4g.small Single-AZ)"
                )
                db_purpose = f"Single-AZ burstable relational transactional data store ({budget_tier} tier)"
                db_rationale = "Cost-optimized single-zone instance with automated daily snapshots."
            else:
                master_name = "Amazon RDS PostgreSQL Master (Writer)" if sig.get("has_read_replica") else "Amazon RDS PostgreSQL"
                db_purpose = "Primary transactional data store (5,000 writes)" if sig.get("has_read_replica") else "Primary transactional data store"
                db_rationale = "Dedicated master database instance with provisioned IOPS and automatic multi-AZ failover."

            services.append(ArchitectureService(
                id="rds",
                name=master_name,
                provider="aws",
                service_family="database",
                service_name="AmazonRDS",
                region=aws_region,
                purpose=db_purpose,
                rationale=db_rationale,
                dependencies=[],
                diagram_position={"x": 180, "y": 460}
            ))

            if sig.get("has_read_replica") and not is_tight:
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
                    diagram_position={"x": 180, "y": 540}
                ))

        if sig.get("has_redis"):
            redis_title = "Amazon ElastiCache Redis (Burstable Cache)" if is_tight else "Amazon ElastiCache Redis"
            services.append(ArchitectureService(
                id="redis",
                name=redis_title,
                provider="aws",
                service_family="database",
                service_name="AmazonElastiCache",
                region=aws_region,
                purpose="In-memory cache & fast session store",
                rationale="Sub-millisecond query caching, rate limiting, and session offloading.",
                dependencies=[],
                diagram_position={"x": 480, "y": 460}
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
                rationale="Highly durable (99.999999999%) S3 object storage supporting encrypted uploads and office documents.",
                dependencies=[],
                diagram_position={"x": 780, "y": 460}
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
                diagram_position={"x": 1080, "y": 460}
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
                diagram_position={"x": 1080, "y": 460}
            ))

        # Tier 4 (y: 700): Security, Secrets & Telemetry Tier
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
                diagram_position={"x": 220, "y": 700}
            ))

        services.append(ArchitectureService(
            id="cloudwatch",
            name="Amazon CloudWatch",
            provider="aws",
            service_family="monitoring",
            service_name="AWSCloudWatch",
            region=aws_region,
            purpose="Metrics, Container Insights & Alarms",
            rationale="Aggregates container metrics, system logs, and triggers scaling alarms.",
            dependencies=[],
            diagram_position={"x": 540, "y": 700}
        ))

    elif p == "azure":
        # Tier 1 (y: 40): Ingress
        app_target = "aks" if sig["has_eks"] else "app"
        agw_deps = [app_target]
        if sig.get("has_llm_gateway"):
            agw_deps.append("llm_gateway")

        agw_title = "Azure Application Gateway (Cost-Optimized)" if is_tight else "Azure Application Gateway v2"
        services.append(ArchitectureService(
            id="agw",
            name=agw_title,
            provider="azure",
            service_family="networking",
            service_name="Application Gateway",
            region=azure_region,
            purpose="WAF & Layer 7 HTTP ingress",
            rationale=f"Traffic ingress with TLS acceleration configured for {budget_tier} tier.",
            dependencies=agw_deps,
            diagram_position={"x": 450, "y": 40}
        ))

        # Tier 2 (y: 220): Compute & Container Tier
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
                diagram_position={"x": 220, "y": 220}
            ))
        else:
            app_deps = ["monitor"]
            if sig["has_rds"]:
                app_deps.append("pg_flex")
            if sig.get("has_redis"):
                app_deps.append("redis")
            if sig.get("has_s3"):
                app_deps.append("blob")

            compute_name = (
                "Azure Container Apps (Serverless Burstable Container)"
                if is_tight
                else "Virtual Machine Scale Set (VMSS)"
            )
            compute_service = "Container Apps" if is_tight else "Virtual Machines"
            services.append(ArchitectureService(
                id="app",
                name=compute_name,
                provider="azure",
                service_family="compute",
                service_name=compute_service,
                region=azure_region,
                purpose="Primary backend API container execution",
                rationale=f"Scalable container execution with zero-idle minimums tailored for {budget_tier} tier.",
                dependencies=app_deps,
                diagram_position={"x": 220, "y": 220}
            ))

        # Additional Compute/Worker Services at Tier 2 (y: 220)
        if sig.get("has_airflow") and not is_tight:
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
                diagram_position={"x": 540, "y": 220}
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
                diagram_position={"x": 820, "y": 220}
            ))

        if sig.get("has_llm_gateway"):
            llm_deps = ["keyvault"] if sig.get("has_secrets") else []
            services.append(ArchitectureService(
                id="llm_gateway",
                name="In-House LLM Gateway",
                provider="azure",
                service_family="compute",
                service_name="Container Apps" if is_tight else "Virtual Machines",
                region=azure_region,
                purpose="In-house LLM routing & token inference proxy",
                rationale="Dedicated compute cluster handling sub-30s inference gateway routing and rate limiting.",
                dependencies=llm_deps,
                diagram_position={"x": 1080, "y": 220}
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
                dependencies=["aks" if sig["has_eks"] else "app"],
                diagram_position={"x": 120, "y": 220}
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
                rationale="Hosts and secures Docker and OCI container images deployed to container runtime.",
                dependencies=[],
                diagram_position={"x": 1080, "y": 220}
            ))

        # Tier 3 (y: 460): Data, Persistence & Middleware Tier
        if sig["has_rds"]:
            if is_tight:
                master_name = (
                    "PostgreSQL Flexible Server (B_Gen5_1 Single-Zone)"
                    if budget_tier == "micro"
                    else "PostgreSQL Flexible Server (B_Gen5_2 Single-Zone)"
                )
                db_rationale = f"Cost-optimized burstable flexible server instance tailored for {budget_tier} tier."
            else:
                master_name = "PostgreSQL Flexible Server Master (Writer)" if sig.get("has_read_replica") else "PostgreSQL Flexible Server"
                db_rationale = "Zone-redundant standby instance and automated daily backups."

            services.append(ArchitectureService(
                id="pg_flex",
                name=master_name,
                provider="azure",
                service_family="database",
                service_name="Azure Database for PostgreSQL",
                region=azure_region,
                purpose="Managed relational database transaction processing",
                rationale=db_rationale,
                dependencies=[],
                diagram_position={"x": 180, "y": 460}
            ))

            if sig.get("has_read_replica") and not is_tight:
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
                    diagram_position={"x": 180, "y": 540}
                ))

        if sig.get("has_redis"):
            services.append(ArchitectureService(
                id="redis",
                name="Azure Cache for Redis (Basic C0)" if is_tight else "Azure Cache for Redis",
                provider="azure",
                service_family="database",
                service_name="Azure Redis",
                region=azure_region,
                purpose="Managed in-memory cache & fast session store",
                rationale="Sub-millisecond data cache reducing backend PostgreSQL load and speeding API responses.",
                dependencies=[],
                diagram_position={"x": 480, "y": 460}
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
                diagram_position={"x": 780, "y": 460}
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
                diagram_position={"x": 1080, "y": 460}
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
                diagram_position={"x": 1080, "y": 460}
            ))

        # Tier 4 (y: 700): Security, Secrets & Telemetry Tier
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
                diagram_position={"x": 220, "y": 700}
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
            diagram_position={"x": 540, "y": 700}
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
